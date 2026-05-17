/**
 * PROP-21: scale: n を format=svg で送ったとき、レスポンス SVG が scale 未指定時と同一になる
 * (svg root id を正規化した上でバイト一致)
 * Validates: REQ-U-11 AC-11 INV-4
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { httpRequest } from '../helpers/http.js'
import { startTestServer } from '../helpers/server.js'
import { normalizeSvgForCompare } from '../helpers/svgCompare.js'

const SAMPLE_DIAGRAMS = [
  'flowchart LR\n  A-->B',
  'flowchart TD\n  A["開始"] --> B{"判定"}\n  B -->|Yes| C["完了"]\n  B -->|No| D["再試行"]',
  'flowchart LR\n  A-->B-->C-->D-->E'
]

describe('PROP-21: SVG content is identical regardless of scale value (after svg root id normalization)', () => {
  test('SVG with scale equals SVG without scale after id normalization', async () => {
    const server = await startTestServer()
    try {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }),
          fc.constantFrom(...SAMPLE_DIAGRAMS),
          async (scale, diagram) => {
            const respNoScale = await httpRequest(`${server.baseUrl}/render`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: diagram, format: 'svg' })
            })
            expect(respNoScale.status).toBe(200)

            const respWithScale = await httpRequest(`${server.baseUrl}/render`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: diagram, format: 'svg', scale })
            })
            expect(respWithScale.status).toBe(200)

            const normNoScale = normalizeSvgForCompare(respNoScale.body.toString('utf8'))
            const normWithScale = normalizeSvgForCompare(respWithScale.body.toString('utf8'))
            expect(normWithScale).toEqual(normNoScale)
          }
        ),
        { numRuns: 3 }
      )
    } finally {
      await server.close()
    }
  }, 60000)
})
