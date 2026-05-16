/**
 * Validates: REQ-UN-06, C-S-04
 * PROP-12: Prototype Pollution payload → Object.prototype 不変, 警告記録
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { safeDeepMerge } from '../../src/utils/safeDeepMerge.js'
import { WarningCode, WarningCollector } from '../../src/utils/warnings.js'

describe('PROP-12: prototype pollution is blocked in safeDeepMerge (Validates: REQ-UN-06, C-S-04)', () => {
  test('forbidden top-level keys do not pollute Object.prototype in mermaid_config shape', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('__proto__', 'constructor', 'prototype'),
        (forbiddenKey) => {
          const warnings = new WarningCollector()
          const payload = JSON.parse(
            `{"${forbiddenKey}":{"polluted":true}}`
          ) as unknown
          const result = safeDeepMerge({} as Record<string, unknown>, payload, warnings)
          expect(Object.hasOwn(result, forbiddenKey)).toBe(false)
          expect(
            (Object.prototype as Record<string, unknown>)['polluted']
          ).toBeUndefined()
          const drained = warnings.drain()
          const pollutionWarning = drained.find(
            (w) => w.code === WarningCode.PrototypePollutionAttempt
          )
          expect(pollutionWarning).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  test('forbidden keys in post_process shape do not pollute Object.prototype', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('__proto__', 'constructor', 'prototype'),
        (forbiddenKey) => {
          const warnings = new WarningCollector()
          const payload = JSON.parse(
            `{"${forbiddenKey}":{"x":1}}`
          ) as unknown
          const result = safeDeepMerge(
            { rewrite_ids: true, strip_max_width: false } as Record<string, unknown>,
            payload,
            warnings
          )
          expect(Object.hasOwn(result, forbiddenKey)).toBe(false)
          expect(
            (Object.prototype as Record<string, unknown>)['x']
          ).toBeUndefined()
          const drained = warnings.drain()
          const pollutionWarning = drained.find(
            (w) => w.code === WarningCode.PrototypePollutionAttempt
          )
          expect(pollutionWarning).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})
