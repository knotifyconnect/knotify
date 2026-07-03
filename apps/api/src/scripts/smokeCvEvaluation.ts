import { isDeepStrictEqual } from 'node:util'
import { cvEvaluationCoverageTags } from '../intelligence/evaluation/contracts.js'
import { runCvEvaluation } from '../intelligence/evaluation/runCvEvaluation.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main() {
  const first = await runCvEvaluation()
  const second = await runCvEvaluation()

  assert(first.fixtureCount >= 7, 'Evaluation corpus is too small')
  assert(
    cvEvaluationCoverageTags.every((tag) => first.coverage.includes(tag)),
    'Evaluation corpus does not cover every required layout category'
  )
  assert(
    first.metrics.validStructuredOutputRate === 1,
    'Evaluation produced an invalid structured result'
  )
  assert(
    first.metrics.unsupportedValues === 0,
    'Evaluation found a value without source evidence'
  )
  assert(
    first.metrics.descriptionCompleteness === 1,
    'Evaluation found an incomplete reconstructed description'
  )
  assert(
    first.metrics.truncatedDescriptionFields === 0,
    'Evaluation found a truncated description field'
  )

  const stableFirst = {
    mode: first.mode,
    fixtureCount: first.fixtureCount,
    coverage: first.coverage,
    metrics: {
      ...first.metrics,
      processingDurationMs: 0,
    },
    targets: first.targets,
    qualityGatePassed: first.qualityGatePassed,
    failedTargets: first.failedTargets,
    fixtures: first.fixtures.map((fixture) => ({
      ...fixture,
      durationMs: 0,
      metrics: {
        ...fixture.metrics,
        processingDurationMs: 0,
      },
    })),
  }
  const stableSecond = {
    mode: second.mode,
    fixtureCount: second.fixtureCount,
    coverage: second.coverage,
    metrics: {
      ...second.metrics,
      processingDurationMs: 0,
    },
    targets: second.targets,
    qualityGatePassed: second.qualityGatePassed,
    failedTargets: second.failedTargets,
    fixtures: second.fixtures.map((fixture) => ({
      ...fixture,
      durationMs: 0,
      metrics: {
        ...fixture.metrics,
        processingDurationMs: 0,
      },
    })),
  }

  assert(
    isDeepStrictEqual(stableFirst, stableSecond),
    'Evaluation metrics are not deterministic'
  )

  console.log('CV EVALUATION CORPUS COVERAGE: PASS')
  console.log('CV EVALUATION EXPECTED JSON: PASS')
  console.log('CV EVALUATION SOURCE SUPPORT: PASS')
  console.log('CV EVALUATION DETERMINISM: PASS')
  assert(
    first.qualityGatePassed,
    `CV evaluation quality gate failed: ${first.failedTargets.join(', ')}`
  )
  console.log('CV EVALUATION QUALITY GATE: PASS')
  console.log('CV EVALUATION SMOKE: PASS')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
