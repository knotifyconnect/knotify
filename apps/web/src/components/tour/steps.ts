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
    body: "This queue ranks who to reach out to and why: how long it's been, and what's changed for them recently. Each card has a one-tap action. Clear a card by messaging them or planning coffee, and it drops off the list.",
  },
  {
    kind: 'spotlight',
    id: 'companion-input',
    path: '/home',
    target: '[data-tour="companion-input"]',
    title: 'Ask the Companion',
    body: 'Your AI relationship advisor, grounded in your real connections and history, not generic advice. Ask who to talk to, how to word something tricky, or what to do next, and it can draft a message or propose coffee for you to confirm.',
  },
  {
    kind: 'spotlight',
    id: 'asks-for-you',
    path: '/home',
    target: '[data-tour="asks-for-you"]',
    title: 'Asks',
    body: 'Two lists live here: requests from the community that match what you can help with, and the open asks you have posted yourself. Helping with an ask is one of the fastest ways to build credibility.',
  },
  {
    kind: 'spotlight',
    id: 'coffees-booked',
    path: '/home',
    target: '[data-tour="coffees-booked"]',
    title: 'Coffees, booked',
    body: 'Every meeting you have confirmed with a connection shows up here with the time and place, so you never lose track of who you are meeting next.',
  },
  {
    kind: 'spotlight',
    id: 'pulse-knot',
    path: '/home',
    target: '[data-tour="pulse-knot"]',
    title: 'Pulse of your knot',
    body: 'A live feed of what is happening across your network: milestones, updates, and moves other people are making. It is how you notice a reason to reach out before the "Today\'s moves" queue would even flag it.',
  },
  {
    kind: 'spotlight',
    id: 'next-irl',
    path: '/home',
    target: '[data-tour="next-irl"]',
    title: 'Next, in real life',
    body: 'Upcoming events that match your interests or that people in your network are attending. Real connection compounds faster in person, this is where you find the next one to show up to.',
  },
  {
    kind: 'spotlight',
    id: 'side-quests',
    path: '/home',
    target: '[data-tour="side-quests"]',
    title: 'Side quests',
    body: 'Small, concrete actions (completing your profile, helping someone, showing up to an event) that raise your credibility tier. This card only shows a few at a time; the full list lives on the Quests page.',
  },
  {
    kind: 'navigate',
    id: 'nav-quests',
    toPath: '/quests',
    target: '[data-tour="nav-quests"]',
    title: 'Head to Quests',
    body: 'Click "All" on the Side quests card above to see the full quests page. There is no separate sidebar link for it, this is the way in.',
  },
  {
    kind: 'spotlight',
    id: 'quest-tier-display',
    path: '/quests',
    target: '[data-tour="quest-tier-display"]',
    title: 'Credibility and tier',
    body: 'Your current tier and how close you are to the next one. Higher tiers unlock more visibility and trust across the network, and they are earned entirely by completing quests, not by paying or posting.',
  },
  {
    kind: 'spotlight',
    id: 'quest-categories',
    path: '/quests',
    target: '[data-tour="quest-categories"]',
    title: 'All quests',
    body: 'Every available quest, grouped by category: profile, network, social, explore, and giving back. Claim any of them to earn credibility points toward your next tier.',
  },
  {
    kind: 'navigate',
    id: 'nav-map',
    toPath: '/map',
    target: '[data-tour="nav-map"]',
    title: 'Head to Your Knot',
    body: 'Click "Your Knot" in the sidebar to see your whole network mapped out visually.',
  },
  {
    kind: 'spotlight',
    id: 'knot-search',
    path: '/map',
    target: '[data-tour="knot-search"]',
    title: 'Find someone',
    body: 'Search any connection by name to jump straight to them on the graph, useful once your network grows past a glance.',
  },
  {
    kind: 'spotlight',
    id: 'knot-stats',
    path: '/map',
    target: '[data-tour="knot-stats"]',
    title: 'Network stats',
    body: 'A quick read on your whole network at once: how many connections are warm, how many are going cold, and how tightly knit your circle is.',
  },
  {
    kind: 'spotlight',
    id: 'knot-legend',
    path: '/map',
    target: '[data-tour="knot-legend"]',
    title: 'Color legend',
    body: 'What the colors on the graph mean: warmer tones are recent contact, cooler tones mean it has been a while. Badges on a node flag an open ask, a booked coffee, or a pending follow-up.',
  },
  {
    kind: 'spotlight',
    id: 'knot-graph',
    path: '/map',
    target: '[data-tour="knot-graph"]',
    title: 'The graph itself',
    body: 'Every connection you have made, visualized. Click any node to see the full picture of that relationship and jump into messaging or planning coffee with them.',
  },
  {
    kind: 'navigate',
    id: 'nav-messages',
    toPath: '/messages',
    target: '[data-tour="nav-messages"]',
    title: 'Head to Messages',
    body: 'Click "Messages" in the sidebar to see your conversations.',
  },
  {
    kind: 'spotlight',
    id: 'message-list',
    path: '/messages',
    target: '[data-tour="message-list"]',
    title: 'Your conversations',
    body: 'Every open thread lives here, most recent first. Coffee proposals, asks, and updates all flow through the same thread as your regular messages, so there is one place to check, not several.',
  },
  {
    kind: 'spotlight',
    id: 'message-compose',
    path: '/messages',
    target: '[data-tour="message-compose"]',
    title: 'Send a message',
    body: 'Type here and hit enter to send. That is the whole tour, you now know where everything lives.',
  },
]
