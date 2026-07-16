#!/usr/bin/env node

const adminUrl = new URL(process.env.ADMIN_URL || 'https://admin.knotify.pro/')
const apiUrl = new URL(process.env.API_URL || 'https://knotify-api.vercel.app/')
const adminSecret = process.env.ADMIN_PANEL_SECRET?.trim()
const failures = []

function pass(label, detail = '') {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(label, detail) {
  failures.push(`${label}: ${detail}`)
  console.error(`FAIL  ${label} — ${detail}`)
}

async function request(url, options = {}) {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...options })
}

async function jsonBody(response) {
  const text = await response.text()
  try {
    return { text, json: JSON.parse(text) }
  } catch {
    return { text, json: null }
  }
}

async function checkAdminShell() {
  const response = await request(adminUrl)
  const body = await response.text()
  const contentType = response.headers.get('content-type') || ''

  if (response.status !== 200) fail('Admin shell', `expected 200, received ${response.status}`)
  else if (!contentType.includes('text/html')) fail('Admin shell', `expected HTML, received ${contentType || 'no content type'}`)
  else if (body.trim() === '{}') fail('Admin shell', 'received an empty JSON object instead of the Vite application')
  else if (!body.includes('<div id="root"></div>')) fail('Admin shell', 'missing React root element')
  else pass('Admin shell', `${response.status} ${contentType}`)

  const assetPath = body.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
  if (!assetPath) {
    fail('Admin JavaScript', 'no module script was referenced by the HTML')
    return
  }

  const assetUrl = new URL(assetPath, adminUrl)
  const assetResponse = await request(assetUrl)
  const assetBody = await assetResponse.text()
  if (assetResponse.status !== 200) fail('Admin JavaScript', `expected 200, received ${assetResponse.status}`)
  else if (assetBody.length < 10_000) fail('Admin JavaScript', `bundle is unexpectedly small (${assetBody.length} bytes)`)
  else if (assetBody.includes('http://localhost:3000')) fail('Admin JavaScript', 'production bundle still points to localhost')
  else if (!assetBody.includes(apiUrl.origin)) fail('Admin JavaScript', `bundle does not reference expected API ${apiUrl.origin}`)
  else if (!assetBody.includes('Users & accounts')) fail('Admin JavaScript', 'new account-management UI is missing from the bundle')
  else pass('Admin JavaScript', `${assetBody.length.toLocaleString()} bytes, API=${apiUrl.origin}`)
}

async function checkApi() {
  const healthResponse = await request(new URL('/health', apiUrl))
  const health = await jsonBody(healthResponse)
  if (healthResponse.status !== 200 || health.json?.ok !== true) {
    fail('API health', `expected {"ok":true}, received ${healthResponse.status} ${health.text.slice(0, 120)}`)
  } else pass('API health', `${healthResponse.status} {"ok":true}`)

  const adminAuthResponse = await request(new URL('/health/admin-auth', apiUrl))
  const adminAuth = await jsonBody(adminAuthResponse)
  if (adminAuthResponse.status !== 200 || adminAuth.json?.ok !== true || adminAuth.json?.adminAuth !== 'available' || !Number.isFinite(adminAuth.json?.usersChecked)) {
    fail('Supabase Auth Admin', `expected an available Auth transport, received ${adminAuthResponse.status} ${adminAuth.text.slice(0, 160)}`)
  } else pass('Supabase Auth Admin', `secret valid; ${adminAuth.json.usersChecked} profiles checked; ${adminAuth.json.profilesOnly ?? 0} profile only`)

  const unauthenticated = await request(new URL('/api/admin-panel/accounts', apiUrl))
  const unauthenticatedBody = await jsonBody(unauthenticated)
  if (unauthenticated.status !== 401 || typeof unauthenticatedBody.json?.error !== 'string') {
    fail('Admin API protection', `expected 401 JSON error, received ${unauthenticated.status} ${unauthenticatedBody.text.slice(0, 120)}`)
  } else pass('Admin API protection', 'missing secret is rejected')

  const corsResponse = await request(new URL('/api/admin-panel/stats', apiUrl), {
    method: 'OPTIONS',
    headers: {
      Origin: adminUrl.origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type,x-admin-secret',
    },
  })
  const allowedOrigin = corsResponse.headers.get('access-control-allow-origin')
  const allowedHeaders = (corsResponse.headers.get('access-control-allow-headers') || '').toLowerCase()
  if (![200, 204].includes(corsResponse.status)) fail('Admin API CORS', `preflight returned ${corsResponse.status}`)
  else if (allowedOrigin !== adminUrl.origin) fail('Admin API CORS', `expected ${adminUrl.origin}, received ${allowedOrigin || 'no allowed origin'}`)
  else if (!allowedHeaders.includes('x-admin-secret')) fail('Admin API CORS', 'x-admin-secret is not allowed')
  else pass('Admin API CORS', `${allowedOrigin} may send x-admin-secret`)
}

