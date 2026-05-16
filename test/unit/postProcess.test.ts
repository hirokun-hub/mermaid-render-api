import { describe, expect, test } from 'vitest'

import {
  applyPostProcess,
  buildSvgId,
  rewriteRootSvgId,
  stripRootMaxWidth
} from '../../src/renderer/postProcess.js'

describe('postProcess', () => {
  test('uses request scoped svg id by default', () => {
    expect(buildSvgId('req-1')).toBe('mermaid-req-1')
    expect(buildSvgId('req-1', { rewrite_ids: false })).toBeUndefined()
  })

  test('removes only max-width from root svg style', () => {
    const svg =
      '<svg style="max-width:300px; color:black;"><g style="max-width:20px"></g></svg>'

    expect(stripRootMaxWidth(svg)).toBe(
      '<svg style="color:black"><g style="max-width:20px"></g></svg>'
    )
  })

  test('removes root style attribute when max-width is the only declaration', () => {
    expect(stripRootMaxWidth('<svg style="max-width:300px"><g /></svg>')).toBe(
      '<svg><g /></svg>'
    )
  })

  test('removes mixed-case max-width declaration', () => {
    expect(stripRootMaxWidth('<svg style="MAX-WIDTH:300PX"><g /></svg>')).toBe(
      '<svg><g /></svg>'
    )
  })

  test('removes mixed-case max-width while preserving other declarations', () => {
    expect(
      stripRootMaxWidth('<svg style="MAX-WIDTH:300PX; color:black"><g /></svg>')
    ).toBe('<svg style="color:black"><g /></svg>')
  })

  test('is no-op when strip_max_width is false', () => {
    const svg = Buffer.from('<svg style="max-width:300px"></svg>', 'utf8')
    const result = applyPostProcess({
      data: svg,
      format: 'svg',
      postProcess: { strip_max_width: false }
    })

    expect(result.data.toString('utf8')).toBe(svg.toString('utf8'))
  })

  test('is no-op when beautiful defaults already avoid max-width', () => {
    const svg = Buffer.from('<svg width="100" height="100"></svg>', 'utf8')
    const result = applyPostProcess({
      data: svg,
      format: 'svg',
      postProcess: { strip_max_width: true }
    })

    expect(result.data.toString('utf8')).toBe(svg.toString('utf8'))
  })

  test('rewrites root svg id only', () => {
    const svg = '<svg id="mermaid-1"><g id="child"></g></svg>'

    expect(rewriteRootSvgId(svg, 'mermaid-req-1')).toBe(
      '<svg id="mermaid-req-1"><g id="child"></g></svg>'
    )
  })

  test('adds root svg id when missing', () => {
    expect(rewriteRootSvgId('<svg width="100"></svg>', 'mermaid-req-1')).toBe(
      '<svg width="100" id="mermaid-req-1"></svg>'
    )
  })
})
