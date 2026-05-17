import { describe, expect, test } from 'vitest'

import {
  applyPostProcess,
  forceForeignObjectInnerCentered
} from '../../src/renderer/postProcess.js'

const XHTML = 'xmlns="http://www.w3.org/1999/xhtml"'
const FLEX_WRAPPER = `<div ${XHTML} style="display:flex;justify-content:center;align-items:center;width:100%;height:100%">`

describe('forceForeignObjectInnerCentered', () => {
  test('1: wraps table-cell div with flex wrapper', () => {
    const svg = `<foreignObject><div ${XHTML} style="display: table-cell">text</div></foreignObject>`
    const result = forceForeignObjectInnerCentered(svg)
    expect(result).toContain(FLEX_WRAPPER)
    expect(result).toContain(`style="display: table-cell"`)
  })

  test('2: preserves inner div attributes verbatim', () => {
    const inner = `<div ${XHTML} style="display: table-cell; white-space: nowrap; line-height: 1.5" class="labelBkg"><span class="nodeLabel"><p>hello</p></span></div>`
    const svg = `<foreignObject>${inner}</foreignObject>`
    const result = forceForeignObjectInnerCentered(svg)
    expect(result).toContain(inner)
    expect(result).toContain(FLEX_WRAPPER)
    expect(result).toContain('</div></foreignObject>')
  })

  test('3: does not modify foreignObject without table-cell div', () => {
    const svg = `<foreignObject><div ${XHTML} style="display: block">text</div></foreignObject>`
    expect(forceForeignObjectInnerCentered(svg)).toBe(svg)
  })

  test('4: does not modify foreignObject without inner div', () => {
    const svg = '<foreignObject></foreignObject>'
    expect(forceForeignObjectInnerCentered(svg)).toBe(svg)
  })

  test('5: idempotent (double apply yields same result)', () => {
    const svg = `<foreignObject><div ${XHTML} style="display: table-cell">text</div></foreignObject>`
    const once = forceForeignObjectInnerCentered(svg)
    const twice = forceForeignObjectInnerCentered(once)
    expect(twice).toBe(once)
  })

  test('6: does not double-wrap (re-application is no-op)', () => {
    const svg = `<foreignObject>${FLEX_WRAPPER}<div ${XHTML} style="display: table-cell">text</div></div></foreignObject>`
    const result = forceForeignObjectInnerCentered(svg)
    const flexCount = (result.match(/display:flex/g) || []).length
    expect(flexCount).toBe(1)
  })

  test('7: processes multiple foreignObjects independently', () => {
    const foTableCell = `<foreignObject><div ${XHTML} style="display: table-cell">A</div></foreignObject>`
    const foBlock = `<foreignObject><div ${XHTML} style="display: block">B</div></foreignObject>`
    const svg = `<svg>${foTableCell}${foBlock}${foTableCell}</svg>`
    const result = forceForeignObjectInnerCentered(svg)
    const flexCount = (result.match(/display:flex/g) || []).length
    expect(flexCount).toBe(2)
    expect(result).toContain(`display: block`)
  })

  test('8: case-insensitive for foreignObject tag', () => {
    const svg = `<FOREIGNOBJECT><div ${XHTML} style="display: table-cell">text</div></FOREIGNOBJECT>`
    const result = forceForeignObjectInnerCentered(svg)
    expect(result).toContain(FLEX_WRAPPER)
  })

  test('9: empty string unchanged', () => {
    expect(forceForeignObjectInnerCentered('')).toBe('')
  })

  test('10: preserves CJK / emoji content in inner text', () => {
    const svg = `<foreignObject><div ${XHTML} style="display: table-cell"><span>集める ✓</span></div></foreignObject>`
    const result = forceForeignObjectInnerCentered(svg)
    expect(result).toContain('集める ✓')
    expect(result).toContain(FLEX_WRAPPER)
  })

  test('11: 0x0 foreignObject still wrapped (no error)', () => {
    const svg = `<foreignObject width="0" height="0"><div ${XHTML} style="display: table-cell"></div></foreignObject>`
    const result = forceForeignObjectInnerCentered(svg)
    expect(result).toContain(FLEX_WRAPPER)
  })

  test('12: (applyPostProcess) F-2 runs for format=svg', () => {
    const svg = `<svg><foreignObject><div ${XHTML} style="display: table-cell">text</div></foreignObject></svg>`
    const result = applyPostProcess({ data: Buffer.from(svg, 'utf8'), format: 'svg' })
    expect(result.data.toString('utf8')).toContain('display:flex')
  })

  test('13: (applyPostProcess) F-2 does NOT run for format=png (AC-4)', () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const result = applyPostProcess({ data: pngBytes, format: 'png' })
    expect(Buffer.compare(result.data, pngBytes)).toBe(0)
  })

  test('14: (applyPostProcess) F-1 + F-2 combined, F-1 runs first', () => {
    const svg = `<svg><foreignObject><div ${XHTML} style="display: table-cell">text</div></foreignObject></svg>`
    const result = applyPostProcess({ data: Buffer.from(svg, 'utf8'), format: 'svg' })
    const out = result.data.toString('utf8')
    expect(out).toContain('overflow:visible')
    expect(out).toContain('display:flex')
  })
})
