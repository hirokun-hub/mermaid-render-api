import { realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer, {
  type Browser,
  type BrowserContext,
  type Page
} from 'puppeteer'

import {
  BROWSER_POOL_SIZE,
  MAX_TIMEOUT_MS,
  MAX_BROWSER_AGE_MS,
  MAX_RENDERS_PER_BROWSER,
  MAX_RENDERS_PER_CONTEXT,
  POOL_QUEUE_MAX,
  POOL_WAIT_TIMEOUT_MS
} from '../config.js'

export class BrowserPoolError extends Error {
  readonly errorType = 'service_unavailable' as const

  constructor(message: string) {
    super(message)
    this.name = 'BrowserPoolError'
  }
}

export interface BrowserPoolStats {
  available: number
  inUse: number
  queued: number
  browserRestartsTotal: number
  renderTimeoutsTotal: number
}

interface BrowserPoolOptions {
  poolSize?: number
  queueMax?: number
  waitTimeoutMs?: number
  maxRendersPerContext?: number
  maxRendersPerBrowser?: number
  maxBrowserAgeMs?: number
  launchBrowser?: () => Promise<Browser>
}

interface BrowserPoolCloseOptions {
  drainTimeoutMs?: number
}

interface ContextSlot {
  context: BrowserContext
  uses: number
}

interface WaitingAcquire {
  resolve: (context: BrowserContext) => void
  reject: (error: BrowserPoolError) => void
  timer: NodeJS.Timeout
}

export class BrowserPool {
  private browser: Browser | null = null
  private browserStartedAt = 0
  private browserUses = 0
  private browserRestartsTotal = 0
  private renderTimeoutsTotal = 0
  private restartPending = false
  private started = false
  private closing = false
  private starting: Promise<void> | null = null
  private readonly available: ContextSlot[] = []
  private readonly inUse = new Map<BrowserContext, ContextSlot>()
  private readonly waiting: WaitingAcquire[] = []

  private readonly poolSize: number
  private readonly queueMax: number
  private readonly waitTimeoutMs: number
  private readonly maxRendersPerContext: number
  private readonly maxRendersPerBrowser: number
  private readonly maxBrowserAgeMs: number
  private readonly launchBrowser: () => Promise<Browser>

  constructor(options: BrowserPoolOptions = {}) {
    this.poolSize = options.poolSize ?? BROWSER_POOL_SIZE
    this.queueMax = options.queueMax ?? POOL_QUEUE_MAX
    this.waitTimeoutMs = options.waitTimeoutMs ?? POOL_WAIT_TIMEOUT_MS
    this.maxRendersPerContext =
      options.maxRendersPerContext ?? MAX_RENDERS_PER_CONTEXT
    this.maxRendersPerBrowser =
      options.maxRendersPerBrowser ?? MAX_RENDERS_PER_BROWSER
    this.maxBrowserAgeMs = options.maxBrowserAgeMs ?? MAX_BROWSER_AGE_MS
    this.launchBrowser = options.launchBrowser ?? launchDefaultBrowser
  }

  async start(): Promise<void> {
    if (this.started) return
    if (this.starting) return this.starting

    this.closing = false
    this.starting = this.restartBrowser(false)
    await this.starting
    this.starting = null
    this.started = true
  }

  async acquire(): Promise<BrowserContext> {
    if (!this.started || this.closing) {
      throw new BrowserPoolError('browser pool is not available')
    }

    const slot = this.available.shift()
    if (slot) {
      this.inUse.set(slot.context, slot)
      return slot.context
    }

    if (this.waiting.length >= this.queueMax) {
      throw new BrowserPoolError('browser pool queue is full')
    }

    return new Promise<BrowserContext>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiting.findIndex((item) => item.timer === timer)
        if (index >= 0) this.waiting.splice(index, 1)
        reject(new BrowserPoolError('browser pool wait timeout'))
      }, this.waitTimeoutMs)

      this.waiting.push({ resolve, reject, timer })
    })
  }

  release(context: BrowserContext): void {
    const slot = this.inUse.get(context)
    if (!slot) return

    this.inUse.delete(context)
    void this.releaseSlot(slot, false)
  }

  discard(context: BrowserContext): void {
    const slot = this.inUse.get(context)
    if (!slot) return

    this.inUse.delete(context)
    void this.releaseSlot(slot, true)
  }

  recordTimeout(context: BrowserContext): void {
    this.renderTimeoutsTotal += 1
    this.discard(context)
  }

  async healthCheck(): Promise<boolean> {
    let context: BrowserContext
    try {
      context = await this.acquire()
    } catch {
      return false
    }

    try {
      const page = await context.newPage()
      const value = await page.evaluate(() => 1)
      await page.close()
      return value === 1
    } catch {
      this.discard(context)
      return false
    } finally {
      if (this.inUse.has(context)) {
        this.release(context)
      }
    }
  }

  async close(options: BrowserPoolCloseOptions = {}): Promise<void> {
    this.closing = true
    for (const item of this.waiting.splice(0)) {
      clearTimeout(item.timer)
      item.reject(new BrowserPoolError('browser pool is closing'))
    }

    await this.waitForInUseDrain(options.drainTimeoutMs ?? MAX_TIMEOUT_MS)

    await Promise.all(
      [...this.available, ...this.inUse.values()].map((slot) =>
        slot.context.close().catch(() => undefined)
      )
    )
    this.available.length = 0
    this.inUse.clear()

    await this.browser?.close().catch(() => undefined)
    this.browser = null
    this.started = false
  }

  getStats(): BrowserPoolStats {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      queued: this.waiting.length,
      browserRestartsTotal: this.browserRestartsTotal,
      renderTimeoutsTotal: this.renderTimeoutsTotal
    }
  }

  private async releaseSlot(slot: ContextSlot, discard: boolean): Promise<void> {
    slot.uses += 1
    this.browserUses += 1
    this.markRestartPendingIfNeeded()

    if (this.closing) {
      await slot.context.close().catch(() => undefined)
      return
    }

    if (discard || slot.uses >= this.maxRendersPerContext) {
      await slot.context.close().catch(() => undefined)
      if (!this.closing) {
        this.available.push(await this.createContextSlot())
      }
    } else if (!this.closing) {
      this.available.push(slot)
    }

    if (this.shouldRestartBrowserNow()) {
      await this.restartBrowser(true)
    }

    this.drainQueue()
  }

  private async waitForInUseDrain(drainTimeoutMs: number): Promise<void> {
    const deadline = Date.now() + drainTimeoutMs
    while (this.inUse.size > 0 && Date.now() < deadline) {
      await sleep(Math.min(100, Math.max(1, deadline - Date.now())))
    }
  }

  private drainQueue(): void {
    while (this.available.length > 0 && this.waiting.length > 0) {
      const waiting = this.waiting.shift()
      const slot = this.available.shift()
      if (!waiting || !slot) return

      clearTimeout(waiting.timer)
      this.inUse.set(slot.context, slot)
      waiting.resolve(slot.context)
    }
  }

  private shouldRestartBrowserNow(): boolean {
    if (!this.browser) return false
    return this.restartPending && this.inUse.size === 0
  }

  private markRestartPendingIfNeeded(): void {
    if (!this.browser) return
    if (this.browserUses >= this.maxRendersPerBrowser) {
      this.restartPending = true
      return
    }
    if (Date.now() - this.browserStartedAt >= this.maxBrowserAgeMs) {
      this.restartPending = true
    }
  }

  private async restartBrowser(countRestart: boolean): Promise<void> {
    const oldBrowser = this.browser
    this.available.length = 0
    this.inUse.clear()

    this.browser = await this.launchBrowser()
    this.browserStartedAt = Date.now()
    this.browserUses = 0
    this.restartPending = false
    if (countRestart) this.browserRestartsTotal += 1

    await oldBrowser?.close().catch(() => undefined)

    for (let index = 0; index < this.poolSize; index += 1) {
      this.available.push(await this.createContextSlot())
    }
  }

  private async createContextSlot(): Promise<ContextSlot> {
    if (!this.browser) {
      throw new BrowserPoolError('browser is not started')
    }
    const context = await this.browser.createBrowserContext()
    patchContextNewPage(context)
    return { context, uses: 0 }
  }
}

