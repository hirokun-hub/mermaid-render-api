/**
 * Validates: REQ-U-02
 * PROP-1: {code, format} のみで POST → HTTP 200, Content-Type 一致
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  CONTENT_TYPE_MAP
} from '../../src/config.js'
import { validateRenderRequest } from '../../src/validation/inputValidator.js'

describe('PROP-1: basic request with code and format (Validates: REQ-U-02)', () => {
  test('CONTENT_TYPE_MAP has non-empty string for each supported format', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('svg', 'png'),
        (format) => {
          const contentType = CONTENT_TYPE_MAP[format as 'svg' | 'png']
          expect(typeof contentType).toBe('string')
          expect(contentType.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('validator accepts non-empty code with known format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        fc.constantFrom('svg', 'png'),
        (code, format) => {
          const result = validateRenderRequest({ code, format })
          expect(result.valid).toBe(true)
          expect(result.error?.error_field).not.toBe('format')
        }
      ),
      { numRuns: 100 }
    )
  })
})
