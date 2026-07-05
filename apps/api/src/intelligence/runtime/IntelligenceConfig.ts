import { z } from 'zod'

const optionalText = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === ''
      ? undefined
      : value,
  z.string().trim().min(1).optional()
)

const environmentSchema = z.object({
  // 'gemini' is a hosted alternative to 'ollama' for environments (like
  // Vercel) with no reachable local model server — see GeminiModelGateway.ts.
  // It reuses GEMINI_API_KEY (already configured for the Companion chat)
  // rather than a value in this schema.
  LOCAL_AI_PROVIDER: z.enum(['ollama', 'gemini']).default('ollama'),
  LOCAL_AI_BASE_URL: z
    .string()
    .trim()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    }, 'LOCAL_AI_BASE_URL must use HTTP or HTTPS')
    .default('http://127.0.0.1:11434'),
  LOCAL_AI_DOCUMENT_MODEL: z.string().trim().min(1),
  LOCAL_AI_CHAT_MODEL: optionalText,
  LOCAL_AI_EMBEDDING_MODEL: optionalText,
  LOCAL_AI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(90_000),
  LOCAL_AI_MAX_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(16)
    .default(1),
  LOCAL_AI_AUTH_TOKEN: optionalText,
})

export type LocalAiProvider =
  z.infer<typeof environmentSchema>['LOCAL_AI_PROVIDER']

export interface IntelligenceConfig {
  provider: LocalAiProvider
  baseUrl: string
  documentModel: string
  chatModel?: string
  embeddingModel?: string
  timeoutMs: number
  maxConcurrency: number
  authToken?: string
}

export class IntelligenceConfigError extends Error {
  readonly name = 'IntelligenceConfigError'

  constructor(readonly fields: readonly string[]) {
    super(
      `Invalid local AI configuration: ${fields.join(', ')}`
    )
  }
}

export function loadIntelligenceConfig(
  environment: NodeJS.ProcessEnv = process.env
): IntelligenceConfig {
  const parsed = environmentSchema.safeParse(environment)

  if (!parsed.success) {
    const fields = Array.from(
      new Set(
        parsed.error.issues.map((issue) =>
          issue.path.length > 0
            ? issue.path.join('.')
            : 'LOCAL_AI_CONFIGURATION'
        )
      )
    )

    throw new IntelligenceConfigError(fields)
  }

  return {
    provider: parsed.data.LOCAL_AI_PROVIDER,
    baseUrl: parsed.data.LOCAL_AI_BASE_URL.replace(/\/+$/, ''),
    documentModel: parsed.data.LOCAL_AI_DOCUMENT_MODEL,
    chatModel: parsed.data.LOCAL_AI_CHAT_MODEL,
    embeddingModel: parsed.data.LOCAL_AI_EMBEDDING_MODEL,
    timeoutMs: parsed.data.LOCAL_AI_TIMEOUT_MS,
    maxConcurrency: parsed.data.LOCAL_AI_MAX_CONCURRENCY,
    authToken: parsed.data.LOCAL_AI_AUTH_TOKEN,
  }
}