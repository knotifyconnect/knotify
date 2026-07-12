export type SpotlightStep = {
  kind: 'spotlight'
  id: string
  path: string
  target: string
  title: string
  body: string
}

export type NavigateStep = {
  kind: 'navigate'
  id: string
  toPath: string
  target: string
  title: string
  body: string
}

export type TourStep = SpotlightStep | NavigateStep

export const TOUR_STEPS: TourStep[] = [
  {
    kind: 'spotlight',
    id: 'today-moves-queue',
    path: '/home',
    target: '[data-tour="today-moves-queue"]',
    title: "Today's moves",
    body: 'This queue ranks who to reach out to and why: how long it has been, and what is going on with them. Clear a card by messaging them or planning coffee.',
  },
  {
    kind: 'spotlight',
    id: 'companion-input',
    path: '/home',
    target: '[data-tour="companion-input"]',
    title: 'Ask the Companion',
    body: 'Your AI relationship advisor, grounded in your real connections and history. Ask who to talk to or how to word something tricky, and it can draft a message for you to confirm.',
  },
  {
    kind: 'spotlight',
    id: 'asks-for-you',
    path: '/home',
    target: '[data-tour="asks-for-you"]',
    title: 'Asks',
    body: 'Requests from your network that match what you can help with, and the open asks you have posted yourself. Helping with an ask is one of the fastest ways to build credibility.',
  },
  {
    kind: 'spotlight',
    id: 'coffees-booked',
    path: '/home',
    target: '[data-tour="coffees-booked"]',
    title: 'Coffees, booked',
    body: 'Every meeting you have confirmed with a connection, with the time and place, so you never lose track of who you are meeting next.',
  },
  {
    kind: 'spotlight',
    id: 'pulse-knot',
    path: '/home',
    target: '[data-tour="pulse-knot"]',
    title: 'Pulse of your knot',
    body: 'A live feed of what is happening across your network: milestones, updates, and moves other people are making.',
  },
  {
    kind: 'spotlight',
    id: 'next-irl',
    path: '/home',
    target: '[data-tour="next-irl"]',
    title: 'Next, in real life',
    body: 'Upcoming events that match your interests or that people in your network are attending. Real connection compounds faster in person.',
  },
  {
    kind: 'spotlight',
    id: 'side-quests',
    path: '/home',
    target: '[data-tour="side-quests"]',
    title: 'Side quests',
    body: 'Small, concrete actions that raise your credibility tier. This card shows a few at a time; the full list lives on the Quests page.',
  },
  {
    kind: 'navigate',
    id: 'nav-quests',
    toPath: '/quests',
    target: '[data-tour="nav-quests"]',
    title: 'Head to Quests',
    body: 'Click "All" on the Side quests card above.',
  },
  {
    kind: 'spotlight',
    id: 'quest-tier-display',
    path: '/quests',
    target: '[data-tour="quest-tier-display"]',
    title: 'Credibility and tier',
    body: 'Your current tier and how close you are to the next one. Higher tiers unlock more visibility and trust, earned entirely by completing quests.',
  },
  {
    kind: 'spotlight',
    id: 'quest-categories',
    path: '/quests',
    target: '[data-tour="quest-categories"]',
    title: 'All quests',
    body: 'Every available quest, grouped by category. Claim any of them to earn credibility points toward your next tier.',
  },
  {
    kind: 'navigate',
    id: 'nav-map',
    toPath: '/map',
    target: '[data-tour="nav-map"]',
    title: 'Head to Your Knot',
    body: 'Click "Your Knot" in the sidebar.',
  },
  {
    kind: 'spotlight',
    id: 'knot-search',
    path: '/map',
    target: '[data-tour="knot-search"]',
    title: 'Find someone',
    body: 'Search any connection by name to jump straight to them on the graph.',
  },
  {
    kind: 'spotlight',
    id: 'knot-stats',
    path: '/map',
    target: '[data-tour="knot-stats"]',
    title: 'Network stats',
    body: 'A quick read on your network: how many connections are warm, how many are going cold, and how tightly knit your circle is.',
  },
  {
    kind: 'spotlight',
    id: 'knot-legend',
    path: '/map',
    target: '[data-tour="knot-legend"]',
    title: 'Color legend',
    body: 'Warmer colors mean recent contact, cooler ones mean it has been a while. Badges flag an open ask, a booked coffee, or a pending follow-up.',
  },
  {
    kind: 'spotlight',
    id: 'knot-graph',
    path: '/map',
    target: '[data-tour="knot-graph"]',
    title: 'The graph itself',
    body: 'Every connection you have made, visualized. Click any node to see the full picture and jump into messaging or planning coffee.',
  },
  {
    kind: 'navigate',
    id: 'nav-jobs',
    toPath: '/jobs',
    target: '[data-tour="nav-jobs"]',
    title: 'Head to Jobs & Gigs',
    body: 'Click "Jobs & Gigs" in the sidebar.',
  },
  {
    kind: 'spotlight',
    id: 'jobs-feed',
    path: '/jobs',
    target: '[data-tour="jobs-feed"]',
    title: 'Jobs & gigs',
    body: 'Open roles and gigs matched to your profile and network. Share one yourself, or ask a connection to refer you into a role they can vouch for.',
  },
  {
    kind: 'spotlight',
    id: 'referral-inbox',
    path: '/jobs',
    target: '[data-tour="referral-inbox"]',
    title: 'Referral inbox',
    body: 'When someone asks you to refer them for a role at your company, it lands here. A real referral is one of the highest-trust things you can give.',
  },
  {
    kind: 'navigate',
    id: 'nav-cafes',
    toPath: '/cafes',
    target: '[data-tour="nav-cafes"]',
    title: 'Head to Cafés',
    body: 'Click "Cafes" in the sidebar.',
  },
  {
    kind: 'spotlight',
    id: 'cafe-directory',
    path: '/cafes',
    target: '[data-tour="cafe-directory"]',
    title: 'Places to meet',
    body: 'Cafes, restaurants and bars around Munich, good for a first coffee with a new connection. Pick one and invite someone straight from here.',
  },
  {
    kind: 'spotlight',
    id: 'cafe-partner-deals',
    path: '/cafes',
    target: '[data-tour="cafe-partner-deals"]',
    title: 'Partner deals',
    body: 'Partnered spots offer a perk just for knotify members, shown right on the card. More partners are being added as the network grows.',
  },
]
