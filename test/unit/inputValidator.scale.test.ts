import { describe, expect, test } from 'vitest'

import { validateRenderRequest } from '../../src/validation/inputValidator.js'

const validCode = 'graph TD\nA-->B'

describe('scale validation (REQ-U-11 AC-6,9,10)', () => {
  test('未指定 → scale=3 (サーバ既定)', () => {
    const result = validateRenderRequest({ code: validCode })
    expect(result.valid).toBe(true)
    expect(result.scale).toBe(3)
  })

  test('scale: 1 (下限) → valid', () => {
    const result = validateRenderRequest({ code: validCode, scale: 1 })
    expect(result.valid).toBe(true)
    expect(result.scale).toBe(1)
  })

  test('scale: 4 (上限) → valid', () => {
    const result = validateRenderRequest({ code: validCode, scale: 4 })
    expect(result.valid).toBe(true)
    expect(result.scale).toBe(4)
  })

  test('scale: 2 → valid', () => {
    const result = validateRenderRequest({ code: validCode, scale: 2 })
    expect(result.valid).toBe(true)
    expect(result.scale).toBe(2)
  })

  test('scale: 0 (下限割れ) → 400 out_of_range', () => {
    const result = validateRenderRequest({ code: validCode, scale: 0 })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('out_of_range')
  })

  test('scale: 5 (上限超え) → 400 out_of_range', () => {
    const result = validateRenderRequest({ code: validCode, scale: 5 })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('out_of_range')
  })

  test('scale: -1 → 400 out_of_range', () => {
    const result = validateRenderRequest({ code: validCode, scale: -1 })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('out_of_range')
  })

  test('scale: 2.5 (非整数) → 400 type_mismatch', () => {
    const result = validateRenderRequest({ code: validCode, scale: 2.5 })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })

  test('scale: "3" (文字列) → 400 type_mismatch', () => {
    const result = validateRenderRequest({ code: validCode, scale: '3' })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })

  test('scale: null → 400 type_mismatch', () => {
    const result = validateRenderRequest({ code: validCode, scale: null })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })

  test('scale: "" (空文字) → 400 type_mismatch', () => {
    const result = validateRenderRequest({ code: validCode, scale: '' })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })

  test('scale: true (boolean) → 400 type_mismatch', () => {
    const result = validateRenderRequest({ code: validCode, scale: true })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })

  test('scale: { value: 3 } (object) → 400 type_mismatch', () => {
    const result = validateRenderRequest({ code: validCode, scale: { value: 3 } })
    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('scale')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })
})
