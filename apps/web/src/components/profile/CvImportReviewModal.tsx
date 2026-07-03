import { useMemo, useState } from 'react'
import { KBtn } from '../../lib/knotify'

export type CvCatalogCategory =
  | 'Tech'
  | 'Design'
  | 'Business'
  | 'Science'
  | 'Other'

export type CvReviewState = 'ready' | 'review' | 'unresolved'

export type CvReviewAction =
  | 'add'
  | 'already-present'
  | 'keep-existing'
  | 'review'

export type CvReviewEvidence = {
  page: number
  text: string
}

export type CvReviewItem<TExisting = unknown> = {
  candidateId: string
  state: CvReviewState
  action: CvReviewAction
  confidence: 'high' | 'medium' | 'low'
  extractionMethod: 'deterministic' | 'model-resolved'
  reasonCodes: string[]
  warnings: string[]
  evidence: CvReviewEvidence[]
  existingValue: TExisting | null
}

export type CvUnresolvedReviewItem = {
  candidateId: string
  kind: string
  state: 'unresolved'
  action: 'review'
  reasonCodes: string[]
  warnings: string[]
  evidence: CvReviewEvidence[]
}

export type CvProfilePreviewReview = {
  comparisonAvailable: boolean
  summary: {
    ready: number
    review: number
    unresolved: number
    alreadyPresent: number
    protectedExisting: number
  }
  headline: CvReviewItem<string> | null
  bio: CvReviewItem<string> | null
  education: Array<
    CvReviewItem<{
      institution: string
      degree: string
      field: string
      startYear: number | null
      endYear: number | null
    }>
  >
  experience: Array<
    CvReviewItem<{
      company: string
      role: string
      startDate: string | null
      endDate: string | null
    }>
  >
  skills: Array<
    CvReviewItem<{
      catalogSkillId: number | null
      name: string
    }>
  >
  languages: Array<CvReviewItem<string>>
  unresolved: CvUnresolvedReviewItem[]
}

export type CvPreviewEducation = {
  candidateId: string
  institution: string
  degree: string
  field: string
  startYear: number | null
  endYear: number | null
  description: string
  confidence: 'high' | 'medium' | 'low'
  source: 'structured-local'
}

export type CvPreviewExperience = {
  candidateId: string
  company: string
  role: string
  startDate: string | null
  endDate: string | null
  description: string
  confidence: 'high' | 'medium' | 'low'
  source: 'structured-local'
}

export type CvPreviewSkill = {
  candidateId: string
  catalogSkillId: number | null
  name: string
  category: CvCatalogCategory
  confidence: 'high' | 'medium' | 'low'
  matchedCatalog: boolean
  source: 'structured-local'
}

export type CvPreview = {
  headline: string | null
  bio: string | null
  education: CvPreviewEducation[]
  experience: CvPreviewExperience[]
  skills: CvPreviewSkill[]
  languages: string[]
  review: CvProfilePreviewReview
}

export type CareerPath = {
  title?: string
  description?: string
  matchScore?: number
  skillGaps?: Array<{ skill?: string; priority?: string }>
}

export type CvPreviewAnalysis = {
  provider: string
  summary: string
  experienceLevel: string
  careerPaths: CareerPath[]
  intelligence?: {
    pipeline: string
    pageCount: number
    blockCount: number
    processingDurationMs: number
    model: {
      attempted: boolean
      used: boolean
      provider: string | null
      model: string | null
      durationMs: number | null
      acceptedSuggestions: number
      rejectedSuggestions: number
      errorCode: string | null
    }
    warnings: string[]
  }
}

export type CvPreviewResponse = {
  preview: CvPreview
  analysis: CvPreviewAnalysis
}

export type CvApplyPayload = {
  profile: {
    headline?: {
      value: string
      replaceExisting: boolean
    }
    bio?: {
      value: string
      replaceExisting: boolean
    }
    languages?: string[]
  }
  education: Array<{
    institution: string
    degree: string
    field: string
    startYear: number | null
    endYear: number | null
    description: string
  }>
  experience: Array<{
    company: string
    role: string
    startDate: string | null
    endDate: string | null
    description: string
  }>
  skills: Array<{
    catalogSkillId?: number | null
    name: string
    category: CvCatalogCategory
  }>
}

type ReviewedItem<T, TExisting = unknown> = T & {
  approved: boolean
  review: CvReviewItem<TExisting> | null
}

type ScalarDraft = {
  value: string
  approved: boolean
  replaceExisting: boolean
  review: CvReviewItem<string> | null
}

type LanguageDraft = ReviewedItem<{ value: string }, string>

