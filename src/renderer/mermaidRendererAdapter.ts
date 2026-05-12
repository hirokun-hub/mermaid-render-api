import type { MermaidConfig, SupportedFormat } from '../config.js'

export interface PostProcessOption {
  rewrite_ids?: boolean
  strip_max_width?: boolean
}

export interface RenderInput {
  requestId: string
  code: string
  format: SupportedFormat
  timeoutMs: number
  mermaidConfig: MermaidConfig
  postProcess?: PostProcessOption
  svgId?: string
}

export type RenderErrorType =
  | 'parse_error'
  | 'render_error'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_request'
  | 'service_unavailable'

export interface RenderResult {
  success: boolean
  data?: Buffer
  rawErrorText?: string
  exitCode?: number | null
  errorType?: RenderErrorType
  errorMessage?: string | null
  line?: number | null
  errorField?: string | null
  errorConstraint?: string | null
}

export interface MermaidRendererAdapter {
  render(input: RenderInput): Promise<RenderResult>
  close(): Promise<void>
}
