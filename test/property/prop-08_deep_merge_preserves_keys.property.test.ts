/**
 * Validates: REQ-E-01
 * PROP-8: mermaid_config.flowchart.diagramPadding = 16 → 他 flowchart.* が消えない
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { safeDeepMerge } from '../../src/utils/safeDeepMerge.js'

describe('PROP-8: safeDeepMerge preserves sibling keys when one key is overridden (Validates: REQ-E-01)', () => {
  test('overriding diagramPadding preserves nodeSpacing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (diagramPadding) => {
          const base = {
            flowchart: {
              diagramPadding: 0,
              nodeSpacing: 30,
              rankSpacing: 40
            }
          }
          const override = {
            flowchart: { diagramPadding }
          }
          const result = safeDeepMerge(base, override)
          expect(result.flowchart?.diagramPadding).toBe(diagramPadding)
          expect(result.flowchart?.nodeSpacing).toBe(30)
          expect(result.flowchart?.rankSpacing).toBe(40)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('single-key override in nested object preserves all other keys', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('diagramPadding', 'nodeSpacing', 'rankSpacing'),
        fc.integer({ min: 1, max: 200 }),
        (overrideKey, value) => {
          const base = {
            flowchart: {
              diagramPadding: 10,
              nodeSpacing: 30,
              rankSpacing: 40,
              curve: 'basis'
            }
          }
          const override = {
            flowchart: { [overrideKey]: value }
          }
          const result = safeDeepMerge(base, override)
          expect(result.flowchart?.[overrideKey as keyof typeof result.flowchart]).toBe(value)
          expect(result.flowchart?.curve).toBe('basis')
          const otherKeys = ['diagramPadding', 'nodeSpacing', 'rankSpacing'].filter(
            (k) => k !== overrideKey
          )
          for (const key of otherKeys) {
            expect(result.flowchart?.[key as keyof typeof result.flowchart]).toBeDefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
