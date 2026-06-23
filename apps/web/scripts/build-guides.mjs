// Prerenders the markdown guides in content/guides/ into fully static, crawlable
// HTML pages under dist/guides/<slug>/index.html, builds a guides index page, and
// regenerates dist/sitemap.xml. Runs after `vite build` (see package.json build).
//
// These pages are pure content (no auth, no heavy deps), so serving them as static
// HTML gives search engines and social scrapers complete markup, not the SPA shell.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT_DIR = join(ROOT, 'content', 'guides')
const DIST = join(ROOT, 'dist')
const GUIDES_OUT = join(DIST, 'guides')

const SITE = 'https://knotify.pro'
const FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&display=swap'

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Minimal frontmatter parser: a leading --- ... --- block of single-line key: value pairs.
function parse(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: raw }
  const data = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    data[key] = val
  }
  return { data, body: m[2] }
}

const CSS = `
  :root {
    --paper: #F4EFE6; --paper-soft: #EDE8DF; --ink: #1A1109; --ink-muted: #54483A;
    --ink-faint: #8a7d6d; --signal: #D8442B; --rule: rgba(26,17,9,0.10);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink);
    font-family: 'IBM Plex Sans', system-ui, sans-serif; line-height: 1.65;
    -webkit-font-smoothing: antialiased; }
  a { color: var(--signal); }
  .nav { display: flex; align-items: center; justify-content: space-between;
    max-width: 720px; margin: 0 auto; padding: 22px 24px; }
  .wordmark { font-family: 'Fraunces', Georgia, serif; font-size: 24px; font-weight: 600;
    letter-spacing: -0.02em; color: var(--ink); text-decoration: none; }
  .wordmark span { color: var(--signal); }
  .cta-btn { background: var(--signal); color: #fff; text-decoration: none;
    padding: 9px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; }
  main { max-width: 720px; margin: 0 auto; padding: 16px 24px 64px; }
  .crumb { font-size: 13px; color: var(--ink-faint); margin: 12px 0 24px; }
  .crumb a { color: var(--ink-muted); text-decoration: none; }
  .meta { font-size: 13px; color: var(--ink-faint); margin: 0 0 8px;
    text-transform: uppercase; letter-spacing: 0.06em; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 400; letter-spacing: -0.03em;
    font-size: clamp(34px, 5vw, 48px); line-height: 1.05; margin: 0 0 24px; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; letter-spacing: -0.02em;
    font-size: 28px; margin: 44px 0 12px; }
  article p { font-size: 17px; color: var(--ink-muted); margin: 0 0 18px; }
  article ul, article ol { font-size: 17px; color: var(--ink-muted); padding-left: 22px; }
  article li { margin: 6px 0; }
  article strong { color: var(--ink); }
  .endcta { background: var(--paper-soft); border: 0.5px solid var(--rule); border-radius: 16px;
    padding: 28px; margin: 48px 0 0; text-align: center; }
  .endcta h3 { font-family: 'Fraunces', Georgia, serif; font-weight: 400; font-size: 26px;
    margin: 0 0 8px; }
  .endcta p { color: var(--ink-muted); margin: 0 0 18px; }
  .index-list { list-style: none; padding: 0; margin: 24px 0 0; }
  .index-list li { border-top: 0.5px solid var(--rule); padding: 22px 0; }
  .index-list a { font-family: 'Fraunces', Georgia, serif; font-size: 24px; font-weight: 500;
    color: var(--ink); text-decoration: none; letter-spacing: -0.02em; }
  .index-list p { font-size: 15px; color: var(--ink-muted); margin: 8px 0 0; }
  footer { border-top: 0.5px solid var(--rule); max-width: 720px; margin: 0 auto;
    padding: 28px 24px; display: flex; gap: 20px; flex-wrap: wrap; font-size: 13px; }
  footer a { color: var(--ink-faint); text-decoration: none; }
`

