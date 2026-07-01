import AnthropicModule from '@anthropic-ai/sdk'
import { convert } from 'html-to-text'

export type JobLinkDraft = {
  title: string
  companyName: string
  companyLogoUrl: string | null
  location: string | null
  isRemote: boolean
  salaryMin: number | null
  salaryMax: number | null
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null
  requiredSkills: string[]
  description: string
}

const AnthropicCtor = ((AnthropicModule as unknown as { default?: unknown }).default ??
  AnthropicModule) as new (args: { apiKey: string }) => {
  messages: {
    create: (args: {
      model: string
      max_tokens: number
      messages: Array<{ role: 'user'; content: string }>
    }) => Promise<{ content: Array<{ type: string; text: string }> }>
  }
}

const anthropicApiKey = process.env.ANTHROPIC_API_KEY
const client = anthropicApiKey ? new AnthropicCtor({ apiKey: anthropicApiKey }) : null

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const
type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

// ── HTML helpers ─────────────────────────────────────────────────────────────

function getMeta(html: string, property: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'))
  return m ? decodeEntities(m[1]) : null
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
}

// Converts HTML to plain text with real paragraph/list structure preserved
// (blank lines between paragraphs, "* " bullets), instead of a hand-rolled
// regex that misses plenty of real-world markup variations.
function htmlToReadableText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  }).trim()
}

function stripHtmlFlat(html: string): string {
  return htmlToReadableText(html).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
}

function resolveUrl(maybeUrl: string | null | undefined, sourceUrl: string): string | null {
  if (!maybeUrl) return null
  try {
    return new URL(maybeUrl, sourceUrl).toString()
  } catch {
    return null
  }
}

function cleanCompanyFromHostname(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname
    const stripped = hostname.replace(/^(www|jobs|careers|career|apply|talent|hiring)\./i, '')
    const label = stripped.split('.')[0]
    return label.charAt(0).toUpperCase() + label.slice(1)
  } catch {
    return 'Unknown'
  }
}

function mapEmploymentType(raw: unknown): EmploymentType | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const v = value.toUpperCase()
  if (v.includes('FULL')) return 'full_time'
  if (v.includes('PART')) return 'part_time'
  if (v.includes('INTERN')) return 'internship'
  if (v.includes('CONTRACT') || v.includes('TEMPORARY')) return 'contract'
  if (v.includes('FREELANCE') || v.includes('VOLUNTEER') || v.includes('OTHER') || v.includes('PER_DIEM')) return 'freelance'
  return null
}

// ── Schema.org JobPosting (Google-for-Jobs markup) ──────────────────────────
// Most ATS platforms (SuccessFactors, Workday, Greenhouse, Lever, LinkedIn...)
// embed this JSON-LD block server-side specifically so crawlers can index the
// posting, even when the visible page is a JS-rendered SPA shell with almost
// no useful text in the raw HTML. It's authoritative structured data, not a
// guess — reading it directly is far more reliable than asking an LLM to
// reconstruct the same fields from a sparse or noisy page.

type RawJobPosting = Record<string, unknown>

function findJobPostingJsonLd(html: string): RawJobPosting | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block[1].trim())
    } catch {
      continue
    }
    const candidates: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as RawJobPosting)?.['@graph'])
        ? ((parsed as RawJobPosting)['@graph'] as unknown[])
        : [parsed]

    for (const candidate of candidates) {
      const isJobPosting = (node: unknown) => {
        const type = (node as RawJobPosting)?.['@type']
        return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))
      }
      if (isJobPosting(candidate)) return candidate as RawJobPosting
      // Many sites wrap the posting in a generic WebPage node with the actual
      // JobPosting nested under mainEntity.
      const mainEntity = (candidate as RawJobPosting)?.mainEntity
      if (isJobPosting(mainEntity)) return mainEntity as RawJobPosting
    }
  }
  return null
}

