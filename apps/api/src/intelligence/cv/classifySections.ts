import type { StructuredDocument } from '../document/contracts.js'
import type {
  ClassifiedCvBlock,
  ClassifiedCvDocument,
  CvSectionKind,
} from './contracts.js'

const aliases: Record<Exclude<CvSectionKind, 'header' | 'other'>, string[]> = {
  summary: [
    'summary',
    'professional summary',
    'profile summary',
    'profile',
    'professional profile',
    'about me',
    'objective',
    'kurzprofil',
    'profil',
    'ueber mich',
    'uber mich',
    'zusammenfassung',
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'employment history',
    'career history',
    'internships',
    'berufserfahrung',
    'berufliche erfahrung',
    'praxiserfahrung',
    'praktika',
    'taetigkeiten',
    'tatigkeiten',
  ],
  education: [
    'education',
    'academic background',
    'academic experience',
    'qualifications',
    'studies',
    'ausbildung',
    'bildungsweg',
    'akademischer werdegang',
    'studium',
    'schulbildung',
  ],
  skills: [
    'skills',
    'technical skills',
    'technologies',
    'tools',
    'competencies',
    'expertise',
    'tech stack',
    'kenntnisse',
    'faehigkeiten',
    'fahigkeiten',
    'kompetenzen',
    'fachkenntnisse',
    'technologien',
    'werkzeuge',
  ],
  languages: [
    'languages',
    'language skills',
    'sprachkenntnisse',
    'sprachen',
  ],
  projects: [
    'projects',
    'project experience',
    'selected projects',
    'projekte',
    'projekterfahrung',
    'projektarbeit',
  ],
  certifications: [
    'certifications',
    'certificates',
    'licenses',
    'courses',
    'zertifikate',
    'weiterbildungen',
    'qualifikationen',
  ],
}

const ignoredSectionAliases = [
  'interests',
  'personal interests',
  'hobbies',
  'awards',
  'honors',
  'honours',
  'publications',
  'references',
  'volunteering',
  'volunteer experience',
  'achievements',
  'key achievements',
  'activities',
  'extracurriculars',
  'extracurricular activities',
  'key achievements and extracurriculars',
  'additional information',
  'community involvement',
  'leadership activities',
  'memberships',
]

const aliasIndex = new Map<string, CvSectionKind>([
  ...Object.entries(aliases).flatMap(([section, values]) =>
    values.map(
      (value) => [value, section as CvSectionKind] as const
    )
  ),
  ...ignoredSectionAliases.map(
    (value) => [value, 'other' as CvSectionKind] as const
  ),
])

function normaliseHeading(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitHeading(value: string) {
  const trimmed = value.trim()
  const colon = trimmed.indexOf(':')

  if (colon > 0 && colon <= 50) {
    return {
      label: trimmed.slice(0, colon),
      remainder: trimmed.slice(colon + 1).trim(),
    }
  }

  return { label: trimmed, remainder: '' }
}

function headingSection(value: string) {
  const { label, remainder } = splitHeading(value)
  const section = aliasIndex.get(normaliseHeading(label)) ?? null
  return { section, remainder }
}

function isHeadingCandidate(block: StructuredDocument['blocks'][number]) {
  const text = block.text.trim()
  const words = text.split(/\s+/)

  return (
    block.kind === 'heading' ||
    (text.length <= 60 && words.length <= 6)
  )
}

const unknownBoundaryPattern =
  /\b(achievement|achievements|activity|activities|extracurricular|extracurriculars|interest|interests|hobby|hobbies|award|awards|honor|honors|honour|honours|publication|publications|reference|references|volunteer|volunteering|community|leadership|membership|memberships|additional information|personal details)\b/i

const entryLikeHeadingPattern =
  /\b(engineer|developer|manager|management|analyst|consultant|intern|internship|assistant|researcher|scientist|designer|specialist|coordinator|lead|director|founder|owner|architect|administrator|officer|associate|student|werkstudent|professor|teacher|gmbh|ag|ltd|limited|inc|llc|company|university|college|institute|hochschule|bachelor|master|diploma|degree)\b/i

function isUnknownSectionBoundary(
  block: StructuredDocument['blocks'][number]
) {
  if (block.kind !== 'heading') return false

  const text = block.text.trim()
  if (!text || /(?:19|20)\d{2}/.test(text)) return false
  if (/^[\s]*(?:[\u27a2\u2794\u25b8\u25ba>])/.test(text)) {
    return false
  }

  const normalised = normaliseHeading(text)
  if (entryLikeHeadingPattern.test(normalised)) return false

  const words = normalised.split(/\s+/).filter(Boolean)
  const letters = text.replace(/[^\p{L}]/gu, '')
  const uppercase =
    letters.length >= 3 && letters === letters.toUpperCase()

  return (
    unknownBoundaryPattern.test(normalised) ||
    (uppercase && words.length >= 3 && words.length <= 10)
  )
}

export function classifyCvSections(
  document: StructuredDocument
): ClassifiedCvDocument {
  const currentByColumn = new Map<number, CvSectionKind>()
  let globalSection: CvSectionKind = 'header'
  const classified: ClassifiedCvBlock[] = []

  for (const block of document.blocks) {
    const heading = isHeadingCandidate(block)
      ? headingSection(block.text)
      : { section: null, remainder: '' }

    if (heading.section) {
      if (block.column === 0) {
        globalSection = heading.section
        currentByColumn.set(1, heading.section)
        currentByColumn.set(2, heading.section)
      } else {
        currentByColumn.set(block.column, heading.section)
      }

      classified.push({
        block,
        section: heading.section,
        headingSection: heading.section,
        contentText: heading.remainder,
      })
      continue
    }

    if (isUnknownSectionBoundary(block)) {
      if (block.column === 0) {
        globalSection = 'other'
        currentByColumn.set(1, 'other')
        currentByColumn.set(2, 'other')
      } else {
        currentByColumn.set(block.column, 'other')
      }

      classified.push({
        block,
        section: 'other',
        headingSection: 'other',
        contentText: '',
      })
      continue
    }

    const section =
      block.column === 0
        ? globalSection
        : currentByColumn.get(block.column) ?? globalSection

    classified.push({
      block,
      section,
      headingSection: null,
      contentText: block.text.trim(),
    })
  }

  return { blocks: classified }
}
