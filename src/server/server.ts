import 'dotenv/config'

import { execFile } from 'node:child_process'
import type { Server } from 'node:http'
import { promisify } from 'node:util'

import { app, closeRenderer, readyRenderer } from './app.js'
import { logStartup, logError } from '../utils/logger.js'

const execFileAsync = promisify(execFile)
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
const SHUTDOWN_FORCE_EXIT_MS = 15000
const RENDERER_DRAIN_TIMEOUT_MS = 12000

async function fetchMmdcVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('npx', ['--yes', 'mmdc', '--version'], {
      timeout: 5000
    })
    return stdout.trim()
  } catch (error) {
    logError('startup', error as Error, null, { stage: 'version_lookup' })
    return 'unknown'
  }
}

async function bootstrap(): Promise<void> {
  const version = await fetchMmdcVersion()
  logStartup(version)
  await readyRenderer()
  const server = app.listen(PORT, () => {
    console.info(`Server listening on port ${PORT}`)
  })
  installShutdownHandlers(server)
}

function installShutdownHandlers(server: Server): void {
  const shutdown = async () => {
    server.close(async () => {
      await closeRenderer({ drainTimeoutMs: RENDERER_DRAIN_TIMEOUT_MS })
      process.exit(0)
    })
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
