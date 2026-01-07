import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

describe('Property 1: Request ID consistency', () => {
  test('responses include request id', async () => {
    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('/healthz'), async (path) => {
          const response = await httpRequest(`${server.baseUrl}${path}`)
          const header = response.headers['x-request-id']
          expect(header).toBeDefined()
        }),
        { numRuns: 100 }
      )
    } finally {
      await server.close()
    }
  })
})
