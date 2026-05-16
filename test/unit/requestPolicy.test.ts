/**
 * REQ-D-06: Unit tests for classifyRequest() — the pure request policy function.
 * Tests cover: http/https block, data/about/blob allow, mermaid-cli intercept,
 * and the boundary case that prevents domain-extension bypass.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { classifyRequest } from '../../src/renderer/browserPool.js'

const mermaidCliEntry = fileURLToPath(import.meta.resolve('@mermaid-js/mermaid-cli'))
const mermaidCliFileUrl = `file://${mermaidCliEntry}`
const mermaidCliDirUrl = `file://${resolve(dirname(mermaidCliEntry), '..', 'src', 'index.js')}`

describe('classifyRequest: block external HTTP/HTTPS (C-S-05)', () => {
  test('http:// → block', () => {
    expect(classifyRequest('http://example.com/data')).toBe('block')
  })

  test('https:// → block', () => {
    expect(classifyRequest('https://example.com/data')).toBe('block')
  })

  test('https://api.internal/ → block', () => {
    expect(classifyRequest('https://169.254.169.254/metadata')).toBe('block')
  })
})

describe('classifyRequest: block unauthorized file: URLs (C-S-05)', () => {
  test('file:///etc/passwd → block', () => {
    expect(classifyRequest('file:///etc/passwd')).toBe('block')
  })

  test('file:///tmp/secrets → block', () => {
    expect(classifyRequest('file:///tmp/secrets')).toBe('block')
  })
})

describe('classifyRequest: allow safe protocols (C-S-05)', () => {
  test('data: → allow', () => {
    expect(classifyRequest('data:text/plain,hello')).toBe('allow')
  })

  test('about:blank → allow', () => {
    expect(classifyRequest('about:blank')).toBe('allow')
  })

  test('blob: → allow', () => {
    expect(classifyRequest('blob:http://localhost/550e8400')).toBe('allow')
  })
})

describe('classifyRequest: allow mermaid-cli local asset file: URLs (C-S-05)', () => {
  test('mermaid-cli entry file URL → allow', () => {
    expect(classifyRequest(mermaidCliFileUrl)).toBe('allow')
  })

  test('mermaid-cli package sub-path → allow', () => {
    expect(classifyRequest(mermaidCliDirUrl)).toBe('allow')
  })
})

describe('classifyRequest: intercept mermaid-cli pseudo-HTTPS origin (C-S-05)', () => {
  test('https://mermaid-cli-intercept.invalid/path/to/module.js → intercept', () => {
    expect(classifyRequest('https://mermaid-cli-intercept.invalid/some/module.js')).toBe('intercept')
  })

  test('https://mermaid-cli-intercept.invalid/nested/deep/path.js → intercept', () => {
    expect(classifyRequest('https://mermaid-cli-intercept.invalid/a/b/c/mermaid.esm.js')).toBe('intercept')
  })
})

describe('classifyRequest: reject domain-extension bypass (Finding 3)', () => {
  test('https://mermaid-cli-intercept.invalid.evil/ does NOT become intercept → block', () => {
    expect(classifyRequest('https://mermaid-cli-intercept.invalid.evil/malicious')).toBe('block')
  })

  test('bare origin without trailing slash → block (not intercept)', () => {
    expect(classifyRequest('https://mermaid-cli-intercept.invalid')).toBe('block')
  })

  test('https://mermaid-cli-intercept.invalid-prefix.com/ → block', () => {
    expect(classifyRequest('https://mermaid-cli-intercept.invalidx/path')).toBe('block')
  })
})
