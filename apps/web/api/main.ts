/**
 * Vercel serverless entry — hosts the full Express API.
 *
 * Vercel won't deploy bracket-name catch-all files [...slug].ts for this
 * Vite project, so we use a plain filename and rely on vercel.json's
 * rewrite to send all /api/* traffic here. The rewrite passes the
 * original path via the __path query param, which we restore on req.url
 * before handing the request to Express. Express then routes correctly
 * to cvRouter, asksRouter, etc.
 *
 * Dynamic import so any module-resolution issue surfaces as a runtime
 * 500 with the actual error message, not a silent build-time exclusion.
 */
import 'dotenv/config'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type ExpressLike = (req: unknown, res: unknown) => unknown

let cachedApp: ExpressLike | null = null

async function getApp(): Promise<ExpressLike> {
  if (cachedApp) return cachedApp
  // @ts-ignore - workspace symlink, types come from dist/app.d.ts
  const mod = await import('@nodenet/api/app')
  cachedApp = mod.app as ExpressLike
  return cachedApp
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Reconstruct the original URL from the __path query param set by the rewrite,
    // so Express sees /api/cv/upload (not /api/main).
    const raw = (req.query.__path as string | undefined) ?? ''
    const queryString = (() => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(req.query)) {
        if (key === '__path') continue
        if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
        else if (typeof value === 'string') params.append(key, value)
      }
      const qs = params.toString()
      return qs ? `?${qs}` : ''
    })()
    req.url = '/api/' + raw + queryString

    const app = await getApp()
    return app(req, res)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('serverless handler error:', err)
    res.status(500).json({
      error: 'Failed to initialise API',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
