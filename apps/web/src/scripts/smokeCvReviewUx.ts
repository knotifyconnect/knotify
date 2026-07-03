import {
  buildCvApplyPayload,
  createCvReviewDraft,
  summariseCvSelection,
  type CvPreview,
  type CvReviewItem,
} from '../components/profile/CvImportReviewModal.js'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function reviewItem<TExisting>(
  candidateId: string,
  overrides: Partial<CvReviewItem<TExisting>> = {}
): CvReviewItem<TExisting> {
  return {
    candidateId,
    state: 'ready',
    action: 'add',
    confidence: 'high',
    extractionMethod: 'deterministic',
    reasonCodes: [],
    warnings: [],
    evidence: [{ page: 1, text: `Evidence for ${candidateId}` }],
    existingValue: null,
    ...overrides,
  }
}

const preview: CvPreview = {
  headline: 'Product Engineer',
  bio: 'Builds trusted professional products.',
  education: [
    {
      candidateId: 'education-ready',
      institution: 'Example University',
      degree: 'M.Sc.',
      field: 'Computer Science',
      startYear: 2020,
      endYear: 2022,
      description: '',
      confidence: 'high',
      source: 'structured-local',
    },
    {
      candidateId: 'education-existing',
      institution: 'Existing University',
      degree: 'B.Sc.',
      field: 'Business',
      startYear: 2016,
      endYear: 2019,
      description: '',
      confidence: 'high',
      source: 'structured-local',
    },
  ],
  experience: [
    {
      candidateId: 'experience-review',
      company: 'Example GmbH',
      role: 'Product Analyst',
      startDate: '2023-01-01',
      endDate: null,
      description: '',
      confidence: 'medium',
      source: 'structured-local',
    },
  ],
  skills: [
    {
      candidateId: 'skill-ready',
      catalogSkillId: 12,
      name: 'TypeScript',
      category: 'Tech',
      confidence: 'high',
      matchedCatalog: true,
      source: 'structured-local',
    },
  ],
  languages: ['English'],
  review: {
    comparisonAvailable: true,
    summary: {
      ready: 3,
      review: 2,
      unresolved: 1,
      alreadyPresent: 1,
      protectedExisting: 1,
    },
    headline: reviewItem('headline', {
      state: 'review',
      action: 'keep-existing',
      reasonCodes: ['existing-value-protected'],
      existingValue: 'Senior Product Engineer',
    }),
    bio: reviewItem('bio'),
    education: [
      reviewItem('education-ready'),
      reviewItem('education-existing', {
        action: 'already-present',
        reasonCodes: ['existing-exact-match'],
        existingValue: {
          institution: 'Existing University',
          degree: 'B.Sc.',
          field: 'Business',
          startYear: 2016,
          endYear: 2019,
        },
      }),
    ],
    experience: [
      reviewItem('experience-review', {
        state: 'review',
        confidence: 'medium',
        reasonCodes: ['medium-confidence'],
      }),
    ],
    skills: [reviewItem('skill-ready')],
    languages: [reviewItem('language-ready')],
    unresolved: [
      {
        candidateId: 'unresolved-1',
        kind: 'experience',
        state: 'unresolved',
        action: 'review',
        reasonCodes: ['missing-company'],
        warnings: [],
        evidence: [{ page: 2, text: 'Research Assistant | 2022' }],
      },
    ],
  },
}

const draft = createCvReviewDraft(preview)

assert(draft.headline?.approved === false, 'Protected headline was auto-selected')
assert(draft.bio?.approved === true, 'Ready bio was not auto-selected')
assert(draft.education[0]?.approved === true, 'Ready education was not selected')
assert(
  draft.education[1]?.approved === false,
  'Already-present education was selected'
)
assert(
  draft.experience[0]?.approved === false,
  'Review experience was auto-selected'
)
assert(draft.skills[0]?.approved === true, 'Ready skill was not selected')
assert(draft.languages[0]?.approved === true, 'Ready language was not selected')

console.log('CV REVIEW UX SAFE DEFAULTS: PASS')

const payload = buildCvApplyPayload(draft)

assert(payload.profile.headline === undefined, 'Protected headline entered payload')
assert(payload.profile.bio?.value === preview.bio, 'Ready bio missing from payload')
assert(payload.education.length === 1, 'Already-present education was not suppressed')
assert(payload.experience.length === 0, 'Unreviewed experience entered payload')
assert(payload.skills.length === 1, 'Ready skill missing from payload')
assert(payload.profile.languages?.length === 1, 'Ready language missing from payload')

console.log('CV REVIEW UX APPLY PAYLOAD: PASS')

const summary = summariseCvSelection(draft, preview.review.unresolved.length)

assert(summary.add === 4, `Expected 4 additions, received ${summary.add}`)
assert(summary.update === 0, 'Unexpected replacement count')
assert(summary.keep === 2, `Expected 2 kept values, received ${summary.keep}`)
assert(summary.ignore === 1, `Expected 1 ignored value, received ${summary.ignore}`)
assert(summary.unresolved === 1, 'Unresolved count was lost')
assert(summary.selected === 4, 'Selected count is incorrect')

console.log('CV REVIEW UX CONFIRMATION SUMMARY: PASS')

if (draft.headline) {
  draft.headline.approved = true
  draft.headline.replaceExisting = true
}
draft.experience[0]!.approved = true

const reviewedPayload = buildCvApplyPayload(draft)
const reviewedSummary = summariseCvSelection(
  draft,
  preview.review.unresolved.length
)

assert(
  reviewedPayload.profile.headline?.replaceExisting === true,
  'Explicit headline replacement was not preserved'
)
assert(reviewedPayload.experience.length === 1, 'Reviewed experience was not added')
assert(reviewedSummary.update === 1, 'Replacement summary was not updated')
assert(reviewedSummary.add === 5, 'Reviewed addition summary was not updated')

console.log('CV REVIEW UX EXPLICIT APPROVAL: PASS')
console.log('CV SMART REVIEW UX SMOKE: PASS')
