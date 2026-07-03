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
  provider: 'local'
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
  { name: 'French', category: 'language', aliases: ['french', 'franÃ§ais', 'francais'] },
  { name: 'Spanish', category: 'language', aliases: ['spanish', 'espaÃ±ol', 'espanol'] },
  { name: 'Italian', category: 'language', aliases: ['italian', 'italiano'] },
  { name: 'Portuguese', category: 'language', aliases: ['portuguese', 'portuguÃªs', 'portugues'] },
  { name: 'Mandarin', category: 'language', aliases: ['mandarin', 'chinese'] },
  { name: 'Japanese', category: 'language', aliases: ['japanese'] },
  { name: 'Korean', category: 'language', aliases: ['korean'] },
  { name: 'Arabic', category: 'language', aliases: ['arabic'] },
  { name: 'Russian', category: 'language', aliases: ['russian'] },
  { name: 'Hindi', category: 'language', aliases: ['hindi'] },
  { name: 'Dutch', category: 'language', aliases: ['dutch', 'nederlands'] },
  { name: 'Polish', category: 'language', aliases: ['polish'] },
  { name: 'Turkish', category: 'language', aliases: ['turkish'] },
  { name: 'Swedish', category: 'language', aliases: ['swedish'] },
  { name: 'Norwegian', category: 'language', aliases: ['norwegian'] },
  { name: 'Danish', category: 'language', aliases: ['danish'] },
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

type LocalCvSection =
  | 'header'
  | 'headline'
  | 'summary'
  | 'education'
  | 'experience'
  | 'skills'
  | 'languages'
  | 'other'

type LocalDateRange = {
  start: string
  end: string
  startYear: string
  endYear: string
  remainder: string
}

const localSectionRules: Array<{
  section: LocalCvSection
  pattern: RegExp
}> = [
  {
    section: 'headline',
    pattern: /^(headline|professional title|job title)$/i,
  },
  {
    section: 'summary',
    pattern:
      /^(summary|professional summary|profile|professional profile|about me|objective)$/i,
  },
  {
    section: 'education',
    pattern:
      /^(education|academic background|academic experience|qualifications?|studies)$/i,
  },
  {
    section: 'experience',
    pattern:
      /^(experience|work experience|professional experience|employment|career history|internships?|projects?)$/i,
  },
  {
    section: 'skills',
    pattern:
      /^(skills?|technical skills?|technologies|tools|competencies|tech stack|stack)$/i,
  },
  {
    section: 'languages',
    pattern: /^(languages?|language skills?)$/i,
  },
]

const localInstitutionPattern =
  /\b(university|universitÃ¤t|universitaet|hochschule|college|institute|school|academy|polytechnic|tum|lmu|rwth|tu\s+[a-z])/i

const localDegreePattern =
  /\b(bachelor(?:'s)?|master(?:'s)?|b\.?\s?sc\.?|m\.?\s?sc\.?|b\.?\s?a\.?|m\.?\s?a\.?|mba|ph\.?\s?d\.?|doctorate|diploma|degree|certificate|apprenticeship)\b/i

const localRolePattern =
  /\b(engineer|developer|manager|analyst|consultant|intern|assistant|researcher|scientist|designer|specialist|coordinator|lead|director|founder|owner|architect|administrator|officer|associate|working student|werkstudent|product|marketing|sales|operations|finance|accountant|teacher|professor)\b/i

const localCompanyPattern =
  /\b(gmbh|ag|se|ltd|limited|inc|llc|corp|corporation|company|group|solutions|technologies|technology|consulting|bank|university|institute)\b/i

const localMonthNumbers: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
}

const localMonthToken =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

const localDateToken =
  `(?:${localMonthToken}\\.?\\s+(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])[/.](?:19|20)\\d{2}|(?:19|20)\\d{2}[/.](?:0?[1-9]|1[0-2])|(?:19|20)\\d{2}|present|current|now)`

