/**
 * Validates: REQ-S-01
 * PROP-7: Browser_Pool 初期化前 → 503 service_unavailable
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import type { Browser, BrowserContext, Page } from 'puppeteer'

import { BrowserPool } from '../../src/renderer/browserPool.js'

describe('PROP-7: BrowserPool rejects acquire before start with service_unavailable (Validates: REQ-S-01)', () => {
  test('acquire before start always rejects with errorType service_unavailable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (poolSize) => {
          const pool = new BrowserPool({
            poolSize,
            launchBrowser: createFakeBrowserFactory()
          })
          expect(pool.isReady()).toBe(false)
          await expect(pool.acquire()).rejects.toMatchObject({
            errorType: 'service_unavailable',
            reason: 'pool_unavailable'
          })
        }
      ),
      { numRuns: 20 }
    )
  })

  test('pool is ready after start and rejects after close', async () => {
    const pool = new BrowserPool({
      poolSize: 1,
      launchBrowser: createFakeBrowserFactory()
    })

    expect(pool.isReady()).toBe(false)
    await pool.start()
    expect(pool.isReady()).toBe(true)

    const context = await pool.acquire()
    pool.release(context)
    await pool.close()
    expect(pool.isReady()).toBe(false)
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
