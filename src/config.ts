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
export const PUPPETEER_CONFIG_PATH =
  process.env.PUPPETEER_CONFIG_PATH ??
  join(process.cwd(), 'puppeteer.config.json')
export const PNG_RENDER_SCALE = toPositiveInt(process.env.PNG_RENDER_SCALE, 2)
export const MERMAID_PADDING = toPositiveInt(process.env.MERMAID_PADDING, 20)
export const MERMAID_CONFIG_PATH =
  process.env.MERMAID_CONFIG_PATH ??
  join(process.cwd(), 'mermaid.config.json')

export interface MermaidConfig {
  theme: string
  themeVariables: {
    fontFamily: string
  }
  themeCSS?: string
}

export function generateMermaidConfig(padding: number): MermaidConfig {
  const config: MermaidConfig = {
    theme: 'base',
    themeVariables: {
      fontFamily: '"Noto Sans CJK JP", "IPAexGothic", sans-serif'
    }
  }

  if (padding > 0) {
    config.themeCSS = `svg { padding: ${padding}px; }`
  }

  return config
}
