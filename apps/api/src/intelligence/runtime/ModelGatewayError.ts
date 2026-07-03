export type ModelGatewayErrorCode =
  | 'CONFIGURATION'
  | 'UNSUPPORTED_PROVIDER'
  | 'UNAVAILABLE'
  | 'AUTHENTICATION'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'MODEL_NOT_FOUND'
  | 'BUSY'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'SCHEMA_VALIDATION'

export class ModelGatewayError extends Error {
  readonly name = 'ModelGatewayError'

  constructor(
    readonly code: ModelGatewayErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

export function isModelGatewayError(
  error: unknown
): error is ModelGatewayError {
  return error instanceof ModelGatewayError
}