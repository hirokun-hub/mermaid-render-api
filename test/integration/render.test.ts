import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

const validCode = 'graph TD\nA-->B'

describe('POST /render', () => {
  test('returns SVG when format is svg', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'svg' })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/svg+xml')
      expect(response.headers['x-request-id']).toBeDefined()
      expect(response.body.toString('utf8')).toContain('<svg')
    } finally {
      await server.close()
    }
  })

  test('returns PNG when format is png', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'png' })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/png')
      expect(response.headers['x-request-id']).toBeDefined()
      expect(response.body.length).toBeGreaterThan(0)
    } finally {
      await server.close()
    }
  })

  test('defaults format to svg when omitted', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/svg+xml')
    } finally {
      await server.close()
    }
  })

  test('rejects empty code with 400', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '', format: 'svg' })
      })

      expect(response.status).toBe(400)
      expect(response.headers['content-type']).toContain('application/json')
      const payload = JSON.parse(response.body.toString('utf8')) as {
        error_type: string
        stderr: string
      }
      expect(payload.error_type).toBe('invalid_request')
      expect(payload.stderr).toBe('')
    } finally {
      await server.close()
    }
  })

  test('rejects invalid format with 400', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: validCode, format: 'gif' })
      })

      expect(response.status).toBe(400)
      const payload = JSON.parse(response.body.toString('utf8')) as {
        error_type: string
        format: string
      }
      expect(payload.error_type).toBe('invalid_request')
      expect(payload.format).toBe('gif')
    } finally {
      await server.close()
    }
  })
})
