const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export function getSecret() {
  return sessionStorage.getItem('admin_secret') ?? ''
}

export function setSecret(s: string) {
  sessionStorage.setItem('admin_secret', s)
}

export function clearSecret() {
  sessionStorage.removeItem('admin_secret')
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': getSecret(),
      ...options.headers,
    },
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export const api = {
  stats: () => request('/api/admin-panel/stats'),

  betaSignups: (status?: string) =>
    request(`/api/admin-panel/beta-signups${status ? `?status=${status}` : ''}`),

  updateSignup: (id: string, status: 'approved' | 'rejected' | 'pending') =>
    request(`/api/admin-panel/beta-signups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Events
  events: () => request('/api/admin-panel/events'),
  createEvent: (body: unknown) => request('/api/admin-panel/events', { method: 'POST', body: JSON.stringify(body) }),
  deleteEvent: (id: string) => request(`/api/admin-panel/events/${id}`, { method: 'DELETE' }),

  // Gigs
  gigs: () => request('/api/admin-panel/gigs'),
  updateGig: (id: string, status: 'open' | 'closed') => request(`/api/admin-panel/gigs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteGig: (id: string) => request(`/api/admin-panel/gigs/${id}`, { method: 'DELETE' }),

  // Quests
  quests: () => request('/api/admin-panel/quests'),
  createQuest: (body: unknown) => request('/api/admin-panel/quests', { method: 'POST', body: JSON.stringify(body) }),
  updateQuest: (id: string, body: unknown) => request(`/api/admin-panel/quests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteQuest: (id: string) => request(`/api/admin-panel/quests/${id}`, { method: 'DELETE' }),
}
