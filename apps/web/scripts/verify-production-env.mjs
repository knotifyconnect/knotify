const coreRequired = [
  'VITE_API_URL',
  'VITE_APP_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]

const legalRequired = [
  'VITE_LEGAL_OPERATOR_NAME',
  'VITE_LEGAL_REPRESENTATIVE',
  'VITE_LEGAL_STREET',
  'VITE_LEGAL_POSTAL_CODE',
  'VITE_LEGAL_CITY',
  'VITE_LEGAL_COUNTRY',
  'VITE_LEGAL_EMAIL',
  'VITE_LEGAL_PRIVACY_EMAIL',
]

const protectedBranches = new Set(
  (process.env.KNOTIFY_PRODUCTION_BRANCHES || 'main,pilot,release/pilot-v0.1')
    .split(',')
    .map((branch) => branch.trim())
    .filter(Boolean)
)
const cloudflareBranch = process.env.CF_PAGES_BRANCH?.trim()
const isCloudflarePreview =
  process.env.CF_PAGES === '1' &&
  Boolean(cloudflareBranch) &&
  !protectedBranches.has(cloudflareBranch)

// Cloudflare runs the same command for production and PR previews. Preview
// branches may use the safe display fallbacks from lib/legal.ts, but every
// protected release branch stays fail-closed until the real legal identity is
// configured. Local build:production runs are strict for the same reason.
const required = [
  ...coreRequired,
  ...(isCloudflarePreview ? [] : legalRequired),
]

const missing = required.filter((name) => {
  const value = process.env[name]
  return typeof value !== 'string' || value.trim() === ''
})

if (missing.length > 0) {
  console.error(
    `Missing production web environment variables: ${missing.join(', ')}`
  )
  process.exit(1)
}

for (const name of ['VITE_API_URL', 'VITE_APP_URL', 'VITE_SUPABASE_URL']) {
  try {
    const value = new URL(process.env[name])

    if (value.protocol !== 'https:') {
      throw new Error('HTTPS is required')
    }
  } catch {
    console.error(`${name} must be a valid HTTPS URL`)
    process.exit(1)
  }
}

console.log(
  isCloudflarePreview
    ? `Preview web environment (${cloudflareBranch}): PASS`
    : 'Production web environment: PASS'
)
