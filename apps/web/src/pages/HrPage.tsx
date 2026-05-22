import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard, KPill } from '../lib/knotify'

type Me = {
  id: string
  is_hr: boolean
}

type Company = {
  id: string
  name: string
  city: string | null
  created_by: string | null
  confirmedMemberCount: number
  openJobsCount: number
}

type Member = {
  id: string
  company_id: string
  user_id: string
  role: 'hr' | 'employee' | 'admin'
  title: string | null
  confirmed: boolean
  user: {
    id: string
    full_name: string
    username: string
    email: string
  } | null
}

type SearchUser = {
  id: string
  full_name: string
  username: string
}

type Job = {
  id: string
  title: string
  status: 'open' | 'closed' | 'draft'
  required_skills: string[]
  created_at: string
}

type ReferralInboxItem = {
  id: string
  status: 'submitted' | 'under_review' | 'interview' | 'rejected' | 'hired' | 'converted'
  overall_rating: number | null
  recommendation_text: string | null
  hr_decision_note: string | null
  hr_decision_at: string | null
  submitted_at: string | null
  created_at: string
  applicant: { id: string; full_name: string; username: string } | null
  referrer: { id: string; full_name: string; username: string } | null
  job: { id: string; title: string } | null
}

type ReferralHistoryEvent = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  note: string | null
  created_at: string
  actor: { id: string; full_name: string; username: string } | null
}

function referralStatusPill(status: ReferralInboxItem['status']) {
  if (status === 'submitted') return 'bg-accent-teal/10 text-accent-teal border border-accent-teal/20'
  if (status === 'under_review') return 'bg-brand-500/10 text-brand-300 border border-brand-500/20'
  if (status === 'interview') return 'bg-accent-amber/10 text-accent-amber border border-accent-amber/20'
  if (status === 'hired') return 'bg-accent-teal/10 text-accent-teal border border-accent-teal/20'
  if (status === 'converted') return 'bg-accent-teal/10 text-accent-teal border border-accent-teal/20'
  return 'bg-accent-red/10 text-accent-red border border-accent-red/20'
}

function statusText(status: string | null) {
  if (!status) return 'Unknown'
  return status.replace('_', ' ')
}

function historyEventTitle(event: ReferralHistoryEvent) {
  if (event.event_type === 'created') return `Request created (${statusText(event.to_status)})`
  if (event.event_type === 'referrer_response') return `Referrer response (${statusText(event.to_status)})`
  if (event.event_type === 'submitted') return `Referral submitted (${statusText(event.to_status)})`
  if (event.event_type === 'hr_decision') return `HR decision (${statusText(event.to_status)})`
  if (event.event_type === 'converted') return `Applicant converted (${statusText(event.to_status)})`
  return `Status updated (${statusText(event.to_status)})`
}

