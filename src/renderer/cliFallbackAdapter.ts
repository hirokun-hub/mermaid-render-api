import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import {
  TEMP_DIR
} from '../config.js'
import { extractMermaidError } from '../utils/extractMermaidError.js'
import { MermaidRenderer } from './mermaidRenderer.js'
import type {
  MermaidRendererAdapter,
  RendererCloseOptions,
  RenderInput,
  RenderResult,
  RendererPoolStats
} from './mermaidRendererAdapter.js'
import { applyPostProcess, rewriteRootSvgId } from './postProcess.js'

export class CliFallbackAdapter implements MermaidRendererAdapter {
  private readonly renderer = new MermaidRenderer()

  async ready(): Promise<void> {
    await Promise.resolve()
  }

  async render(input: RenderInput): Promise<RenderResult> {
    const configPaths = await writeCliConfigFiles(input)
    try {
      const result = await this.renderer.render(
        input.requestId,
        input.code,
        input.format,
        input.timeoutMs,
        configPaths
      )

      if (!result.success) {
        const rawErrorText = result.stderr ?? ''
        const extracted = extractMermaidError(rawErrorText)
        return {
          success: false,
          rawErrorText,
          queueMs: 0,
          exitCode: result.exitCode,
          errorType: result.errorType ?? extracted.errorType,
          errorMessage: extracted.errorMessage,
          line: extracted.line
        }
      }

      const postProcessed = applyPostProcess({
        requestId: input.requestId,
        data: maybeRewriteSvgId(result.data ?? Buffer.alloc(0), input),
        format: input.format,
        postProcess: input.postProcess
      })

      return {
        success: true,
        data: postProcessed.data,
        queueMs: 0,
        postProcessMs: postProcessed.durationMs,
        exitCode: 0
      }
    } finally {
      await cleanupCliConfigFiles(configPaths)
    }
  }

  async close(options: RendererCloseOptions = {}): Promise<void> {
    void options
    await Promise.resolve()
  }

  async healthCheck(): Promise<boolean> {
    return true
  }

  isPoolReady(): boolean {
    return true
  }

  getPoolStats(): RendererPoolStats {
    return {
      inUse: 0,
      queued: 0,
      browserRestartsTotal: 0,
      renderTimeoutsTotal: 0
    }
  }
}

interface CliConfigPaths {
  mermaidConfigPath: string
  puppeteerConfigPath: string
}

async function writeCliConfigFiles(input: RenderInput): Promise<CliConfigPaths> {
  await fs.mkdir(TEMP_DIR, { recursive: true })
  const mermaidConfigPath = join(TEMP_DIR, `${input.requestId}.mermaid.json`)
  const puppeteerConfigPath = join(TEMP_DIR, `${input.requestId}.puppeteer.json`)

  await fs.writeFile(
    mermaidConfigPath,
    JSON.stringify(input.mermaidConfig, null, 2),
    'utf8'
  )

  await fs.writeFile(
    puppeteerConfigPath,
    JSON.stringify(
      {
        headless: 'shell',
        args: [
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--font-render-hinting=none'
        ],
        protocolTimeout: 30000
      },
      null,
      2
    ),
    'utf8'
  )

  return { mermaidConfigPath, puppeteerConfigPath }
}

async function cleanupCliConfigFiles(paths: CliConfigPaths): Promise<void> {
  await Promise.all([
    fs.rm(paths.mermaidConfigPath, { force: true }).catch(() => undefined),
    fs.rm(paths.puppeteerConfigPath, { force: true }).catch(() => undefined)
  ])
}

function maybeRewriteSvgId(data: Buffer, input: RenderInput): Buffer {
  if (input.format !== 'svg' || input.postProcess?.rewrite_ids === false) {
    return data
  }

  return Buffer.from(
    rewriteRootSvgId(data.toString('utf8'), `mermaid-${input.requestId}`),
    'utf8'
  )
}
