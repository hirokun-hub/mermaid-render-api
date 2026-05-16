/**
 * Validates: REQ-U-09 / C-H-03 (revised) / US-02
 * PROP-18: All <foreignObject> elements in format=svg responses have overflow:visible
 *          in their style attribute. Idempotent. Does NOT apply to format=png.
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  applyPostProcess,
  forceForeignObjectOverflowVisible
} from '../../src/renderer/postProcess.js'

function styleDeclaresProperty(styleAttr: string, prop: string): boolean {
  return styleAttr.split(';').some((decl) => {
    const colonIdx = decl.indexOf(':')
    if (colonIdx === -1) return false
    return decl.slice(0, colonIdx).trim().toLowerCase() === prop
  })
}

function getForeignObjectStyles(svg: string): string[] {
  return [...svg.matchAll(/<foreignObject\b([^>]*)>/gi)].map((m) => {
    const attrs = m[1] ?? ''
    const sm = /(^|\s)style=(["'])([\s\S]*?)\2/i.exec(attrs)
    return sm ? sm[3] : ''
  })
}

describe('PROP-18: forceForeignObjectOverflowVisible unit property (Validates: REQ-U-09 / C-H-03 / US-02)', () => {
  test('all foreignObjects without existing overflow get overflow:visible', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            hasStyle: fc.boolean(),
            hasOverflow: fc.boolean(),
            styleValue: fc.constantFrom('color:red', 'font-size:12px', 'fill:blue', 'text-overflow:ellipsis')
          }),
          { minLength: 0, maxLength: 5 }
        ),
        (elements) => {
          const fos = elements.map(({ hasStyle, hasOverflow, styleValue }) => {
            if (!hasStyle) return '<foreignObject width="100">'
            if (hasOverflow) return `<foreignObject style="${styleValue};overflow:hidden">`
            return `<foreignObject style="${styleValue}">`
          })
          const svg = `<svg>${fos.join('')}</svg>`
          const result = forceForeignObjectOverflowVisible(svg)
          const styles = getForeignObjectStyles(result)

          for (let i = 0; i < elements.length; i++) {
            const styleVal = styles[i] ?? ''
            const el = elements[i]!
            if (el.hasStyle && el.hasOverflow) {
              expect(styleDeclaresProperty(styleVal, 'overflow')).toBe(true)
              expect(styleVal).not.toContain('overflow:visible')
            } else {
              expect(styleDeclaresProperty(styleVal, 'overflow')).toBe(true)
              expect(styleVal).toContain('overflow:visible')
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  test('application is idempotent: applying twice equals applying once', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            hasStyle: fc.boolean(),
            styleValue: fc.constantFrom('color:red', 'font-size:12px', 'text-overflow:ellipsis')
          }),
          { minLength: 0, maxLength: 5 }
        ),
        (elements) => {
          const fos = elements.map(({ hasStyle, styleValue }) =>
            hasStyle
              ? `<foreignObject style="${styleValue}">`
              : '<foreignObject width="100">'
          )
          const svg = `<svg>${fos.join('')}</svg>`
          const once = forceForeignObjectOverflowVisible(svg)
          const twice = forceForeignObjectOverflowVisible(once)
          expect(twice).toBe(once)
        }
      ),
      { numRuns: 200 }
    )
  })

  test('non-foreignObject elements are never modified', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '<svg><rect width="100"></rect></svg>',
          '<svg><text>hello</text></svg>',
          '<svg><g style="color:red"></g></svg>',
          '<svg></svg>'
        ),
        (svg) => {
          const result = forceForeignObjectOverflowVisible(svg)
          expect(result).toBe(svg)
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe('PROP-18: applyPostProcess format boundary (format=svg vs format=png) (Validates: REQ-U-09 / C-H-03 / US-02)', () => {
  test('format=svg: all foreignObjects get overflow:visible via applyPostProcess', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            hasStyle: fc.boolean(),
            styleValue: fc.constantFrom('color:red', 'text-overflow:clip', 'fill:blue')
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (elements) => {
          const fos = elements.map(({ hasStyle, styleValue }) =>
            hasStyle
              ? `<foreignObject style="${styleValue}">`
              : '<foreignObject width="100">'
          )
          const svg = `<svg>${fos.join('')}</svg>`
          const result = applyPostProcess({
            data: Buffer.from(svg, 'utf8'),
            format: 'svg'
          })
          const resultSvg = result.data.toString('utf8')
          const styles = getForeignObjectStyles(resultSvg)
          for (const styleVal of styles) {
            expect(styleDeclaresProperty(styleVal, 'overflow')).toBe(true)
            expect(styleVal).toContain('overflow:visible')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('format=png: applyPostProcess returns data unchanged', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 4, maxLength: 64 }),
        (bytes) => {
          const buf = Buffer.from(bytes)
          const result = applyPostProcess({ data: buf, format: 'png' })
          expect(result.data).toEqual(buf)
        }
      ),
      { numRuns: 100 }
    )
  })
})
