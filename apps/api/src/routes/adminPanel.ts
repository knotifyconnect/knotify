import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { supabase } from '../lib.js'
import { ADMIN_EMAILS, invalidateAccessCache } from '../lib/access.js'
import { sendBetaApprovalEmail } from '../lib/email.js'
import { deleteAuthUser, describeAdminAuthError, getAuthUser, getAuthUsersByIds, setAuthUserBan } from '../lib/supabaseAdminAuth.js'
import { getProductSchemaCapabilitiesSafe } from '../services/productSchema.js'

export const adminPanelRouter = Router()

function requirePanelSecret(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_PANEL_SECRET
  if (!secret) return res.status(500).json({ error: 'Admin panel not configured.' })
  const auth = req.headers['x-admin-secret']
  if (auth !== secret) return res.status(401).json({ error: 'Unauthorized.' })
  next()
}

adminPanelRouter.use(requirePanelSecret)

// Account lifecycle lives in the dedicated admin panel because this router is
// protected by a separate secret and the Supabase service key stays server-side.
const accountQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  perPage: z.coerce.number().int().min(1).max(1000).default(1000),
})
const accountIdSchema = z.string().uuid()
const accountRoleSchema = z.object({
  isAdmin: z.boolean().optional(),
  isHr: z.boolean().optional(),
  isPremium: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'At least one role must be provided.',
})
const accountActionSchema = z.object({
  action: z.enum(['deactivate', 'reactivate', 'delete']),
  confirmation: z.string().trim().max(320).optional(),
})

function isAccountBanned(bannedUntil?: string | null) {
  return Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now())
}

function accountProfileCompletion(profile: any) {
  if (!profile) return 0
  const checks = [
    profile.full_name,
    profile.username,
    profile.persona,
    profile.avatar_url,
    profile.headline,
    profile.location_city,
    Array.isArray(profile.interests) && profile.interests.length >= 3,
    Array.isArray(profile.goals) && profile.goals.length >= 1,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

type AccountUsage = { activeSeconds: number; sessions: number; pageViews: number; lastSeenAt: string | null; isOnline: boolean }

const ONLINE_WINDOW_MS = 35_000

function liveSection(path: string | null | undefined) {
  const normalized = (path ?? '/').split('?')[0]
  if (normalized === '/' || normalized === '/home') return 'Home'
  if (normalized === '/map') return 'Your Knot'
  if (normalized === '/discover') return 'Discover'
  if (normalized === '/jobs' || normalized === '/gigs') return 'Jobs & Gigs'
  if (normalized === '/cafes' || normalized.startsWith('/cafes/')) return 'Cafés'
  if (normalized === '/messages') return 'Messages'
  if (normalized === '/events') return 'Events'
  if (normalized === '/quests') return 'Quests'
  if (normalized === '/settings') return 'Settings'
  if (normalized === '/asks') return 'Asks'
  if (normalized === '/profile' || normalized.startsWith('/profile/')) return 'Profile'
  return 'Knotify'
}

function serializeAccount(authUser: any | null, profile: any | null, usage?: AccountUsage) {
  const providers = Array.isArray(authUser?.app_metadata?.providers)
    ? authUser.app_metadata.providers
    : [...new Set((authUser?.identities ?? []).map((identity: any) => identity.provider).filter(Boolean))]
  const authId = authUser?.id ?? profile?.auth_id
  const banned = isAccountBanned(authUser?.banned_until)
  return {
    id: authId,
    authId,
    profileId: profile?.id ?? null,
    email: authUser?.email ?? profile?.email ?? null,
    phone: authUser?.phone ?? null,
    fullName: profile?.full_name ?? authUser?.user_metadata?.full_name ?? authUser?.user_metadata?.name ?? null,
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? authUser?.user_metadata?.avatar_url ?? null,
    headline: profile?.headline ?? null,
    locationCity: profile?.location_city ?? null,
    university: profile?.university ?? null,
    currentCompany: profile?.current_company ?? null,
    memberStatus: profile?.status ?? null,
    persona: profile?.persona ?? null,
    interests: Array.isArray(profile?.interests) ? profile.interests : [],
    goals: Array.isArray(profile?.goals) ? profile.goals : [],
    isInternational: Boolean(profile?.is_international),
    homeCountry: profile?.home_country ?? null,
    isAdmin: Boolean(profile?.is_admin),
    isHr: Boolean(profile?.is_hr),
    isPremium: Boolean(profile?.is_premium),
    isOnline: usage
      ? usage.isOnline
      : Boolean(profile?.is_online && profile?.last_seen_at && Date.now() - new Date(profile.last_seen_at).getTime() < ONLINE_WINDOW_MS),
    lastSeenAt: usage?.lastSeenAt ?? profile?.last_seen_at ?? null,
    usage30d: {
      minutes: Math.round((usage?.activeSeconds ?? 0) / 60),
      sessions: usage?.sessions ?? 0,
      pageViews: usage?.pageViews ?? 0,
    },
    termsAcceptedAt: profile?.terms_accepted_at ?? null,
    termsVersion: profile?.terms_version ?? null,
    profileCreatedAt: profile?.created_at ?? null,
    profileUpdatedAt: profile?.updated_at ?? null,
    authCreatedAt: authUser?.created_at ?? profile?.created_at ?? null,
    authUpdatedAt: authUser?.updated_at ?? null,
    lastSignInAt: authUser?.last_sign_in_at ?? profile?.last_seen_at ?? null,
    emailConfirmedAt: authUser?.email_confirmed_at ?? authUser?.confirmed_at ?? null,
    phoneConfirmedAt: authUser?.phone_confirmed_at ?? null,
    invitedAt: authUser?.invited_at ?? null,
    providers,
    isSso: Boolean(authUser?.is_sso_user),
    isAnonymous: Boolean(authUser?.is_anonymous),
    bannedUntil: banned ? authUser?.banned_until : null,
    accountStatus: !authUser ? 'profile_only' : banned ? 'deactivated' : 'active',
    authAvailable: Boolean(authUser),
    profileCompletion: accountProfileCompletion(profile),
    onboardingComplete: Boolean(
      profile?.persona &&
      Array.isArray(profile?.interests) && profile.interests.length >= 3 &&
      Array.isArray(profile?.goals) && profile.goals.length >= 1
    ),
  }
}

// Lightweight presence feed for the operator dashboard. This intentionally
// avoids the expensive Supabase Auth enrichment used by the account manager,
// so the admin can poll it every few seconds without fan-out or rate spikes.
adminPanelRouter.get('/live-users', async (_req, res) => {
  const generatedAt = new Date()
  const productSchema = await getProductSchemaCapabilitiesSafe('admin-panel/live-users')
  if (!productSchema.activitySessions) {
    return res.json({
      available: false,
      generatedAt: generatedAt.toISOString(),
      onlineWindowSeconds: ONLINE_WINDOW_MS / 1000,
      refreshAfterSeconds: 3,
      users: [],
    })
  }

  const sessionsResult = await supabase
    .from('user_activity_sessions')
    .select('user_id, session_key, started_at, last_seen_at, active_seconds, page_views, last_path, device_type')
    .eq('is_active', true)
    .gte('last_seen_at', new Date(generatedAt.getTime() - ONLINE_WINDOW_MS).toISOString())
    .order('last_seen_at', { ascending: false })
    .limit(1000)
  if (sessionsResult.error) return res.status(500).json({ error: sessionsResult.error.message })

  const sessions = (sessionsResult.data ?? []) as any[]
  const userIds = [...new Set(sessions.map((session) => session.user_id).filter(Boolean))]
  if (!userIds.length) {
    return res.json({
      available: true,
      generatedAt: generatedAt.toISOString(),
      onlineWindowSeconds: ONLINE_WINDOW_MS / 1000,
      refreshAfterSeconds: 3,
      users: [],
    })
  }

  const profilesResult = await supabase
    .from('users')
    .select('id, full_name, username, avatar_url, headline, current_company, location_city')
    .in('id', userIds)
  if (profilesResult.error) return res.status(500).json({ error: profilesResult.error.message })
  const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]))
  const sessionsByUser = new Map<string, any[]>()
  for (const session of sessions) {
    const userSessions = sessionsByUser.get(session.user_id) ?? []
    userSessions.push(session)
    sessionsByUser.set(session.user_id, userSessions)
  }

  const users = [...sessionsByUser.entries()].map(([userId, userSessions]) => {
    userSessions.sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)))
    const latest = userSessions[0]
    const profile = profilesById.get(userId) as any
    return {
      id: userId,
      profileId: userId,
      fullName: profile?.full_name ?? 'Unknown member',
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      headline: profile?.headline ?? null,
      currentCompany: profile?.current_company ?? null,
      locationCity: profile?.location_city ?? null,
      currentPath: latest.last_path ?? '/',
      currentSection: liveSection(latest.last_path),
      deviceTypes: [...new Set(userSessions.map((session) => session.device_type).filter(Boolean))],
      sessionStartedAt: latest.started_at,
      lastSeenAt: latest.last_seen_at,
      activeSeconds: userSessions.reduce((total, session) => total + (session.active_seconds ?? 0), 0),
      pageViews: userSessions.reduce((total, session) => total + (session.page_views ?? 0), 0),
      openSessions: userSessions.length,
    }
  }).sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))

  return res.json({
    available: true,
    generatedAt: generatedAt.toISOString(),
    onlineWindowSeconds: ONLINE_WINDOW_MS / 1000,
    refreshAfterSeconds: 3,
    users,
  })
})

const activityTrendPeriodSchema = z.enum(['day', 'week', 'month', 'year'])

type ActivityTrendRow = {
  bucket_start: string
  user_id: string
  session_key: string
  active_seconds: number
  page_views: number
  heartbeats: number
  exits: number
  last_path: string
  device_type: string
  is_backfill: boolean
  last_seen_at: string
}

function monthStartInZone(now: Date, timeZone: string, offsetMonths = 0) {
  const current = zonedParts(now, timeZone)
  const shifted = new Date(Date.UTC(current.year, current.month - 1 + offsetMonths, 1))
  return zonedMidnightUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, timeZone)
}

function activityTrendWindows(period: z.infer<typeof activityTrendPeriodSchema>, now: Date, timeZone: string) {
  const base = period === 'day'
    ? { currentStart: reportDayStart(now, timeZone), previousStart: reportDayStart(now, timeZone, -1), resolution: 'hour' as const }
    : period === 'week'
      ? { currentStart: reportDayStart(now, timeZone, -6), previousStart: reportDayStart(now, timeZone, -13), resolution: 'day' as const }
      : period === 'month'
        ? { currentStart: reportDayStart(now, timeZone, -29), previousStart: reportDayStart(now, timeZone, -59), resolution: 'day' as const }
        : { currentStart: monthStartInZone(now, timeZone, -11), previousStart: monthStartInZone(now, timeZone, -23), resolution: 'month' as const }
  return { ...base, previousEnd: new Date(base.previousStart.getTime() + (now.getTime() - base.currentStart.getTime())) }
}

function activityAggregate(rows: ActivityTrendRow[]) {
  const users = new Set<string>()
  const sessions = new Set<string>()
  let activeSeconds = 0
  let pageViews = 0
  let heartbeats = 0
  let exits = 0
  for (const row of rows) {
    users.add(row.user_id)
    sessions.add(`${row.user_id}:${row.session_key}`)
    activeSeconds += row.active_seconds ?? 0
    pageViews += row.page_views ?? 0
    heartbeats += row.heartbeats ?? 0
    exits += row.exits ?? 0
  }
  return { activeUsers: users.size, sessions: sessions.size, activeMinutes: Math.round(activeSeconds / 60), pageViews, heartbeats, exits }
}

function activityPointKey(value: string | Date, resolution: 'hour' | 'day' | 'month', timeZone: string) {
  const parts = zonedParts(typeof value === 'string' ? new Date(value) : value, timeZone)
  const day = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  if (resolution === 'hour') return `${day}T${String(parts.hour).padStart(2, '0')}`
  if (resolution === 'month') return `${parts.year}-${String(parts.month).padStart(2, '0')}`
  return day
}

