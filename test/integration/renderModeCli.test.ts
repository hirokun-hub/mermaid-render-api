/**
 * C-D-07 / C-D-09: RENDERER_MODE=cli fallback regression after Phase 4.5 dependency update.
 * Verifies that the mmdc subprocess path still works for representative diagram types.
 */
import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

process.env.RENDERER_MODE = 'cli'

describe('PROP-16: RENDERER_MODE=cli: CLI fallback diagram regression', () => {
  test('flowchart renders via CLI fallback successfully', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'graph TD\nA-->B', format: 'svg' })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/svg+xml')
      expect(response.body.toString('utf8')).toContain('<svg')
    } finally {
      await server.close()
    }
  })

  test('sequence diagram renders via CLI fallback successfully', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi',
          format: 'svg'
        })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/svg+xml')
      expect(response.body.toString('utf8')).toContain('<svg')
    } finally {
      await server.close()
    }
  })

  test('PNG rendering via CLI fallback succeeds', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'graph TD\nA-->B', format: 'png' })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/png')
      expect(response.body.length).toBeGreaterThan(0)
    } finally {
      await server.close()
    }
  })
})
