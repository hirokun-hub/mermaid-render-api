export type LogOutcome = 'success' | 'failure'

const formatPayload = (payload: Record<string, unknown>): string => {
  return JSON.stringify(payload)
}

export function logRequest(requestId: string, method: string, path: string): void {
  const payload = {
    timestamp: new Date().toISOString(),
    request_id: requestId,
    event: 'request_received',
    method,
    path
  }
  console.info(formatPayload(payload))
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
  console.info(formatPayload(payload))
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
  console.error(formatPayload(payload))
}

export function logStartup(mmdcVersion: string): void {
  const payload = {
    timestamp: new Date().toISOString(),
    event: 'startup',
    mmdc_version: mmdcVersion
  }
  console.info(formatPayload(payload))
}
