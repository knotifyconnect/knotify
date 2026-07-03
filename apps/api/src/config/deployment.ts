export type NodeEnvironment = 'development' | 'test' | 'production'

export interface DeploymentConfig {
  nodeEnv: NodeEnvironment
  host: string
  port: number
  allowedOrigins: readonly string[]
}

export class DeploymentConfigError extends Error {
  readonly name = 'DeploymentConfigError'

  constructor(readonly fields: readonly string[]) {
    super(`Invalid deployment configuration: ${fields.join(', ')}`)
  }
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim())

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

function parseOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return []

  const origins: string[] = []

  for (const item of value.split(',')) {
    const normalized = normalizeOrigin(item)

    if (!normalized) {
      throw new DeploymentConfigError(['ALLOWED_ORIGIN'])
    }

    origins.push(normalized)
  }

  return origins
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (!value) return 'development'

  if (value === 'development' || value === 'test' || value === 'production') {
    return value
  }

  throw new DeploymentConfigError(['NODE_ENV'])
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3001)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DeploymentConfigError(['PORT'])
  }

  return port
}

export function loadDeploymentConfig(
  environment: NodeJS.ProcessEnv = process.env
): DeploymentConfig {
  const nodeEnv = parseNodeEnvironment(environment.NODE_ENV)
  const configuredOrigins = [
    ...parseOrigins(environment.ALLOWED_ORIGIN),
    ...parseOrigins(environment.PUBLIC_WEB_URL),
  ]

  const developmentOrigins =
    nodeEnv === 'production'
      ? []
      : [
          'http://127.0.0.1:5173',
          'http://localhost:5173',
        ]

  const allowedOrigins = Array.from(
    new Set([...configuredOrigins, ...developmentOrigins])
  )

  if (nodeEnv === 'production' && allowedOrigins.length === 0) {
    throw new DeploymentConfigError([
      'ALLOWED_ORIGIN or PUBLIC_WEB_URL',
    ])
  }

  return {
    nodeEnv,
    host: environment.HOST?.trim() || '127.0.0.1',
    port: parsePort(environment.PORT),
    allowedOrigins,
  }
}

export function isRequestOriginAllowed(
  origin: string | undefined,
  config: DeploymentConfig
): boolean {
  if (!origin) return true

  const normalized = normalizeOrigin(origin)
  return Boolean(
    normalized && config.allowedOrigins.includes(normalized)
  )
}

export const deploymentConfig = loadDeploymentConfig()
