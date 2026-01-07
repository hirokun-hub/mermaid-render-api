import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

const validCode = 'graph TD\nA-->B'

describe('Property 3: Error response completeness', () => {
  test('error responses include required fields', async () => {
    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('', ' ', '   '), async (code) => {
          const response = await httpRequest(`${server.baseUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          })
          expect(response.status).toBe(400)
          const payload = JSON.parse(response.body.toString('utf8')) as Record<string, unknown>
          expect(payload.request_id).toBeDefined()
          expect(payload.error_type).toBeDefined()
          expect(payload.status_code).toBeDefined()
          expect(payload.stderr).toBeDefined()
          expect(payload.exit_code).toBeDefined()
          expect(payload.format).toBeDefined()
        }),
        { numRuns: 100 }
      )
    } finally {
      await server.close()
    }
  })
})

describe('Property 4: Reject invalid formats', () => {
  test('invalid formats return 400', async () => {
    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('gif', 'bmp', 'tiff'), async (format) => {
          const response = await httpRequest(`${server.baseUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: validCode, format })
          })
          expect(response.status).toBe(400)
        }),
        { numRuns: 100 }
      )
    } finally {
      await server.close()
    }
  })
})
