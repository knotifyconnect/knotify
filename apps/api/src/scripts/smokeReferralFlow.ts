import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3002'

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

type ApiOptions = {
  token: string
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
}

async function apiRequest<T>(path: string, options: ApiOptions): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${options.token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!response.ok) {
    throw new Error(`[${response.status}] ${response.statusText} ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`)
  }

  return (parsed ?? {}) as T
}

async function signIn(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({ email, password })
  if (result.error || !result.data.session?.access_token) {
    throw new Error(result.error?.message ?? `Failed login for ${email}`)
  }
  return result.data.session.access_token
}

async function ensureAcceptedConnection(applicantId: string, referrerId: string) {
  const existing = await supabase
    .from('connections')
    .select('id')
    .or(`and(requester_id.eq.${applicantId},addressee_id.eq.${referrerId}),and(requester_id.eq.${referrerId},addressee_id.eq.${applicantId})`)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)

  if (existing.data?.id) {
    const update = await supabase.from('connections').update({ status: 'accepted' }).eq('id', existing.data.id)
    if (update.error) throw new Error(update.error.message)
    return
  }

  const requesterId = applicantId < referrerId ? applicantId : referrerId
  const addresseeId = applicantId < referrerId ? referrerId : applicantId
  const insert = await supabase.from('connections').insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'accepted',
  })
  if (insert.error) throw new Error(insert.error.message)
}

async function createSmokeApplicant(client: SupabaseClient) {
  const timestamp = Date.now()
  const email = `smoke.applicant.${timestamp}@nodenet.app`
  const password = 'NodeNetSmoke#2026'
  const username = `smoke_applicant_${timestamp}`

  const authUser = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Smoke Applicant' },
  })

  if (authUser.error || !authUser.data.user) {
    throw new Error(authUser.error?.message ?? 'Failed to create smoke auth user')
  }

  const profile = await client
    .from('users')
    .insert({
      auth_id: authUser.data.user.id,
      email,
      full_name: 'Smoke Applicant',
      username,
      bio: 'Automated smoke-test account for referral pipeline.',
      location_city: 'Munich',
      location_lat: 48.136,
      location_lng: 11.576,
      status: 'open_to_work',
      university: 'TUM',
      is_hr: false,
    })
    .select('id')
    .single()

  if (profile.error || !profile.data) {
    throw new Error(profile.error?.message ?? 'Failed to create smoke applicant profile')
  }

  return { email, password, userId: profile.data.id }
}

