import { afterEach, describe, expect, test, vi } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { logger } from '../../src/utils/logger.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('server locked Mermaid settings', () => {
  test('ignores client securityLevel override and renders successfully', async () => {
    const logSpy = vi.spyOn(logger, 'info')
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'graph TD\nA-->B',
          format: 'svg',
          mermaid_config: { securityLevel: 'loose' }
        })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/svg+xml')
      expect(response.body.toString('utf8')).toContain('<svg')
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          warnings: ['locked_setting_override_ignored']
        })
      )
    } finally {
      await server.close()
    }
  })
})
