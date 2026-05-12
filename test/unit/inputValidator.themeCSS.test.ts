import { describe, expect, test } from 'vitest'

import {
  MAX_THEME_CSS_LENGTH,
  THEME_CSS_FORBIDDEN_PATTERNS
} from '../../src/config.js'
import { validateRenderRequest } from '../../src/validation/inputValidator.js'
import { WarningCode } from '../../src/utils/warnings.js'

const validCode = 'graph TD\nA-->B'

describe('validateRenderRequest themeCSS', () => {
  test('rejects themeCSS over MAX_THEME_CSS_LENGTH', () => {
    const result = validateRenderRequest({
      code: validCode,
      mermaid_config: {
        themeCSS: '.node{}'.padEnd(MAX_THEME_CSS_LENGTH + 1, 'x')
      }
    })

    expect(result.valid).toBe(false)
    expect(result.error?.error_field).toBe('mermaid_config.themeCSS')
    expect(result.error?.error_constraint).toBe('max_length')
  })

  test('rejects themeCSS containing forbidden patterns with warnings', () => {
    for (const pattern of THEME_CSS_FORBIDDEN_PATTERNS) {
      const result = validateRenderRequest({
        code: validCode,
        mermaid_config: { themeCSS: `.node { background: ${pattern}; }` }
      })

      expect(result.valid).toBe(false)
      expect(result.error?.error_field).toBe('mermaid_config.themeCSS')
      expect(result.error?.error_constraint).toBe('forbidden_pattern')
      expect(result.warnings).toEqual([
        {
          code: WarningCode.ThemeCssRejected,
          detail: { field: 'mermaid_config.themeCSS', pattern }
        }
      ])
    }
  })
})
