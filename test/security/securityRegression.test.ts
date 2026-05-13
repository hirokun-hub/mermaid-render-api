/**
 * E5-4: Security regression tests after Phase 4.5 dependency update.
 * Validates: REQ-D-04, REQ-D-05, REQ-D-06
 */
import { afterEach, describe, expect, test, vi } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { logger } from '../../src/utils/logger.js'

const SIMPLE_FLOWCHART = 'graph TD\nA-->B'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('REQ-D-04: server locked settings ignored after dependency update', () => {
  test.each([
    ['securityLevel', 'loose'],
    ['maxTextSize', 1000],
    ['maxEdges', 10],
    ['startOnLoad', true],
  ] as const)('ignores mermaid_config.%s override and emits locked_setting_override_ignored', async (key, value) => {
    const logSpy = vi.spyOn(logger, 'info')
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: SIMPLE_FLOWCHART,
          format: 'svg',
          mermaid_config: { [key]: value }
        })
      })

      expect(response.status).toBe(200)
      expect(response.body.toString('utf8')).toContain('<svg')
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          warnings: expect.arrayContaining(['locked_setting_override_ignored'])
        })
      )
    } finally {
      await server.close()
    }
  })
})

describe('REQ-D-05: prototype pollution prevention after dependency update', () => {
  test('__proto__ payload via mermaid_config does not pollute Object.prototype', async () => {
    const pollutionKey = `__security_test_${Date.now()}`
    const logSpy = vi.spyOn(logger, 'info')
    const server = await startTestServer()
    try {
      // JS object literal `{ __proto__: ... }` sets the prototype and is omitted by JSON.stringify.
      // Send raw JSON so `__proto__` arrives as an own string key (JSON.parse uses [[DefineOwnProperty]]).
      const rawBody = `{"code":${JSON.stringify(SIMPLE_FLOWCHART)},"format":"svg","mermaid_config":{"__proto__":{"${pollutionKey}":true}}}`
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody
      })

      expect(response.status).toBe(200)
      expect((Object.prototype as Record<string, unknown>)[pollutionKey]).toBeUndefined()
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          warnings: expect.arrayContaining(['prototype_pollution_attempt'])
        })
      )
    } finally {
      await server.close()
    }
  })

  test('constructor.prototype payload via post_process does not pollute Object.prototype', async () => {
    const pollutionKey = `__security_test_${Date.now()}`
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: SIMPLE_FLOWCHART,
          format: 'svg',
          post_process: { constructor: { prototype: { [pollutionKey]: true } } }
        })
      })

      expect([200, 400, 500]).toContain(response.status)
      expect((Object.prototype as Record<string, unknown>)[pollutionKey]).toBeUndefined()
    } finally {
      await server.close()
    }
  })

  test('prototype payload via mermaid_config does not pollute Object.prototype', async () => {
    const pollutionKey = `__security_test_${Date.now()}`
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: SIMPLE_FLOWCHART,
          format: 'svg',
          mermaid_config: { prototype: { [pollutionKey]: true } }
        })
      })

      expect([200, 400, 500]).toContain(response.status)
      expect((Object.prototype as Record<string, unknown>)[pollutionKey]).toBeUndefined()
    } finally {
      await server.close()
    }
  })
})

describe('REQ-D-06: rendering sandbox - SVG output contains no external script sources', () => {
  test('flowchart with click link renders without external script injection', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'graph TD\nA["Node A"]-->B["Node B"]\nclick A "https://example.com/external"',
          format: 'svg'
        })
      })

      expect(response.status).toBe(200)
      const svg = response.body.toString('utf8')
      expect(svg).toContain('<svg')
      expect(svg).not.toMatch(/<script[^>]*src=["'][^"']*https?:/i)
    } finally {
      await server.close()
    }
  })
})

describe('REQ-D-04 (syntax error): parse error returns JSON without Syntax error SVG after dep update', () => {
  test('invalid Mermaid syntax returns parse_error JSON (not Syntax error SVG)', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'graph TD\nA-->', format: 'svg' })
      })

      expect(response.status).toBe(400)
      const body = response.body.toString('utf8')
      expect(body).not.toContain('Syntax error')
      const payload = JSON.parse(body) as { error_type: string }
      expect(payload.error_type).toBe('parse_error')
    } finally {
      await server.close()
    }
  })
})
