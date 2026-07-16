import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'

const authId = '00000000-0000-4000-8000-000000000001'
const requests: { method?: string; url?: string; apikey?: string; authorization?: string }[] = []
const user = {
  id: authId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'smoke@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
}

const server = createServer((req, res) => {
  requests.push({
    method: req.method,
    url: req.url,
    apikey: req.headers.apikey as string | undefined,
    authorization: req.headers.authorization,
  })
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET' && req.url === '/auth/v1/admin/users?page=1&per_page=2') {
    res.setHeader('x-total-count', '3')
    res.end(JSON.stringify({ users: [user] }))
    return
  }
  if (req.method === 'GET' && req.url === `/auth/v1/admin/users/${authId}`) {
    res.end(JSON.stringify({ user }))
    return
  }
  if (req.method === 'PUT' && req.url === `/auth/v1/admin/users/${authId}`) {
    res.end(JSON.stringify({ user: { ...user, banned_until: '2126-01-01T00:00:00.000Z' } }))
    return
  }
  if (req.method === 'DELETE' && req.url === `/auth/v1/admin/users/${authId}`) {
    res.end('{}')
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ message: 'not found' }))
})

server.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
assert(address && typeof address === 'object')
process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_transport_smoke'

try {
  const { deleteAuthUser, getAuthUser, listAuthUsers, setAuthUserBan } = await import('../lib/supabaseAdminAuth.js')
  const page = await listAuthUsers(1, 2)
  assert.equal(page.users.length, 1)
  assert.equal(page.total, 3)
  assert.equal(page.nextPage, 2)
  assert.equal((await getAuthUser(authId)).email, user.email)
  assert.equal((await setAuthUserBan(authId, '876000h')).banned_until, '2126-01-01T00:00:00.000Z')
  await deleteAuthUser(authId)

  assert.equal(requests.length, 4)
  for (const request of requests) {
    assert.equal(request.apikey, 'sb_secret_transport_smoke')
    assert.equal(request.authorization, undefined, 'sb_secret_* must not be sent as a Bearer JWT')
  }
  console.log('ADMIN AUTH TRANSPORT: PASS')
} finally {
  server.close()
}
