import { Router } from 'express'

export function buildNotImplementedRouter(moduleName: string) {
  const router = Router()
  router.all('*', (_req, res) => {
    res.status(501).json({ error: `${moduleName} routes are scaffolded but not implemented yet` })
  })
  return router
}
