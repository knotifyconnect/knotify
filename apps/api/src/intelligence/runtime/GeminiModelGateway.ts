import { GoogleGenAI } from '@google/genai'
import { GEMINI_GATEWAY_CAPABILITIES } from './capabilities.js'
import type { IntelligenceConfig } from './IntelligenceConfig.js'
import type {
  ModelAvailability,
  ModelGateway,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from './ModelGateway.js'
import { ModelGatewayError } from './ModelGatewayError.js'
import {
  parseStructuredOutput,
  StructuredOutputError,
} from './StructuredOutput.js'

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/**
 * Gemini as a ModelGateway — a hosted alternative to OllamaModelGateway for
 * environments (like Vercel) with no reachable local model server. Reuses
 * the same GEMINI_API_KEY already configured for the Companion chat rather
 * than adding a second key; enable by setting LOCAL_AI_PROVIDER=gemini and
 * LOCAL_AI_DOCUMENT_MODEL=gemini-2.5-flash (or similar).
 */
export class GeminiModelGateway implements ModelGateway {
  readonly provider = 'gemini'
  readonly capabilities = GEMINI_GATEWAY_CAPABILITIES

  private readonly client: GoogleGenAI | null
  private readonly apiKeyPresent: boolean

  constructor(_config: IntelligenceConfig) {
    const apiKey = process.env.GEMINI_API_KEY
    this.apiKeyPresent = Boolean(apiKey)
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null
  }

  async checkAvailability(model: string, timeoutMs = 10_000, signal?: AbortSignal): Promise<ModelAvailability> {
    const startedAt = Date.now()

    if (!this.client) {
      throw new ModelGatewayError('CONFIGURATION', 'GEMINI_API_KEY is not configured', false)
    }

    try {
      // A model metadata lookup is a cheap reachability probe — it doesn't
      // consume generation quota the way an actual completion would.
      await this.client.models.get({ model, config: { httpOptions: { timeout: timeoutMs } } })
      return {
        provider: this.provider,
        model,
        reachable: true,
        installed: true,
        loaded: true,
        busy: false,
        latencyMs: Date.now() - startedAt,
        capabilities: this.capabilities,
      }
    } catch (error) {
      throw this.normaliseRequestError(error, 'Gemini availability check failed', signal)
    }
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const startedAt = Date.now()

    if (!this.client) {
      throw new ModelGatewayError('CONFIGURATION', 'GEMINI_API_KEY is not configured', false)
    }

    try {
      const response = await this.client.models.generateContent({
        model: request.model,
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        config: {
          systemInstruction: request.system,
          temperature: request.temperature ?? 0,
          responseMimeType: 'application/json',
          responseJsonSchema: request.output.jsonSchema,
          httpOptions: request.timeoutMs ? { timeout: request.timeoutMs } : undefined,
          abortSignal: request.signal,
        },
      })

      const raw = response.text
      if (!raw) {
        throw new ModelGatewayError('INVALID_RESPONSE', 'Gemini returned an empty response', true)
      }

      let value: T
      try {
        value = parseStructuredOutput(raw, request.output)
      } catch (error) {
        if (error instanceof StructuredOutputError) {
          throw new ModelGatewayError(
            error.code === 'SCHEMA_VALIDATION' ? 'SCHEMA_VALIDATION' : 'INVALID_RESPONSE',
            error.message,
            false,
            undefined,
            { cause: error }
          )
        }
        throw error
      }

      return {
        value,
        provider: this.provider,
        model: request.model,
        durationMs: Date.now() - startedAt,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
        },
      }
    } catch (error) {
      throw this.normaliseRequestError(error, 'Gemini structured generation failed', request.signal)
    }
  }

  private normaliseRequestError(error: unknown, fallbackMessage: string, externalSignal?: AbortSignal) {
    if (error instanceof ModelGatewayError) return error

    if (externalSignal?.aborted) {
      return new ModelGatewayError('CANCELLED', fallbackMessage, false, undefined, { cause: error })
    }
    if (isAbortError(error)) {
      return new ModelGatewayError('TIMEOUT', fallbackMessage, true, undefined, { cause: error })
    }

    const status = (error as { status?: number })?.status
    if (status === 401 || status === 403) {
      return new ModelGatewayError('AUTHENTICATION', fallbackMessage, false, status, { cause: error })
    }
    if (status === 404) {
      return new ModelGatewayError('MODEL_NOT_FOUND', fallbackMessage, false, status, { cause: error })
    }
    if (status === 429) {
      return new ModelGatewayError('BUSY', fallbackMessage, true, status, { cause: error })
    }

    return new ModelGatewayError('UNAVAILABLE', fallbackMessage, true, status, { cause: error })
  }
}
