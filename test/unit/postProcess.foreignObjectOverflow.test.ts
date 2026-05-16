import { describe, expect, test } from 'vitest'

import {
  applyPostProcess,
  forceForeignObjectOverflowVisible
} from '../../src/renderer/postProcess.js'

describe('forceForeignObjectOverflowVisible', () => {
  test('adds style="overflow:visible" when no style attribute exists', () => {
    const svg = '<svg><foreignObject width="100" height="50"></foreignObject></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toBe(
      '<svg><foreignObject style="overflow:visible" width="100" height="50"></foreignObject></svg>'
    )
  })

  test('appends ;overflow:visible when style exists without overflow', () => {
    const svg = '<svg><foreignObject style="color:black" width="100" height="50"></foreignObject></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toContain('style="color:black;overflow:visible"')
    expect(result).toContain('width="100"')
  })

  test('does not change style when overflow declaration already present', () => {
    const svg = '<svg><foreignObject style="overflow:hidden" width="100"></foreignObject></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toBe(svg)
  })

  test('does not change when overflow:visible already present (idempotent)', () => {
    const svg = '<svg><foreignObject style="overflow:visible" width="100"></foreignObject></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toBe(svg)
  })

  test('double application yields same result (idempotent)', () => {
    const svg = '<svg><foreignObject width="100" height="50"></foreignObject></svg>'
    const once = forceForeignObjectOverflowVisible(svg)
    const twice = forceForeignObjectOverflowVisible(once)
    expect(twice).toBe(once)
  })

  test('double application with existing style also idempotent', () => {
    const svg = '<svg><foreignObject style="color:red" width="100"></foreignObject></svg>'
    const once = forceForeignObjectOverflowVisible(svg)
    const twice = forceForeignObjectOverflowVisible(once)
    expect(twice).toBe(once)
  })

  test('processes multiple foreignObject elements', () => {
    const svg =
      '<svg>' +
      '<foreignObject width="100"></foreignObject>' +
      '<foreignObject style="color:blue" width="200"></foreignObject>' +
      '<foreignObject style="overflow:hidden" width="300"></foreignObject>' +
      '</svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    const foMatches = [...result.matchAll(/<foreignObject[^>]*>/gi)]
    expect(foMatches).toHaveLength(3)
    expect(foMatches[0]![0]).toContain('style="overflow:visible"')
    expect(foMatches[1]![0]).toContain('style="color:blue;overflow:visible"')
    expect(foMatches[2]![0]).toContain('style="overflow:hidden"')
    expect(foMatches[2]![0]).not.toContain('overflow:visible')
  })

  test('is case-insensitive for foreignObject tag name', () => {
    const svg = '<svg><FOREIGNOBJECT width="100"></FOREIGNOBJECT></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toContain('overflow:visible')
  })

  test('does not modify non-foreignObject elements', () => {
    const svg = '<svg><rect width="100"></rect><text>hello</text></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toBe(svg)
  })

  test('returns empty string unchanged', () => {
    expect(forceForeignObjectOverflowVisible('')).toBe('')
  })

  test('text-overflow:ellipsis does NOT block overflow:visible injection (P1-A fix)', () => {
    const svg = '<svg><foreignObject style="text-overflow:ellipsis" width="100"></foreignObject></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toContain('text-overflow:ellipsis')
    expect(result).toContain(';overflow:visible')
  })

  test('data-style attribute does not interfere: adds separate style attribute (P1-B fix)', () => {
    const svg = '<svg><foreignObject data-style="color:red" width="100"></foreignObject></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toContain('style="overflow:visible"')
    expect(result).toContain('data-style="color:red"')
    expect(result).not.toContain('data-style="color:red;overflow:visible"')
    expect(result).not.toContain('data-style="overflow:visible"')
  })

  test('overflow:visible in data-style does not block injection on real style (P1-B fix)', () => {
    const svg = '<svg><foreignObject data-style="overflow:visible" width="100"></foreignObject></svg>'
    const result = forceForeignObjectOverflowVisible(svg)
    expect(result).toContain(' style="overflow:visible"')
    expect(result).toContain('data-style="overflow:visible"')
  })
})

describe('applyPostProcess: foreignObject overflow injection', () => {
  test('applies forceForeignObjectOverflowVisible for format=svg', () => {
    const svg = '<svg><foreignObject width="100" height="50"></foreignObject></svg>'
    const result = applyPostProcess({
      data: Buffer.from(svg, 'utf8'),
      format: 'svg'
    })
    expect(result.data.toString('utf8')).toContain('overflow:visible')
  })

  test('does NOT apply for format=png', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const result = applyPostProcess({
      data: pngBuffer,
      format: 'png'
    })
    expect(result.data).toEqual(pngBuffer)
  })
})
