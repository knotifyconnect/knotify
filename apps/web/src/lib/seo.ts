import { useEffect } from 'react'

const SITE_URL = 'https://knotify.pro'
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

type SeoConfig = {
  /** Full <title>. Keep ~55-60 chars, keyword first, brand last. */
  title: string
  /** Meta description, ~150-160 chars. */
  description: string
  /** Path of this route, e.g. "/employers". Used for canonical + og:url. */
  path: string
  /** Optional override for og:image. */
  image?: string
  /** Set true on pages that must not be indexed (auth, reset, etc.). */
  noindex?: boolean
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Imperatively manage per-route document head for SEO. Because knotify is a
 * client-rendered SPA, every route would otherwise share index.html's tags.
 * This gives Googlebot (which executes JS) a unique title/description/canonical
 * per public page. Static crawlers still get the index.html defaults + noscript.
 */
export function useSeo({ title, description, path, image, noindex }: SeoConfig) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`
    const ogImage = image ?? DEFAULT_OG_IMAGE

    document.title = title
    setMeta('meta[name="description"]', 'name', 'description', description)
    setMeta(
      'meta[name="robots"]',
      'name',
      'robots',
      noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1',
    )
    setCanonical(url)

    setMeta('meta[property="og:title"]', 'property', 'og:title', title)
    setMeta('meta[property="og:description"]', 'property', 'og:description', description)
    setMeta('meta[property="og:url"]', 'property', 'og:url', url)
    setMeta('meta[property="og:image"]', 'property', 'og:image', ogImage)

    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage)
  }, [title, description, path, image, noindex])
}
