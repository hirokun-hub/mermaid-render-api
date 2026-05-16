/**
 * Validates: REQ-U-07
 * PROP-10: 構文エラー入力で SVG に "Syntax error" を含まない
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { buildRequestMermaidConfig } from '../../src/config.js'

describe('PROP-10: suppressErrorRendering is always true (Validates: REQ-U-07)', () => {
  test('buildRequestMermaidConfig always sets suppressErrorRendering to true', () => {
    const result = buildRequestMermaidConfig()
    expect(result.suppressErrorRendering).toBe(true)
  })

  test('any user override preserves suppressErrorRendering: true', () => {
    fc.assert(
      fc.property(
        fc.record({
          theme: fc.option(
            fc.constantFrom('base', 'dark', 'neutral'),
            { nil: undefined }
          )
        }),
        (override) => {
          const config = override.theme !== undefined
            ? { theme: override.theme }
            : undefined
          const result = buildRequestMermaidConfig(config)
          expect(result.suppressErrorRendering).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('suppressErrorRendering is always true when not overridden', () => {
    fc.assert(
      fc.property(
        fc.record({
          htmlLabels: fc.option(fc.boolean(), { nil: undefined }),
          theme: fc.option(fc.constantFrom('base', 'dark', 'neutral'), { nil: undefined })
        }),
        (override) => {
          const config: Record<string, unknown> = {}
          if (override.htmlLabels !== undefined) config['htmlLabels'] = override.htmlLabels
          if (override.theme !== undefined) config['theme'] = override.theme
          const result = buildRequestMermaidConfig(
            Object.keys(config).length > 0 ? config : undefined
          )
          expect(result.suppressErrorRendering).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
