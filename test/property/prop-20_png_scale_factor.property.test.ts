/**
 * PROP-20: scale: n を format=png で送ったとき、PNG の幅が Math.ceil(svgViewBoxWidth * n) ± 4 に収まる
 * (±4px: useMaxWidth=true による CSS fractional-px 丸め誤差を加味した実測値に基づく許容範囲)
 * Validates: REQ-U-11 AC-5,7,8
 */
import { describe, test } from 'vitest'
import fc from 'fast-check'
import { expect } from 'vitest'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { parseSvgViewBoxWidth, readPngWidth } from '../helpers/svgCompare.js'

const SAMPLE_DIAGRAMS = [
  'flowchart LR\n  A-->B',
  'flowchart TD\n  A["開始"] --> B{"判定"}\n  B -->|Yes| C["完了"]\n  B -->|No| D["再試行"]',
  'flowchart LR\n  A["Hello World"] --> B["Foo"]\n  B --> C["Bar"]\n  C --> D["Baz"]\n  D --> E["End"]',
  'flowchart TD\n  A-->B-->C-->D-->E',
  'flowchart LR\n  A["Long text node label here"] --> B["Another long label"]\n  B --> C["Short"]'
]

describe('PROP-20: PNG width = svgViewBoxWidth * scale (±4)', () => {
  test('PNG width matches scale factor for all sample diagrams', async () => {
    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }),
          fc.constantFrom(...SAMPLE_DIAGRAMS),
          async (scale, diagram) => {
            const svgResp = await httpRequest(`${server.baseUrl}/render`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: diagram, format: 'svg' })
            })
            expect(svgResp.status).toBe(200)
            const svgWidth = parseSvgViewBoxWidth(svgResp.body.toString('utf8'))

            const pngResp = await httpRequest(`${server.baseUrl}/render`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: diagram, format: 'png', scale })
            })
            expect(pngResp.status).toBe(200)
            const pngWidth = readPngWidth(pngResp.body)

            const expected = Math.ceil(svgWidth * scale)
            expect(Math.abs(pngWidth - expected)).toBeLessThanOrEqual(4)
          }
        ),
        { numRuns: 5 }
      )
    } finally {
      await server.close()
    }
  }, 60000)
})
