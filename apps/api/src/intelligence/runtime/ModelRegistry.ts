import {
  loadIntelligenceConfig,
  type IntelligenceConfig,
} from './IntelligenceConfig.js'
import type { ModelGateway } from './ModelGateway.js'
import { ModelGatewayError } from './ModelGatewayError.js'
import { OllamaModelGateway } from './OllamaModelGateway.js'
import { GeminiModelGateway } from './GeminiModelGateway.js'

export interface DocumentModelRuntime {
  config: IntelligenceConfig
  gateway: ModelGateway
  model: string
}

export function createModelGateway(
  config: IntelligenceConfig
): ModelGateway {
  switch (config.provider) {
    case 'ollama':
      return new OllamaModelGateway(config)
    case 'gemini':
      return new GeminiModelGateway(config)
    default:
      throw new ModelGatewayError(
        'UNSUPPORTED_PROVIDER',
        'The configured local AI provider is not supported',
        false
      )
  }
}

export function createDocumentModelRuntime(
  environment: NodeJS.ProcessEnv = process.env
): DocumentModelRuntime {
  const config = loadIntelligenceConfig(environment)

  return {
    config,
    gateway: createModelGateway(config),
    model: config.documentModel,
  }
}