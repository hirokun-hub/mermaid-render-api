/**
 * Validates: REQ-U-08
 * PROP-6: 100 連続リクエストで browser プロセス数が少数維持(リクエスト数に比例しない)
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import type { Browser, BrowserContext, Page } from 'puppeteer'

import { BrowserPool } from '../../src/renderer/browserPool.js'

describe('PROP-6: browser process count stays bounded across repeated requests (Validates: REQ-U-08)', () => {
  test('browser count never grows proportionally with request count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 5, max: 20 }),
        async (poolSize, maxRendersPerContext, requestCount) => {
          const factory = createFakeBrowserFactory()
          const pool = new BrowserPool({
            poolSize,
            maxRendersPerContext,
            maxRendersPerBrowser: 1000,
            launchBrowser: factory
          })
          await pool.start()

          for (let index = 0; index < requestCount; index++) {
            const context = await pool.acquire()
            pool.release(context)
            await new Promise((resolve) => setTimeout(resolve, 0))
          }

          // Browser count stays at 1: requestCount (≤20) << maxRendersPerBrowser (1000)
          expect(factory.createdBrowsers()).toBe(1)
          await pool.close()
        }
      ),
      { numRuns: 20 }
    )
  })

  test('browser count is bounded (≤2) even with context recycling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        async (poolSize, maxRendersPerContext) => {
          const factory = createFakeBrowserFactory()
          const pool = new BrowserPool({
            poolSize,
            maxRendersPerContext,
            maxRendersPerBrowser: 50,
            launchBrowser: factory
          })
          await pool.start()

          for (let index = 0; index < 10; index++) {
            const context = await pool.acquire()
            pool.release(context)
            await new Promise((resolve) => setTimeout(resolve, 0))
          }

          // Even with recycling, browser count stays at design-level few (≤2)
          expect(factory.createdBrowsers()).toBeLessThanOrEqual(2)
          await pool.close()
        }
      ),
      { numRuns: 20 }
    )
  })
})

function createFakeBrowserFactory(): (() => Promise<Browser>) & {
  createdBrowsers: () => number
} {
  let browserCount = 0
  const factory = async () => {
    browserCount++
    return createFakeBrowser()
  }
  factory.createdBrowsers = () => browserCount
  return factory
}

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
