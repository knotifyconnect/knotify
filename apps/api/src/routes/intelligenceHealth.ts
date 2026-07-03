import { Router } from 'express'
import {
  IntelligenceConfigError,
} from '../intelligence/runtime/IntelligenceConfig.js'
import {
  createDocumentModelRuntime,
} from '../intelligence/runtime/ModelRegistry.js'
import {
  ModelGatewayError,
} from '../intelligence/runtime/ModelGatewayError.js'

export const intelligenceHealthRouter = Router()

intelligenceHealthRouter.get('/', async (_req, res) => {
  try {
    const runtime = createDocumentModelRuntime()
    const availability =
      await runtime.gateway.checkAvailability(runtime.model)

    const ok =
      availability.reachable &&
      availability.installed &&
      !availability.busy

    return res.status(ok ? 200 : 503).json({
      ok,
      configured: true,
      reachable: availability.reachable,
      modelInstalled: availability.installed,
      modelLoaded: availability.loaded,
      busy: availability.busy,
      capabilities: availability.capabilities,
      latencyMs: availability.latencyMs,
    })
  } catch (error) {
    if (error instanceof IntelligenceConfigError) {
      return res.status(503).json({
        ok: false,
        configured: false,
        reachable: false,
        modelInstalled: null,
        modelLoaded: null,
        busy: false,
        errorCode: 'CONFIGURATION',
        fields: error.fields,
      })
    }

    if (error instanceof ModelGatewayError) {
      return res.status(503).json({
        ok: false,
        configured: true,
        reachable: false,
        modelInstalled: null,
        modelLoaded: null,
        busy: error.code === 'BUSY',
        errorCode: error.code,
        retryable: error.retryable,
      })
    }

    return res.status(500).json({
      ok: false,
      configured: true,
      reachable: false,
      modelInstalled: null,
      modelLoaded: null,
      busy: false,
      errorCode: 'UNEXPECTED_ERROR',
    })
  }
})