async function run() {
  const hrEmail = 'demo.hr.manager@nodenet.app'
  const hrPassword = 'NodeNetDemo#2026HR'
  const referrerEmail = 'demo.max.weber@nodenet.app'
  const referrerPassword = 'NodeNetDemo#2026B'

  const eventsTableCheck = await supabase.from('referral_events').select('id').limit(1)
  if (eventsTableCheck.error) {
    if (eventsTableCheck.error.message.toLowerCase().includes('referral_events')) {
      throw new Error('Missing DB migration: apply supabase/migrations/014_referral_events.sql and restart API')
    }
    throw new Error(eventsTableCheck.error.message)
  }

  const hrLookup = await supabase.from('users').select('id, username, is_hr').eq('username', 'demo_hr_marta').maybeSingle()
  if (hrLookup.error) throw new Error(hrLookup.error.message)
  if (!hrLookup.data) throw new Error('HR demo user not found')
  const hrUser = hrLookup.data as { id: string; username: string; is_hr: boolean }
  if (!hrUser.is_hr) throw new Error('HR demo user is not marked as is_hr')

  const referrerLookup = await supabase.from('users').select('id, username').eq('username', 'demo_max_weber').maybeSingle()
  if (referrerLookup.error) throw new Error(referrerLookup.error.message)
  if (!referrerLookup.data) throw new Error('Referrer demo user not found')
  const referrerUser = referrerLookup.data as { id: string; username: string }

  const memberLookup = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', referrerUser.id)
    .eq('confirmed', true)
    .limit(1)
    .maybeSingle()
  if (memberLookup.error) throw new Error(memberLookup.error.message)
  if (!memberLookup.data) throw new Error('Referrer is not in a confirmed company membership')
  const member = memberLookup.data as { company_id: string }

  const jobLookup = await supabase
    .from('jobs')
    .select('id, company_id, status, title')
    .eq('company_id', member.company_id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (jobLookup.error) throw new Error(jobLookup.error.message)
  if (!jobLookup.data) throw new Error('No open job found for referrer company')
  const job = jobLookup.data as { id: string; company_id: string; status: string; title: string }

  const smokeApplicant = await createSmokeApplicant(supabase)
  await ensureAcceptedConnection(smokeApplicant.userId, referrerUser.id)

  const applicantToken = await signIn(smokeApplicant.email, smokeApplicant.password)
  const referrerToken = await signIn(referrerEmail, referrerPassword)
  const hrToken = await signIn(hrEmail, hrPassword)

  const createReferral = await apiRequest<{ referral: { id: string; status: string } }>('/api/referrals', {
    token: applicantToken,
    method: 'POST',
    body: {
      jobId: job.id,
      referrerId: referrerUser.id,
      note: 'Smoke test referral request',
    },
  })

  const referralId = createReferral.referral.id

  await apiRequest(`/api/referrals/${referralId}/respond`, {
    token: referrerToken,
    method: 'PATCH',
    body: { accepted: true },
  })

  await apiRequest(`/api/referrals/${referralId}/submit`, {
    token: referrerToken,
    method: 'PATCH',
    body: {
      relationship_type: 'colleague',
      relationship_duration: '2 years',
      observed_work_directly: true,
      rating_problem_solving: 3,
      rating_collaboration: 3,
      rating_role_relevance: 2,
      note_problem_solving: 'Strong in structured debugging and resolving hard backend issues quickly.',
      note_collaboration: 'Clear communicator who aligns with teammates and proactively supports deliverables.',
      note_role_relevance: 'Profile aligns well with practical software engineering and product execution needs.',
      overall_rating: 3,
      recommendation_text:
        'I strongly recommend this applicant for the role because of consistent technical delivery, ownership, and collaborative execution across projects.',
      accountability_confirmed: true,
    },
  })

  await apiRequest(`/api/referrals/${referralId}/hr-decision`, {
    token: hrToken,
    method: 'PATCH',
    body: { status: 'under_review', note: 'Screening complete.' },
  })

  await apiRequest(`/api/referrals/${referralId}/hr-decision`, {
    token: hrToken,
    method: 'PATCH',
    body: { status: 'interview', note: 'Invite candidate to interview.' },
  })

  await apiRequest(`/api/referrals/${referralId}/hr-decision`, {
    token: hrToken,
    method: 'PATCH',
    body: { status: 'hired', note: 'Offer accepted.' },
  })

  await apiRequest(`/api/referrals/${referralId}/convert`, {
    token: applicantToken,
    method: 'PATCH',
    body: {},
  })

  const history = await apiRequest<{ events: Array<{ event_type: string; to_status: string | null }> }>(
    `/api/referrals/${referralId}/history`,
    { token: applicantToken }
  )

  const eventTypes = new Set(history.events.map((event) => event.event_type))
  const toStatuses = new Set(history.events.map((event) => event.to_status).filter(Boolean))

  const expectedEventTypes = ['created', 'referrer_response', 'submitted', 'hr_decision', 'converted']
  const expectedStatuses = ['requested', 'in_progress', 'submitted', 'under_review', 'interview', 'hired', 'converted']

  for (const value of expectedEventTypes) {
    if (!eventTypes.has(value)) throw new Error(`Missing event type in history: ${value}`)
  }
  for (const value of expectedStatuses) {
    if (!toStatuses.has(value)) throw new Error(`Missing status in history: ${value}`)
  }

  console.log('Smoke referral pipeline: PASS')
  console.log(`Referral ID: ${referralId}`)
  console.log(`Smoke applicant login: ${smokeApplicant.email} / ${smokeApplicant.password}`)
}

run().catch((error) => {
  console.error('Smoke referral pipeline: FAIL')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
