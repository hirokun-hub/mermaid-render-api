import { describe, expect, test } from 'vitest'
import { generateRequestId } from '../src/utils/requestId'

describe('generateRequestId', () => {
  test('returns a UUID-like string', () => {
    const requestId = generateRequestId()
    expect(requestId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
  })
})
