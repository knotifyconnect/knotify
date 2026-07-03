import 'dotenv/config'
import { z } from 'zod'
import {
  createDocumentModelRuntime,
} from '../intelligence/runtime/ModelRegistry.js'
import {
  ModelGatewayError,
} from '../intelligence/runtime/ModelGatewayError.js'
import {
  defineStructuredOutput,
} from '../intelligence/runtime/StructuredOutput.js'

const smokeOutput = defineStructuredOutput(
  'local-model-smoke',
  {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        const: 'ready',
      },
      count: {
        type: 'integer',
        const: 3,
      },
    },
    required: ['status', 'count'],
    additionalProperties: false,
  },
  z
    .object({
      status: z.literal('ready'),
      count: z.literal(3),
    })
    .strict()
)

async function main() {
  const runtime = createDocumentModelRuntime()
  const availability =
    await runtime.gateway.checkAvailability(runtime.model)

  if (!availability.installed) {
    throw new ModelGatewayError(
      'MODEL_NOT_FOUND',
      'The configured document model is not installed',
      false
    )
  }

  console.log('LOCAL MODEL AVAILABILITY: PASS')

  const result =
    await runtime.gateway.generateStructured({
      model: runtime.model,
      system:
        'Return only data that satisfies the supplied JSON schema.',
      prompt:
        'Return status ready and count 3. Do not add explanation.',
      output: smokeOutput,
      temperature: 0,
    })

  if (
    result.value.status !== 'ready' ||
    result.value.count !== 3
  ) {
    throw new Error(
      'Local model returned an unexpected structured result'
    )
  }

  console.log('LOCAL MODEL STRUCTURED OUTPUT: PASS')
  console.log(`LOCAL MODEL PROVIDER: ${result.provider}`)
  console.log(`LOCAL MODEL DURATION_MS: ${result.durationMs}`)
}

main().catch((error) => {
  if (error instanceof ModelGatewayError) {
    console.error(
      `LOCAL MODEL SMOKE: FAIL [${error.code}]`
    )
  } else {
    console.error(
      error instanceof Error ? error.message : String(error)
    )
  }

  process.exitCode = 1
})