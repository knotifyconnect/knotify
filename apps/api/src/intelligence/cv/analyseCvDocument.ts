import type { StructuredDocument } from '../document/contracts.js'
import type { ModelGateway } from '../runtime/ModelGateway.js'
import { isModelGatewayError } from '../runtime/ModelGatewayError.js'
import { classifyCvSections } from './classifySections.js'
import type { CvAnalysisResult } from './contracts.js'
import { extractDeterministicCvCandidates } from './extractDeterministicCandidates.js'
import { extractCvWithModel } from './extractCvWithModel.js'
import { reconcileCvExtraction } from './reconcileCvExtraction.js'
import { validateCvExtraction } from './validateCvExtraction.js'

export interface AnalyseCvDocumentOptions {
  gateway?: ModelGateway
  model?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export async function analyseCvDocument(
  document: StructuredDocument,
  options: AnalyseCvDocumentOptions = {}
): Promise<CvAnalysisResult> {
  const classified = classifyCvSections(document)
  const deterministic = extractDeterministicCvCandidates(classified)
  const deterministicValidation = validateCvExtraction(deterministic)

  if (!options.gateway || !options.model) {
    return {
      candidates: deterministicValidation.candidates,
      model: {
        attempted: false,
        used: false,
        provider: null,
        model: null,
        durationMs: null,
        acceptedSuggestions: 0,
        rejectedSuggestions: 0,
        errorCode: null,
      },
      warnings: deterministicValidation.warnings,
    }
  }

  try {
    const modelResult = await extractCvWithModel({
      classified,
      candidates: deterministicValidation.candidates,
      gateway: options.gateway,
      model: options.model,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    })
    const reconciled = reconcileCvExtraction(
      deterministicValidation.candidates,
      modelResult.value,
      classified
    )
    const validated = validateCvExtraction(reconciled.candidates)

    return {
      candidates: validated.candidates,
      model: {
        attempted: true,
        used: reconciled.acceptedSuggestions > 0,
        provider: modelResult.provider,
        model: modelResult.model,
        durationMs: modelResult.durationMs,
        acceptedSuggestions: reconciled.acceptedSuggestions,
        rejectedSuggestions: reconciled.rejectedSuggestions,
        errorCode: null,
      },
      warnings: [
        ...new Set([
          ...deterministicValidation.warnings,
          ...reconciled.warnings,
          ...validated.warnings,
        ]),
      ],
    }
  } catch (error) {
    if (!isModelGatewayError(error)) throw error

    const errorCode = error.code

    if (errorCode === 'CANCELLED') {
      throw error
    }

    return {
      candidates: deterministicValidation.candidates,
      model: {
        attempted: true,
        used: false,
        provider: options.gateway.provider,
        model: options.model,
        durationMs: null,
        acceptedSuggestions: 0,
        rejectedSuggestions: 0,
        errorCode,
      },
      warnings: [
        ...new Set([
          ...deterministicValidation.warnings,
          `model-fallback:${errorCode}`,
        ]),
      ],
    }
  }
}
