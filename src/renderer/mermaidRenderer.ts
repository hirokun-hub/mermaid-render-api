import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  MERMAID_CONFIG_PATH,
  PNG_RENDER_SCALE,
  PUPPETEER_CONFIG_PATH,
  TEMP_DIR
} from '../config.js'

const execFileAsync = promisify(execFile)

type ErrorType = 'parse_error' | 'render_error' | 'timeout'

export interface RenderResult {
  success: boolean
  data?: Buffer
  stderr?: string
  exitCode?: number | null
  errorType?: ErrorType
}

export class MermaidRenderer {
  constructor() {
    // Intentionally empty; directory created during render to avoid race conditions
  }

  async render(
    requestId: string,
    code: string,
    format: 'svg' | 'png',
    timeoutMs: number
  ): Promise<RenderResult> {
    const inputPath = join(TEMP_DIR, `${requestId}.mmd`)
    const outputPath = join(TEMP_DIR, `${requestId}.${format}`)

    await fs.mkdir(TEMP_DIR, { recursive: true })
    await fs.writeFile(inputPath, code, 'utf8')

    try {
      const args = [
        '--yes',
        'mmdc',
        '--input',
        inputPath,
        '--output',
        outputPath,
        '--backgroundColor',
        'transparent',
        '--configFile',
        MERMAID_CONFIG_PATH,
        '--puppeteerConfigFile',
        PUPPETEER_CONFIG_PATH
      ]

      if (format === 'png') {
        args.push('--scale', String(PNG_RENDER_SCALE))
      }

      await execFileAsync('npx', args, { timeout: timeoutMs, env: process.env })

      const data = await fs.readFile(outputPath)
      return { success: true, data, exitCode: 0 }
    } catch (error) {
      const err = error as Error & {
        stderr?: string | Buffer
        stdout?: string
        code?: number | null
        signal?: string
        killed?: boolean
      }

      const stderrValue = err.stderr
      const stderr =
        typeof stderrValue === 'string'
          ? stderrValue
          : stderrValue instanceof Buffer
            ? stderrValue.toString('utf8')
            : ''
      const exitCode = typeof err.code === 'number' ? err.code : null
      const timeout = err.signal === 'SIGTERM' || err.signal === 'SIGKILL'

      const errorType: ErrorType = timeout
        ? 'timeout'
        : this.detectParseError(stderr)
          ? 'parse_error'
          : 'render_error'

      return {
        success: false,
        stderr,
        exitCode,
        errorType
      }
    } finally {
      await this.cleanupFiles(inputPath, outputPath)
    }
  }

  private detectParseError(stderr: string): boolean {
    const lowered = stderr.toLowerCase()
    return (
      lowered.includes('syntax error') || lowered.includes('parse error') ||
      lowered.includes('parsing error')
    )
  }

  private async cleanupFiles(input: string, output: string): Promise<void> {
    await Promise.all([
      fs.rm(input, { force: true }).catch(() => undefined),
      fs.rm(output, { force: true }).catch(() => undefined)
    ])
  }
}
