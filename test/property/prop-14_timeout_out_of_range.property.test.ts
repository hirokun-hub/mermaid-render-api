/**
 * Validates: C-S-06, REQ-U-05
 * PROP-14: timeout_ms=60000 (MAX 超) → HTTP 400 / out_of_range
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from '../../src/config.js'
import { validateRenderRequest } from '../../src/validation/inputValidator.js'

describe('PROP-14: timeout_ms out of range is rejected (Validates: C-S-06, REQ-U-05)', () => {
  test('timeout_ms above MAX_TIMEOUT_MS is rejected with out_of_range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_TIMEOUT_MS + 1, max: MAX_TIMEOUT_MS + 100000 }),
        (timeout_ms) => {
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            timeout_ms
          })
          expect(result.valid).toBe(false)
          expect(result.error?.error_field).toBe('timeout_ms')
          expect(result.error?.error_constraint).toBe('out_of_range')
        }
      ),
      { numRuns: 100 }
    )
  })

  test('timeout_ms below MIN_TIMEOUT_MS is rejected with out_of_range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: MIN_TIMEOUT_MS - 1 }),
        (timeout_ms) => {
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            timeout_ms
          })
          expect(result.valid).toBe(false)
          expect(result.error?.error_field).toBe('timeout_ms')
          expect(result.error?.error_constraint).toBe('out_of_range')
        }
      ),
      { numRuns: 100 }
    )
  })
})
