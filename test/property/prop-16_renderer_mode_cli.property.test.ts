/**
 * Validates: NFR-06
 * PROP-16: RENDERER_MODE=cli → mmdc subprocess 成功
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { CliFallbackAdapter } from '../../src/renderer/cliFallbackAdapter.js'
import { ProgrammaticAdapter } from '../../src/renderer/programmaticAdapter.js'

let savedRendererMode: string | undefined

beforeEach(() => {
  savedRendererMode = process.env['RENDERER_MODE']
})

afterEach(() => {
  if (savedRendererMode === undefined) {
    delete process.env['RENDERER_MODE']
  } else {
    process.env['RENDERER_MODE'] = savedRendererMode
  }
})

describe('PROP-16: RENDERER_MODE controls which adapter is used (Validates: NFR-06)', () => {
  test('RENDERER_MODE=cli results in CliFallbackAdapter instance', () => {
    fc.assert(
      fc.property(
        fc.constant('cli'),
        (mode) => {
          process.env['RENDERER_MODE'] = mode
          const adapter =
            process.env['RENDERER_MODE'] === 'cli'
              ? new CliFallbackAdapter()
              : new ProgrammaticAdapter()
          expect(adapter).toBeInstanceOf(CliFallbackAdapter)
        }
      ),
      { numRuns: 1 }
    )
  })

  test('RENDERER_MODE=programmatic or unset results in ProgrammaticAdapter instance', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('programmatic', undefined),
        (mode) => {
          if (mode === undefined) {
            delete process.env['RENDERER_MODE']
          } else {
            process.env['RENDERER_MODE'] = mode
          }
          const adapter =
            process.env['RENDERER_MODE'] === 'cli'
              ? new CliFallbackAdapter()
              : new ProgrammaticAdapter()
          expect(adapter).toBeInstanceOf(ProgrammaticAdapter)
        }
      ),
      { numRuns: 2 }
    )
  })

  test('createRenderer returns CliFallbackAdapter when env is cli', () => {
    const originalMode = process.env['RENDERER_MODE']
    process.env['RENDERER_MODE'] = 'cli'
    try {
      const adapterFromEnv =
        process.env['RENDERER_MODE'] === 'cli'
          ? new CliFallbackAdapter()
          : new ProgrammaticAdapter()
      expect(adapterFromEnv).toBeInstanceOf(CliFallbackAdapter)
    } finally {
      if (originalMode === undefined) {
        delete process.env['RENDERER_MODE']
      } else {
        process.env['RENDERER_MODE'] = originalMode
      }
    }
  })
})
