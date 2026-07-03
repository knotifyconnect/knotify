import 'dotenv/config'
import {
  cvEvaluationPdfFixtures,
} from '../intelligence/cv/__fixtures__/evaluationCorpus.js'
import { createCvProfilePreview } from '../services/cvProfilePreview.js'

const fixture = cvEvaluationPdfFixtures.find(
  (item) => item.id === 'english-two-column-right-dates'
)

if (!fixture) {
  throw new Error('Required CV preview fixture is missing')
}

const result = await createCvProfilePreview(fixture.buffer, {
  catalog: [
    { id: 1, name: 'TypeScript', category: 'Tech' },
    { id: 2, name: 'PostgreSQL', category: 'Tech' },
  ],
  legacyAnalyse: async () => ({
    extractedSkills: [],
    careerPaths: [],
    experienceLevel: 'mid',
    summary: 'Compatibility analysis completed locally.',
    provider: 'local',
    profileExtract: {
      headline: null,
      bio: null,
      education: [],
      experience: [],
    },
  }),
})

const model = result.analysis.intelligence.model

if (!model.attempted) {
  throw new Error('The real local document model was not attempted')
}

if (
  model.errorCode !== null &&
  model.errorCode !== 'TIMEOUT'
) {
  throw new Error(
    `The real local document model failed with ${model.errorCode}`
  )
}

if (model.provider !== 'ollama') {
  throw new Error('The CV preview did not use the Ollama gateway')
}

if (
  result.preview.experience.length !== 2 ||
  result.preview.education.length !== 1 ||
  result.preview.skills.length !== 2 ||
  result.preview.languages.length !== 2
) {
  throw new Error(
    'The bounded real-model preview changed deterministic fixture output'
  )
}

console.log('CV PROFILE PREVIEW REAL MODEL ATTEMPT: PASS')
console.log(
  `CV PROFILE PREVIEW MODEL OUTCOME: ${
    model.errorCode === 'TIMEOUT'
      ? 'BOUNDED_TIMEOUT_FALLBACK'
      : model.used
        ? 'SUGGESTIONS_ACCEPTED'
        : 'NO_SAFE_CHANGES'
  }`
)
console.log(
  `CV PROFILE PREVIEW MODEL DURATION_MS: ${
    model.durationMs ?? 'TIMEOUT'
  }`
)
