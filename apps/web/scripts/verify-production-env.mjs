const required = [
  'VITE_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
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

for (const name of ['VITE_API_URL', 'VITE_SUPABASE_URL']) {
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

console.log('Production web environment: PASS')
