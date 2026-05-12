import { CliFallbackAdapter } from './cliFallbackAdapter.js'
import type { MermaidRendererAdapter } from './mermaidRendererAdapter.js'
import { ProgrammaticAdapter } from './programmaticAdapter.js'

export function createRenderer(): MermaidRendererAdapter {
  return process.env.RENDERER_MODE === 'cli'
    ? new CliFallbackAdapter()
    : new ProgrammaticAdapter()
}
