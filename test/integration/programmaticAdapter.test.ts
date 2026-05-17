import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { BrowserContext } from 'puppeteer'

import { BrowserPool } from '../../src/renderer/browserPool.js'
import { ProgrammaticAdapter } from '../../src/renderer/programmaticAdapter.js'

const renderMermaidMock = vi.hoisted(() => vi.fn())

vi.mock('@mermaid-js/mermaid-cli', () => ({
  renderMermaid: renderMermaidMock
}))

describe('ProgrammaticAdapter', () => {
  beforeEach(() => {
    renderMermaidMock.mockReset()
  })

  test('returns service_unavailable before ready', async () => {
    const adapter = new ProgrammaticAdapter(createFakePool())

    const result = await adapter.render(createInput())

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('service_unavailable')
  })

  test('renders through renderMermaid and normalizes Uint8Array to Buffer', async () => {
    renderMermaidMock.mockResolvedValue({
      data: new Uint8Array(Buffer.from('<svg id="mermaid-req-1"></svg>'))
    })
    const pool = createFakePool()
    const adapter = new ProgrammaticAdapter(pool)

    await adapter.ready()
    const result = await adapter.render(createInput())

    expect(result.success).toBe(true)
    expect(Buffer.isBuffer(result.data)).toBe(true)
    expect(result.data?.toString('utf8')).toContain('<svg')
    expect(renderMermaidMock).toHaveBeenCalledWith(
      pool.context,
      'graph TD\nA-->B',
      'svg',
      expect.objectContaining({ svgId: 'mermaid-req-1' })
    )
    expect(pool.release).toHaveBeenCalledWith(pool.context)
  })

  test('passes viewport.deviceScaleFactor when format=png with scale (REQ-U-11)', async () => {
    renderMermaidMock.mockResolvedValue({ data: new Uint8Array(0) })
    const pool = createFakePool()
    const adapter = new ProgrammaticAdapter(pool)

    await adapter.ready()
    await adapter.render(createInput({ format: 'png', scale: 2 }))

    expect(renderMermaidMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'png',
      expect.objectContaining({
        viewport: expect.objectContaining({ deviceScaleFactor: 2 })
      })
    )
  })

  test('uses DEFAULT_PNG_SCALE when format=png and scale is undefined (REQ-U-11)', async () => {
    renderMermaidMock.mockResolvedValue({ data: new Uint8Array(0) })
    const pool = createFakePool()
    const adapter = new ProgrammaticAdapter(pool)

    await adapter.ready()
    await adapter.render(createInput({ format: 'png' }))

    expect(renderMermaidMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'png',
      expect.objectContaining({
        viewport: expect.objectContaining({ deviceScaleFactor: 3 })
      })
    )
  })

  test('does not pass viewport when format=svg (REQ-U-11 INV-4)', async () => {
    renderMermaidMock.mockResolvedValue({
      data: new Uint8Array(Buffer.from('<svg id="mermaid-req-1"></svg>'))
    })
    const pool = createFakePool()
    const adapter = new ProgrammaticAdapter(pool)

    await adapter.ready()
    await adapter.render(createInput({ format: 'svg' }))

    const callArgs = renderMermaidMock.mock.calls[0][3] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('viewport')
  })

  test('returns timeout and discards context when render exceeds timeoutMs', async () => {
    renderMermaidMock.mockReturnValue(new Promise(() => undefined))
    const pool = createFakePool()
    const adapter = new ProgrammaticAdapter(pool)

    await adapter.ready()
    const result = await adapter.render(createInput({ timeoutMs: 10 }))

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('timeout')
    expect(pool.recordTimeout).toHaveBeenCalledWith(pool.context)
    expect(pool.release).not.toHaveBeenCalled()
  })
})

function createInput(overrides: Partial<Parameters<ProgrammaticAdapter['render']>[0]> = {}) {
  return {
    requestId: 'req-1',
    code: 'graph TD\nA-->B',
    format: 'svg' as const,
    timeoutMs: 1000,
    mermaidConfig: {},
    postProcess: { strip_max_width: true },
    ...overrides
  }
}

function createFakePool(): BrowserPool & {
  context: BrowserContext
  release: ReturnType<typeof vi.fn>
  recordTimeout: ReturnType<typeof vi.fn>
} {
  const context = {} as BrowserContext
  return {
    context,
    start: vi.fn(async () => undefined),
    acquire: vi.fn(async () => context),
    release: vi.fn(),
    discard: vi.fn(),
    recordTimeout: vi.fn(),
    close: vi.fn(async () => undefined)
  } as unknown as BrowserPool & {
    context: BrowserContext
    release: ReturnType<typeof vi.fn>
    recordTimeout: ReturnType<typeof vi.fn>
  }
}
