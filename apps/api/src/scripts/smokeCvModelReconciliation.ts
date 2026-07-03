import type {
  ClassifiedCvDocument,
  CvCandidateSet,
  CvExperienceValue,
  CvModelInterpretation,
} from '../intelligence/cv/contracts.js'
import { analyseCvDocument } from '../intelligence/cv/analyseCvDocument.js'
import { reconcileCvExtraction } from '../intelligence/cv/reconcileCvExtraction.js'
import { validateCvExtraction } from '../intelligence/cv/validateCvExtraction.js'
import type { DocumentBlock, StructuredDocument } from '../intelligence/document/contracts.js'
import type { ModelCapabilities } from '../intelligence/runtime/capabilities.js'
import type { ModelGateway } from '../intelligence/runtime/ModelGateway.js'
import { ModelGatewayError } from '../intelligence/runtime/ModelGatewayError.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const EMPTY_CANDIDATES: CvCandidateSet = {
  headline: [],
  summary: [],
  experience: [],
  education: [],
  skills: [],
  languages: [],
}

function block(id: string, text: string, sourceOrder = 0): DocumentBlock {
  return {
    id,
    page: 1,
    column: 0,
    kind: 'paragraph',
    text,
    lines: [],
    x: 0,
    y: sourceOrder * 20,
    width: 500,
    height: 16,
    sourceOrder,
    readingOrder: sourceOrder,
  }
}

function classifiedExperience(): ClassifiedCvDocument {
  const source = block(
    'experience-1',
    'Example Labs\nSenior Analyst\nJanuary 2020 - Present'
  )

  return {
    blocks: [
      {
        block: source,
        section: 'experience',
        headingSection: null,
        contentText: source.text,
      },
    ],
  }
}

function unresolvedExperienceCandidates(): CvCandidateSet {
  const value: CvExperienceValue = {
    company: null,
    role: 'Senior Analyst',
    startDate: null,
    endDate: null,
    description: '',
  }

  return {
    ...structuredClone(EMPTY_CANDIDATES),
    experience: [
      {
        id: 'experience-unresolved-1',
        kind: 'experience',
        value,
        confidence: 0.55,
        sourceBlockIds: ['experience-1'],
        evidence: [
          {
            blockId: 'experience-1',
            lineIds: [],
            page: 1,
            column: 0,
            text: 'Example Labs\nSenior Analyst\nJanuary 2020 - Present',
          },
        ],
        warnings: ['missing-company'],
        sourceOrder: 0,
      },
    ],
  }
}

function suggestion(overrides: Partial<CvModelInterpretation['suggestions'][number]> = {}): CvModelInterpretation {
  return {
    suggestions: [
      {
        kind: 'experience',
        targetCandidateId: 'experience-unresolved-1',
        sourceBlockIds: ['experience-1'],
        confidence: 0.9,
        text: null,
        company: 'Example Labs',
        role: 'Senior Analyst',
        institution: null,
        degree: null,
        field: null,
        startDate: 'January 2020',
        endDate: 'Present',
        proficiency: null,
        ...overrides,
      },
    ],
  }
}

function testAmbiguityResolution() {
  const result = reconcileCvExtraction(
    unresolvedExperienceCandidates(),
    suggestion(),
    classifiedExperience()
  )

  const resolved = result.candidates.experience[0]
  assert(result.acceptedSuggestions === 1, 'Expected one accepted model suggestion')
  assert(resolved?.value.company === 'Example Labs', 'Company was not resolved')
  assert(resolved?.value.role === 'Senior Analyst', 'Role changed unexpectedly')
  assert(resolved?.value.startDate?.iso === '2020-01-01', 'Start date was not normalized')
  assert(resolved?.value.endDate?.current === true, 'Current end date was not normalized')
  assert(!resolved?.warnings.includes('missing-company'), 'Resolved warning remained')
  assert(resolved?.warnings.includes('model-assisted'), 'Model assistance was not recorded')

  console.log('CV MODEL AMBIGUITY RESOLUTION: PASS')
}

function testFabricationGuard() {
  const result = reconcileCvExtraction(
    unresolvedExperienceCandidates(),
    suggestion({ company: 'Fabricated Corp' }),
    classifiedExperience()
  )

  assert(result.acceptedSuggestions === 0, 'Fabricated suggestion was accepted')
  assert(result.rejectedSuggestions === 1, 'Fabricated suggestion was not rejected')
  assert(
    result.candidates.experience[0]?.value.company === null,
    'Rejected suggestion mutated the candidate'
  )
  assert(
    result.warnings.includes('model-suggestion-rejected:unsupported-value'),
    'Fabrication rejection reason was not recorded'
  )

  console.log('CV MODEL FABRICATION GUARD: PASS')
}

