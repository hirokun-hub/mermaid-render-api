/**
 * E5-5: SVG structural safety and diagram regression tests after Phase 4.5 dependency update.
 * Validates: REQ-D-07, REQ-D-08
 */
import { describe, expect, test } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'

const SVG_SAFETY_PATTERNS = {
  scriptTag: /<script[\s>]/i,
  onEventAttr: /\s+on\w+=/i,
  javascriptUri: /javascript:/i,
  externalHttpSrc: /\s+(?:src|href|xlink:href)=["'][^"']*https?:/i,
  externalFileSrc: /\s+(?:src|href|xlink:href)=["'][^"']*file:/i,
  cssUrlHttp: /url\(\s*["']?https?:/i,
  cssUrlFile: /url\(\s*["']?file:/i,
}

async function renderSvg(baseUrl: string, code: string): Promise<string> {
  const response = await httpRequest(`${baseUrl}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, format: 'svg' })
  })
  expect(response.status).toBe(200)
  return response.body.toString('utf8')
}

function assertSvgStructuralSafety(svg: string): void {
  expect(svg, 'must not contain <script> tag').not.toMatch(SVG_SAFETY_PATTERNS.scriptTag)
  expect(svg, 'must not contain on*= event attributes').not.toMatch(SVG_SAFETY_PATTERNS.onEventAttr)
  expect(svg, 'must not contain javascript: URI').not.toMatch(SVG_SAFETY_PATTERNS.javascriptUri)
  expect(svg, 'must not contain external http src/href/xlink:href').not.toMatch(SVG_SAFETY_PATTERNS.externalHttpSrc)
  expect(svg, 'must not contain external file src/href/xlink:href').not.toMatch(SVG_SAFETY_PATTERNS.externalFileSrc)
  expect(svg, 'must not contain CSS url() with http').not.toMatch(SVG_SAFETY_PATTERNS.cssUrlHttp)
  expect(svg, 'must not contain CSS url() with file').not.toMatch(SVG_SAFETY_PATTERNS.cssUrlFile)
}

const DIAGRAM_CASES = [
  {
    type: 'flowchart',
    code: 'graph TD\nA["Start"]-->B["End"]'
  },
  {
    type: 'sequence',
    code: 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi'
  },
  {
    type: 'class',
    code: 'classDiagram\n  class Animal{\n    +String name\n    +speak()\n  }'
  },
  {
    type: 'state',
    code: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Active : start\n  Active --> [*] : stop'
  },
  {
    type: 'gantt',
    code: 'gantt\n  title Project Plan\n  dateFormat YYYY-MM-DD\n  section Phase 1\n  Task A : 2024-01-01, 5d'
  },
  {
    type: 'er',
    code: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains'
  },
  {
    type: 'pie',
    code: 'pie\n  title Distribution\n  "A" : 40\n  "B" : 35\n  "C" : 25'
  },
  {
    type: 'mindmap',
    code: 'mindmap\n  root\n    Topic A\n      Sub A1\n    Topic B'
  },
]

describe('REQ-D-07: SVG structural safety after dependency update', () => {
  test('flowchart SVG has no script/on*/javascript:/external-ref', async () => {
    const server = await startTestServer()
    try {
      const svg = await renderSvg(server.baseUrl, DIAGRAM_CASES[0].code)
      assertSvgStructuralSafety(svg)
    } finally {
      await server.close()
    }
  })

  test('sequence SVG has no script/on*/javascript:/external-ref', async () => {
    const server = await startTestServer()
    try {
      const svg = await renderSvg(server.baseUrl, DIAGRAM_CASES[1].code)
      assertSvgStructuralSafety(svg)
    } finally {
      await server.close()
    }
  })
})

describe('REQ-D-08: SVG diagram regression - major diagram types', () => {
  for (const { type, code } of DIAGRAM_CASES) {
    test(`${type} diagram renders as SVG successfully`, async () => {
      const server = await startTestServer()
      try {
        const response = await httpRequest(`${server.baseUrl}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, format: 'svg' })
        })

        expect(response.status, `${type} SVG status`).toBe(200)
        expect(response.headers['content-type']).toContain('image/svg+xml')
        const svg = response.body.toString('utf8')
        expect(svg, `${type} SVG must contain <svg`).toContain('<svg')
        assertSvgStructuralSafety(svg)
      } finally {
        await server.close()
      }
    })
  }
})

describe('REQ-D-08: PNG rendering smoke after dependency update', () => {
  test('flowchart renders as PNG successfully', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: DIAGRAM_CASES[0].code, format: 'png' })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/png')
      expect(response.body.length).toBeGreaterThan(0)
    } finally {
      await server.close()
    }
  })

  test('sequence diagram renders as PNG successfully', async () => {
    const server = await startTestServer()
    try {
      const response = await httpRequest(`${server.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: DIAGRAM_CASES[1].code, format: 'png' })
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('image/png')
      expect(response.body.length).toBeGreaterThan(0)
    } finally {
      await server.close()
    }
  })
})
