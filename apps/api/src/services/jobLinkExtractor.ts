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

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance']

function getMeta(html: string, property: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'))
  return m ? m[1] : null
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1)
  return trimmed
}

function fallbackDraft(html: string, sourceUrl: string): JobLinkDraft {
  const ogTitle = getMeta(html, 'og:title')
  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const hostname = (() => {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, '')
    } catch {
      return 'Unknown'
    }
  })()

  return {
    title: ogTitle ?? titleTagMatch?.[1]?.trim() ?? 'Job opportunity',
    companyName: getMeta(html, 'og:site_name') ?? hostname,
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

export async function extractJobFromHtml(html: string, sourceUrl: string): Promise<JobLinkDraft> {
  const fallback = fallbackDraft(html, sourceUrl)
  if (!client) return fallback

  const text = stripHtml(html).slice(0, 15000)

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
  "description": "2-4 sentence plain-text summary of the role and responsibilities, max 600 characters, written by you (not copy-pasted)"
}

RULES:
- Never invent a salary, location, or skill that is not stated in the text.
- If a field is not stated, use null (or false for isRemote, or [] for requiredSkills).

PAGE TITLE: ${fallback.title}
PAGE TEXT:
${text}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
      description: String(parsed.description ?? '').slice(0, 2000) || fallback.description,
    }
  } catch {
    return fallback
  }
}
