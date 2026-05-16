import {
  POOL_RETRY_AFTER_MS,
  POOL_WAIT_TIMEOUT_MS,
  RATE_LIMIT_RETRY_AFTER_MS,
  type SupportedFormat
} from '../config.js'
import type { RenderErrorType } from '../renderer/mermaidRendererAdapter.js'

export interface BuildErrorResponseInput {
  requestId: string
  errorType: RenderErrorType
  statusCode: number
  stderr: string
  exitCode: number | null
  format: string | SupportedFormat
  errorMessage?: string | null
  line?: number | null
  errorField?: string | null
  errorConstraint?: string | null
}

export interface RenderErrorResponse {
  request_id: string
  error_type: RenderErrorType
  status_code: number
  stderr: string
  exit_code: number | null
  format: string | SupportedFormat
  error_message: string | null
  line: number | null
  error_field: string | null
  error_constraint: string | null
}

export function buildErrorResponse(
  input: BuildErrorResponseInput
): RenderErrorResponse {
  return {
    request_id: input.requestId,
    error_type: input.errorType,
    status_code: input.statusCode,
    stderr: input.stderr,
    exit_code: input.exitCode,
    format: input.format,
    error_message: input.errorMessage ?? null,
    line: normalizeLine(input.line),
    error_field: input.errorField ?? null,
    error_constraint: input.errorConstraint ?? null
  }
}

export function retryAfterSeconds(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000)
  return String(Math.max(1, seconds))
}

export type RetryAfterReason = 'pool_unavailable' | 'pool_wait_timeout'

export function retryAfterFor(
  errorType: RenderErrorType,
  reason: RetryAfterReason = 'pool_unavailable'
): string | null {
  if (errorType === 'rate_limited') {
    return retryAfterSeconds(RATE_LIMIT_RETRY_AFTER_MS)
  }

  if (errorType !== 'service_unavailable') {
    return null
  }

  return retryAfterSeconds(
    reason === 'pool_wait_timeout'
      ? POOL_WAIT_TIMEOUT_MS
      : POOL_RETRY_AFTER_MS
  )
}

function normalizeLine(line: number | null | undefined): number | null {
  if (typeof line !== 'number' || !Number.isInteger(line) || line <= 0) {
    return null
  }

  return line
}
