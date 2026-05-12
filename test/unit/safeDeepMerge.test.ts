import { describe, expect, test } from 'vitest'

import { safeDeepMerge } from '../../src/utils/safeDeepMerge.js'
import {
  WarningCode,
  WarningCollector
} from '../../src/utils/warnings.js'

describe('safeDeepMerge', () => {
  test('skips forbidden top-level keys', () => {
    const warnings = new WarningCollector()
    const payload = JSON.parse('{"__proto__":{"polluted":true}}') as unknown

    const result = safeDeepMerge({}, payload, warnings)

    expect(Object.hasOwn(result, '__proto__')).toBe(false)
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined()
    expect(warnings.drain()).toEqual([
      {
        code: WarningCode.PrototypePollutionAttempt,
        detail: { key: '__proto__' }
      }
    ])
  })

  test('does not pollute Object.prototype through constructor prototype payloads', () => {
    const warnings = new WarningCollector()
    const payload = JSON.parse(
      '{"constructor":{"prototype":{"polluted":true}}}'
    ) as unknown

    const result = safeDeepMerge({}, payload, warnings)

    expect(Object.hasOwn(result, 'constructor')).toBe(false)
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined()
    expect(warnings.drain()[0]?.code).toBe(
      WarningCode.PrototypePollutionAttempt
    )
  })

  test('skips forbidden keys recursively', () => {
    const warnings = new WarningCollector()
    const payload = JSON.parse(
      '{"a":{"__proto__":{"x":1},"safe":true}}'
    ) as unknown

    const result = safeDeepMerge({}, payload, warnings) as {
      a?: Record<string, unknown>
    }

    expect(result.a?.safe).toBe(true)
    expect(Object.hasOwn(result.a ?? {}, '__proto__')).toBe(false)
    expect(warnings.drain()[0]?.code).toBe(
      WarningCode.PrototypePollutionAttempt
    )
  })

  test('records prototype pollution attempts for mermaid_config shaped input', () => {
    const warnings = new WarningCollector()
    const payload = JSON.parse(
      '{"mermaid_config":{"__proto__":{"polluted":true}}}'
    ) as unknown

    safeDeepMerge({}, payload, warnings)

    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined()
    expect(warnings.drain()).toEqual([
      {
        code: WarningCode.PrototypePollutionAttempt,
        detail: { key: '__proto__' }
      }
    ])
  })

  test('records prototype pollution attempts for post_process shaped input', () => {
    const warnings = new WarningCollector()
    const payload = JSON.parse(
      '{"post_process":{"constructor":{"prototype":{"x":1}}}}'
    ) as unknown

    safeDeepMerge({}, payload, warnings)

    expect((Object.prototype as { x?: number }).x).toBeUndefined()
    expect(warnings.drain()).toEqual([
      {
        code: WarningCode.PrototypePollutionAttempt,
        detail: { key: 'constructor' }
      }
    ])
  })

  test('deep merges nested objects without dropping sibling keys', () => {
    const result = safeDeepMerge(
      {
        flowchart: {
          diagramPadding: 0,
          nodeSpacing: 30,
          rankSpacing: 40
        }
      },
      { flowchart: { diagramPadding: 16 } }
    )

    expect(result.flowchart).toEqual({
      diagramPadding: 16,
      nodeSpacing: 30,
      rankSpacing: 40
    })
  })
})
