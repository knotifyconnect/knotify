import { useEffect, type CSSProperties } from 'react'
import type { ActivityTrendSnapshot, MetricInsight } from './ActivityAnalyticsPanel'
import type { DashboardKpis, DashboardPoint } from './dashboardTypes'
import type { LiveUsersSnapshot } from './LiveUsersPanel'

const C = {
  signal: '#D8442B', ink: '#1a1410', inkMuted: '#6b5f55', inkFaint: '#a09287', paper: '#f5f0e8',
  paperSoft: '#ede8df', white: '#fff', rule: 'rgba(84,72,58,.14)', verd: '#2d7d46', blue: '#386a8a', ochre: '#b8820f',
}
const card: CSSProperties = { background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 14 }

type Stat = { label: string; value: string | number; detail?: string; tone?: string }
type Breakdown = { title: string; rows: { label: string; count: number; color?: string }[]; note?: string; showPercent?: boolean }
type Trend = { title: string; points: { label: string; value: number }[]; color: string; note?: string }
type Comparison = { currentLabel: string; current: number; previousLabel: string; previous: number }
type TableKind = 'recent-members' | 'engaged-members' | 'live-members'
type InsightModel = {
  title: string
  eyebrow: string
  description: string
  stats: Stat[]
  trend?: Trend
  comparison?: Comparison
  breakdowns?: Breakdown[]
  table?: TableKind
  tableTitle?: string
  watch: string
}

const number = (value: number) => value.toLocaleString('en-GB')
const percent = (value: number, total: number) => total ? Math.round(value / total * 100) : 0
const ratio = (value: number, total: number, suffix = '') => total ? `${(value / total).toFixed(1)}${suffix}` : `0${suffix}`
const points = (values: DashboardPoint[]) => values.map(point => ({ label: point.date.slice(5), value: point.count }))
const activityPoints = (activity: ActivityTrendSnapshot | null, key: 'activeUsers' | 'sessions' | 'activeMinutes' | 'pageViews') =>
  (activity?.points ?? []).map(point => ({ label: point.label, value: point[key] }))

const activityDefinitions = {
  'activity-messages': { key: 'messages', title: 'Messages sent', description: 'Member-to-member chat messages sent during the Berlin business day.', relation: 'conversation momentum' },
  'activity-connections-accepted': { key: 'connectionsAccepted', title: 'Connections made', description: 'Connection requests accepted today, turning introductions into established network relationships.', relation: 'network conversion' },
  'activity-connections-requested': { key: 'connectionsRequested', title: 'Connection requests', description: 'New requests sent between members today—the top of the relationship funnel.', relation: 'network demand' },
  'activity-event-rsvps': { key: 'eventRsvps', title: 'Event RSVPs', description: 'Members who committed to attend an event today.', relation: 'event participation' },
  'activity-quest-completions': { key: 'questCompletions', title: 'Quest completions', description: 'Verified member progress recorded against published quests today.', relation: 'guided engagement' },
  'activity-gig-requests': { key: 'gigRequests', title: 'Gig requests', description: 'Service requests sent to gig providers today.', relation: 'marketplace demand' },
  'activity-cafe-checkins': { key: 'cafeCheckins', title: 'Café check-ins', description: 'Member visits recorded at active Knotify cafés today.', relation: 'offline participation' },
  'activity-conversations': { key: 'conversations', title: 'New conversations', description: 'New direct conversation threads started today.', relation: 'new dialogue' },
} as const

const queueDefinitions = {
  'queue-beta': { title: 'Beta approvals', value: 'betaPending', description: 'Waitlist applications awaiting an approval decision.', watch: 'Review oldest applications first and compare the pending share with the approval rate.' },
  'queue-feedback': { title: 'Open feedback', value: 'feedbackOpen', description: 'Member feedback that has not yet been resolved.', watch: 'Prioritise bug-tagged items, then close the loop with members whose feedback has been addressed.' },
  'queue-gigs': { title: 'Pending gig requests', value: 'gigRequestsPending', description: 'Marketplace requests waiting for a provider response.', watch: 'A growing queue can signal provider supply or response-time problems.' },
  'queue-roles': { title: 'Role requests', value: 'roleRequestsPending', description: 'Requests for HR or company-level access awaiting review.', watch: 'Validate company affiliation before granting elevated access.' },
} as const

const platformDefinitions = {
  'platform-messages': { title: 'All-time messages', value: 'messagesTotal', description: 'Every member chat message recorded on the platform.', related: 'Conversations' },
  'platform-connections': { title: 'Established connections', value: 'connectionsAccepted', description: 'All accepted member relationships in the network.', related: 'Members' },
  'platform-conversations': { title: 'Conversation threads', value: 'conversationsTotal', description: 'All direct conversation threads created on Knotify.', related: 'Messages' },
  'platform-events': { title: 'Upcoming events', value: 'upcomingEvents', description: 'Events scheduled in the future and available to members.', related: 'RSVPs today' },
  'platform-gigs': { title: 'Open gigs', value: 'openGigs', description: 'Marketplace offers currently open to member requests.', related: 'Requests today' },
  'platform-cafes': { title: 'Active cafés', value: 'activeCafes', description: 'Approved café locations currently active in the network.', related: 'Check-ins today' },
  'platform-quests': { title: 'Published quests', value: 'publishedQuests', description: 'Quests currently published and available for members to complete.', related: 'Completions today' },
} as const