async function launchDefaultBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: 'shell',
    protocolTimeout: 30000,
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--font-render-hinting=none'
    ]
  })
}

function patchContextNewPage(context: BrowserContext): void {
  const patchedContext = context as BrowserContext & {
    __mermaidRenderPatched?: boolean
    newPage: () => Promise<Page>
  }
  if (patchedContext.__mermaidRenderPatched) return

  const originalNewPage = patchedContext.newPage.bind(context)
  patchedContext.newPage = async () => {
    const page = await originalNewPage()
    await hardenPageNetwork(page)
    return page
  }
  patchedContext.__mermaidRenderPatched = true
}

async function hardenPageNetwork(page: Page): Promise<void> {
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const requestUrl = new URL(request.url())
    const protocol = requestUrl.protocol
    if (protocol === 'data:' || protocol === 'about:' || protocol === 'blob:') {
      void request.continue()
      return
    }
    if (isMermaidCliLocalAsset(requestUrl)) {
      void request.continue()
      return
    }
    void request.abort()
  })
}

function isMermaidCliLocalAsset(requestUrl: URL): boolean {
  if (requestUrl.protocol !== 'file:') return false

  try {
    const requestPath = realpathSync(resolve(fileURLToPath(requestUrl)))
    return requestPath.startsWith(`${MERMAID_CLI_ASSET_ROOT}${sep}`)
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

const MERMAID_CLI_ENTRY = fileURLToPath(
  import.meta.resolve('@mermaid-js/mermaid-cli')
)
const MERMAID_CLI_ASSET_ROOT = realpathSync(
  resolve(dirname(MERMAID_CLI_ENTRY), '..')
)
