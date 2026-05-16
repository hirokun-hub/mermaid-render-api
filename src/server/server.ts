import 'dotenv/config'

import type { Server } from 'node:http'

import { app, closeRenderer, readyRenderer } from './app.js'
import { logStartup, logError } from '../utils/logger.js'
import { RENDERER_MODE } from '../config.js'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
const SHUTDOWN_FORCE_EXIT_MS = 15000
const RENDERER_DRAIN_TIMEOUT_MS = 12000

async function bootstrap(): Promise<void> {
  logStartup(RENDERER_MODE)
  await readyRenderer()
  const server = app.listen(PORT, () => {
    console.info(`Server listening on port ${PORT}`)
  })
  installShutdownHandlers(server)
}

function installShutdownHandlers(server: Server): void {
  const shutdown = async () => {
    await closeRenderer({ drainTimeoutMs: RENDERER_DRAIN_TIMEOUT_MS })
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), SHUTDOWN_FORCE_EXIT_MS).unref()
  }

  process.once('SIGTERM', () => {
    void shutdown()
  })
  process.once('SIGINT', () => {
    void shutdown()
  })
}

bootstrap().catch((error) => {
  logError('startup', error as Error, null, { stage: 'bootstrap' })
  process.exit(1)
})
