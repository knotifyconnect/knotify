import 'dotenv/config'
import type { IncomingMessage, ServerResponse } from 'node:http'

type ExpressApp = (request: IncomingMessage, response: ServerResponse) => unknown

let appPromise: Promise<ExpressApp> | undefined

function configured(name: string) {
  return Boolean(process.env[name]?.trim())
}

function applyDiagnosticCors(request: IncomingMessage, response: ServerResponse) {
  // Keep the deployed admin panel able to read a startup diagnostic. The main
  // app still owns the normal, environment-configured CORS policy.
  if (request.headers.origin === 'https://admin.knotify.pro') {
    response.setHeader('Access-Control-Allow-Origin', 'https://admin.knotify.pro')
    response.setHeader('Vary', 'Origin')
  }
}

async function loadApp() {
  if (!appPromise) {
    appPromise = import('./src/app.js').then((module) => module.app as ExpressApp)
  }
  return appPromise
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const pathname = new URL(request.url ?? '/', 'https://api.invalid').pathname

  try {
    const app = await loadApp()
    return app(request, response)
  } catch (error) {
    // A static app import makes Vercel report only FUNCTION_INVOCATION_FAILED,
    // including for /health. Keep the diagnostic endpoint independent so a
    // missing production variable can be fixed without blind redeployments.
    console.error('API startup failed:', error)
    applyDiagnosticCors(request, response)

    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret')
      response.statusCode = 204
      response.end()
      return
    }

    const required = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'ALLOWED_ORIGIN',
      'ADMIN_PANEL_SECRET',
    ]
    const missing = required.filter((name) => !configured(name))
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.statusCode = pathname === '/health' ? 503 : 500
    response.end(JSON.stringify({
      ok: false,
      error: 'API startup failed',
      missing,
    }))
  }
}

