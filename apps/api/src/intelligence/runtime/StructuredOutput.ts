import type { ZodType } from 'zod'

export type StructuredOutputErrorCode =
  | 'INVALID_JSON'
  | 'SCHEMA_VALIDATION'

export class StructuredOutputError extends Error {
  readonly name = 'StructuredOutputError'

  constructor(
    readonly code: StructuredOutputErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

export interface StructuredOutputDefinition<T> {
  name: string
  jsonSchema: Record<string, unknown>
  validate(value: unknown): T
}

export function defineStructuredOutput<T>(
  name: string,
  jsonSchema: Record<string, unknown>,
  validator: ZodType<T>
): StructuredOutputDefinition<T> {
  return {
    name,
    jsonSchema,
    validate(value: unknown) {
      const parsed = validator.safeParse(value)

      if (!parsed.success) {
        throw new StructuredOutputError(
          'SCHEMA_VALIDATION',
          `Structured output did not match ${name}`
        )
      }

      return parsed.data
    },
  }
}

export function parseStructuredOutput<T>(
  raw: string,
  definition: StructuredOutputDefinition<T>
): T {
  let decoded: unknown

  try {
    decoded = JSON.parse(raw)
  } catch (error) {
    throw new StructuredOutputError(
      'INVALID_JSON',
      `Structured output for ${definition.name} was not valid JSON`,
      { cause: error }
    )
  }

  return definition.validate(decoded)
}