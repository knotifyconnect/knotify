import AnthropicModule from '@anthropic-ai/sdk'

type SkillCategory = 'technical' | 'soft' | 'language' | 'domain'
type Confidence = 'high' | 'medium' | 'low'
type Priority = 'high' | 'medium' | 'low'

type CareerPath = {
  title: string
  description: string
  matchScore: number
  skillGaps: Array<{ skill: string; priority: Priority }>
}

export type ProfileExtract = {
  education: Array<{
    institution: string
    degree: string
    field: string
    start_year: string
    end_year: string
    description: string
  }>
  experience: Array<{
    company: string
    role: string
    start_date: string
    end_date: string
    description: string
  }>
  bio: string | null
  headline: string | null
}

export type CvAnalysisResult = {
  extractedSkills: Array<{
    name: string
    category: SkillCategory
    confidence: Confidence
  }>
  careerPaths: CareerPath[]
  experienceLevel: 'student' | 'junior' | 'mid'
  summary: string
  provider: 'anthropic' | 'local'
  profileExtract: ProfileExtract
}

type SkillDef = {
  name: string
  category: SkillCategory
  aliases: string[]
}

type PathTemplate = {
  title: string
  description: string
  required: string[]
  signals: string[]
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
const providerMode = (process.env.CV_ANALYSIS_PROVIDER ?? 'auto').toLowerCase() // auto | anthropic | local
const client = anthropicApiKey ? new AnthropicCtor({ apiKey: anthropicApiKey }) : null

const skillDefs: SkillDef[] = [
  { name: 'JavaScript', category: 'technical', aliases: ['javascript', 'js'] },
  { name: 'TypeScript', category: 'technical', aliases: ['typescript', 'ts'] },
  { name: 'React', category: 'technical', aliases: ['react', 'reactjs'] },
  { name: 'Next.js', category: 'technical', aliases: ['next.js', 'nextjs'] },
  { name: 'Node.js', category: 'technical', aliases: ['node.js', 'nodejs', 'express'] },
  { name: 'HTML/CSS', category: 'technical', aliases: ['html', 'css', 'scss', 'sass'] },
  { name: 'Python', category: 'technical', aliases: ['python'] },
  { name: 'Java', category: 'technical', aliases: ['java'] },
  { name: 'C/C++', category: 'technical', aliases: ['c++', 'cpp', 'c programming', 'c language'] },
  { name: 'SQL', category: 'technical', aliases: ['sql'] },
  { name: 'PostgreSQL', category: 'technical', aliases: ['postgresql', 'postgres'] },
  { name: 'MongoDB', category: 'technical', aliases: ['mongodb', 'mongo'] },
  { name: 'Power BI', category: 'technical', aliases: ['power bi'] },
  { name: 'Tableau', category: 'technical', aliases: ['tableau'] },
  { name: 'Excel', category: 'technical', aliases: ['excel', 'spreadsheets'] },
  { name: 'Machine Learning', category: 'technical', aliases: ['machine learning', 'deep learning', 'ml model'] },
  { name: 'Data Analysis', category: 'domain', aliases: ['data analysis', 'analytics', 'data insights', 'reporting'] },
  { name: 'A/B Testing', category: 'domain', aliases: ['a/b test', 'ab test', 'experimentation'] },
  { name: 'Product Management', category: 'domain', aliases: ['product management', 'product manager', 'roadmap'] },
  { name: 'Project Management', category: 'soft', aliases: ['project management', 'project coordinator', 'delivery planning'] },
  { name: 'Stakeholder Management', category: 'soft', aliases: ['stakeholder', 'cross-functional'] },
  { name: 'Communication', category: 'soft', aliases: ['communication', 'presentation', 'presented'] },
  { name: 'Leadership', category: 'soft', aliases: ['leadership', 'led team', 'team lead'] },
  { name: 'Problem Solving', category: 'soft', aliases: ['problem solving', 'troubleshooting'] },
  { name: 'Team Collaboration', category: 'soft', aliases: ['collaboration', 'teamwork', 'worked closely'] },
  { name: 'German', category: 'language', aliases: ['german', 'deutsch'] },
  { name: 'English', category: 'language', aliases: ['english'] },
  { name: 'Armenian', category: 'language', aliases: ['armenian'] },
]

const pathTemplates: PathTemplate[] = [
  {
    title: 'Frontend Engineer',
    description: 'Fits UI-focused development with modern web stack and user-facing work.',
    required: ['JavaScript', 'TypeScript', 'React', 'HTML/CSS'],
    signals: ['frontend', 'ui', 'ux', 'web app', 'component'],
  },
  {
    title: 'Backend Engineer',
    description: 'Fits server-side/API engineering and data-layer implementation.',
    required: ['Node.js', 'SQL', 'PostgreSQL', 'Problem Solving'],
    signals: ['backend', 'api', 'server', 'microservice', 'database'],
  },
  {
    title: 'Full-Stack Engineer',
    description: 'Fits end-to-end product development across frontend and backend.',
    required: ['React', 'Node.js', 'SQL', 'TypeScript'],
    signals: ['full stack', 'end-to-end', 'frontend and backend', 'web platform'],
  },
  {
    title: 'Data Analyst',
    description: 'Fits analytical roles focused on insights, reporting, and decision support.',
    required: ['Data Analysis', 'SQL', 'Excel', 'Communication'],
    signals: ['analyst', 'dashboard', 'reporting', 'kpi', 'insights'],
  },
  {
    title: 'Product Analyst',
    description: 'Fits product-focused analytics and experimentation workflows.',
    required: ['Data Analysis', 'SQL', 'A/B Testing', 'Stakeholder Management'],
    signals: ['product', 'growth', 'funnel', 'experimentation', 'user behavior'],
  },
  {
    title: 'Product Operations Specialist',
    description: 'Fits process, coordination, and operations support for product teams.',
    required: ['Project Management', 'Stakeholder Management', 'Communication', 'Team Collaboration'],
    signals: ['operations', 'process', 'coordination', 'workflow', 'execution'],
  },
]

const stopSkillTerms = new Set([
  'curriculum vitae',
  'education',
  'experience',
  'summary',
  'references',
  'contact',
  'phone',
  'email',
  'address',
  'linkedin',
  'github',
])

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function countAliasMatches(text: string, alias: string) {
  const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi')
  const matches = text.match(re)
  return matches ? matches.length : 0
}

function inferExperienceLevel(text: string): 'student' | 'junior' | 'mid' {
  const lower = text.toLowerCase()
  if (/(student|bachelor|master|university|intern|internship)/i.test(lower)) return 'student'

  const yearsMatch = lower.match(/(\d+)\+?\s+years?/)
  const years = yearsMatch ? Number(yearsMatch[1]) : 0
  if (years >= 3) return 'mid'
  if (years >= 1) return 'junior'
  return 'student'
}

function extractSkillsFromSections(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const headingRegex = /^(skills?|technologies|tools|competencies|languages|tech stack|stack)\b[:\-]?$/i
  const headingLikeRegex = /^[A-Z][A-Za-z\s/&+-]{2,40}$/

  const collected: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    if (!headingRegex.test(lines[i])) continue

    for (let j = i + 1; j < Math.min(lines.length, i + 10); j += 1) {
      const line = lines[j]
      if (headingRegex.test(line)) break
      if (headingLikeRegex.test(line) && !line.includes(',')) break

      const parts = line
        .split(/[|,;•·]/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2 && p.length <= 40)

      for (const part of parts) {
        const lower = part.toLowerCase()
        if (stopSkillTerms.has(lower)) continue
        if (/^\d+$/.test(lower)) continue
        collected.push(part)
      }
    }
  }

  return collected
}

