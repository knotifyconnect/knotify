import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

type DemoUser = {
  email: string
  password: string
  fullName: string
  username: string
  bio: string
  status: 'studying' | 'open_to_work' | 'employed'
  university: string | null
  currentCompany: string | null
  lat: number
  lng: number
}

const demoUsers: DemoUser[] = [
  {
    email: 'demo.lena.fischer@nodenet.app',
    password: 'NodeNetDemo#2026A',
    fullName: 'Lena Fischer',
    username: 'demo_lena_fischer',
    bio: 'Backend-oriented CS student focused on APIs and distributed systems.',
    status: 'open_to_work',
    university: 'TUM',
    currentCompany: null,
    lat: 48.1501,
    lng: 11.5676,
  },
  {
    email: 'demo.max.weber@nodenet.app',
    password: 'NodeNetDemo#2026B',
    fullName: 'Max Weber',
    username: 'demo_max_weber',
    bio: 'Frontend engineer working with React, design systems, and UX performance.',
    status: 'employed',
    university: 'LMU Munich',
    currentCompany: 'Celonis',
    lat: 48.1379,
    lng: 11.5754,
  },
  {
    email: 'demo.sophie.neumann@nodenet.app',
    password: 'NodeNetDemo#2026C',
    fullName: 'Sophie Neumann',
    username: 'demo_sophie_neumann',
    bio: 'Data analyst using Python and SQL for product insights and experimentation.',
    status: 'open_to_work',
    university: 'TUM',
    currentCompany: 'Personio',
    lat: 48.1284,
    lng: 11.6021,
  },
  {
    email: 'demo.jonas.keller@nodenet.app',
    password: 'NodeNetDemo#2026D',
    fullName: 'Jonas Keller',
    username: 'demo_jonas_keller',
    bio: 'ML engineer focused on recommendation systems and production inference.',
    status: 'employed',
    university: 'TU Munich',
    currentCompany: 'BMW Group',
    lat: 48.1762,
    lng: 11.5598,
  },
  {
    email: 'demo.amina.haddad@nodenet.app',
    password: 'NodeNetDemo#2026E',
    fullName: 'Amina Haddad',
    username: 'demo_amina_haddad',
    bio: 'Business informatics student exploring product ops and growth roles.',
    status: 'studying',
    university: 'HM Munich',
    currentCompany: null,
    lat: 48.1415,
    lng: 11.5332,
  },
]

async function ensureAuthUser(user: DemoUser) {
  const existing = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (existing.error) throw new Error(existing.error.message)

  const found = existing.data.users.find((u) => u.email?.toLowerCase() === user.email.toLowerCase())
  if (found) return found.id

  const created = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  })

  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? `Failed creating auth user ${user.email}`)
  }

  return created.data.user.id
}

async function upsertProfile(authId: string, user: DemoUser) {
  const result = await supabase
    .from('users')
    .upsert(
      {
        auth_id: authId,
        email: user.email,
        full_name: user.fullName,
        username: user.username,
        bio: user.bio,
        location_city: 'Munich',
        location_lat: user.lat,
        location_lng: user.lng,
        status: user.status,
        university: user.university,
        current_company: user.currentCompany,
        contact_email: user.email,
      },
      { onConflict: 'auth_id' }
    )
    .select('id, username')
    .single()

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? `Failed upserting profile ${user.email}`)
  }

  return result.data.id
}

async function ensureSkills(userId: string, names: string[]) {
  for (const name of names) {
    const exists = await supabase.from('skills_legacy').select('id').eq('user_id', userId).eq('name', name).maybeSingle()
    if (exists.error) throw new Error(exists.error.message)
    if (exists.data) continue

    const insert = await supabase.from('skills_legacy').insert({
      user_id: userId,
      name,
      category: 'technical',
      source: 'manual',
      is_verified: true,
    })
    if (insert.error) throw new Error(insert.error.message)
  }
}

async function run() {
  const skillMap: Record<string, string[]> = {
    demo_lena_fischer: ['Node.js', 'PostgreSQL'],
    demo_max_weber: ['React', 'TypeScript'],
    demo_sophie_neumann: ['Python', 'SQL'],
    demo_jonas_keller: ['Machine Learning', 'PyTorch'],
    demo_amina_haddad: ['Product Operations', 'Analytics'],
  }

  const created: Array<{ email: string; username: string; password: string; profileId: string }> = []

  for (const user of demoUsers) {
    const authId = await ensureAuthUser(user)
    const profileId = await upsertProfile(authId, user)
    await ensureSkills(profileId, skillMap[user.username] ?? [])
    created.push({ email: user.email, username: user.username, password: user.password, profileId })
  }

  // Seed accepted connections between all demo users (star topology: first user connected to all others)
  const profileIds = created.map((u) => u.profileId)
  const [hub, ...spokes] = profileIds
  for (const spokeId of spokes) {
    const existing = await supabase
      .from('connections')
      .select('id')
      .or(`and(requester_id.eq.${hub},addressee_id.eq.${spokeId}),and(requester_id.eq.${spokeId},addressee_id.eq.${hub})`)
      .maybeSingle()
    if (existing.error) { console.warn('connection check error:', existing.error.message); continue }
    if (existing.data) continue

    const ins = await supabase.from('connections').insert({
      requester_id: hub,
      addressee_id: spokeId,
      status: 'accepted',
    })
    if (ins.error) console.warn('connection insert error:', ins.error.message)
  }
  // Also connect the spokes to each other for a richer graph
  for (let i = 0; i < spokes.length; i++) {
    for (let j = i + 1; j < spokes.length; j++) {
      const a = spokes[i], b = spokes[j]
      const existing = await supabase
        .from('connections')
        .select('id')
        .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
        .maybeSingle()
      if (existing.error || existing.data) continue
      const ins = await supabase.from('connections').insert({ requester_id: a, addressee_id: b, status: 'accepted' })
      if (ins.error) console.warn('connection insert error:', ins.error.message)
    }
  }

  // Seed demo asks (one open ask per user) so knot bubbles appear
  const demoAsks: Array<{ username: string; content: string }> = [
    { username: 'demo_lena_fischer',  content: 'Looking for a backend internship in Munich for summer 2026 — any warm intros to startups?' },
    { username: 'demo_max_weber',     content: 'Anyone hiring junior frontend engineers with React + TypeScript? Open to hybrid roles.' },
    { username: 'demo_sophie_neumann', content: 'Seeking a data analyst role — does anyone know product teams that hire fresh grads?' },
    { username: 'demo_jonas_keller',  content: 'Writing my thesis on ML deployment. Happy to chat with anyone working on MLOps.' },
    { username: 'demo_amina_haddad',  content: 'Looking for a Product Operations or growth role. Referrals appreciated!' },
  ]

  for (const { username, content } of demoAsks) {
    const user = created.find((u) => u.username === username)
    if (!user) continue
    const existing = await supabase.from('user_asks').select('id').eq('user_id', user.profileId).eq('status', 'open').maybeSingle()
    if (existing.error || existing.data) continue
    const ins = await supabase.from('user_asks').insert({ user_id: user.profileId, content, status: 'open' })
    if (ins.error) console.warn('ask insert error:', ins.error.message)
  }

  console.log('Demo auth users are ready:')
  for (const u of created) {
    console.log(`- ${u.username} | ${u.email} | ${u.password}`)
  }
  console.log(`\nConnections and asks seeded for ${profileIds.length} demo users.`)
  console.log('Education and experience are populated by uploading a real CV from each account.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
