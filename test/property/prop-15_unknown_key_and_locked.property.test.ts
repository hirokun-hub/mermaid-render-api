/**
 * Validates: REQ-E-06
 * PROP-15: allowlist 外未知キー → 無視 + 警告 unknown_key; locked キー → locked_setting_override_ignored
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { validateRenderRequest } from '../../src/validation/inputValidator.js'
import { WarningCode } from '../../src/utils/warnings.js'

describe('PROP-15: unknown and locked mermaid_config keys (Validates: REQ-E-06)', () => {
  test('unknown mermaid_config keys produce unknown_key warning and keep valid=true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('nonexistent_key', 'unsupportedDiagram', 'fakeKey', 'customOption'),
        (unknownKey) => {
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            mermaid_config: { [unknownKey]: 1 }
          })
          expect(result.valid).toBe(true)
          const hasUnknownKeyWarning = result.warnings.some(
            (w) => w.code === WarningCode.UnknownKey
          )
          expect(hasUnknownKeyWarning).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('locked mermaid_config keys produce locked_setting_override_ignored warning and keep valid=true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('securityLevel', 'maxTextSize', 'maxEdges', 'startOnLoad'),
        (lockedKey) => {
          const result = validateRenderRequest({
            code: 'graph TD\nA-->B',
            mermaid_config: { [lockedKey]: 'override_attempt' }
          })
          expect(result.valid).toBe(true)
          const hasLockedWarning = result.warnings.some(
            (w) => w.code === WarningCode.LockedSettingOverrideIgnored
          )
          expect(hasLockedWarning).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
