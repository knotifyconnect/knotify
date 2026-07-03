import { isDeepStrictEqual } from 'node:util'
import { cvEvaluationPdfFixtures } from '../intelligence/cv/__fixtures__/evaluationCorpus.js'
import {
  englishCvFixture,
  germanCvFixture,
  undatedCvFixture,
} from '../intelligence/cv/__fixtures__/syntheticCvPdf.js'
import { classifyCvSections } from '../intelligence/cv/classifySections.js'
import type {
  CvCandidate,
  CvExperienceValue,
  CvNormalizedDate,
} from '../intelligence/cv/contracts.js'
import {
  extractCvDateRange,
  extractDeterministicCvCandidates,
} from '../intelligence/cv/extractDeterministicCandidates.js'
import { sortExperienceCandidates } from '../intelligence/cv/sortCvEntries.js'
import { twoColumnFixture } from '../intelligence/document/__fixtures__/syntheticPdf.js'
import { extractPdfLayout } from '../intelligence/document/extractPdfLayout.js'
import { normalizeDocument } from '../intelligence/document/normalizeDocument.js'

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message)
}

async function analyse(buffer: Buffer) {
  const extracted = await extractPdfLayout(buffer)
  const document = normalizeDocument(extracted)
  const classified = classifyCvSections(document)
  const candidates = extractDeterministicCvCandidates(classified)

  return { document, classified, candidates }
}

function date(
  year: number | null,
  month: number | null = null,
  current = false
): CvNormalizedDate {
  return {
    raw: current ? 'Present' : String(year),
    iso:
      current || year === null
        ? null
        : `${year}-${String(month ?? 1).padStart(2, '0')}-01`,
    year,
    month,
    current,
    precision: current ? null : month ? 'month' : 'year',
  }
}

function sortableCandidate(
  id: string,
  sourceOrder: number,
  startDate: CvNormalizedDate | null,
  endDate: CvNormalizedDate | null
): CvCandidate<CvExperienceValue> {
  return {
    id,
    kind: 'experience',
    value: {
      company: id,
      role: id,
      startDate,
      endDate,
      description: '',
    },
    confidence: 1,
    sourceBlockIds: [],
    evidence: [],
    warnings: [],
    sourceOrder,
  }
}

function candidateSourceText(
  candidate: CvCandidate<unknown>
) {
  return candidate.evidence.map((item) => item.text).join('\n')
}

