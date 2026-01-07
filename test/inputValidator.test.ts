import { describe, expect, test } from 'vitest'
import { validateRenderRequest } from '../src/validation/inputValidator'

const validCode = 'graph TD\nA-->B'

describe('validateRenderRequest', () => {
  test('rejects empty code', () => {
    const result = validateRenderRequest({ code: '' })
    expect(result.valid).toBe(false)
    expect(result.error?.type).toBe('invalid_request')
    expect(result.error?.stderr).toBe('')
    expect(result.error?.exit_code).toBeNull()
    expect(result.requestedFormat).toBe('svg')
  })

  test('default format is svg', () => {
    const result = validateRenderRequest({ code: validCode })
    expect(result.valid).toBe(true)
    expect(result.normalizedFormat).toBe('svg')
    expect(result.requestedFormat).toBe('svg')
  })

  test('rejects unknown format', () => {
    const result = validateRenderRequest({ code: validCode, format: 'gif' })
    expect(result.valid).toBe(false)
    expect(result.error?.message).toContain('format must be one of')
    expect(result.requestedFormat).toBe('gif')
  })

  test('rejects code larger than limit', () => {
    const largeCode = 'a'.repeat(51 * 1024)
    const result = validateRenderRequest({ code: largeCode })
    expect(result.valid).toBe(false)
    expect(result.error?.message).toContain('code exceeds maximum size')
    expect(result.requestedFormat).toBe('svg')
  })
})
