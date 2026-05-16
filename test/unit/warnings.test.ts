import { describe, expect, test } from 'vitest'

import {
  WarningCode,
  WarningCollector
} from '../../src/utils/warnings.js'

describe('WarningCollector', () => {
  test('drains accumulated warnings once', () => {
    const warnings = new WarningCollector()
    warnings.add(WarningCode.UnknownKey, { key: 'x' })
    warnings.add(WarningCode.ThemeCssRejected, { pattern: 'url(' })

    expect(warnings.drain()).toEqual([
      { code: WarningCode.UnknownKey, detail: { key: 'x' } },
      { code: WarningCode.ThemeCssRejected, detail: { pattern: 'url(' } }
    ])
    expect(warnings.drain()).toEqual([])
  })
})
