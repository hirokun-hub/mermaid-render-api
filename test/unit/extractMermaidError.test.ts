import { describe, expect, test } from 'vitest'

import { extractMermaidError } from '../../src/utils/extractMermaidError.js'

describe('extractMermaidError', () => {
  test('extracts message and line from parse errors', () => {
    const result = extractMermaidError(
      'Error: Parse error on line 3:\n...A-->\nExpecting node'
    )

    expect(result).toEqual({
      errorType: 'parse_error',
      errorMessage: '...A-->\nExpecting node',
      line: 3
    })
  })

  test('extracts line from lexical errors', () => {
    const result = extractMermaidError(
      'Lexical error on line 12. Unrecognized text.'
    )

    expect(result.errorType).toBe('parse_error')
    expect(result.line).toBe(12)
  })

  test('does not include stack frames in extracted messages', () => {
    const result = extractMermaidError(
      'Parse error on line 3:\n...A-->\nExpecting "node"\n    at parse (mermaid.esm.mjs:1234)\n    at render (mermaid.esm.mjs:2345)'
    )

    expect(result).toEqual({
      errorType: 'parse_error',
      errorMessage: '...A-->\nExpecting "node"',
      line: 3
    })
  })

  test('stops parse error extraction before a following Error line', () => {
    const result = extractMermaidError(
      'Parse error on line 3:\n...A-->\nExpecting "node"\nError: render failed'
    )

    expect(result).toEqual({
      errorType: 'parse_error',
      errorMessage: '...A-->\nExpecting "node"',
      line: 3
    })
  })

  test('returns null line when no line number exists', () => {
    const result = extractMermaidError('Error: failed to render diagram')

    expect(result).toEqual({
      errorType: 'render_error',
      errorMessage: 'failed to render diagram',
      line: null
    })
  })

  test('returns null message for blank input', () => {
    const result = extractMermaidError('   ')

    expect(result).toEqual({
      errorType: 'render_error',
      errorMessage: null,
      line: null
    })
  })

  test('returns nulls when no known Mermaid error pattern matches', () => {
    const result = extractMermaidError('failed without a known prefix')

    expect(result).toEqual({
      errorType: 'render_error',
      errorMessage: null,
      line: null
    })
  })
})
