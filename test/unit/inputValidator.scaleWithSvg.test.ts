import { describe, expect, test } from 'vitest'

import { validateRenderRequest } from '../../src/validation/inputValidator.js'
import { WarningCode } from '../../src/utils/warnings.js'

const validCode = 'graph TD\nA-->B'

describe('scale + format=svg interaction (REQ-U-11 AC-11)', () => {
  test('svg + scale 未指定 → valid, scale_ignored_for_svg warning なし', () => {
    const result = validateRenderRequest({ code: validCode, format: 'svg' })
    expect(result.valid).toBe(true)
    const codes = result.warnings.map((w) => w.code)
    expect(codes).not.toContain(WarningCode.ScaleIgnoredForSvg)
  })

  test('svg + scale: 2 → valid, scale_ignored_for_svg warning あり', () => {
    const result = validateRenderRequest({ code: validCode, format: 'svg', scale: 2 })
    expect(result.valid).toBe(true)
    const codes = result.warnings.map((w) => w.code)
    expect(codes).toContain(WarningCode.ScaleIgnoredForSvg)
  })

  test('png + scale: 2 → valid, scale_ignored_for_svg warning なし', () => {
    const result = validateRenderRequest({ code: validCode, format: 'png', scale: 2 })
    expect(result.valid).toBe(true)
    const codes = result.warnings.map((w) => w.code)
    expect(codes).not.toContain(WarningCode.ScaleIgnoredForSvg)
  })

  test('svg + 不正 scale ("x") → 400 type_mismatch (scale validation が先に弾く)', () => {
    const result = validateRenderRequest({ code: validCode, format: 'svg', scale: 'x' })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })
})
