import { describe, expect, test } from 'vitest'

import { MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from '../../src/config.js'
import { validateRenderRequest } from '../../src/validation/inputValidator.js'
import { WarningCode } from '../../src/utils/warnings.js'

const validCode = 'graph TD\nA-->B'

describe('validateRenderRequest mermaid_config', () => {
  test('accepts mermaid_config plain objects', () => {
    const result = validateRenderRequest({
      code: validCode,
      mermaid_config: {
        htmlLabels: true,
        flowchart: { diagramPadding: 4 }
      }
    })

    expect(result.valid).toBe(true)
    expect(result.mermaidConfig).toEqual({
      htmlLabels: true,
      flowchart: { diagramPadding: 4 }
    })
  })

  test('rejects mermaid_config values that are not plain objects', () => {
    const result = validateRenderRequest({
      code: validCode,
      mermaid_config: []
    })

    expect(result.valid).toBe(false)
    expect(result.error?.type).toBe('invalid_request')
    expect(result.error?.error_field).toBe('mermaid_config')
    expect(result.error?.error_constraint).toBe('type_mismatch')
  })

  test('rejects known keys with invalid types', () => {
    const cases = [
      {
        mermaid_config: { flowchart: { diagramPadding: '16' } },
        field: 'mermaid_config.flowchart.diagramPadding'
      },
      {
        mermaid_config: { htmlLabels: 'true' },
        field: 'mermaid_config.htmlLabels'
      }
    ]

    for (const input of cases) {
      const result = validateRenderRequest({ code: validCode, ...input })

      expect(result.valid).toBe(false)
      expect(result.error?.type).toBe('invalid_request')
      expect(result.error?.error_field).toBe(input.field)
      expect(result.error?.error_constraint).toBe('type_mismatch')
    }
  })

  test('drops unknown keys and records unknown_key warnings', () => {
    const result = validateRenderRequest({
      code: validCode,
      mermaid_config: {
        htmlLabels: true,
        unknownRoot: 'ignored',
        flowchart: {
          diagramPadding: 8,
          unknownNested: true
        }
      }
    })

    expect(result.valid).toBe(true)
    expect(result.mermaidConfig).toEqual({
      htmlLabels: true,
      flowchart: { diagramPadding: 8, unknownNested: true }
    })
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      WarningCode.UnknownKey
    ])
  })

  test('passes through design-approved top-level diagram config objects', () => {
    const result = validateRenderRequest({
      code: validCode,
      mermaid_config: {
        sequence: { diagramMarginX: 50 },
        gantt: { barHeight: 20 },
        er: { diagramPadding: 10 },
        class: { titleTopMargin: 12 },
        state: { dividerMargin: 8 },
        mindmap: { padding: 16 }
      }
    })

    expect(result.valid).toBe(true)
    expect(result.mermaidConfig).toEqual({
      sequence: { diagramMarginX: 50 },
      gantt: { barHeight: 20 },
      er: { diagramPadding: 10 },
      class: { titleTopMargin: 12 },
      state: { dividerMargin: 8 },
      mindmap: { padding: 16 }
    })
    expect(result.warnings).toEqual([])
  })

  test('passes through nested Mermaid config sub-keys under allowed roots', () => {
    const result = validateRenderRequest({
      code: validCode,
      mermaid_config: {
        themeVariables: { primaryColor: '#f00' },
        flowchart: {
          padding: 8,
          subGraphTitleMargin: { top: 10 }
        }
      }
    })

    expect(result.valid).toBe(true)
    expect(result.mermaidConfig).toEqual({
      themeVariables: { primaryColor: '#f00' },
      flowchart: {
        padding: 8,
        subGraphTitleMargin: { top: 10 }
      }
    })
    expect(result.warnings).toEqual([])
  })

  test('drops locked settings and records locked_setting_override_ignored warnings', () => {
    const result = validateRenderRequest({
      code: validCode,
      mermaid_config: {
        securityLevel: 'loose',
        flowchart: {
          maxEdges: 1,
          diagramPadding: 2
        }
      }
    })

    expect(result.valid).toBe(true)
    expect(result.mermaidConfig).toEqual({
      flowchart: { diagramPadding: 2 }
    })
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      WarningCode.LockedSettingOverrideIgnored,
      WarningCode.LockedSettingOverrideIgnored
    ])
  })

  test('rejects timeout_ms outside the allowed range', () => {
    for (const timeout_ms of [MIN_TIMEOUT_MS - 1, MAX_TIMEOUT_MS + 1]) {
      const result = validateRenderRequest({ code: validCode, timeout_ms })

      expect(result.valid).toBe(false)
      expect(result.error?.error_field).toBe('timeout_ms')
      expect(result.error?.error_constraint).toBe('out_of_range')
    }
  })
})
