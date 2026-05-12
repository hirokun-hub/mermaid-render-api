import { createServer } from 'node:http'

export interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

export async function startTestServer(): Promise<TestServer> {
  process.env.RENDERER_MODE ??= 'cli'
  const { app, readyRenderer } = await import('../../src/server/app.js')
  await readyRenderer()
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
