/**
 * Validates: REQ-E-04
 * PROP-5: パース失敗時の line が null または正整数
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'

import { extractMermaidError } from '../../src/utils/extractMermaidError.js'

describe('PROP-5: extractMermaidError line is null or positive integer (Validates: REQ-E-04)', () => {
  test('line is null or positive integer for parse error strings', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('Error: Parse error on line 3:\n...A-->\nExpecting node'),
          fc.constant('Lexical error on line 12. Unrecognized text.'),
          fc.constant('Error: Render failed'),
          fc.constant('')
        ),
        (s) => {
          const result = extractMermaidError(s)
          const { line } = result
          if (line !== null) {
            expect(Number.isInteger(line)).toBe(true)
            expect(line).toBeGreaterThan(0)
          } else {
            expect(line).toBeNull()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('line is always null or positive integer for any string input', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (s) => {
          const result = extractMermaidError(s)
          const { line } = result
          if (line !== null) {
            expect(Number.isInteger(line)).toBe(true)
            expect(line).toBeGreaterThan(0)
          } else {
            expect(line).toBeNull()
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
