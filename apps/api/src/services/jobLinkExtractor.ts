import AnthropicModule from '@anthropic-ai/sdk'

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

// Strips tags but keeps paragraph/list structure as newlines, so a job
// description reads like the original posting instead of one run-on line.
function htmlToReadableText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|h[1-6]|tr|li|ul|ol)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHtmlFlat(html: string): string {
  return htmlToReadableText(html).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
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
      const type = (candidate as RawJobPosting)?.['@type']
      const isJobPosting = type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))
      if (isJobPosting) return candidate as RawJobPosting
    }
  }
  return null
}

function draftFromJsonLd(job: RawJobPosting, html: string, sourceUrl: string): JobLinkDraft {
  const org = job.hiringOrganization as RawJobPosting | string | undefined
  const orgName = typeof org === 'string' ? org : (org?.name as string | undefined)
  const orgLogo = typeof org === 'object' ? (org?.logo as string | undefined) : undefined

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

  return {
    title: (typeof job.title === 'string' && job.title.trim()) || fallbackDraft(html, sourceUrl).title,
    companyName: (orgName && orgName.trim()) || cleanCompanyFromHostname(sourceUrl),
    companyLogoUrl: orgLogo ?? getMeta(html, 'og:image'),
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
    companyLogoUrl: getMeta(html, 'og:image'),
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
- Never invent a salary, location, or skill that is not stated in the text.
- If the page text is too sparse to extract a real description, use the page title as the description.
- If a field is not stated, use null (or false for isRemote, or [] for requiredSkills).

PAGE TITLE: ${fallback.title}
PAGE TEXT:
${text}`

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
