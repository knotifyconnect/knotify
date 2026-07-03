import 'dotenv/config'
import { createDocumentModelRuntime } from '../intelligence/runtime/ModelRegistry.js'
import { runCvEvaluation } from '../intelligence/evaluation/runCvEvaluation.js'

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function useModel() {
  return process.env.CV_EVAL_USE_MODEL?.trim().toLowerCase() === 'true'
}

async function main() {
  const modelEnabled = useModel()
  const runtime = modelEnabled
    ? createDocumentModelRuntime(process.env)
    : null
  const report = await runCvEvaluation(
    runtime
      ? {
          gateway: runtime.gateway,
          model: runtime.model,
          timeoutMs: runtime.config.timeoutMs,
        }
      : {}
  )

  console.log(`CV EVALUATION MODE: ${report.mode}`)
  console.log(`CV EVALUATION FIXTURES: ${report.fixtureCount}`)
  console.log(`CV EVALUATION COVERAGE: ${report.coverage.join(', ')}`)
  console.log(`EXPERIENCE RECALL: ${percent(report.metrics.experienceRecall)}`)
  console.log(`EDUCATION RECALL: ${percent(report.metrics.educationRecall)}`)
  console.log(
    `COMPANY-ROLE PRECISION: ${percent(report.metrics.companyRolePrecision)}`
  )
  console.log(`DATE ACCURACY: ${percent(report.metrics.dateAccuracy)}`)
  console.log(`SKILL PRECISION: ${percent(report.metrics.skillPrecision)}`)
  console.log(`SKILL RECALL: ${percent(report.metrics.skillRecall)}`)
  console.log(`LANGUAGE PRECISION: ${percent(report.metrics.languagePrecision)}`)
  console.log(`LANGUAGE RECALL: ${percent(report.metrics.languageRecall)}`)
  console.log(`FABRICATED RECORDS: ${report.metrics.fabricatedRecords}`)
  console.log(`UNSUPPORTED VALUES: ${report.metrics.unsupportedValues}`)
  console.log(`SECTION LEAKAGE: ${report.metrics.sectionLeakage}`)
  console.log(
    `DESCRIPTION COMPLETENESS: ${percent(report.metrics.descriptionCompleteness)}`
  )
  console.log(
    `TRUNCATED DESCRIPTION FIELDS: ${report.metrics.truncatedDescriptionFields}`
  )
  console.log(
    `VALID STRUCTURED OUTPUT: ${percent(report.metrics.validStructuredOutputRate)}`
  )
  console.log(`STABLE ORDERING: ${percent(report.metrics.stableOrderingRate)}`)
  console.log(`FALLBACK FREQUENCY: ${percent(report.metrics.fallbackFrequency)}`)
  console.log(`PROCESSING DURATION_MS: ${report.metrics.processingDurationMs}`)
  console.log(
    `QUALITY GATE: ${report.qualityGatePassed ? 'PASS' : 'FAIL'}`
  )

  if (!report.qualityGatePassed) {
    console.log(`FAILED TARGETS: ${report.failedTargets.join(', ')}`)

    for (const fixture of report.fixtures) {
      const gaps: string[] = []
      if (fixture.metrics.experienceRecall < 1) {
        gaps.push(`experienceRecall=${percent(fixture.metrics.experienceRecall)}`)
      }
      if (fixture.metrics.educationRecall < 1) {
        gaps.push(`educationRecall=${percent(fixture.metrics.educationRecall)}`)
      }
      if (fixture.metrics.fabricatedRecords > 0) {
        gaps.push(`fabricatedRecords=${fixture.metrics.fabricatedRecords}`)
      }
      if (fixture.metrics.stableOrderingRate < 1) {
        gaps.push(`stableOrdering=${percent(fixture.metrics.stableOrderingRate)}`)
      }
      if (fixture.metrics.sectionLeakage > 0) {
        gaps.push(`sectionLeakage=${fixture.metrics.sectionLeakage}`)
      }
      if (fixture.metrics.descriptionCompleteness < 1) {
        gaps.push(
          `descriptionCompleteness=${percent(fixture.metrics.descriptionCompleteness)}`
        )
      }
      if (fixture.metrics.truncatedDescriptionFields > 0) {
        gaps.push(
          `truncatedDescriptionFields=${fixture.metrics.truncatedDescriptionFields}`
        )
      }
      if (gaps.length > 0) {
        console.log(`FIXTURE GAP ${fixture.id}: ${gaps.join(', ')}`)
      }
    }
  }

  if (process.env.CV_EVAL_JSON?.trim().toLowerCase() === 'true') {
    console.log(JSON.stringify(report, null, 2))
  }

  if (
    process.env.CV_EVAL_ENFORCE?.trim().toLowerCase() === 'true' &&
    !report.qualityGatePassed
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
