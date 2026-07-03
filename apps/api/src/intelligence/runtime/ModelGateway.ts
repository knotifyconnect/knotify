import type { ModelCapabilities } from './capabilities.js'
import type {
  StructuredOutputDefinition,
} from './StructuredOutput.js'

export interface ModelAvailability {
  provider: string
  model: string
  reachable: boolean
  installed: boolean
  loaded: boolean | null
  busy: boolean
  latencyMs: number
  capabilities: ModelCapabilities
}

export interface StructuredGenerationRequest<T> {
  model: string
  prompt: string
  output: StructuredOutputDefinition<T>
  system?: string
  temperature?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface StructuredGenerationResult<T> {
  value: T
  provider: string
  model: string
  durationMs: number
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

export interface ModelGateway {
  readonly provider: string
  readonly capabilities: ModelCapabilities

  checkAvailability(
    model: string,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<ModelAvailability>

  generateStructured<T>(
    request: StructuredGenerationRequest<T>
  ): Promise<StructuredGenerationResult<T>>
}