export interface ModelCapabilities {
  availabilityCheck: boolean
  structuredGeneration: boolean
  timeout: boolean
  cancellation: boolean
  imageInput: boolean
  chat: boolean
  streaming: boolean
  embeddings: boolean
  toolCalls: boolean
}

export const OLLAMA_GATEWAY_CAPABILITIES = Object.freeze({
  availabilityCheck: true,
  structuredGeneration: true,
  timeout: true,
  cancellation: true,
  imageInput: false,
  chat: false,
  streaming: false,
  embeddings: false,
  toolCalls: false,
}) satisfies ModelCapabilities