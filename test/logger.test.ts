import { describe, test, vi, expect } from 'vitest'
import { logError, logRequest, logResponse, logStartup } from '../src/utils/logger.js'

describe('logger utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('logRequest writes info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logRequest('req-id', 'POST', '/render')
    expect(spy).toHaveBeenCalled()
  })

  test('logResponse writes info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logResponse('req-id', 200, 123, 'success', null)
    expect(spy).toHaveBeenCalled()
  })

  test('logError writes error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('boom')
    logError('req-id', error, 1, { stage: 'test' })
    expect(spy).toHaveBeenCalled()
  })

  test('logStartup writes info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logStartup('v1.0.0')
    expect(spy).toHaveBeenCalled()
  })
})
