import {
  cvEvaluationPdfFixtures,
} from '../intelligence/cv/__fixtures__/evaluationCorpus.js'
import {
  createCvProfilePreview,
} from '../services/cvProfilePreview.js'

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message)
}

const fixture = cvEvaluationPdfFixtures.find(
  (item) => item.id === 'hierarchical-multi-entry-boundaries'
)

assert(fixture, 'Required hierarchical CV fixture is missing')

const legacyAnalyse = async () => ({
  extractedSkills: [],
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

const result = await createCvProfilePreview(fixture.buffer, {
  catalog: [],
  modelRuntime: null,
  legacyAnalyse,
  existingProfile: {
    headline: null,
    bio: null,
    languages: [],
    education: [],
    experience: [],
    skills: [],
  },
})

const completeExperience = result.preview.experience
const unresolved = result.preview.review.unresolved

assert(
  completeExperience.length === 3,
  'Complete hierarchical experience rows were not retained'
)
assert(
  completeExperience.some(
    (item) =>
      item.company === 'Example Automotive GmbH' &&
      item.role === 'Working Student PM'
  ),
  'First child role was not associated with its parent employer'
)
assert(
  completeExperience.some(
    (item) =>
      item.company === 'Example Automotive GmbH' &&
      item.role === 'Internship PM'
  ),
  'Second child role on the same source line was not retained'
)
assert(
  completeExperience.some(
    (item) =>
      item.company === 'Private' &&
      item.role === 'Investment Analyst'
  ),
  'Role-first private experience was not retained'
)
assert(
  unresolved.some(
    (item) =>
      item.kind === 'experience' &&
      item.reasonCodes.includes('missing-role') &&
      item.evidence.some((evidence) =>
        evidence.text.includes('Example Electronics')
      )
  ),
  'Incomplete startup experience was silently discarded'
)

const descriptions = [
  ...result.preview.experience.map((item) => item.description),
  ...result.preview.education.map((item) => item.description),
].join('\n')

assert(
  !descriptions.includes('Market Maker Trading Simulation') &&
    !descriptions.includes('Startup, Example Electronics'),
  'Unknown section content leaked into education or experience'
)
assert(
  result.preview.education.length === 2,
  'Education hierarchy was not preserved'
)
assert(
  result.preview.review.summary.unresolved === 1,
  'Unresolved entry summary count is incorrect'
)

console.log('CV HIERARCHY MULTI-ROLE ASSOCIATION: PASS')
console.log('CV HIERARCHY ROLE-FIRST ENTRY: PASS')
console.log('CV HIERARCHY INCOMPLETE ENTRY RETENTION: PASS')
console.log('CV HIERARCHY UNKNOWN SECTION BOUNDARY: PASS')
console.log('CV HIERARCHY REVIEW CONTRACT: PASS')
console.log('CV HIERARCHY SMOKE: PASS')
