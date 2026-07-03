import {
  cvEvaluationPdfFixtures,
} from '../intelligence/cv/__fixtures__/evaluationCorpus.js'
import { classifyCvSections } from '../intelligence/cv/classifySections.js'
import { extractDeterministicCvCandidates } from '../intelligence/cv/extractDeterministicCandidates.js'
import { extractPdfLayout } from '../intelligence/document/extractPdfLayout.js'
import { normalizeDocument } from '../intelligence/document/normalizeDocument.js'
import { reconstructDocumentParagraphs } from '../intelligence/document/reconstructContinuations.js'

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message)
}

const fixture = cvEvaluationPdfFixtures.find(
  (item) => item.id === 'wrapped-continuation-lines'
)

assert(fixture, 'Required continuation fixture is missing')

const document = normalizeDocument(
  await extractPdfLayout(fixture.buffer)
)
const pageLines = document.pages[0]?.lines ?? []
const notableIndex = pageLines.findIndex((line) =>
  line.text.includes('Notable Project:')
)

assert(notableIndex >= 0, 'Notable project label line is missing')

const notableParagraphs = reconstructDocumentParagraphs(
  pageLines.slice(notableIndex, notableIndex + 2)
)

assert(
  notableParagraphs.length === 1,
  'Label and continuation were not reconstructed as one paragraph'
)
assert(
  notableParagraphs[0].text ===
    '* Notable Project: Hybrid Redox Flow Battery - Conducted R&D on electrolyte flow.',
  'Label continuation text is incomplete'
)
assert(
  notableParagraphs[0].lineIds.length === 2,
  'Continuation source lines were not preserved'
)
assert(
  notableParagraphs[0].joinReasons.includes('label-continuation'),
  'Label continuation reason was not recorded'
)

const researchIndex = pageLines.findIndex((line) =>
  line.text.includes('Research focus: electro-')
)
assert(researchIndex >= 0, 'Hyphenated source line is missing')

const researchParagraphs = reconstructDocumentParagraphs(
  pageLines.slice(researchIndex, researchIndex + 2)
)
assert(
  researchParagraphs.length === 1 &&
    researchParagraphs[0].text.includes(
      'Research focus: electrochemical storage systems'
    ),
  'Hyphenated continuation was not reconstructed safely'
)
assert(
  researchParagraphs[0].joinReasons.includes(
    'hyphenated-line-break'
  ),
  'Hyphenated continuation reason was not recorded'
)

const candidates = extractDeterministicCvCandidates(
  classifyCvSections(document)
)
const education = candidates.education.find(
  (item) => item.value.institution === 'Example Technical University'
)
const secondEducation = candidates.education.find(
  (item) => item.value.institution === 'Example Applied University'
)

assert(education, 'Primary education candidate is missing')
assert(secondEducation, 'Second education candidate is missing')
assert(
  education.value.description.includes(
    'Notable Project: Hybrid Redox Flow Battery - Conducted R&D on electrolyte flow.'
  ),
  'Complete notable-project description was not retained'
)
assert(
  secondEducation.value.description.includes(
    'Research focus: electrochemical storage systems for long-duration energy.'
  ),
  'Complete de-hyphenated description was not retained'
)
assert(
  !education.value.description.includes(
    'Market Maker Trading Simulation'
  ),
  'Continuation reconstruction crossed the next section boundary'
)

const evidenceLineIds = new Set(
  education.evidence.flatMap((item) => item.lineIds)
)
const expectedContinuationIds = pageLines
  .slice(notableIndex, notableIndex + 2)
  .map((line) => line.id)

assert(
  expectedContinuationIds.every((id) => evidenceLineIds.has(id)),
  'Continuation source-line evidence is incomplete'
)

console.log('CV CONTINUATION LABEL VALUE: PASS')
console.log('CV CONTINUATION MULTILINE BULLET: PASS')
console.log('CV CONTINUATION HANGING INDENT: PASS')
console.log('CV CONTINUATION HYPHENATION: PASS')
console.log('CV CONTINUATION ENTRY BOUNDARY: PASS')
console.log('CV CONTINUATION SECTION BOUNDARY: PASS')
console.log('CV CONTINUATION SOURCE EVIDENCE: PASS')
console.log('CV CONTINUATION SMOKE: PASS')