type CvReviewDraft = {
  headline: ScalarDraft | null
  bio: ScalarDraft | null
  education: Array<
    ReviewedItem<
      CvPreviewEducation,
      CvProfilePreviewReview['education'][number]['existingValue']
    >
  >
  experience: Array<
    ReviewedItem<
      CvPreviewExperience,
      CvProfilePreviewReview['experience'][number]['existingValue']
    >
  >
  skills: Array<
    ReviewedItem<
      CvPreviewSkill,
      CvProfilePreviewReview['skills'][number]['existingValue']
    >
  >
  languages: LanguageDraft[]
}

export type CvSelectionSummary = {
  add: number
  update: number
  keep: number
  ignore: number
  unresolved: number
  selected: number
}

function reviewByCandidateId<TExisting>(
  reviews: Array<CvReviewItem<TExisting>>,
  candidateId: string
) {
  return reviews.find((item) => item.candidateId === candidateId) ?? null
}

export function isCvItemSelectedByDefault(
  review: CvReviewItem<unknown> | null
) {
  if (!review) return true
  return review.action === 'add' && review.state === 'ready'
}

export function createCvReviewDraft(result: CvPreview): CvReviewDraft {
  const review = result.review

  return {
    headline: result.headline
      ? {
          value: result.headline,
          approved: isCvItemSelectedByDefault(review.headline),
          replaceExisting: false,
          review: review.headline,
        }
      : null,
    bio: result.bio
      ? {
          value: result.bio,
          approved: isCvItemSelectedByDefault(review.bio),
          replaceExisting: false,
          review: review.bio,
        }
      : null,
    education: result.education.map((item) => {
      const itemReview = reviewByCandidateId(
        review.education,
        item.candidateId
      )
      return {
        ...item,
        approved: isCvItemSelectedByDefault(itemReview),
        review: itemReview,
      }
    }),
    experience: result.experience.map((item) => {
      const itemReview = reviewByCandidateId(
        review.experience,
        item.candidateId
      )
      return {
        ...item,
        approved: isCvItemSelectedByDefault(itemReview),
        review: itemReview,
      }
    }),
    skills: result.skills.map((item) => {
      const itemReview = reviewByCandidateId(
        review.skills,
        item.candidateId
      )
      return {
        ...item,
        approved: isCvItemSelectedByDefault(itemReview),
        review: itemReview,
      }
    }),
    languages: result.languages.map((value, index) => {
      const itemReview = review.languages[index] ?? null
      return {
        value,
        approved: isCvItemSelectedByDefault(itemReview),
        review: itemReview,
      }
    }),
  }
}

function scalarIsActionable(item: ScalarDraft | null) {
  if (!item || !item.approved || !item.value.trim()) return false
  if (item.review?.action === 'already-present') return false
  if (item.review?.action === 'keep-existing') {
    return item.replaceExisting
  }
  return true
}

export function buildCvApplyPayload(
  draft: CvReviewDraft
): CvApplyPayload {
  const profile: CvApplyPayload['profile'] = {}

  if (scalarIsActionable(draft.headline) && draft.headline) {
    profile.headline = {
      value: draft.headline.value.trim(),
      replaceExisting: draft.headline.replaceExisting,
    }
  }

  if (scalarIsActionable(draft.bio) && draft.bio) {
    profile.bio = {
      value: draft.bio.value.trim(),
      replaceExisting: draft.bio.replaceExisting,
    }
  }

  const languages = [
    ...new Map(
      draft.languages
        .filter(
          (item) =>
            item.approved &&
            item.review?.action !== 'already-present' &&
            item.value.trim().length > 0
        )
        .map((item) => [
          item.value.trim().toLocaleLowerCase('en'),
          item.value.trim(),
        ])
    ).values(),
  ]

  if (languages.length > 0) {
    profile.languages = languages
  }

  return {
    profile,
    education: draft.education
      .filter(
        (item) =>
          item.approved &&
          item.review?.action !== 'already-present' &&
          item.institution.trim().length > 0
      )
      .map((item) => ({
        institution: item.institution.trim(),
        degree: item.degree.trim(),
        field: item.field.trim(),
        startYear: item.startYear,
        endYear: item.endYear,
        description: item.description.trim(),
      })),
    experience: draft.experience
      .filter(
        (item) =>
          item.approved &&
          item.review?.action !== 'already-present' &&
          item.company.trim().length > 0 &&
          item.role.trim().length > 0
      )
      .map((item) => ({
        company: item.company.trim(),
        role: item.role.trim(),
        startDate: item.startDate,
        endDate: item.endDate,
        description: item.description.trim(),
      })),
    skills: draft.skills
      .filter(
        (item) =>
          item.approved &&
          item.review?.action !== 'already-present' &&
          item.name.trim().length > 0
      )
      .map((item) => ({
        catalogSkillId: item.catalogSkillId,
        name: item.name.trim(),
        category: item.category,
      })),
  }
}