// Some SPAs server-render their initial data as a hydration payload even
// though the visible page is built client-side — e.g. Next.js's __NEXT_DATA__
// or a window.__NUXT__/__INITIAL_STATE__ assignment. When present, it often
// contains the exact job data the page will render, in plain JSON, with zero
// need to execute anything. This is a best-effort text dump appended to the
// Claude prompt, not a strict schema — every site shapes this differently.
function findHydrationJson(html: string): string | null {
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (nextData) {
    try {
      JSON.parse(nextData[1])
      return nextData[1].slice(0, 20000)
    } catch {
      // fall through
    }
  }

  for (const varName of ['__NUXT__', '__INITIAL_STATE__', '__APOLLO_STATE__']) {
    const m = html.match(new RegExp(`window\\.${varName}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;?\\s*(?:</script>|\\n)`, 'i'))
    if (!m) continue
    try {
      JSON.parse(m[1])
      return m[1].slice(0, 20000)
    } catch {
      continue
    }
  }
  return null
}

function draftFromJsonLd(job: RawJobPosting, html: string, sourceUrl: string): JobLinkDraft {
  const org = job.hiringOrganization as RawJobPosting | string | undefined
  const orgName = typeof org === 'string' ? org : (org?.name as string | undefined)
  // schema.org allows `logo` to be a bare URL string OR an ImageObject { url: "..." }.
  const rawOrgLogo = typeof org === 'object' ? org?.logo : undefined
  const orgLogo =
    typeof rawOrgLogo === 'string' ? rawOrgLogo : typeof rawOrgLogo === 'object' ? (rawOrgLogo as RawJobPosting)?.url as string | undefined : undefined

  const rawLocations = job.jobLocation
  const locations: RawJobPosting[] = Array.isArray(rawLocations)
    ? (rawLocations as RawJobPosting[])
    : rawLocations
      ? [rawLocations as RawJobPosting]
      : []
  const address = locations[0]?.address as RawJobPosting | undefined
  const location = address
    ? [address.addressLocality, address.addressRegion].filter(Boolean).join(', ') || null
    : null

  const isRemote =
    job.jobLocationType === 'TELECOMMUTE' ||
    (Array.isArray(job.applicantLocationRequirements) && locations.length === 0)

  const salary = job.baseSalary as RawJobPosting | undefined
  const salaryValue = (salary?.value ?? salary) as RawJobPosting | number | undefined
  const salaryMin =
    typeof salaryValue === 'object' && salaryValue ? Number((salaryValue as RawJobPosting).minValue) : null
  const salaryMax =
    typeof salaryValue === 'object' && salaryValue ? Number((salaryValue as RawJobPosting).maxValue) : null
  const singleValue = typeof salaryValue === 'number' ? salaryValue : null

  const rawDescription = typeof job.description === 'string' ? job.description : ''
  const description = htmlToReadableText(rawDescription).slice(0, 6000)

  const rawTitle = typeof job.title === 'string' ? decodeEntities(job.title).trim() : ''
  const rawOrgName = orgName ? decodeEntities(orgName).trim() : ''

  return {
    title: rawTitle || fallbackDraft(html, sourceUrl).title,
    companyName: rawOrgName || cleanCompanyFromHostname(sourceUrl),
    companyLogoUrl: resolveUrl(orgLogo, sourceUrl) ?? resolveUrl(getMeta(html, 'og:image'), sourceUrl),
    location,
    isRemote: Boolean(isRemote),
    salaryMin: Number.isFinite(salaryMin) && salaryMin! > 0 ? Math.round(salaryMin!) : singleValue,
    salaryMax: Number.isFinite(salaryMax) && salaryMax! > 0 ? Math.round(salaryMax!) : null,
    employmentType: mapEmploymentType(job.employmentType),
    requiredSkills: typeof job.skills === 'string' ? [job.skills] : Array.isArray(job.skills) ? (job.skills as string[]) : [],
    description: description || fallbackDraft(html, sourceUrl).description,
  }
}

// ── Plain heuristic fallback (no structured data, no AI) ────────────────────

function fallbackDraft(html: string, sourceUrl: string): JobLinkDraft {
  const ogTitle = getMeta(html, 'og:title')
  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)

  return {
    title: ogTitle ?? (titleTagMatch ? decodeEntities(titleTagMatch[1].trim()) : 'Job opportunity'),
    companyName: getMeta(html, 'og:site_name') ?? cleanCompanyFromHostname(sourceUrl),
    companyLogoUrl: resolveUrl(getMeta(html, 'og:image'), sourceUrl),
    location: null,
    isRemote: false,
    salaryMin: null,
    salaryMax: null,
    employmentType: null,
    requiredSkills: [],
    description: getMeta(html, 'og:description') ?? getMeta(html, 'description') ?? '',
  }
}

