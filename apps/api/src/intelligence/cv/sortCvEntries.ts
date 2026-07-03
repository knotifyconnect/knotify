import type {
  CvCandidate,
  CvEducationValue,
  CvExperienceValue,
  CvNormalizedDate,
} from './contracts.js'

type DatedValue = {
  startDate: CvNormalizedDate | null
  endDate: CvNormalizedDate | null
}

function dateOrdinal(value: CvNormalizedDate | null) {
  if (!value || value.current || value.year === null) {
    return Number.NEGATIVE_INFINITY
  }

  return value.year * 12 + (value.month ?? 1)
}

function compareDatedCandidates<TValue extends DatedValue>(
  left: CvCandidate<TValue>,
  right: CvCandidate<TValue>
) {
  const leftCurrent = left.value.endDate?.current === true
  const rightCurrent = right.value.endDate?.current === true

  if (leftCurrent !== rightCurrent) {
    return leftCurrent ? -1 : 1
  }

  const leftDated = Boolean(
    left.value.startDate || left.value.endDate
  )
  const rightDated = Boolean(
    right.value.startDate || right.value.endDate
  )

  if (leftDated !== rightDated) {
    return leftDated ? -1 : 1
  }

  const endDifference =
    dateOrdinal(right.value.endDate) -
    dateOrdinal(left.value.endDate)

  if (endDifference !== 0) return endDifference

  const startDifference =
    dateOrdinal(right.value.startDate) -
    dateOrdinal(left.value.startDate)

  if (startDifference !== 0) return startDifference

  return left.sourceOrder - right.sourceOrder
}

export function sortExperienceCandidates(
  candidates: Array<CvCandidate<CvExperienceValue>>
) {
  return [...candidates].sort(compareDatedCandidates)
}

export function sortEducationCandidates(
  candidates: Array<CvCandidate<CvEducationValue>>
) {
  return [...candidates].sort(compareDatedCandidates)
}