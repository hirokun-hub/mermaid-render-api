/**
 * Validates: REQ-U-10
 * PROP-19: forceForeignObjectInnerCentered is idempotent; table-cell-less foreignObjects
 *          are unchanged; foreignObject count is preserved; nested-div foreignObjects are no-op.
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { forceForeignObjectInnerCentered } from '../../src/renderer/postProcess.js'

const XHTML = 'xmlns="http://www.w3.org/1999/xhtml"'

const arbInnerText = fc.constantFrom('text', 'hello', '✓ ✓', '集める', '<span><p>A</p></span>')

const arbTableCellFo = arbInnerText.map(
  (t) =>
    `<foreignObject width="100" height="48"><div ${XHTML} style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;">${t}</div></foreignObject>`
)

const arbNonTableCellFo = fc
  .constantFrom('block', 'inline', 'flex')
  .chain((display) =>
    arbInnerText.map(
      (t) => `<foreignObject><div ${XHTML} style="display: ${display}">${t}</div></foreignObject>`
    )
  )

const arbEmptyFo = fc.constant('<foreignObject></foreignObject>')

const arbForeignObjectSvg = fc
  .array(fc.oneof(arbTableCellFo, arbNonTableCellFo, arbEmptyFo), {
    minLength: 1,
    maxLength: 5
  })
  .map((fos) => `<svg>${fos.join('')}</svg>`)

const arbSvgString = fc.oneof(
  arbForeignObjectSvg,
  fc.constant('<svg><rect width="100"></rect></svg>'),
  fc.constant('<svg></svg>'),
  fc.constant('')
)

const arbNestedDivForeignObjectSvg = arbInnerText.map(
  (t) =>
    `<svg><foreignObject><div ${XHTML} style="display: table-cell"><div>NESTED: ${t}</div></div></foreignObject></svg>`
)

describe('PROP-19: forceForeignObjectInnerCentered unit property (Validates: REQ-U-10)', () => {
  test('P-1: idempotency — applying twice equals applying once', () => {
    fc.assert(
      fc.property(arbForeignObjectSvg, (svg) => {
        const once = forceForeignObjectInnerCentered(svg)
        const twice = forceForeignObjectInnerCentered(once)
        expect(twice).toBe(once)
      }),
      { numRuns: 200 }
    )
  })

  test('P-2: table-cell absent => no change', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(arbNonTableCellFo, arbEmptyFo), { minLength: 1, maxLength: 5 }).map(
          (fos) => `<svg>${fos.join('')}</svg>`
        ),
        (svg) => {
          expect(forceForeignObjectInnerCentered(svg)).toBe(svg)
        }
      ),
      { numRuns: 200 }
    )
  })

  test('P-3: foreignObject count preserved (structural safety)', () => {
    fc.assert(
      fc.property(arbSvgString, (svg) => {
        const result = forceForeignObjectInnerCentered(svg)
        const beforeOpen = (svg.match(/<foreignObject\b/gi) || []).length
        const afterOpen = (result.match(/<foreignObject\b/gi) || []).length
        const beforeClose = (svg.match(/<\/foreignObject>/gi) || []).length
        const afterClose = (result.match(/<\/foreignObject>/gi) || []).length
        expect(afterOpen).toBe(beforeOpen)
        expect(afterClose).toBe(beforeClose)
      }),
      { numRuns: 200 }
    )
  })

  test('P-4: nested-div foreignObject is no-op (fallback (a), fixed expectation)', () => {
    fc.assert(
      fc.property(arbNestedDivForeignObjectSvg, (svg) => {
        const result = forceForeignObjectInnerCentered(svg)
        expect(result).toBe(svg)
      }),
      { numRuns: 100 }
    )
  })
})
