/**
 * Integration tests for BEAUTIFUL_DEFAULTS SVG output structure (REQ-U-11 AC-1, AC-2)
 */
import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

const validCode = 'flowchart LR\n  A["開始"] --> B{"判定"}\n  B -->|Yes| C["完了"]'

describe('SVG defaults integration (REQ-U-11 AC-1, AC-2)', () => {
  test('AC-2: SVG root contains width="100%" and style with max-width (useMaxWidth=true)', async () => {
    const server = await startTestServer()
    try {
      const resp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      expect(resp.status).toBe(200)
      const svg = resp.body.toString('utf8')

      // useMaxWidth=true → width="100%" on root svg
      expect(svg).toMatch(/^<svg[^>]*width="100%"/)
      // max-width style should be present
      expect(svg).toMatch(/max-width:\s*[\d.]+px/)
    } finally {
      await server.close()
    }
  }, 30000)

  test('AC-1: diagramPadding=8 (default) produces larger viewBox than diagramPadding=0 override', async () => {
    const server = await startTestServer()
    try {
      // default: diagramPadding=8 (BEAUTIFUL_DEFAULTS)
      const respDefault = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      expect(respDefault.status).toBe(200)

      // override: diagramPadding=0 (explicit zero — should give smaller viewBox)
      const respZero = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: validCode,
          format: 'svg',
          mermaid_config: { flowchart: { diagramPadding: 0 } }
        })
      })
      expect(respZero.status).toBe(200)

      const parseViewBox = (svg: string) => {
        const m = /viewBox="([^"]+)"/.exec(svg)
        if (!m) throw new Error('viewBox not found')
        const [x, y, w, h] = m[1].split(/\s+/).map(Number)
        return { x, y, w, h }
      }

      const vbDefault = parseViewBox(respDefault.body.toString('utf8'))
      const vbZero = parseViewBox(respZero.body.toString('utf8'))

      // diagramPadding=8 adds 8px on each side → viewBox W/H should be at least 14px larger
      // (conservative: 16px expected, allow 2px rounding)
      expect(vbDefault.w).toBeGreaterThan(vbZero.w + 14)
      expect(vbDefault.h).toBeGreaterThan(vbZero.h + 14)
    } finally {
      await server.close()
    }
  }, 30000)

  test('AC-2: user override of useMaxWidth=false results in fixed-px width SVG', async () => {
    const server = await startTestServer()
    try {
      const resp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: validCode,
          format: 'svg',
          mermaid_config: { flowchart: { useMaxWidth: false } }
        })
      })
      expect(resp.status).toBe(200)
      const svg = resp.body.toString('utf8')

      // With useMaxWidth=false override, SVG root should have numeric width
      expect(svg).toMatch(/^<svg[^>]*width="[\d.]+"/)
      expect(svg).not.toMatch(/^<svg[^>]*width="100%"/)
    } finally {
      await server.close()
    }
  }, 30000)
})
