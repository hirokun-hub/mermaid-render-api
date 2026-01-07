import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { app } from './app.js'
import { logStartup, logError } from '../utils/logger.js'

const execFileAsync = promisify(execFile)
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000

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
  app.listen(PORT, () => {
    console.info(`Server listening on port ${PORT}`)
  })
}

bootstrap().catch((error) => {
  logError('startup', error as Error, null, { stage: 'bootstrap' })
  process.exit(1)
})
