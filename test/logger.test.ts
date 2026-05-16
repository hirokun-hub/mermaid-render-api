import { describe, test, vi, expect } from 'vitest'
import {
  logger,
  logError,
  logRequest,
  logResponse,
  logStartup
} from '../src/utils/logger.js'

describe('logger utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('logRequest writes info', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    logRequest('req-id', 'POST', '/render')
    expect(spy).toHaveBeenCalled()
  })

  test('logResponse writes info', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    logResponse('req-id', 200, 123, 'success', null)
    expect(spy).toHaveBeenCalled()
  })

  test('logError writes error', () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const error = new Error('boom')
    logError('req-id', error, 1, { stage: 'test' })
    expect(spy).toHaveBeenCalled()
  })

  test('logStartup writes info', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    logStartup('v1.0.0')
    expect(spy).toHaveBeenCalled()
  })
})