function activityModel(id: keyof typeof activityDefinitions, kpis: DashboardKpis): InsightModel {
  const definition = activityDefinitions[id]
  const current = kpis.today[definition.key]
  const previous = kpis.yesterday[definition.key]
  const base: InsightModel = {
    title: definition.title,
    eyebrow: 'Activity today',
    description: definition.description,
    comparison: { currentLabel: 'Today', current, previousLabel: kpis.context.comparisonLabel, previous },
    stats: [
      { label: 'Today', value: number(current), detail: definition.relation, tone: C.blue },
      { label: 'Prior day', value: number(previous), detail: kpis.context.comparisonLabel },
      { label: 'Contributors', value: number(kpis.today.uniqueContributors), detail: 'distinct active members' },
    ],
    watch: `Use the day-over-day movement and related supply metrics to judge whether ${definition.relation} is strengthening.`,
  }

  if (definition.key === 'messages') {
    base.trend = { title: `Message volume · ${kpis.growth.rangeDays} days`, points: points(kpis.growth.messagesPerDay), color: C.blue }
    base.stats.push({ label: 'All-time messages', value: number(kpis.platform.messagesTotal), detail: `${number(kpis.platform.conversationsTotal)} conversations` })
    base.stats.push({ label: 'Messages / new thread', value: ratio(current, kpis.today.conversations), detail: 'today' })
  } else if (definition.key === 'connectionsAccepted' || definition.key === 'connectionsRequested') {
    base.stats.push({ label: 'Acceptance ratio', value: `${percent(kpis.today.connectionsAccepted, kpis.today.connectionsRequested)}%`, detail: 'accepted ÷ requested today' })
    base.stats.push({ label: 'Network total', value: number(kpis.platform.connectionsAccepted), detail: 'established connections' })
  } else if (definition.key === 'eventRsvps') {
    base.stats.push({ label: 'Upcoming events', value: number(kpis.platform.upcomingEvents), detail: 'available event supply' })
    base.stats.push({ label: 'Events created', value: number(kpis.today.eventsCreated), detail: 'created today' })
  } else if (definition.key === 'questCompletions') {
    base.stats.push({ label: 'Published quests', value: number(kpis.platform.publishedQuests), detail: 'available now' })
    base.stats.push({ label: 'Completions / quest', value: ratio(current, kpis.platform.publishedQuests), detail: 'today' })
  } else if (definition.key === 'gigRequests') {
    base.stats.push({ label: 'Open gigs', value: number(kpis.platform.openGigs), detail: 'marketplace supply' })
    base.stats.push({ label: 'Awaiting response', value: number(kpis.workQueue.gigRequestsPending), detail: 'operator queue', tone: kpis.workQueue.gigRequestsPending ? C.signal : C.verd })
  } else if (definition.key === 'cafeCheckins') {
    base.stats.push({ label: 'Active cafés', value: number(kpis.platform.activeCafes), detail: 'venue supply' })
    base.stats.push({ label: 'Check-ins / café', value: ratio(current, kpis.platform.activeCafes), detail: 'today' })
  } else if (definition.key === 'conversations') {
    base.stats.push({ label: 'Messages today', value: number(kpis.today.messages), detail: `${ratio(kpis.today.messages, current)} per new thread` })
    base.stats.push({ label: 'All conversations', value: number(kpis.platform.conversationsTotal), detail: 'platform total' })
  }
  return base
}

function activitySummaryModel(id: string, kpis: DashboardKpis, activity: ActivityTrendSnapshot | null): InsightModel {
  const current = activity?.summary?.current
  const previous = activity?.summary?.previous
  const models = {
    'analytics-active-people': {
      key: 'activeUsers' as const, title: 'Active people', description: 'Distinct members with foreground product activity in the selected period.', color: C.verd,
      stats: [
        { label: 'Sessions / person', value: ratio(current?.sessions ?? 0, current?.activeUsers ?? 0), detail: 'visit frequency' },
        { label: 'Minutes / person', value: ratio(current?.activeMinutes ?? 0, current?.activeUsers ?? 0, 'm'), detail: 'depth of use' },
        { label: '7-day reach', value: `${percent(kpis.users.active7d, kpis.users.total)}%`, detail: 'of all members' },
      ],
      breakdowns: [{ title: 'Where active people show up', rows: activity?.sections ?? [] }, { title: 'Device mix', rows: activity?.devices ?? [] }],
      watch: 'Look for reach growing without minutes per person collapsing; that signals healthy expansion rather than shallow visits.',
    },
    'analytics-sessions': {
      key: 'sessions' as const, title: 'Sessions', description: 'Distinct application opens in the selected period.', color: C.blue,
      stats: [
        { label: 'Sessions / person', value: ratio(current?.sessions ?? 0, current?.activeUsers ?? 0), detail: 'return frequency' },
        { label: 'Minutes / session', value: ratio(current?.activeMinutes ?? 0, current?.sessions ?? 0, 'm'), detail: 'average depth' },
        { label: 'Views / session', value: ratio(current?.pageViews ?? 0, current?.sessions ?? 0), detail: 'navigation depth' },
      ],
      breakdowns: [{ title: 'Sessions by device', rows: activity?.devices ?? [] }],
      watch: 'Pair session growth with active people: faster session growth means existing members are returning more often.',
    },
    'analytics-active-minutes': {
      key: 'activeMinutes' as const, title: 'Active minutes', description: 'Credited foreground time in bounded heartbeat intervals; background time is excluded.', color: C.signal,
      stats: [
        { label: 'Minutes / person', value: ratio(current?.activeMinutes ?? 0, current?.activeUsers ?? 0, 'm'), detail: 'member depth' },
        { label: 'Minutes / session', value: ratio(current?.activeMinutes ?? 0, current?.sessions ?? 0, 'm'), detail: 'visit depth' },
        { label: 'Today', value: `${number(kpis.engagement.totalMinutesToday)}m`, detail: 'Berlin business day' },
      ],
      breakdowns: [{ title: 'Most-used sections', rows: activity?.sections ?? [] }],
      watch: 'Sustained minute growth is strongest when it comes from more people and more sessions—not one unusually long session.',
    },
    'analytics-page-views': {
      key: 'pageViews' as const, title: 'Page views', description: 'Tracked route views generated during foreground sessions in the selected period.', color: C.ochre,
      stats: [
        { label: 'Views / session', value: ratio(current?.pageViews ?? 0, current?.sessions ?? 0), detail: 'navigation depth' },
        { label: 'Views / person', value: ratio(current?.pageViews ?? 0, current?.activeUsers ?? 0), detail: 'content reach' },
        { label: 'Sessions', value: number(current?.sessions ?? 0), detail: 'selected period' },
      ],
      breakdowns: [{ title: 'Sections generating views', rows: activity?.sections ?? [] }, { title: 'Views by device context', rows: activity?.devices ?? [] }],
      watch: 'Use section mix to distinguish purposeful exploration from repeated navigation through the same area.',
    },
  }
  const model = models[id as keyof typeof models] ?? models['analytics-active-people']
  return {
    title: `${model.title} · ${activity?.period ?? 'period'}`,
    eyebrow: 'Product activity',
    description: model.description,
    stats: model.stats,
    trend: { title: `${model.title} trend`, points: activityPoints(activity, model.key), color: model.color, note: activity?.peak ? `Peak: ${activity.peak.label}` : undefined },
    comparison: { currentLabel: 'Selected period', current: current?.[model.key] ?? 0, previousLabel: 'Prior period', previous: previous?.[model.key] ?? 0 },
    breakdowns: model.breakdowns,
    watch: model.watch,
  }
}

