import express, { Request, Response } from 'express'

import {
  BODY_LIMIT_BYTES,
  buildRequestMermaidConfig,
  CONTENT_TYPE_MAP,
  DEFAULT_TIMEOUT_MS,
  RATE_LIMIT_MAX_INFLIGHT
} from '../config.js'
import { generateRequestId } from '../utils/requestId.js'
import { logRequest, logResponse, logError } from '../utils/logger.js'
import { validateRenderRequest } from '../validation/inputValidator.js'
import { RateLimiter } from '../limiter/rateLimiter.js'
import { createRenderer } from '../renderer/createRenderer.js'
import type { RendererCloseOptions } from '../renderer/mermaidRendererAdapter.js'
import { WarningCollector } from '../utils/warnings.js'

const app = express()
const renderer = createRenderer()
const rateLimiter = new RateLimiter(RATE_LIMIT_MAX_INFLIGHT)

app.use(express.json({ limit: BODY_LIMIT_BYTES, strict: true }))

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
  const warnings = new WarningCollector()

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
    code: number | null,
    extras: Record<string, unknown> = {}
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
        format: requestedFormat,
        ...extras
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
    const mermaidConfig = buildRequestMermaidConfig(
      isRecord(req.body.mermaid_config) ? req.body.mermaid_config : undefined,
      warnings
    )
    const renderResult = await renderer.render({
      requestId,
      code: req.body.code,
      format: normalizedFormat,
      timeoutMs: requestedTimeout,
      mermaidConfig,
      postProcess: isRecord(req.body.post_process)
        ? req.body.post_process
        : undefined
    })

    if (!renderResult.success) {
      exitCode = renderResult.exitCode ?? null
      const status =
        renderResult.errorType === 'timeout'
          ? 504
          : renderResult.errorType === 'service_unavailable'
            ? 503
          : renderResult.errorType === 'parse_error'
            ? 400
            : 500
      sendError(
        renderResult.errorType ?? 'render_error',
        status,
        renderResult.rawErrorText ?? '',
        exitCode,
        {
          error_message: renderResult.errorMessage ?? null,
          line: renderResult.line ?? null,
          error_field: renderResult.errorField ?? null,
          error_constraint: renderResult.errorConstraint ?? null
        }
      )
      logError(
        requestId,
        new Error('renderer failed'),
        exitCode,
        {
          error_type: renderResult.errorType,
          stderr: renderResult.rawErrorText
        }
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

async function closeRenderer(options: RendererCloseOptions = {}): Promise<void> {
  await renderer.close(options)
}

async function readyRenderer(): Promise<void> {
  await renderer.ready()
}

export { app, closeRenderer, readyRenderer }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