function localNormaliseText(value: string) {
  return (value || '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/[â€“â€”âˆ’]/g, '-')
    .replace(/[â–ªâ—¦â€£]/g, 'â€¢')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
}

function localHeading(line: string) {
  return line.trim().replace(/[:\-]+$/, '').trim()
}

function localHeadingMatch(
  line: string
): { section: LocalCvSection; remainder: string } | null {
  const inline = line.match(/^([^:]{2,40}):\s*(.+)$/)

  if (inline) {
    const heading = localHeading(inline[1])
    const rule = localSectionRules.find((item) =>
      item.pattern.test(heading)
    )

    if (rule) {
      return {
        section: rule.section,
        remainder: inline[2].trim(),
      }
    }
  }

  const heading = localHeading(line)
  const rule = localSectionRules.find((item) =>
    item.pattern.test(heading)
  )

  return rule
    ? {
        section: rule.section,
        remainder: '',
      }
    : null
}

function localSections(
  text: string
): Record<LocalCvSection, string[]> {
  const sections: Record<LocalCvSection, string[]> = {
    header: [],
    headline: [],
    summary: [],
    education: [],
    experience: [],
    skills: [],
    languages: [],
    other: [],
  }

  let current: LocalCvSection = 'header'

  for (const line of localNormaliseText(text).split('\n')) {
    const heading = localHeadingMatch(line)

    if (heading) {
      current = heading.section

      if (heading.remainder) {
        sections[current].push(heading.remainder)
      }

      continue
    }

    sections[current].push(line)
  }

  return sections
}

function localStripBullet(line: string) {
  return line.replace(/^[â€¢*\-]+\s*/, '').trim()
}

function localIsContactLine(line: string) {
  return /@|https?:\/\/|www\.|linkedin|github|\+?\d[\d\s()+-]{6,}/i.test(
    line
  )
}

function localNormaliseDate(value: string) {
  const token = value.trim().toLowerCase().replace(/\./g, '')

  if (/^(present|current|now)$/.test(token)) {
    return 'present'
  }

  const named = token.match(
    new RegExp(
      `^(${localMonthToken})\\s+((?:19|20)\\d{2})$`,
      'i'
    )
  )

  if (named) {
    const month = localMonthNumbers[named[1].toLowerCase()]
    return month ? `${named[2]}-${month}` : named[2]
  }

  const monthYear = token.match(
    /^(0?[1-9]|1[0-2])[/.]((?:19|20)\d{2})$/
  )

  if (monthYear) {
    return `${monthYear[2]}-${monthYear[1].padStart(2, '0')}`
  }

  const yearMonth = token.match(
    /^((?:19|20)\d{2})[/.](0?[1-9]|1[0-2])$/
  )

  if (yearMonth) {
    return `${yearMonth[1]}-${yearMonth[2].padStart(2, '0')}`
  }

  return /^(19|20)\d{2}$/.test(token) ? token : ''
}

function localDateRange(line: string): LocalDateRange | null {
  const range = line.match(
    new RegExp(
      `\\b(${localDateToken})\\b\\s*(?:-|to)\\s*\\b(${localDateToken})\\b`,
      'i'
    )
  )

  if (range) {
    const start = localNormaliseDate(range[1])
    const end = localNormaliseDate(range[2])

    return {
      start,
      end,
      startYear: start.slice(0, 4),
      endYear: end === 'present' ? '' : end.slice(0, 4),
      remainder: line
        .replace(range[0], ' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    }
  }

  const tokens = [
    ...line.matchAll(
      new RegExp(`\\b(${localDateToken})\\b`, 'gi')
    ),
  ]

  if (!tokens.length) return null

  const start = localNormaliseDate(tokens[0][1])
  const end = tokens[1]
    ? localNormaliseDate(tokens[1][1])
    : ''

  return {
    start,
    end,
    startYear: start.slice(0, 4),
    endYear: end === 'present' ? '' : end.slice(0, 4),
    remainder: tokens
      .reduce(
        (current, token) =>
          current.replace(token[0], ' '),
        line
      )
      .replace(/\s{2,}/g, ' ')
      .trim(),
  }
}

function localPreviousLines(
  lines: string[],
  index: number,
  maximum = 3
) {
  const result: string[] = []
  let foundContent = false

  for (
    let cursor = index - 1;
    cursor >= 0 && result.length < maximum;
    cursor -= 1
  ) {
    const line = lines[cursor].trim()

    if (!line) {
      if (foundContent) break
      continue
    }

    foundContent = true
    result.unshift(line)
  }

  return result
}

function localDescription(
  lines: string[],
  index: number,
  maximumLength: number
) {
  const parts: string[] = []

  for (
    let cursor = index + 1;
    cursor < lines.length && parts.length < 3;
    cursor += 1
  ) {
    const raw = lines[cursor].trim()

    if (!raw || localDateRange(raw)) break

    const line = localStripBullet(raw)
    const isDescription =
      /^[â€¢*\-]/.test(raw) ||
      line.length >= 35 ||
      /^(responsible|developed|built|managed|led|supported|created|analysed|analyzed|conducted|worked)\b/i.test(
        line
      )

    if (!isDescription) break
    parts.push(line)
  }

  return parts.join(' ').slice(0, maximumLength)
}

function localParts(lines: string[]) {
  return lines
    .flatMap((line) =>
      localStripBullet(line).split(/\s*[|â€¢Â·]\s*/)
    )
    .map((line) => line.trim())
    .filter(Boolean)
}

function localUniqueBy<T>(
  values: T[],
  keyFor: (value: T) => string
) {
  const seen = new Set<string>()

  return values.filter((value) => {
    const key = keyFor(value)

    if (!key || seen.has(key)) return false

    seen.add(key)
    return true
  })
}

function localDegreeAndField(line: string) {
  const match = line.match(localDegreePattern)

  if (!match || match.index === undefined) {
    return {
      degree: line.trim(),
      field: '',
    }
  }

  return {
    degree: match[0].trim(),
    field: line
      .slice(match.index + match[0].length)
      .replace(
        /^\s*(?:degree\s+)?(?:in|of)?\s*[:|,\-]?\s*/i,
        ''
      )
      .trim(),
  }
}

function localEducationCandidate(
  lines: string[],
  dates: LocalDateRange | null,
  description: string
): ProfileExtract['education'][number] | null {
  const parts = localParts(lines)
    .filter((line) => !localIsContactLine(line))
    .filter((line) => !localDateRange(line))

  const institution =
    parts.find((line) =>
      localInstitutionPattern.test(line)
    ) ??
    parts.find(
      (line) =>
        !localDegreePattern.test(line) &&
        !localRolePattern.test(line) &&
        line.length >= 3 &&
        line.length <= 140 &&
        line.split(/\s+/).length <= 14
    ) ??
    ''

  if (!institution) return null

  const degreeLine =
    parts.find((line) => localDegreePattern.test(line)) ??
    ''

  const parsedDegree = degreeLine
    ? localDegreeAndField(degreeLine)
    : {
        degree: '',
        field: '',
      }

  const field =
    parsedDegree.field ||
    parts.find(
      (line) =>
        line !== institution &&
        line !== degreeLine &&
        !localRolePattern.test(line) &&
        line.length <= 100
    ) ||
    ''

  return {
    institution: institution.slice(0, 200),
    degree: parsedDegree.degree.slice(0, 100),
    field: field.slice(0, 100),
    start_year: dates?.startYear ?? '',
    end_year: dates?.endYear ?? '',
    description,
  }
}

function localEducation(lines: string[]) {
  const entries: ProfileExtract['education'] = []

  for (let index = 0; index < lines.length; index += 1) {
    const dates = localDateRange(lines[index])

    if (!dates) continue

    const candidate = [
      ...localPreviousLines(lines, index),
      ...(dates.remainder ? [dates.remainder] : []),
    ]

    const entry = localEducationCandidate(
      candidate,
      dates,
      localDescription(lines, index, 500)
    )

    if (entry) entries.push(entry)
  }

  if (!entries.length) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!localInstitutionPattern.test(lines[index])) {
        continue
      }

      const entry = localEducationCandidate(
        lines.slice(
          Math.max(0, index - 1),
          Math.min(lines.length, index + 3)
        ),
        null,
        ''
      )

      if (entry) entries.push(entry)
    }
  }

  return localUniqueBy(
    entries,
    (entry) =>
      [
        entry.institution,
        entry.degree,
        entry.field,
        entry.start_year,
        entry.end_year,
      ]
        .join('|')
        .toLowerCase()
  ).slice(0, 6)
}

