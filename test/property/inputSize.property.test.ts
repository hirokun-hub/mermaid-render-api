import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

describe('Property 6: Input size limit', () => {
  test('oversized inputs return 400', async () => {
    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 51201, max: 60000 }), async (size) => {
          const response = await httpRequest(`${server.baseUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: 'a'.repeat(size) })
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
