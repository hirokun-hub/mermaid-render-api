import { describe, expect, test } from 'vitest'
import type { Browser, BrowserContext, Page } from 'puppeteer'

import { BrowserPool, BrowserPoolError } from '../../src/renderer/browserPool.js'

describe('BrowserPool', () => {
  test('rejects acquire before start with service_unavailable', async () => {
    const pool = new BrowserPool({ launchBrowser: createFakeBrowserFactory() })

    expect(pool.isReady()).toBe(false)
    await expect(pool.acquire()).rejects.toMatchObject({
      errorType: 'service_unavailable',
      reason: 'pool_unavailable'
    })
  })

  test('reports readiness without acquiring a context', async () => {
    const pool = new BrowserPool({
      poolSize: 1,
      launchBrowser: createFakeBrowserFactory()
    })
    await pool.start()

    expect(pool.isReady()).toBe(true)
    expect(pool.getStats()).toMatchObject({ available: 1, inUse: 0 })

    const context = await pool.acquire()
    expect(pool.isReady()).toBe(true)
    expect(pool.getStats()).toMatchObject({ available: 0, inUse: 1 })

    pool.release(context)
    await pool.close()
    expect(pool.isReady()).toBe(false)
  })

  test('waits for an available context and rejects after timeout', async () => {
    const pool = new BrowserPool({
      poolSize: 1,
      queueMax: 1,
      waitTimeoutMs: 10,
      launchBrowser: createFakeBrowserFactory()
    })
    await pool.start()
    const context = await pool.acquire()

    await expect(pool.acquire()).rejects.toMatchObject({
      errorType: 'service_unavailable',
      reason: 'pool_wait_timeout'
    })

    pool.release(context)
    await pool.close()
  })

  test('recycles context after max uses', async () => {
    const factory = createFakeBrowserFactory()
    const pool = new BrowserPool({
      poolSize: 1,
      maxRendersPerContext: 1,
      launchBrowser: factory
    })
    await pool.start()

    const first = await pool.acquire()
    pool.release(first)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = await pool.acquire()

    expect(second).not.toBe(first)
    pool.release(second)
    await pool.close()
  })

  test('keeps browser count small across repeated requests', async () => {
    const factory = createFakeBrowserFactory()
    const pool = new BrowserPool({
      poolSize: 2,
      maxRendersPerContext: 3,
      maxRendersPerBrowser: 1000,
      launchBrowser: factory
    })
    await pool.start()

    for (let index = 0; index < 100; index += 1) {
      const context = await pool.acquire()
      pool.release(context)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(factory.createdBrowsers()).toBe(1)
    await pool.close()
  })

  test('defers browser restart until all in-use contexts are released', async () => {
    const factory = createFakeBrowserFactory()
    const pool = new BrowserPool({
      poolSize: 2,
      maxRendersPerBrowser: 1,
      launchBrowser: factory
    })
    await pool.start()

    const first = await pool.acquire()
    const second = await pool.acquire()
    pool.release(first)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(factory.createdBrowsers()).toBe(1)

    pool.release(second)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(factory.createdBrowsers()).toBe(2)
    await pool.close()
  })

  test('counts discarded contexts toward browser recycle threshold', async () => {
    const factory = createFakeBrowserFactory()
    const pool = new BrowserPool({
      poolSize: 1,
      maxRendersPerBrowser: 1,
      launchBrowser: factory
    })
    await pool.start()

    const context = await pool.acquire()
    pool.discard(context)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(factory.createdBrowsers()).toBe(2)
    await pool.close()
  })

  test('close waits for in-use contexts to drain before closing browser', async () => {
    const factory = createFakeBrowserFactory()
    const pool = new BrowserPool({
      poolSize: 1,
      launchBrowser: factory
    })
    await pool.start()
    const context = await pool.acquire()

    const closePromise = pool.close({ drainTimeoutMs: 100 })
    setTimeout(() => pool.release(context), 10)
    await closePromise

    expect(factory.closedBrowsers()).toBe(1)
  })
})

function createFakeBrowserFactory(): (() => Promise<Browser>) & {
  createdBrowsers: () => number
  closedBrowsers: () => number
} {
  let browserCount = 0
  let closedBrowserCount = 0
  const factory = async () => {
    browserCount += 1
    return createFakeBrowser(() => {
      closedBrowserCount += 1
    })
  }
  factory.createdBrowsers = () => browserCount
  factory.closedBrowsers = () => closedBrowserCount
  return factory
}

function createFakeBrowser(onClose = () => undefined): Browser {
  return {
    createBrowserContext: async () => createFakeContext(),
    close: async () => {
      onClose()
    }
  } as unknown as Browser
}

function createFakeContext(): BrowserContext {
  return {
    newPage: async () => createFakePage(),
    close: async () => undefined
  } as unknown as BrowserContext
}

function createFakePage(): Page {
  return {
    setRequestInterception: async () => undefined,
    on: () => undefined
  } as unknown as Page
}
