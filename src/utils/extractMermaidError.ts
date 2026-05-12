export interface ExtractedMermaidError {
  errorType: 'parse_error' | 'render_error'
  errorMessage: string | null
  line: number | null
}

const ERROR_PATTERNS = [
  /Parse error on line\s+(\d+):\s*([\s\S]*?)(?=\n\s*at\s|\nError:|\n\n|$)/i,
  /Lexical error on line\s+(\d+)\.?\s*([\s\S]*?)(?=\n\s*at\s|\nError:|\n\n|$)/i,
  /Error:\s*([\s\S]*?)(?=\n\s*at\s|$)/i
] as const

/**
 * Extracts Mermaid's reported line as a nearby reference only; Mermaid v11 can
 * report shifted line numbers for some parser failures.
 */
export function extractMermaidError(rawErrorText: string): ExtractedMermaidError {
  for (const pattern of ERROR_PATTERNS) {
    const match = rawErrorText.match(pattern)
    if (!match) continue

    if (match.length === 3) {
      const line = Number(match[1])
      return {
        errorType: 'parse_error',
        errorMessage: normalizeMessage(match[2]),
        line: Number.isInteger(line) ? line : null
      }
    }

    return {
      errorType: 'render_error',
      errorMessage: normalizeMessage(match[1]),
      line: null
    }
  }

  return { errorType: 'render_error', errorMessage: null, line: null }
}

function normalizeMessage(message: string | undefined): string | null {
  const normalized = message?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}