function normalizedActivityTotals(value: any) {
  return {
    activeUsers: Number(value?.activeUsers ?? value?.active_users ?? 0),
    sessions: Number(value?.sessions ?? 0),
    activeMinutes: Number(value?.activeMinutes ?? value?.active_minutes ?? 0),
    pageViews: Number(value?.pageViews ?? value?.page_views ?? 0),
    heartbeats: Number(value?.heartbeats ?? 0),
    exits: Number(value?.exits ?? 0),
  }
}

adminPanelRouter.get('/activity-trends', async (req, res) => {
  const parsed = activityTrendPeriodSchema.safeParse(req.query.period ?? 'week')
  if (!parsed.success) return res.status(422).json({ error: 'Invalid activity trend period.' })

  const period = parsed.data
  const now = new Date()
  const timeZone = dashboardTimeZone()
  const { currentStart, previousStart, previousEnd, resolution } = activityTrendWindows(period, now, timeZone)
  const schema = await getProductSchemaCapabilitiesSafe('admin-panel/activity-trends')
  if (!schema.activitySessions) return res.json({ available: false, period, generatedAt: now.toISOString(), timeZone })

  try {
    let source: 'hourly' | 'mixed' | 'session-estimate' = 'hourly'
    let rows: ActivityTrendRow[] = []
    let compact: any | null = null
    if (schema.activityHourly) {
      const result = await supabase.rpc('get_admin_activity_analytics', {
        p_previous_start: previousStart.toISOString(),
        p_previous_end: previousEnd.toISOString(),
        p_current_start: currentStart.toISOString(),
        p_end: now.toISOString(),
        p_resolution: resolution,
        p_timezone: timeZone,
      })
      if (result.error) throw new Error(`activity analytics aggregation: ${result.error.message}`)
      compact = result.data
      source = compact?.source === 'mixed' ? 'mixed' : 'hourly'
    } else {
      source = 'session-estimate'
      const sessions = await fetchAllDashboardRows<any>('activity trend fallback', () => supabase
        .from('user_activity_sessions')
        .select('user_id, session_key, started_at, last_seen_at, active_seconds, page_views, last_path, device_type')
        .gte('last_seen_at', previousStart.toISOString())
        .order('last_seen_at'))
      rows = sessions.map(session => ({
        bucket_start: session.last_seen_at,
        user_id: session.user_id,
        session_key: session.session_key,
        active_seconds: session.active_seconds ?? 0,
        page_views: session.page_views ?? 0,
        heartbeats: 0,
        exits: 0,
        last_path: session.last_path ?? '/',
        device_type: session.device_type ?? 'desktop',
        is_backfill: true,
        last_seen_at: session.last_seen_at,
      }))
    }

    const currentRows = rows.filter(row => new Date(row.bucket_start) >= currentStart && new Date(row.bucket_start) <= now)
    const previousRows = rows.filter(row => new Date(row.bucket_start) >= previousStart && new Date(row.bucket_start) < previousEnd)
    const pointStarts: Date[] = []
    if (resolution === 'hour') {
      for (let hour = 0; hour < 24; hour++) pointStarts.push(new Date(currentStart.getTime() + hour * 3600_000))
    } else if (resolution === 'day') {
      const days = period === 'week' ? 7 : 30
      for (let day = 0; day < days; day++) pointStarts.push(reportDayStart(now, timeZone, -(days - 1) + day))
    } else {
      for (let month = -11; month <= 0; month++) pointStarts.push(monthStartInZone(now, timeZone, month))
    }

    const rowsByPoint = new Map<string, ActivityTrendRow[]>()
    for (const row of currentRows) {
      const key = activityPointKey(row.bucket_start, resolution, timeZone)
      const bucket = rowsByPoint.get(key) ?? []
      bucket.push(row)
      rowsByPoint.set(key, bucket)
    }
    const points = pointStarts.map(start => {
      const key = activityPointKey(start, resolution, timeZone)
      const compactPoint = compact?.points?.find((point: any) => point.key === key)
      const summary = compactPoint ? normalizedActivityTotals(compactPoint) : activityAggregate(rowsByPoint.get(key) ?? [])
      const parts = zonedParts(start, timeZone)
      const label = resolution === 'hour'
        ? `${String(parts.hour).padStart(2, '0')}:00`
        : resolution === 'month'
          ? new Intl.DateTimeFormat('en-GB', { timeZone, month: 'short', year: '2-digit' }).format(start)
          : new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short' }).format(start)
      return { key, label, start: start.toISOString(), ...summary }
    })

    const timeOfDay = Array.from({ length: 24 }, (_, hour) => {
      const compactHour = compact?.timeOfDay?.find((row: any) => Number(row.hour) === hour)
      if (compactHour) return { hour, label: `${String(hour).padStart(2, '0')}:00`, ...normalizedActivityTotals(compactHour) }
      const hourRows = currentRows.filter(row => zonedParts(new Date(row.bucket_start), timeZone).hour === hour)
      return { hour, label: `${String(hour).padStart(2, '0')}:00`, ...activityAggregate(hourRows) }
    })
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const weekdays = weekdayNames.map((label, day) => ({ day, label, ...activityAggregate([]) }))
    // Intl does not expose a numeric weekday; aggregate using the stable label.
    for (const weekday of weekdays) {
      const compactDay = compact?.weekdays?.find((row: any) => Number(row.day) === weekday.day)
      if (compactDay) { Object.assign(weekday, normalizedActivityTotals(compactDay)); continue }
      const matching = currentRows.filter(row => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(row.bucket_start)) === weekday.label)
      Object.assign(weekday, activityAggregate(matching))
    }

    const devices = compact?.devices?.map((item: any) => ({ label: String(item.label), count: Number(item.count) })) ?? ['desktop', 'mobile', 'tablet'].map(label => ({
      label,
      count: new Set(currentRows.filter(row => row.device_type === label).map(row => `${row.user_id}:${row.session_key}`)).size,
    })).filter(item => item.count > 0)
    const sectionCounts = new Map<string, Set<string>>()
    for (const row of currentRows) {
      const section = liveSection(row.last_path)
      const sessions = sectionCounts.get(section) ?? new Set<string>()
      sessions.add(`${row.user_id}:${row.session_key}`)
      sectionCounts.set(section, sessions)
    }
    const sections = compact?.sections?.map((item: any) => ({ label: String(item.label), count: Number(item.count) })) ?? [...sectionCounts.entries()]
      .map(([label, sessions]) => ({ label, count: sessions.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    const peakCandidate = [...points].sort((a, b) => b.activeUsers - a.activeUsers || b.activeMinutes - a.activeMinutes)[0] ?? null
    const peak = peakCandidate && (peakCandidate.activeUsers || peakCandidate.activeMinutes || peakCandidate.pageViews) ? peakCandidate : null

    return res.json({
      available: true,
      period,
      generatedAt: now.toISOString(),
      timeZone,
      source,
      window: { start: currentStart.toISOString(), end: now.toISOString(), previousStart: previousStart.toISOString(), previousEnd: previousEnd.toISOString() },
      summary: {
        current: compact?.current ? normalizedActivityTotals(compact.current) : activityAggregate(currentRows),
        previous: compact?.previous ? normalizedActivityTotals(compact.previous) : activityAggregate(previousRows),
      },
      points,
      timeOfDay,
      weekdays,
      devices,
      sections,
      peak,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown activity trend query error'
    console.error(`[admin-panel/activity-trends] ${message}`)
    return res.status(500).json({ error: `Activity trends could not be loaded. ${message}` })
  }
})

adminPanelRouter.get('/accounts', async (req, res) => {
  const parsed = accountQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid pagination.' })
  const from = (parsed.data.page - 1) * parsed.data.perPage
  const to = from + parsed.data.perPage - 1
  const profileResult = await supabase
    .from('users')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (profileResult.error) return res.status(500).json({ error: profileResult.error.message })

  const profiles = (profileResult.data ?? []) as any[]
  const profileIds = new Set(profiles.map((profile) => profile.id))
  const usageByUser = new Map<string, AccountUsage>()
  const productSchema = await getProductSchemaCapabilitiesSafe('admin-panel/accounts')
  let activityRows: any[] = []
  if (productSchema.activitySessions) {
    const activityResult = await supabase
      .from('user_activity_sessions')
      .select('user_id, active_seconds, is_active, page_views, last_seen_at')
      .gte('last_seen_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .limit(10000)
    if (activityResult.error) console.warn('[admin-panel/accounts] activity rows unavailable:', activityResult.error)
    else activityRows = activityResult.data ?? []
  }
  for (const session of activityRows) {
      if (!profileIds.has(session.user_id)) continue
      const usage = usageByUser.get(session.user_id) ?? { activeSeconds: 0, sessions: 0, pageViews: 0, lastSeenAt: null, isOnline: false }
      usage.activeSeconds += session.active_seconds ?? 0
      usage.sessions += 1
      usage.pageViews += session.page_views ?? 0
      if (!usage.lastSeenAt || session.last_seen_at > usage.lastSeenAt) usage.lastSeenAt = session.last_seen_at
      if (session.is_active && Date.now() - new Date(session.last_seen_at).getTime() < ONLINE_WINDOW_MS) usage.isOnline = true
      usageByUser.set(session.user_id, usage)
  }
  let authById = new Map<string, any>()
  let authAvailable = true
  let warning: string | null = null

  try {
    // This Supabase project intermittently returns "Database error finding
    // users" from the bulk Auth list endpoint. Application profiles are the
    // authoritative index, and individual Auth lookups are reliable, so enrich
    // them in small concurrent batches and isolate any corrupt identity row.
    const authLookup = await getAuthUsersByIds(profiles.map((profile) => profile.auth_id).filter(Boolean), 8)
    authById = authLookup.users
    if (authLookup.failures.length) {
      // Missing/corrupt identities are isolated to their own profile rows. The
      // rest of the account panel and verified lifecycle controls stay active.
      console.warn(`[admin-panel/accounts] ${authLookup.failures.length} profile-only account(s): ${authLookup.failures.map((failure) => `${failure.authId}:${failure.code}:${failure.message}`).join(',')}`)
      if (authLookup.users.size === 0 && authLookup.checked > 0) {
        authAvailable = false
        warning = 'Supabase Auth metadata is unavailable. Profile data is shown, but lifecycle controls are temporarily disabled.'
      }
    }
  } catch (error) {
    const detail = describeAdminAuthError(error)
    authAvailable = false
    warning = 'Profile accounts loaded, but Supabase Auth metadata is temporarily unavailable. Lifecycle actions are disabled until the server secret-key permission is corrected.'
    console.error(`[admin-panel/accounts] ${detail.code}: ${detail.message}`)
  }

  const accounts = profiles
    .filter((profile) => profile.auth_id)
    .map((profile) => serializeAccount(authById.get(profile.auth_id) ?? null, profile, usageByUser.get(profile.id)))
  const total = profileResult.count ?? accounts.length
  return res.json({
    accounts,
    authAvailable,
    activityAvailable: productSchema.activitySessions,
    warning,
    pagination: {
      page: parsed.data.page,
      perPage: parsed.data.perPage,
      total,
      loaded: accounts.length,
      nextPage: to + 1 < total ? parsed.data.page + 1 : null,
      lastPage: Math.max(1, Math.ceil(total / parsed.data.perPage)),
    },
    stats: {
      total,
      active: accounts.filter((account) => account.accountStatus === 'active').length,
      deactivated: accounts.filter((account) => account.accountStatus === 'deactivated').length,
      profileOnly: accounts.filter((account) => account.accountStatus === 'profile_only').length,
      unverified: accounts.filter((account) => !account.emailConfirmedAt && !account.phoneConfirmedAt).length,
      admins: accounts.filter((account) => account.isAdmin).length,
      hr: accounts.filter((account) => account.isHr).length,
      onlineNow: accounts.filter((account) => account.isOnline).length,
      active30d: accounts.filter((account) => account.usage30d.sessions > 0).length,
    },
  })
})

adminPanelRouter.get('/accounts/:authId', async (req, res) => {
  const authId = accountIdSchema.safeParse(req.params.authId)
  if (!authId.success) return res.status(422).json({ error: 'Invalid account ID.' })
  const profileResult = await supabase.from('users').select('*').eq('auth_id', authId.data).maybeSingle()
  if (profileResult.error) return res.status(500).json({ error: profileResult.error.message })
  const profile = profileResult.data as any
  let authUser: any | null = null
  let authWarning: string | null = null
  try { authUser = await getAuthUser(authId.data) }
  catch (error) {
    const detail = describeAdminAuthError(error)
    authWarning = 'Supabase Auth metadata is unavailable for this account. Profile data and activity are still current.'
    console.error(`[admin-panel/accounts/${authId.data}] ${detail.code}: ${detail.message}`)
  }
  if (!profile && !authUser) return res.status(404).json({ error: 'Account not found.' })

  let activity = { connections: 0, posts: 0, messages: 0, eventRsvps: 0, gigs: 0 }
  if (profile?.id) {
    const profileId = profile.id
    const [connections, posts, messages, eventRsvps, gigs] = await Promise.all([
      supabase.from('connections').select('id', { count: 'exact', head: true }).or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', profileId),
      supabase.from('event_rsvps').select('id', { count: 'exact', head: true }).eq('user_id', profileId),
      supabase.from('gigs').select('id', { count: 'exact', head: true }).eq('provider_id', profileId),
    ])
    activity = {
      connections: connections.count ?? 0,
      posts: posts.count ?? 0,
      messages: messages.count ?? 0,
      eventRsvps: eventRsvps.count ?? 0,
      gigs: gigs.count ?? 0,
    }
  }
  let usage: AccountUsage | undefined
  const productSchema = await getProductSchemaCapabilitiesSafe('admin-panel/account-detail')
  if (profile?.id && productSchema.activitySessions) {
    const sessions = await supabase.from('user_activity_sessions').select('active_seconds, is_active, page_views, last_seen_at').eq('user_id', profile.id).gte('last_seen_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
    if (!sessions.error) {
      usage = (sessions.data ?? []).reduce<AccountUsage>((summary, session) => ({
        activeSeconds: summary.activeSeconds + (session.active_seconds ?? 0),
        sessions: summary.sessions + 1,
        pageViews: summary.pageViews + (session.page_views ?? 0),
        lastSeenAt: !summary.lastSeenAt || session.last_seen_at > summary.lastSeenAt ? session.last_seen_at : summary.lastSeenAt,
        isOnline: summary.isOnline || Boolean(session.is_active && Date.now() - new Date(session.last_seen_at).getTime() < ONLINE_WINDOW_MS),
      }), { activeSeconds: 0, sessions: 0, pageViews: 0, lastSeenAt: null, isOnline: false })
    }
  }
  return res.json({ account: serializeAccount(authUser, profile, usage), activity, activityAvailable: productSchema.activitySessions, warning: authWarning })
})

adminPanelRouter.patch('/accounts/:authId/roles', async (req, res) => {
  const authId = accountIdSchema.safeParse(req.params.authId)
  if (!authId.success) return res.status(422).json({ error: 'Invalid account ID.' })
  const parsed = accountRoleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message ?? 'Invalid roles.' })

  const target = await supabase.from('users').select('id, email, is_admin').eq('auth_id', authId.data).maybeSingle()
  if (target.error) return res.status(500).json({ error: target.error.message })
  if (!target.data) return res.status(404).json({ error: 'This Auth account does not have a knotify profile yet.' })

  if (parsed.data.isAdmin === false && target.data.is_admin) {
    if (target.data.email && ADMIN_EMAILS.includes(target.data.email.toLowerCase())) {
      return res.status(409).json({ error: 'Core team accounts are automatically restored as admins and cannot be demoted here.' })
    }
    const adminCount = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_admin', true)
    if (adminCount.error) return res.status(500).json({ error: adminCount.error.message })
    if ((adminCount.count ?? 0) <= 1) return res.status(409).json({ error: 'The last admin cannot be demoted.' })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.isAdmin !== undefined) patch.is_admin = parsed.data.isAdmin
  if (parsed.data.isHr !== undefined) patch.is_hr = parsed.data.isHr
  if (parsed.data.isPremium !== undefined) patch.is_premium = parsed.data.isPremium
  const update = await supabase.from('users').update(patch).eq('id', target.data.id).select('id, is_admin, is_hr, is_premium').single()
  if (update.error) return res.status(500).json({ error: update.error.message })

  console.info(`[admin-panel] roles updated for auth account ${authId.data}`)
  return res.json({ roles: { isAdmin: update.data.is_admin, isHr: update.data.is_hr, isPremium: update.data.is_premium } })
})

adminPanelRouter.post('/accounts/:authId/action', async (req, res) => {
  const authId = accountIdSchema.safeParse(req.params.authId)
  if (!authId.success) return res.status(422).json({ error: 'Invalid account ID.' })
  const parsed = accountActionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid account action.' })

  let authUser
  try { authUser = await getAuthUser(authId.data) }
  catch (error) {
    const detail = describeAdminAuthError(error)
    return res.status(detail.status).json({ error: detail.message, code: detail.code })
  }

  if (parsed.data.action === 'deactivate' || parsed.data.action === 'reactivate') {
    const banDuration = parsed.data.action === 'deactivate' ? '876000h' : 'none'
    let updatedUser
    try { updatedUser = await setAuthUserBan(authId.data, banDuration) }
    catch (error) {
      const detail = describeAdminAuthError(error)
      return res.status(detail.status).json({ error: detail.message, code: detail.code })
    }
    console.info(`[admin-panel] account ${authId.data} ${parsed.data.action}d`)
    return res.json({
      ok: true,
      accountStatus: parsed.data.action === 'deactivate' ? 'deactivated' : 'active',
      bannedUntil: parsed.data.action === 'deactivate' ? updatedUser.banned_until ?? null : null,
    })
  }

  const expectedConfirmation = (authUser.email ?? authId.data).toLowerCase()
  if ((parsed.data.confirmation ?? '').toLowerCase() !== expectedConfirmation) {
    return res.status(422).json({ error: `Type ${authUser.email ?? authId.data} to confirm permanent deletion.` })
  }

  const profile = await supabase.from('users').select('id, is_admin').eq('auth_id', authId.data).maybeSingle()
  if (profile.error) return res.status(500).json({ error: profile.error.message })
  if (profile.data?.is_admin) {
    const adminCount = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_admin', true)
    if (adminCount.error) return res.status(500).json({ error: adminCount.error.message })
    if ((adminCount.count ?? 0) <= 1) return res.status(409).json({ error: 'The last admin account cannot be deleted.' })
  }

  try { await deleteAuthUser(authId.data) }
  catch (error) {
    const detail = describeAdminAuthError(error)
    return res.status(detail.status).json({ error: detail.message, code: detail.code })
  }
  if (profile.data?.id) {
    const cleanup = await supabase.from('users').delete().eq('id', profile.data.id)
    if (cleanup.error) {
      console.warn(`[admin-panel] auth account ${authId.data} deleted, profile cleanup failed: ${cleanup.error.message}`)
      return res.json({ ok: true, warning: 'The login was deleted, but its profile row needs manual cleanup.' })
    }
  }

  console.info(`[admin-panel] account ${authId.data} permanently deleted`)
  return res.json({ ok: true })
})

// ── Image upload ──────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })
const ADMIN_IMAGES_BUCKET = 'admin-images'

async function ensureAdminBucket() {
  const { data } = await supabase.storage.listBuckets()
  if (!data?.find(b => b.name === ADMIN_IMAGES_BUCKET)) {
    await supabase.storage.createBucket(ADMIN_IMAGES_BUCKET, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    })
  }
}

adminPanelRouter.post('/upload', upload.single('image'), async (req: any, res: any) => {
  if (!req.file) return res.status(422).json({ error: 'No image file provided.' })
  try {
    await ensureAdminBucket()
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(ADMIN_IMAGES_BUCKET).upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    })
    if (error) return res.status(500).json({ error: error.message })
    const { data: pub } = supabase.storage.from(ADMIN_IMAGES_BUCKET).getPublicUrl(path)
    return res.json({ url: pub.publicUrl })
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'Upload failed.' })
  }
})