function allDraftItems(draft: CvReviewDraft) {
  return [
    ...(draft.headline ? [{ kind: 'scalar' as const, item: draft.headline }] : []),
    ...(draft.bio ? [{ kind: 'scalar' as const, item: draft.bio }] : []),
    ...draft.education.map((item) => ({ kind: 'item' as const, item })),
    ...draft.experience.map((item) => ({ kind: 'item' as const, item })),
    ...draft.skills.map((item) => ({ kind: 'item' as const, item })),
    ...draft.languages.map((item) => ({ kind: 'item' as const, item })),
  ]
}

export function summariseCvSelection(
  draft: CvReviewDraft,
  unresolvedCount: number
): CvSelectionSummary {
  let add = 0
  let update = 0
  let keep = 0
  let ignore = 0

  for (const entry of allDraftItems(draft)) {
    const review = entry.item.review

    if (review?.action === 'already-present') {
      keep += 1
      continue
    }

    if (entry.kind === 'scalar') {
      if (scalarIsActionable(entry.item)) {
        if (entry.item.replaceExisting) update += 1
        else add += 1
      } else if (review?.action === 'keep-existing') {
        keep += 1
      } else {
        ignore += 1
      }
      continue
    }

    if (entry.item.approved) add += 1
    else ignore += 1
  }

  return {
    add,
    update,
    keep,
    ignore,
    unresolved: unresolvedCount,
    selected: add + update,
  }
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    'medium-confidence': 'Check this value before saving',
    'low-confidence': 'Low confidence extraction',
    'candidate-warning': 'The parser reported a warning',
    'model-resolved': 'An ambiguity was resolved by the local model',
    'existing-comparison-unavailable':
      'Existing profile comparison was unavailable',
    'existing-exact-match': 'This is already on your profile',
    'existing-value-protected':
      'Your existing value is protected by default',
    'possible-existing-conflict':
      'A similar entry already exists on your profile',
    'catalog-match-required':
      'This skill was not matched to the skill catalog',
    'missing-company': 'Company could not be resolved',
    'missing-role': 'Role could not be resolved',
    'missing-institution': 'Institution could not be resolved',
  }

  return labels[reason] ?? reason.replace(/-/g, ' ')
}

function reviewLabel(review: CvReviewItem<unknown> | null) {
  if (!review) return 'Ready'
  if (review.action === 'already-present') return 'Already on profile'
  if (review.action === 'keep-existing') return 'Existing value protected'
  if (review.state === 'ready') return 'Ready'
  if (review.state === 'unresolved') return 'Unresolved'
  return 'Review'
}

function badgeStyle(review: CvReviewItem<unknown> | null) {
  if (!review || review.state === 'ready') {
    return {
      background: 'var(--verd-soft)',
      border: '0.5px solid rgba(31,107,94,0.24)',
      color: 'var(--verd)',
    }
  }

  if (review.action === 'already-present') {
    return {
      background: 'var(--paper)',
      border: '0.5px solid var(--rule)',
      color: 'var(--ink-muted)',
    }
  }

  return {
    background: 'rgba(183,129,38,0.1)',
    border: '0.5px solid rgba(183,129,38,0.25)',
    color: 'var(--ochre)',
  }
}

function formatExistingValue(value: unknown) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  if ('institution' in value) {
    const item = value as {
      institution?: string
      degree?: string
      field?: string
      startYear?: number | null
      endYear?: number | null
    }
    return [
      item.degree,
      item.field,
      item.institution,
      [item.startYear, item.endYear].filter(Boolean).join(' - '),
    ]
      .filter(Boolean)
      .join(' | ')
  }

  if ('company' in value) {
    const item = value as {
      company?: string
      role?: string
      startDate?: string | null
      endDate?: string | null
    }
    return [
      item.role,
      item.company,
      [item.startDate, item.endDate].filter(Boolean).join(' - '),
    ]
      .filter(Boolean)
      .join(' | ')
  }

  if ('name' in value) {
    return String((value as { name?: unknown }).name ?? '')
  }

  return ''
}