function shell({ title, description, canonical, head = '', body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="geo.region" content="DE-BY" /><meta name="geo.placename" content="Munich" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${SITE}/og-image.png" />
<meta property="og:site_name" content="knotify" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${SITE}/og-image.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${FONTS}" rel="stylesheet" />
<style>${CSS}</style>
${head}
</head>
<body>
<div class="nav">
  <a class="wordmark" href="/">knotify<span>.</span></a>
  <a class="cta-btn" href="/">Join waiting list</a>
</div>
${body}
<footer>
  <a href="/">Home</a>
  <a href="/guides/">Guides</a>
  <a href="/employers">For employers</a>
  <a href="/privacy">Privacy</a>
  <a href="/impressum">Impressum</a>
  <span style="color:var(--ink-faint)">&copy; 2026 knotify &middot; Munich</span>
</footer>
</body>
</html>`
}

// ── Load + parse guides ───────────────────────────────────────────────────────
const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'))
const guides = files
  .map((file) => {
    const slug = file.replace(/\.md$/, '')
    const { data, body } = parse(readFileSync(join(CONTENT_DIR, file), 'utf8'))
    return { slug, data, html: marked.parse(body) }
  })
  .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))

// ── Write each guide ──────────────────────────────────────────────────────────
mkdirSync(GUIDES_OUT, { recursive: true })

for (const g of guides) {
  const url = `${SITE}/guides/${g.slug}`
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.data.title,
    description: g.data.description,
    datePublished: g.data.date,
    dateModified: g.data.date,
    author: { '@type': 'Organization', name: 'knotify' },
    publisher: { '@type': 'Organization', name: 'knotify', logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` } },
    image: `${SITE}/og-image.png`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides/` },
      { '@type': 'ListItem', position: 3, name: g.data.title, item: url },
    ],
  }
  const head = `<script type="application/ld+json">${JSON.stringify(articleLd)}</script>
<script type="application/ld+json">${JSON.stringify(crumbLd)}</script>`

  const body = `<main>
  <div class="crumb"><a href="/">Home</a> / <a href="/guides/">Guides</a> / ${esc(g.data.title)}</div>
  <div class="meta">${esc(g.data.readingTime || 'Guide')}</div>
  <h1>${esc(g.data.title)}</h1>
  <article>${g.html}</article>
  <div class="endcta">
    <h3>Networks worth keeping.</h3>
    <p>knotify is the professional network for internationals and students in Munich.</p>
    <a class="cta-btn" href="/">Join the waiting list</a>
  </div>
</main>`

  mkdirSync(join(GUIDES_OUT, g.slug), { recursive: true })
  writeFileSync(join(GUIDES_OUT, g.slug, 'index.html'), shell({
    title: `${g.data.title} · knotify`,
    description: g.data.description,
    canonical: url,
    head,
    body,
  }))
}

// ── Write guides index ────────────────────────────────────────────────────────
const indexBody = `<main>
  <div class="crumb"><a href="/">Home</a> / Guides</div>
  <h1>Guides to networking in Munich</h1>
  <article><p>Practical guides for international students, expats and professionals building a real network in Munich.</p></article>
  <ul class="index-list">
    ${guides
      .map(
        (g) => `<li>
      <a href="/guides/${g.slug}">${esc(g.data.title)}</a>
      <p>${esc(g.data.description)}</p>
    </li>`,
      )
      .join('\n')}
  </ul>
</main>`

writeFileSync(join(GUIDES_OUT, 'index.html'), shell({
  title: 'Guides to Networking in Munich · knotify',
  description: 'Practical guides for international students, expats and professionals building a real professional network in Munich.',
  canonical: `${SITE}/guides/`,
  body: indexBody,
}))

// ── Regenerate sitemap (static routes + guides) ───────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const staticUrls = [
  { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/guides/`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/employers`, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE}/privacy`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITE}/impressum`, changefreq: 'yearly', priority: '0.3' },
]
const guideUrls = guides.map((g) => ({
  loc: `${SITE}/guides/${g.slug}`,
  changefreq: 'monthly',
  priority: '0.7',
}))
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...guideUrls]
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`
writeFileSync(join(DIST, 'sitemap.xml'), sitemap)

console.log(`[build-guides] wrote ${guides.length} guides + index + sitemap (${staticUrls.length + guideUrls.length} urls)`)