function testSimpleCandidateEnrichment() {
  const skillBlock = block('skills-1', 'TypeScript Python')
  const classified: ClassifiedCvDocument = {
    blocks: [
      {
        block: skillBlock,
        section: 'skills',
        headingSection: null,
        contentText: skillBlock.text,
      },
    ],
  }

  const interpretation: CvModelInterpretation = {
    suggestions: [
      {
        kind: 'skill',
        targetCandidateId: null,
        sourceBlockIds: ['skills-1'],
        confidence: 0.85,
        text: 'TypeScript',
        company: null,
        role: null,
        institution: null,
        degree: null,
        field: null,
        startDate: null,
        endDate: null,
        proficiency: null,
      },
    ],
  }

  const result = reconcileCvExtraction(
    structuredClone(EMPTY_CANDIDATES),
    interpretation,
    classified
  )

  assert(result.acceptedSuggestions === 1, 'Source-backed skill was not accepted')
  assert(result.candidates.skills[0]?.value.name === 'TypeScript', 'Skill was not added')
  assert(result.candidates.skills[0]?.warnings.includes('model-assisted'), 'Skill provenance missing')

  console.log('CV MODEL SIMPLE CANDIDATE ENRICHMENT: PASS')
}

function testDeduplication() {
  const skillBlock = block('skills-1', 'TypeScript')
  const deterministic: CvCandidateSet = {
    ...structuredClone(EMPTY_CANDIDATES),
    skills: [
      {
        id: 'skill-deterministic-1',
        kind: 'skill',
        value: { name: 'TypeScript' },
        confidence: 0.9,
        sourceBlockIds: ['skills-1'],
        evidence: [
          {
            blockId: 'skills-1',
            lineIds: [],
            page: 1,
            column: 0,
            text: 'TypeScript',
          },
        ],
        warnings: [],
        sourceOrder: 0,
      },
    ],
  }

  const classified: ClassifiedCvDocument = {
    blocks: [
      {
        block: skillBlock,
        section: 'skills',
        headingSection: null,
        contentText: skillBlock.text,
      },
    ],
  }

  const interpretation: CvModelInterpretation = {
    suggestions: [
      {
        kind: 'skill',
        targetCandidateId: null,
        sourceBlockIds: ['skills-1'],
        confidence: 0.8,
        text: 'TypeScript',
        company: null,
        role: null,
        institution: null,
        degree: null,
        field: null,
        startDate: null,
        endDate: null,
        proficiency: null,
      },
    ],
  }

  const reconciled = reconcileCvExtraction(
    deterministic,
    interpretation,
    classified
  )
  const validated = validateCvExtraction(reconciled.candidates)

  assert(reconciled.candidates.skills.length === 2, 'Fixture did not create a duplicate')
  assert(validated.candidates.skills.length === 1, 'Duplicate skill was not removed')
  assert(validated.candidates.skills[0]?.value.name === 'TypeScript', 'Wrong skill survived deduplication')

  console.log('CV MODEL DEDUPLICATION: PASS')
}

function structuredSkillsDocument(): StructuredDocument {
  const heading = { ...block('heading-skills', 'Skills', 0), kind: 'heading' as const }
  const content = block('skills-content', 'TypeScript', 1)

  return {
    version: '1.0',
    pageCount: 1,
    pages: [
      {
        page: 1,
        width: 595,
        height: 842,
        columns: [{ index: 0, x: 0, width: 595 }],
        spans: [],
        lines: [],
        blocks: [heading, content],
      },
    ],
    blocks: [heading, content],
  }
}

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

async function testTypedFallback() {
  const gateway: ModelGateway = {
    provider: 'test-local',
    capabilities,
    async checkAvailability() {
      throw new Error('checkAvailability should not be called')
    },
    async generateStructured() {
      throw new ModelGatewayError(
        'TIMEOUT',
        'Synthetic model timeout',
        true
      )
    },
  }

  const result = await analyseCvDocument(
    structuredSkillsDocument(),
    {
      gateway,
      model: 'test-model',
      timeoutMs: 5,
    }
  )

  assert(result.model.attempted === true, 'Model attempt was not recorded')
  assert(result.model.used === false, 'Timed-out model was marked as used')
  assert(result.model.errorCode === 'TIMEOUT', 'Typed timeout code was not preserved')
  assert(result.warnings.includes('model-fallback:TIMEOUT'), 'Fallback warning was not recorded')
  assert(
    result.candidates.skills.some((item) => item.value.name === 'TypeScript'),
    'Deterministic candidates were not preserved during fallback'
  )

  console.log('CV MODEL TYPED FALLBACK: PASS')
}

async function main() {
  testAmbiguityResolution()
  testFabricationGuard()
  testSimpleCandidateEnrichment()
  testDeduplication()
  await testTypedFallback()
  console.log('CV MODEL RECONCILIATION SMOKE: PASS')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
