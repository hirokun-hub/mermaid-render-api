import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_TIMEOUT_MS = 8000
export const MAX_CONCURRENT_RENDERERS = 2
export const TEMP_DIR = join(tmpdir(), 'mermaid-render-api')
export const SUPPORTED_FORMATS = ['svg', 'png'] as const