function queueModel(id: keyof typeof queueDefinitions, kpis: DashboardKpis): InsightModel {
  const definition = queueDefinitions[id]
  const value = kpis.workQueue[definition.value]
  return {
    title: definition.title,
    eyebrow: 'Needs attention',
    description: definition.description,
    stats: [
      { label: 'Open now', value: number(value), detail: `${percent(value, kpis.workQueue.total)}% of queue`, tone: value ? C.signal : C.verd },
      { label: 'Total queue', value: number(kpis.workQueue.total), detail: 'all operator work' },
      ...(id === 'queue-feedback' ? [{ label: 'Marked as bugs', value: number(kpis.workQueue.bugsOpen), detail: `${percent(kpis.workQueue.bugsOpen, value)}% of feedback` }] : []),
    ],
    breakdowns: [{ title: 'Operator queue composition', rows: [
      { label: 'Beta approvals', count: kpis.workQueue.betaPending, color: C.ochre },
      { label: 'Open feedback', count: kpis.workQueue.feedbackOpen, color: C.signal },
      { label: 'Gig requests', count: kpis.workQueue.gigRequestsPending, color: C.blue },
      { label: 'Role requests', count: kpis.workQueue.roleRequestsPending, color: C.inkMuted },
    ] }],
    watch: definition.watch,
  }
}

function platformModel(id: keyof typeof platformDefinitions, kpis: DashboardKpis): InsightModel {
  const definition = platformDefinitions[id]
  const value = kpis.platform[definition.value]
  const related: Record<keyof typeof platformDefinitions, Stat[]> = {
    'platform-messages': [{ label: 'Conversations', value: number(kpis.platform.conversationsTotal), detail: `${ratio(value, kpis.platform.conversationsTotal)} messages each` }, { label: 'Messages today', value: number(kpis.today.messages), detail: 'current-day flow' }],
    'platform-connections': [{ label: 'Connections / member', value: ratio(value, kpis.users.total), detail: 'network density proxy' }, { label: 'Made today', value: number(kpis.today.connectionsAccepted), detail: 'current-day flow' }],
    'platform-conversations': [{ label: 'Messages / thread', value: ratio(kpis.platform.messagesTotal, value), detail: 'all-time depth' }, { label: 'Started today', value: number(kpis.today.conversations), detail: 'current-day flow' }],
    'platform-events': [{ label: 'RSVPs today', value: number(kpis.today.eventRsvps), detail: `${ratio(kpis.today.eventRsvps, value)} per upcoming event` }, { label: 'Created today', value: number(kpis.today.eventsCreated), detail: 'new supply' }],
    'platform-gigs': [{ label: 'Requests today', value: number(kpis.today.gigRequests), detail: `${ratio(kpis.today.gigRequests, value)} per open gig` }, { label: 'Awaiting response', value: number(kpis.workQueue.gigRequestsPending), detail: 'operator queue' }],
    'platform-cafes': [{ label: 'Check-ins today', value: number(kpis.today.cafeCheckins), detail: `${ratio(kpis.today.cafeCheckins, value)} per active café` }, { label: 'Locations tracked', value: number(kpis.users.locations.length), detail: 'member distribution' }],
    'platform-quests': [{ label: 'Completed today', value: number(kpis.today.questCompletions), detail: `${ratio(kpis.today.questCompletions, value)} per published quest` }, { label: 'Contributors', value: number(kpis.today.uniqueContributors), detail: 'today' }],
  }
  return {
    title: definition.title,
    eyebrow: 'Platform footprint',
    description: definition.description,
    stats: [{ label: 'Current total', value: number(value), detail: definition.related, tone: C.blue }, ...related[id]],
    breakdowns: [{ title: 'Platform context', rows: [
      { label: 'Messages', count: kpis.platform.messagesTotal, color: C.signal },
      { label: 'Connections', count: kpis.platform.connectionsAccepted, color: C.verd },
      { label: 'Conversations', count: kpis.platform.conversationsTotal, color: C.blue },
      { label: 'Events', count: kpis.platform.upcomingEvents, color: C.ochre },
      { label: 'Gigs', count: kpis.platform.openGigs },
      { label: 'Cafés', count: kpis.platform.activeCafes },
      { label: 'Quests', count: kpis.platform.publishedQuests },
    ], note: 'Bars compare scale across different inventory and all-time metrics; read them as context, not a funnel.', showPercent: false }],
    watch: `Track ${definition.title.toLowerCase()} alongside ${definition.related.toLowerCase()} to see whether platform supply and member demand stay balanced.`,
  }
}

