export type TourStep = {
  id: string
  path: string
  target: string
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'today-moves-queue',
    path: '/home',
    target: '[data-tour="today-moves-queue"]',
    title: "Today's moves",
    body: 'This queue surfaces who to reach out to and why, ranked by how long it has been and what is going on with them. Clear a card by messaging or planning coffee.',
  },
  {
    id: 'companion-input',
    path: '/home',
    target: '[data-tour="companion-input"]',
    title: 'Ask the Companion',
    body: 'Your AI relationship advisor, grounded in your real connections and history. Ask who to talk to, how to word something tricky, or what to do next.',
  },
  {
    id: 'knot-graph',
    path: '/map',
    target: '[data-tour="knot-graph"]',
    title: 'Your knot graph',
    body: 'Every connection you have made, visualized. Warmer colors mean recent contact, cooler ones mean it is time to reconnect. Click a node to see the full picture.',
  },
  {
    id: 'message-compose',
    path: '/messages',
    target: '[data-tour="message-compose"]',
    title: 'Message anyone',
    body: 'Send a message straight from here. Coffee proposals, asks, and updates all flow through the same thread as your conversation.',
  },
  {
    id: 'quest-tier-display',
    path: '/quests',
    target: '[data-tour="quest-tier-display"]',
    title: 'Credibility and quests',
    body: 'Completing quests (helping others, showing up to events, keeping your profile current) raises your tier. Higher tiers unlock more visibility and trust.',
  },
]
