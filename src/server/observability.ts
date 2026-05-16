import type { Request, Response, Router } from 'express'
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from 'prom-client'

import type { SupportedFormat } from '../config.js'
import type {
  RenderErrorType,
  RendererPoolStats
} from '../renderer/mermaidRendererAdapter.js'
import type { WarningCode } from '../utils/warnings.js'
import { logStructuredRequest } from '../utils/logger.js'

export type RenderLogResult =
  | 'ok'
  | RenderErrorType

export interface RequestObservation {
  requestId: string
  format: string | SupportedFormat
  codeBytes: number
  queueMs: number
  renderMs: number
  postProcessMs: number
  totalMs: number
  poolInUse: number
  poolWaiting: number
  result: RenderLogResult
  warnings: WarningCode[]
  errorField?: string | null
  errorConstraint?: string | null
}

export interface ReadinessProbe {
  isPoolReady(): Promise<boolean>
}

type PoolStatsProvider = () => RendererPoolStats | null

interface WindowEntry {
  timestamp: number
  result: RenderLogResult
}

const SLIDING_WINDOW_MS = 5 * 60 * 1000
const READINESS_MIN_SAMPLE_SIZE = 10
const READINESS_MAX_ERROR_RATE = 0.5

export class Observability {
  readonly registry = new Registry()
  private poolStatsProvider: PoolStatsProvider = () => null

  private readonly renderTotal = new Counter({
    name: 'render_total',
    help: 'Total render requests by result and format.',
    labelNames: ['result', 'format'],
    registers: [this.registry]
  })

  private readonly renderDurationMs = new Histogram({
    name: 'render_duration_ms',
    help: 'Render duration in milliseconds.',
    labelNames: ['format'],
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
    registers: [this.registry]
  })

  private readonly queueWaitMs = new Histogram({
    name: 'queue_wait_ms',
    help: 'Queue wait duration in milliseconds.',
    buckets: [0, 10, 50, 100, 250, 500, 1000, 3000, 10000],
    registers: [this.registry]
  })

  private readonly browserPoolInUse = new Gauge({
    name: 'browser_pool_in_use',
    help: 'Browser pool contexts currently in use.',
    registers: [this.registry],
    collect: () => {
      const stats = this.poolStatsProvider()
      if (stats) this.browserPoolInUse.set(stats.inUse)
    }
  })

  private readonly browserPoolQueueSize = new Gauge({
    name: 'browser_pool_queue_size',
    help: 'Browser pool acquire queue size.',
    registers: [this.registry],
    collect: () => {
      const stats = this.poolStatsProvider()
      if (stats) this.browserPoolQueueSize.set(stats.queued)
    }
  })

  private readonly renderTimeoutTotal = new Counter({
    name: 'render_timeout_total',
    help: 'Total render timeouts.',
    registers: [this.registry]
  })

  private readonly browserRestartsTotal = new Counter({
    name: 'browser_restarts_total',
    help: 'Total browser restarts by reason.',
    labelNames: ['reason'],
    registers: [this.registry]
  })

  private readonly validationErrorTotal = new Counter({
    name: 'validation_error_total',
    help: 'Total validation errors by field and constraint.',
    labelNames: ['field', 'constraint'],
    registers: [this.registry]
  })

  private readonly recentResults: WindowEntry[] = []
  private lastBrowserRestartsTotal = 0
  private lastRenderTimeoutsTotal = 0

  constructor() {
    collectDefaultMetrics({ register: this.registry })
  }

  observeRequest(observation: RequestObservation): void {
    this.renderTotal.inc({
      result: observation.result,
      format: observation.format
    })
    this.renderDurationMs.observe(
      { format: observation.format },
      observation.renderMs
    )
    this.queueWaitMs.observe(observation.queueMs)
    if (observation.result === 'timeout') {
      this.renderTimeoutTotal.inc()
    }

    if (observation.result === 'invalid_request') {
      this.validationErrorTotal.inc({
        field: observation.errorField ?? 'unknown',
        constraint: observation.errorConstraint ?? 'unknown'
      })
    }

    this.recentResults.push({
      timestamp: Date.now(),
      result: observation.result
    })
    this.pruneRecentResults()

    logStructuredRequest({
      request_id: observation.requestId,
      format: observation.format,
      code_bytes: observation.codeBytes,
      queue_ms: observation.queueMs,
      render_ms: observation.renderMs,
      post_process_ms: observation.postProcessMs,
      total_ms: observation.totalMs,
      pool_in_use: observation.poolInUse,
      pool_waiting: observation.poolWaiting,
      result: observation.result,
      warnings: observation.warnings
    })
  }

  syncPoolStats(stats: RendererPoolStats): void {
    if (stats.browserRestartsTotal > this.lastBrowserRestartsTotal) {
      this.browserRestartsTotal.inc(
        { reason: stats.lastRestartReason ?? 'crash' },
        stats.browserRestartsTotal - this.lastBrowserRestartsTotal
      )
      this.lastBrowserRestartsTotal = stats.browserRestartsTotal
    }

    this.lastRenderTimeoutsTotal = stats.renderTimeoutsTotal
  }

  setPoolStatsProvider(provider: PoolStatsProvider): void {
    this.poolStatsProvider = provider
  }

  async metrics(): Promise<string> {
    return this.registry.metrics()
  }

  metricsContentType(): string {
    return this.registry.contentType
  }

  isErrorRateReady(): boolean {
    this.pruneRecentResults()
    if (this.recentResults.length < READINESS_MIN_SAMPLE_SIZE) return true

    const failures = this.recentResults.filter(
      (entry) => entry.result !== 'ok'
    ).length
    return failures / this.recentResults.length < READINESS_MAX_ERROR_RATE
  }

  resetReadinessWindowForTest(): void {
    if (process.env.NODE_ENV !== 'test') return
    this.recentResults.length = 0
  }

  private pruneRecentResults(): void {
    const cutoff = Date.now() - SLIDING_WINDOW_MS
    while (
      this.recentResults.length > 0 &&
      this.recentResults[0]?.timestamp !== undefined &&
      this.recentResults[0].timestamp < cutoff
    ) {
      this.recentResults.shift()
    }
  }
}

export const observability = new Observability()

export function registerObservabilityRoutes(
  router: Router,
  readinessProbe: ReadinessProbe
): void {
  router.get('/metrics', async (_req: Request, res: Response) => {
    res
      .status(200)
      .set('Content-Type', observability.metricsContentType())
      .send(await observability.metrics())
  })

  router.get('/livez', (_req: Request, res: Response) => {
    res.status(200).set('Content-Type', 'text/plain').send('ok')
  })

  router.get('/readyz', async (_req: Request, res: Response) => {
    const poolReady = await readinessProbe.isPoolReady()
    const errorRateReady = observability.isErrorRateReady()
    res
      .status(poolReady && errorRateReady ? 200 : 503)
      .set('Content-Type', 'text/plain')
      .send(poolReady && errorRateReady ? 'ok' : 'unavailable')
  })
}
