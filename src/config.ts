import { tmpdir } from 'node:os'
import { join } from 'node:path'

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.trunc(parsed)
}

export const DEFAULT_TIMEOUT_MS = toPositiveInt(process.env.DEFAULT_TIMEOUT_MS, 8000)
export const MAX_CONCURRENT_RENDERERS = toPositiveInt(
  process.env.MAX_CONCURRENT_RENDERERS,
  2
)
export const MAX_CODE_SIZE = toPositiveInt(process.env.MAX_CODE_SIZE, 50 * 1024)
export const TEMP_DIR = join(tmpdir(), 'mermaid-render-api')
export const SUPPORTED_FORMATS = ['svg', 'png'] as const
