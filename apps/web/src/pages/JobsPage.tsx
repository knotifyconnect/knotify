import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { trackEvent } from '../lib/analytics'
import { KAvatar, KBtn, KCard, KPill } from '../lib/knotify'
import { T, DeskPage, DeskHeader, SectionLabel as DeskSectionLabel } from '../lib/desk'
import { GigsPage } from './GigsPage'

type JobListItem = {
  id: string
  company_id: string | null
  apply_url?: string | null
  source?: 'employer' | 'link_share'
  title: string
  description: string
  required_skills: string[]
  location: string
  is_remote: boolean
  salary_min: number | null
  salary_max: number | null
  employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null
  status: 'open' | 'closed' | 'draft'
  created_at: string
  matchScore: number
  matchedRequiredSkills: number
  totalRequiredSkills: number
  saved: boolean
  company: {
    id: string | null
    name: string
    logo_url: string | null
    city: string | null
  } | null
  poster?: { id: string; full_name: string; username: string; avatar_url: string | null } | null
  referral_connections?: Array<{ id: string; full_name: string; username: string; avatar_url: string | null }>
}

type JobLinkDraft = {
  title: string
  companyName: string
  companyLogoUrl: string | null
  location: string | null
  isRemote: boolean
  salaryMin: number | null
  salaryMax: number | null
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null
  requiredSkills: string[]
  description: string
}

type JobDetail = JobListItem & {
  posted_by?: string
  updated_at?: string
  submittedReferrals?: number
}

type CompanyConnection = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
}

