import type {
  ClassifiedCvBlock,
  ClassifiedCvDocument,
  CvCandidate,
  CvCandidateSet,
  CvEducationValue,
  CvExperienceValue,
  CvLanguageValue,
  CvModelInterpretation,
  CvModelSuggestion,
  CvNormalizedDate,
  CvSectionKind,
  CvSourceEvidence,
} from './contracts.js'
import { extractCvDateRange } from './extractDeterministicCandidates.js'

export interface CvReconciliationResult {
  candidates: CvCandidateSet
  acceptedSuggestions: number
  rejectedSuggestions: number
  warnings: string[]
}

type ReconciliationDecision =
  | { accepted: true }
  | {
      accepted: false
      reason:
        | 'unsupported-value'
        | 'no-change'
        | 'invalid-source-section'
        | 'unrelated-candidate-source'
    }

function normalise(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cloneCandidateSet(candidates: CvCandidateSet): CvCandidateSet {
  return {
    headline: candidates.headline.map((item) => structuredClone(item)),
    summary: candidates.summary.map((item) => structuredClone(item)),
    experience: candidates.experience.map((item) => structuredClone(item)),
    education: candidates.education.map((item) => structuredClone(item)),
    skills: candidates.skills.map((item) => structuredClone(item)),
    languages: candidates.languages.map((item) => structuredClone(item)),
  }
}

function evidenceFromBlocks(
  items: ClassifiedCvBlock[]
): CvSourceEvidence[] {
  return items.map(({ block }) => ({
    blockId: block.id,
    lineIds: block.lines.map((line) => line.id),
    page: block.page,
    column: block.column,
    text: block.text,
  }))
}

function sourceText(items: ClassifiedCvBlock[]) {
  return items.map((item) => item.block.text).join('\n')
}

function supported(value: string | null, text: string) {
  if (value === null) return true
  const needle = normalise(value)
  return needle.length > 0 && normalise(text).includes(needle)
}

function normalizeDate(value: string | null): CvNormalizedDate | null {
  if (!value) return null
  const extracted = extractCvDateRange(value)
  if (!extracted) return null
  return extracted.startDate ?? extracted.endDate
}

function removeWarnings(
  warnings: string[],
  exact: string[]
) {
  const removed = new Set(exact)
  return warnings.filter((warning) => !removed.has(warning))
}

function candidateArray(
  candidates: CvCandidateSet,
  kind: CvModelSuggestion['kind']
): Array<CvCandidate<unknown>> {
  switch (kind) {
    case 'headline':
      return candidates.headline
    case 'summary':
      return candidates.summary
    case 'experience':
      return candidates.experience
    case 'education':
      return candidates.education
    case 'skill':
      return candidates.skills
    case 'language':
      return candidates.languages
  }
}

function sourceOrder(items: ClassifiedCvBlock[]) {
  return Math.min(
    ...items.map((item) => item.block.sourceOrder),
    Number.MAX_SAFE_INTEGER
  )
}

function candidateId(
  candidates: CvCandidateSet,
  kind: CvModelSuggestion['kind']
) {
  return `${kind}-model-${candidateArray(candidates, kind).length + 1}`
}

function modelConfidence(value: number) {
  return Math.max(0.55, Math.min(0.95, 0.55 + value * 0.4))
}

function mergeEvidence<T>(
  candidate: CvCandidate<T>,
  items: ClassifiedCvBlock[]
) {
  const evidence = [...candidate.evidence]
  const known = new Set(evidence.map((item) => item.blockId))

  for (const item of evidenceFromBlocks(items)) {
    if (!known.has(item.blockId)) evidence.push(item)
  }

  candidate.evidence = evidence
  candidate.sourceBlockIds = evidence.map((item) => item.blockId)
  candidate.sourceOrder = Math.min(
    candidate.sourceOrder,
    sourceOrder(items)
  )
}

function expectedSections(
  kind: CvModelSuggestion['kind']
): CvSectionKind[] {
  switch (kind) {
    case 'headline':
      return ['header', 'other']
    case 'summary':
      return ['summary', 'header', 'other']
    case 'experience':
      return ['experience', 'other']
    case 'education':
      return ['education', 'other']
    case 'skill':
      return ['skills', 'other']
    case 'language':
      return ['languages', 'other']
  }
}

function validSourceSections(
  kind: CvModelSuggestion['kind'],
  items: ClassifiedCvBlock[]
) {
  const allowed = new Set(expectedSections(kind))
  return items.every((item) => allowed.has(item.section))
}

function sourceOverlapsCandidate(
  candidate: CvCandidate<unknown>,
  items: ClassifiedCvBlock[]
) {
  const candidateSources = new Set(candidate.sourceBlockIds)
  return items.some((item) => candidateSources.has(item.block.id))
}

function reconcileExperience(
  suggestion: CvModelSuggestion,
  existing: CvCandidate<CvExperienceValue> | undefined,
  items: ClassifiedCvBlock[],
  candidates: CvCandidateSet
): ReconciliationDecision {
  const text = sourceText(items)
  const supportedFields = [
    suggestion.company,
    suggestion.role,
    suggestion.startDate,
    suggestion.endDate,
  ].every((value) => supported(value, text))

  if (!supportedFields) {
    return { accepted: false, reason: 'unsupported-value' }
  }

  const startDate = normalizeDate(suggestion.startDate)
  const endDate = normalizeDate(suggestion.endDate)
  if (suggestion.startDate && !startDate) {
    return { accepted: false, reason: 'unsupported-value' }
  }
  if (suggestion.endDate && !endDate) {
    return { accepted: false, reason: 'unsupported-value' }
  }

  if (existing) {
    const ambiguousOrder = existing.warnings.includes(
      'ambiguous-role-company-order'
    )
    const ambiguousCompany =
      ambiguousOrder || existing.warnings.includes('ambiguous-company')
    const ambiguousRole =
      ambiguousOrder || existing.warnings.includes('ambiguous-role')
    let changed = false

    if (
      suggestion.company &&
      (!existing.value.company || ambiguousCompany)
    ) {
      changed =
        changed || existing.value.company !== suggestion.company
      existing.value.company = suggestion.company
    }
    if (
      suggestion.role &&
      (!existing.value.role || ambiguousRole)
    ) {
      changed = changed || existing.value.role !== suggestion.role
      existing.value.role = suggestion.role
    }
    if (startDate && !existing.value.startDate) {
      existing.value.startDate = startDate
      changed = true
    }
    if (endDate && !existing.value.endDate) {
      existing.value.endDate = endDate
      changed = true
    }

    const resolvedAmbiguity =
      (ambiguousCompany && Boolean(suggestion.company)) ||
      (ambiguousRole && Boolean(suggestion.role))
    changed = changed || resolvedAmbiguity

    if (!changed) return { accepted: false, reason: 'no-change' }

    existing.warnings = removeWarnings(existing.warnings, [
      'ambiguous-role-company-order',
      'ambiguous-role',
      'ambiguous-company',
      'missing-role',
      'missing-company',
    ])
    if (existing.value.startDate || existing.value.endDate) {
      existing.warnings = removeWarnings(existing.warnings, [
        'missing-date',
      ])
    }
    existing.warnings.push('model-assisted')
    existing.warnings = [...new Set(existing.warnings)]
    existing.confidence = Math.max(
      existing.confidence,
      modelConfidence(suggestion.confidence)
    )
    mergeEvidence(existing, items)
    return { accepted: true }
  }

  if (!suggestion.company || !suggestion.role) {
    return { accepted: false, reason: 'unsupported-value' }
  }

  candidates.experience.push({
    id: candidateId(candidates, 'experience'),
    kind: 'experience',
    value: {
      company: suggestion.company,
      role: suggestion.role,
      startDate,
      endDate,
      description: '',
    },
    confidence: modelConfidence(suggestion.confidence),
    sourceBlockIds: items.map((item) => item.block.id),
    evidence: evidenceFromBlocks(items),
    warnings: ['model-assisted'],
    sourceOrder: sourceOrder(items),
  })
  return { accepted: true }
}

function reconcileEducation(
  suggestion: CvModelSuggestion,
  existing: CvCandidate<CvEducationValue> | undefined,
  items: ClassifiedCvBlock[],
  candidates: CvCandidateSet
): ReconciliationDecision {
  const text = sourceText(items)
  const supportedFields = [
    suggestion.institution,
    suggestion.degree,
    suggestion.field,
    suggestion.startDate,
    suggestion.endDate,
  ].every((value) => supported(value, text))

  if (!supportedFields) {
    return { accepted: false, reason: 'unsupported-value' }
  }

  const startDate = normalizeDate(suggestion.startDate)
  const endDate = normalizeDate(suggestion.endDate)
  if (suggestion.startDate && !startDate) {
    return { accepted: false, reason: 'unsupported-value' }
  }
  if (suggestion.endDate && !endDate) {
    return { accepted: false, reason: 'unsupported-value' }
  }

  if (existing) {
    const ambiguousOrder = existing.warnings.includes(
      'ambiguous-institution-degree-order'
    )
    const ambiguousInstitution =
      ambiguousOrder ||
      existing.warnings.includes('ambiguous-institution')
    const ambiguousDegree =
      ambiguousOrder || existing.warnings.includes('ambiguous-degree')
    let changed = false

    if (
      suggestion.institution &&
      (!existing.value.institution || ambiguousInstitution)
    ) {
      changed =
        changed || existing.value.institution !== suggestion.institution
      existing.value.institution = suggestion.institution
    }
    if (
      suggestion.degree &&
      (!existing.value.degree || ambiguousDegree)
    ) {
      changed = changed || existing.value.degree !== suggestion.degree
      existing.value.degree = suggestion.degree
    }
    if (
      suggestion.field &&
      (!existing.value.field || ambiguousDegree)
    ) {
      changed = changed || existing.value.field !== suggestion.field
      existing.value.field = suggestion.field
    }
    if (startDate && !existing.value.startDate) {
      existing.value.startDate = startDate
      changed = true
    }
    if (endDate && !existing.value.endDate) {
      existing.value.endDate = endDate
      changed = true
    }

    const resolvedAmbiguity =
      (ambiguousInstitution && Boolean(suggestion.institution)) ||
      (ambiguousDegree && Boolean(suggestion.degree))
    changed = changed || resolvedAmbiguity

    if (!changed) return { accepted: false, reason: 'no-change' }

    existing.warnings = removeWarnings(existing.warnings, [
      'ambiguous-institution-degree-order',
      'ambiguous-institution',
      'ambiguous-degree',
      'missing-institution',
      'missing-degree',
    ])
    if (existing.value.startDate || existing.value.endDate) {
      existing.warnings = removeWarnings(existing.warnings, [
        'missing-date',
      ])
    }
    existing.warnings.push('model-assisted')
    existing.warnings = [...new Set(existing.warnings)]
    existing.confidence = Math.max(
      existing.confidence,
      modelConfidence(suggestion.confidence)
    )
    mergeEvidence(existing, items)
    return { accepted: true }
  }

  if (!suggestion.institution || !suggestion.degree) {
    return { accepted: false, reason: 'unsupported-value' }
  }

  candidates.education.push({
    id: candidateId(candidates, 'education'),
    kind: 'education',
    value: {
      institution: suggestion.institution,
      degree: suggestion.degree,
      field: suggestion.field,
      startDate,
      endDate,
      description: '',
    },
    confidence: modelConfidence(suggestion.confidence),
    sourceBlockIds: items.map((item) => item.block.id),
    evidence: evidenceFromBlocks(items),
    warnings: ['model-assisted'],
    sourceOrder: sourceOrder(items),
  })
  return { accepted: true }
}

function reconcileSimple(
  suggestion: CvModelSuggestion,
  existing: CvCandidate<unknown> | undefined,
  items: ClassifiedCvBlock[],
  candidates: CvCandidateSet
): ReconciliationDecision {
  const text = sourceText(items)
  if (!suggestion.text || !supported(suggestion.text, text)) {
    return { accepted: false, reason: 'unsupported-value' }
  }

  if (suggestion.kind === 'language') {
    if (!supported(suggestion.proficiency, text)) {
      return { accepted: false, reason: 'unsupported-value' }
    }

    if (existing) {
      const language = existing as CvCandidate<CvLanguageValue>
      let changed = false

      const existingName = normalise(language.value.name)
      const suggestedName = normalise(suggestion.text)
      if (
        !language.value.name ||
        (suggestion.proficiency &&
          !language.value.proficiency &&
          existingName.includes(suggestedName))
      ) {
        changed = changed || language.value.name !== suggestion.text
        language.value.name = suggestion.text
      }
      if (suggestion.proficiency && !language.value.proficiency) {
        language.value.proficiency = suggestion.proficiency
        changed = true
      }

      if (!changed) return { accepted: false, reason: 'no-change' }

      language.warnings.push('model-assisted')
      language.warnings = [...new Set(language.warnings)]
      language.confidence = Math.max(
        language.confidence,
        modelConfidence(suggestion.confidence)
      )
      mergeEvidence(language, items)
      return { accepted: true }
    }

    const value: CvLanguageValue = {
      name: suggestion.text,
      proficiency: suggestion.proficiency,
    }
    candidates.languages.push({
      id: candidateId(candidates, 'language'),
      kind: 'language',
      value,
      confidence: modelConfidence(suggestion.confidence),
      sourceBlockIds: items.map((item) => item.block.id),
      evidence: evidenceFromBlocks(items),
      warnings: ['model-assisted'],
      sourceOrder: sourceOrder(items),
    })
    return { accepted: true }
  }

  if (existing) {
    return { accepted: false, reason: 'no-change' }
  }

  if (suggestion.kind === 'headline') {
    candidates.headline.push({
      id: candidateId(candidates, 'headline'),
      kind: 'headline',
      value: { text: suggestion.text },
      confidence: modelConfidence(suggestion.confidence),
      sourceBlockIds: items.map((item) => item.block.id),
      evidence: evidenceFromBlocks(items),
      warnings: ['model-assisted'],
      sourceOrder: sourceOrder(items),
    })
    return { accepted: true }
  }

  if (suggestion.kind === 'summary') {
    candidates.summary.push({
      id: candidateId(candidates, 'summary'),
      kind: 'summary',
      value: { text: suggestion.text },
      confidence: modelConfidence(suggestion.confidence),
      sourceBlockIds: items.map((item) => item.block.id),
      evidence: evidenceFromBlocks(items),
      warnings: ['model-assisted'],
      sourceOrder: sourceOrder(items),
    })
    return { accepted: true }
  }

  if (suggestion.kind === 'skill') {
    candidates.skills.push({
      id: candidateId(candidates, 'skill'),
      kind: 'skill',
      value: { name: suggestion.text },
      confidence: modelConfidence(suggestion.confidence),
      sourceBlockIds: items.map((item) => item.block.id),
      evidence: evidenceFromBlocks(items),
      warnings: ['model-assisted'],
      sourceOrder: sourceOrder(items),
    })
    return { accepted: true }
  }

  return { accepted: false, reason: 'unsupported-value' }
}

export function reconcileCvExtraction(
  deterministic: CvCandidateSet,
  interpretation: CvModelInterpretation,
  classified: ClassifiedCvDocument
): CvReconciliationResult {
  const candidates = cloneCandidateSet(deterministic)
  const blockById = new Map(
    classified.blocks.map((item) => [item.block.id, item])
  )
  const warnings: string[] = []
  let acceptedSuggestions = 0
  let rejectedSuggestions = 0

  for (const suggestion of interpretation.suggestions) {
    const items = suggestion.sourceBlockIds
      .map((id) => blockById.get(id))
      .filter((item): item is ClassifiedCvBlock => Boolean(item))

    if (items.length !== suggestion.sourceBlockIds.length) {
      rejectedSuggestions += 1
      warnings.push('model-suggestion-rejected:unknown-source-block')
      continue
    }

    if (!validSourceSections(suggestion.kind, items)) {
      rejectedSuggestions += 1
      warnings.push('model-suggestion-rejected:invalid-source-section')
      continue
    }

    const existing = suggestion.targetCandidateId
      ? candidateArray(candidates, suggestion.kind).find(
          (candidate) => candidate.id === suggestion.targetCandidateId
        )
      : undefined

    if (suggestion.targetCandidateId && !existing) {
      rejectedSuggestions += 1
      warnings.push('model-suggestion-rejected:unknown-candidate')
      continue
    }

    if (existing && !sourceOverlapsCandidate(existing, items)) {
      rejectedSuggestions += 1
      warnings.push(
        'model-suggestion-rejected:unrelated-candidate-source'
      )
      continue
    }

    let decision: ReconciliationDecision

    if (suggestion.kind === 'experience') {
      decision = reconcileExperience(
        suggestion,
        existing as CvCandidate<CvExperienceValue> | undefined,
        items,
        candidates
      )
    } else if (suggestion.kind === 'education') {
      decision = reconcileEducation(
        suggestion,
        existing as CvCandidate<CvEducationValue> | undefined,
        items,
        candidates
      )
    } else {
      decision = reconcileSimple(
        suggestion,
        existing,
        items,
        candidates
      )
    }

    if (decision.accepted) {
      acceptedSuggestions += 1
    } else {
      rejectedSuggestions += 1
      warnings.push(
        `model-suggestion-rejected:${decision.reason}`
      )
    }
  }

  return {
    candidates,
    acceptedSuggestions,
    rejectedSuggestions,
    warnings: [...new Set(warnings)],
  }
}