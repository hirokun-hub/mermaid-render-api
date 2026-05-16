import { describe, expect, test, vi } from 'vitest'

describe('config constants', () => {
  test('toPositiveInt falls back for zero, negative, NaN, and empty values', async () => {
    const { toPositiveInt } = await import('../../src/config.js')

    expect(toPositiveInt('0', 9)).toBe(9)
    expect(toPositiveInt('-1', 9)).toBe(9)
    expect(toPositiveInt('NaN', 9)).toBe(9)
    expect(toPositiveInt(undefined, 9)).toBe(9)
    expect(toPositiveInt('10.8', 9)).toBe(10)
  })

  test('BODY_LIMIT_BYTES follows MAX_CODE_SIZE', async () => {
    const previousMaxCodeSize = process.env.MAX_CODE_SIZE
    process.env.MAX_CODE_SIZE = '1000'
    vi.resetModules()

    const config = await import('../../src/config.js')

    expect(config.MAX_CODE_SIZE).toBe(1000)
    expect(config.BODY_LIMIT_BYTES).toBe(
      config.MAX_CODE_SIZE * 2 + config.RESERVED_BODY_OVERHEAD_BYTES
    )

    if (previousMaxCodeSize === undefined) {
      delete process.env.MAX_CODE_SIZE
    } else {
      process.env.MAX_CODE_SIZE = previousMaxCodeSize
    }
    vi.resetModules()
  })
})
