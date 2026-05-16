/**
 * Validates: NFR-05
 * PROP-17: /metrics GET → Prometheus 必須メトリクス 8 系統
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { Observability } from '../../src/server/observability.js'

const REQUIRED_METRICS = [
  'render_total',
  'render_duration_ms',
  'queue_wait_ms',
  'browser_pool_in_use',
  'browser_pool_queue_size',
  'render_timeout_total',
  'browser_restarts_total',
  'validation_error_total'
] as const

describe('PROP-17: observability module registers required Prometheus metrics (Validates: NFR-05)', () => {
  test('all required metric families are registered in the registry', async () => {
    const obs = new Observability()
    const metricsText = await obs.metrics()
    for (const metricName of REQUIRED_METRICS) {
      expect(metricsText).toContain(metricName)
    }
  })

  test('each required metric name exists in the observability registry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...REQUIRED_METRICS),
        async (metricName) => {
          const obs = new Observability()
          const metricsText = await obs.metrics()
          expect(metricsText).toContain(metricName)
        }
      ),
      { numRuns: REQUIRED_METRICS.length }
    )
  })
})
