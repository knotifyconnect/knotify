import assert from 'node:assert/strict'
import { analyseCvDocument } from '../intelligence/cv/analyseCvDocument.js'
import { cvEvaluationPdfFixtures } from '../intelligence/cv/__fixtures__/evaluationCorpus.js'
import { extractPdfLayout } from '../intelligence/document/extractPdfLayout.js'
import { normalizeDocument } from '../intelligence/document/normalizeDocument.js'
import { OLLAMA_GATEWAY_CAPABILITIES } from '../intelligence/runtime/capabilities.js'
import type {
  ModelGateway,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from '../intelligence/runtime/ModelGateway.js'
import { createCvProfilePreview } from '../services/cvProfilePreview.js'

const fixture = cvEvaluationPdfFixtures.find(
  (item) => item.id === 'nested-employer-education-boundary'
)

assert.ok(fixture, 'Real-layout regression fixture is missing')

const document = normalizeDocument(
  await extractPdfLayout(fixture.buffer)
)

const arrowBlocks = document.blocks.filter((block) =>
  block.text.startsWith('>')
)

assert.ok(
  arrowBlocks.length >= 5 &&
    arrowBlocks.every((block) => block.kind === 'list-item'),
  'Entry markers must create independent list-item blocks'
)

const result = await analyseCvDocument(document)
const candidates = result.candidates

assert.equal(candidates.summary.length, 1)
assert.equal(
  candidates.summary[0].value.text,
  'Analytical operator focused on execution.'
)
console.log('CV REAL LAYOUT SUMMARY BOUNDARY: PASS')

assert.deepEqual(
  candidates.experience.map((candidate) => ({
    company: candidate.value.company,
    role: candidate.value.role,
    startDate: candidate.value.startDate?.iso ?? null,
    endDate: candidate.value.endDate?.current
      ? 'current'
      : candidate.value.endDate?.iso ?? null,
  })),
  [
    {
      company: 'Acme Mobility GmbH',
      role: 'Working Student - Project Management',
      startDate: '2022-03-01',
      endDate: 'current',
    },
    {
      company: 'Acme Mobility GmbH',
      role: 'Internship - Project Management',
      startDate: '2021-10-01',
      endDate: '2022-02-01',
    },
    {
      company: 'Beta Logistics GmbH',
      role: 'Working Student - Logistics Operation',
      startDate: '2020-07-01',
      endDate: '2021-03-01',
    },
    {
      company: 'Gamma Electronics',
      role: 'Founder Start-up',
      startDate: '2017-09-01',
      endDate: '2018-02-01',
    },
  ]
)

assert.equal(
  candidates.experience.some((candidate) =>
    candidate.value.role?.toLowerCase().includes('presentations')
  ),
  false,
  'The word presentations must not be parsed as Present'
)
console.log('CV REAL LAYOUT EXPERIENCE ASSOCIATION: PASS')

assert.deepEqual(
  candidates.education.map((candidate) => ({
    institution: candidate.value.institution,
    degree: candidate.value.degree,
    field: candidate.value.field,
  })),
  [
    {
      institution: 'Technical University of Example',
      degree: 'M.Sc.',
      field: 'Consumer Science',
    },
    {
      institution: 'Example University',
      degree: 'B.Eng.',
      field: 'Industrial Engineering',
    },
    {
      institution: 'Example Institute',
      degree: 'Diploma',
      field: 'Mechanical Engineering',
    },
  ]
)
console.log('CV REAL LAYOUT EDUCATION ASSOCIATION: PASS')

assert.deepEqual(
  candidates.skills.map((candidate) => candidate.value.name),
  ['Excel (advanced)', 'Power BI']
)
console.log('CV REAL LAYOUT SKILL LABELS: PASS')

assert.deepEqual(
  candidates.languages.map((candidate) => ({
    name: candidate.value.name,
    proficiency: candidate.value.proficiency,
  })),
  [
    { name: 'English', proficiency: 'Fluent' },
    { name: 'German', proficiency: 'B2' },
  ]
)
console.log('CV REAL LAYOUT SECTION TERMINATION: PASS')



let observedTimeoutMs: number | undefined

const gateway: ModelGateway = {
  provider: 'ollama',
  capabilities: OLLAMA_GATEWAY_CAPABILITIES,
  async checkAvailability(model) {
    return {
      provider: 'ollama',
      model,
      reachable: true,
      installed: true,
      loaded: true,
      busy: false,
      latencyMs: 1,
      capabilities: OLLAMA_GATEWAY_CAPABILITIES,
    }
  },
  async generateStructured<T>(
    request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>> {
    observedTimeoutMs = request.timeoutMs
    return {
      value: { suggestions: [] } as T,
      provider: 'ollama',
      model: request.model,
      durationMs: 1,
    }
  },
}

const previewResult = await createCvProfilePreview(
  fixture.buffer,
  {
    catalog: [],
    modelRuntime: {
      gateway,
      model: 'test-model',
      timeoutMs: 120_000,
    },
    legacyAnalyse: async () => ({
      extractedSkills: [],
      careerPaths: [],
      experienceLevel: 'mid',
      summary: 'Local structured analysis.',
      provider: 'local',
      profileExtract: {
        headline: null,
        bio: null,
        education: [],
        experience: [],
      },
    }),
  }
)

assert.equal(
  observedTimeoutMs,
  20_000,
  'CV preview must cap model work at 20 seconds'
)
assert.equal(previewResult.preview.experience.length, 4)
assert.equal(previewResult.preview.education.length, 3)
assert.deepEqual(previewResult.preview.languages, ['English', 'German'])
assert.equal(
  previewResult.preview.skills.some(
    (skill) => skill.name.startsWith('Tools:')
  ),
  false
)
console.log('CV PREVIEW MODEL DEADLINE: PASS')
console.log('CV PREVIEW FINAL MAPPING: PASS')

console.log('CV REAL LAYOUT REGRESSION SMOKE: PASS')
