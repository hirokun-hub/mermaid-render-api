import { createServer } from 'node:http'

import { app } from '../../src/server/app.js'

export interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

export async function startTestServer(): Promise<TestServer> {
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
