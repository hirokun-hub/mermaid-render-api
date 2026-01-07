import express, { Request, Response } from 'express'

import { DEFAULT_TIMEOUT_MS, MAX_CONCURRENT_RENDERERS } from '../config.js'
import { generateRequestId } from '../utils/requestId.js'
import { logRequest, logResponse, logError } from '../utils/logger.js'
import { validateRenderRequest } from '../validation/inputValidator.js'
import { MermaidRenderer } from '../renderer/mermaidRenderer.js'
import { RateLimiter } from '../limiter/rateLimiter.js'

const app = express()
const renderer = new MermaidRenderer()
const rateLimiter = new RateLimiter(MAX_CONCURRENT_RENDERERS)
const CONTENT_TYPE_MAP: Record<'svg' | 'png', string> = {
  svg: 'image/svg+xml',
  png: 'image/png'
}

app.use(express.json({ limit: '128kb' }))

app.post('/render', async (req: Request, res: Response) => {
  const requestId = generateRequestId()
  const start = Date.now()
  let statusCode = 200
  let outcome: 'success' | 'failure' = 'success'
  let exitCode: number | null = null
  let acquired = false

  logRequest(requestId, req.method, req.path)

  const requestedTimeout =
    typeof req.body.timeout_ms === 'number' && req.body.timeout_ms > 0
      ? req.body.timeout_ms
      : DEFAULT_TIMEOUT_MS

  const validation = validateRenderRequest({
    code: req.body.code,
    format: req.body.format
  })

  const requestedFormat = validation.requestedFormat
  const normalizedFormat = validation.normalizedFormat

  const sendError = (
    type: string,
    status: number,
    stderr: string,
    code: number | null
  ) => {
    statusCode = status
    outcome = 'failure'
    res
      .status(status)
      .set('Content-Type', 'application/json')
      .set('X-Request-Id', requestId)
      .json({
        request_id: requestId,
        error_type: type,
        status_code: status,
        stderr,
        exit_code: code,
        format: requestedFormat
      })
  }

  if (!validation.valid) {
    const error = validation.error ?? {
      type: 'invalid_request',
      message: 'invalid_request',
      status_code: 400,
      stderr: '',
      exit_code: null
    }
    sendError('invalid_request', 400, error.stderr, null)
    logError(
      requestId,
      new Error(error.message),
      null,
      { stage: 'validation' }
    )
    const duration = Date.now() - start
    logResponse(requestId, statusCode, duration, outcome, exitCode)
    return
  }

  const allowed = await rateLimiter.acquire()
  acquired = allowed
  if (!allowed) {
    sendError('rate_limited', 429, '', null)
    const duration = Date.now() - start
    logResponse(requestId, statusCode, duration, outcome, exitCode)
    return
  }

  try {
    const renderResult = await renderer.render(
      requestId,
      req.body.code,
      normalizedFormat,
      requestedTimeout
    )

    if (!renderResult.success) {
      exitCode = renderResult.exitCode ?? null
      const status =
        renderResult.errorType === 'timeout'
          ? 504
          : renderResult.errorType === 'parse_error'
            ? 400
            : 500
      sendError(
        renderResult.errorType ?? 'render_error',
        status,
        renderResult.stderr ?? '',
        exitCode
      )
      logError(
        requestId,
        new Error('renderer failed'),
        exitCode,
        { error_type: renderResult.errorType, stderr: renderResult.stderr }
      )
      return
    }

    exitCode = null
    res
      .status(200)
      .set('Content-Type', CONTENT_TYPE_MAP[normalizedFormat])
      .set('X-Request-Id', requestId)
      .send(renderResult.data)
  } catch (error) {
    statusCode = 500
    outcome = 'failure'
    logError(requestId, error as Error, null, { stage: 'render' })
    sendError('render_error', 500, '', null)
  } finally {
    if (acquired) {
      rateLimiter.release()
    }
    const duration = Date.now() - start
    logResponse(requestId, statusCode, duration, outcome, exitCode)
  }
})

app.get('/healthz', (req: Request, res: Response) => {
  const requestId = generateRequestId()
  const start = Date.now()

  logRequest(requestId, req.method, req.path)
  res
    .status(200)
    .set('Content-Type', 'text/plain')
    .set('X-Request-Id', requestId)
    .send('ok')
  const duration = Date.now() - start
  logResponse(requestId, 200, duration, 'success', null)
})

export { app }
