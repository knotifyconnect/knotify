const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export function getSecret() { return sessionStorage.getItem('admin_secret') ?? '' }
export function setSecret(s: string) { sessionStorage.setItem('admin_secret', s) }
export function clearSecret() { sessionStorage.removeItem('admin_secret') }

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

async function uploadRequest(path: string, file: File) {
  const fd = new FormData()
  fd.append('image', file)
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'x-admin-secret': getSecret() },
    body: fd,
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Upload failed')
  return data
}

export const api = {
  stats: () => request('/api/admin-panel/stats'),

  betaSignups: (status?: string) =>
    request(`/api/admin-panel/beta-signups${status ? `?status=${status}` : ''}`),
  updateSignup: (id: string, status: 'approved' | 'rejected' | 'pending') =>
    request(`/api/admin-panel/beta-signups/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Image upload
  uploadImage: (file: File) => uploadRequest('/api/admin-panel/upload', file),

  // Events
  events: () => request('/api/admin-panel/events'),
  createEvent: (body: unknown) => request('/api/admin-panel/events', { method: 'POST', body: JSON.stringify(body) }),
  updateEvent: (id: string, body: unknown) => request(`/api/admin-panel/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEvent: (id: string) => request(`/api/admin-panel/events/${id}`, { method: 'DELETE' }),

  // Gigs
  gigs: () => request('/api/admin-panel/gigs'),
  updateGig: (id: string, status: 'open' | 'closed') => request(`/api/admin-panel/gigs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  setGigFeatured: (id: string, isFeatured: boolean) => request(`/api/admin-panel/gigs/${id}`, { method: 'PATCH', body: JSON.stringify({ isFeatured }) }),
  deleteGig: (id: string) => request(`/api/admin-panel/gigs/${id}`, { method: 'DELETE' }),
  gigRequests: (status?: string) => request(`/api/admin-panel/gig-requests${status ? `?status=${status}` : ''}`),

  // Quests
  quests: () => request('/api/admin-panel/quests'),
  createQuest: (body: unknown) => request('/api/admin-panel/quests', { method: 'POST', body: JSON.stringify(body) }),
  updateQuest: (id: string, body: unknown) => request(`/api/admin-panel/quests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteQuest: (id: string) => request(`/api/admin-panel/quests/${id}`, { method: 'DELETE' }),

  // Settings
  settings: () => request('/api/admin-panel/settings'),
  updateSetting: (key: string, value: unknown) =>
    request('/api/admin-panel/settings', { method: 'PATCH', body: JSON.stringify({ key, value }) }),

  // Invites
  invites: () => request('/api/admin-panel/invites'),
}