export function HrPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState('')

  const [members, setMembers] = useState<Member[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [companyInbox, setCompanyInbox] = useState<ReferralInboxItem[]>([])
  const [companyInboxLoading, setCompanyInboxLoading] = useState(false)
  const [decisionLoadingId, setDecisionLoadingId] = useState<string | null>(null)
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [historyByReferral, setHistoryByReferral] = useState<Record<string, ReferralHistoryEvent[]>>({})
  const [historyOpenByReferral, setHistoryOpenByReferral] = useState<Record<string, boolean>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null)
  const [historyErrorByReferral, setHistoryErrorByReferral] = useState<Record<string, string>>({})

  const [companyForm, setCompanyForm] = useState({ name: '', city: 'Munich' })
  const [jobForm, setJobForm] = useState({ title: '', description: '', requiredSkills: '', location: 'Munich', isRemote: false, salaryMin: '', salaryMax: '' })
  const [jobFormError, setJobFormError] = useState<string | null>(null)
  const [jobPosting, setJobPosting] = useState(false)

  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<SearchUser[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberRole, setMemberRole] = useState<'hr' | 'employee' | 'admin'>('employee')
  const [memberTitle, setMemberTitle] = useState('')

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  )

  async function bootstrap() {
    setLoading(true)
    setError(null)
    try {
      const meData = await apiGet<{ user: Me }>('/api/users/me')
      setMe(meData.user)
      if (!meData.user.is_hr) {
        setLoading(false)
        return
      }
      await loadCompanies()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load HR dashboard')
    } finally {
      setLoading(false)
    }
  }

  async function loadCompanies() {
    const data = await apiGet<{ companies: Company[] }>('/api/companies')
    const list = data.companies ?? []
    setCompanies(list)
    const nextCompanyId = activeCompanyId || list[0]?.id || ''
    setActiveCompanyId(nextCompanyId)

    if (nextCompanyId) {
      await Promise.all([loadMembers(nextCompanyId), loadJobs(nextCompanyId), loadCompanyInbox(nextCompanyId)])
    } else {
      setMembers([])
      setJobs([])
      setCompanyInbox([])
    }
  }

  async function loadMembers(companyId: string) {
    const data = await apiGet<{ members: Member[] }>(`/api/companies/${companyId}/members`)
    setMembers(data.members ?? [])
  }

  async function loadJobs(companyId: string) {
    const data = await apiGet<{ jobs: Job[] }>(`/api/jobs?status=all&companyId=${companyId}`)
    setJobs(data.jobs ?? [])
  }

  async function loadCompanyInbox(companyId: string) {
    setCompanyInboxLoading(true)
    try {
      const data = await apiGet<{ referrals: ReferralInboxItem[] }>(
        `/api/referrals/company-inbox?companyId=${encodeURIComponent(companyId)}&statuses=submitted,under_review,interview,rejected,hired`
      )
      setCompanyInbox(data.referrals ?? [])
    } catch (err) {
      setCompanyInbox([])
      setError(err instanceof Error ? err.message : 'Failed loading company referral inbox')
    } finally {
      setCompanyInboxLoading(false)
    }
  }

  useEffect(() => {
    bootstrap()
  }, [])

  useEffect(() => {
    const id = window.setTimeout(async () => {
      if (!memberQuery.trim() || !me?.is_hr) {
        setMemberResults([])
        return
      }
      try {
        const data = await apiGet<{ users: SearchUser[] }>(`/api/users/search?q=${encodeURIComponent(memberQuery)}`)
        setMemberResults(data.users ?? [])
      } catch {
        setMemberResults([])
      }
    }, 300)

    return () => window.clearTimeout(id)
  }, [memberQuery, me?.is_hr])

  async function createCompany() {
    if (!companyForm.name.trim()) return
    try {
      await apiPost('/api/companies', {
        name: companyForm.name.trim(),
        city: companyForm.city.trim() || 'Munich',
      })
      setCompanyForm({ name: '', city: 'Munich' })
      await loadCompanies()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed creating company')
    }
  }

  async function createJob() {
    setJobFormError(null)
    if (!activeCompanyId) return
    const title = jobForm.title.trim()
    const description = jobForm.description.trim()
    if (title.length < 2) { setJobFormError('Title needs at least 2 characters'); return }
    if (description.length < 20) { setJobFormError('Description needs at least 20 characters'); return }

    const salaryMin = jobForm.salaryMin.trim() ? Number(jobForm.salaryMin) : undefined
    const salaryMax = jobForm.salaryMax.trim() ? Number(jobForm.salaryMax) : undefined
    if (salaryMin !== undefined && Number.isNaN(salaryMin)) { setJobFormError('Salary min must be a number'); return }
    if (salaryMax !== undefined && Number.isNaN(salaryMax)) { setJobFormError('Salary max must be a number'); return }
    if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) { setJobFormError('Salary min must be ≤ max'); return }

    setJobPosting(true)
    try {
      await apiPost('/api/jobs', {
        companyId: activeCompanyId,
        title,
        description,
        requiredSkills: jobForm.requiredSkills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        location: jobForm.location.trim() || 'Munich',
        isRemote: jobForm.isRemote,
        salaryMin,
        salaryMax,
        status: 'open',
      })
      setJobForm({ title: '', description: '', requiredSkills: '', location: 'Munich', isRemote: false, salaryMin: '', salaryMax: '' })
      await loadJobs(activeCompanyId)
      await loadCompanies()
    } catch (err) {
      setJobFormError(err instanceof Error ? err.message : 'Failed creating job')
    } finally {
      setJobPosting(false)
    }
  }

  async function updateJobStatus(jobId: string, status: 'open' | 'closed' | 'draft') {
    try {
      await apiPatch(`/api/jobs/${jobId}`, { status })
      if (activeCompanyId) {
        await loadJobs(activeCompanyId)
        await loadCompanies()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed updating job status')
    }
  }

  async function addMember() {
    if (!activeCompanyId || !selectedMemberId) return
    try {
      await apiPost(`/api/companies/${activeCompanyId}/members`, {
        userId: selectedMemberId,
        role: memberRole,
        title: memberTitle.trim() || undefined,
      })
      setSelectedMemberId('')
      setMemberTitle('')
      setMemberQuery('')
      setMemberResults([])
      await loadMembers(activeCompanyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed adding member')
    }
  }

  async function confirmMember(userId: string) {
    if (!activeCompanyId) return
    try {
      await apiPatch(`/api/companies/${activeCompanyId}/members/${userId}`, { action: 'confirm' })
      await loadMembers(activeCompanyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed confirming member')
    }
  }

  async function removeMember(userId: string) {
    if (!activeCompanyId) return
    try {
      await apiPatch(`/api/companies/${activeCompanyId}/members/${userId}`, { action: 'remove' })
      await loadMembers(activeCompanyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed removing member')
    }
  }

  async function switchCompany(companyId: string) {
    setActiveCompanyId(companyId)
    await Promise.all([loadMembers(companyId), loadJobs(companyId), loadCompanyInbox(companyId)])
  }

  async function decideReferral(
    referralId: string,
    status: 'under_review' | 'interview' | 'rejected' | 'hired'
  ) {
    setDecisionLoadingId(referralId)
    try {
      await apiPatch(`/api/referrals/${referralId}/hr-decision`, {
        status,
        note: decisionNotes[referralId]?.trim() || undefined,
      })
      if (activeCompanyId) {
        await loadCompanyInbox(activeCompanyId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed updating referral status')
    } finally {
      setDecisionLoadingId(null)
    }
  }

  async function loadReferralHistory(referralId: string) {
    setHistoryLoadingId(referralId)
    setHistoryErrorByReferral((prev) => {
      const next = { ...prev }
      delete next[referralId]
      return next
    })
    try {
      const data = await apiGet<{ events: ReferralHistoryEvent[] }>(`/api/referrals/${referralId}/history`)
      setHistoryByReferral((prev) => ({ ...prev, [referralId]: data.events ?? [] }))
    } catch (err) {
      setHistoryErrorByReferral((prev) => ({
        ...prev,
        [referralId]: err instanceof Error ? err.message : 'Failed loading referral history',
      }))
    } finally {
      setHistoryLoadingId(null)
    }
  }

  function toggleReferralHistory(referralId: string) {
    const shouldOpen = !historyOpenByReferral[referralId]
    setHistoryOpenByReferral((prev) => ({ ...prev, [referralId]: shouldOpen }))
    if (shouldOpen && !historyByReferral[referralId]) {
      void loadReferralHistory(referralId)
    }
  }

  if (loading) return (
    <KCard style={{ padding: 28, maxWidth: 400 }}>
      <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', color: 'var(--ink-faint)', margin: 0 }}>Loading HR dashboard…</p>
    </KCard>
  )
  if (!me) return (
    <KCard style={{ padding: 18, maxWidth: 400 }}>
      <p style={{ color: 'var(--signal)', fontSize: 14, margin: 0 }}>Could not load your profile.</p>
    </KCard>
  )
  if (!me.is_hr) return <Navigate to="/map" replace />


  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5, fontFamily: "'IBM Plex Sans'" }}>
          knotify · hr dashboard
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 'clamp(22px, 2.5vw, 34px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: '0 0 5px',
          }}
        >
          HR <span style={{ fontStyle: 'italic', color: 'var(--plum)' }}>control room.</span>
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0 }}>
          Manage companies, jobs, and referral decisions.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* ─── Main grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-3.5">

        {/* Create Company */}
        <KCard style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
            Create company
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Company name', val: companyForm.name, key: 'name' as const, ph: 'Acme GmbH' },
              { label: 'City', val: companyForm.city, key: 'city' as const, ph: 'Munich' },
            ].map(({ label, val, key, ph }) => (
              <div key={key}>
                <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  value={val}
                  onChange={(e) => setCompanyForm((v) => ({ ...v, [key]: e.target.value }))}
                  placeholder={ph}
                  style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <KBtn variant="signal" size="sm" onClick={createCompany}>Create company</KBtn>
          </div>
        </KCard>

        {/* Companies list */}
        <KCard style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
            Your companies · {companies.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {companies.length === 0 && (
              <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No companies yet.</p>
            )}
            {companies.map((co) => (
              <button
                key={co.id}
                type="button"
                onClick={() => switchCompany(co.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: activeCompanyId === co.id ? '0.5px solid rgba(92,42,79,0.3)' : '0.5px solid var(--rule-soft)',
                  background: activeCompanyId === co.id ? 'rgba(92,42,79,0.06)' : 'var(--paper-soft)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.1s',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{co.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                    {co.city ?? 'Unknown'} · {co.confirmedMemberCount} members · {co.openJobsCount} open
                  </div>
                </div>
                {activeCompanyId === co.id && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--plum)', flexShrink: 0 }} />
                )}
              </button>
            ))}
          </div>
        </KCard>
      </div>

      {activeCompanyId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-3.5">

          {/* Create Job */}
          <KCard style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
              Post a job
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Job title', key: 'title' as const, ph: 'Software Engineer' },
                { label: 'Description', key: 'description' as const, ph: 'What the role entails…', multiline: true },
                { label: 'Skills (comma separated)', key: 'requiredSkills' as const, ph: 'React, TypeScript, Node.js' },
                { label: 'Location', key: 'location' as const, ph: 'Munich' },
              ].map(({ label, key, ph, multiline }) => (
                <div key={key}>
                  <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>
                    {label}
                  </label>
                  {multiline ? (
                    <textarea
                      value={jobForm[key]}
                      onChange={(e) => setJobForm((v) => ({ ...v, [key]: e.target.value }))}
                      placeholder={ph}
                      rows={3}
                      style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <input
                      value={jobForm[key]}
                      onChange={(e) => setJobForm((v) => ({ ...v, [key]: e.target.value }))}
                      placeholder={ph}
                      style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  )}
                </div>
              ))}
              {/* Salary range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>
                    Salary min (€/yr)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={jobForm.salaryMin}
                    onChange={(e) => setJobForm((v) => ({ ...v, salaryMin: e.target.value }))}
                    placeholder="e.g. 55000"
                    style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>
                    Salary max (€/yr)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={jobForm.salaryMax}
                    onChange={(e) => setJobForm((v) => ({ ...v, salaryMax: e.target.value }))}
                    placeholder="e.g. 75000"
                    style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={jobForm.isRemote}
                  onChange={(e) => setJobForm((v) => ({ ...v, isRemote: e.target.checked }))}
                />
                Remote position
              </label>
              {jobFormError && (
                <div style={{ fontSize: 12, color: 'var(--signal)', padding: '6px 10px', borderRadius: 8, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)' }}>
                  {jobFormError}
                </div>
              )}
              <KBtn variant="signal" size="sm" onClick={createJob} disabled={jobPosting}>
                {jobPosting ? 'Posting…' : 'Post job'}
              </KBtn>
            </div>
          </KCard>

          {/* Members */}
          <KCard style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
              Team members · {members.length}
            </div>

            {/* Invite */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Search users to invite…"
                style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none' }}
              />
            </div>
            {memberResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                {memberResults.map((u) => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'var(--paper-soft)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{u.full_name} <span style={{ color: 'var(--ink-faint)' }}>@{u.username}</span></span>
                    <KBtn variant="verd" size="sm" onClick={() => { setSelectedMemberId(u.id); void addMember() }}>Invite</KBtn>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
              {members.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                  <KAvatar name={m.user?.full_name} src={null} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.user?.full_name ?? 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>@{m.user?.username}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <KPill color={m.role === 'hr' ? 'plum' : m.role === 'admin' ? 'signal' : 'default'}>
                      {m.role}
                    </KPill>
                    {!m.confirmed && (
                      <KBtn variant="verd" size="sm" onClick={() => confirmMember(m.user_id)}>Confirm</KBtn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </KCard>
        </div>
      )}

      {/* ─── Jobs list ───────────────────────────────────────────────────────── */}
      {activeCompanyId && jobs.length > 0 && (
        <KCard style={{ padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
            Posted jobs · {jobs.length}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {jobs.map((job) => (
              <div
                key={job.id}
                style={{ padding: '12px 14px', borderRadius: 11, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.title}
                  </div>
                  <KPill color={job.status === 'open' ? 'verd' : job.status === 'draft' ? 'ochre' : 'default'}>
                    {job.status}
                  </KPill>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {job.required_skills.slice(0, 3).map((s) => (
                    <span key={s} style={{ padding: '1px 7px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 10.5, color: 'var(--ink-faint)' }}>{s}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {job.status !== 'closed' && (
                    <KBtn variant="ghost" size="sm" onClick={() => updateJobStatus(job.id, 'closed')}>Close</KBtn>
                  )}
                  {job.status === 'draft' && (
                    <KBtn variant="verd" size="sm" onClick={() => updateJobStatus(job.id, 'open')}>Publish</KBtn>
                  )}
                </div>
              </div>
            ))}
          </div>
        </KCard>
      )}

      {/* ─── Referral inbox ──────────────────────────────────────────────────── */}
      {activeCompanyId && (
        <KCard style={{ padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
            Referral inbox · {companyInbox.length}
          </div>

          {companyInbox.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No submitted referrals yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {companyInbox.map((ref) => {
                const deciding = decisionLoadingId === ref.id

                return (
                  <div
                    key={ref.id}
                    style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                          {ref.applicant?.full_name ?? 'Unknown'} → {ref.job?.title ?? 'Unknown job'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                          Referred by: {ref.referrer?.full_name ?? 'Unknown'} · {ref.referrer?.username ? `@${ref.referrer.username}` : ''}
                        </div>
                        {ref.recommendation_text && (
                          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.45 }}>
                            "{ref.recommendation_text}"
                          </div>
                        )}
                        {ref.overall_rating != null && (
                          <div style={{ fontSize: 12, color: 'var(--ochre)', marginTop: 4 }}>
                            {'★'.repeat(ref.overall_rating)}{'☆'.repeat(3 - ref.overall_rating)} overall rating
                          </div>
                        )}
                      </div>
                      <KPill color={
                        ref.status === 'hired' || ref.status === 'converted' ? 'verd' :
                        ref.status === 'interview' ? 'ochre' :
                        ref.status === 'rejected' ? 'signal' : 'default'
                      }>
                        {ref.status.replace('_', ' ')}
                      </KPill>
                    </div>

                    {/* HR note */}
                    <input
                      value={decisionNotes[ref.id] ?? ''}
                      onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [ref.id]: e.target.value }))}
                      placeholder="HR note (optional)…"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'white', fontSize: 13, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
                    />

                    {/* Decision buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <KBtn variant="ghost" size="sm" disabled={deciding} onClick={() => decideReferral(ref.id, 'under_review')}>
                        Under review
                      </KBtn>
                      <KBtn variant="ochre" size="sm" disabled={deciding} onClick={() => decideReferral(ref.id, 'interview')}>
                        Interview
                      </KBtn>
                      <KBtn variant="verd" size="sm" disabled={deciding} onClick={() => decideReferral(ref.id, 'hired')}>
                        Hired
                      </KBtn>
                      <KBtn variant="signal" size="sm" disabled={deciding} onClick={() => decideReferral(ref.id, 'rejected')}>
                        Reject
                      </KBtn>
                      <KBtn variant="ghost" size="sm" onClick={() => toggleReferralHistory(ref.id)}>
                        {historyOpenByReferral[ref.id] ? 'Hide history' : 'History'}
                      </KBtn>
                    </div>

                    {historyOpenByReferral[ref.id] && (
                      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: 'white', border: '0.5px solid var(--rule-soft)' }}>
                        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>History</div>
                        {historyLoadingId === ref.id && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Loading…</div>}
                        {historyErrorByReferral[ref.id] && <div style={{ fontSize: 12, color: 'var(--signal)' }}>{historyErrorByReferral[ref.id]}</div>}
                        {historyByReferral[ref.id]?.map((event) => (
                          <div key={event.id} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{event.event_type.replace('_', ' ')}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                              {new Date(event.created_at).toLocaleString()}
                              {event.actor ? ` · ${event.actor.full_name}` : ''}
                            </div>
                            {event.note && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{event.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </KCard>
      )}
    </div>
  )
}