function mapTermToSkill(term: string): SkillDef | null {
  const lower = term.toLowerCase()
  for (const skill of skillDefs) {
    if (skill.aliases.some((alias) => lower === alias || lower.includes(alias))) {
      return skill
    }
  }
  return null
}

function localAnalysis(cvText: string): CvAnalysisResult {
  const text = cvText || ''
  const lower = text.toLowerCase()

  const scoreMap = new Map<string, { def: SkillDef; score: number }>()

  for (const def of skillDefs) {
    let aliasScore = 0
    for (const alias of def.aliases) {
      aliasScore += countAliasMatches(lower, alias)
    }
    if (aliasScore <= 0) continue

    scoreMap.set(def.name, { def, score: aliasScore })
  }

  const sectionTerms = extractSkillsFromSections(text)
  for (const term of sectionTerms) {
    const mapped = mapTermToSkill(term)
    if (!mapped) continue
    const existing = scoreMap.get(mapped.name)
    scoreMap.set(mapped.name, {
      def: mapped,
      score: (existing?.score ?? 0) + 2,
    })
  }

  const extractedSkills = [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((item) => ({
      name: item.def.name,
      category: item.def.category,
      confidence: (item.score >= 3 ? 'high' : 'medium') as Confidence,
    }))

  const knownSkills = new Set(extractedSkills.map((s) => s.name))

  const scoredPaths = pathTemplates
    .map((path) => {
      const matchedSkills = path.required.filter((s) => knownSkills.has(s))
      const missing = path.required.filter((s) => !knownSkills.has(s))
      const signalHits = path.signals.reduce((acc, signal) => acc + countAliasMatches(lower, signal), 0)

      const skillRatio = path.required.length ? matchedSkills.length / path.required.length : 0
      const score = Math.round(25 + skillRatio * 60 + Math.min(20, signalHits * 5))

      const evidence = matchedSkills.length + signalHits
      if (evidence === 0) return null

      const skillGaps = missing.map((skill, idx) => ({
        skill,
        priority: (idx < 2 ? 'high' : 'medium') as Priority,
      }))

      return {
        title: path.title,
        description: path.description,
        matchScore: Math.max(25, Math.min(95, score)),
        skillGaps,
      }
    })
    .filter((p): p is CareerPath => Boolean(p))
    .sort((a, b) => b.matchScore - a.matchScore)

  const fallbackPaths: CareerPath[] = [
    {
      title: 'Business Operations Specialist',
      description: 'Good early-career track if your CV emphasizes coordination, communication, and execution.',
      matchScore: 45,
      skillGaps: [
        { skill: 'Role-specific tooling', priority: 'high' },
        { skill: 'Quantified project outcomes', priority: 'medium' },
      ],
    },
    {
      title: 'Product/Project Coordinator',
      description: 'Fits structured collaboration and delivery support roles across teams.',
      matchScore: 42,
      skillGaps: [
        { skill: 'Stakeholder reporting cadence', priority: 'medium' },
        { skill: 'Roadmap/planning frameworks', priority: 'medium' },
      ],
    },
    {
      title: 'Junior Analyst',
      description: 'Fits data-informed decision support if analytical exposure is present.',
      matchScore: 40,
      skillGaps: [
        { skill: 'SQL querying depth', priority: 'high' },
        { skill: 'Dashboard storytelling', priority: 'medium' },
      ],
    },
  ]

  const careerPaths = (scoredPaths.length ? scoredPaths : fallbackPaths).slice(0, 3)

  const experienceLevel = inferExperienceLevel(text)
  const topSkills = extractedSkills.slice(0, 5).map((s) => s.name)

  const summary = topSkills.length
    ? `Local analysis (${experienceLevel}) identified strongest evidence for ${topSkills.join(', ')}.`
    : 'Local analysis could not reliably extract explicit skills from this PDF text. Consider adding a clear Skills section in plain text.'

  return {
    extractedSkills,
    careerPaths,
    experienceLevel,
    summary,
    provider: 'local',
    profileExtract: { education: [], experience: [], bio: null, headline: null },
  }
}

async function anthropicAnalysis(cvText: string): Promise<CvAnalysisResult> {
  if (!client) throw new Error('Anthropic client not configured')

  const prompt = `You are a professional CV parser. Extract structured data from the CV below. Only use information explicitly stated in the CV — never infer or hallucinate.

Return ONLY a valid JSON object (no markdown, no prose) with this exact structure. profileExtract comes FIRST so it is never truncated:

{
  "profileExtract": {
    "headline": "One-line professional headline synthesised from their most senior role/degree (e.g. 'Software Engineer at Siemens · TU Munich'). null if insufficient info.",
    "bio": "2-3 sentence professional story in first person, written as a compelling summary using only facts from the CV. null if insufficient info.",
    "education": [
      {
        "institution": "Exact institution name",
        "degree": "Exact degree as written, e.g. B.Sc. or Master of Science, or ''",
        "field": "Exact field of study, or ''",
        "start_year": "4-digit year only, or ''",
        "end_year": "4-digit year or 'present', or ''",
        "description": "Any description from the CV, max 150 chars, or ''"
      }
    ],
    "experience": [
      {
        "company": "Exact company name",
        "role": "Exact job title",
        "start_date": "YYYY-MM if month stated, YYYY-01 if year only, '' if missing",
        "end_date": "YYYY-MM or 'present' if stated, '' if missing",
        "description": "Description from the CV, max 200 chars, or ''"
      }
    ]
  },
  "extractedSkills": [
    { "name": "skill name", "category": "technical|soft|language|domain", "confidence": "high|medium|low" }
  ],
  "careerPaths": [
    {
      "title": "Career path title",
      "description": "1-2 sentences why this fits",
      "matchScore": 0,
      "skillGaps": [{ "skill": "skill name", "priority": "high|medium|low" }]
    }
  ],
  "experienceLevel": "student|junior|mid",
  "summary": "1 sentence summary of the CV"
}

RULES:
- profileExtract must come first in the JSON.
- Copy dates exactly. Year only → use YYYY-01. No date → use ''.
- Never add education or experience not in the CV.
- Max 6 education entries, 8 experience entries, 20 skills, 3 career paths.

CV TEXT:
${cvText.slice(0, 20000)}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  console.log('[cvAnalysis] raw response length:', raw.length)
  console.log('[cvAnalysis] raw response preview:', raw.slice(0, 300))
  const parsed = JSON.parse(extractJsonObject(raw))
  console.log('[cvAnalysis] parsed profileExtract:', JSON.stringify(parsed.profileExtract ?? null))

  const pe = parsed.profileExtract ?? {}
  return {
    extractedSkills: (parsed.extractedSkills ?? []).slice(0, 20),
    careerPaths: (parsed.careerPaths ?? []).slice(0, 3),
    experienceLevel: parsed.experienceLevel ?? 'student',
    summary: parsed.summary ?? 'Career profile generated from CV.',
    provider: 'anthropic',
    profileExtract: {
      headline: pe.headline ?? null,
      bio: pe.bio ?? null,
      education: (pe.education ?? []).slice(0, 6),
      experience: (pe.experience ?? []).slice(0, 8),
    },
  }
}

export async function analyseCv(cvText: string): Promise<CvAnalysisResult> {
  const forcedLocal = providerMode === 'local'
  const forcedAnthropic = providerMode === 'anthropic'

  if (forcedLocal) return localAnalysis(cvText)
  if (forcedAnthropic) return anthropicAnalysis(cvText)

  if (client) {
    try {
      return await anthropicAnalysis(cvText)
    } catch (err) {
      console.error('[cvAnalysis] Anthropic analysis failed, falling back to local:', err)
      return localAnalysis(cvText)
    }
  }

  return localAnalysis(cvText)
}
