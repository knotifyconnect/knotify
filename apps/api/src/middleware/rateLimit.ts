import type { RequestHandler } from 'express'
import { rateLimit as expressRateLimit } from 'express-rate-limit'
import { Ratelimit, type Duration } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const isProd = process.env.NODE_ENV === 'production'
const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

const redis = hasUpstash ? Redis.fromEnv() : null

function clientKey(req: { ip?: string; socket: { remoteAddress?: string } }): string {
  return req.ip || req.socket.remoteAddress || 'unknown'
}

// Distributed limiter backed by Upstash Redis, shared across every serverless
// instance. Fails OPEN — a limiter backend hiccup must never take down the API.
function upstashLimiter(max: number, window: Duration, prefix: string): RequestHandler {
  const limiter = new Ratelimit({
    redis: redis!,
    limiter: Ratelimit.slidingWindow(max, window),
    prefix,
    analytics: false,
  })

  return async (req, res, next) => {
    try {
      const { success, limit, remaining } = await limiter.limit(clientKey(req))
      res.setHeader('RateLimit-Limit', String(limit))
      res.setHeader('RateLimit-Remaining', String(Math.max(0, remaining)))
      if (!success) {
        return res.status(429).json({
          error: 'Too many requests. Please slow down and try again shortly.',
        })
      }
      return next()
    } catch (err) {
      console.error('[ratelimit] upstash error, allowing request:', err)
      return next()
    }
  }
}

// Per-instance in-memory fallback for when Upstash isn't configured (local dev).
function memoryLimiter(max: number, windowMs: number): RequestHandler {
  return expressRateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false })
}

// Broad per-IP limit across the whole API.
export const globalRateLimit: RequestHandler = hasUpstash
  ? upstashLimiter(isProd ? 3000 : 100_000, '15 m', 'rl:global')
  : memoryLimiter(15 * 60 * 1000, isProd ? 3000 : 10_000)

// Tight per-IP limit for expensive AI / upload endpoints (Companion, CV parsing).
export const aiRateLimit: RequestHandler = hasUpstash
  ? upstashLimiter(isProd ? 40 : 100_000, '1 m', 'rl:ai')
  : memoryLimiter(60 * 1000, isProd ? 40 : 10_000)

export const rateLimitBackend = hasUpstash ? 'upstash' : 'memory'
