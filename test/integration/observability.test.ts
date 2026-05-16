import express from 'express'
import { createServer } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer, type TestServer } from '../helpers/server.js'
import {
  observability,
  registerObservabilityRoutes
} from '../../src/server/observability.js'

describe('observability endpoints', () => {
  let server: TestServer | null = null

  afterEach(async () => {
    observability.resetReadinessWindowForTest()
    observability.setPoolStatsProvider(() => null)
    await server?.close()
    server = null
  })

  test('PROP-17: /metrics exposes the required Prometheus metric families', async () => {
    server = await startTestServer()

    const response = await httpRequest(`${server.baseUrl}/metrics`)
    const body = response.body.toString('utf8')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(body).toContain('render_total')
    expect(body).toContain('render_duration_ms')
    expect(body).toContain('queue_wait_ms')
    expect(body).toContain('browser_pool_in_use')
    expect(body).toContain('browser_pool_queue_size')
    expect(body).toContain('render_timeout_total')
    expect(body).toContain('browser_restarts_total')
    expect(body).toContain('validation_error_total')
  })

  test('/metrics samples browser pool gauges from provider at scrape time', async () => {
    server = await startFakeObservabilityServer(true)
    observability.setPoolStatsProvider(() => ({
      inUse: 2,
      queued: 3,
      browserRestartsTotal: 0,
      renderTimeoutsTotal: 0
    }))

    const response = await httpRequest(`${server.baseUrl}/metrics`)
    const body = response.body.toString('utf8')

    expect(response.status).toBe(200)
    expect(body).toContain('browser_pool_in_use 2')
    expect(body).toContain('browser_pool_queue_size 3')
  })

  test('/livez stays 200 when readiness probe fails', async () => {
    server = await startFakeObservabilityServer(false)

    const live = await httpRequest(`${server.baseUrl}/livez`)
    const ready = await httpRequest(`${server.baseUrl}/readyz`)

    expect(live.status).toBe(200)
    expect(ready.status).toBe(503)
  })

  test('/readyz returns 503 when recent error rate is 50 percent or higher', async () => {
    server = await startFakeObservabilityServer(true)
    recordResults(4, 'ok')
    recordResults(6, 'render_error')

    const response = await httpRequest(`${server.baseUrl}/readyz`)

    expect(response.status).toBe(503)
  })

  test('/readyz returns 200 when pool is healthy and recent errors are low', async () => {
    server = await startFakeObservabilityServer(true)
    recordResults(99, 'ok')
    recordResults(1, 'render_error')

    const response = await httpRequest(`${server.baseUrl}/readyz`)

    expect(response.status).toBe(200)
  })
})

async function startFakeObservabilityServer(poolReady: boolean): Promise<TestServer> {
  const fakeApp = express()
  registerObservabilityRoutes(fakeApp, {
    isPoolReady: async () => poolReady
  })
  const httpServer = createServer(fakeApp)

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve())
  })

  const address = httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
  }
}

function recordResults(count: number, result: 'ok' | 'render_error'): void {
  for (let index = 0; index < count; index += 1) {
    observability.observeRequest({
      requestId: `ready-${result}-${index}`,
      format: 'svg',
      codeBytes: 0,
      queueMs: 0,
      renderMs: 0,
      postProcessMs: 0,
      totalMs: 0,
      poolInUse: 0,
      poolWaiting: 0,
      result,
      warnings: []
    })
  }
}
