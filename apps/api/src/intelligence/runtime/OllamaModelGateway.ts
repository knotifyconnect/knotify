import { z } from 'zod'
import {
  OLLAMA_GATEWAY_CAPABILITIES,
} from './capabilities.js'
import type {
  IntelligenceConfig,
} from './IntelligenceConfig.js'
import type {
  ModelAvailability,
  ModelGateway,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from './ModelGateway.js'
import {
  ModelGatewayError,
} from './ModelGatewayError.js'
import {
  parseStructuredOutput,
  StructuredOutputError,
} from './StructuredOutput.js'

const modelListResponseSchema = z
  .object({
    models: z
      .array(
        z
          .object({
            name: z.string().optional(),
            model: z.string().optional(),
          })
          .passthrough()
      )
      .default([]),
  })
  .passthrough()

const generationResponseSchema = z
  .object({
    response: z.string(),
    error: z.string().optional(),
    prompt_eval_count: z.number().int().optional(),
    eval_count: z.number().int().optional(),
  })
  .passthrough()

function modelNames(
  models: Array<{
    name?: string
    model?: string
  }>
) {
  return new Set(
    models.flatMap((entry) =>
      [entry.name, entry.model].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      )
    )
  )
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError')
  )
}

export class OllamaModelGateway implements ModelGateway {
  readonly provider = 'ollama'
  readonly capabilities = OLLAMA_GATEWAY_CAPABILITIES

  constructor(private readonly config: IntelligenceConfig) {}

  async checkAvailability(
    model: string,
    timeoutMs = this.config.timeoutMs,
    signal?: AbortSignal
  ): Promise<ModelAvailability> {
    const startedAt = Date.now()

    try {
      const response = await fetch(this.endpoint('/api/tags'), {
        method: 'GET',
        headers: this.headers(),
        signal: this.requestSignal(timeoutMs, signal),
      })

      if (!response.ok) {
        throw this.httpError(
          response.status,
          'Ollama availability check failed',
          false
        )
      }

      const payload: unknown = await response.json()
      const parsed = modelListResponseSchema.safeParse(payload)

      if (!parsed.success) {
        throw new ModelGatewayError(
          'INVALID_RESPONSE',
          'Ollama returned an invalid availability response',
          false
        )
      }

      const installed = modelNames(
        parsed.data.models
      ).has(model)

      const loaded = installed
        ? await this.checkLoaded(model, timeoutMs, signal)
        : false

      return {
        provider: this.provider,
        model,
        reachable: true,
        installed,
        loaded,
        busy: false,
        latencyMs: Date.now() - startedAt,
        capabilities: this.capabilities,
      }
    } catch (error) {
      throw this.normaliseRequestError(
        error,
        'Ollama availability check failed',
        signal
      )
    }
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>> {
    const startedAt = Date.now()
    const timeoutMs =
      request.timeoutMs ?? this.config.timeoutMs

    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      stream: false,
      format: request.output.jsonSchema,
      options: {
        temperature: request.temperature ?? 0,
      },
    }

    if (request.system) {
      body.system = request.system
    }

    try {
      const response = await fetch(
        this.endpoint('/api/generate'),
        {
          method: 'POST',
          headers: this.headers(true),
          body: JSON.stringify(body),
          signal: this.requestSignal(
            timeoutMs,
            request.signal
          ),
        }
      )

      if (!response.ok) {
        throw this.httpError(
          response.status,
          'Ollama structured generation failed',
          true
        )
      }

      const payload: unknown = await response.json()
      const parsed =
        generationResponseSchema.safeParse(payload)

      if (!parsed.success || parsed.data.error) {
        throw new ModelGatewayError(
          'INVALID_RESPONSE',
          'Ollama returned an invalid generation response',
          false
        )
      }

      let value: T

      try {
        value = parseStructuredOutput(
          parsed.data.response,
          request.output
        )
      } catch (error) {
        if (error instanceof StructuredOutputError) {
          throw new ModelGatewayError(
            error.code === 'SCHEMA_VALIDATION'
              ? 'SCHEMA_VALIDATION'
              : 'INVALID_RESPONSE',
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
          inputTokens: parsed.data.prompt_eval_count,
          outputTokens: parsed.data.eval_count,
        },
      }
    } catch (error) {
      throw this.normaliseRequestError(
        error,
        'Ollama structured generation failed',
        request.signal
      )
    }
  }

  private async checkLoaded(
    model: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<boolean | null> {
    try {
      const response = await fetch(this.endpoint('/api/ps'), {
        method: 'GET',
        headers: this.headers(),
        signal: this.requestSignal(timeoutMs, signal),
      })

      if (!response.ok) {
        return null
      }

      const payload: unknown = await response.json()
      const parsed = modelListResponseSchema.safeParse(payload)

      if (!parsed.success) {
        return null
      }

      return modelNames(parsed.data.models).has(model)
    } catch {
      return null
    }
  }

  private endpoint(path: string) {
    return new URL(
      path,
      `${this.config.baseUrl}/`
    ).toString()
  }

  private headers(includeJson = false) {
    const headers: Record<string, string> = {}

    if (includeJson) {
      headers['Content-Type'] = 'application/json'
    }

    if (this.config.authToken) {
      headers.Authorization =
        `Bearer ${this.config.authToken}`
    }

    return headers
  }

  private requestSignal(
    timeoutMs: number,
    externalSignal?: AbortSignal
  ) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)

    return externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal
  }

  private httpError(
    status: number,
    message: string,
    modelSpecific: boolean
  ) {
    if (status === 401 || status === 403) {
      return new ModelGatewayError(
        'AUTHENTICATION',
        message,
        false,
        status
      )
    }

    if (status === 429 || status === 503) {
      return new ModelGatewayError(
        'BUSY',
        message,
        true,
        status
      )
    }

    if (status === 404 && modelSpecific) {
      return new ModelGatewayError(
        'MODEL_NOT_FOUND',
        message,
        false,
        status
      )
    }

    return new ModelGatewayError(
      'HTTP_ERROR',
      message,
      status >= 500,
      status
    )
  }

  private normaliseRequestError(
    error: unknown,
    fallbackMessage: string,
    externalSignal?: AbortSignal
  ) {
    if (error instanceof ModelGatewayError) {
      return error
    }

    if (externalSignal?.aborted) {
      return new ModelGatewayError(
        'CANCELLED',
        fallbackMessage,
        false,
        undefined,
        { cause: error }
      )
    }

    if (isAbortError(error)) {
      return new ModelGatewayError(
        'TIMEOUT',
        fallbackMessage,
        true,
        undefined,
        { cause: error }
      )
    }

    return new ModelGatewayError(
      'UNAVAILABLE',
      fallbackMessage,
      true,
      undefined,
      { cause: error }
    )
  }
}