import type { MermaidConfig, SupportedFormat } from '../config.js'

export interface PostProcessOption {
  rewrite_ids?: boolean
  strip_max_width?: boolean
}

export type NormalizedPostProcess = Required<PostProcessOption>

export interface RenderInput {
  requestId: string
  code: string
  format: SupportedFormat
  timeoutMs: number
  mermaidConfig: MermaidConfig
  postProcess?: NormalizedPostProcess
  svgId?: string
}

export type RenderErrorType =
  | 'parse_error'
  | 'render_error'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_request'
  | 'service_unavailable'

export type ServiceUnavailableReason = 'pool_unavailable' | 'pool_wait_timeout'

export interface RenderResult {
  success: boolean
  data?: Buffer
  queueMs?: number
  postProcessMs?: number
  rawErrorText?: string
  exitCode?: number | null
  errorType?: RenderErrorType
  errorMessage?: string | null
  line?: number | null
  errorField?: string | null
  errorConstraint?: string | null
  retryReason?: ServiceUnavailableReason
}

export interface RendererCloseOptions {
  drainTimeoutMs?: number
}

export interface RendererPoolStats {
  inUse: number
  queued: number
  browserRestartsTotal: number
  renderTimeoutsTotal: number
  lastRestartReason?: 'max_uses' | 'max_age' | 'crash'
}

export interface MermaidRendererAdapter {
  ready(): Promise<void>
  render(input: RenderInput): Promise<RenderResult>
  close(options?: RendererCloseOptions): Promise<void>
  healthCheck?(): Promise<boolean>
  isPoolReady?(): boolean
  getPoolStats?(): RendererPoolStats
}
