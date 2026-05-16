import { describe, expect, test } from 'vitest'

import {
  BEAUTIFUL_DEFAULTS,
  SERVER_LOCKED_SETTINGS,
  buildRequestMermaidConfig
} from '../../src/config.js'
import {
  WarningCode,
  WarningCollector
} from '../../src/utils/warnings.js'

describe('buildRequestMermaidConfig (PROP-3, PROP-8)', () => {
  test('uses Beautiful Defaults and server locked settings when no override exists', () => {
    const result = buildRequestMermaidConfig()

    expect(result).toMatchObject(BEAUTIFUL_DEFAULTS)
    expect(result).toMatchObject(SERVER_LOCKED_SETTINGS)
    expect(result.htmlLabels).toBe(true)
    expect(result.suppressErrorRendering).toBe(true)
    expect(result.flowchart?.useMaxWidth).toBe(false)
    expect(result.flowchart?.defaultRenderer).toBe('dagre-wrapper')
  })

  test('applies user overrides between defaults and locked settings', () => {
    const result = buildRequestMermaidConfig({
      theme: 'neutral',
      flowchart: { diagramPadding: 16 }
    })

    expect(result.theme).toBe('neutral')
    expect(result.flowchart?.diagramPadding).toBe(16)
    expect(result.flowchart?.nodeSpacing).toBe(
      BEAUTIFUL_DEFAULTS.flowchart?.nodeSpacing
    )
    expect(result.securityLevel).toBe('strict')
  })

  test('keeps securityLevel strict and records a locked setting warning', () => {
    const warnings = new WarningCollector()
    const result = buildRequestMermaidConfig(
      { securityLevel: 'loose' },
      warnings
    )

    expect(result.securityLevel).toBe('strict')
    expect(warnings.drain()).toEqual([
      {
        code: WarningCode.LockedSettingOverrideIgnored,
        detail: { key: 'securityLevel' }
      }
    ])
  })

  test('records locked setting warnings recursively', () => {
    const warnings = new WarningCollector()
    const result = buildRequestMermaidConfig(
      { flowchart: { maxEdges: 1, diagramPadding: 16 } },
      warnings
    )

    expect(result.flowchart?.diagramPadding).toBe(16)
    expect(result.flowchart).not.toHaveProperty('maxEdges')
    expect(warnings.drain()).toEqual([
      {
        code: WarningCode.LockedSettingOverrideIgnored,
        detail: { key: 'maxEdges' }
      }
    ])
  })

  test('removes secure overrides while preserving Mermaid defaults', () => {
    const warnings = new WarningCollector()
    const result = buildRequestMermaidConfig(
      { secure: ['securityLevel'] },
      warnings
    )

    expect(result).not.toHaveProperty('secure')
    expect(warnings.drain()).toEqual([
      {
        code: WarningCode.LockedSettingOverrideIgnored,
        detail: { key: 'secure' }
      }
    ])
  })
})
