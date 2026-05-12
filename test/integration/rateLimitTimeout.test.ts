import { afterEach, describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { sleep } from '../helpers/sleep.js'
import { MermaidRenderer } from '../../src/renderer/mermaidRenderer.js'
import { RATE_LIMIT_MAX_INFLIGHT } from '../../src/config.js'

const validCode = 'graph TD\nA-->B'

describe('rate limit and timeout handling', () => {
  const originalRender = MermaidRenderer.prototype.render

  afterEach(() => {
    MermaidRenderer.prototype.render = originalRender
  })

  test('returns 429 when concurrent requests exceed limit', async () => {
    MermaidRenderer.prototype.render = async function (...args) {
      await sleep(200)
      return originalRender.apply(this, args as Parameters<typeof originalRender>)
    }

    const server = await startTestServer()
    try {
      const payload = JSON.stringify({ code: validCode, format: 'svg' })
      const send = () =>
        httpRequest(`${server.baseUrl}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        })

      const responses = await Promise.all(
        Array.from({ length: RATE_LIMIT_MAX_INFLIGHT + 1 }, send)
      )
      const statuses = responses.map((response) => response.status)

      expect(statuses.filter((status) => status === 429).length).toBe(1)

      const limited = responses.find((response) => response.status === 429)
      const payloadJson = JSON.parse(limited?.body.toString('utf8') ?? '{}') as {
        error_type?: string
      }
      expect(payloadJson.error_type).toBe('rate_limited')
      expect(limited?.headers['retry-after']).toMatch(/^[1-9]\d*$/)
    } finally {
      await server.close()
    }
  })

  test('returns 504 when renderer times out', async () => {
    MermaidRenderer.prototype.render = async () => {
      return {
        success: false,
        errorType: 'timeout',
        stderr: '',
        exitCode: null
      }
    }

    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg', timeout_ms: 1000 })
      })

      expect(response.status).toBe(504)
      const payload = JSON.parse(response.body.toString('utf8')) as {
        error_type?: string
      }
      expect(payload.error_type).toBe('timeout')
    } finally {
      await server.close()
    }
  })
})
