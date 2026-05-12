import { performance } from 'node:perf_hooks'

import type { SupportedFormat } from '../config.js'
import type { PostProcessOption } from './mermaidRendererAdapter.js'

interface PostProcessInput {
  requestId?: string
  data: Buffer
  format: SupportedFormat
  postProcess?: PostProcessOption
}

export interface PostProcessResult {
  data: Buffer
  durationMs: number
}

export function buildSvgId(
  requestId: string,
  postProcess?: PostProcessOption
): string | undefined {
  return postProcess?.rewrite_ids === false
    ? undefined
    : `mermaid-${requestId}`
}

export function applyPostProcess(input: PostProcessInput): PostProcessResult {
  const start = performance.now()

  if (input.format === 'png') {
    return withPostProcessLog(input.requestId, {
      data: input.data,
      durationMs: elapsed(start)
    })
  }

  if (!input.postProcess?.strip_max_width) {
    return withPostProcessLog(input.requestId, {
      data: input.data,
      durationMs: elapsed(start)
    })
  }

  const svg = input.data.toString('utf8')
  const processed = stripRootMaxWidth(svg)
  return withPostProcessLog(input.requestId, {
    data: Buffer.from(processed, 'utf8'),
    durationMs: elapsed(start)
  })
}

export function stripRootMaxWidth(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (match, attributes: string) => {
    const styleMatch = attributes.match(/\sstyle=(["'])(.*?)\1/i)
    if (!styleMatch) return match

    const declarations = styleMatch[2]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration.length > 0)
      .filter((declaration) => !/^max-width\s*:/i.test(declaration))

    const nextAttributes =
      declarations.length === 0
        ? attributes.replace(styleMatch[0], '')
        : attributes.replace(
            styleMatch[0],
            ` style=${styleMatch[1]}${declarations.join('; ')}${styleMatch[1]}`
          )

    return `<svg${nextAttributes}>`
  })
}

export function rewriteRootSvgId(svg: string, nextId: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (match, attributes: string) => {
    const idMatch = attributes.match(/\sid=(["'])(.*?)\1/i)
    if (!idMatch) return `<svg${attributes} id="${escapeAttribute(nextId)}">`

    return `<svg${attributes.replace(
      idMatch[0],
      ` id=${idMatch[1]}${escapeAttribute(nextId)}${idMatch[1]}`
    )}>`
  })
}

function elapsed(start: number): number {
  return Math.round((performance.now() - start) * 1000) / 1000
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function withPostProcessLog(
  requestId: string | undefined,
  result: PostProcessResult
): PostProcessResult {
  if (requestId) {
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        event: 'post_process_completed',
        post_process_ms: result.durationMs
      })
    )
  }
  return result
}
