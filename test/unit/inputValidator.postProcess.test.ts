import { describe, expect, test } from 'vitest'

import { validateRenderRequest } from '../../src/validation/inputValidator.js'
import { WarningCode } from '../../src/utils/warnings.js'

const validCode = 'graph TD\nA-->B'

describe('validateRenderRequest post_process', () => {
  test('normalizes default post_process options when omitted', () => {
    const result = validateRenderRequest({ code: validCode })

    expect(result.valid).toBe(true)
    expect(result.postProcess).toEqual({
      rewrite_ids: true,
      strip_max_width: false
    })
  })

  test('accepts supported post_process options', () => {
    const result = validateRenderRequest({
      code: validCode,
      post_process: { rewrite_ids: false, strip_max_width: true }
    })

    expect(result.valid).toBe(true)
    expect(result.postProcess).toEqual({
      rewrite_ids: false,
      strip_max_width: true
    })
  })

  test('drops unknown post_process keys with warnings', () => {
    const result = validateRenderRequest({
      code: validCode,
      post_process: {
        rewrite_ids: true,
        unsupported: true
      }
    })

    expect(result.valid).toBe(true)
    expect(result.postProcess).toEqual({
      rewrite_ids: true,
      strip_max_width: false
    })
    expect(result.warnings).toEqual([
      {
        code: WarningCode.UnknownKey,
        detail: { key: 'post_process.unsupported' }
      }
    ])
  })

  test('rejects post_process values that are not plain objects', () => {
    const result = validateRenderRequest({
      code: validCode,
      post_process: 'invalid'
    })

    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('post_process')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })

  test('rejects boolean options with non-boolean values', () => {
    const cases = [
      {
        post_process: { rewrite_ids: 'true' },
        field: 'post_process.rewrite_ids'
      },
      {
        post_process: { strip_max_width: 1 },
        field: 'post_process.strip_max_width'
      }
    ]

    for (const input of cases) {
      const result = validateRenderRequest({ code: validCode, ...input })

      expect(result.valid).toBe(false)
      expect(result.error?.error_field).toBe(input.field)
      expect(result.error?.error_constraint).toBe('type_mismatch')
    }
  })
})