// ── Places (admin.knotify.pro only) ─────────────────────────────────────────
const placeFields = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().trim().min(2).max(120),
  venueType: z.enum(['cafe', 'restaurant', 'bar']).default('cafe'),
  address: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().min(2).max(80).default('Munich'),
  area: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(1200).optional().nullable(),
  perkText: z.string().trim().max(240).optional().nullable(),
  photoUrl: z.string().trim().max(2048).optional().nullable(),
  // Real weekly schedules routinely exceed 120 characters. Keep the field
  // bounded, but large enough for seven days plus exceptions/holiday notes.
  hoursText: z.string().trim().max(1000).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  isPartnered: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dealTitle: z.string().max(160).optional().nullable(),
  dealDetails: z.string().max(1000).optional().nullable(),
  dealCode: z.string().max(120).optional().nullable(),
  dealCodeEnabled: z.boolean().optional(),
  featuredPriority: z.number().int().min(0).max(100000).optional(),
  isArchived: z.boolean().optional(),
})

const dateTimeInput = z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be a valid ISO date or date-time' })
const httpUrl = z.string().url().max(2048).refine((value) => /^https?:\/\//i.test(value), { message: 'must be an http(s) URL' })

const eventFieldsBase = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  startsAt: dateTimeInput,
  endsAt: dateTimeInput.nullable().optional(),
  timeTba: z.boolean().optional(),
  url: httpUrl.nullable().optional(),
  hostLabel: z.string().trim().max(160).nullable().optional(),
  imageUrl: httpUrl.nullable().optional(),
  eventType: z.string().trim().min(2).max(80).nullable().optional(),
  capacity: z.number().int().min(0).max(100000).nullable().optional(),
  priceEur: z.number().int().min(0).max(100000).nullable().optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
})
const eventFields = eventFieldsBase.superRefine((value, ctx) => {
  if (value.endsAt && new Date(value.endsAt) < new Date(value.startsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'must not be before startsAt' })
  }
})

function nullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseEventBody(b: z.infer<typeof eventFields>) {
  const startsAt = new Date(b.startsAt)
  const endsAt = b.endsAt ? new Date(b.endsAt) : null
  return {
    title: b.title,
    description: nullableText(b.description),
    location: nullableText(b.location),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt?.toISOString() ?? null,
    time_tba: b.timeTba ?? false,
    url: nullableText(b.url),
    host_label: nullableText(b.hostLabel) ?? 'Munich',
    image_url: nullableText(b.imageUrl),
    event_type: b.eventType ?? null,
    capacity: b.capacity ?? null,
    price_eur: b.priceEur ?? null,
    interests: b.interests ?? [],
  }
}

function eventSchemaError(res: any, message: string) {
  if (message.includes('time_tba')) return res.status(503).json({ error: 'Migration 057 must be applied before saving events with Time TBA.' })
  if (message.includes('archived_at')) return res.status(503).json({ error: 'Migration 059 must be applied before archiving events.' })
  return res.status(500).json({ error: message })
}

