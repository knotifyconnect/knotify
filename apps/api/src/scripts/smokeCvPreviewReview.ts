import {
  cvEvaluationPdfFixtures,
} from '../intelligence/cv/__fixtures__/evaluationCorpus.js'
import {
  createCvProfilePreview,
  type CvSkillCatalogEntry,
} from '../services/cvProfilePreview.js'
import type {
  CvExistingProfileSnapshot,
  CvReviewItem,
} from '../services/cvProfileReview.js'

const fixture = cvEvaluationPdfFixtures.find(
  (item) => item.id === 'english-two-column-right-dates'
)

if (!fixture) {
  throw new Error('Required review fixture is missing')
}

const catalog: CvSkillCatalogEntry[] = [
  { id: 1, name: 'TypeScript', category: 'Tech' },
  { id: 2, name: 'PostgreSQL', category: 'Tech' },
]

const legacyAnalyse = async () => ({
  extractedSkills: [
    {
      name: 'TypeScript',
      category: 'technical' as const,
      confidence: 'high' as const,
    },
    {
      name: 'PostgreSQL',
      category: 'technical' as const,
      confidence: 'high' as const,
    },
  ],
  careerPaths: [],
  experienceLevel: 'mid' as const,
  summary: 'Compatibility analysis completed locally.',
  provider: 'local' as const,
  profileExtract: {
    headline: null,
    bio: null,
    education: [],
    experience: [],
  },
})

const baseline = await createCvProfilePreview(fixture.buffer, {
  catalog,
  modelRuntime: null,
  legacyAnalyse,
})

const firstEducation = baseline.preview.education[0]
const firstExperience = baseline.preview.experience[0]
const firstSkill = baseline.preview.skills[0]
const firstLanguage = baseline.preview.languages[0]

if (!firstEducation || !firstExperience || !firstSkill || !firstLanguage) {
  throw new Error('Review fixture did not produce the expected baseline')
}

const existingProfile: CvExistingProfileSnapshot = {
  headline: baseline.preview.headline
    ? `${baseline.preview.headline} existing`
    : 'Existing profile headline',
  bio: baseline.preview.bio,
  languages: [firstLanguage],
  education: [{
    institution: firstEducation.institution,
    degree: firstEducation.degree,
    field: firstEducation.field,
    startYear: firstEducation.startYear,
    endYear: firstEducation.endYear,
  }],
  experience: [{
    company: firstExperience.company,
    role: firstExperience.role,
    startDate: firstExperience.startDate,
    endDate: firstExperience.endDate,
  }],
  skills: [{
    catalogSkillId: firstSkill.catalogSkillId,
    name: firstSkill.name,
  }],
}

const reviewed = await createCvProfilePreview(fixture.buffer, {
  catalog,
  modelRuntime: null,
  legacyAnalyse,
  existingProfile,
})

const review = reviewed.preview.review

if (!review.comparisonAvailable) {
  throw new Error('Existing profile comparison was not enabled')
}

if (
  review.education[0]?.action !== 'already-present' ||
  review.experience[0]?.action !== 'already-present' ||
  review.skills[0]?.action !== 'already-present' ||
  review.languages[0]?.action !== 'already-present'
) {
  throw new Error('Exact existing values were not recognized')
}

if (
  reviewed.preview.headline &&
  review.headline?.action !== 'keep-existing'
) {
  throw new Error('Existing headline was not protected')
}

if (
  reviewed.preview.bio &&
  review.bio?.action !== 'already-present'
) {
  throw new Error('Existing bio exact match was not recognized')
}

if (
  review.summary.alreadyPresent < 4 ||
  review.summary.protectedExisting <
    (reviewed.preview.headline ? 1 : 0)
) {
  throw new Error('Review summary counts are incorrect')
}

const allItems: Array<CvReviewItem<unknown>> = [
  ...(review.headline ? [review.headline] : []),
  ...(review.bio ? [review.bio] : []),
  ...review.education,
  ...review.experience,
  ...review.skills,
  ...review.languages,
]

if (
  allItems.some(
    (item) =>
      item.evidence.length > 3 ||
      item.evidence.some(
        (evidence) => evidence.text.length > 240
      )
  )
) {
  throw new Error('Review evidence exceeded the response bounds')
}

if (
  allItems.some(
    (item) =>
      item.candidateId.length === 0 ||
      item.reasonCodes.some((reason) => reason.length === 0)
  )
) {
  throw new Error('Review metadata contains unstable identifiers')
}

const noComparison = baseline.preview.review

if (
  noComparison.comparisonAvailable ||
  !(
    [
      noComparison.headline,
      noComparison.bio,
      ...noComparison.education,
      ...noComparison.experience,
      ...noComparison.skills,
      ...noComparison.languages,
    ] as Array<CvReviewItem<unknown> | null>
  )
    .filter((item) => item !== null)
    .every((item) =>
      item.reasonCodes.includes('existing-comparison-unavailable')
    )
) {
  throw new Error('Unavailable comparison was not surfaced explicitly')
}

if (
  Object.hasOwn(reviewed, 'rawText') ||
  Object.hasOwn(reviewed.preview, 'rawText') ||
  Object.hasOwn(reviewed.preview, 'canonicalText')
) {
  throw new Error('Review contract exposed raw document fields')
}

console.log('CV PREVIEW REVIEW EXISTING MATCHES: PASS')
console.log('CV PREVIEW REVIEW EXISTING PROTECTION: PASS')
console.log('CV PREVIEW REVIEW SOURCE EVIDENCE: PASS')
console.log('CV PREVIEW REVIEW SUMMARY COUNTS: PASS')
console.log('CV PREVIEW REVIEW COMPARISON FALLBACK: PASS')
console.log('CV PREVIEW REVIEW CONTRACT SMOKE: PASS')
