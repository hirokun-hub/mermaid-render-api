/**
 * Validates: REQ-S-03
 * PROP-13: HTTP 層 RATE_LIMIT_MAX_INFLIGHT+1 → 即時 429, Pool 層 POOL_QUEUE_MAX 超 → 503
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import type { Browser, BrowserContext, Page } from 'puppeteer'

import { RateLimiter } from '../../src/limiter/rateLimiter.js'
import { BrowserPool } from '../../src/renderer/browserPool.js'

describe('PROP-13: rate limiter and pool queue limits (Validates: REQ-S-03)', () => {
  test('RateLimiter: after maxConcurrent acquires, next acquire returns false', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        async (maxConcurrent) => {
          const limiter = new RateLimiter(maxConcurrent)
          for (let i = 0; i < maxConcurrent; i++) {
            const acquired = await limiter.acquire()
            expect(acquired).toBe(true)
          }
          const overflow = await limiter.acquire()
          expect(overflow).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })

  test('BrowserPool: acquire times out when all contexts are in use', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (poolSize) => {
          const pool = new BrowserPool({
            poolSize,
            queueMax: 1,
            waitTimeoutMs: 5,
            launchBrowser: createFakeBrowserFactory()
          })
          await pool.start()

          const contexts: BrowserContext[] = []
          for (let i = 0; i < poolSize; i++) {
            contexts.push(await pool.acquire())
          }

          await expect(pool.acquire()).rejects.toMatchObject({
            errorType: 'service_unavailable'
          })

          for (const ctx of contexts) {
            pool.release(ctx)
          }
          await pool.close()
        }
      ),
      { numRuns: 20 }
    )
  })
})

function createFakeBrowserFactory(): () => Promise<Browser> {
  return async () => {
    return {
      createBrowserContext: async () => createFakeContext(),
      close: async () => undefined
    } as unknown as Browser
  }
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
