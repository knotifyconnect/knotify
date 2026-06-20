const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

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
}