function buildModel(insight: MetricInsight, kpis: DashboardKpis, activity: ActivityTrendSnapshot | null, liveUsers: LiveUsersSnapshot | null): InsightModel {
  const id = insight.id
  if (id in activityDefinitions) return activityModel(id as keyof typeof activityDefinitions, kpis)
  if (id in queueDefinitions) return queueModel(id as keyof typeof queueDefinitions, kpis)
  if (id in platformDefinitions) return platformModel(id as keyof typeof platformDefinitions, kpis)
  if (id.startsWith('analytics-')) return activitySummaryModel(id, kpis, activity)

  switch (id) {
    case 'new-members': return {
      title: 'New members today', eyebrow: 'Acquisition', description: 'Accounts created during the current Berlin business day.',
      comparison: { currentLabel: 'Today', current: kpis.users.newToday, previousLabel: kpis.context.comparisonLabel, previous: kpis.users.newYesterday },
      trend: { title: `Member growth · ${kpis.growth.rangeDays} days`, points: points(kpis.growth.usersPerDay), color: C.verd },
      stats: [{ label: 'Last 7 days', value: number(kpis.users.new7d), detail: `${kpis.users.new7d - kpis.users.previous7d >= 0 ? '+' : ''}${kpis.users.new7d - kpis.users.previous7d} vs prior 7d` }, { label: 'Invite sourced', value: `${percent(kpis.users.invited, kpis.users.total)}%`, detail: `${number(kpis.users.invited)} members` }, { label: 'Onboarding rate', value: `${kpis.users.onboardingRate}%`, detail: 'all members' }],
      breakdowns: [{ title: 'Acquisition source', rows: [{ label: 'Invited', count: kpis.users.invited, color: C.verd }, { label: 'Organic', count: kpis.users.organic, color: C.blue }] }],
      table: 'recent-members', tableTitle: 'Newest member arrivals', watch: 'Compare acquisition growth with onboarding quality; more signups only help when new members complete their profiles and return.',
    }
    case 'active-members': return {
      title: 'Active members today', eyebrow: 'User health', description: 'Members whose authoritative last-seen timestamp falls inside today.',
      stats: [{ label: 'Returning today', value: number(kpis.users.returningToday), detail: `${percent(kpis.users.returningToday, kpis.users.activeToday)}% of active` }, { label: 'New & active', value: number(kpis.users.newActiveToday), detail: `${percent(kpis.users.newActiveToday, kpis.users.newToday)}% of new members` }, { label: 'Active in 7 days', value: number(kpis.users.active7d), detail: `${percent(kpis.users.active7d, kpis.users.total)}% reach` }, { label: 'Dormant 30d', value: number(kpis.users.dormant30d), detail: 're-engagement pool', tone: kpis.users.dormant30d ? C.ochre : C.verd }],
      trend: { title: 'Active people · selected activity period', points: activityPoints(activity, 'activeUsers'), color: C.verd }, table: 'engaged-members', tableTitle: 'Members driving activity',
      watch: 'The healthiest mix combines returning members with newly activated accounts; a new-only spike is less durable.',
    }
    case 'unique-contributors': return {
      title: 'Unique contributors', eyebrow: 'Participation', description: 'Distinct members who created, joined, messaged, requested, completed or connected today.',
      comparison: { currentLabel: 'Today', current: kpis.today.uniqueContributors, previousLabel: kpis.context.comparisonLabel, previous: kpis.yesterday.uniqueContributors },
      stats: [{ label: 'Share of active', value: `${percent(kpis.today.uniqueContributors, kpis.users.activeToday)}%`, detail: 'active members who contributed' }, { label: 'Messages', value: number(kpis.today.messages), detail: 'largest participation stream' }, { label: 'Connections', value: number(kpis.today.connectionsAccepted), detail: 'relationships formed' }, { label: 'RSVPs + quests', value: number(kpis.today.eventRsvps + kpis.today.questCompletions), detail: 'structured participation' }],
      breakdowns: [{ title: 'Contribution signals today', rows: [{ label: 'Messages', count: kpis.today.messages, color: C.blue }, { label: 'Connections', count: kpis.today.connectionsAccepted, color: C.verd }, { label: 'Event RSVPs', count: kpis.today.eventRsvps, color: C.ochre }, { label: 'Quest completions', count: kpis.today.questCompletions, color: C.signal }, { label: 'Gig requests', count: kpis.today.gigRequests }, { label: 'Café check-ins', count: kpis.today.cafeCheckins }] }],
      table: 'engaged-members', watch: 'Watch the contributor share, not just raw volume: concentrated activity can hide weak participation breadth.',
    }
    case 'all-members': return {
      title: 'All members', eyebrow: 'Audience', description: 'Every member account currently registered on Knotify.',
      trend: { title: `New members · ${kpis.growth.rangeDays} days`, points: points(kpis.growth.usersPerDay), color: C.verd },
      stats: [{ label: 'Joined · 7 days', value: number(kpis.users.new7d), detail: `${kpis.users.new7d - kpis.users.previous7d >= 0 ? '+' : ''}${kpis.users.new7d - kpis.users.previous7d} vs prior 7d` }, { label: 'Active · 7 days', value: `${percent(kpis.users.active7d, kpis.users.total)}%`, detail: `${number(kpis.users.active7d)} members` }, { label: 'Onboarded', value: `${kpis.users.onboardingRate}%`, detail: `${number(kpis.users.onboardingComplete)} complete` }],
      breakdowns: [{ title: 'Acquisition source', rows: [{ label: 'Invited', count: kpis.users.invited, color: C.verd }, { label: 'Organic', count: kpis.users.organic, color: C.blue }] }, { title: 'Largest personas', rows: kpis.users.personas }],
      table: 'recent-members', watch: 'Population growth is most valuable when the active and onboarded shares remain stable or improve.',
    }
    case 'onboarding': return {
      title: 'Onboarding completion', eyebrow: 'Activation', description: 'Members who completed the core onboarding milestones required for a useful profile.',
      stats: [{ label: 'Completed', value: number(kpis.users.onboardingComplete), detail: `${kpis.users.onboardingRate}% of members`, tone: C.verd }, { label: 'Incomplete', value: number(Math.max(0, kpis.users.total - kpis.users.onboardingComplete)), detail: 'activation opportunity', tone: C.ochre }, { label: 'Profile quality', value: `${kpis.users.averageProfileCompletion}%`, detail: 'average completion' }],
      breakdowns: [{ title: 'Onboarding status', rows: [{ label: 'Complete', count: kpis.users.onboardingComplete, color: C.verd }, { label: 'Incomplete', count: Math.max(0, kpis.users.total - kpis.users.onboardingComplete), color: C.ochre }] }],
      table: 'recent-members', tableTitle: 'Recent onboarding outcomes', watch: 'Focus outreach on recent members with partial profiles before they become dormant.',
    }
    case 'profile-quality': {
      const sample = kpis.latestUsers
      return {
        title: 'Profile quality', eyebrow: 'Activation quality', description: 'Average profile completion across the full member base, supported by the newest-member sample below.',
        stats: [{ label: 'Average completion', value: `${kpis.users.averageProfileCompletion}%`, detail: 'all member profiles', tone: C.blue }, { label: 'Onboarded', value: `${kpis.users.onboardingRate}%`, detail: 'core flow complete' }, { label: 'Recent sample', value: number(sample.length), detail: 'newest members shown' }],
        breakdowns: [{ title: 'Newest-member completion bands', rows: [{ label: 'Complete · 80–100%', count: sample.filter(user => user.profileCompletion >= 80).length, color: C.verd }, { label: 'In progress · 40–79%', count: sample.filter(user => user.profileCompletion >= 40 && user.profileCompletion < 80).length, color: C.ochre }, { label: 'Needs attention · <40%', count: sample.filter(user => user.profileCompletion < 40).length, color: C.signal }], note: 'This banded breakdown uses the newest-member sample; the headline average covers all members.' }],
        table: 'recent-members', tableTitle: 'Newest profiles', watch: 'A falling average often points to acquisition outpacing activation; inspect the newest low-completion accounts first.',
      }
    }
    case 'active-7d': return {
      title: 'Active members · 7 days', eyebrow: 'Retention', description: 'Members seen at least once during the trailing seven days.',
      stats: [{ label: '7-day active', value: number(kpis.users.active7d), detail: `${percent(kpis.users.active7d, kpis.users.total)}% of members`, tone: C.blue }, { label: 'Active today', value: number(kpis.users.activeToday), detail: `${percent(kpis.users.activeToday, kpis.users.active7d)}% of 7d active` }, { label: 'Dormant · 30 days', value: number(kpis.users.dormant30d), detail: 're-engagement pool' }],
      trend: { title: 'Daily active people · selected period', points: activityPoints(activity, 'activeUsers'), color: C.blue }, table: 'engaged-members',
      watch: 'Compare daily activity with seven-day reach to understand frequency: a wide gap means members visit occasionally rather than habitually.',
    }
    case 'dormant-30d': return {
      title: 'Dormant members · 30 days', eyebrow: 'Re-engagement', description: 'Members without recorded activity during the last 30 days.',
      stats: [{ label: 'Dormant', value: number(kpis.users.dormant30d), detail: `${percent(kpis.users.dormant30d, kpis.users.total)}% of members`, tone: kpis.users.dormant30d ? C.ochre : C.verd }, { label: 'Seen in 7 days', value: number(kpis.users.active7d), detail: 'currently engaged' }, { label: 'Reachable pool', value: number(Math.max(0, kpis.users.total - kpis.users.dormant30d)), detail: 'seen within 30 days' }],
      breakdowns: [{ title: 'Member recency', rows: [{ label: 'Active · 7 days', count: kpis.users.active7d, color: C.verd }, { label: 'Seen 8–30 days', count: Math.max(0, kpis.users.total - kpis.users.active7d - kpis.users.dormant30d), color: C.blue }, { label: 'Dormant · 30+ days', count: kpis.users.dormant30d, color: C.ochre }] }],
      watch: 'Prioritise previously onboarded members for re-engagement; they have already crossed the largest activation hurdle.',
    }
    case 'invite-acquisition': return {
      title: 'Invite acquisition', eyebrow: 'Acquisition mix', description: 'The share of member accounts attributed to a Knotify invitation rather than organic discovery.',
      stats: [{ label: 'Invite share', value: `${percent(kpis.users.invited, kpis.users.total)}%`, detail: `${number(kpis.users.invited)} members`, tone: C.verd }, { label: 'Organic share', value: `${percent(kpis.users.organic, kpis.users.total)}%`, detail: `${number(kpis.users.organic)} members`, tone: C.blue }, { label: 'New · 7 days', value: number(kpis.users.new7d), detail: 'all sources' }],
      trend: { title: `New-member trend · ${kpis.growth.rangeDays} days`, points: points(kpis.growth.usersPerDay), color: C.verd },
      breakdowns: [{ title: 'All-member acquisition mix', rows: [{ label: 'Invited', count: kpis.users.invited, color: C.verd }, { label: 'Organic', count: kpis.users.organic, color: C.blue }] }],
      table: 'recent-members', tableTitle: 'Recent arrivals by source', watch: 'Compare source mix with onboarding outcomes in the recent-member list before scaling either channel.',
    }
    case 'online-now': return {
      title: 'Online now', eyebrow: 'Live presence', description: 'Foreground sessions with a heartbeat inside the freshness window; hidden and closed tabs are removed.',
      stats: [{ label: 'Members online', value: number(liveUsers?.users.length ?? kpis.engagement.onlineNow), detail: 'live telemetry', tone: C.verd }, { label: 'App opens today', value: number(kpis.engagement.opensToday), detail: 'all sessions' }, { label: 'Unique today', value: number(kpis.engagement.uniqueUsersToday), detail: 'distinct members' }],
      breakdowns: [], table: 'live-members', tableTitle: 'Current foreground sessions', watch: 'Use current sections and session age to understand what members are doing—not just how many tabs are open.',
    }
    case 'app-opens': return {
      title: 'App opens today', eyebrow: 'Visit frequency', description: 'Distinct application sessions opened during the current Berlin business day.',
      comparison: { currentLabel: 'Today', current: kpis.engagement.opensToday, previousLabel: kpis.context.comparisonLabel, previous: kpis.engagement.opensYesterday },
      trend: { title: 'Sessions per day', points: points(kpis.engagement.sessionsPerDay), color: C.blue },
      stats: [{ label: 'Unique users', value: number(kpis.engagement.uniqueUsersToday), detail: `${ratio(kpis.engagement.opensToday, kpis.engagement.uniqueUsersToday)} opens each` }, { label: 'Avg. session', value: `${kpis.engagement.averageSessionMinutesToday}m`, detail: 'foreground time' }, { label: 'Active minutes', value: `${number(kpis.engagement.totalMinutesToday)}m`, detail: 'today' }],
      table: 'engaged-members', watch: 'More opens are healthy when unique reach or session depth also rises; opens alone can reflect fragmented visits.',
    }
    case 'unique-users-today': return {
      title: 'Unique users today', eyebrow: 'Daily reach', description: 'Distinct members with recorded foreground product activity today.',
      comparison: { currentLabel: 'Today', current: kpis.engagement.uniqueUsersToday, previousLabel: kpis.context.comparisonLabel, previous: kpis.engagement.uniqueUsersYesterday },
      trend: { title: 'Active people · selected period', points: activityPoints(activity, 'activeUsers'), color: C.blue },
      stats: [{ label: 'Member reach', value: `${percent(kpis.engagement.uniqueUsersToday, kpis.users.total)}%`, detail: 'of all members' }, { label: 'Opens / user', value: ratio(kpis.engagement.opensToday, kpis.engagement.uniqueUsersToday), detail: 'visit frequency' }, { label: '7-day active', value: number(kpis.users.active7d), detail: `${percent(kpis.users.active7d, kpis.users.total)}% reach` }],
      table: 'engaged-members', watch: 'Daily reach should be read with seven-day reach and opens per user to separate breadth from frequency.',
    }
    case 'active-minutes-today': return {
      title: 'Active minutes today', eyebrow: 'Engagement depth', description: 'Foreground time credited in bounded heartbeat intervals; background time is excluded.',
      comparison: { currentLabel: 'Today', current: kpis.engagement.totalMinutesToday, previousLabel: kpis.context.comparisonLabel, previous: kpis.engagement.totalMinutesYesterday },
      trend: { title: 'Active minutes per day', points: points(kpis.engagement.minutesPerDay), color: C.signal },
      stats: [{ label: 'Minutes / user', value: ratio(kpis.engagement.totalMinutesToday, kpis.engagement.uniqueUsersToday, 'm'), detail: 'engagement depth' }, { label: 'Minutes / open', value: ratio(kpis.engagement.totalMinutesToday, kpis.engagement.opensToday, 'm'), detail: 'session depth' }, { label: 'Unique users', value: number(kpis.engagement.uniqueUsersToday), detail: 'today' }],
      table: 'engaged-members', watch: 'Check whether minute growth is broad-based in the member ranking or concentrated in one power user.',
    }
    case 'average-session': return {
      title: 'Average session length', eyebrow: 'Session quality', description: 'Average credited foreground minutes per application session today.',
      comparison: { currentLabel: 'Today · minutes', current: kpis.engagement.averageSessionMinutesToday, previousLabel: `${kpis.context.comparisonLabel} · minutes`, previous: kpis.engagement.averageSessionMinutesYesterday },
      trend: { title: 'Total active minutes per day', points: points(kpis.engagement.minutesPerDay), color: C.signal, note: 'Daily totals provide context for the average.' },
      stats: [{ label: 'Average session', value: `${kpis.engagement.averageSessionMinutesToday}m`, detail: 'today', tone: C.signal }, { label: 'App opens', value: number(kpis.engagement.opensToday), detail: 'denominator' }, { label: 'Active minutes', value: `${number(kpis.engagement.totalMinutesToday)}m`, detail: 'numerator' }],
      table: 'engaged-members', watch: 'A shorter average can be healthy when reach and session frequency expand; interpret it with unique users and opens.',
    }
    case 'engaged-members': return {
      title: 'Most engaged members', eyebrow: 'Member ranking', description: 'Members ranked by credited foreground active time in the selected dashboard range.',
      stats: [{ label: 'Members ranked', value: number(kpis.engagement.topUsers.length), detail: 'available telemetry' }, { label: 'Minutes represented', value: `${number(kpis.engagement.topUsers.reduce((sum, user) => sum + user.minutes, 0))}m`, detail: 'ranked members' }, { label: 'Sessions represented', value: number(kpis.engagement.topUsers.reduce((sum, user) => sum + user.sessions, 0)), detail: 'ranked members' }],
      table: 'engaged-members', tableTitle: 'Engagement leaderboard', watch: 'Use this list to identify advocates and detect concentration; healthy engagement should extend beyond the first few members.',
    }
    case 'members-by-persona': return {
      title: 'Members by persona', eyebrow: 'Audience composition', description: 'How members describe their professional role or intent on Knotify.',
      stats: [{ label: 'Personas represented', value: number(kpis.users.personas.length), detail: 'non-empty segments' }, { label: 'Largest segment', value: kpis.users.personas[0]?.label ?? '—', detail: kpis.users.personas[0] ? `${number(kpis.users.personas[0].count)} members` : 'no persona data' }, { label: 'Profile quality', value: `${kpis.users.averageProfileCompletion}%`, detail: 'all members' }],
      breakdowns: [{ title: 'Persona distribution', rows: kpis.users.personas, note: 'Counts reflect self-reported profile data.' }], table: 'recent-members', tableTitle: 'Newest members and personas',
      watch: 'Use persona balance to guide event, quest and marketplace supply; do not infer segment activity without a segmented activity query.',
    }
    case 'members-by-location': return {
      title: 'Members by location', eyebrow: 'Geographic reach', description: 'Member distribution by the city or location stored on their profile.',
      stats: [{ label: 'Locations represented', value: number(kpis.users.locations.length), detail: 'non-empty segments' }, { label: 'Largest location', value: kpis.users.locations[0]?.label ?? '—', detail: kpis.users.locations[0] ? `${number(kpis.users.locations[0].count)} members` : 'no location data' }, { label: 'International', value: number(kpis.users.international), detail: 'flagged international members' }],
      breakdowns: [{ title: 'Location distribution', rows: kpis.users.locations, note: 'Counts reflect member-entered profile locations.' }], table: 'recent-members', tableTitle: 'Newest members and locations',
      watch: 'Location mix can inform local events and café coverage; compare it with supply before expanding a city programme.',
    }
    case 'beta-waitlist': return {
      title: 'Beta waitlist', eyebrow: 'Demand funnel', description: 'All beta applications and their current operator decision status.',
      trend: { title: `Waitlist signups · ${kpis.growth.rangeDays} days`, points: points(kpis.growth.signupsPerDay), color: C.signal },
      stats: [{ label: 'Total applications', value: number(kpis.betaFunnel.total), detail: 'all statuses' }, { label: 'Approval rate', value: `${percent(kpis.betaFunnel.approved, kpis.betaFunnel.total)}%`, detail: `${number(kpis.betaFunnel.approved)} approved`, tone: C.verd }, { label: 'Pending', value: number(kpis.betaFunnel.pending), detail: `${percent(kpis.betaFunnel.pending, kpis.betaFunnel.total)}% of funnel`, tone: C.ochre }, { label: 'Rejected', value: number(kpis.betaFunnel.rejected), detail: `${percent(kpis.betaFunnel.rejected, kpis.betaFunnel.total)}% of funnel` }],
      breakdowns: [{ title: 'Application status', rows: [{ label: 'Approved', count: kpis.betaFunnel.approved, color: C.verd }, { label: 'Pending', count: kpis.betaFunnel.pending, color: C.ochre }, { label: 'Rejected', count: kpis.betaFunnel.rejected, color: C.signal }] }],
      watch: 'Monitor pending share and signup trend together; rising demand with a growing pending share signals review capacity pressure.',
    }
    default: return {
      title: insight.label, eyebrow: 'Dashboard KPI', description: typeof insight.detail === 'string' ? insight.detail : `Operational detail for ${insight.label}.`,
      comparison: insight.current !== undefined && insight.previous !== undefined ? { currentLabel: 'Current', current: insight.current, previousLabel: 'Previous', previous: insight.previous } : undefined,
      stats: [{ label: insight.label, value: insight.value, detail: 'current value', tone: insight.color }],
      watch: 'This metric is ready for a dedicated definition. Add its supporting metrics to the insight registry when the card is introduced.',
    }
  }
}

