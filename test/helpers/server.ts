import { createServer } from 'node:http'

export interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

let activeServerCount = 0

export async function startTestServer(): Promise<TestServer> {
  process.env.RENDERER_MODE ??= 'cli'
  const { app, closeRenderer, readyRenderer } = await import('../../src/server/app.js')
  await readyRenderer()
  activeServerCount += 1
  const server = createServer(app)
  let closePromise: Promise<void> | null = null

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      closePromise ??= closeTestServer(server, closeRenderer)
      await closePromise
    }
  }
}

async function closeTestServer(
  server: ReturnType<typeof createServer>,
  closeRenderer: () => Promise<void>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
  activeServerCount = Math.max(0, activeServerCount - 1)
  if (activeServerCount === 0) {
    await closeRenderer()
  }
}
