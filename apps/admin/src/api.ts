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
  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
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

  // Cafes, restaurants, and bars
  cafes: () => request('/api/admin-panel/cafes'),
  createCafe: (body: unknown) => request('/api/admin-panel/cafes', { method: 'POST', body: JSON.stringify(body) }),
  updateCafe: (id: string, body: unknown) => request(`/api/admin-panel/cafes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveCafe: (id: string) => request(`/api/admin-panel/cafes/${id}`, { method: 'DELETE' }),
  deleteCafe: (id: string) => request(`/api/admin-panel/cafes/${id}?permanent=true`, { method: 'DELETE' }),
  importCafes: (rows: unknown[], mode: 'create' | 'update') => request('/api/admin-panel/cafes/import', { method: 'POST', body: JSON.stringify({ rows, mode }) }),

  // Events
  events: () => request('/api/admin-panel/events'),
  createEvent: (body: unknown) => request('/api/admin-panel/events', { method: 'POST', body: JSON.stringify(body) }),
  updateEvent: (id: string, body: unknown) => request(`/api/admin-panel/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveEvent: (id: string, archived = true) => request(`/api/admin-panel/events/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) }),
  deleteEvent: (id: string) => request(`/api/admin-panel/events/${id}`, { method: 'DELETE' }),
  importEvents: (rows: unknown[], mode: 'create' | 'update') => request('/api/admin-panel/events/import', { method: 'POST', body: JSON.stringify({ rows, mode }) }),
  eventTypes: () => request('/api/admin-panel/event-types'),
  addEventType: (label: string) => request('/api/admin-panel/event-types', { method: 'POST', body: JSON.stringify({ label }) }),
  renameEventType: (label: string, nextLabel: string) => request('/api/admin-panel/event-types', { method: 'PATCH', body: JSON.stringify({ label, nextLabel }) }),
  deleteEventType: (label: string) => request('/api/admin-panel/event-types', { method: 'DELETE', body: JSON.stringify({ label }) }),

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

  // Cafés
  pendingCafes: (status?: string) => request(`/api/admin-panel/pending-cafes${status ? `?status=${status}` : ''}`),
  updatePendingCafe: (id: string, status: 'approved' | 'rejected' | 'pending') =>
    request(`/api/admin-panel/pending-cafes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Settings
  settings: () => request('/api/admin-panel/settings'),
  updateSetting: (key: string, value: unknown) =>
    request('/api/admin-panel/settings', { method: 'PATCH', body: JSON.stringify({ key, value }) }),

  // Invites
  invites: () => request('/api/admin-panel/invites'),

  // Feedback
  feedback: (status?: string) => request(`/api/admin-panel/feedback${status ? `?status=${status}` : ''}`),
  resolveFeedback: (id: string, status: 'open' | 'resolved') =>
    request(`/api/admin-panel/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