function localRoleAndCompany(lines: string[]) {
  const parts = localParts(lines)
    .filter((line) => !localIsContactLine(line))
    .filter((line) => !localDateRange(line))

  for (const line of parts) {
    const atMatch = line.match(
      /^(.+?)\s+(?:at|@)\s+(.+)$/i
    )

    if (atMatch && localRolePattern.test(atMatch[1])) {
      return {
        role: atMatch[1].trim(),
        company: atMatch[2].trim(),
      }
    }
  }

  for (const line of parts) {
    const split = line.split(/\s+-\s+/)

    if (split.length !== 2) continue

    if (localRolePattern.test(split[0])) {
      return {
        role: split[0].trim(),
        company: split[1].trim(),
      }
    }

    if (localRolePattern.test(split[1])) {
      return {
        role: split[1].trim(),
        company: split[0].trim(),
      }
    }
  }

  const role =
    parts.find((line) => localRolePattern.test(line)) ??
    ''

  if (!role) {
    return {
      role: '',
      company: '',
    }
  }

  const company =
    parts.find(
      (line) =>
        line !== role && localCompanyPattern.test(line)
    ) ??
    parts.find(
      (line) =>
        line !== role &&
        !localDegreePattern.test(line) &&
        line.length >= 2 &&
        line.length <= 100 &&
        line.split(/\s+/).length <= 12
    ) ??
    ''

  return {
    role,
    company,
  }
}

