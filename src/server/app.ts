import express, { Request, Response } from 'express'

import {
  BODY_LIMIT_BYTES,
  buildRequestMermaidConfig,
  CONTENT_TYPE_MAP,
  RATE_LIMIT_MAX_INFLIGHT
} from '../config.js'
import { generateRequestId } from '../utils/requestId.js'
import { logRequest, logResponse, logError } from '../utils/logger.js'
import { validateRenderRequest } from '../validation/inputValidator.js'
import { RateLimiter } from '../limiter/rateLimiter.js'
import { createRenderer } from '../renderer/createRenderer.js'
import type {
  RenderErrorType,
  RendererCloseOptions
} from '../renderer/mermaidRendererAdapter.js'
import { WarningCollector } from '../utils/warnings.js'
import {
  buildErrorResponse,
  retryAfterFor
} from './errorResponse.js'
import {
  observability,
  registerObservabilityRoutes,
  type RenderLogResult
} from './observability.js'
import type { RetryAfterReason } from './errorResponse.js'

const app = express()
const renderer = createRenderer()
const rateLimiter = new RateLimiter(RATE_LIMIT_MAX_INFLIGHT)

observability.setPoolStatsProvider(() => renderer.getPoolStats?.() ?? null)

registerObservabilityRoutes(app, {
  isPoolReady: async () => renderer.isPoolReady?.() ?? false
})

app.use(express.json({ limit: BODY_LIMIT_BYTES, strict: true }))

app.post('/render', async (req: Request, res: Response) => {
  const requestId = generateRequestId()
  const start = Date.now()
  let renderStart = start
  let renderMs = 0
  let postProcessMs = 0
  let acquired = false
  let result: RenderLogResult = 'ok'
  let queueMs = 0
  let errorField: string | null = null
  let errorConstraint: string | null = null

  const warnings = new WarningCollector()

  const validation = validateRenderRequest({
    code: req.body.code,
    format: req.body.format,
    timeout_ms: req.body.timeout_ms,
    mermaid_config: req.body.mermaid_config,
    post_process: req.body.post_process
  })

  const requestedFormat = validation.requestedFormat
  const normalizedFormat = validation.normalizedFormat
  for (const warning of validation.warnings) {
    warnings.add(warning.code, warning.detail)
  }

  const sendError = (
    type: RenderErrorType,
    status: number,
    stderr: string,
    code: number | null,
    extras: Record<string, unknown> = {}
  ) => {
    result = type
    errorField = (extras.error_field as string | null | undefined) ?? null
    errorConstraint =
      (extras.error_constraint as string | null | undefined) ?? null
    const response = buildErrorResponse({
      requestId,
      errorType: type,
      statusCode: status,
      stderr,
      exitCode: code,
      format: requestedFormat,
      errorMessage: (extras.error_message as string | null | undefined) ?? null,
      line: (extras.line as number | null | undefined) ?? null,
      errorField: (extras.error_field as string | null | undefined) ?? null,
      errorConstraint:
        (extras.error_constraint as string | null | undefined) ?? null
    })
    const responseBuilder = res
      .status(status)
      .set('Content-Type', 'application/json')
      .set('X-Request-Id', requestId)

    const retryAfter = retryAfterFor(
      type,
      (extras.retry_reason as RetryAfterReason | undefined) ?? undefined
    )
    if (retryAfter) {
      responseBuilder.set('Retry-After', retryAfter)
    }

    responseBuilder.json(response)
  }

  if (!validation.valid) {
    const error = validation.error ?? {
      type: 'invalid_request',
      message: 'invalid_request',
      status_code: 400,
      stderr: '',
      exit_code: null,
      error_field: null,
      error_constraint: null
    }
    sendError('invalid_request', 400, error.stderr, null, {
      error_message: error.message,
      error_field: error.error_field,
      error_constraint: error.error_constraint
    })
    const duration = Date.now() - start
    observeRenderRequest({
      requestId,
      format: requestedFormat,
      code: req.body.code,
      totalMs: duration,
      renderMs,
      queueMs,
      postProcessMs,
      result,
      warnings,
      errorField,
      errorConstraint
    })
    return
  }

  const allowed = await rateLimiter.acquire()
  acquired = allowed
  if (!allowed) {
    sendError('rate_limited', 429, '', null)
    const duration = Date.now() - start
    observeRenderRequest({
      requestId,
      format: normalizedFormat,
      code: req.body.code,
      totalMs: duration,
      renderMs,
      queueMs,
      postProcessMs,
      result,
      warnings,
      errorField,
      errorConstraint
    })
    return
  }

  try {
    const mermaidConfig = buildRequestMermaidConfig(
      validation.mermaidConfig,
      warnings
    )
    renderStart = Date.now()
    const renderResult = await renderer.render({
      requestId,
      code: req.body.code,
      format: normalizedFormat,
      timeoutMs: validation.timeoutMs,
      mermaidConfig,
      postProcess: validation.postProcess
    })
    queueMs = renderResult.queueMs ?? 0
    renderMs = Date.now() - renderStart
    postProcessMs = renderResult.postProcessMs ?? 0

    if (!renderResult.success) {
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
        renderResult.exitCode ?? null,
        {
          error_message: renderResult.errorMessage ?? null,
          line: renderResult.line ?? null,
          error_field: renderResult.errorField ?? null,
          error_constraint: renderResult.errorConstraint ?? null,
          retry_reason: renderResult.retryReason
        }
      )
      return
    }

    res
      .status(200)
      .set('Content-Type', CONTENT_TYPE_MAP[normalizedFormat])
      .set('X-Request-Id', requestId)
      .send(renderResult.data)
  } catch (error) {
    result = 'render_error'
    logError(requestId, error as Error, null, { stage: 'render' })
    sendError('render_error', 500, '', null)
  } finally {
    if (acquired) {
      rateLimiter.release()
    }
    const duration = Date.now() - start
    observeRenderRequest({
      requestId,
      format: normalizedFormat,
      code: req.body.code,
      totalMs: duration,
      renderMs,
      queueMs,
      postProcessMs,
      result,
      warnings,
      errorField,
      errorConstraint
    })
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

function observeRenderRequest(input: {
  requestId: string
  format: string
  code: unknown
  totalMs: number
  renderMs: number
  queueMs: number
  postProcessMs: number
  result: RenderLogResult
  warnings: WarningCollector
  errorField: string | null
  errorConstraint: string | null
}): void {
  const stats = renderer.getPoolStats?.() ?? {
    inUse: 0,
    queued: 0,
    browserRestartsTotal: 0,
    renderTimeoutsTotal: 0
  }
  observability.syncPoolStats(stats)
  observability.observeRequest({
    requestId: input.requestId,
    format: input.format,
    codeBytes:
      typeof input.code === 'string'
        ? Buffer.byteLength(input.code, 'utf8')
        : 0,
    queueMs: input.queueMs,
    renderMs: input.renderMs,
    postProcessMs: input.postProcessMs,
    totalMs: input.totalMs,
    poolInUse: stats.inUse,
    poolWaiting: stats.queued,
    result: input.result,
    warnings: input.warnings.drain().map((warning) => warning.code),
    errorField: input.errorField,
    errorConstraint: input.errorConstraint
  })
}