const adminEventFields = 'id, title, description, location, starts_at, ends_at, time_tba, source, url, host_label, image_url, event_type, capacity, price_eur, interests, archived_at, created_at'
const adminEventFieldsWithoutArchive = 'id, title, description, location, starts_at, ends_at, time_tba, source, url, host_label, image_url, event_type, capacity, price_eur, interests, created_at'
const legacyAdminEventFields = 'id, title, description, location, starts_at, ends_at, source, url, host_label, image_url, event_type, capacity, price_eur, interests, created_at'
const defaultEventTypes = ['Business & Networking', 'Career & Jobs', 'Conference', 'Seminar', 'Lecture & Talk', 'Workshop & Training', 'Class & Course', 'Meetup', 'Community & Social', 'Education & Academic', 'Technology', 'Science', 'Health & Medical', 'Wellness', 'Sports', 'Fitness', 'Outdoor & Adventure', 'Travel & Excursion', 'Music', 'Concert', 'Dance', 'Theatre', 'Comedy', 'Film Screening', 'Arts & Culture', 'Exhibition', 'Literature & Poetry', 'Festival', 'Party & Nightlife', 'Food & Drink', 'Market', 'Fair & Expo', 'Trade Show', 'Competition & Contest', 'Gaming & Esports', 'Hobby & Leisure', 'Family & Children', 'Dating & Singles', 'Religion & Spirituality', 'Charity & Fundraising', 'Volunteering', 'Environment & Sustainability', 'Government & Civic', 'Politics & Public Affairs', 'Fashion & Beauty', 'Parade & Procession', 'Awards & Ceremony', 'Wedding', 'Private Celebration', 'Holiday & Seasonal', 'Online & Virtual', 'Hybrid', 'Other']

async function getEventTypes() {
  const result = await supabase.from('app_settings').select('value').eq('key', 'event_types').maybeSingle()
  const types = Array.isArray(result.data?.value) ? result.data.value.filter((value): value is string => typeof value === 'string' && value.trim().length > 1).map(value => value.trim()) : defaultEventTypes
  return { types: [...new Set(types)].sort((a, b) => a.localeCompare(b)), error: result.error }
}
async function saveEventTypes(types: string[]) {
  return supabase.from('app_settings').upsert({ key: 'event_types', value: types, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

function isMissingTimeTba(message: string) { return message.includes('time_tba') }

type TimeTbaAvailability = { available: true } | { available: false } | { available: null; error: string }
async function timeTbaAvailability(): Promise<TimeTbaAvailability> {
  const result = await supabase.from('events').select('time_tba').limit(1)
  if (!result.error) return { available: true }
  if (isMissingTimeTba(result.error.message)) return { available: false }
  return { available: null, error: result.error.message }
}

// Some installations predate migration 057. A normal event does not need the
// column, so retry without it rather than rejecting an otherwise valid import.
// A true Time-TBA event must still be rejected: silently dropping that state
// would change what users see.
async function insertEvent(fields: ReturnType<typeof parseEventBody>) {
  const insert = (payload: Record<string, unknown>) => supabase.from('events').insert(payload).select('id').single()
  let result: any = await insert({ ...fields, source: 'curated' })
  if (result.error && isMissingTimeTba(result.error.message) && fields.time_tba === false) {
    const { time_tba: _timeTba, ...legacyFields } = fields
    result = await insert({ ...legacyFields, source: 'curated' })
  }
  return result
}

async function updateEvent(id: string, fields: Record<string, unknown>) {
  const update = (payload: Record<string, unknown>) => supabase.from('events').update(payload).eq('id', id)
  let result: any = await update(fields)
  if (result.error && isMissingTimeTba(result.error.message) && fields.time_tba === false) {
    const { time_tba: _timeTba, ...legacyFields } = fields
    result = await update(legacyFields)
  }
  return result
}

const placeSchema = placeFields.superRefine((value, ctx) => {
  if (!value.address?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'A complete address is required for precise map coordinates.' })
  }
  if (value.dealCodeEnabled && (!value.isPartnered || !value.dealCode?.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dealCodeEnabled'], message: 'A visible code requires a partnered listing and a code.' })
  }
})

function placeValidationError(res: any, error: z.ZodError) {
  const flattened = error.flatten()
  const firstField = Object.entries(flattened.fieldErrors)
    .find(([, messages]) => Array.isArray(messages) && messages.length)
  const detail = firstField
    ? `${firstField[0]}: ${(firstField[1] as string[])[0]}`
    : flattened.formErrors[0]
  return res.status(422).json({
    error: detail ? `Check the place details. ${detail}` : 'Check the place details and try again.',
    fields: flattened,
  })
}

function placePatch(value: z.infer<typeof placeFields>) {
  const patch: Record<string, unknown> = {}
  if (value.slug !== undefined) patch.slug = value.slug
  if (value.name !== undefined) patch.name = value.name
  if (value.venueType !== undefined) patch.venue_type = value.venueType
  if (value.address !== undefined) patch.address = value.address || null
  if (value.city !== undefined) patch.city = value.city
  if (value.area !== undefined) patch.area = value.area || null
  if (value.description !== undefined) patch.description = value.description || null
  if (value.perkText !== undefined) patch.perk_text = value.perkText || null
  if (value.photoUrl !== undefined) patch.photo_url = value.photoUrl || null
  if (value.hoursText !== undefined) patch.hours_text = value.hoursText || null
  if (value.lat !== undefined) patch.lat = value.lat
  if (value.lng !== undefined) patch.lng = value.lng
  if (value.isPartnered !== undefined) patch.is_partnered = value.isPartnered
  if (value.isActive !== undefined) patch.is_active = value.isActive
  if (value.dealTitle !== undefined) patch.deal_title = value.dealTitle || null
  if (value.dealDetails !== undefined) patch.deal_details = value.dealDetails || null
  if (value.dealCode !== undefined) patch.deal_code = value.dealCode || null
  if (value.dealCodeEnabled !== undefined) patch.deal_code_enabled = value.dealCodeEnabled
  if (value.featuredPriority !== undefined) patch.featured_priority = value.featuredPriority
  if (value.isArchived !== undefined) patch.archived_at = value.isArchived ? new Date().toISOString() : null
  return patch
}

function placeSchemaError(res: any, message: string) {
  if (message.includes('venue_type') || message.includes('archived_at')) {
    return res.status(503).json({ error: 'Cafe listing migration 054 must be applied before managing places.' })
  }
  return res.status(500).json({ error: message })
}

adminPanelRouter.get('/cafes', async (_req, res) => {
  const result = await supabase
    .from('cafes')
    .select('id, slug, name, venue_type, address, city, area, description, perk_text, photo_url, hours_text, lat, lng, is_partnered, is_active, deal_title, deal_details, deal_code, deal_code_enabled, featured_priority, archived_at')
    .order('archived_at', { ascending: true })
    .order('is_partnered', { ascending: false })
    .order('featured_priority', { ascending: false })
    .order('name', { ascending: true })
  if (result.error) return placeSchemaError(res, result.error.message)
  return res.json({ cafes: result.data ?? [] })
})

adminPanelRouter.post('/cafes', async (req, res) => {
  const parsed = placeSchema.safeParse(req.body)
  if (!parsed.success) return placeValidationError(res, parsed.error)
  try {
    const slug = await uniqueCafeSlug(parsed.data.name)
    const coordinates = await geocodeCafe(parsed.data.address, parsed.data.city)
    const insert = await supabase.from('cafes').insert({ ...placePatch(parsed.data), slug, ...coordinates }).select('*').single()
    if (insert.error) return placeSchemaError(res, insert.error.message)
    return res.status(201).json({ cafe: insert.data })
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : 'Could not locate this address.' }) }
})

adminPanelRouter.patch('/cafes/:id', async (req, res) => {
  const parsed = placeFields.partial().safeParse(req.body)
  if (!parsed.success) return placeValidationError(res, parsed.error)

  const current = await supabase.from('cafes').select('address, city, is_partnered, deal_code, deal_code_enabled').eq('id', req.params.id).maybeSingle()
  if (current.error) return placeSchemaError(res, current.error.message)
  if (!current.data) return res.status(404).json({ error: 'Place not found.' })
  const partnered = parsed.data.isPartnered ?? current.data.is_partnered
  const code = parsed.data.dealCode ?? current.data.deal_code
  const enabled = parsed.data.dealCodeEnabled ?? current.data.deal_code_enabled
  if (enabled && (!partnered || !code?.trim())) return res.status(422).json({ error: 'A visible code requires a partnered listing and a code.' })

  let generated: Record<string, unknown> = {}
  try {
    const nextAddress = parsed.data.address ?? current.data.address
    const nextCity = parsed.data.city ?? current.data.city
    const locationChanged = nextAddress?.trim() !== current.data.address?.trim() || nextCity.trim() !== current.data.city.trim()
    if (locationChanged) {
      generated = { ...generated, ...await geocodeCafe(nextAddress, nextCity) }
    }
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : 'Could not locate this address.' }) }
  const patch = { ...placePatch(parsed.data as z.infer<typeof placeFields>), ...generated, updated_at: new Date().toISOString() }
  const update = await supabase.from('cafes').update(patch).eq('id', req.params.id).select('*').maybeSingle()
  if (update.error) return placeSchemaError(res, update.error.message)
  if (!update.data) return res.status(404).json({ error: 'Place not found.' })
  return res.json({ cafe: update.data })
})

adminPanelRouter.delete('/cafes/:id', async (req, res) => {
  if (req.query.permanent === 'true') {
    const deleted = await supabase.from('cafes').delete().eq('id', req.params.id).select('id').maybeSingle()
    if (deleted.error) return res.status(409).json({ error: `Could not delete place: ${deleted.error.message}` })
    if (!deleted.data) return res.status(404).json({ error: 'Place not found.' })
    return res.json({ ok: true, deleted: true })
  }
  const archived = await supabase
    .from('cafes')
    .update({ is_active: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle()
  if (archived.error) return placeSchemaError(res, archived.error.message)
  if (!archived.data) return res.status(404).json({ error: 'Place not found.' })
  return res.json({ ok: true })
})

// ── Beta signups ──────────────────────────────────────────────────────────────
adminPanelRouter.get('/beta-signups', async (req, res) => {
  const status = req.query.status as string | undefined
  let query = supabase.from('beta_signups').select('*').order('created_at', { ascending: false })
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ signups: data ?? [] })
})

adminPanelRouter.patch('/beta-signups/:id', async (req, res) => {
  const { status } = req.body
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(422).json({ error: 'Invalid status.' })
  }
  const { data, error } = await supabase
    .from('beta_signups').update({ status }).eq('id', req.params.id).select('*').maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Signup not found.' })

  if (status === 'approved' && data.email) {
    sendBetaApprovalEmail(data.email, data.name ?? undefined).catch(err =>
      console.error('[admin] approval email failed:', err)
    )
  }

  return res.json({ signup: data })
})

// ── Events ────────────────────────────────────────────────────────────────────
adminPanelRouter.get('/events', async (_req, res) => {
  let result: any = await supabase
    .from('events')
    .select(adminEventFields)
    .order('starts_at', { ascending: true })
  if (result.error?.message.includes('archived_at')) {
    result = await supabase.from('events').select(adminEventFieldsWithoutArchive).order('starts_at', { ascending: true })
    if (!result.error) return res.json({ events: (result.data ?? []).map((event: any) => ({ ...event, archived_at: null })) })
  }
  if (result.error && isMissingTimeTba(result.error.message)) {
    result = await supabase.from('events').select(legacyAdminEventFields).order('starts_at', { ascending: true })
    if (!result.error) return res.json({ events: (result.data ?? []).map((event: any) => ({ ...event, time_tba: false, archived_at: null })) })
  }
  if (result.error) return eventSchemaError(res, result.error.message)
  return res.json({ events: result.data ?? [] })
})

function cafeSlug(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56) || 'place'
}

async function uniqueCafeSlug(name: string, currentId?: string) {
  const base = cafeSlug(name)
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix ? `${base}-${suffix + 1}` : base
    let query = supabase.from('cafes').select('id').eq('slug', slug)
    if (currentId) query = query.neq('id', currentId)
    const existing = await query.maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    if (!existing.data) return slug
  }
  throw new Error('Could not create a unique place identifier.')
}