function localExperience(lines: string[]) {
  const entries: ProfileExtract['experience'] = []

  for (let index = 0; index < lines.length; index += 1) {
    const dates = localDateRange(lines[index])

    if (!dates) continue

    const candidate = [
      ...localPreviousLines(lines, index),
      ...(dates.remainder ? [dates.remainder] : []),
    ]
    const parsed = localRoleAndCompany(candidate)

    if (!parsed.role || !parsed.company) continue

    entries.push({
      company: parsed.company.slice(0, 200),
      role: parsed.role.slice(0, 120),
      start_date: dates.start,
      end_date: dates.end,
      description: localDescription(lines, index, 800),
    })
  }

  if (!entries.length) {
    for (const line of lines) {
      const parsed = localRoleAndCompany([line])

      if (!parsed.role || !parsed.company) continue

      entries.push({
        company: parsed.company.slice(0, 200),
        role: parsed.role.slice(0, 120),
        start_date: '',
        end_date: '',
        description: '',
      })
    }
  }

  return localUniqueBy(
    entries,
    (entry) =>
      [
        entry.company,
        entry.role,
        entry.start_date,
        entry.end_date,
      ]
        .join('|')
        .toLowerCase()
  ).slice(0, 8)
}

function localSummary(lines: string[]) {
  const value = lines
    .map(localStripBullet)
    .filter(Boolean)
    .filter((line) => !localIsContactLine(line))
    .slice(0, 4)
    .join(' ')
    .trim()

  return value ? value.slice(0, 500) : null
}

function localHeadline(
  sections: Record<LocalCvSection, string[]>
) {
  const explicit = sections.headline
    .map(localStripBullet)
    .find(Boolean)

  if (explicit) return explicit.slice(0, 120)

  const header = sections.header
    .map(localStripBullet)
    .filter(Boolean)
    .filter((line) => !localIsContactLine(line))
    .filter((line) => !localDateRange(line))
    .find(
      (line) =>
        localRolePattern.test(line) && line.length <= 120
    )

  return header ?? null
}

function extractLocalProfile(text: string): ProfileExtract {
  const sections = localSections(text)

  return {
    education: localEducation(sections.education),
    experience: localExperience(sections.experience),
    bio: localSummary(sections.summary),
    headline: localHeadline(sections),
  }
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
    profileExtract: extractLocalProfile(text),
  }
}
export async function analyseCv(
  cvText: string
): Promise<CvAnalysisResult> {
  return localAnalysis(cvText)
}