async function main() {
  const english = await analyse(englishCvFixture)
  const englishSections = new Set(
    english.classified.blocks
      .filter((item) => item.headingSection)
      .map((item) => item.headingSection)
  )

  for (const section of [
    'summary',
    'experience',
    'education',
    'skills',
    'languages',
  ] as const) {
    assert(
      englishSections.has(section),
      `English CV section was not classified: ${section}`
    )
  }

  console.log('CV SECTION CLASSIFICATION: PASS')

  assert(
    english.candidates.experience.length === 2,
    'Expected two English experience candidates'
  )
  assert(
    english.candidates.experience[0].value.company === 'Acme GmbH' &&
      english.candidates.experience[0].value.role === 'Product Analyst',
    'Current experience company-role association is incorrect'
  )
  assert(
    english.candidates.experience[0].value.endDate?.current === true,
    'Current experience was not normalized'
  )
  assert(
    english.candidates.experience[1].value.company === 'Beta AG' &&
      english.candidates.experience[1].value.endDate?.year === 2022,
    'Past experience extraction is incorrect'
  )

  console.log('CV EXPERIENCE CANDIDATES: PASS')

  assert(
    english.candidates.education.length === 1,
    'Expected one English education candidate'
  )
  assert(
    english.candidates.education[0].value.institution ===
      'Technical University of Munich',
    'Education institution extraction is incorrect'
  )
  assert(
    english.candidates.education[0].value.degree === 'M.Sc.' &&
      english.candidates.education[0].value.field ===
        'Consumer Science',
    'Education degree-field extraction is incorrect'
  )

  console.log('CV EDUCATION CANDIDATES: PASS')

  const tableFixture = cvEvaluationPdfFixtures.find(
    (fixture) => fixture.id === 'table-multiple-degrees'
  )
  assert(tableFixture, 'Table education fixture is missing')

  const tableEducation = await analyse(tableFixture.buffer)
  assert(
    tableEducation.candidates.education.length === 2,
    'Expected two table-style education candidates'
  )
  assert(
    tableEducation.candidates.education[0].value.institution ===
      'Example University' &&
      tableEducation.candidates.education[0].value.degree === 'M.Sc.' &&
      tableEducation.candidates.education[0].value.field ===
        'Data Science' &&
      tableEducation.candidates.education[1].value.institution ===
        'Example College' &&
      tableEducation.candidates.education[1].value.degree === 'B.Sc.' &&
      tableEducation.candidates.education[1].value.field === 'Statistics',
    'Table education row association is incorrect'
  )
  assert(
    tableEducation.candidates.education.every(
      (item) => !item.warnings.includes('missing-degree')
    ),
    'Table education row retained a false missing-degree warning'
  )

  console.log('CV TABLE EDUCATION ASSOCIATION: PASS')

  assert(
    english.candidates.skills.map((item) => item.value.name).join(',') ===
      'SQL,Python,Tableau',
    'Skill candidates were not split or ordered correctly'
  )
  assert(
    english.candidates.languages.length === 2 &&
      english.candidates.languages[0].value.name === 'English' &&
      english.candidates.languages[0].value.proficiency === 'C1' &&
      english.candidates.languages[1].value.name === 'German' &&
      english.candidates.languages[1].value.proficiency === 'B2',
    'Language proficiency extraction is incorrect'
  )

  console.log('CV SKILL LANGUAGE CANDIDATES: PASS')

  const german = await analyse(germanCvFixture)

  assert(
    german.candidates.summary.length === 1 &&
      german.candidates.experience.length === 1 &&
      german.candidates.education.length === 1 &&
      german.candidates.skills.length === 2 &&
      german.candidates.languages.length === 2,
    'German CV headings were not classified consistently'
  )
  assert(
    german.candidates.experience[0].value.startDate?.iso ===
      '2020-03-01' &&
      german.candidates.experience[0].value.endDate?.iso ===
        '2022-12-01',
    'German numeric dates were not normalized'
  )

  console.log('CV GERMAN HEADINGS: PASS')

  const namedGermanDate = extractCvDateRange(
    'M\u00e4rz 2020 - heute'
  )
  const abbreviatedGermanDate = extractCvDateRange(
    'M\u00e4r. 2020 - heute'
  )
  const transliteratedGermanDate = extractCvDateRange(
    'Maerz 2020 - gegenw\u00e4rtig'
  )
  const dottedGermanDate = extractCvDateRange(
    '03.2020 - bis heute'
  )

  assert(
    namedGermanDate?.startDate?.iso === '2020-03-01' &&
      namedGermanDate.endDate?.current === true &&
      abbreviatedGermanDate?.startDate?.iso === '2020-03-01' &&
      abbreviatedGermanDate.endDate?.current === true &&
      transliteratedGermanDate?.startDate?.iso === '2020-03-01' &&
      transliteratedGermanDate.endDate?.current === true &&
      dottedGermanDate?.startDate?.iso === '2020-03-01' &&
      dottedGermanDate.endDate?.current === true,
    'German named month or current date was not normalized'
  )

  console.log('CV GERMAN DATES: PASS')
  const twoColumn = await analyse(twoColumnFixture)

  assert(
    twoColumn.document.pages[0].columns.length === 2,
    'CV candidate smoke lost two-column detection'
  )
  assert(
    twoColumn.candidates.skills.length === 3 &&
      twoColumn.candidates.languages.length === 2 &&
      twoColumn.candidates.experience.length === 1 &&
      twoColumn.candidates.education.length === 1,
    'Two-column section state leaked across columns'
  )

  console.log('CV TWO COLUMN ASSOCIATION: PASS')

  const undated = await analyse(undatedCvFixture)

  assert(
    undated.candidates.experience.length >= 1,
    'Undated experience was silently discarded'
  )
  assert(
    undated.candidates.experience.some((item) =>
      item.warnings.includes('missing-date')
    ),
    'Undated experience did not retain a warning'
  )

  console.log('CV UNDATED CANDIDATES: PASS')

  const allCandidates = [
    ...english.candidates.summary,
    ...english.candidates.experience,
    ...english.candidates.education,
    ...english.candidates.skills,
    ...english.candidates.languages,
  ]

  assert(
    allCandidates.every(
      (item) =>
        item.sourceBlockIds.length > 0 &&
        item.evidence.length > 0 &&
        candidateSourceText(item).length > 0
    ),
    'A CV candidate lost its source evidence'
  )
  assert(
    english.candidates.experience.every((item) => {
      const source = candidateSourceText(item)
      return (
        (!item.value.company || source.includes(item.value.company)) &&
        (!item.value.role || source.includes(item.value.role))
      )
    }),
    'Experience candidate contains a fabricated value'
  )

  console.log('CV SOURCE EVIDENCE: PASS')

  const sorted = sortExperienceCandidates([
    sortableCandidate('undated', 1, null, null),
    sortableCandidate('same-late-source', 8, date(2020), date(2022)),
    sortableCandidate('current', 9, date(2021), date(null, null, true)),
    sortableCandidate('later-end', 3, date(2020), date(2024)),
    sortableCandidate('later-start', 4, date(2022), date(2022)),
    sortableCandidate('same-early-source', 2, date(2020), date(2022)),
  ])

  assert(
    sorted.map((item) => item.id).join(',') ===
      [
        'current',
        'later-end',
        'later-start',
        'same-early-source',
        'same-late-source',
        'undated',
      ].join(','),
    'Authoritative CV sorting rule is incorrect'
  )

  console.log('CV SORTING RULE: PASS')

  const repeated = await analyse(englishCvFixture)

  assert(
    isDeepStrictEqual(english, repeated),
    'CV candidate extraction is not deterministic'
  )

  console.log('CV CANDIDATE DETERMINISM: PASS')
  console.log('CV CANDIDATE SMOKE: PASS')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})