type ReferralItem = {
  id: string
  status: 'requested' | 'declined' | 'in_progress' | 'submitted' | 'under_review' | 'interview' | 'rejected' | 'hired' | 'converted'
  applicant_note: string | null
  relationship_type?: 'classmate' | 'colleague' | 'project' | 'other' | null
  relationship_duration?: string | null
  observed_work_directly?: boolean | null
  rating_problem_solving?: number | null
  rating_collaboration?: number | null
  rating_role_relevance?: number | null
  note_problem_solving?: string | null
  note_collaboration?: string | null
  note_role_relevance?: string | null
  overall_rating?: number | null
  recommendation_text?: string | null
  accountability_confirmed?: boolean | null
  hr_decision_note?: string | null
  hr_decision_at?: string | null
  updated_at?: string | null
  submitted_at?: string | null
  created_at: string
  applicant: { id: string; full_name: string; username: string } | null
  referrer: { id: string; full_name: string; username: string } | null
  job: { id: string; title: string } | null
  company: { id: string; name: string } | null
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

type ReferralFormState = {
  relationship_type: 'classmate' | 'colleague' | 'project' | 'other' | ''
  relationship_duration: string
  observed_work_directly: boolean
  rating_problem_solving: 1 | 2 | 3 | 0
  rating_collaboration: 1 | 2 | 3 | 0
  rating_role_relevance: 1 | 2 | 3 | 0
  note_problem_solving: string
  note_collaboration: string
  note_role_relevance: string
  overall_rating: 1 | 2 | 3 | 0
  recommendation_text: string
  accountability_confirmed: boolean
}

function defaultForm(ref: ReferralItem): ReferralFormState {
  return {
    relationship_type: ref.relationship_type ?? '',
    relationship_duration: ref.relationship_duration ?? '',
    observed_work_directly: Boolean(ref.observed_work_directly),
    rating_problem_solving: (ref.rating_problem_solving as 1 | 2 | 3 | null) ?? 0,
    rating_collaboration: (ref.rating_collaboration as 1 | 2 | 3 | null) ?? 0,
    rating_role_relevance: (ref.rating_role_relevance as 1 | 2 | 3 | null) ?? 0,
    note_problem_solving: ref.note_problem_solving ?? '',
    note_collaboration: ref.note_collaboration ?? '',
    note_role_relevance: ref.note_role_relevance ?? '',
    overall_rating: (ref.overall_rating as 1 | 2 | 3 | null) ?? 0,
    recommendation_text: ref.recommendation_text ?? '',
    accountability_confirmed: Boolean(ref.accountability_confirmed),
  }
}

function statusPillColor(status: ReferralItem['status']): 'ochre' | 'verd' | 'signal' | 'default' {
  if (status === 'requested' || status === 'interview') return 'ochre'
  if (status === 'submitted' || status === 'under_review' || status === 'in_progress') return 'verd'
  if (status === 'hired' || status === 'converted') return 'verd'
  if (status === 'declined' || status === 'rejected') return 'signal'
  return 'default'
}

function statusLabel(status: ReferralItem['status']) {
  if (status === 'in_progress') return 'In progress'
  if (status === 'under_review') return 'Under review'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function timelineStages(status: ReferralItem['status']) {
  if (status === 'declined') return ['requested', 'declined']
  if (status === 'rejected') return ['requested', 'in_progress', 'submitted', 'under_review', 'rejected']
  if (status === 'converted') return ['requested', 'in_progress', 'submitted', 'converted']
  if (status === 'hired') return ['requested', 'in_progress', 'submitted', 'under_review', 'interview', 'hired']
  if (status === 'interview') return ['requested', 'in_progress', 'submitted', 'under_review', 'interview']
  if (status === 'under_review') return ['requested', 'in_progress', 'submitted', 'under_review']
  if (status === 'submitted') return ['requested', 'in_progress', 'submitted']
  if (status === 'in_progress') return ['requested', 'in_progress']
  return ['requested']
}

function historyEventTitle(event: ReferralHistoryEvent) {
  const to = event.to_status ? statusLabel(event.to_status as ReferralItem['status']) : 'Unknown'
  if (event.event_type === 'created') return `Request created (${to})`
  if (event.event_type === 'referrer_response') return `Referrer response (${to})`
  if (event.event_type === 'submitted') return `Referral submitted (${to})`
  if (event.event_type === 'hr_decision') return `HR decision (${to})`
  if (event.event_type === 'converted') return `Applicant converted (${to})`
  return `Status updated (${to})`
}

export function JobsPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterRemote, setFilterRemote] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)

  const [showShareForm, setShowShareForm] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareDraft, setShareDraft] = useState<JobLinkDraft | null>(null)
  const [sharePosting, setSharePosting] = useState(false)

  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [connectionsAtCompany, setConnectionsAtCompany] = useState<CompanyConnection[]>([])
  const [selectedReferrerId, setSelectedReferrerId] = useState('')
  const [note, setNote] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [requestMessage, setRequestMessage] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)

  const [pendingReferrals, setPendingReferrals] = useState<ReferralItem[]>([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [respondingId, setRespondingId] = useState<string | null>(null)

  const [inProgressReferrals, setInProgressReferrals] = useState<ReferralItem[]>([])
  const [inProgressLoading, setInProgressLoading] = useState(true)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, ReferralFormState>>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const [myReferrals, setMyReferrals] = useState<ReferralItem[]>([])
  const [myReferralsLoading, setMyReferralsLoading] = useState(true)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [sentReferrals, setSentReferrals] = useState<ReferralItem[]>([])
  const [sentReferralsLoading, setSentReferralsLoading] = useState(true)
  const [historyByReferral, setHistoryByReferral] = useState<Record<string, ReferralHistoryEvent[]>>({})
  const [historyOpenByReferral, setHistoryOpenByReferral] = useState<Record<string, boolean>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null)
  const [historyErrorByReferral, setHistoryErrorByReferral] = useState<Record<string, string>>({})

  const hasConnections = connectionsAtCompany.length > 0

  const selectedReferrer = useMemo(
    () => connectionsAtCompany.find((u) => u.id === selectedReferrerId) ?? null,
    [connectionsAtCompany, selectedReferrerId]
  )
  const sentOutcomeReferrals = useMemo(
    () => sentReferrals.filter((ref) => !['requested', 'in_progress'].includes(ref.status)),
    [sentReferrals]
  )

  async function loadJobs(opts?: { search?: string; type?: string; remote?: string; location?: string }) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ status: 'open' })
      if (opts?.search ?? searchQuery) params.set('search', opts?.search ?? searchQuery)
      if (opts?.type ?? filterType) params.set('type', opts?.type ?? filterType)
      if (opts?.remote ?? filterRemote) params.set('remote', opts?.remote ?? filterRemote)
      if (opts?.location ?? filterLocation) params.set('location', opts?.location ?? filterLocation)
      const data = await apiGet<{ jobs: JobListItem[] }>(`/api/jobs?${params.toString()}`)
      setJobs(data.jobs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  async function loadPendingReferrals() {
    setPendingLoading(true)
    try {
      const data = await apiGet<{ referrals: ReferralItem[] }>('/api/referrals/pending')
      setPendingReferrals(data.referrals ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending referrals')
      setPendingReferrals([])
    } finally {
      setPendingLoading(false)
    }
  }

  async function loadInProgressReferrals() {
    setInProgressLoading(true)
    try {
      const data = await apiGet<{ referrals: ReferralItem[] }>('/api/referrals/in-progress')
      const refs = data.referrals ?? []
      setInProgressReferrals(refs)
      setForms((prev) => {
        const next = { ...prev }
        for (const ref of refs) {
          if (!next[ref.id]) next[ref.id] = defaultForm(ref)
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load in-progress referrals')
      setInProgressReferrals([])
    } finally {
      setInProgressLoading(false)
    }
  }

  async function loadMyReferrals() {
    setMyReferralsLoading(true)
    try {
      const data = await apiGet<{ referrals: ReferralItem[] }>('/api/referrals/received')
      setMyReferrals(data.referrals ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your referral requests')
      setMyReferrals([])
    } finally {
      setMyReferralsLoading(false)
    }
  }

  async function loadSentReferrals() {
    setSentReferralsLoading(true)
    try {
      const data = await apiGet<{ referrals: ReferralItem[] }>('/api/referrals/sent')
      setSentReferrals(data.referrals ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load referrals where you are the referrer')
      setSentReferrals([])
    } finally {
      setSentReferralsLoading(false)
    }
  }

  async function reloadReferralSections() {
    await Promise.all([loadPendingReferrals(), loadInProgressReferrals(), loadMyReferrals(), loadSentReferrals()])
  }

  useEffect(() => {
    void loadJobs()
    void reloadReferralSections()
  }, [])

  // Debounced search
  useEffect(() => {
    const id = window.setTimeout(() => void loadJobs(), 400)
    return () => window.clearTimeout(id)
  }, [searchQuery, filterType, filterRemote, filterLocation])

  async function toggleSave(jobId: string) {
    try {
      const result = await apiPost<{ saved: boolean }>(`/api/jobs/${jobId}/save`, {})
      setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, saved: result.saved } : j))
    } catch { /* ignore */ }
  }

  async function fetchJobDraft() {
    const url = shareUrl.trim()
    if (!url) return
    setShareLoading(true)
    setShareError(null)
    setShareDraft(null)
    try {
      const data = await apiPost<{ draft: JobLinkDraft; sourceUrl: string }>('/api/jobs/parse-link', { url })
      setShareDraft(data.draft)
      setShareUrl(data.sourceUrl)
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not read that job posting')
    } finally {
      setShareLoading(false)
    }
  }

  async function postSharedJob() {
    if (!shareDraft) return
    if (shareDraft.title.trim().length < 2 || shareDraft.companyName.trim().length < 1 || shareDraft.description.trim().length < 20) {
      setShareError('Title, company and a description of at least 20 characters are required.')
      return
    }
    setSharePosting(true)
    setShareError(null)
    try {
      await apiPost('/api/jobs', {
        source: 'link_share',
        applyUrl: shareUrl,
        companyName: shareDraft.companyName.trim(),
        companyLogoUrl: shareDraft.companyLogoUrl ?? undefined,
        title: shareDraft.title.trim(),
        description: shareDraft.description.trim(),
        requiredSkills: shareDraft.requiredSkills,
        location: shareDraft.location ?? undefined,
        isRemote: shareDraft.isRemote,
        salaryMin: shareDraft.salaryMin ?? undefined,
        salaryMax: shareDraft.salaryMax ?? undefined,
      })
      trackEvent('job_link_shared')
      setShowShareForm(false)
      setShareUrl('')
      setShareDraft(null)
      await loadJobs()
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not post this job')
    } finally {
      setSharePosting(false)
    }
  }

  function updateShareDraft(patch: Partial<JobLinkDraft>) {
    setShareDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function employmentTypeLabel(type: string | null) {
    if (!type) return null
    const labels: Record<string, string> = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship', freelance: 'Freelance' }
    return labels[type] ?? type
  }

  async function openJob(jobId: string) {
    setDetailLoading(true)
    setRequestError(null)
    setRequestMessage(null)
    setConnectionsAtCompany([])
    setSelectedReferrerId('')

    try {
      const detail = await apiGet<{ job: JobDetail }>(`/api/jobs/${jobId}`)
      setSelectedJob(detail.job)

      const companyId = detail.job.company_id
      if (companyId) {
        const check = await apiGet<{ users: CompanyConnection[] }>(`/api/referrals/check?companyId=${companyId}`)
        const users = check.users ?? []
        setConnectionsAtCompany(users)
        if (users.length) setSelectedReferrerId(users[0].id)
      }
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to load job details')
    } finally {
      setDetailLoading(false)
    }
  }

  async function requestReferral() {
    if (!selectedJob || !selectedReferrerId) return

    setRequesting(true)
    setRequestError(null)
    setRequestMessage(null)

    try {
      await apiPost('/api/referrals', {
        jobId: selectedJob.id,
        referrerId: selectedReferrerId,
        note: note.trim() || undefined,
      })
      setRequestMessage('Referral request sent successfully.')
      await reloadReferralSections()
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to request referral')
    } finally {
      setRequesting(false)
    }
  }

  async function respondToReferral(referralId: string, accepted: boolean) {
    setRespondingId(referralId)
    setRequestError(null)
    setRequestMessage(null)
    try {
      await apiPatch(`/api/referrals/${referralId}/respond`, { accepted })
      await reloadReferralSections()
      setRequestMessage(accepted ? 'Referral request accepted.' : 'Referral request declined.')
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to respond to referral request')
    } finally {
      setRespondingId(null)
    }
  }

  function updateForm(referralId: string, patch: Partial<ReferralFormState>) {
    setForms((prev) => ({ ...prev, [referralId]: { ...prev[referralId], ...patch } }))
  }

  async function submitReferralForm(referralId: string) {
    const form = forms[referralId]
    if (!form) return

    setSubmittingId(referralId)
    setFormErrors((prev) => {
      const next = { ...prev }
      delete next[referralId]
      return next
    })

    try {
      await apiPatch(`/api/referrals/${referralId}/submit`, {
        relationship_type: form.relationship_type || undefined,
        relationship_duration: form.relationship_duration || undefined,
        observed_work_directly: form.observed_work_directly,
        rating_problem_solving: form.rating_problem_solving || undefined,
        rating_collaboration: form.rating_collaboration || undefined,
        rating_role_relevance: form.rating_role_relevance || undefined,
        note_problem_solving: form.note_problem_solving,
        note_collaboration: form.note_collaboration,
        note_role_relevance: form.note_role_relevance,
        overall_rating: form.overall_rating || undefined,
        recommendation_text: form.recommendation_text,
        accountability_confirmed: form.accountability_confirmed,
      })
      await reloadReferralSections()
      setExpandedFormId(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit referral'
      setFormErrors((prev) => ({ ...prev, [referralId]: message }))
    } finally {
      setSubmittingId(null)
    }
  }

  async function markConverted(referralId: string) {
    setConvertingId(referralId)
    try {
      await apiPatch(`/api/referrals/${referralId}/convert`, {})
      await loadMyReferrals()
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to mark converted')
    } finally {
      setConvertingId(null)
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

  // ─── Section toggle state ─────────────────────────────────────────────────
  const [section, setSection] = useState<'jobs' | 'gigs'>('jobs')

  // ─── Knotify-styled render ─────────────────────────────────────────────────
  const jobsRail = (
    <>
      <div style={{ padding: 16, borderRadius: 14, background: T.ink, color: T.paperSoft }}>
        <DeskSectionLabel>Your referral standing</DeskSectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[['Requests for you', pendingReferrals.length] as const, ['In progress', inProgressReferrals.length] as const, ['Referrals you sent', sentReferrals.length] as const, ['Your requests', myReferrals.length] as const].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: T.inkFaint }}>{k}</span><span style={{ fontWeight: 600, color: T.paperSoft }}>{v}</span></div>
          ))}
        </div>
      </div>
      <div style={{ padding: 16, borderRadius: 14, background: T.ochreSoft, border: `0.5px solid ${T.ochre}`, color: '#6A4E12' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>Every warm role here has someone in your knot who can introduce you. A referral beats a cold application.</div>
      </div>
    </>
  )

  const SectionToggle = () => (
    <div style={{ display: 'inline-flex', background: 'var(--paper-soft,#ede8df)', borderRadius: 999, padding: 3, gap: 2 }}>
      {(['jobs', 'gigs'] as const).map(s => (
        <button key={s} onClick={() => setSection(s)} style={{
          padding: '6px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif",
          background: section === s ? 'var(--paper,#fff)' : 'transparent',
          color: section === s ? 'var(--ink)' : 'var(--ink-faint)',
          boxShadow: section === s ? '0 1px 4px rgba(26,24,21,0.10)' : 'none',
          transition: 'background 0.15s, color 0.15s',
        }}>
          {s === 'jobs' ? 'Jobs' : 'Gigs'}
        </button>
      ))}
    </div>
  )

  if (section === 'gigs') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(16px,4vw,40px) clamp(14px,4vw,40px) 96px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <SectionToggle />
        <GigsPage embedded />
      </div>
    )
  }

  return (
    <div>
      <DeskHeader
        kicker="Jobs & Gigs · peer to peer"
        title={<><span style={{ fontStyle: 'italic' }}>Through people,</span> not job boards.</>}
      />
      <div style={{ padding: '0 clamp(16px,4vw,40px)', marginBottom: 20 }}><SectionToggle /></div>

      {/* ── Global error / success ──────────────────────────────────────────── */}
      {(error || requestError) && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 14 }}>
          {error ?? requestError}
        </div>
      )}
      {requestMessage && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--verd-soft)', border: '0.5px solid rgba(31,107,94,0.2)', color: 'var(--verd)', fontSize: 13, marginBottom: 14 }}>
          {requestMessage}
        </div>
      )}

      <DeskPage rail={jobsRail}>

      {/* ── Referral Inbox ─────────────────────────────────────────────────── */}
      <KCard style={{ padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'" }}>
            Referral inbox {pendingReferrals.length > 0 && `· ${pendingReferrals.length}`}
          </div>
          <KBtn variant="ghost" size="sm" onClick={reloadReferralSections} disabled={pendingLoading || inProgressLoading || myReferralsLoading || sentReferralsLoading}>
            Refresh
          </KBtn>
        </div>

        {pendingLoading ? (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>Loading…</p>
        ) : pendingReferrals.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No pending referral requests for you.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingReferrals.map((ref) => (
              <div
                key={ref.id}
                style={{
                  padding: '13px 15px',
                  borderRadius: 12,
                  background: 'var(--paper-soft)',
                  border: '0.5px solid var(--rule-soft)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                      {ref.applicant?.full_name ?? 'Unknown'} wants a referral for{' '}
                      <span style={{ color: 'var(--signal)' }}>{ref.job?.title ?? 'Unknown job'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                      {ref.company?.name ?? 'Unknown'} · @{ref.applicant?.username ?? 'unknown'}
                    </div>
                    {ref.applicant_note && (
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 5, fontStyle: 'italic' }}>
                        "{ref.applicant_note}"
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <KBtn variant="verd" size="sm" onClick={() => respondToReferral(ref.id, true)} disabled={respondingId === ref.id}>
                    {respondingId === ref.id ? '…' : 'Accept'}
                  </KBtn>
                  <KBtn variant="ghost" size="sm" onClick={() => respondToReferral(ref.id, false)} disabled={respondingId === ref.id}>
                    Decline
                  </KBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </KCard>

      {/* ── In Progress (as referrer) ───────────────────────────────────────── */}
      {(inProgressReferrals.length > 0 || inProgressLoading) && (
        <KCard style={{ padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
            In progress · {inProgressReferrals.length}
          </div>
          {inProgressLoading ? (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inProgressReferrals.map((ref) => {
                const form = forms[ref.id] ?? defaultForm(ref)
                const expanded = expandedFormId === ref.id
                const formError = formErrors[ref.id]
                return (
                  <div
                    key={ref.id}
                    style={{ padding: '13px 15px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: expanded ? 14 : 0 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{ref.job?.title ?? 'Unknown job'}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 1 }}>
                          Applicant: {ref.applicant?.full_name ?? 'Unknown'} · {ref.company?.name ?? 'Unknown'}
                        </div>
                      </div>
                      <KBtn variant="ghost" size="sm" onClick={() => setExpandedFormId(expanded ? null : ref.id)}>
                        {expanded ? 'Hide form' : 'Complete form'}
                      </KBtn>
                    </div>
                    {expanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <select
                            style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'white', fontSize: 13, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)' }}
                            value={form.relationship_type}
                            onChange={(e) => updateForm(ref.id, { relationship_type: e.target.value as ReferralFormState['relationship_type'] })}
                          >
                            <option value="">Relationship type</option>
                            <option value="classmate">Classmate</option>
                            <option value="colleague">Colleague</option>
                            <option value="project">Project partner</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'white', fontSize: 13, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none' }}
                            placeholder="Duration (e.g. 6 months)"
                            value={form.relationship_duration}
                            onChange={(e) => updateForm(ref.id, { relationship_duration: e.target.value })}
                          />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.observed_work_directly} onChange={(e) => updateForm(ref.id, { observed_work_directly: e.target.checked })} />
                          I observed this person's work directly
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          {(['rating_problem_solving', 'rating_collaboration', 'rating_role_relevance'] as const).map((field) => (
                            <select
                              key={field}
                              style={{ padding: '7px 9px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'white', fontSize: 12.5, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)' }}
                              value={form[field]}
                              onChange={(e) => updateForm(ref.id, { [field]: Number(e.target.value) as 0|1|2|3 })}
                            >
                              <option value={0}>{field.replace('rating_', '').replace('_', ' ')}</option>
                              <option value={1}>1, Good fit</option>
                              <option value={2}>2, Strong fit</option>
                              <option value={3}>3, Exceptional</option>
                            </select>
                          ))}
                        </div>
                        {(['note_problem_solving', 'note_collaboration', 'note_role_relevance'] as const).map((field) => (
                          <textarea
                            key={field}
                            style={{ width: '100%', minHeight: 64, padding: '8px 10px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'white', fontSize: 13, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                            placeholder={`${field.replace('note_', '').replace('_', ' ')} (min 20 chars)`}
                            value={form[field]}
                            onChange={(e) => updateForm(ref.id, { [field]: e.target.value.slice(0, 300) })}
                          />
                        ))}
                        <textarea
                          style={{ width: '100%', minHeight: 80, padding: '8px 10px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'white', fontSize: 13, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                          placeholder="Recommendation text (50–280 chars)"
                          value={form.recommendation_text}
                          onChange={(e) => updateForm(ref.id, { recommendation_text: e.target.value.slice(0, 280) })}
                        />
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'right', fontFamily: "'IBM Plex Mono'" }}>
                          {form.recommendation_text.length}/280
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.accountability_confirmed} onChange={(e) => updateForm(ref.id, { accountability_confirmed: e.target.checked })} />
                          I confirm these statements are accurate and I am accountable for them.
                        </label>
                        {formError && <p style={{ fontSize: 12, color: 'var(--signal)', margin: 0 }}>{formError}</p>}
                        <KBtn variant="signal" size="sm" onClick={() => submitReferralForm(ref.id)} disabled={submittingId === ref.id}>
                          {submittingId === ref.id ? 'Submitting…' : 'Submit referral'}
                        </KBtn>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </KCard>
      )}

      {/* ── My referral requests ────────────────────────────────────────────── */}
      {(myReferrals.length > 0 || myReferralsLoading) && (
        <KCard style={{ padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
            My referral requests · {myReferrals.length}
          </div>
          {myReferralsLoading ? (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myReferrals.map((ref) => (
                <div
                  key={ref.id}
                  style={{ padding: '12px 14px', borderRadius: 11, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 1 }}>{ref.job?.title ?? 'Unknown job'}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        Referrer: {ref.referrer?.full_name ?? 'Unknown'} · {ref.company?.name ?? 'Unknown'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <KPill color={statusPillColor(ref.status)}>{statusLabel(ref.status)}</KPill>
                      <KBtn variant="ghost" size="sm" onClick={() => toggleReferralHistory(ref.id)}>
                        {historyOpenByReferral[ref.id] ? 'Hide' : 'History'}
                      </KBtn>
                      {['submitted','under_review','interview','hired'].includes(ref.status) && (
                        <KBtn variant="verd" size="sm" onClick={() => markConverted(ref.id)} disabled={convertingId === ref.id}>
                          {convertingId === ref.id ? '…' : 'Mark converted'}
                        </KBtn>
                      )}
                    </div>
                  </div>
                  {/* Timeline stages */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {timelineStages(ref.status).map((stage, idx, arr) => (
                      <span
                        key={`${ref.id}-${stage}`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          border: `0.5px solid ${idx === arr.length - 1 ? 'var(--signal)' : 'var(--rule-soft)'}`,
                          color: idx === arr.length - 1 ? 'var(--signal)' : 'var(--ink-faint)',
                          background: idx === arr.length - 1 ? 'var(--signal-soft)' : 'transparent',
                          fontFamily: "'IBM Plex Sans'",
                        }}
                      >
                        {statusLabel(stage as ReferralItem['status'])}
                      </span>
                    ))}
                  </div>
                  {ref.hr_decision_note && (
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>HR note: {ref.hr_decision_note}</div>
                  )}
                  {historyOpenByReferral[ref.id] && (
                    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: 'white', border: '0.5px solid var(--rule-soft)' }}>
                      <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>History</div>
                      {historyLoadingId === ref.id && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Loading…</div>}
                      {historyErrorByReferral[ref.id] && <div style={{ fontSize: 12, color: 'var(--signal)' }}>{historyErrorByReferral[ref.id]}</div>}
                      {historyByReferral[ref.id]?.map((event) => (
                        <div key={event.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '0.5px solid var(--rule-soft)' }}>
                          <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{historyEventTitle(event)}</div>
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
              ))}
            </div>
          )}
        </KCard>
      )}

      {/* ── Jobs board ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'" }}>
            Open positions · warm referral required
          </div>
          <KBtn variant="signal" size="sm" onClick={() => setShowShareForm((p) => !p)}>
            {showShareForm ? 'Close' : 'Share a job'}
          </KBtn>
        </div>

        {/* Search + Filters */}
        <div style={{ marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Search jobs by title or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14, color: 'var(--ink)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <option value="">All types</option>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
              <option value="freelance">Freelance</option>
            </select>
            <select value={filterRemote} onChange={(e) => setFilterRemote(e.target.value)} style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <option value="">Remote / On-site</option>
              <option value="true">Remote only</option>
              <option value="false">On-site only</option>
            </select>
            <input
              placeholder="Location…"
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, color: 'var(--ink)', outline: 'none', minWidth: 100 }}
            />
            <button onClick={() => setSavedOnly((p) => !p)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${savedOnly ? 'var(--signal)' : 'var(--rule)'}`, background: savedOnly ? 'rgba(216,68,43,0.08)' : 'var(--paper-soft)', color: savedOnly ? 'var(--signal)' : 'var(--ink)', cursor: 'pointer', fontSize: 13, fontFamily: "'IBM Plex Sans'" }}>
              🔖 Saved
            </button>
          </div>
        </div>

        {showShareForm && (
          <KCard style={{ padding: '18px 20px', marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 4 }}>
              Share a job you found
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '0 0 12px' }}>
              Paste the link to a job posting. We'll pull in the details — you can edit before posting. "Apply" sends people to the original link.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: shareError ? 8 : 0 }}>
              <input
                type="url"
                placeholder="https://company.com/careers/role"
                value={shareUrl}
                onChange={(e) => setShareUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void fetchJobDraft() }}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
              />
              <KBtn variant="signal" size="sm" onClick={fetchJobDraft} disabled={shareLoading || !shareUrl.trim()}>
                {shareLoading ? 'Reading…' : 'Fetch'}
              </KBtn>
            </div>
            {shareError && <div style={{ fontSize: 12.5, color: 'var(--signal)', marginTop: 8 }}>{shareError}</div>}

            {shareDraft && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid var(--rule-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Title</div>
                    <input
                      value={shareDraft.title}
                      onChange={(e) => updateShareDraft({ title: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--rule)', background: 'white', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Company</div>
                    <input
                      value={shareDraft.companyName}
                      onChange={(e) => updateShareDraft({ companyName: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--rule)', background: 'white', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Location</div>
                    <input
                      value={shareDraft.location ?? ''}
                      onChange={(e) => updateShareDraft({ location: e.target.value })}
                      placeholder="Munich"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--rule)', background: 'white', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Type</div>
                    <select
                      value={shareDraft.employmentType ?? ''}
                      onChange={(e) => updateShareDraft({ employmentType: (e.target.value || null) as JobLinkDraft['employmentType'] })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--rule)', background: 'white', fontSize: 13.5, color: 'var(--ink)' }}
                    >
                      <option value="">Not specified</option>
                      <option value="full_time">Full-time</option>
                      <option value="part_time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                      <option value="freelance">Freelance</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', paddingTop: 18 }}>
                    <input type="checkbox" checked={shareDraft.isRemote} onChange={(e) => updateShareDraft({ isRemote: e.target.checked })} />
                    Remote
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Salary min</div>
                    <input
                      type="number"
                      value={shareDraft.salaryMin ?? ''}
                      onChange={(e) => updateShareDraft({ salaryMin: e.target.value ? Number(e.target.value) : null })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--rule)', background: 'white', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Salary max</div>
                    <input
                      type="number"
                      value={shareDraft.salaryMax ?? ''}
                      onChange={(e) => updateShareDraft({ salaryMax: e.target.value ? Number(e.target.value) : null })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--rule)', background: 'white', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Description</div>
                  <textarea
                    value={shareDraft.description}
                    onChange={(e) => updateShareDraft({ description: e.target.value.slice(0, 6000) })}
                    rows={10}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--rule)', background: 'white', fontSize: 13.5, color: 'var(--ink)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif", lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
                  />
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  Applicants will be sent to: {shareUrl}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <KBtn variant="ghost" size="sm" onClick={() => { setShareDraft(null); setShareUrl(''); setShareError(null) }} style={{ flex: 1 }}>
                    Cancel
                  </KBtn>
                  <KBtn variant="signal" size="sm" onClick={postSharedJob} disabled={sharePosting} style={{ flex: 1 }}>
                    {sharePosting ? 'Posting…' : 'Post job'}
                  </KBtn>
                </div>
              </div>
            )}
          </KCard>
        )}

        {loading ? (
          <KCard style={{ padding: 32 }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink-muted)', textAlign: 'center', margin: 0 }}>
              Finding opportunities in your knot…
            </p>
          </KCard>
        ) : jobs.length === 0 ? (
          <KCard style={{ padding: 32 }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink-muted)', textAlign: 'center', margin: 0 }}>
              No open positions yet. Check back soon.
            </p>
          </KCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {(savedOnly ? jobs.filter((j) => j.saved) : jobs).map((job) => (
              <KCard key={job.id} style={{ padding: '18px 20px', cursor: 'pointer', position: 'relative' }} onClick={() => openJob(job.id)}>
                {/* Save button */}
                <button
                  onClick={(e) => { e.stopPropagation(); void toggleSave(job.id) }}
                  style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: job.saved ? 'var(--signal)' : 'var(--ink-faint)', lineHeight: 1 }}
                >
                  {job.saved ? '🔖' : '🏷️'}
                </button>
                {/* Company + title */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, paddingRight: 28 }}>
                  {job.company?.logo_url ? (
                    <img src={job.company.logo_url} alt={job.company.name} style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'contain', border: '0.5px solid var(--rule)', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: "'Fraunces', serif", fontWeight: 500, color: 'var(--ink-muted)', flexShrink: 0 }}>
                      {job.company?.name?.charAt(0) ?? '?'}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{job.company?.name ?? 'Unknown'}</span>
                      <span>·</span>
                      <span>{job.is_remote ? '🌐 Remote' : (job.location || job.company?.city || 'Munich')}</span>
                    </div>
                    {/* Employment type + salary */}
                    <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                      {!job.company_id && (
                        <span style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', fontSize: 11, color: 'var(--ink-faint)' }}>
                          Shared by {job.poster?.full_name ?? 'a member'}
                        </span>
                      )}
                      {job.employment_type && (
                        <span style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', fontSize: 11, color: 'var(--ink-muted)' }}>
                          {employmentTypeLabel(job.employment_type)}
                        </span>
                      )}
                      {(job.salary_min || job.salary_max) && (
                        <span style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--verd-soft)', border: '0.5px solid rgba(31,107,94,0.2)', fontSize: 11, color: 'var(--verd)' }}>
                          {job.salary_min && job.salary_max ? `€${Math.round(job.salary_min/1000)}–${Math.round(job.salary_max/1000)}k` : job.salary_min ? `€${Math.round(job.salary_min/1000)}k+` : `up to €${Math.round((job.salary_max??0)/1000)}k`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Skills */}
                {job.required_skills?.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                    {job.required_skills.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '0.5px solid var(--rule)',
                          fontSize: 11,
                          color: 'var(--ink-muted)',
                          fontFamily: "'IBM Plex Sans'",
                        }}
                      >
                        {s}
                      </span>
                    ))}
                    {job.required_skills.length > 4 && (
                      <span style={{ padding: '2px 8px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 11, color: 'var(--ink-faint)' }}>
                        +{job.required_skills.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {/* Match + CTA */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 10,
                    borderTop: '0.5px solid var(--rule-soft)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'" }}>
                      {job.matchedRequiredSkills}/{job.totalRequiredSkills || 0} skills · {String(job.matchScore)}%
                    </div>
                    {job.salary_min && (
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                        €{Math.round(job.salary_min / 1000)}k{job.salary_max ? `–€${Math.round(job.salary_max / 1000)}k` : '+'}
                      </div>
                    )}
                  </div>
                  <KBtn
                    variant="signal"
                    size="sm"
                    onClick={() => openJob(job.id)}
                  >
                    {job.company_id ? 'Ask for intro' : 'View & apply'}
                  </KBtn>
                </div>
              </KCard>
            ))}
          </div>
        )}
      </div>

      {/* ── Referral Outcomes (as referrer) ────────────────────────────────── */}
      {sentOutcomeReferrals.length > 0 && (
        <KCard style={{ padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 14 }}>
            Referral outcomes · as referrer
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sentOutcomeReferrals.map((ref) => (
              <div
                key={ref.id}
                style={{ padding: '11px 13px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{ref.job?.title ?? 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                      {ref.applicant?.full_name ?? 'Unknown'} · {ref.company?.name ?? 'Unknown'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <KPill color={statusPillColor(ref.status)}>{statusLabel(ref.status)}</KPill>
                    <KBtn variant="ghost" size="sm" onClick={() => toggleReferralHistory(ref.id)}>
                      {historyOpenByReferral[ref.id] ? 'Hide' : 'History'}
                    </KBtn>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {timelineStages(ref.status).map((stage, idx, arr) => (
                    <span
                      key={`${ref.id}-sent-${stage}`}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        border: `0.5px solid ${idx === arr.length - 1 ? 'var(--verd)' : 'var(--rule-soft)'}`,
                        color: idx === arr.length - 1 ? 'var(--verd)' : 'var(--ink-faint)',
                        background: idx === arr.length - 1 ? 'var(--verd-soft)' : 'transparent',
                        fontFamily: "'IBM Plex Sans'",
                      }}
                    >
                      {statusLabel(stage as ReferralItem['status'])}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </KCard>
      )}

      </DeskPage>

      {/* ── Job detail panel ────────────────────────────────────────────────── */}
      {selectedJob && (
        <div
          onClick={() => setSelectedJob(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(26,24,21,0.4)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              height: '100%',
              background: 'var(--paper)',
              boxShadow: '-8px 0 40px rgba(26,24,21,0.14)',
              overflowY: 'auto',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
              <KBtn variant="ghost" size="sm" onClick={() => setSelectedJob(null)}>
                Close ×
              </KBtn>
            </div>

            {detailLoading ? (
              <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', color: 'var(--ink-faint)' }}>Loading…</p>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: 'var(--paper-soft)',
                        border: '0.5px solid var(--rule)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontFamily: "'Fraunces', serif",
                        color: 'var(--ink)',
                      }}
                    >
                      {selectedJob.company?.name?.charAt(0) ?? '?'}
                    </div>
                    <div>
                      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 400, margin: 0, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                        {selectedJob.title}
                      </h2>
                      <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 2 }}>
                        {selectedJob.company?.name ?? 'Unknown'} · {selectedJob.is_remote ? 'Remote' : selectedJob.location || 'Munich'}
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {selectedJob.description}
                  </p>
                </div>

                {(selectedJob.required_skills ?? []).length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
                      Required skills
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selectedJob.required_skills.map((s) => (
                        <span
                          key={s}
                          style={{ padding: '3px 9px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 12, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'" }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedJob.company_id ? (
                  <div
                    style={{
                      padding: '16px 18px',
                      borderRadius: 14,
                      background: 'var(--verd-soft)',
                      border: '0.5px solid rgba(31,107,94,0.2)',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--verd)', marginBottom: 10 }}>
                      Your contact for this one
                    </div>
                    {selectedJob.poster && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <KAvatar name={selectedJob.poster.full_name} src={selectedJob.poster.avatar_url} size={32} />
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{selectedJob.poster.full_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>found and shared this opening</div>
                        </div>
                      </div>
                    )}
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 12px' }}>
                      Ask them what they know before you apply — they can give you context or point you to the right person.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <KBtn
                        variant="signal"
                        size="sm"
                        fullWidth
                        onClick={() => selectedJob.poster && navigate(`/messages?to=${selectedJob.poster.id}`)}
                        disabled={!selectedJob.poster}
                      >
                        Message {selectedJob.poster?.full_name?.split(' ')[0] ?? 'them'}
                      </KBtn>
                      <KBtn
                        variant="ghost"
                        size="sm"
                        fullWidth
                        onClick={() => { trackEvent('job_apply_clicked', { job_id: selectedJob.id, external: true }); window.open(selectedJob.apply_url ?? '#', '_blank', 'noopener,noreferrer') }}
                        disabled={!selectedJob.apply_url}
                      >
                        Apply on original site ↗
                      </KBtn>
                    </div>
                  </div>
                ) : (
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: hasConnections ? 'var(--verd-soft)' : 'var(--paper-soft)',
                    border: `0.5px solid ${hasConnections ? 'rgba(31,107,94,0.2)' : 'var(--rule-soft)'}`,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: hasConnections ? 'var(--verd)' : 'var(--ink-faint)', marginBottom: 8 }}>
                    {hasConnections ? `${connectionsAtCompany.length} connection${connectionsAtCompany.length === 1 ? '' : 's'} at this company` : 'No connections at this company'}
                  </div>

                  {hasConnections ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {connectionsAtCompany.map((u) => (
                          <label
                            key={u.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                          >
                            <input
                              type="radio"
                              name="referrer"
                              value={u.id}
                              checked={selectedReferrerId === u.id}
                              onChange={() => setSelectedReferrerId(u.id)}
                            />
                            <KAvatar name={u.full_name} src={u.avatar_url} size={28} />
                            <span style={{ fontSize: 13, color: 'var(--ink)' }}>{u.full_name}</span>
                          </label>
                        ))}
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
                          Optional note
                        </div>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value.slice(0, 500))}
                          placeholder="Why this role is a fit, what you want highlighted…"
                          style={{
                            width: '100%',
                            minHeight: 88,
                            padding: '9px 12px',
                            borderRadius: 10,
                            border: '0.5px solid var(--rule)',
                            background: 'white',
                            fontSize: 13.5,
                            fontFamily: "'IBM Plex Sans', sans-serif",
                            color: 'var(--ink)',
                            outline: 'none',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'right', marginBottom: 12, fontFamily: "'IBM Plex Mono'" }}>
                          {note.length}/500
                        </div>
                        <KBtn variant="signal" size="sm" fullWidth onClick={requestReferral} disabled={requesting || !selectedReferrerId}>
                          {requesting ? 'Sending…' : 'Request referral'}
                        </KBtn>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
                      Connect with someone at {selectedJob.company?.name ?? 'this company'} first.
                    </p>
                  )}
                </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
