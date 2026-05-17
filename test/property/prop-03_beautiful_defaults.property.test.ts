/**
 * Validates: REQ-U-01, REQ-E-01
 * PROP-3: mermaid_config 未指定 → BEAUTIFUL_DEFAULTS 適用
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import {
  BEAUTIFUL_DEFAULTS,
  SERVER_LOCKED_SETTINGS,
  buildRequestMermaidConfig
} from '../../src/config.js'

describe('PROP-3: BEAUTIFUL_DEFAULTS applied when mermaid_config is omitted (Validates: REQ-U-01, REQ-E-01)', () => {
  test('buildRequestMermaidConfig with no args applies BEAUTIFUL_DEFAULTS', () => {
    const result = buildRequestMermaidConfig()
    expect(result.htmlLabels).toBe(true)
    expect(result.suppressErrorRendering).toBe(true)
    expect(result.flowchart?.useMaxWidth).toBe(true)
    expect(result.securityLevel).toBe('strict')
  })

  test('BEAUTIFUL_DEFAULTS keys not in SERVER_LOCKED_SETTINGS are preserved after override', () => {
    fc.assert(
      fc.property(
        fc.record({
          theme: fc.option(fc.string(), { nil: undefined })
        }),
        (override) => {
          const result = buildRequestMermaidConfig(
            override.theme !== undefined ? { theme: override.theme } : undefined
          )
          const lockedKeys = new Set(Object.keys(SERVER_LOCKED_SETTINGS))
          for (const key of Object.keys(BEAUTIFUL_DEFAULTS)) {
            if (!lockedKeys.has(key)) {
              expect(result).toHaveProperty(key)
            }
          }
          expect(result.htmlLabels).toBe(true)
          expect(result.suppressErrorRendering).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