async function geocodeCafe(address: string | null | undefined, city: string) {
  if (!address?.trim()) return { lat: null, lng: null }
  const streetAddress = address.split(',')[0]?.trim()
  const streetMatch = streetAddress.match(/^(.*?)(?:\s+(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?))?$/)
  const street = streetMatch?.[1]?.trim() || streetAddress
  const houseNumber = streetMatch?.[2]
  const postalCode = address.match(/\b\d{5}\b/)?.[0]
  const query = [streetAddress, postalCode, city.trim(), 'Germany'].filter(Boolean).join(', ')
  const params = new URLSearchParams({ street, city: city.trim(), countrycode: 'DE', limit: '1', lang: 'de' })
  if (houseNumber) params.set('housenumber', houseNumber)
  if (postalCode) params.set('postcode', postalCode)
  const response = await fetch(`https://photon.komoot.io/structured?${params}`, {
    headers: { 'User-Agent': 'knotify-admin/1.0 (https://knotify.pro)' }, signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Address lookup is temporarily unavailable.')
  const payload = await response.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> }
  const coordinates = payload.features?.[0]?.geometry?.coordinates
  const lng = Number(coordinates?.[0]); const lat = Number(coordinates?.[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`Could not precisely locate “${query}”. Check the street, number, postal code, and city.`)
  return { lat, lng }
}

adminPanelRouter.get('/event-types', async (_req, res) => {
  const { types, error } = await getEventTypes()
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ types })
})
adminPanelRouter.post('/event-types', async (req, res) => {
  const label = typeof req.body?.label === 'string' ? req.body.label.trim().replace(/\s+/g, ' ') : ''
  if (label.length < 2 || label.length > 80) return res.status(422).json({ error: 'Type must be 2–80 characters.' })
  const current = await getEventTypes(); if (current.error) return res.status(500).json({ error: current.error.message })
  const types = [...current.types, label].filter((value, index, all) => all.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index)
  const saved = await saveEventTypes(types); if (saved.error) return res.status(500).json({ error: saved.error.message })
  return res.status(201).json({ types })
})
adminPanelRouter.patch('/event-types', async (req, res) => {
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : ''
  const nextLabel = typeof req.body?.nextLabel === 'string' ? req.body.nextLabel.trim().replace(/\s+/g, ' ') : ''
  if (!label || nextLabel.length < 2 || nextLabel.length > 80) return res.status(422).json({ error: 'Invalid event type.' })
  const current = await getEventTypes(); if (current.error) return res.status(500).json({ error: current.error.message })
  if (!current.types.includes(label)) return res.status(404).json({ error: 'Event type not found.' })
  const types = current.types.map(type => type === label ? nextLabel : type)
  const saved = await saveEventTypes(types); if (saved.error) return res.status(500).json({ error: saved.error.message })
  const events = await supabase.from('events').update({ event_type: nextLabel }).eq('event_type', label)
  if (events.error) return res.status(500).json({ error: events.error.message })
  return res.json({ types })
})
adminPanelRouter.delete('/event-types', async (req, res) => {
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : ''
  const current = await getEventTypes(); if (current.error) return res.status(500).json({ error: current.error.message })
  const types = current.types.filter(type => type !== label)
  if (types.length === current.types.length) return res.status(404).json({ error: 'Event type not found.' })
  const saved = await saveEventTypes(types); if (saved.error) return res.status(500).json({ error: saved.error.message })
  return res.json({ types })
})

adminPanelRouter.post('/events', async (req, res) => {
  const parsed = eventFields.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid event', fields: parsed.error.flatten() })
  const fields = parseEventBody(parsed.data)
  const { data, error } = await insertEvent(fields)
  if (error) return eventSchemaError(res, error.message)
  return res.status(201).json({ id: data.id })
})

adminPanelRouter.patch('/events/:id', async (req, res) => {
  const parsed = eventFieldsBase.partial().safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid event', fields: parsed.error.flatten() })
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'No fields provided.' })
  const fields: Record<string, unknown> = parseEventBody({ title: '', startsAt: '1970-01-01', ...parsed.data } as z.infer<typeof eventFields>)
  if (parsed.data.title === undefined) delete fields.title
  if (parsed.data.startsAt === undefined) delete fields.starts_at
  if (parsed.data.endsAt === undefined) delete fields.ends_at
  if (parsed.data.timeTba === undefined) delete fields.time_tba
  if (parsed.data.description === undefined) delete fields.description
  if (parsed.data.location === undefined) delete fields.location
  if (parsed.data.url === undefined) delete fields.url
  if (parsed.data.hostLabel === undefined) delete fields.host_label
  if (parsed.data.imageUrl === undefined) delete fields.image_url
  if (parsed.data.eventType === undefined) delete fields.event_type
  if (parsed.data.capacity === undefined) delete fields.capacity
  if (parsed.data.priceEur === undefined) delete fields.price_eur
  if (parsed.data.interests === undefined) delete fields.interests
  const { error } = await updateEvent(req.params.id, fields)
  if (error) return eventSchemaError(res, error.message)
  return res.json({ ok: true })
})

adminPanelRouter.patch('/events/:id/archive', async (req, res) => {
  const archived = req.body?.archived !== false
  const result = await supabase
    .from('events')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle()
  if (result.error) return eventSchemaError(res, result.error.message)
  if (!result.data) return res.status(404).json({ error: 'Event not found.' })
  return res.json({ ok: true })
})

adminPanelRouter.delete('/events/:id', async (req, res) => {
  const { error } = await supabase.from('events').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// Bulk imports are intentionally row-isolated: one failed insert never rolls back or corrupts a valid row.
// The browser previews validation first; this endpoint revalidates every row under the existing panel secret.
adminPanelRouter.post('/events/import', async (req, res) => {
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : []
  const updateExisting = req.body?.mode === 'update'
  if (!rows.length || rows.length > 500) return res.status(422).json({ error: 'Import must contain 1–500 rows.' })
  const includesTimeTba = rows.some(item => item?.data?.timeTba === true)
  const timeTba: TimeTbaAvailability = includesTimeTba ? await timeTbaAvailability() : { available: true }
  if (timeTba.available === null) return res.status(500).json({ error: timeTba.error })
  const results: Array<{ row: number; status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }> = []
  const timeTbaUnavailableRows: number[] = []
  const seen = new Set<string>()
  for (const item of rows) {
    const row = Number(item?.row) || 0
    const parsed = eventFields.safeParse(item?.data)
    if (!parsed.success) { results.push({ row, status: 'error', error: parsed.error.issues.map(i => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') }); continue }
    if (timeTba.available === false && parsed.data.timeTba) {
      timeTbaUnavailableRows.push(row)
      results.push({ row, status: 'skipped', error: 'Time TBA is unavailable in this database.' })
      continue
    }
    const fields = parseEventBody(parsed.data)
    const key = `${fields.title.toLowerCase()}|${fields.starts_at.slice(0, 10)}|${(fields.location ?? '').toLowerCase()}`
    if (seen.has(key)) { results.push({ row, status: 'skipped', error: 'Duplicate row in this import.' }); continue }
    seen.add(key)
    const candidates = await supabase.from('events').select('id, starts_at, location').ilike('title', fields.title)
    if (candidates.error) { results.push({ row, status: 'error', error: candidates.error.message }); continue }
    const existing = (candidates.data ?? []).find(event =>
      event.starts_at.slice(0, 10) === fields.starts_at.slice(0, 10) &&
      (event.location ?? '').trim().toLowerCase() === (fields.location ?? '').trim().toLowerCase(),
    )
    if (existing && !updateExisting) { results.push({ row, status: 'skipped', error: 'Likely duplicate exists; choose update mode to update it.' }); continue }
    const write = existing ? await updateEvent(existing.id, fields) : await insertEvent(fields)
    if (write.error) {
      const error = isMissingTimeTba(write.error.message) && fields.time_tba
        ? 'Time TBA requires event migration 057. Apply it before importing Time-TBA events.'
        : write.error.message
      results.push({ row, status: 'error', error })
    }
    else results.push({ row, status: existing ? 'updated' : 'created' })
  }
  return res.json({ results, timeTbaUnavailableRows })
})

adminPanelRouter.post('/cafes/import', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  const updateExisting = req.body?.mode === 'update'
  if (!rows.length || rows.length > 500) return res.status(422).json({ error: 'Import must contain 1–500 rows.' })
  const results: Array<{ row: number; status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }> = []
  const coordinateUnavailableRows: number[] = []
  const seen = new Set<string>()
  let geocoderAvailable = true
  for (const item of rows) {
    const row = Number(item?.row) || 0
    const parsed = placeSchema.safeParse(item?.data)
    if (!parsed.success) { results.push({ row, status: 'error', error: parsed.error.issues.map(i => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') }); continue }
    let fields = placePatch(parsed.data)
    if (geocoderAvailable) {
      try { fields = { ...fields, ...await geocodeCafe(parsed.data.address, parsed.data.city) } }
      catch (error) {
        coordinateUnavailableRows.push(row)
        fields = { ...fields, lat: null, lng: null }
        if (error instanceof Error && error.message.includes('temporarily unavailable')) geocoderAvailable = false
      }
    } else {
      coordinateUnavailableRows.push(row)
      fields = { ...fields, lat: null, lng: null }
    }
    const key = `${String(fields.name).toLowerCase()}|${String(fields.address ?? '').toLowerCase()}|${String(fields.area ?? '').toLowerCase()}`
    if (seen.has(key)) { results.push({ row, status: 'skipped', error: 'Duplicate row in this import.' }); continue }
    seen.add(key)
    const byName = await supabase.from('cafes').select('id, slug, name, address, area').ilike('name', String(fields.name))
    if (byName.error) { results.push({ row, status: 'error', error: byName.error.message }); continue }
    const existing = (byName.data ?? []).find(cafe => (
      cafe!.name.trim().toLowerCase() === String(fields.name).trim().toLowerCase() &&
      (cafe!.address ?? '').trim().toLowerCase() === String(fields.address ?? '').trim().toLowerCase() &&
      (cafe!.area ?? '').trim().toLowerCase() === String(fields.area ?? '').trim().toLowerCase()
    ))
    if (existing && !updateExisting) { results.push({ row, status: 'skipped', error: 'Likely duplicate exists; choose update mode to update it.' }); continue }
    if (!existing) {
      try { fields.slug = await uniqueCafeSlug(parsed.data.name) }
      catch (error) { results.push({ row, status: 'error', error: error instanceof Error ? error.message : 'Could not create an identifier.' }); continue }
    }
    const write = existing
      ? await supabase.from('cafes').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : await supabase.from('cafes').insert(fields)
    if (write.error) results.push({ row, status: 'error', error: write.error.message })
    else results.push({ row, status: existing ? 'updated' : 'created' })
  }
  return res.json({ results, coordinateUnavailableRows })
})

// ── Gigs ──────────────────────────────────────────────────────────────────────
adminPanelRouter.get('/gigs', async (_req, res) => {
  const { data, error } = await supabase
    .from('gigs')
    .select('id, gig_type, title, description, reward_type, price_eur, status, is_featured, created_at, users:provider_id(full_name, credibility_score)')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const gigs = (data ?? []).map((g: any) => {
    const p = Array.isArray(g.users) ? g.users[0] : g.users
    return { ...g, users: undefined, provider_name: p?.full_name ?? 'Someone', provider_credibility: p?.credibility_score ?? 0 }
  })

  // Attach active-request counts so admins see traction at a glance
  const gigIds = gigs.map((g: any) => g.id)
  if (gigIds.length) {
    const reqs = await supabase.from('gig_requests').select('gig_id, status').in('gig_id', gigIds)
    const counts = new Map<string, { active: number; total: number }>()
    for (const r of reqs.data ?? []) {
      const c = counts.get(r.gig_id) ?? { active: 0, total: 0 }
      c.total += 1
      if (['pending', 'accepted'].includes(r.status)) c.active += 1
      counts.set(r.gig_id, c)
    }
    for (const g of gigs as any[]) {
      const c = counts.get(g.id)
      g.active_request_count = c?.active ?? 0
      g.total_request_count = c?.total ?? 0
    }
  }

  return res.json({ gigs })
})

adminPanelRouter.patch('/gigs/:id', async (req, res) => {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (req.body.status !== undefined) {
    if (!['open', 'closed'].includes(req.body.status)) return res.status(422).json({ error: 'Invalid status.' })
    patch.status = req.body.status
  }
  if (req.body.isFeatured !== undefined) patch.is_featured = Boolean(req.body.isFeatured)
  if (req.body.title !== undefined) patch.title = String(req.body.title).trim()
  if (req.body.description !== undefined) patch.description = req.body.description ? String(req.body.description).trim() : null
  if (Object.keys(patch).length === 1) return res.status(400).json({ error: 'No fields provided.' })

  const { error } = await supabase.from('gigs').update(patch).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

adminPanelRouter.delete('/gigs/:id', async (req, res) => {
  const { error } = await supabase.from('gigs').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// All gig requests across the platform — moderation oversight of the pipeline
adminPanelRouter.get('/gig-requests', async (req, res) => {
  const status = req.query.status as string | undefined
  let query = supabase
    .from('gig_requests')
    .select('id, gig_id, status, message, price_eur, created_at, gigs:gig_id(title), seeker:seeker_id(full_name), provider:provider_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && ['pending', 'accepted', 'declined', 'completed', 'cancelled'].includes(status)) {
    query = query.eq('status', status)
  }
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  const requests = (data ?? []).map((r: any) => {
    const gig = Array.isArray(r.gigs) ? r.gigs[0] : r.gigs
    const seeker = Array.isArray(r.seeker) ? r.seeker[0] : r.seeker
    const provider = Array.isArray(r.provider) ? r.provider[0] : r.provider
    return {
      id: r.id,
      gig_id: r.gig_id,
      status: r.status,
      message: r.message,
      price_eur: r.price_eur,
      created_at: r.created_at,
      gig_title: gig?.title ?? 'Gig',
      seeker_name: seeker?.full_name ?? 'Someone',
      provider_name: provider?.full_name ?? 'Someone',
    }
  })
  return res.json({ requests })
})

// ── Quests ────────────────────────────────────────────────────────────────────
adminPanelRouter.get('/quests', async (_req, res) => {
  const { data, error } = await supabase.from('quests').select('*').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ quests: data ?? [] })
})

function parseQuestBody(b: any) {
  const patch: Record<string, unknown> = {}
  if (b.title !== undefined)              patch.title               = String(b.title).trim()
  if (b.description !== undefined)        patch.description         = b.description ? String(b.description).trim() : null
  if (b.points !== undefined)             patch.points              = Number(b.points) || 10
  if (b.category !== undefined)           patch.category            = b.category
  if (b.icon !== undefined)               patch.icon                = b.icon
  if (b.active !== undefined)             patch.active              = !!b.active
  if (b.startsAt !== undefined)           patch.starts_at           = b.startsAt ? new Date(b.startsAt).toISOString() : null
  if (b.endsAt !== undefined)             patch.ends_at             = b.endsAt ? new Date(b.endsAt).toISOString() : null
  if (b.howTo !== undefined)              patch.how_to              = b.howTo ? String(b.howTo).trim() : null
  if (b.whereToGo !== undefined)          patch.where_to_go         = b.whereToGo ? String(b.whereToGo).trim() : null
  if (b.difficulty !== undefined)         patch.difficulty          = b.difficulty || null
  if (b.estimatedMinutes !== undefined)   patch.estimated_minutes   = b.estimatedMinutes != null ? Number(b.estimatedMinutes) : null
  if (b.partnerRequired !== undefined)    patch.partner_required    = !!b.partnerRequired
  if (b.type !== undefined)               patch.type                = b.type || 'self'
  return patch
}

adminPanelRouter.post('/quests', async (req, res) => {
  const b = req.body
  if (!b.title) return res.status(422).json({ error: 'Title is required.' })
  const key =
    String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) +
    '_' + Math.random().toString(36).slice(2, 6)
  const fields = parseQuestBody({ active: true, ...b })
  const { data, error } = await supabase.from('quests').insert({ key, ...fields }).select('id').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ id: data.id })
})

adminPanelRouter.patch('/quests/:id', async (req, res) => {
  const patch = parseQuestBody(req.body)
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields provided.' })
  const { error } = await supabase.from('quests').update(patch).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

adminPanelRouter.delete('/quests/:id', async (req, res) => {
  const { error } = await supabase.from('quests').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// ── Stats ─────────────────────────────────────────────────────────────────────
adminPanelRouter.get('/stats', async (_req, res) => {
  const [total, pending, approved, rejected] = await Promise.all([
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }),
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
  ])
  return res.json({
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
  })
})

// ── Company dashboard ─────────────────────────────────────────────────────────
const DASHBOARD_PAGE_SIZE = 1000

function dashboardTimeZone() {
  const candidate = process.env.ADMIN_REPORT_TIME_ZONE || 'Europe/Berlin'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return 'Europe/Berlin'
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') }
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const parts = zonedParts(new Date(guess), timeZone)
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    guess += target - represented
  }
  return new Date(guess)
}

function reportDayStart(now: Date, timeZone: string, offsetDays = 0) {
  const current = zonedParts(now, timeZone)
  const shifted = new Date(Date.UTC(current.year, current.month - 1, current.day + offsetDays))
  return zonedMidnightUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), timeZone)
}

function dayKeyInZone(value: string | Date, timeZone: string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = zonedParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function bucketByReportDay(rows: { at: string }[], days: number, now: Date, timeZone: string) {
  const buckets = new Map<string, number>()
  for (let offset = -(days - 1); offset <= 0; offset++) {
    buckets.set(dayKeyInZone(reportDayStart(now, timeZone, offset), timeZone), 0)
  }
  for (const row of rows) {
    const key = dayKeyInZone(row.at, timeZone)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }))
}

function bucketMetricByReportDay(rows: { at: string; value: number }[], days: number, now: Date, timeZone: string) {
  const buckets = new Map<string, number>()
  for (let offset = -(days - 1); offset <= 0; offset++) {
    buckets.set(dayKeyInZone(reportDayStart(now, timeZone, offset), timeZone), 0)
  }
  for (const row of rows) {
    const key = dayKeyInZone(row.at, timeZone)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + row.value)
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }))
}

async function fetchAllDashboardRows<T>(label: string, query: () => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += DASHBOARD_PAGE_SIZE) {
    const result = await query().range(from, from + DASHBOARD_PAGE_SIZE - 1)
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
    const page = (result.data ?? []) as T[]
    rows.push(...page)
    if (page.length < DASHBOARD_PAGE_SIZE) return rows
  }
}

async function dashboardCount(label: string, table: string, build?: (query: any) => any) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true })
  if (build) query = build(query)
  const result = await query
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.count ?? 0
}

