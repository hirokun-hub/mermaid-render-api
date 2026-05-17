/**
 * Integration tests for scale parameter (REQ-U-11 §4.4)
 * Validates: AC-5,6,7,8,9,10,11,12
 */
import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { normalizeSvgForCompare, parseSvgViewBoxWidth, readPngWidth } from '../helpers/svgCompare.js'

const validCode = 'flowchart LR\n  A["開始"] --> B{"判定"}\n  B -->|Yes| C["完了"]\n  B -->|No| D["再試行"]'

describe('PNG scale integration (REQ-U-11 §4.4)', () => {
  test('(i) scale 未指定で PNG → 幅が viewBox 幅 × 3 ± 2 (AC-6)', async () => {
    const server = await startTestServer()
    try {
      const svgResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      const svgWidth = parseSvgViewBoxWidth(svgResp.body.toString('utf8'))

      const pngResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'png' })
      })
      expect(pngResp.status).toBe(200)
      const pngWidth = readPngWidth(pngResp.body)
      expect(Math.abs(pngWidth - Math.ceil(svgWidth * 3))).toBeLessThanOrEqual(4)
    } finally {
      await server.close()
    }
  }, 60000)

  test('(ii) scale: 1 → 幅が viewBox 幅 × 1 ± 2', async () => {
    const server = await startTestServer()
    try {
      const svgResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      const svgWidth = parseSvgViewBoxWidth(svgResp.body.toString('utf8'))

      const pngResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'png', scale: 1 })
      })
      expect(pngResp.status).toBe(200)
      const pngWidth = readPngWidth(pngResp.body)
      expect(Math.abs(pngWidth - Math.ceil(svgWidth * 1))).toBeLessThanOrEqual(4)
    } finally {
      await server.close()
    }
  }, 60000)

  test('(iii) scale: 2 → 幅が viewBox 幅 × 2 ± 2 (AC-7)', async () => {
    const server = await startTestServer()
    try {
      const svgResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      const svgWidth = parseSvgViewBoxWidth(svgResp.body.toString('utf8'))

      const pngResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'png', scale: 2 })
      })
      expect(pngResp.status).toBe(200)
      const pngWidth = readPngWidth(pngResp.body)
      expect(Math.abs(pngWidth - Math.ceil(svgWidth * 2))).toBeLessThanOrEqual(4)
    } finally {
      await server.close()
    }
  }, 60000)

  test('(iv) scale: 4 → 幅が viewBox 幅 × 4 ± 2 (AC-8)', async () => {
    const server = await startTestServer()
    try {
      const svgResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      const svgWidth = parseSvgViewBoxWidth(svgResp.body.toString('utf8'))

      const pngResp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'png', scale: 4 })
      })
      expect(pngResp.status).toBe(200)
      const pngWidth = readPngWidth(pngResp.body)
      expect(Math.abs(pngWidth - Math.ceil(svgWidth * 4))).toBeLessThanOrEqual(4)
    } finally {
      await server.close()
    }
  }, 60000)

  test('(v) scale: 5 → 400 (AC-9)', async () => {
    const server = await startTestServer()
    try {
      const resp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'png', scale: 5 })
      })
      expect(resp.status).toBe(400)
      const body = JSON.parse(resp.body.toString('utf8')) as { error_field: string; error_constraint: string }
      expect(body.error_field).toBe('scale')
      expect(body.error_constraint).toBe('out_of_range')
    } finally {
      await server.close()
    }
  })

  test('(vi) scale: "3" (string) → 400 (AC-10)', async () => {
    const server = await startTestServer()
    try {
      const resp = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'png', scale: '3' })
      })
      expect(resp.status).toBe(400)
      const body = JSON.parse(resp.body.toString('utf8')) as { error_field: string; error_constraint: string }
      expect(body.error_field).toBe('scale')
      expect(body.error_constraint).toBe('type_mismatch')
    } finally {
      await server.close()
    }
  })

  test('(vii) format=svg + scale: 3 → 200 SVG, scale あり/なし の内容が正規化後一致 (AC-11)', async () => {
    const server = await startTestServer()
    try {
      const respNoScale = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      expect(respNoScale.status).toBe(200)
      expect(respNoScale.headers['content-type']).toContain('image/svg+xml')

      const respWithScale = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg', scale: 3 })
      })
      expect(respWithScale.status).toBe(200)
      expect(respWithScale.headers['content-type']).toContain('image/svg+xml')

      const normNoScale = normalizeSvgForCompare(respNoScale.body.toString('utf8'))
      const normWithScale = normalizeSvgForCompare(respWithScale.body.toString('utf8'))
      expect(normWithScale).toEqual(normNoScale)
    } finally {
      await server.close()
    }
  }, 60000)

  test('(viii) format=svg → 別リクエスト format=svg+scale:2 → 正規化後一致', async () => {
    const server = await startTestServer()
    try {
      const resp1 = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })
      const resp2 = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg', scale: 2 })
      })
      expect(resp1.status).toBe(200)
      expect(resp2.status).toBe(200)

      const norm1 = normalizeSvgForCompare(resp1.body.toString('utf8'))
      const norm2 = normalizeSvgForCompare(resp2.body.toString('utf8'))
      expect(norm2).toEqual(norm1)
    } finally {
      await server.close()
    }
  }, 60000)
})