async function checkAuthenticatedApi() {
  if (!adminSecret) {
    console.log('SKIP  Authenticated account data — set ADMIN_PANEL_SECRET to enable this read-only check')
    return
  }

  const headers = { 'x-admin-secret': adminSecret }
  const statsResponse = await request(new URL('/api/admin-panel/stats', apiUrl), { headers })
  const statsBody = await jsonBody(statsResponse)
  if (statsResponse.status !== 200 || !['total', 'pending', 'approved', 'rejected'].every((key) => Number.isFinite(statsBody.json?.[key]))) {
    fail('Authenticated stats', `unexpected response ${statsResponse.status} ${statsBody.text.slice(0, 180)}`)
  } else pass('Authenticated stats', `${statsBody.json.total} beta signups`)

  const accountsResponse = await request(new URL('/api/admin-panel/accounts?perPage=1000', apiUrl), { headers })
  const accountsBody = await jsonBody(accountsResponse)
  const accounts = accountsBody.json?.accounts
  const accountShapeValid = Array.isArray(accounts) && accounts.every((account) =>
    typeof account.authId === 'string' &&
    typeof account.accountStatus === 'string' &&
    typeof account.profileCompletion === 'number'
  )
  if (accountsResponse.status !== 200 || !accountShapeValid || !Number.isFinite(accountsBody.json?.stats?.total)) {
    fail('Authenticated accounts', `unexpected response ${accountsResponse.status} ${accountsBody.text.slice(0, 180)}`)
  } else pass('Authenticated accounts', `${accounts.length} loaded of ${accountsBody.json.stats.total}`)

  const firstAccount = Array.isArray(accounts) ? accounts[0] : null
  if (!firstAccount) {
    console.log('SKIP  Account detail — no accounts returned')
    return
  }

  const detailResponse = await request(new URL(`/api/admin-panel/accounts/${firstAccount.authId}`, apiUrl), { headers })
  const detailBody = await jsonBody(detailResponse)
  const activity = detailBody.json?.activity
  const activityValid = activity && ['connections', 'posts', 'messages', 'eventRsvps', 'gigs']
    .every((key) => Number.isFinite(activity[key]))
  if (detailResponse.status !== 200 || detailBody.json?.account?.authId !== firstAccount.authId || !activityValid) {
    fail('Account detail', `unexpected response ${detailResponse.status} ${detailBody.text.slice(0, 180)}`)
  } else pass('Account detail', 'identity and activity shape are valid')
}

console.log(`Admin: ${adminUrl.origin}`)
console.log(`API:   ${apiUrl.origin}`)
console.log('Mode:  read-only\n')

try {
  await checkAdminShell()
  await checkApi()
  await checkAuthenticatedApi()
} catch (error) {
  fail('Smoke test', error instanceof Error ? error.message : String(error))
}

if (failures.length) {
  console.error(`\n${failures.length} deployment check(s) failed.`)
  process.exitCode = 1
} else {
  console.log('\nAll enabled deployment checks passed.')
}
