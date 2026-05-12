import { describe, expect, test } from 'vitest'

import {
  POOL_RETRY_AFTER_MS,
  POOL_WAIT_TIMEOUT_MS,
  RATE_LIMIT_RETRY_AFTER_MS
} from '../../src/config.js'
import {
  buildErrorResponse,
  retryAfterFor,
  retryAfterSeconds
} from '../../src/server/errorResponse.js'

describe('buildErrorResponse', () => {
  test('builds unified error fields for supported error types', () => {
    const types = [
      'parse_error',
      'invalid_request',
      'render_error',
      'timeout',
      'service_unavailable'
    ] as const

    for (const errorType of types) {
      const response = buildErrorResponse({
        requestId: 'req-1',
        errorType,
        statusCode: errorType === 'service_unavailable' ? 503 : 400,
        stderr: 'stderr',
        exitCode: null,
        format: 'svg'
      })

      expect(response).toMatchObject({
        request_id: 'req-1',
        error_type: errorType,
        stderr: 'stderr',
        exit_code: null,
        format: 'svg',
        error_message: null,
        line: null,
        error_field: null,
        error_constraint: null
      })
    }
  })

  test('keeps parse_error line null or a positive integer', () => {
    for (const line of [null, 1, 3]) {
      const response = buildErrorResponse({
        requestId: 'req-1',
        errorType: 'parse_error',
        statusCode: 400,
        stderr: '',
        exitCode: null,
        format: 'png',
        line
      })

      expect(response.line === null || response.line > 0).toBe(true)
    }
  })

  test('normalizes invalid parse_error line values to null', () => {
    const response = buildErrorResponse({
      requestId: 'req-1',
      errorType: 'parse_error',
      statusCode: 400,
      stderr: '',
      exitCode: null,
      format: 'svg',
      line: 0
    })

    expect(response.line).toBeNull()
  })

  test('retryAfterSeconds returns a positive integer string', () => {
    expect(retryAfterSeconds(1200)).toBe('2')
    expect(retryAfterSeconds(0)).toBe('1')
  })

  test('retryAfterFor distinguishes rate limit and pool unavailable errors', () => {
    expect(retryAfterFor('rate_limited')).toBe(
      retryAfterSeconds(RATE_LIMIT_RETRY_AFTER_MS)
    )
    expect(retryAfterFor('service_unavailable')).toBe(
      retryAfterSeconds(POOL_RETRY_AFTER_MS)
    )
    expect(retryAfterFor('service_unavailable', 'pool_wait_timeout')).toBe(
      retryAfterSeconds(POOL_WAIT_TIMEOUT_MS)
    )
    expect(retryAfterFor('timeout')).toBeNull()
  })
})