function ComparisonCard({ comparison }: { comparison: Comparison }) {
  const max = Math.max(1, comparison.current, comparison.previous)
  const difference = comparison.current - comparison.previous
  const delta = comparison.previous ? Math.round(difference / comparison.previous * 100) : comparison.current ? 100 : 0
  const tone = difference >= 0 ? C.verd : C.signal
  return <section style={{ ...card, padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 14 }}><strong style={{ color: C.ink, fontSize: 12.5 }}>Period comparison</strong><span style={{ color: tone, fontSize: 11, fontWeight: 700 }}>{delta >= 0 ? '+' : ''}{delta}%</span></div>
    {[[comparison.currentLabel, comparison.current, C.blue], [comparison.previousLabel, comparison.previous, C.inkFaint]].map(([label, value, color]) => <div key={String(label)} style={{ marginTop: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5 }}><span style={{ color: C.inkMuted }}>{label}</span><strong style={{ color: C.ink }}>{number(Number(value))}</strong></div><div style={{ height: 8, marginTop: 5, borderRadius: 99, background: C.paperSoft, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, width: `${Number(value) / max * 100}%`, background: String(color) }} /></div></div>)}
  </section>
}

function MiniTrend({ trend }: { trend: Trend }) {
  const width = 500, height = 155, left = 28, right = 8, top = 10, bottom = 24
  const max = Math.max(1, ...trend.points.map(point => point.value))
  const x = (index: number) => left + index / Math.max(1, trend.points.length - 1) * (width - left - right)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const line = trend.points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const labelIndexes = trend.points.length ? [0, Math.floor((trend.points.length - 1) / 2), trend.points.length - 1] : []
  return <section style={{ ...card, padding: '15px 15px 9px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: C.ink, fontSize: 12.5 }}>{trend.title}</strong>{trend.note && <span style={{ color: C.inkFaint, fontSize: 9.5 }}>{trend.note}</span>}</div>
    {trend.points.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={trend.title} style={{ display: 'block', width: '100%', height: 155, marginTop: 8 }}>
      {[0, .5, 1].map(step => <g key={step}><line x1={left} x2={width - right} y1={y(max * step)} y2={y(max * step)} stroke={C.rule} /><text x={left - 6} y={y(max * step) + 3} textAnchor="end" fontSize="8" fill={C.inkFaint}>{Math.round(max * step)}</text></g>)}
      <path d={line} fill="none" stroke={trend.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {trend.points.map((point, index) => <circle key={`${point.label}-${index}`} cx={x(index)} cy={y(point.value)} r="2.2" fill={C.white} stroke={trend.color} strokeWidth="1.7"><title>{point.label}: {point.value}</title></circle>)}
      {labelIndexes.map((index, position) => <text key={`${index}-${position}`} x={x(index)} y={height - 5} textAnchor={position === 0 ? 'start' : position === 2 ? 'end' : 'middle'} fontSize="8.5" fill={C.inkFaint}>{trend.points[index]?.label}</text>)}
    </svg> : <div style={{ padding: '30px 0 24px', textAlign: 'center', color: C.inkFaint, fontSize: 11 }}>Trend data is not available for this period yet.</div>}
  </section>
}

function StatGrid({ stats }: { stats: Stat[] }) {
  return <div className="kpi-insight-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>{stats.map((stat, index) => <div key={`${stat.label}-${index}`} style={{ ...card, padding: 13 }}><div style={{ color: C.inkFaint, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.055em' }}>{stat.label}</div><div style={{ marginTop: 6, color: stat.tone ?? C.ink, fontFamily: 'Fraunces, Georgia, serif', fontSize: 23, lineHeight: 1.1, overflowWrap: 'anywhere' }}>{stat.value}</div>{stat.detail && <div style={{ marginTop: 5, color: C.inkMuted, fontSize: 10.5, lineHeight: 1.4 }}>{stat.detail}</div>}</div>)}</div>
}

function BreakdownCard({ breakdown }: { breakdown: Breakdown }) {
  const visibleRows = breakdown.rows.filter(row => row.count > 0).slice(0, 10)
  const total = breakdown.rows.reduce((sum, row) => sum + row.count, 0)
  const max = Math.max(1, ...visibleRows.map(row => row.count))
  return <section style={{ ...card, padding: 15 }}><strong style={{ color: C.ink, fontSize: 12.5 }}>{breakdown.title}</strong><div style={{ display: 'grid', gap: 10, marginTop: 13 }}>{visibleRows.map(row => <div key={row.label}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5 }}><span style={{ color: C.inkMuted }}>{row.label}</span><strong style={{ color: C.ink }}>{number(row.count)} {breakdown.showPercent !== false && <span style={{ color: C.inkFaint, fontWeight: 400 }}>· {percent(row.count, total)}%</span>}</strong></div><div style={{ height: 6, marginTop: 5, borderRadius: 99, background: C.paperSoft, overflow: 'hidden' }}><div style={{ width: `${row.count / max * 100}%`, height: '100%', borderRadius: 99, background: row.color ?? C.blue }} /></div></div>)}{!visibleRows.length && <span style={{ color: C.inkFaint, fontSize: 11 }}>No data available yet.</span>}</div>{breakdown.note && <div style={{ marginTop: 11, color: C.inkFaint, fontSize: 9.5, lineHeight: 1.45 }}>{breakdown.note}</div>}</section>
}

function Initials({ name, src }: { name: string; src?: string | null }) {
  if (src) return <img src={src} alt="" style={{ width: 32, height: 32, borderRadius: 9, objectFit: 'cover' }} />
  return <span style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: C.paperSoft, color: C.inkMuted, fontSize: 10, fontWeight: 750 }}>{name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?'}</span>
}

