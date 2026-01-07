import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

describe('GET /healthz', () => {
  test('returns ok with request id', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/healthz`)
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/plain')
      expect(response.headers['x-request-id']).toBeDefined()
      expect(response.body.toString('utf8')).toBe('ok')
    } finally {
      await server.close()
    }
  })
})