function dashboardOnboardingComplete(user: any) {
  return Boolean(
    user.persona &&
    Array.isArray(user.interests) && user.interests.length >= 3 &&
    Array.isArray(user.goals) && user.goals.length >= 1
  )
}

function dashboardBreakdown(rows: any[], read: (row: any) => string | null | undefined, limit = 5) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = String(read(row) || 'Not set').trim() || 'Not set'
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (ordered.length <= limit) return ordered.map(([label, count]) => ({ label, count }))
  const visible: [string, number][] = ordered.slice(0, limit - 1)
  visible.push(['Other', ordered.slice(limit - 1).reduce((sum, [, count]) => sum + count, 0)])
  return visible.map(([label, count]) => ({ label, count }))
}

const KPI_RANGES = [7, 14, 30, 90] as const

adminPanelRouter.get('/kpis', async (req, res) => {
  const now = new Date()
  const timeZone = dashboardTimeZone()
  const rangeDays = (KPI_RANGES as readonly number[]).includes(Number(req.query.range)) ? Number(req.query.range) : 14
  const todayStart = reportDayStart(now, timeZone)
  const yesterdayStart = reportDayStart(now, timeZone, -1)
  const yesterdayComparisonEnd = new Date(yesterdayStart.getTime() + (now.getTime() - todayStart.getTime()))
  const rangeStart = reportDayStart(now, timeZone, -(rangeDays - 1))
  const d7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const d14 = new Date(now.getTime() - 14 * 24 * 3600 * 1000)
  const d30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  const inWindow = (value: string | null | undefined, start: Date, end: Date) => {
    if (!value) return false
    const timestamp = new Date(value).getTime()
    return timestamp >= start.getTime() && timestamp < end.getTime()
  }
  const countWindow = (rows: any[], column: string, start: Date, end: Date) => rows.filter(row => inWindow(row[column], start, end)).length

  try {
    const productSchema = await getProductSchemaCapabilitiesSafe('admin-panel/kpis')
    const [
      users, betaRecent, messagesRecent, connectionsCreated, connectionsAcceptedRecent,
      conversationsRecent, rsvpsRecent, questsRecent, checkinsRecent, gigRequestsRecent,
      feedbackRecent, invitesRecent, eventsRecent, activitySessions, activityHourlySummary,
      betaTotal, betaPending, betaApproved, betaRejected,
      workFeedback, workBugs, workGigs, workRoles,
      totalMessages, totalConnectionsAccepted, totalConversations,
      upcomingEvents, openGigs, activeCafes, activeQuests,
    ] = await Promise.all([
      fetchAllDashboardRows<any>('users', () => supabase.from('users').select('id, full_name, username, avatar_url, persona, interests, goals, headline, location_city, university, current_company, is_international, invited_by, is_premium, is_hr, last_seen_at, created_at').order('created_at', { ascending: false })),
      fetchAllDashboardRows<any>('beta signups trend', () => supabase.from('beta_signups').select('created_at').gte('created_at', rangeStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('messages activity', () => supabase.from('messages').select('sender_id, created_at').gte('created_at', rangeStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('connection requests activity', () => supabase.from('connections').select('requester_id, addressee_id, created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('accepted connections activity', () => supabase.from('connections').select('requester_id, addressee_id, updated_at').eq('status', 'accepted').gte('updated_at', yesterdayStart.toISOString()).order('updated_at')),
      fetchAllDashboardRows<any>('conversations activity', () => supabase.from('conversations').select('created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('event RSVP activity', () => supabase.from('event_rsvps').select('user_id, created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('quest activity', () => supabase.from('user_quests').select('user_id, completed_at').gte('completed_at', yesterdayStart.toISOString()).order('completed_at')),
      fetchAllDashboardRows<any>('cafe check-in activity', () => supabase.from('cafe_checkins').select('user_id, created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('gig request activity', () => supabase.from('gig_requests').select('seeker_id, provider_id, created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('feedback activity', () => supabase.from('feedback').select('user_id, created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('invite activity', () => supabase.from('invites').select('inviter_id, invitee_id, created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      fetchAllDashboardRows<any>('event creation activity', () => supabase.from('events').select('host_id, created_at').gte('created_at', yesterdayStart.toISOString()).order('created_at')),
      productSchema.activitySessions
        ? fetchAllDashboardRows<any>('app activity sessions', () => supabase.from('user_activity_sessions').select('user_id, started_at, last_seen_at, active_seconds, is_active, page_views, last_path, device_type').gte('last_seen_at', rangeStart.toISOString()).order('last_seen_at'))
        : Promise.resolve([]),
      productSchema.activityHourly
        ? supabase.rpc('get_admin_activity_analytics', {
            p_previous_start: yesterdayStart.toISOString(),
            p_previous_end: yesterdayComparisonEnd.toISOString(),
            p_current_start: todayStart.toISOString(),
            p_end: now.toISOString(),
            p_resolution: 'hour',
            p_timezone: timeZone,
          }).then(result => {
            if (result.error) throw new Error(`today activity aggregation: ${result.error.message}`)
            return result.data
          })
        : Promise.resolve(null),
      dashboardCount('beta signups total', 'beta_signups'),
      dashboardCount('beta signups pending', 'beta_signups', query => query.eq('status', 'pending')),
      dashboardCount('beta signups approved', 'beta_signups', query => query.eq('status', 'approved')),
      dashboardCount('beta signups rejected', 'beta_signups', query => query.eq('status', 'rejected')),
      dashboardCount('open feedback', 'feedback', query => query.eq('status', 'open')),
      dashboardCount('open bugs', 'feedback', query => query.eq('status', 'open').eq('type', 'bug')),
      dashboardCount('pending gig requests', 'gig_requests', query => query.eq('status', 'pending')),
      dashboardCount('pending role requests', 'role_requests', query => query.eq('status', 'pending')),
      dashboardCount('messages total', 'messages'),
      dashboardCount('accepted connections total', 'connections', query => query.eq('status', 'accepted')),
      dashboardCount('conversations total', 'conversations'),
      dashboardCount('upcoming events', 'events', query => query.gte('starts_at', now.toISOString())),
      dashboardCount('open gigs', 'gigs', query => query.eq('status', 'open')),
      dashboardCount('active cafes', 'cafes', query => query.eq('is_active', true)),
      dashboardCount('published quests', 'quests', query => query.eq('active', true)),
    ])

    const createdToday = users.filter(user => inWindow(user.created_at, todayStart, now))
    const createdYesterday = users.filter(user => inWindow(user.created_at, yesterdayStart, yesterdayComparisonEnd))
    const activeToday = users.filter(user => inWindow(user.last_seen_at, todayStart, now))
    const active7d = users.filter(user => user.last_seen_at && new Date(user.last_seen_at) >= d7)
    const new7d = users.filter(user => new Date(user.created_at) >= d7).length
    const previous7d = users.filter(user => new Date(user.created_at) >= d14 && new Date(user.created_at) < d7).length
    const onboardingComplete = users.filter(dashboardOnboardingComplete).length
    const completionTotal = users.reduce((sum, user) => sum + accountProfileCompletion(user), 0)
    const sessionsToday = activitySessions.filter(session => inWindow(session.started_at, todayStart, now))
    const sessionsYesterday = activitySessions.filter(session => inWindow(session.started_at, yesterdayStart, yesterdayComparisonEnd))
    const hourlyToday = activityHourlySummary?.current ? normalizedActivityTotals(activityHourlySummary.current) : null
    const hourlyYesterday = activityHourlySummary?.previous ? normalizedActivityTotals(activityHourlySummary.previous) : null
    const onlineCutoff = now.getTime() - ONLINE_WINDOW_MS
    const onlineUserIds = new Set(activitySessions.filter(session => session.is_active && new Date(session.last_seen_at).getTime() >= onlineCutoff).map(session => session.user_id))
    const sessionSecondsToday = hourlyToday ? hourlyToday.activeMinutes * 60 : sessionsToday.reduce((sum, session) => sum + (session.active_seconds ?? 0), 0)
    const sessionSecondsYesterday = hourlyYesterday ? hourlyYesterday.activeMinutes * 60 : sessionsYesterday.reduce((sum, session) => sum + (session.active_seconds ?? 0), 0)
    const activeSessionsToday = hourlyToday?.sessions ?? sessionsToday.length
    const activeSessionsYesterday = hourlyYesterday?.sessions ?? sessionsYesterday.length
    const usageByUser = new Map<string, { seconds: number; sessions: number; lastSeenAt: string }>()
    for (const session of activitySessions) {
      const usage = usageByUser.get(session.user_id) ?? { seconds: 0, sessions: 0, lastSeenAt: session.last_seen_at }
      usage.seconds += session.active_seconds ?? 0
      usage.sessions += 1
      if (session.last_seen_at > usage.lastSeenAt) usage.lastSeenAt = session.last_seen_at
      usageByUser.set(session.user_id, usage)
    }
    const usersById = new Map(users.map(user => [user.id, user]))
    const topUsers = [...usageByUser.entries()]
      .sort((a, b) => b[1].seconds - a[1].seconds || b[1].sessions - a[1].sessions)
      .slice(0, 8)
      .map(([id, usage]) => ({
        id,
        fullName: usersById.get(id)?.full_name ?? 'Unknown member',
        username: usersById.get(id)?.username ?? null,
        minutes: Math.round(usage.seconds / 60),
        sessions: usage.sessions,
        lastSeenAt: usage.lastSeenAt,
        online: onlineUserIds.has(id),
      }))

    const today = {
      messages: countWindow(messagesRecent, 'created_at', todayStart, now),
      connectionsRequested: countWindow(connectionsCreated, 'created_at', todayStart, now),
      connectionsAccepted: countWindow(connectionsAcceptedRecent, 'updated_at', todayStart, now),
      conversations: countWindow(conversationsRecent, 'created_at', todayStart, now),
      eventRsvps: countWindow(rsvpsRecent, 'created_at', todayStart, now),
      questCompletions: countWindow(questsRecent, 'completed_at', todayStart, now),
      cafeCheckins: countWindow(checkinsRecent, 'created_at', todayStart, now),
      gigRequests: countWindow(gigRequestsRecent, 'created_at', todayStart, now),
      feedback: countWindow(feedbackRecent, 'created_at', todayStart, now),
      invites: countWindow(invitesRecent, 'created_at', todayStart, now),
      eventsCreated: countWindow(eventsRecent, 'created_at', todayStart, now),
      uniqueContributors: 0,
    }
    const yesterday = {
      messages: countWindow(messagesRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      connectionsRequested: countWindow(connectionsCreated, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      connectionsAccepted: countWindow(connectionsAcceptedRecent, 'updated_at', yesterdayStart, yesterdayComparisonEnd),
      conversations: countWindow(conversationsRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      eventRsvps: countWindow(rsvpsRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      questCompletions: countWindow(questsRecent, 'completed_at', yesterdayStart, yesterdayComparisonEnd),
      cafeCheckins: countWindow(checkinsRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      gigRequests: countWindow(gigRequestsRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      feedback: countWindow(feedbackRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      invites: countWindow(invitesRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      eventsCreated: countWindow(eventsRecent, 'created_at', yesterdayStart, yesterdayComparisonEnd),
      uniqueContributors: 0,
    }

    const contributorIds = new Set<string>()
    const addToday = (rows: any[], timestamp: string, ids: string[]) => {
      for (const row of rows) if (inWindow(row[timestamp], todayStart, now)) {
        for (const id of ids) if (row[id]) contributorIds.add(row[id])
      }
    }
    addToday(messagesRecent, 'created_at', ['sender_id'])
    addToday(connectionsCreated, 'created_at', ['requester_id', 'addressee_id'])
    addToday(connectionsAcceptedRecent, 'updated_at', ['requester_id', 'addressee_id'])
    addToday(rsvpsRecent, 'created_at', ['user_id'])
    addToday(questsRecent, 'completed_at', ['user_id'])
    addToday(checkinsRecent, 'created_at', ['user_id'])
    addToday(gigRequestsRecent, 'created_at', ['seeker_id', 'provider_id'])
    addToday(feedbackRecent, 'created_at', ['user_id'])
    addToday(invitesRecent, 'created_at', ['inviter_id', 'invitee_id'])
    addToday(eventsRecent, 'created_at', ['host_id'])
    today.uniqueContributors = contributorIds.size

    return res.json({
      generatedAt: now.toISOString(),
      context: {
        timeZone,
        todayStartedAt: todayStart.toISOString(),
        comparisonEndsAt: yesterdayComparisonEnd.toISOString(),
        comparisonLabel: 'same time yesterday',
      },
      users: {
        total: users.length,
        newToday: createdToday.length,
        newYesterday: createdYesterday.length,
        new7d,
        previous7d,
        activeToday: activeToday.length,
        active7d: active7d.length,
        returningToday: activeToday.filter(user => new Date(user.created_at) < todayStart).length,
        newActiveToday: activeToday.filter(user => new Date(user.created_at) >= todayStart).length,
        dormant30d: users.filter(user => !user.last_seen_at || new Date(user.last_seen_at) < d30).length,
        onboardingComplete,
        onboardingRate: users.length ? Math.round(onboardingComplete / users.length * 100) : 0,
        averageProfileCompletion: users.length ? Math.round(completionTotal / users.length) : 0,
        invited: users.filter(user => user.invited_by).length,
        organic: users.filter(user => !user.invited_by).length,
        premium: users.filter(user => user.is_premium).length,
        hr: users.filter(user => user.is_hr).length,
        international: users.filter(user => user.is_international).length,
        personas: dashboardBreakdown(users, user => user.persona),
        locations: dashboardBreakdown(users, user => user.location_city),
      },
      latestUsers: users.slice(0, 8).map(user => ({
        id: user.id,
        fullName: user.full_name,
        username: user.username,
        avatarUrl: user.avatar_url,
        persona: user.persona,
        locationCity: user.location_city,
        createdAt: user.created_at,
        lastSeenAt: user.last_seen_at,
        source: user.invited_by ? 'Invite' : 'Organic',
        profileCompletion: accountProfileCompletion(user),
        onboardingComplete: dashboardOnboardingComplete(user),
      })),
      growth: {
        rangeDays,
        usersPerDay: bucketByReportDay(users.map(user => ({ at: user.created_at })), rangeDays, now, timeZone),
        signupsPerDay: bucketByReportDay(betaRecent.map(row => ({ at: row.created_at })), rangeDays, now, timeZone),
        messagesPerDay: bucketByReportDay(messagesRecent.map(row => ({ at: row.created_at })), rangeDays, now, timeZone),
      },
      engagement: {
        available: productSchema.activitySessions,
        onlineNow: onlineUserIds.size,
        opensToday: sessionsToday.length,
        opensYesterday: sessionsYesterday.length,
        uniqueUsersToday: hourlyToday?.activeUsers ?? new Set(sessionsToday.map(session => session.user_id)).size,
        uniqueUsersYesterday: hourlyYesterday?.activeUsers ?? new Set(sessionsYesterday.map(session => session.user_id)).size,
        totalMinutesToday: Math.round(sessionSecondsToday / 60),
        totalMinutesYesterday: Math.round(sessionSecondsYesterday / 60),
        averageSessionMinutesToday: activeSessionsToday ? Math.round(sessionSecondsToday / activeSessionsToday / 6) / 10 : 0,
        averageSessionMinutesYesterday: activeSessionsYesterday ? Math.round(sessionSecondsYesterday / activeSessionsYesterday / 6) / 10 : 0,
        sessionsPerDay: bucketByReportDay(activitySessions.map(session => ({ at: session.started_at })), rangeDays, now, timeZone),
        minutesPerDay: bucketMetricByReportDay(activitySessions.map(session => ({ at: session.started_at, value: Math.round((session.active_seconds ?? 0) / 60) })), rangeDays, now, timeZone),
        topUsers,
      },
      today,
      yesterday,
      betaFunnel: { total: betaTotal, pending: betaPending, approved: betaApproved, rejected: betaRejected },
      workQueue: {
        total: betaPending + workFeedback + workGigs + workRoles,
        betaPending,
        feedbackOpen: workFeedback,
        bugsOpen: workBugs,
        gigRequestsPending: workGigs,
        roleRequestsPending: workRoles,
      },
      platform: {
        messagesTotal: totalMessages,
        connectionsAccepted: totalConnectionsAccepted,
        conversationsTotal: totalConversations,
        upcomingEvents,
        openGigs,
        activeCafes,
        publishedQuests: activeQuests,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown dashboard query error'
    console.error(`[admin-panel/kpis] ${message}`)
    return res.status(500).json({ error: `Dashboard data could not be loaded. ${message}` })
  }
})

// ── App settings (beta toggle etc.) ──────────────────────────────────────────
adminPanelRouter.get('/settings', async (_req, res) => {
  const { data, error } = await supabase.from('app_settings').select('key, value')
  if (error) return res.status(500).json({ error: error.message })
  const settings: Record<string, unknown> = {}
  for (const row of data ?? []) settings[row.key] = row.value
  return res.json({ settings })
})

adminPanelRouter.patch('/settings', async (req, res) => {
  let { key, value } = req.body
  const allowed = ['access_mode', 'team_invite_code', 'beta_open']
  if (typeof key !== 'string' || !allowed.includes(key)) {
    return res.status(422).json({ error: 'Unknown setting' })
  }
  if (key === 'access_mode' && value !== 'open' && value !== 'invite_only') {
    return res.status(422).json({ error: 'access_mode must be "open" or "invite_only"' })
  }
  if (key === 'team_invite_code') {
    value = String(value ?? '').trim().toUpperCase().slice(0, 24)
  }
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return res.status(500).json({ error: error.message })
  invalidateAccessCache()
  return res.json({ ok: true })
})

// ── Feedback admin ────────────────────────────────────────────────────────────
adminPanelRouter.get('/feedback', async (req, res) => {
  const status = req.query.status as string | undefined
  let query = supabase
    .from('feedback')
    .select('id, type, message, page, user_agent, status, created_at, resolved_at, user_id')
    .order('created_at', { ascending: false })
  if (status && ['open', 'resolved'].includes(status)) query = query.eq('status', status)

  const { data: rows, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))]
  const usersRes = userIds.length
    ? await supabase.from('users').select('id, full_name, username, email').in('id', userIds)
    : { data: [] as any[] }
  const byId = new Map((usersRes.data ?? []).map((u: any) => [u.id, u]))

  const feedback = (rows ?? []).map((r: any) => ({
    ...r,
    user: r.user_id ? (byId.get(r.user_id) ?? null) : null,
  }))

  const openCount = (rows ?? []).filter((r: any) => r.status === 'open').length
  return res.json({ feedback, openCount })
})

adminPanelRouter.patch('/feedback/:id', async (req, res) => {
  const { status } = req.body
  if (!['open', 'resolved'].includes(status)) return res.status(422).json({ error: 'Invalid status.' })
  const { data, error } = await supabase
    .from('feedback')
    .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Feedback not found.' })
  return res.json({ ok: true })
})

// ── Invites admin ─────────────────────────────────────────────────────────────
adminPanelRouter.get('/invites', async (_req, res) => {
  // All invite rows joined with both users
  const { data: rows, error } = await supabase
    .from('invites')
    .select('id, created_at, code, inviter_id, invitee_id')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const allIds = new Set<string>()
  for (const r of rows ?? []) { allIds.add(r.inviter_id); allIds.add(r.invitee_id) }

  const usersRes = allIds.size
    ? await supabase.from('users').select('id, full_name, username, email, persona, interests, goals, created_at').in('id', [...allIds])
    : { data: [], error: null }
  if (usersRes.error) return res.status(500).json({ error: usersRes.error.message })

  const byId = new Map((usersRes.data ?? []).map((u: any) => [u.id, u]))

  function isOnboarded(u: any) {
    if (!u) return false
    const interests = Array.isArray(u.interests) ? u.interests : []
    const goals = Array.isArray(u.goals) ? u.goals : []
    return !!u.persona && interests.length >= 3 && goals.length >= 1
  }

  const invites = (rows ?? []).map((r: any) => {
    const inviter = byId.get(r.inviter_id)
    const invitee = byId.get(r.invitee_id)
    return {
      id: r.id,
      created_at: r.created_at,
      code: r.code,
      inviter: inviter ? { id: inviter.id, full_name: inviter.full_name, username: inviter.username, email: inviter.email } : null,
      invitee: invitee ? { id: invitee.id, full_name: invitee.full_name, username: invitee.username, email: invitee.email, onboarded: isOnboarded(invitee) } : null,
    }
  })

  // Leaderboard: inviters ranked by count
  const countMap = new Map<string, { inviter: any; total: number; onboarded: number }>()
  for (const inv of invites) {
    if (!inv.inviter) continue
    const entry = countMap.get(inv.inviter.id) ?? { inviter: inv.inviter, total: 0, onboarded: 0 }
    entry.total++
    if (inv.invitee?.onboarded) entry.onboarded++
    countMap.set(inv.inviter.id, entry)
  }
  const leaderboard = [...countMap.values()].sort((a, b) => b.total - a.total)

  return res.json({ invites, leaderboard })
})

// ── Café management ─────────────────────────────────────────────────────────
const cafeFields = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, { message: 'lowercase letters, digits, hyphens only' }),
  name: z.string().min(2).max(120),
  venueType: z.enum(['cafe', 'restaurant', 'bar']).default('cafe'),
  address: z.string().max(240).optional().nullable(),
  city: z.string().max(80).default('Munich'),
  area: z.string().max(120).optional().nullable(),
  description: z.string().max(1200).optional().nullable(),
  perkText: z.string().max(240).optional().nullable(),
  photoUrl: z.string().max(2048).optional().nullable(),
  hoursText: z.string().max(120).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  isPartnered: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dealTitle: z.string().max(160).optional().nullable(),
  dealDetails: z.string().max(1000).optional().nullable(),
  dealCode: z.string().max(120).optional().nullable(),
  dealCodeEnabled: z.boolean().optional(),
  featuredPriority: z.number().int().min(0).max(100000).optional(),
  isArchived: z.boolean().optional(),
})

const cafeSchema = cafeFields.superRefine((value, ctx) => {
  if (value.dealCodeEnabled && (!value.isPartnered || !value.dealCode?.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dealCodeEnabled'],
      message: 'Deal codes require a partnered listing and a non-empty code',
    })
  }
})

adminPanelRouter.get('/cafes', async (_req, res) => {
  const result = await supabase.from('cafes').select('*').order('created_at', { ascending: false })
  if (result.error) return res.status(500).json({ error: result.error.message })
  return res.json({ cafes: result.data ?? [] })
})

adminPanelRouter.post('/cafes', async (req, res) => {
  const parsed = cafeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const insert = await supabase
    .from('cafes')
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      venue_type: parsed.data.venueType,
      address: parsed.data.address ?? null,
      city: parsed.data.city,
      area: parsed.data.area ?? null,
      description: parsed.data.description ?? null,
      perk_text: parsed.data.perkText ?? null,
      photo_url: parsed.data.photoUrl ?? null,
      hours_text: parsed.data.hoursText ?? null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      is_partnered: parsed.data.isPartnered ?? false,
      is_active: parsed.data.isActive ?? true,
      deal_title: parsed.data.dealTitle ?? null,
      deal_details: parsed.data.dealDetails ?? null,
      deal_code: parsed.data.dealCode ?? null,
      deal_code_enabled: parsed.data.dealCodeEnabled ?? false,
      featured_priority: parsed.data.featuredPriority ?? 0,
      archived_at: parsed.data.isArchived ? new Date().toISOString() : null,
    })
    .select('*')
    .single()
  if (insert.error) return res.status(500).json({ error: insert.error.message })
  return res.status(201).json({ cafe: insert.data })
})

adminPanelRouter.patch('/cafes/:id', async (req, res) => {
  const parsed = cafeFields.partial().safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const current = await supabase
    .from('cafes')
    .select('is_partnered, deal_code, deal_code_enabled')
    .eq('id', req.params.id)
    .maybeSingle()
  if (current.error) return res.status(500).json({ error: current.error.message })
  if (!current.data) return res.status(404).json({ error: 'Café not found' })

  const nextPartnered = parsed.data.isPartnered ?? current.data.is_partnered
  const nextDealCode = parsed.data.dealCode ?? current.data.deal_code
  const nextCodeEnabled = parsed.data.dealCodeEnabled ?? current.data.deal_code_enabled
  if (nextCodeEnabled && (!nextPartnered || !nextDealCode?.trim())) {
    return res.status(422).json({ error: 'Deal codes require a partnered listing and a non-empty code' })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.venueType !== undefined) patch.venue_type = parsed.data.venueType
  if (parsed.data.address !== undefined) patch.address = parsed.data.address
  if (parsed.data.city !== undefined) patch.city = parsed.data.city
  if (parsed.data.area !== undefined) patch.area = parsed.data.area
  if (parsed.data.description !== undefined) patch.description = parsed.data.description
  if (parsed.data.perkText !== undefined) patch.perk_text = parsed.data.perkText
  if (parsed.data.photoUrl !== undefined) patch.photo_url = parsed.data.photoUrl
  if (parsed.data.hoursText !== undefined) patch.hours_text = parsed.data.hoursText
  if (parsed.data.lat !== undefined) patch.lat = parsed.data.lat
  if (parsed.data.lng !== undefined) patch.lng = parsed.data.lng
  if (parsed.data.isPartnered !== undefined) patch.is_partnered = parsed.data.isPartnered
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive
  if (parsed.data.dealTitle !== undefined) patch.deal_title = parsed.data.dealTitle
  if (parsed.data.dealDetails !== undefined) patch.deal_details = parsed.data.dealDetails
  if (parsed.data.dealCode !== undefined) patch.deal_code = parsed.data.dealCode
  if (parsed.data.dealCodeEnabled !== undefined) patch.deal_code_enabled = parsed.data.dealCodeEnabled
  if (parsed.data.featuredPriority !== undefined) patch.featured_priority = parsed.data.featuredPriority
  if (parsed.data.isArchived !== undefined) patch.archived_at = parsed.data.isArchived ? new Date().toISOString() : null

  const upd = await supabase.from('cafes').update(patch).eq('id', req.params.id).select('*').maybeSingle()
  if (upd.error) return res.status(500).json({ error: upd.error.message })
  if (!upd.data) return res.status(404).json({ error: 'Café not found' })
  return res.json({ cafe: upd.data })
})

adminPanelRouter.delete('/cafes/:id', async (req, res) => {
  const archived = await supabase
    .from('cafes')
    .update({ is_active: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle()
  if (archived.error) return res.status(500).json({ error: archived.error.message })
  if (!archived.data) return res.status(404).json({ error: 'Café not found' })
  return res.json({ ok: true })
})

// ── Café suggestions (member-submitted, awaiting review) ────────────────────
adminPanelRouter.get('/pending-cafes', async (req, res) => {
  const status = req.query.status as string | undefined
  let query = supabase.from('pending_cafes').select('*').order('created_at', { ascending: false })
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }
  const result = await query
  if (result.error) return res.status(500).json({ error: result.error.message })

  const rows = result.data ?? []
  const suggesterIds = [...new Set(rows.map((r) => r.suggested_by).filter(Boolean))]
  const suggesters = suggesterIds.length
    ? await supabase.from('users').select('id, full_name, username').in('id', suggesterIds)
    : { data: [], error: null }
  if (suggesters.error) return res.status(500).json({ error: suggesters.error.message })

  const byId = new Map((suggesters.data ?? []).map((u) => [u.id, u]))
  return res.json({
    pending: rows.map((r) => ({ ...r, suggester: byId.get(r.suggested_by) ?? null })),
  })
})

const pendingCafeStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})

adminPanelRouter.patch('/pending-cafes/:id', async (req, res) => {
  const parsed = pendingCafeStatusSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const upd = await supabase
    .from('pending_cafes')
    .update({ status: parsed.data.status })
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  if (upd.error) return res.status(500).json({ error: upd.error.message })
  if (!upd.data) return res.status(404).json({ error: 'Suggestion not found or already reviewed' })

  // Approving drops the suggestion into the real cafés table as an inactive
  // draft — an admin still fills in venue type, hours, photo, etc. via the
  // café editor before it goes live, rather than auto-publishing raw member
  // input straight from a name + address.
  if (parsed.data.status === 'approved') {
    const slugBase = String(upd.data.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cafe'
    let slug = slugBase
    for (let attempt = 0; attempt < 20; attempt++) {
      const exists = await supabase.from('cafes').select('id').eq('slug', slug).maybeSingle()
      if (exists.error) return res.status(500).json({ error: exists.error.message })
      if (!exists.data) break
      slug = `${slugBase}-${attempt + 2}`
    }

    const insert = await supabase
      .from('cafes')
      .insert({
        slug,
        name: upd.data.name,
        address: upd.data.address,
        city: 'Munich',
        venue_type: 'cafe',
        description: upd.data.notes ?? null,
        is_active: false,
      })
      .select('id')
      .single()
    if (insert.error) return res.status(500).json({ error: insert.error.message })
    return res.json({ pending: upd.data, cafeId: insert.data.id })
  }

  return res.json({ pending: upd.data })
})
