import type { Browser, BrowserContext, Page } from 'puppeteer'
import { describe, expect, test } from 'vitest'

import { RATE_LIMIT_MAX_INFLIGHT } from '../../src/config.js'
import { RateLimiter } from '../../src/limiter/rateLimiter.js'
import { BrowserPool, BrowserPoolError } from '../../src/renderer/browserPool.js'
import { retryAfterFor, retryAfterSeconds } from '../../src/server/errorResponse.js'

describe('rate limiting layers', () => {
  test('HTTP-layer limiter rejects the RATE_LIMIT_MAX_INFLIGHT + 1 acquire immediately', async () => {
    const limiter = new RateLimiter(RATE_LIMIT_MAX_INFLIGHT)

    const accepted = await Promise.all(
      Array.from({ length: RATE_LIMIT_MAX_INFLIGHT }, () => limiter.acquire())
    )
    const extra = await limiter.acquire()

    expect(accepted.every(Boolean)).toBe(true)
    expect(extra).toBe(false)
  })

  test('BrowserPool rejects when POOL_QUEUE_MAX equivalent is exceeded', async () => {
    const pool = new BrowserPool({
      poolSize: 1,
      queueMax: 0,
      waitTimeoutMs: 1000,
      launchBrowser: async () => createFakeBrowser()
    })
    await pool.start()
    const context = await pool.acquire()

    await expect(pool.acquire()).rejects.toMatchObject({
      errorType: 'service_unavailable',
      reason: 'pool_wait_timeout'
    })

    pool.release(context)
    await pool.close()
  })

  test('Retry-After header values are positive integer seconds', () => {
    expect(retryAfterSeconds(1)).toMatch(/^[1-9]\d*$/)
    expect(retryAfterSeconds(3000)).toBe('3')
    expect(retryAfterFor('service_unavailable', 'pool_wait_timeout')).toBe('3')
    expect(retryAfterFor('service_unavailable', 'pool_unavailable')).toBe('5')
  })
})

function createFakeBrowser(): Browser {
  return {
    createBrowserContext: async () => createFakeContext(),
    close: async () => undefined
  } as unknown as Browser
}

function createFakeContext(): BrowserContext {
  return {
    newPage: async () => createFakePage(),
    close: async () => undefined
  } as unknown as BrowserContext
}

function createFakePage(): Page {
  return {
    setRequestInterception: async () => undefined,
    on: () => undefined
  } as unknown as Page
}
