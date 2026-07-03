import { createServer, type ServerResponse } from 'node:http'
import { z } from 'zod'
import type {
  IntelligenceConfig,
} from '../intelligence/runtime/IntelligenceConfig.js'
import {
  ModelGatewayError,
} from '../intelligence/runtime/ModelGatewayError.js'
import {
  OllamaModelGateway,
} from '../intelligence/runtime/OllamaModelGateway.js'
import {
  defineStructuredOutput,
} from '../intelligence/runtime/StructuredOutput.js'

const fixtureModel = 'fixture-document-model:latest'

const smokeOutput = defineStructuredOutput(
  'model-gateway-smoke',
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

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown
) {
  const payload = JSON.stringify(body)

  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

async function main() {
  let generationMode: 'valid' | 'invalid' = 'valid'

  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/api/tags') {
      return sendJson(response, 200, {
        models: [{ name: fixtureModel, model: fixtureModel }],
      })
    }

    if (request.method === 'GET' && request.url === '/api/ps') {
      return sendJson(response, 200, {
        models: [{ name: fixtureModel, model: fixtureModel }],
      })
    }

    if (
      request.method === 'POST' &&
      request.url === '/api/generate'
    ) {
      request.resume()

      const generated =
        generationMode === 'valid'
          ? { status: 'ready', count: 3 }
          : { status: 'wrong', count: 4 }

      return sendJson(response, 200, {
        response: JSON.stringify(generated),
        prompt_eval_count: 5,
        eval_count: 4,
      })
    }

    return sendJson(response, 404, { error: 'not found' })
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })

  try {
    const address = server.address()

    if (!address || typeof address === 'string') {
      throw new Error('Mock Ollama server did not expose a TCP port')
    }

    const config: IntelligenceConfig = {
      provider: 'ollama',
      baseUrl: `http://127.0.0.1:${address.port}`,
      documentModel: fixtureModel,
      timeoutMs: 5_000,
      maxConcurrency: 1,
    }

    const gateway = new OllamaModelGateway(config)
    const availability =
      await gateway.checkAvailability(fixtureModel)

    if (
      !availability.reachable ||
      !availability.installed ||
      availability.loaded !== true
    ) {
      throw new Error(
        'Model gateway availability result was not usable'
      )
    }

    console.log('MODEL GATEWAY AVAILABILITY: PASS')

    const result = await gateway.generateStructured({
      model: fixtureModel,
      prompt: 'Return the required fixture result.',
      output: smokeOutput,
      temperature: 0,
    })

    if (
      result.value.status !== 'ready' ||
      result.value.count !== 3
    ) {
      throw new Error(
        'Model gateway returned an unexpected structured result'
      )
    }

    console.log('MODEL GATEWAY STRUCTURED OUTPUT: PASS')

    generationMode = 'invalid'

    try {
      await gateway.generateStructured({
        model: fixtureModel,
        prompt: 'Return an invalid fixture result.',
        output: smokeOutput,
        temperature: 0,
      })

      throw new Error(
        'Model gateway accepted schema-invalid structured output'
      )
    } catch (error) {
      if (
        !(error instanceof ModelGatewayError) ||
        error.code !== 'SCHEMA_VALIDATION' ||
        error.retryable
      ) {
        throw error
      }
    }

    console.log('MODEL GATEWAY TYPED ERROR: PASS')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error)
  )
  process.exitCode = 1
})
