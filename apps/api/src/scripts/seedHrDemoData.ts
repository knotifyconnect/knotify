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
  isHr: boolean
  lat: number
  lng: number
}

const users: DemoUser[] = [
  {
    email: 'demo.hr.manager@nodenet.app',
    password: 'NodeNetDemo#2026HR',
    fullName: 'Marta Vogel',
    username: 'demo_hr_marta',
    bio: 'HR manager focused on graduate hiring and referral-driven recruiting.',
    status: 'employed',
    university: 'LMU Munich',
    currentCompany: 'Alpine Dynamics GmbH',
    isHr: true,
    lat: 48.1385,
    lng: 11.5761,
  },
  {
    email: 'demo.lena.fischer@nodenet.app',
    password: 'NodeNetDemo#2026A',
    fullName: 'Lena Fischer',
    username: 'demo_lena_fischer',
    bio: 'Backend-oriented CS student focused on APIs and distributed systems.',
    status: 'open_to_work',
    university: 'TUM',
    currentCompany: null,
    isHr: false,
    lat: 48.1501,
    lng: 11.5676,
  },
  {
    email: 'demo.max.weber@nodenet.app',
    password: 'NodeNetDemo#2026B',
    fullName: 'Max Weber',
    username: 'demo_max_weber',
    bio: 'Frontend engineer building React interfaces and design systems.',
    status: 'employed',
    university: 'LMU Munich',
    currentCompany: 'Alpine Dynamics GmbH',
    isHr: false,
    lat: 48.1379,
    lng: 11.5754,
  },
  {
    email: 'demo.sophie.neumann@nodenet.app',
    password: 'NodeNetDemo#2026C',
    fullName: 'Sophie Neumann',
    username: 'demo_sophie_neumann',
    bio: 'Data analyst experienced in SQL, experimentation, and reporting.',
    status: 'employed',
    university: 'TUM',
    currentCompany: 'Alpine Dynamics GmbH',
    isHr: false,
    lat: 48.1284,
    lng: 11.6021,
  },
  {
    email: 'demo.jonas.keller@nodenet.app',
    password: 'NodeNetDemo#2026D',
    fullName: 'Jonas Keller',
    username: 'demo_jonas_keller',
    bio: 'ML engineer focused on recommendation and model deployment.',
    status: 'employed',
    university: 'TU Munich',
    currentCompany: 'Alpine Dynamics GmbH',
    isHr: false,
    lat: 48.1762,
    lng: 11.5598,
  },
]

const jobs = [
  {
    title: 'Junior Product Analyst',
    description:
      'Work with product and data teams to monitor funnel metrics, run analyses, and support roadmap decisions. You will build dashboards, investigate behavior changes, and communicate findings to stakeholders.',
    requiredSkills: ['SQL', 'Data Analysis', 'Communication', 'Stakeholder Management'],
    location: 'Munich',
    isRemote: false,
    status: 'open' as const,
  },
  {
    title: 'Frontend Engineer (React)',
    description:
      'Build and maintain high-quality React interfaces for our internal and customer-facing applications. You will collaborate with product and design to implement reusable UI components and improve UX quality.',
    requiredSkills: ['React', 'TypeScript', 'HTML/CSS', 'Communication'],
    location: 'Munich',
    isRemote: true,
    status: 'open' as const,
  },
  {
    title: 'Backend Engineer (Node.js)',
    description:
      'Develop scalable APIs and backend services in Node.js. You will improve data flows, integrate internal tools, and collaborate closely with frontend and analytics teams.',
    requiredSkills: ['Node.js', 'SQL', 'PostgreSQL', 'Problem Solving'],
    location: 'Munich',
    isRemote: false,
    status: 'open' as const,
  },
  {
    title: 'Product Operations Intern',
    description:
      'Support cross-functional product operations, release coordination, and stakeholder communication. You will help maintain process quality and improve delivery transparency.',
    requiredSkills: ['Project Management', 'Team Collaboration', 'Communication'],
    location: 'Munich',
    isRemote: false,
    status: 'open' as const,
  },
]

async function listAllAuthUsers() {
  const out: Array<{ id: string; email?: string | null }> = []
  let page = 1
  const perPage = 200

  while (true) {
    const res = await supabase.auth.admin.listUsers({ page, perPage })
    if (res.error) throw new Error(res.error.message)
    const batch = res.data.users.map((u) => ({ id: u.id, email: u.email }))
    out.push(...batch)
    if (batch.length < perPage) break
    page += 1
  }

  return out
}

