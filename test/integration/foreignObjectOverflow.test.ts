import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

describe('H-3: foreignObject overflow:visible injection (REQ-U-09 / PROP-18)', () => {
  test('Case 10: CJK + ASCII mixed label SVG has overflow:visible on all foreignObjects', async () => {
    const server = await startTestServer()
    try {
      const code =
        'flowchart TD\n' +
        '  A["集める ✓<br>(PrimeDrive 自動)"] --> B["整理する<br>(手動 + ✓)"]'

      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, format: 'svg' })
      })

      expect(response.status).toBe(200)
      const svg = response.body.toString('utf8')

      const foreignObjects = [...svg.matchAll(/<foreignObject\b([^>]*)>/gi)]
      expect(foreignObjects.length).toBeGreaterThan(0)

      for (const fo of foreignObjects) {
        const tag = fo[0]!
        expect(tag).toMatch(/style="[^"]*overflow:visible[^"]*"/i)
      }
    } finally {
      await server.close()
    }
  })

  test('pure ASCII label SVG also has overflow:visible on all foreignObjects', async () => {
    const server = await startTestServer()
    try {
      const code = 'flowchart TD\n  A["(test + ok)"] --> B["done"]'

      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, format: 'svg' })
      })

      expect(response.status).toBe(200)
      const svg = response.body.toString('utf8')

      const foreignObjects = [...svg.matchAll(/<foreignObject\b([^>]*)>/gi)]
      expect(foreignObjects.length).toBeGreaterThan(0)

      for (const fo of foreignObjects) {
        const tag = fo[0]!
        expect(tag).toMatch(/style="[^"]*overflow:visible[^"]*"/i)
      }
    } finally {
      await server.close()
    }
  })

  test('PNG format does NOT have SVG foreignObject injection', async () => {
    const server = await startTestServer()
    try {
      const code = 'flowchart TD\n  A --> B'

      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, format: 'png' })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/png')
      const body = response.body
      expect(body.slice(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    } finally {
      await server.close()
    }
  })

  test('simple flowchart SVG: all foreignObjects have overflow:visible', async () => {
    const server = await startTestServer()
    try {
      const code = 'flowchart LR\n  A["Node A"] --> B["Node B"] --> C["Node C"]'

      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, format: 'svg' })
      })

      expect(response.status).toBe(200)
      const svg = response.body.toString('utf8')

      const foreignObjects = [...svg.matchAll(/<foreignObject\b([^>]*)>/gi)]
      expect(foreignObjects.length).toBeGreaterThan(0)

      for (const fo of foreignObjects) {
        const tag = fo[0]!
        expect(tag).toMatch(/style="[^"]*overflow:visible[^"]*"/i)
      }
    } finally {
      await server.close()
    }
  })
})
