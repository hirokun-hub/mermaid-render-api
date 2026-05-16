/**
 * Validates: REQ-E-05
 * PROP-4: format=png + post_process.strip_max_width=true → HTTP 200 + 警告 svg_only_option_in_png
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { validateRenderRequest } from '../../src/validation/inputValidator.js'

describe('PROP-4: svg-only post_process options accepted for png (Validates: REQ-E-05)', () => {
  test('strip_max_width=true/false is accepted by validator for format=png', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (boolValue) => {
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            format: 'png',
            post_process: { strip_max_width: boolValue }
          })
          expect(result.valid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  test('rewrite_ids=true/false is accepted by validator for format=png', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(true, false),
        (boolValue) => {
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            format: 'png',
            post_process: { rewrite_ids: boolValue }
          })
          expect(result.valid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})
