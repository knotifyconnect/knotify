import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

export const ogRouter = Router()

ogRouter.get('/fetch', requireAuth, async (req, res) => {
  const url = String(req.query.url ?? '').trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return res.status(422).json({ error: 'Invalid URL' })
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'NodeNet-Bot/1.0 (+https://knotify.app)' },
      signal: AbortSignal.timeout(5000),
    })
    const html = await response.text()

    function getMeta(property: string): string | null {
      const m =
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'))
      return m ? m[1] : null
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return res.json({
      url,
      title: getMeta('og:title') ?? titleMatch?.[1]?.trim() ?? null,
      description: getMeta('og:description') ?? getMeta('description') ?? null,
      image: getMeta('og:image') ?? null,
      site_name: getMeta('og:site_name') ?? null,
    })
  } catch {
    return res.status(422).json({ error: 'Could not fetch URL' })
  }
})
