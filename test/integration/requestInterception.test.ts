/**
 * REQ-D-06: Integration test confirming hardenPageNetwork runs end-to-end
 * in programmatic (BrowserPool) mode without breaking rendering.
 *
 * The URL classification policy is unit-tested in test/unit/requestPolicy.test.ts.
 * This test ensures the policy is wired into the real render path.
 */
import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

process.env.RENDERER_MODE = 'programmatic'

const SIMPLE_FLOWCHART = 'graph TD\nA-->B'

describe('REQ-D-06: request interception active in programmatic (BrowserPool) mode', () => {
  test('flowchart renders successfully with hardenPageNetwork enabled', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: SIMPLE_FLOWCHART, format: 'svg' })
      })

      expect(response.status).toBe(200)
      const svg = response.body.toString('utf8')
      expect(svg).toContain('<svg')
      expect(svg).not.toMatch(/<script[\s>]/i)
    } finally {
      await server.close()
    }
  })
})
