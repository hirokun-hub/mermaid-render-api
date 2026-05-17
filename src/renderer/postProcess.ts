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
    void input.requestId
    return {
      data: input.data,
      durationMs: elapsed(start)
    }
  }

  let svg = input.data.toString('utf8')

  svg = forceForeignObjectOverflowVisible(svg)
  svg = forceForeignObjectInnerCentered(svg)

  if (input.postProcess?.strip_max_width) {
    svg = stripRootMaxWidth(svg)
  }

  void input.requestId
  return {
    data: Buffer.from(svg, 'utf8'),
    durationMs: elapsed(start)
  }
}

// tempered greedy token: matches only if inner content has no nested <div>
const INNER_DIV_TABLECELL_PATTERN =
  /(<foreignObject\b[^>]*>)(\s*)(<div\b[^>]*xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"[^>]*style="[^"]*display:\s*table-cell[^"]*"[^>]*>)((?:(?!<div\b)[\s\S])*?)(<\/div>)(\s*)(<\/foreignObject>)/gi

const FLEX_WRAPPER_OPEN =
  '<div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;justify-content:center;align-items:center;width:100%;height:100%">'

export function forceForeignObjectInnerCentered(svg: string): string {
  return svg.replace(
    INNER_DIV_TABLECELL_PATTERN,
    (_match, foOpen, ws1, divOpen, divContent, divClose, ws2, foClose) =>
      `${foOpen}${ws1}${FLEX_WRAPPER_OPEN}${divOpen}${divContent}${divClose}</div>${ws2}${foClose}`
  )
}

export function forceForeignObjectOverflowVisible(svg: string): string {
  return svg.replace(/<foreignObject\b([^>]*)>/gi, (_match, attrs: string) => {
    const styleMatch = /(^|\s)style=(["'])([\s\S]*?)\2/i.exec(attrs)
    if (styleMatch) {
      const prefix = styleMatch[1]
      const quote = styleMatch[2]
      const styleValue = styleMatch[3]
      if (styleDeclaresOverflow(styleValue)) {
        return `<foreignObject${attrs}>`
      }
      const newAttrs = attrs.replace(
        styleMatch[0],
        `${prefix}style=${quote}${styleValue};overflow:visible${quote}`
      )
      return `<foreignObject${newAttrs}>`
    }
    return `<foreignObject style="overflow:visible"${attrs}>`
  })
}

function styleDeclaresOverflow(styleValue: string): boolean {
  return styleValue.split(';').some((decl) => {
    const colonIdx = decl.indexOf(':')
    if (colonIdx === -1) return false
    return decl.slice(0, colonIdx).trim().toLowerCase() === 'overflow'
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
