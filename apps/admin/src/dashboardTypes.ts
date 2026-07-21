export type DashboardPoint = { date: string; count: number }

export type DashboardActivity = {
  messages: number
  connectionsRequested: number
  connectionsAccepted: number
  conversations: number
  eventRsvps: number
  questCompletions: number
  cafeCheckins: number
  gigRequests: number
  feedback: number
  invites: number
  eventsCreated: number
  uniqueContributors: number
}

export type DashboardKpis = {
  generatedAt: string
  context: { timeZone: string; todayStartedAt: string; comparisonEndsAt: string; comparisonLabel: string }
  users: {
    total: number; newToday: number; newYesterday: number; new7d: number; previous7d: number
    activeToday: number; active7d: number; returningToday: number; newActiveToday: number
    dormant30d: number; onboardingComplete: number; onboardingRate: number; averageProfileCompletion: number
    invited: number; organic: number; premium: number; hr: number; international: number
    personas: { label: string; count: number }[]; locations: { label: string; count: number }[]
  }
  latestUsers: {
    id: string; fullName: string; username: string; avatarUrl: string | null; persona: string | null
    locationCity: string | null; createdAt: string; lastSeenAt: string | null; source: 'Invite' | 'Organic'
    profileCompletion: number; onboardingComplete: boolean
  }[]
  growth: { rangeDays: number; usersPerDay: DashboardPoint[]; signupsPerDay: DashboardPoint[]; messagesPerDay: DashboardPoint[] }
  engagement: {
    available: boolean
    onlineNow: number; opensToday: number; opensYesterday: number; uniqueUsersToday: number; uniqueUsersYesterday: number
    totalMinutesToday: number; totalMinutesYesterday: number; averageSessionMinutesToday: number; averageSessionMinutesYesterday: number
    sessionsPerDay: DashboardPoint[]; minutesPerDay: DashboardPoint[]
    topUsers: { id: string; fullName: string; username: string | null; minutes: number; sessions: number; lastSeenAt: string; online: boolean }[]
  }
  today: DashboardActivity
  yesterday: DashboardActivity
  betaFunnel: { total: number; pending: number; approved: number; rejected: number }
  workQueue: { total: number; betaPending: number; feedbackOpen: number; bugsOpen: number; gigRequestsPending: number; roleRequestsPending: number }
  platform: { messagesTotal: number; connectionsAccepted: number; conversationsTotal: number; upcomingEvents: number; openGigs: number; activeCafes: number; publishedQuests: number }
}
