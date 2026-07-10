import type { NextFunction, Request, Response } from 'express'

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Log the full error server-side for diagnosis, but never leak internal
  // messages (DB constraint names, query internals, stack traces) to clients.
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err)
  if (res.headersSent) return
  return res.status(500).json({ error: 'Internal server error' })
}
