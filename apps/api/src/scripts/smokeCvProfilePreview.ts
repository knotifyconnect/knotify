import type {
  ModelAvailability,
  ModelGateway,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from '../intelligence/runtime/ModelGateway.js'
import { ModelGatewayError } from '../intelligence/runtime/ModelGatewayError.js'
import type { ModelCapabilities } from '../intelligence/runtime/capabilities.js'
import {
  cvEvaluationPdfFixtures,
} from '../intelligence/cv/__fixtures__/evaluationCorpus.js'
import {
  createCvProfilePreview,
  CvProfilePreviewError,
} from '../services/cvProfilePreview.js'

const fixture = cvEvaluationPdfFixtures.find(
  (item) => item.id === 'english-two-column-right-dates'
)

if (!fixture) {
  throw new Error('Required CV preview fixture is missing')
}

const catalog = [
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

const deterministic = await createCvProfilePreview(fixture.buffer, {
  catalog,
  modelRuntime: null,
  legacyAnalyse,
})

if (
  deterministic.analysis.intelligence.pipeline !==
  'structured-local-v1'
) {
  throw new Error('Structured CV preview pipeline metadata is missing')
}

if (deterministic.analysis.intelligence.model.attempted) {
  throw new Error('Deterministic CV preview unexpectedly attempted a model')
}

if (
  deterministic.preview.experience.length !== 2 ||
  deterministic.preview.experience[0]?.company !== 'Acme GmbH' ||
  deterministic.preview.experience[0]?.role !== 'Senior Engineer' ||
  deterministic.preview.experience[0]?.endDate !== null
) {
  throw new Error('Structured CV preview experience mapping failed')
}

if (
  deterministic.preview.education.length !== 1 ||
  deterministic.preview.education[0]?.institution !==
    'Example University' ||
  deterministic.preview.education[0]?.degree !== 'B.Sc.' ||
  deterministic.preview.education[0]?.field !== 'Computer Science'
) {
  throw new Error('Structured CV preview education mapping failed')
}

if (
  deterministic.preview.skills.length !== 2 ||
  deterministic.preview.skills.some(
    (skill) =>
      !skill.matchedCatalog ||
      skill.category !== 'Tech' ||
      skill.source !== 'structured-local'
  )
) {
  throw new Error('Structured CV preview skill catalog mapping failed')
}

if (
  deterministic.preview.languages.join('|') !== 'English|German'
) {
  throw new Error('Structured CV preview language mapping failed')
}

if (
  Object.hasOwn(deterministic, 'rawText') ||
  Object.hasOwn(deterministic.preview, 'rawText') ||
  Object.hasOwn(deterministic.preview, 'canonicalText') ||
  deterministic.preview.review.education.some((item) =>
    item.evidence.some((evidence) => evidence.text.length > 240)
  )
) {
  throw new Error('CV preview response exposed unbounded document text')
}

console.log('CV PROFILE PREVIEW CONTRACT: PASS')

const unconfigured = await createCvProfilePreview(fixture.buffer, {
  catalog,
  environment: {},
  legacyAnalyse,
})

if (
  unconfigured.analysis.intelligence.model.attempted ||
  !unconfigured.analysis.intelligence.warnings.includes(
    'model-disabled:configuration'
  )
) {
  throw new Error('Missing local model configuration did not fall back safely')
}

console.log('CV PROFILE PREVIEW CONFIGURATION FALLBACK: PASS')

const capabilities: ModelCapabilities = {
  availabilityCheck: true,
  structuredGeneration: true,
  timeout: true,
  cancellation: true,
  imageInput: false,
  chat: false,
  streaming: false,
  embeddings: false,
  toolCalls: false,
}

const unavailableGateway: ModelGateway = {
  provider: 'ollama',
  capabilities,
  async checkAvailability(): Promise<ModelAvailability> {
    throw new ModelGatewayError(
      'UNAVAILABLE',
      'Mock Ollama is unavailable',
      true
    )
  },
  async generateStructured<T>(
    _request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>> {
    throw new ModelGatewayError(
      'UNAVAILABLE',
      'Mock Ollama is unavailable',
      true
    )
  },
}

const fallback = await createCvProfilePreview(fixture.buffer, {
  catalog,
  modelRuntime: {
    gateway: unavailableGateway,
    model: 'mock-document-model',
    timeoutMs: 1_000,
  },
  legacyAnalyse,
})

if (
  !fallback.analysis.intelligence.model.attempted ||
  fallback.analysis.intelligence.model.used ||
  fallback.analysis.intelligence.model.errorCode !== 'UNAVAILABLE' ||
  fallback.preview.experience.length !== 2
) {
  throw new Error('Model failure did not preserve deterministic preview')
}

console.log('CV PROFILE PREVIEW MODEL FALLBACK: PASS')

const cancelledGateway: ModelGateway = {
  ...unavailableGateway,
  async generateStructured<T>(
    _request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>> {
    throw new ModelGatewayError(
      'CANCELLED',
      'Mock request was cancelled',
      false
    )
  },
}

try {
  await createCvProfilePreview(fixture.buffer, {
    catalog,
    modelRuntime: {
      gateway: cancelledGateway,
      model: 'mock-document-model',
      timeoutMs: 1_000,
    },
    legacyAnalyse,
  })
  throw new Error('Cancelled model request silently fell back')
} catch (error) {
  if (
    !(error instanceof ModelGatewayError) ||
    error.code !== 'CANCELLED'
  ) {
    throw error
  }
}

console.log('CV PROFILE PREVIEW CANCELLATION: PASS')

try {
  await createCvProfilePreview(Buffer.from('not-a-pdf'), {
    catalog,
    modelRuntime: null,
    legacyAnalyse,
  })
  throw new Error('Invalid PDF was not rejected')
} catch (error) {
  if (
    !(error instanceof CvProfilePreviewError) ||
    error.code !== 'INVALID_PDF'
  ) {
    throw error
  }
}

console.log('CV PROFILE PREVIEW INVALID PDF: PASS')
console.log('CV PROFILE PREVIEW SMOKE: PASS')