async function ensureAuthUser(user: DemoUser) {
  const existing = await listAllAuthUsers()
  const found = existing.find((u) => u.email?.toLowerCase() === user.email.toLowerCase())
  if (found) return found.id

  const create = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  })
  if (create.error || !create.data.user) throw new Error(create.error?.message ?? `Failed creating ${user.email}`)
  return create.data.user.id
}

async function upsertUserProfile(authId: string, user: DemoUser) {
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
        is_hr: user.isHr,
      },
      { onConflict: 'auth_id' }
    )
    .select('id, username, is_hr')
    .single()

  if (result.error || !result.data) throw new Error(result.error?.message ?? `Failed upserting ${user.username}`)
  return result.data
}

async function ensureCompany(companyName: string, createdBy: string) {
  const existing = await supabase.from('companies').select('id').eq('name', companyName).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data?.id) return existing.data.id

  const inserted = await supabase
    .from('companies')
    .insert({ name: companyName, city: 'Munich', industry: 'Software', created_by: createdBy })
    .select('id')
    .single()

  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'Failed creating company')
  return inserted.data.id
}

async function upsertMember(companyId: string, userId: string, role: 'hr' | 'employee' | 'admin', title: string) {
  const member = await supabase
    .from('company_members')
    .upsert(
      {
        company_id: companyId,
        user_id: userId,
        role,
        title,
        confirmed: true,
      },
      { onConflict: 'company_id,user_id' }
    )
    .select('id')
    .single()

  if (member.error) throw new Error(member.error.message)
}

async function ensureJob(companyId: string, postedBy: string, job: (typeof jobs)[number]) {
  const existing = await supabase.from('jobs').select('id').eq('company_id', companyId).eq('title', job.title).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return

  const insert = await supabase.from('jobs').insert({
    company_id: companyId,
    posted_by: postedBy,
    title: job.title,
    description: job.description,
    required_skills: job.requiredSkills,
    location: job.location,
    is_remote: job.isRemote,
    status: job.status,
  })

  if (insert.error) throw new Error(insert.error.message)
}

async function upsertAcceptedConnection(a: string, b: string) {
  const requester = a < b ? a : b
  const addressee = a < b ? b : a

  const existing = await supabase
    .from('connections')
    .select('id, status')
    .eq('requester_id', requester)
    .eq('addressee_id', addressee)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)

  if (existing.data) {
    const update = await supabase.from('connections').update({ status: 'accepted' }).eq('id', existing.data.id)
    if (update.error) throw new Error(update.error.message)
    return
  }

  const insert = await supabase.from('connections').insert({
    requester_id: requester,
    addressee_id: addressee,
    status: 'accepted',
  })
  if (insert.error) throw new Error(insert.error.message)
}

async function run() {
  const userByUsername = new Map<string, { id: string; is_hr: boolean }>()

  for (const user of users) {
    const authId = await ensureAuthUser(user)
    const row = await upsertUserProfile(authId, user)
    userByUsername.set(row.username, { id: row.id, is_hr: row.is_hr })
  }

  const hr = userByUsername.get('demo_hr_marta')
  const max = userByUsername.get('demo_max_weber')
  const sophie = userByUsername.get('demo_sophie_neumann')
  const lena = userByUsername.get('demo_lena_fischer')
  const jonas = userByUsername.get('demo_jonas_keller')

  if (!hr || !max || !sophie || !lena || !jonas) throw new Error('Required demo users are missing')

  const companyId = await ensureCompany('Alpine Dynamics GmbH', hr.id)

  await upsertMember(companyId, hr.id, 'admin', 'HR Manager')
  await upsertMember(companyId, max.id, 'employee', 'Frontend Engineer')
  await upsertMember(companyId, sophie.id, 'employee', 'Data Analyst')
  await upsertMember(companyId, jonas.id, 'employee', 'ML Engineer')

  for (const job of jobs) {
    await ensureJob(companyId, hr.id, job)
  }

  await upsertAcceptedConnection(lena.id, max.id)
  await upsertAcceptedConnection(lena.id, sophie.id)
  await upsertAcceptedConnection(lena.id, jonas.id)

  console.log('HR demo data is ready.')
  console.log('HR login: demo.hr.manager@nodenet.app / NodeNetDemo#2026HR')
  console.log('Applicant login: demo.lena.fischer@nodenet.app / NodeNetDemo#2026A')
  console.log('Referrer logins: demo.max.weber@nodenet.app, demo.sophie.neumann@nodenet.app, demo.jonas.keller@nodenet.app')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
