import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { safeDeepMerge } from './utils/safeDeepMerge.js'
import {
  WarningCode,
  type WarningCollector
} from './utils/warnings.js'

export const toPositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number(value ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.trunc(parsed)
}

const toRendererMode = (value: string | undefined): RendererMode =>
  value === 'cli' ? 'cli' : 'programmatic'

const LOCKED_SETTING_KEYS = [
  'securityLevel',
  'maxTextSize',
  'maxEdges',
  'startOnLoad',
  'secure'
] as const

export const DEFAULT_TIMEOUT_MS = toPositiveInt(process.env.DEFAULT_TIMEOUT_MS, 8000)
export const MAX_CODE_SIZE = toPositiveInt(process.env.MAX_CODE_SIZE, 50 * 1024)
export const DEFAULT_FORMAT = 'svg' as const
export const CONTENT_TYPE_MAP: Readonly<Record<SupportedFormat, string>> = {
  svg: 'image/svg+xml',
  png: 'image/png'
}
export const TEMP_DIR = join(tmpdir(), 'mermaid-render-api')
export const SUPPORTED_FORMATS = ['svg', 'png'] as const
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number]
export const PUPPETEER_CONFIG_PATH =
  process.env.PUPPETEER_CONFIG_PATH ??
  join(process.cwd(), 'puppeteer.config.json')
export const PNG_RENDER_SCALE = toPositiveInt(process.env.PNG_RENDER_SCALE, 2)
/** CLI fallback compatibility only; SVG root padding is disabled by default. */
export const MERMAID_PADDING = toPositiveInt(process.env.MERMAID_PADDING, 0)
export const MERMAID_CONFIG_PATH =
  process.env.MERMAID_CONFIG_PATH ??
  join(process.cwd(), 'mermaid.config.json')
export const BROWSER_POOL_SIZE = toPositiveInt(process.env.BROWSER_POOL_SIZE, 4)
export const RATE_LIMIT_MAX_INFLIGHT = toPositiveInt(
  process.env.RATE_LIMIT_MAX_INFLIGHT,
  toPositiveInt(process.env.MAX_CONCURRENT_RENDERERS, 15)
)
export const RATE_LIMIT_RETRY_AFTER_MS = toPositiveInt(
  process.env.RATE_LIMIT_RETRY_AFTER_MS,
  3000
)
export const POOL_QUEUE_MAX = toPositiveInt(process.env.POOL_QUEUE_MAX, 20)
export const POOL_WAIT_TIMEOUT_MS = toPositiveInt(
  process.env.POOL_WAIT_TIMEOUT_MS,
  3000
)
export const POOL_RETRY_AFTER_MS = toPositiveInt(
  process.env.POOL_RETRY_AFTER_MS,
  5000
)
export const MIN_TIMEOUT_MS = 1000
export const MAX_TIMEOUT_MS = toPositiveInt(process.env.MAX_TIMEOUT_MS, 30000)
export const MAX_RENDERS_PER_CONTEXT = toPositiveInt(
  process.env.MAX_RENDERS_PER_CONTEXT,
  100
)
export const MAX_RENDERS_PER_BROWSER = toPositiveInt(
  process.env.MAX_RENDERS_PER_BROWSER,
  1000
)
export const MAX_BROWSER_AGE_MS = toPositiveInt(
  process.env.MAX_BROWSER_AGE_MS,
  3600000
)
export const RESERVED_BODY_OVERHEAD_BYTES = 16384
export const BODY_LIMIT_BYTES =
  MAX_CODE_SIZE * 2 + RESERVED_BODY_OVERHEAD_BYTES
export const MAX_THEME_CSS_LENGTH = 4096
export const THEME_CSS_FORBIDDEN_PATTERNS = [
  '</style',
  '<script',
  'javascript:',
  '@import',
  'expression(',
  'url(',
  'behavior:'
] as const
export type RendererMode = 'programmatic' | 'cli'
export const RENDERER_MODE = toRendererMode(process.env.RENDERER_MODE)

export type MermaidConfigValue =
  | string
  | number
  | boolean
  | null
  | MermaidConfigValue[]
  | { [key: string]: MermaidConfigValue | undefined }

export interface MermaidConfig {
  [key: string]: MermaidConfigValue | undefined
  theme?: string
  themeVariables?: {
    fontFamily?: string
    [key: string]: MermaidConfigValue | undefined
  }
  themeCSS?: string
  htmlLabels?: boolean
  securityLevel?: string
  suppressErrorRendering?: boolean
  maxTextSize?: number
  maxEdges?: number
  startOnLoad?: boolean
  secure?: string[]
  flowchart?: {
    useMaxWidth?: boolean
    diagramPadding?: number
    nodeSpacing?: number
    rankSpacing?: number
    curve?: string
    wrappingWidth?: number
    defaultRenderer?: string
    [key: string]: MermaidConfigValue | undefined
  }
}

export const BEAUTIFUL_DEFAULTS: Readonly<MermaidConfig> = {
  theme: 'base',
  themeVariables: {
    fontFamily: '"Noto Sans CJK JP", "IPAexGothic", sans-serif'
  },
  themeCSS: '.label foreignObject { overflow: visible; }',
  htmlLabels: true,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  flowchart: {
    useMaxWidth: false,
    diagramPadding: 0,
    nodeSpacing: 30,
    rankSpacing: 40,
    curve: 'basis',
    wrappingWidth: 200,
    defaultRenderer: 'dagre-wrapper'
  }
}

export const SERVER_LOCKED_SETTINGS: Readonly<MermaidConfig> = {
  securityLevel: 'strict',
  maxTextSize: 50000,
  maxEdges: 500,
  startOnLoad: false
}

export function getBeautifulDefaults(): Readonly<MermaidConfig> {
  return BEAUTIFUL_DEFAULTS
}

export function buildRequestMermaidConfig(
  userOverride?: Partial<MermaidConfig>,
  warnings?: WarningCollector
): MermaidConfig {
  const strippedOverride = stripLockedSettingsAndWarn(userOverride, warnings)
  const merged = safeDeepMerge(BEAUTIFUL_DEFAULTS, strippedOverride, warnings)
  return safeDeepMerge(merged, SERVER_LOCKED_SETTINGS, warnings)
}

function stripLockedSettingsAndWarn(
  userOverride: unknown,
  warnings?: WarningCollector
): unknown {
  if (!isObjectRecord(userOverride)) return userOverride

  const stripped: Record<string, unknown> = Object.create(null)

  for (const [key, value] of Object.entries(userOverride)) {
    if (LOCKED_SETTING_KEYS.includes(key as (typeof LOCKED_SETTING_KEYS)[number])) {
      warnings?.add(WarningCode.LockedSettingOverrideIgnored, { key })
      continue
    }

    if (isObjectRecord(value)) {
      stripped[key] = stripLockedSettingsAndWarn(value, warnings)
      continue
    }

    stripped[key] = value
  }

  return stripped
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}