function MemberTable({ kind, title, kpis, liveUsers }: { kind: TableKind; title?: string; kpis: DashboardKpis; liveUsers: LiveUsersSnapshot | null }) {
  const heading = title ?? (kind === 'recent-members' ? 'Recent members' : kind === 'engaged-members' ? 'Most engaged members' : 'Members online now')
  return <section style={{ ...card, overflow: 'hidden' }}><div style={{ padding: '13px 14px', borderBottom: `0.5px solid ${C.rule}`, color: C.ink, fontSize: 12.5, fontWeight: 750 }}>{heading}</div>
    {kind === 'recent-members' && <div>{kpis.latestUsers.slice(0, 6).map((user, index) => <div key={user.id} style={{ padding: '11px 13px', display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) auto', gap: 9, alignItems: 'center', borderTop: index ? `0.5px solid ${C.rule}` : undefined }}><Initials name={user.fullName} src={user.avatarUrl} /><div style={{ minWidth: 0 }}><div style={{ color: C.ink, fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.fullName}</div><div style={{ color: C.inkFaint, fontSize: 9.5, marginTop: 2 }}>{user.persona || 'No persona'} · {user.locationCity || 'No location'} · {user.source}</div></div><div style={{ textAlign: 'right' }}><strong style={{ color: user.onboardingComplete ? C.verd : C.ochre, fontSize: 11 }}>{user.profileCompletion}%</strong><div style={{ color: C.inkFaint, fontSize: 9, marginTop: 2 }}>{user.onboardingComplete ? 'Onboarded' : 'In progress'}</div></div></div>)}{!kpis.latestUsers.length && <EmptyRows />}</div>}
    {kind === 'engaged-members' && <div>{kpis.engagement.topUsers.slice(0, 8).map((user, index) => <div key={user.id} style={{ padding: '11px 13px', display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) auto', gap: 9, alignItems: 'center', borderTop: index ? `0.5px solid ${C.rule}` : undefined }}><span style={{ color: C.inkFaint, fontSize: 10 }}>#{index + 1}</span><div style={{ minWidth: 0 }}><div style={{ color: C.ink, fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.fullName}</div><div style={{ color: user.online ? C.verd : C.inkFaint, fontSize: 9.5, marginTop: 2 }}>{user.online ? '● online now' : user.username ? `@${user.username}` : 'Member'}</div></div><div style={{ textAlign: 'right' }}><strong style={{ color: C.blue, fontSize: 11.5 }}>{user.minutes}m</strong><div style={{ color: C.inkFaint, fontSize: 9, marginTop: 2 }}>{user.sessions} sessions</div></div></div>)}{!kpis.engagement.topUsers.length && <EmptyRows />}</div>}
    {kind === 'live-members' && <div>{(liveUsers?.users ?? []).slice(0, 8).map((user, index) => <div key={user.id} style={{ padding: '11px 13px', display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) auto', gap: 9, alignItems: 'center', borderTop: index ? `0.5px solid ${C.rule}` : undefined }}><Initials name={user.fullName} src={user.avatarUrl} /><div style={{ minWidth: 0 }}><div style={{ color: C.ink, fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.fullName}</div><div style={{ color: C.blue, fontSize: 9.5, marginTop: 2 }}>{user.currentSection} · {user.deviceTypes.join(', ')}</div></div><div style={{ textAlign: 'right' }}><strong style={{ color: C.verd, fontSize: 11 }}>● live</strong><div style={{ color: C.inkFaint, fontSize: 9, marginTop: 2 }}>{user.pageViews} views</div></div></div>)}{!(liveUsers?.users.length) && <EmptyRows text="No foreground sessions right now." />}</div>}
  </section>
}

function EmptyRows({ text = 'No members available for this view.' }: { text?: string }) {
  return <div style={{ padding: 22, textAlign: 'center', color: C.inkFaint, fontSize: 11 }}>{text}</div>
}

export function KpiInsightDrawer({ insight, kpis, activity, liveUsers, onClose }: { insight: MetricInsight | null; kpis: DashboardKpis; activity: ActivityTrendSnapshot | null; liveUsers: LiveUsersSnapshot | null; onClose: () => void }) {
  useEffect(() => {
    if (!insight) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow }
  }, [insight, onClose])

  if (!insight) return null
  const model = buildModel(insight, kpis, activity, liveUsers)
  return <div onMouseDown={event => { if (event.currentTarget === event.target) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,20,16,.32)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' }}>
    <style>{`@media (max-width: 430px) { .kpi-insight-stats, .kpi-insight-breakdowns { grid-template-columns: 1fr !important; } }`}</style>
    <aside role="dialog" aria-modal="true" aria-labelledby="kpi-insight-title" style={{ width: 'min(590px,100%)', height: '100%', overflowY: 'auto', background: C.paper, boxShadow: '-18px 0 50px rgba(20,15,10,.2)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, padding: '13px 17px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245,240,232,.95)', backdropFilter: 'blur(10px)', borderBottom: `0.5px solid ${C.rule}` }}><span style={{ color: C.inkFaint, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.09em', fontWeight: 700 }}>{model.eyebrow}</span><button onClick={onClose} aria-label="Close details" style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.rule}`, background: C.white, color: C.inkMuted, cursor: 'pointer', fontSize: 18 }}>×</button></div>
      <div style={{ padding: 20 }}>
        <header style={{ ...card, padding: 19, borderTop: `3px solid ${insight.color ?? C.blue}` }}><div style={{ color: C.inkFaint, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>{model.eyebrow}</div><h3 id="kpi-insight-title" style={{ margin: '7px 0 0', color: C.ink, fontFamily: 'Fraunces, Georgia, serif', fontSize: 27, fontWeight: 450, lineHeight: 1.15 }}>{model.title}</h3><div style={{ marginTop: 11, display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}><span style={{ color: insight.color ?? C.ink, fontFamily: 'Fraunces, Georgia, serif', fontSize: 42, lineHeight: 1 }}>{insight.value}</span>{insight.current !== undefined && insight.previous !== undefined && <span style={{ color: insight.current >= insight.previous ? C.verd : C.signal, fontSize: 11, fontWeight: 700 }}>{insight.current - insight.previous >= 0 ? '+' : ''}{insight.current - insight.previous} vs comparison</span>}</div><p style={{ color: C.inkMuted, fontSize: 12, lineHeight: 1.6, margin: '13px 0 0' }}>{model.description}</p></header>
        <div style={{ margin: '16px 0 9px', color: C.ink, fontSize: 12.5, fontWeight: 750 }}>Supporting metrics</div>
        <StatGrid stats={model.stats} />
        {model.comparison && <div style={{ marginTop: 9 }}><ComparisonCard comparison={model.comparison} /></div>}
        {model.trend && <div style={{ marginTop: 9 }}><MiniTrend trend={model.trend} /></div>}
        {!!model.breakdowns?.length && <div className="kpi-insight-breakdowns" style={{ display: 'grid', gridTemplateColumns: model.breakdowns.length > 1 ? 'repeat(2,minmax(0,1fr))' : '1fr', gap: 9, marginTop: 9 }}>{model.breakdowns.map((breakdown, index) => <BreakdownCard key={`${breakdown.title}-${index}`} breakdown={breakdown} />)}</div>}
        {model.table && <div style={{ marginTop: 9 }}><MemberTable kind={model.table} title={model.tableTitle} kpis={kpis} liveUsers={liveUsers} /></div>}
        <section style={{ ...card, padding: 14, marginTop: 9, borderLeft: `3px solid ${C.ochre}` }}><div style={{ color: C.ink, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>What to watch</div><div style={{ color: C.inkMuted, fontSize: 11.5, lineHeight: 1.55 }}>{model.watch}</div></section>
      </div>
    </aside>
  </div>
}
