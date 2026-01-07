import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { MermaidRenderer } from '../../src/renderer/mermaidRenderer.js'

const validCode = 'graph TD\nA-->B'

describe('Property 2: Content-Type matches format', () => {
  test('content-type matches svg/png', async () => {
    const originalRender = MermaidRenderer.prototype.render
    MermaidRenderer.prototype.render = async () => ({
      success: true,
      data: Buffer.from('<svg></svg>'),
      exitCode: 0
    })
    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('svg', 'png'), async (format) => {
          const response = await httpRequest(`${server.baseUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: validCode, format })
          })
          expect(response.status).toBe(200)
          const contentType = response.headers['content-type'] ?? ''
          if (format === 'svg') {
            expect(contentType).toContain('image/svg+xml')
          } else {
            expect(contentType).toContain('image/png')
          }
        }),
        { numRuns: 100 }
      )
    } finally {
      MermaidRenderer.prototype.render = originalRender
      await server.close()
    }
  })
})

describe('Property 5: Error responses are JSON', () => {
  test('error content-type is application/json', async () => {
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
          const contentType = response.headers['content-type'] ?? ''
          expect(contentType).toContain('application/json')
        }),
        { numRuns: 100 }
      )
    } finally {
      await server.close()
    }
  })
})
