import { renderMermaid } from '@mermaid-js/mermaid-cli'

import { extractMermaidError } from '../utils/extractMermaidError.js'
import { BrowserPool, BrowserPoolError } from './browserPool.js'
import type {
  MermaidRendererAdapter,
  RendererCloseOptions,
  RenderInput,
  RenderResult,
  RendererPoolStats
} from './mermaidRendererAdapter.js'
import { applyPostProcess, buildSvgId } from './postProcess.js'

export class ProgrammaticAdapter implements MermaidRendererAdapter {
  private started = false

  constructor(private readonly pool = new BrowserPool()) {}

  async ready(): Promise<void> {
    await this.pool.start()
    this.started = true
  }

  async render(input: RenderInput): Promise<RenderResult> {
    let queueMs = 0
    try {
      if (!this.started) {
        throw new BrowserPoolError('browser pool is not initialized')
      }

      const acquireStart = Date.now()
      const context = await this.pool.acquire()
      queueMs = Date.now() - acquireStart
      let shouldRelease = true

      try {
        const renderPromise = renderMermaid(context, input.code, input.format, {
          backgroundColor: 'transparent',
          mermaidConfig: input.mermaidConfig as never,
          svgId: input.svgId ?? buildSvgId(input.requestId, input.postProcess)
        })

        const rendered = await withTimeout(renderPromise, input.timeoutMs)
        const data = normalizeRenderedData(rendered.data)
        const postProcessed = applyPostProcess({
          requestId: input.requestId,
          data,
          format: input.format,
          postProcess: input.postProcess
        })

        return {
          success: true,
          data: postProcessed.data,
          queueMs,
          postProcessMs: postProcessed.durationMs,
          exitCode: 0
        }
      } catch (error) {
        shouldRelease = false

        if (error instanceof RenderTimeoutError) {
          this.pool.recordTimeout(context)
          return {
            success: false,
            errorType: 'timeout',
            queueMs,
            errorMessage: 'render timed out',
            rawErrorText: 'render timed out',
            exitCode: null,
            line: null
          }
        }

        this.pool.discard(context)
        const rawErrorText = errorToRawText(error)
        const extracted = extractMermaidError(rawErrorText)
        return {
          success: false,
          rawErrorText,
          errorType: extracted.errorType,
          queueMs,
          errorMessage: extracted.errorMessage,
          line: extracted.line,
          exitCode: null
        }
      } finally {
        if (shouldRelease) this.pool.release(context)
      }
    } catch (error) {
      if (error instanceof BrowserPoolError) {
        return {
          success: false,
          errorType: error.errorType,
          queueMs,
          errorMessage: error.message,
          rawErrorText: error.message,
          exitCode: null,
          line: null,
          retryReason: error.reason
        }
      }

      const rawErrorText = errorToRawText(error)
      return {
        success: false,
        errorType: 'render_error',
        queueMs,
        errorMessage: rawErrorText,
        rawErrorText,
        exitCode: null,
        line: null
      }
    }
  }

  async close(options: RendererCloseOptions = {}): Promise<void> {
    await this.pool.close(options)
    this.started = false
  }

  async healthCheck(): Promise<boolean> {
    if (!this.started) return false
    return this.pool.healthCheck()
  }

  isPoolReady(): boolean {
    return this.started && this.pool.isReady()
  }

  getPoolStats(): RendererPoolStats {
    const stats = this.pool.getStats()
    return {
      inUse: stats.inUse,
      queued: stats.queued,
      browserRestartsTotal: stats.browserRestartsTotal,
      renderTimeoutsTotal: stats.renderTimeoutsTotal,
      lastRestartReason: stats.lastRestartReason
    }
  }
}

class RenderTimeoutError extends Error {
  constructor() {
    super('render timed out')
    this.name = 'RenderTimeoutError'
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RenderTimeoutError()), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function normalizeRenderedData(data: Uint8Array | Buffer): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data)
}

function errorToRawText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
