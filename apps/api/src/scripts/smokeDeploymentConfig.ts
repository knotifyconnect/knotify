import assert from 'node:assert/strict'
import {
  DeploymentConfigError,
  isRequestOriginAllowed,
  loadDeploymentConfig,
} from '../config/deployment.js'

const production = loadDeploymentConfig({
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '3001',
  ALLOWED_ORIGIN: 'https://app.knotify.example, https://preview.knotify.example/path',
  ALLOWED_ORIGIN_HOST_SUFFIXES: 'knotify-web.pages.dev',
})

assert.equal(production.nodeEnv, 'production')
assert.equal(production.host, '127.0.0.1')
assert.equal(production.port, 3001)
assert.deepEqual(production.allowedOrigins, [
  'https://app.knotify.example',
  'https://preview.knotify.example',
])
assert.deepEqual(production.allowedOriginHostSuffixes, [
  'knotify-web.pages.dev',
])
assert.equal(
  isRequestOriginAllowed(
    'https://app.knotify.example',
    production
  ),
  true
)
assert.equal(
  isRequestOriginAllowed(
    'https://attacker.example',
    production
  ),
  false
)
assert.equal(
  isRequestOriginAllowed(
    'https://944f02dd.knotify-web.pages.dev',
    production
  ),
  true
)
assert.equal(
  isRequestOriginAllowed(
    'https://knotify-web.pages.dev',
    production
  ),
  true
)
assert.equal(
  isRequestOriginAllowed(
    'https://attacker-knotify-web.pages.dev',
    production
  ),
  false
)
assert.equal(
  isRequestOriginAllowed(
    'http://944f02dd.knotify-web.pages.dev',
    production
  ),
  false
)
assert.equal(isRequestOriginAllowed(undefined, production), true)

assert.throws(
  () => loadDeploymentConfig({ NODE_ENV: 'production' }),
  (error) =>
    error instanceof DeploymentConfigError &&
    error.fields.includes(
      'ALLOWED_ORIGIN, PUBLIC_WEB_URL, or ALLOWED_ORIGIN_HOST_SUFFIXES'
    )
)

assert.throws(
  () =>
    loadDeploymentConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGIN: 'not-a-url',
    }),
  (error) =>
    error instanceof DeploymentConfigError &&
    error.fields.includes('ALLOWED_ORIGIN')
)

assert.throws(
  () =>
    loadDeploymentConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGIN_HOST_SUFFIXES: '*.pages.dev',
    }),
  (error) =>
    error instanceof DeploymentConfigError &&
    error.fields.includes('ALLOWED_ORIGIN_HOST_SUFFIXES')
)

const development = loadDeploymentConfig({})
assert.equal(
  development.allowedOrigins.includes(
    'http://127.0.0.1:5173'
  ),
  true
)

console.log('DEPLOYMENT CONFIG PRODUCTION ORIGINS: PASS')
console.log('DEPLOYMENT CONFIG CORS REJECTION: PASS')
console.log('DEPLOYMENT CONFIG HTTPS HOST SUFFIX: PASS')
console.log('DEPLOYMENT CONFIG FAIL-CLOSED PRODUCTION: PASS')
console.log('DEPLOYMENT CONFIG DEVELOPMENT DEFAULTS: PASS')
console.log('DEPLOYMENT CONFIG SMOKE: PASS')
