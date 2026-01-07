import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { MermaidRenderer } from '../../src/renderer/mermaidRenderer.js'
import { sleep } from '../helpers/sleep.js'

const validCode = 'graph TD\nA-->B'

describe('Property 7: Timeout responses', () => {
  test('timeout returns 504 with error_type=timeout', async () => {
    const originalRender = MermaidRenderer.prototype.render
    MermaidRenderer.prototype.render = async () => ({
      success: false,
      errorType: 'timeout',
      stderr: '',
      exitCode: null
    })

    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (timeoutMs) => {
          const response = await httpRequest(`${server.baseUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: validCode, format: 'svg', timeout_ms: timeoutMs })
          })

          expect(response.status).toBe(504)
          const payload = JSON.parse(response.body.toString('utf8')) as {
            error_type?: string
          }
          expect(payload.error_type).toBe('timeout')
        }),
        { numRuns: 100 }
      )
    } finally {
      MermaidRenderer.prototype.render = originalRender
      await server.close()
    }
  })
})

describe('Property 8: Rate limit responses', () => {
  test('rate limited responses return 429 with error_type=rate_limited', async () => {
    const originalRender = MermaidRenderer.prototype.render
    MermaidRenderer.prototype.render = async () => {
      await sleep(200)
      return {
        success: false,
        errorType: 'timeout',
        stderr: '',
        exitCode: null
      }
    }

    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (count) => {
          const payload = JSON.stringify({ code: validCode, format: 'svg' })
          const requests = Array.from({ length: count + 2 }, () =>
            httpRequest(`${server.baseUrl}/render`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload
            })
          )

          const responses = await Promise.all(requests)
          const limited = responses.find((response) => response.status === 429)
          expect(limited).toBeDefined()
          const payloadJson = JSON.parse(limited?.body.toString('utf8') ?? '{}') as {
            error_type?: string
          }
          expect(payloadJson.error_type).toBe('rate_limited')
        }),
        { numRuns: 100 }
      )
    } finally {
      MermaidRenderer.prototype.render = originalRender
      await server.close()
    }
  })
})