// ── Claude: full extraction (no structured data available) or skills-only
// enrichment (structured data covers everything else already) ──────────────

function extractJsonObject(raw: string) {
  const trimmed = raw.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1)
  return trimmed
}

async function claudeFullExtraction(html: string, sourceUrl: string): Promise<JobLinkDraft> {
  const fallback = fallbackDraft(html, sourceUrl)
  if (!client) return fallback

  const text = stripHtmlFlat(html).slice(0, 15000)
  const hydrationJson = findHydrationJson(html)

  const prompt = `You extract structured job posting data from a webpage's text content. Return ONLY a JSON object, no other text, no markdown fences.

Schema:
{
  "title": "job title, exact as posted",
  "companyName": "hiring company name",
  "location": "city or region, or null if not stated",
  "isRemote": true|false,
  "salaryMin": integer or null (annual figure, no currency symbols),
  "salaryMax": integer or null,
  "employmentType": "full_time"|"part_time"|"contract"|"internship"|"freelance"|null,
  "requiredSkills": ["skill", ...] (max 12, only skills/technologies explicitly named in the text),
  "description": "the role description and responsibilities, in your own words but preserving all real content and structure from the text (not a 1-2 sentence summary), max 4000 characters"
}

RULES:
- Prefer the ADDITIONAL PAGE DATA block below (if present) over PAGE TEXT — it's the site's own raw data and is more complete than the visible text, which may be a near-empty loading shell on JS-rendered pages.
- Never invent a salary, location, or skill that is not stated in the text or data.
- If both are too sparse to extract a real description, use the page title as the description.
- If a field is not stated, use null (or false for isRemote, or [] for requiredSkills).

PAGE TITLE: ${fallback.title}
PAGE TEXT:
${text}${hydrationJson ? `\n\nADDITIONAL PAGE DATA (raw JSON the page uses to render itself):\n${hydrationJson}` : ''}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const parsed = JSON.parse(extractJsonObject(raw))

  return {
    title: String(parsed.title ?? fallback.title).slice(0, 200),
    companyName: String(parsed.companyName ?? fallback.companyName).slice(0, 120),
    companyLogoUrl: fallback.companyLogoUrl,
    location: parsed.location ? String(parsed.location).slice(0, 120) : null,
    isRemote: Boolean(parsed.isRemote),
    salaryMin: Number.isFinite(parsed.salaryMin) ? Math.max(0, Math.round(parsed.salaryMin)) : null,
    salaryMax: Number.isFinite(parsed.salaryMax) ? Math.max(0, Math.round(parsed.salaryMax)) : null,
    employmentType: EMPLOYMENT_TYPES.includes(parsed.employmentType) ? parsed.employmentType : null,
    requiredSkills: Array.isArray(parsed.requiredSkills)
      ? parsed.requiredSkills.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 12)
      : [],
    description: String(parsed.description ?? '').slice(0, 4000) || fallback.description,
  }
}

async function claudeSkillsOnly(description: string): Promise<string[]> {
  if (!client || description.trim().length < 40) return []

  const prompt = `List up to 12 specific skills or technologies explicitly named in this job description. Return ONLY a JSON array of strings, nothing else — e.g. ["Python","SQL"]. If none are named, return [].

${description.slice(0, 6000)}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const parsed = JSON.parse(extractJsonObject(raw))
  return Array.isArray(parsed) ? parsed.map((s) => String(s).trim()).filter(Boolean).slice(0, 12) : []
}

// ── Entry point ──────────────────────────────────────────────────────────────
// Priority: structured JobPosting data (authoritative) > Claude full
// extraction from page text > bare OG-tag/hostname heuristic.

export async function extractJobFromHtml(html: string, sourceUrl: string): Promise<JobLinkDraft> {
  const jobPosting = findJobPostingJsonLd(html)

  if (jobPosting) {
    const draft = draftFromJsonLd(jobPosting, html, sourceUrl)
    try {
      draft.requiredSkills = await claudeSkillsOnly(draft.description)
    } catch {
      // Structured fields are already solid; skills are a nice-to-have.
    }
    return draft
  }

  try {
    return await claudeFullExtraction(html, sourceUrl)
  } catch {
    return fallbackDraft(html, sourceUrl)
  }
}
