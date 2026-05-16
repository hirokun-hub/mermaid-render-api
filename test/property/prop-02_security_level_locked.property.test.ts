/**
 * Validates: REQ-E-02, REQ-UN-01
 * PROP-2: mermaid_config.securityLevel = "loose" → 実際は "strict", 警告 1 件
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { buildRequestMermaidConfig } from '../../src/config.js'
import { WarningCode, WarningCollector } from '../../src/utils/warnings.js'

describe('PROP-2: securityLevel is always locked to strict (Validates: REQ-E-02, REQ-UN-01)', () => {
  test('any securityLevel override always results in strict', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('loose', 'antiscript', 'sandbox'),
        (level) => {
          const result = buildRequestMermaidConfig({ securityLevel: level })
          expect(result.securityLevel).toBe('strict')
        }
      ),
      { numRuns: 100 }
    )
  })

  test('WarningCollector records locked_setting_override_ignored for securityLevel', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('loose', 'antiscript', 'sandbox'),
        (level) => {
          const warnings = new WarningCollector()
          const result = buildRequestMermaidConfig({ securityLevel: level }, warnings)
          expect(result.securityLevel).toBe('strict')
          const drained = warnings.drain()
          const lockedWarning = drained.find(
            (w) => w.code === WarningCode.LockedSettingOverrideIgnored
          )
          expect(lockedWarning).toBeDefined()
          expect(lockedWarning?.detail?.key).toBe('securityLevel')
        }
      ),
      { numRuns: 100 }
    )
  })
})
