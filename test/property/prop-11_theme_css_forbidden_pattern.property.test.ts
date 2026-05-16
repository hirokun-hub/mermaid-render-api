/**
 * Validates: REQ-UN-05
 * PROP-11: themeCSS に forbidden pattern → HTTP 400 + theme_css_rejected
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { THEME_CSS_FORBIDDEN_PATTERNS } from '../../src/config.js'
import { validateRenderRequest } from '../../src/validation/inputValidator.js'
import { WarningCode } from '../../src/utils/warnings.js'

describe('PROP-11: themeCSS forbidden patterns are rejected (Validates: REQ-UN-05)', () => {
  test('themeCSS with forbidden pattern results in valid=false and forbidden_pattern constraint', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...THEME_CSS_FORBIDDEN_PATTERNS),
        (pattern) => {
          const themeCSS = `.node { background: ${pattern}; }`
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            mermaid_config: { themeCSS }
          })
          expect(result.valid).toBe(false)
          expect(result.error?.error_field).toBe('mermaid_config.themeCSS')
          expect(result.error?.error_constraint).toBe('forbidden_pattern')
        }
      ),
      { numRuns: 100 }
    )
  })

  test('themeCSS with forbidden pattern triggers theme_css_rejected warning', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...THEME_CSS_FORBIDDEN_PATTERNS),
        (pattern) => {
          const themeCSS = `.node { background: ${pattern}; }`
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            mermaid_config: { themeCSS }
          })
          const hasThemeCssWarning = result.warnings.some(
            (w) => w.code === WarningCode.ThemeCssRejected
          )
          expect(hasThemeCssWarning).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
