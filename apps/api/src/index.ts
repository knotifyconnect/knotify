import 'dotenv/config'
import { app } from './app.js'
import { deploymentConfig } from './config/deployment.js'

const server = app.listen(
  deploymentConfig.port,
  deploymentConfig.host,
  () => {
    console.log(
      `API listening on http://${deploymentConfig.host}:${deploymentConfig.port}`
    )
  }
)

let shuttingDown = false

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`${signal} received; closing HTTP server`)

  const forceExit = setTimeout(() => {
    console.error('HTTP shutdown timed out')
    process.exit(1)
  }, 10_000)

  forceExit.unref()

  server.close((error) => {
    clearTimeout(forceExit)

    if (error) {
      console.error('HTTP shutdown failed', error)
      process.exit(1)
    }

    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