function EvidenceDetails({
  review,
}: {
  review: CvReviewItem<unknown> | CvUnresolvedReviewItem | null
}) {
  if (!review) return null

  const reasons = review.reasonCodes.map(reasonLabel)
  const existingValue =
    'existingValue' in review
      ? formatExistingValue(review.existingValue)
      : ''

  return (
    <div style={{ marginTop: 10 }}>
      {existingValue && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--paper)',
            border: '0.5px solid var(--rule-soft)',
            fontSize: 11.5,
            color: 'var(--ink-muted)',
            marginBottom: 8,
          }}
        >
          <strong style={{ color: 'var(--ink)' }}>Existing:</strong>{' '}
          {existingValue}
        </div>
      )}

      {reasons.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: review.evidence.length > 0 ? 8 : 0,
          }}
        >
          {reasons.map((reason) => (
            <span
              key={reason}
              style={{
                fontSize: 10.5,
                color: 'var(--ink-muted)',
                padding: '3px 7px',
                borderRadius: 999,
                background: 'var(--paper)',
                border: '0.5px solid var(--rule-soft)',
              }}
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      {review.evidence.length > 0 && (
        <details>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 11.5,
              color: 'var(--ink-muted)',
              userSelect: 'none',
            }}
          >
            Show source evidence
          </summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 7 }}>
            {review.evidence.map((evidence, index) => (
              <div
                key={`${evidence.page}:${index}`}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--paper)',
                  border: '0.5px solid var(--rule-soft)',
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  color: 'var(--ink-muted)',
                }}
              >
                <strong style={{ color: 'var(--ink)' }}>
                  Page {evidence.page}
                </strong>
                <div style={{ marginTop: 3 }}>{evidence.text}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function StateBadge({
  review,
}: {
  review: CvReviewItem<unknown> | null
}) {
  const style = badgeStyle(review)

  return (
    <span
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 22,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {reviewLabel(review)}
    </span>
  )
}

function ReviewCard({
  review,
  approved,
  title,
  subtitle,
  onApprovedChange,
  children,
}: {
  review: CvReviewItem<unknown> | null
  approved: boolean
  title: string
  subtitle?: string
  onApprovedChange: (approved: boolean) => void
  children: React.ReactNode
}) {
  const alreadyPresent = review?.action === 'already-present'

  return (
    <div
      style={{
        marginBottom: 10,
        padding: 13,
        borderRadius: 12,
        border: approved
          ? '0.5px solid rgba(31,107,94,0.35)'
          : '0.5px solid var(--rule)',
        background: approved ? 'rgba(31,107,94,0.045)' : 'var(--paper-soft)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          marginBottom: 10,
        }}
      >
        <label
          style={{
            display: 'flex',
            gap: 9,
            alignItems: 'flex-start',
            minWidth: 0,
            cursor: alreadyPresent ? 'default' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={approved}
            disabled={alreadyPresent}
            onChange={(event) => onApprovedChange(event.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span style={{ minWidth: 0 }}>
            <strong
              style={{
                display: 'block',
                color: 'var(--ink)',
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              {title}
            </strong>
            {subtitle && (
              <span
                style={{
                  display: 'block',
                  color: 'var(--ink-muted)',
                  fontSize: 11.5,
                  marginTop: 2,
                }}
              >
                {subtitle}
              </span>
            )}
          </span>
        </label>
        <StateBadge review={review} />
      </div>

      {children}
      <EvidenceDetails review={review} />
    </div>
  )
}

function SectionTitle({
  title,
  count,
}: {
  title: string
  count: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ink-faint)',
        }}
      >
        {title}
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
        {count}
      </span>
    </div>
  )
}

function OverviewMetric({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'ready' | 'review' | 'neutral'
}) {
  const background =
    tone === 'ready'
      ? 'var(--verd-soft)'
      : tone === 'review'
        ? 'rgba(183,129,38,0.1)'
        : 'var(--paper-soft)'

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: '0.5px solid var(--rule-soft)',
        background,
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 24,
          lineHeight: 1,
          color: 'var(--ink)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--ink-muted)',
          marginTop: 5,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function StepIndicator({
  step,
}: {
  step: 'overview' | 'review' | 'confirm'
}) {
  const steps = [
    { id: 'overview', label: 'Overview' },
    { id: 'review', label: 'Review' },
    { id: 'confirm', label: 'Confirm' },
  ] as const
  const currentIndex = steps.findIndex((item) => item.id === step)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        marginBottom: 18,
      }}
    >
      {steps.map((item, index) => (
        <div
          key={item.id}
          style={{
            padding: '7px 8px',
            borderRadius: 999,
            textAlign: 'center',
            fontSize: 10.5,
            fontWeight: 700,
            background:
              index <= currentIndex ? 'var(--ink)' : 'var(--paper-soft)',
            color:
              index <= currentIndex ? 'var(--paper)' : 'var(--ink-faint)',
            border: '0.5px solid var(--rule-soft)',
          }}
        >
          {index + 1}. {item.label}
        </div>
      ))}
    </div>
  )
}

function formatDuration(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}

export function CvImportReviewModal({
  result,
  analysis,
  onApply,
  onClose,
}: {
  result: CvPreview
  analysis: CvPreviewAnalysis | null
  onApply: (payload: CvApplyPayload) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState<'overview' | 'review' | 'confirm'>(
    'overview'
  )
  const [draft, setDraft] = useState<CvReviewDraft>(() =>
    createCvReviewDraft(result)
  )
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const selection = useMemo(
    () => summariseCvSelection(draft, result.review.unresolved.length),
    [draft, result.review.unresolved.length]
  )

  const fieldStyle = {
    width: '100%',
    border: '0.5px solid var(--rule)',
    borderRadius: 8,
    padding: '7px 9px',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontSize: 12.5,
    fontFamily: "'IBM Plex Sans', sans-serif",
    boxSizing: 'border-box',
  } as const

  function updateScalar(
    key: 'headline' | 'bio',
    patch: Partial<ScalarDraft>
  ) {
    setDraft((current) => ({
      ...current,
      [key]: current[key] ? { ...current[key], ...patch } : null,
    }))
  }

  function updateArrayItem<
    K extends 'education' | 'experience' | 'skills' | 'languages',
  >(
    key: K,
    index: number,
    patch: Partial<CvReviewDraft[K][number]>
  ) {
    setDraft((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  function selectAllReady() {
    setDraft((current) => ({
      headline: current.headline
        ? {
            ...current.headline,
            approved:
              current.headline.review?.state === 'ready' &&
              current.headline.review.action === 'add',
          }
        : null,
      bio: current.bio
        ? {
            ...current.bio,
            approved:
              current.bio.review?.state === 'ready' &&
              current.bio.review.action === 'add',
          }
        : null,
      education: current.education.map((item) => ({
        ...item,
        approved:
          item.review?.state === 'ready' && item.review.action === 'add',
      })),
      experience: current.experience.map((item) => ({
        ...item,
        approved:
          item.review?.state === 'ready' && item.review.action === 'add',
      })),
      skills: current.skills.map((item) => ({
        ...item,
        approved:
          item.review?.state === 'ready' && item.review.action === 'add',
      })),
      languages: current.languages.map((item) => ({
        ...item,
        approved:
          item.review?.state === 'ready' && item.review.action === 'add',
      })),
    }))
  }

  async function apply() {
    const payload = buildCvApplyPayload(draft)
    setApplying(true)
    setApplyError(null)

    try {
      await onApply(payload)
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : 'CV import failed'
      )
    } finally {
      setApplying(false)
    }
  }

  const reviewSummary = result.review.summary
  const duration = formatDuration(
    analysis?.intelligence?.processingDurationMs
  )
  const model = analysis?.intelligence?.model
  const modelLabel = model?.attempted
    ? model.errorCode
      ? `Deterministic fallback used after ${model.errorCode}`
      : model.used
        ? 'Local model resolved supported ambiguities'
        : 'Deterministic result used; no safe model changes were needed'
    : 'Deterministic extraction used'

  const actionableCount =
    (draft.headline?.review?.action === 'already-present' ? 0 : draft.headline ? 1 : 0) +
    (draft.bio?.review?.action === 'already-present' ? 0 : draft.bio ? 1 : 0) +
    draft.education.filter((item) => item.review?.action !== 'already-present').length +
    draft.experience.filter((item) => item.review?.action !== 'already-present').length +
    draft.skills.filter((item) => item.review?.action !== 'already-present').length +
    draft.languages.filter((item) => item.review?.action !== 'already-present').length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(26,24,21,0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 820,
          background: 'var(--paper)',
          borderRadius: 20,
          padding: 22,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 24px 70px rgba(26,24,21,0.24)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'flex-start',
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 23,
                fontWeight: 500,
                margin: 0,
                letterSpacing: -0.25,
              }}
            >
              Smart CV review
            </h2>
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--ink-muted)',
                margin: '5px 0 0',
                lineHeight: 1.45,
              }}
            >
              Ready items are selected automatically. Existing values and
              uncertain matches stay protected until you approve them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            aria-label="Close CV review"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--ink-faint)',
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        <StepIndicator step={step} />

        {step === 'overview' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 8,
              }}
            >
              <OverviewMetric
                value={reviewSummary.ready}
                label="Ready to add"
                tone="ready"
              />
              <OverviewMetric
                value={reviewSummary.review}
                label="Need review"
                tone="review"
              />
              <OverviewMetric
                value={reviewSummary.alreadyPresent}
                label="Already present"
                tone="neutral"
              />
              <OverviewMetric
                value={reviewSummary.unresolved}
                label="Unresolved"
                tone="review"
              />
            </div>

            <div
              style={{
                marginTop: 14,
                padding: 13,
                borderRadius: 12,
                border: '0.5px solid var(--rule-soft)',
                background: 'var(--paper-soft)',
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--ink-muted)',
              }}
            >
              <div style={{ color: 'var(--ink)', fontWeight: 700 }}>
                Processed locally{duration ? ` in ${duration}` : ''}
              </div>
              <div>{modelLabel}</div>
              <div>
                The PDF and extracted raw text are not saved by this import.
              </div>
            </div>

            {!result.review.comparisonAvailable && (
              <div
                style={{
                  marginTop: 10,
                  padding: 11,
                  borderRadius: 10,
                  background: 'rgba(183,129,38,0.1)',
                  border: '0.5px solid rgba(183,129,38,0.25)',
                  fontSize: 11.5,
                  color: 'var(--ink-muted)',
                }}
              >
                Existing profile comparison was unavailable. Review every
                selected item carefully before applying.
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 18,
              }}
            >
              <KBtn variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </KBtn>
              <KBtn
                variant="signal"
                size="sm"
                onClick={() => setStep('review')}
                disabled={actionableCount === 0}
              >
                Review changes
              </KBtn>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {selection.selected} selected. Review items are off by default.
              </div>
              <button
                type="button"
                onClick={selectAllReady}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--verd)',
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                Reset to safe defaults
              </button>
            </div>

            {(draft.headline || draft.bio) && (
              <section style={{ marginBottom: 16 }}>
                <SectionTitle
                  title="Profile"
                  count={Number(Boolean(draft.headline)) + Number(Boolean(draft.bio))}
                />

                {draft.headline &&
                  draft.headline.review?.action !== 'already-present' && (
                    <ReviewCard
                      review={draft.headline.review}
                      approved={draft.headline.approved}
                      title="Headline"
                      subtitle="The short role statement shown at the top of your profile"
                      onApprovedChange={(approved) =>
                        updateScalar('headline', {
                          approved,
                          replaceExisting:
                            approved &&
                            draft.headline?.review?.action === 'keep-existing',
                        })
                      }
                    >
                      <input
                        value={draft.headline.value}
                        maxLength={120}
                        disabled={!draft.headline.approved}
                        onChange={(event) =>
                          updateScalar('headline', {
                            value: event.target.value,
                          })
                        }
                        style={fieldStyle}
                      />
                    </ReviewCard>
                  )}

                {draft.bio && draft.bio.review?.action !== 'already-present' && (
                  <ReviewCard
                    review={draft.bio.review}
                    approved={draft.bio.approved}
                    title="Bio"
                    subtitle="A concise summary based on the profile summary in your CV"
                    onApprovedChange={(approved) =>
                      updateScalar('bio', {
                        approved,
                        replaceExisting:
                          approved &&
                          draft.bio?.review?.action === 'keep-existing',
                      })
                    }
                  >
                    <textarea
                      value={draft.bio.value}
                      maxLength={500}
                      rows={4}
                      disabled={!draft.bio.approved}
                      onChange={(event) =>
                        updateScalar('bio', { value: event.target.value })
                      }
                      style={fieldStyle}
                    />
                  </ReviewCard>
                )}
              </section>
            )}

            {draft.experience.some(
              (item) => item.review?.action !== 'already-present'
            ) && (
              <section style={{ marginBottom: 16 }}>
                <SectionTitle
                  title="Experience"
                  count={draft.experience.filter(
                    (item) => item.review?.action !== 'already-present'
                  ).length}
                />
                {draft.experience.map((item, index) =>
                  item.review?.action === 'already-present' ? null : (
                    <ReviewCard
                      key={item.candidateId}
                      review={item.review}
                      approved={item.approved}
                      title={item.role || 'Experience item'}
                      subtitle={item.company}
                      onApprovedChange={(approved) =>
                        updateArrayItem('experience', index, { approved })
                      }
                    >
                      <div style={{ display: 'grid', gap: 7 }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 7,
                          }}
                        >
                          <input
                            value={item.role}
                            placeholder="Role"
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('experience', index, {
                                role: event.target.value,
                              })
                            }
                            style={fieldStyle}
                          />
                          <input
                            value={item.company}
                            placeholder="Company"
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('experience', index, {
                                company: event.target.value,
                              })
                            }
                            style={fieldStyle}
                          />
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 7,
                          }}
                        >
                          <input
                            type="date"
                            value={item.startDate ?? ''}
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('experience', index, {
                                startDate: event.target.value || null,
                              })
                            }
                            style={fieldStyle}
                          />
                          <input
                            type="date"
                            value={item.endDate ?? ''}
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('experience', index, {
                                endDate: event.target.value || null,
                              })
                            }
                            style={fieldStyle}
                          />
                        </div>
                        <textarea
                          value={item.description}
                          placeholder="Description"
                          maxLength={800}
                          rows={3}
                          disabled={!item.approved}
                          onChange={(event) =>
                            updateArrayItem('experience', index, {
                              description: event.target.value,
                            })
                          }
                          style={fieldStyle}
                        />
                      </div>
                    </ReviewCard>
                  )
                )}
              </section>
            )}

            {draft.education.some(
              (item) => item.review?.action !== 'already-present'
            ) && (
              <section style={{ marginBottom: 16 }}>
                <SectionTitle
                  title="Education"
                  count={draft.education.filter(
                    (item) => item.review?.action !== 'already-present'
                  ).length}
                />
                {draft.education.map((item, index) =>
                  item.review?.action === 'already-present' ? null : (
                    <ReviewCard
                      key={item.candidateId}
                      review={item.review}
                      approved={item.approved}
                      title={item.degree || item.institution}
                      subtitle={item.institution}
                      onApprovedChange={(approved) =>
                        updateArrayItem('education', index, { approved })
                      }
                    >
                      <div style={{ display: 'grid', gap: 7 }}>
                        <input
                          value={item.institution}
                          placeholder="Institution"
                          disabled={!item.approved}
                          onChange={(event) =>
                            updateArrayItem('education', index, {
                              institution: event.target.value,
                            })
                          }
                          style={fieldStyle}
                        />
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 7,
                          }}
                        >
                          <input
                            value={item.degree}
                            placeholder="Degree"
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('education', index, {
                                degree: event.target.value,
                              })
                            }
                            style={fieldStyle}
                          />
                          <input
                            value={item.field}
                            placeholder="Field"
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('education', index, {
                                field: event.target.value,
                              })
                            }
                            style={fieldStyle}
                          />
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 7,
                          }}
                        >
                          <input
                            type="number"
                            min={1900}
                            max={2100}
                            value={item.startYear ?? ''}
                            placeholder="Start year"
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('education', index, {
                                startYear: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            style={fieldStyle}
                          />
                          <input
                            type="number"
                            min={1900}
                            max={2100}
                            value={item.endYear ?? ''}
                            placeholder="End year"
                            disabled={!item.approved}
                            onChange={(event) =>
                              updateArrayItem('education', index, {
                                endYear: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            style={fieldStyle}
                          />
                        </div>
                        <textarea
                          value={item.description}
                          placeholder="Description"
                          maxLength={500}
                          rows={3}
                          disabled={!item.approved}
                          onChange={(event) =>
                            updateArrayItem('education', index, {
                              description: event.target.value,
                            })
                          }
                          style={fieldStyle}
                        />
                      </div>
                    </ReviewCard>
                  )
                )}
              </section>
            )}

            {draft.skills.some(
              (item) => item.review?.action !== 'already-present'
            ) && (
              <section style={{ marginBottom: 16 }}>
                <SectionTitle
                  title="Skills"
                  count={draft.skills.filter(
                    (item) => item.review?.action !== 'already-present'
                  ).length}
                />
                {draft.skills.map((item, index) =>
                  item.review?.action === 'already-present' ? null : (
                    <ReviewCard
                      key={item.candidateId}
                      review={item.review}
                      approved={item.approved}
                      title={item.name}
                      subtitle={
                        item.matchedCatalog
                          ? `${item.category} catalog skill`
                          : `${item.category} skill; catalog match required`
                      }
                      onApprovedChange={(approved) =>
                        updateArrayItem('skills', index, { approved })
                      }
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: 8,
                        }}
                      >
                        <input
                          value={item.name}
                          maxLength={100}
                          disabled={!item.approved}
                          onChange={(event) =>
                            updateArrayItem('skills', index, {
                              name: event.target.value,
                              catalogSkillId: null,
                              matchedCatalog: false,
                            })
                          }
                          style={fieldStyle}
                        />
                        <select
                          value={item.category}
                          disabled={!item.approved}
                          onChange={(event) =>
                            updateArrayItem('skills', index, {
                              category: event.target.value as CvCatalogCategory,
                            })
                          }
                          style={fieldStyle}
                        >
                          <option value="Tech">Tech</option>
                          <option value="Design">Design</option>
                          <option value="Business">Business</option>
                          <option value="Science">Science</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </ReviewCard>
                  )
                )}
              </section>
            )}

            {draft.languages.some(
              (item) => item.review?.action !== 'already-present'
            ) && (
              <section style={{ marginBottom: 16 }}>
                <SectionTitle
                  title="Languages"
                  count={draft.languages.filter(
                    (item) => item.review?.action !== 'already-present'
                  ).length}
                />
                {draft.languages.map((item, index) =>
                  item.review?.action === 'already-present' ? null : (
                    <ReviewCard
                      key={item.review?.candidateId ?? `${item.value}:${index}`}
                      review={item.review}
                      approved={item.approved}
                      title={item.value}
                      onApprovedChange={(approved) =>
                        updateArrayItem('languages', index, { approved })
                      }
                    >
                      <input
                        value={item.value}
                        maxLength={50}
                        disabled={!item.approved}
                        onChange={(event) =>
                          updateArrayItem('languages', index, {
                            value: event.target.value,
                          })
                        }
                        style={fieldStyle}
                      />
                    </ReviewCard>
                  )
                )}
              </section>
            )}

            {reviewSummary.alreadyPresent > 0 && (
              <details
                style={{
                  marginBottom: 16,
                  padding: 11,
                  borderRadius: 10,
                  border: '0.5px solid var(--rule-soft)',
                  background: 'var(--paper-soft)',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--ink-muted)',
                  }}
                >
                  {reviewSummary.alreadyPresent} items already on your profile
                </summary>
                <p
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-faint)',
                    margin: '7px 0 0',
                  }}
                >
                  They are not selected and will not be duplicated.
                </p>
              </details>
            )}

            {result.review.unresolved.length > 0 && (
              <section style={{ marginBottom: 16 }}>
                <SectionTitle
                  title="Could not resolve safely"
                  count={result.review.unresolved.length}
                />
                {result.review.unresolved.map((item) => (
                  <div
                    key={item.candidateId}
                    style={{
                      marginBottom: 8,
                      padding: 12,
                      borderRadius: 10,
                      border: '0.5px solid rgba(183,129,38,0.25)',
                      background: 'rgba(183,129,38,0.08)',
                    }}
                  >
                    <strong style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                      {item.kind.replace(/-/g, ' ')}
                    </strong>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--ink-muted)',
                        marginTop: 3,
                      }}
                    >
                      Not selected because required information was missing.
                    </div>
                    <EvidenceDetails review={item} />
                  </div>
                ))}
              </section>
            )}

            {applyError && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--signal)',
                  marginTop: 12,
                }}
              >
                {applyError}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 18,
              }}
            >
              <KBtn
                variant="ghost"
                size="sm"
                onClick={() => setStep('overview')}
                disabled={applying}
              >
                Back
              </KBtn>
              <KBtn
                variant="signal"
                size="sm"
                onClick={() => setStep('confirm')}
                disabled={selection.selected === 0}
              >
                Review selected changes
              </KBtn>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 8,
              }}
            >
              <OverviewMetric value={selection.add} label="Will add" tone="ready" />
              <OverviewMetric value={selection.update} label="Will replace" tone="review" />
              <OverviewMetric value={selection.keep} label="Will keep" tone="neutral" />
              <OverviewMetric value={selection.ignore} label="Will ignore" tone="neutral" />
            </div>

            <div
              style={{
                marginTop: 14,
                padding: 13,
                borderRadius: 12,
                border: '0.5px solid var(--rule-soft)',
                background: 'var(--paper-soft)',
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--ink-muted)',
              }}
            >
              <strong style={{ color: 'var(--ink)' }}>
                Nothing changes until you apply.
              </strong>
              <div>
                The import uses the existing atomic profile update. Unselected
                and unresolved items are ignored.
              </div>
            </div>

            {selection.unresolved > 0 && (
              <p
                style={{
                  fontSize: 11.5,
                  color: 'var(--ink-muted)',
                  margin: '10px 0 0',
                }}
              >
                {selection.unresolved} unresolved items will remain unchanged.
              </p>
            )}

            {applyError && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--signal)',
                  marginTop: 12,
                }}
              >
                {applyError}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 18,
              }}
            >
              <KBtn
                variant="ghost"
                size="sm"
                onClick={() => setStep('review')}
                disabled={applying}
              >
                Back to review
              </KBtn>
              <KBtn
                variant="signal"
                size="sm"
                onClick={apply}
                disabled={applying || selection.selected === 0}
              >
                {applying ? 'Applying...' : 'Apply selected changes'}
              </KBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
