import pino from 'pino'

export type LogOutcome = 'success' | 'failure'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  enabled: process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true'
})

export function logStructuredRequest(payload: Record<string, unknown>): void {
  logger.info(payload)
}

export function logRequest(requestId: string, method: string, path: string): void {
  const payload = {
    timestamp: new Date().toISOString(),
    request_id: requestId,
    event: 'request_received',
    method,
    path
  }
  logger.info(payload)
}

export function logResponse(
  requestId: string,
  statusCode: number,
  durationMs: number,
  outcome: LogOutcome,
  exitCode: number | null
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    request_id: requestId,
    event: 'response_sent',
    status_code: statusCode,
    duration_ms: durationMs,
    outcome,
    exit_code: exitCode
  }
  logger.info(payload)
}

export function logError(
  requestId: string,
  error: Error,
  exitCode: number | null,
  context: Record<string, unknown> = {}
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    request_id: requestId,
    event: 'error',
    message: error.message,
    stack: error.stack,
    exit_code: exitCode,
    context
  }
  logger.error(payload)
}

export function logStartup(mmdcVersion: string): void {
  const payload = {
    timestamp: new Date().toISOString(),
    event: 'startup',
    mmdc_version: mmdcVersion
  }
  logger.info(payload)
}
