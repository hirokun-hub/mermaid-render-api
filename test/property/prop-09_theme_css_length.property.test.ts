/**
 * Validates: REQ-UN-05
 * PROP-9: themeCSS 長さ上限超過 → HTTP 400
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  MAX_THEME_CSS_LENGTH,
  THEME_CSS_FORBIDDEN_PATTERNS
} from '../../src/config.js'
import { validateRenderRequest } from '../../src/validation/inputValidator.js'

describe('PROP-9: themeCSS length validation (Validates: REQ-UN-05)', () => {
  test('themeCSS exceeding MAX_THEME_CSS_LENGTH is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_THEME_CSS_LENGTH + 1, max: MAX_THEME_CSS_LENGTH + 100 }),
        (len) => {
          const themeCSS = '.node{}'.padEnd(len, 'x').slice(0, len)
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            mermaid_config: { themeCSS }
          })
          expect(result.valid).toBe(false)
          expect(result.error?.error_field).toBe('mermaid_config.themeCSS')
        }
      ),
      { numRuns: 50 }
    )
  })

  test('themeCSS within MAX_THEME_CSS_LENGTH without forbidden patterns is accepted', () => {
    fc.assert(
      fc.property(
        fc
          .string({ maxLength: MAX_THEME_CSS_LENGTH })
          .filter(
            (s) =>
              !THEME_CSS_FORBIDDEN_PATTERNS.some((p) =>
                s.toLowerCase().includes(p.toLowerCase())
              )
          ),
        (themeCSS) => {
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            mermaid_config: { themeCSS }
          })
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
