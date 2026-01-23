import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'

import { app } from '../../src/server/app.js'
import {
  MERMAID_CONFIG_PATH,
  MERMAID_PADDING,
  generateMermaidConfig
} from '../../src/config.js'

export interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

export async function startTestServer(): Promise<TestServer> {
  // Generate Mermaid config file for tests
  const mermaidConfig = generateMermaidConfig(MERMAID_PADDING)
  await fs.writeFile(
    MERMAID_CONFIG_PATH,
    JSON.stringify(mermaidConfig, null, 2),
    'utf8'
  )

  const server = createServer(app)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
  }
}
