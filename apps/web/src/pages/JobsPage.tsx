import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiDelete, apiGet, apiGetCached, apiPatch, apiPost, getApiCacheSnapshot } from '../lib/api'
import { trackEvent } from '../lib/analytics'
import { KAvatar, KBtn, KCard, KPill } from '../lib/knotify'
import { T, DeskPage, DeskHeader, SectionLabel as DeskSectionLabel } from '../lib/desk'
import { runWhenIdle } from '../lib/schedule'

const GigsPage = lazy(() => import('./GigsPage').then((m) => ({ default: m.GigsPage })))
const DEFAULT_JOBS_PATH = '/api/jobs?status=open'
const REFERRAL_PENDING_PATH = '/api/referrals/pending'
const REFERRAL_IN_PROGRESS_PATH = '/api/referrals/in-progress'
const REFERRAL_RECEIVED_PATH = '/api/referrals/received'
const REFERRAL_SENT_PATH = '/api/referrals/sent'

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
  visibility: 'public' | 'network'
  owned_by_me?: boolean
  network_path_to_poster?: { degree: 1 | 2; via: CompanyConnection | null } | null
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
  connection_context?: {
    direct: CompanyConnection[]
    secondDegree: Array<CompanyConnection & { mutual_connections: CompanyConnection[] }>
  }
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
  capabilities?: JobCapabilities
}

type OwnedJob = {
  id: string; title: string; company_name: string | null; company_id: string | null; source: string
  visibility: 'public' | 'network'; status: 'open' | 'closed' | 'draft'; created_at: string; updated_at: string
  apply_url: string | null; requests: number; pendingRequests: number
}

type OwnedJobRequest = {
  id: string; note: string | null; status: 'pending' | 'accepted' | 'declined' | 'completed'; created_at: string
  requester: { id: string; full_name: string; username: string; avatar_url: string | null } | null
  via: { id: string; full_name: string; username: string; avatar_url: string | null } | null
}

type JobCapabilities = { visibility: boolean; referralRequests: boolean }

type CompanyConnection = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  current_company?: string | null
}

type ReferralItem = {
  id: string
  status: 'requested' | 'declined' | 'in_progress' | 'submitted' | 'under_review' | 'interview' | 'rejected' | 'hired' | 'converted'
  initiated_by: 'applicant' | 'referrer'
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
  if (event.event_type === 'referrer_response') return `Response (${to})`
  if (event.event_type === 'submitted') return `Referral submitted (${to})`
  if (event.event_type === 'hr_decision') return `HR decision (${to})`
  if (event.event_type === 'converted') return `Applicant converted (${to})`
  return `Status updated (${to})`
}

export function JobsPage() {
  const navigate = useNavigate()
  const [pageParams] = useSearchParams()
  const deepLinkedJobId = pageParams.get('job')
  const [jobs, setJobs] = useState<JobListItem[]>(() => getApiCacheSnapshot<{ jobs: JobListItem[] }>(DEFAULT_JOBS_PATH)?.jobs ?? [])
  const [loading, setLoading] = useState(() => !getApiCacheSnapshot<{ jobs: JobListItem[] }>(DEFAULT_JOBS_PATH))
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterRemote, setFilterRemote] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const [brokenLogoIds, setBrokenLogoIds] = useState<Set<string>>(new Set())

  const [showShareForm, setShowShareForm] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareDraft, setShareDraft] = useState<JobLinkDraft | null>(null)
  const [sharePosting, setSharePosting] = useState(false)
  const [shareVisibility, setShareVisibility] = useState<'public' | 'network'>('network')
  const [ownedJobs, setOwnedJobs] = useState<OwnedJob[]>([])
  const [expandedOwnedJobId, setExpandedOwnedJobId] = useState<string | null>(null)
  const [ownedRequests, setOwnedRequests] = useState<Record<string, OwnedJobRequest[]>>({})
  const [managingJobId, setManagingJobId] = useState<string | null>(null)
  const [jobCapabilities, setJobCapabilities] = useState<JobCapabilities>({ visibility: false, referralRequests: false })

  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [connectionsAtCompany, setConnectionsAtCompany] = useState<CompanyConnection[]>([])
  const [selectedReferrerId, setSelectedReferrerId] = useState('')
  const [note, setNote] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [requestMessage, setRequestMessage] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)

  const [offerEligible, setOfferEligible] = useState(false)
  const [offerCandidates, setOfferCandidates] = useState<CompanyConnection[]>([])
  const [selectedOffereeId, setSelectedOffereeId] = useState('')
  const [offerNote, setOfferNote] = useState('')
  const [offering, setOffering] = useState(false)

  const [pendingReferrals, setPendingReferrals] = useState<ReferralItem[]>(() => getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_PENDING_PATH)?.referrals ?? [])
  const [pendingLoading, setPendingLoading] = useState(() => !getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_PENDING_PATH))
  const [respondingId, setRespondingId] = useState<string | null>(null)

  const [inProgressReferrals, setInProgressReferrals] = useState<ReferralItem[]>(() => getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_IN_PROGRESS_PATH)?.referrals ?? [])
  const [inProgressLoading, setInProgressLoading] = useState(() => !getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_IN_PROGRESS_PATH))
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, ReferralFormState>>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const [myReferrals, setMyReferrals] = useState<ReferralItem[]>(() => getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_RECEIVED_PATH)?.referrals ?? [])
  const [myReferralsLoading, setMyReferralsLoading] = useState(() => !getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_RECEIVED_PATH))
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [sentReferrals, setSentReferrals] = useState<ReferralItem[]>(() => getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_SENT_PATH)?.referrals ?? [])
  const [sentReferralsLoading, setSentReferralsLoading] = useState(() => !getApiCacheSnapshot<{ referrals: ReferralItem[] }>(REFERRAL_SENT_PATH))
  const [historyByReferral, setHistoryByReferral] = useState<Record<string, ReferralHistoryEvent[]>>({})
  const [historyOpenByReferral, setHistoryOpenByReferral] = useState<Record<string, boolean>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null)
  const [historyErrorByReferral, setHistoryErrorByReferral] = useState<Record<string, string>>({})
  const skippedInitialFilterLoadRef = useRef(false)
  const openedDeepLinkRef = useRef<string | null>(null)

  const hasConnections = connectionsAtCompany.length > 0
  const secondDegreeAtCompany = selectedJob?.connection_context?.secondDegree ?? []
  const hasCompanyPaths = hasConnections || secondDegreeAtCompany.length > 0

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
      const data = await apiGetCached<{ jobs: JobListItem[]; capabilities?: JobCapabilities }>(`/api/jobs?${params.toString()}`, { ttlMs: 10_000 })
      setJobs(data.jobs ?? [])
      if (data.capabilities) setJobCapabilities(data.capabilities)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  async function loadOwnedJobs() {
    try {
      const data = await apiGet<{ jobs: OwnedJob[]; capabilities?: JobCapabilities }>('/api/jobs/mine')
      setOwnedJobs(data.jobs ?? [])
      if (data.capabilities) setJobCapabilities(data.capabilities)
    } catch { setOwnedJobs([]) }
  }

  async function loadOwnedRequests(jobId: string) {
    try {
      const data = await apiGet<{ requests: OwnedJobRequest[]; available?: boolean }>(`/api/jobs/mine/${jobId}/requests`)
      setOwnedRequests(current => ({ ...current, [jobId]: data.requests ?? [] }))
      if (data.available === false) setJobCapabilities(current => ({ ...current, referralRequests: false }))
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not load referral requests')
    }
  }

  async function updateOwnedJob(jobId: string, patch: { status?: OwnedJob['status']; visibility?: OwnedJob['visibility'] }) {
    setManagingJobId(jobId)
    setRequestError(null)
    try {
      await apiPatch(`/api/jobs/${jobId}`, patch)
      await Promise.all([loadOwnedJobs(), loadJobs()])
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not update this posting')
    } finally { setManagingJobId(null) }
  }

  async function deleteOwnedJob(job: OwnedJob) {
    if (!window.confirm(`Delete “${job.title}”? This also removes its pending referral requests.`)) return
    setManagingJobId(job.id)
    setRequestError(null)
    try {
      await apiDelete(`/api/jobs/${job.id}`)
      await Promise.all([loadOwnedJobs(), loadJobs()])
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not delete this posting')
    } finally { setManagingJobId(null) }
  }

  async function respondToOwnedRequest(jobId: string, requestId: string, status: 'accepted' | 'declined' | 'completed') {
    setRequestError(null)
    try {
      await apiPatch(`/api/jobs/mine/${jobId}/requests/${requestId}`, { status })
      await Promise.all([loadOwnedRequests(jobId), loadOwnedJobs()])
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not update the referral request')
    }
  }

  async function loadPendingReferrals() {
    setPendingLoading(true)
    try {
      const data = await apiGetCached<{ referrals: ReferralItem[] }>(REFERRAL_PENDING_PATH, { ttlMs: 10_000 })
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
      const data = await apiGetCached<{ referrals: ReferralItem[] }>(REFERRAL_IN_PROGRESS_PATH, { ttlMs: 10_000 })
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
      const data = await apiGetCached<{ referrals: ReferralItem[] }>(REFERRAL_RECEIVED_PATH, { ttlMs: 10_000 })
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
      const data = await apiGetCached<{ referrals: ReferralItem[] }>(REFERRAL_SENT_PATH, { ttlMs: 10_000 })
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
    void Promise.all([loadJobs(), loadOwnedJobs()])
    return runWhenIdle(() => void reloadReferralSections(), 1800)
  }, [])

  useEffect(() => {
    if (!deepLinkedJobId || openedDeepLinkRef.current === deepLinkedJobId) return
    openedDeepLinkRef.current = deepLinkedJobId
    void openJob(deepLinkedJobId)
  }, [deepLinkedJobId])

  // Debounced search
  useEffect(() => {
    if (!skippedInitialFilterLoadRef.current) {
      skippedInitialFilterLoadRef.current = true
      return
    }

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
        employmentType: shareDraft.employmentType ?? undefined,
        visibility: jobCapabilities.visibility ? shareVisibility : 'public',
      })
      trackEvent('job_link_shared')
      setShowShareForm(false)
      setShareUrl('')
      setShareDraft(null)
      await Promise.all([loadJobs(), loadOwnedJobs()])
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
    setOfferEligible(false)
    setOfferCandidates([])
    setSelectedOffereeId('')
    setOfferNote('')

    try {
      const listItem = jobs.find((job) => job.id === jobId)
      const companyId = listItem?.company_id ?? null
      // Start all independent requests together. Previously the panel waited
      // for job detail before even beginning its connection/referral checks.
      const checkPromise = companyId
        ? apiGet<{ users: CompanyConnection[] }>(`/api/referrals/check?companyId=${companyId}`)
        : Promise.resolve({ users: [] as CompanyConnection[] })
      const offerPromise = companyId
        ? apiGet<{ eligible: boolean; users: CompanyConnection[] }>(`/api/referrals/offer-check?jobId=${jobId}`)
        : Promise.resolve({ eligible: false, users: [] as CompanyConnection[] })
      const detail = await apiGet<{ job: JobDetail }>(`/api/jobs/${jobId}`)
      setSelectedJob(detail.job)
      if (detail.job.capabilities) setJobCapabilities(detail.job.capabilities)
      setConnectionsAtCompany(detail.job.referral_connections ?? detail.job.connection_context?.direct ?? [])

      if (companyId) {
        const [check, offerCheck] = await Promise.all([checkPromise, offerPromise])
        const users = check.users ?? []
        setConnectionsAtCompany(users)
        if (users.length) setSelectedReferrerId(users[0].id)

        setOfferEligible(offerCheck.eligible)
        const candidates = offerCheck.users ?? []
        setOfferCandidates(candidates)
        if (candidates.length) setSelectedOffereeId(candidates[0].id)
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

  async function requestPosterReferral() {
    if (!selectedJob || selectedJob.owned_by_me) return
    if (!jobCapabilities.referralRequests) {
      setRequestError('Posting-owner referral requests are temporarily unavailable while the database upgrade completes. Direct company referrals still work.')
      return
    }
    setRequesting(true); setRequestError(null); setRequestMessage(null)
    try {
      await apiPost(`/api/jobs/${selectedJob.id}/referral-request`, { note: note.trim() || undefined })
      setRequestMessage('Request sent to the person responsible for this posting.')
      setNote('')
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Could not send your request')
    } finally { setRequesting(false) }
  }

  async function offerReferral() {
    if (!selectedJob || !selectedOffereeId) return

    setOffering(true)
    setRequestError(null)
    setRequestMessage(null)

    try {
      await apiPost('/api/referrals/offer', {
        jobId: selectedJob.id,
        applicantId: selectedOffereeId,
        note: offerNote.trim() || undefined,
      })
      setRequestMessage('Referral offer sent.')
      setOfferNote('')
      setOfferCandidates((prev) => prev.filter((u) => u.id !== selectedOffereeId))
      setSelectedOffereeId((prev) => offerCandidates.find((u) => u.id !== prev)?.id ?? '')
      await reloadReferralSections()
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to send referral offer')
    } finally {
      setOffering(false)
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
    <div className="k-jobs-section-toggle" style={{ display: 'inline-flex', background: 'var(--paper-soft,#ede8df)', borderRadius: 999, padding: 3, gap: 2 }}>
      {(['jobs', 'gigs'] as const).map(s => (
        <button key={s} data-tour={s === 'gigs' ? 'gigs-toggle' : undefined} onClick={() => setSection(s)} style={{
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
        <Suspense fallback={<div style={{ padding: 24, color: 'var(--ink-muted)' }}>Loading gigs...</div>}>
          <GigsPage embedded />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="k-jobs-page">
      <DeskHeader
        kicker="Jobs & Gigs · peer to peer"
        title={<><span style={{ fontStyle: 'italic' }}>Through people,</span> not job boards.</>}
      />
      <div className="k-jobs-toggle-row"><SectionToggle /></div>

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
      {(!jobCapabilities.visibility || !jobCapabilities.referralRequests) && !loading && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--ochre-soft)', border: '0.5px solid rgba(184,130,15,.22)', color: 'var(--ochre)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 }}>
          Jobs are available. Network-only visibility and posting-owner referral requests will activate automatically after the database upgrade; direct company referrals, applications, saving, sharing and posting management remain operational.
        </div>
      )}

      <DeskPage rail={jobsRail}>

      {/* ── Referral Inbox ─────────────────────────────────────────────────── */}
      <div data-tour="referral-inbox">
      <KCard className="k-referral-inbox-card" style={{ padding: '18px 20px', marginBottom: 14 }}>
        <div className="k-referral-inbox-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
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
          <p className="k-referral-inbox-empty" style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No pending referral requests for you.</p>
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
      </div>

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
              {myReferrals.map((ref) => {
                const isOffer = ref.initiated_by === 'referrer'
                const awaitingMyResponse = isOffer && ref.status === 'requested'
                return (
                <div
                  key={ref.id}
                  style={{ padding: '12px 14px', borderRadius: 11, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 1 }}>
                        {awaitingMyResponse ? (
                          <>{ref.referrer?.full_name ?? 'Someone'} offered to refer you for <span style={{ color: 'var(--verd)' }}>{ref.job?.title ?? 'Unknown job'}</span></>
                        ) : (
                          ref.job?.title ?? 'Unknown job'
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        Referrer: {ref.referrer?.full_name ?? 'Unknown'} · {ref.company?.name ?? 'Unknown'}
                      </div>
                      {isOffer && ref.applicant_note && (
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 5, fontStyle: 'italic' }}>
                          "{ref.applicant_note}"
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {!awaitingMyResponse && <KPill color={statusPillColor(ref.status)}>{statusLabel(ref.status)}</KPill>}
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
                  {awaitingMyResponse && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <KBtn variant="verd" size="sm" onClick={() => respondToReferral(ref.id, true)} disabled={respondingId === ref.id}>
                        {respondingId === ref.id ? '…' : 'Accept'}
                      </KBtn>
                      <KBtn variant="ghost" size="sm" onClick={() => respondToReferral(ref.id, false)} disabled={respondingId === ref.id}>
                        Decline
                      </KBtn>
                    </div>
                  )}
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
                )
              })}
            </div>
          )}
        </KCard>
      )}

      {/* ── Jobs board ─────────────────────────────────────────────────────── */}
      <div className="k-jobs-board" style={{ marginBottom: 14 }}>
        <div className="k-jobs-board-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'" }}>
            Open positions · warm referral required
          </div>
          <KBtn
            className="k-job-share-toggle"
            variant="signal"
            size="sm"
            onClick={() => setShowShareForm((p) => !p)}
          >
            {showShareForm ? <><span className="k-job-share-close-desktop">Close</span><span className="k-job-share-close-mobile">Close form</span></> : 'Share a job'}
          </KBtn>
        </div>

        {ownedJobs.length > 0 && (
          <KCard style={{ padding: '16px 18px', marginBottom: 14, border: '1px solid rgba(216,68,43,.22)', background: 'linear-gradient(135deg, rgba(216,68,43,.055), white 60%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 11 }}>
              <div><div style={{ fontSize: 10.5, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--signal)', fontWeight: 700 }}>Your postings</div><div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>These stay at the top for you. Control reach, availability and incoming requests here.</div></div>
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: 'var(--ink)' }}>{ownedJobs.length}</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {ownedJobs.map(job => (
                <div key={job.id} style={{ padding: '11px 12px', borderRadius: 11, background: 'white', border: '0.5px solid var(--rule)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => openJob(job.id)} style={{ flex: 1, minWidth: 190, textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}><div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)' }}>{job.title}</div><div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>{job.status} · {job.visibility === 'network' ? 'Your network only' : 'Public'} · {job.requests} request{job.requests === 1 ? '' : 's'}</div></button>
                    {job.pendingRequests > 0 && <KPill color="signal">{job.pendingRequests} new</KPill>}
                    {jobCapabilities.visibility ? <select aria-label={`Visibility for ${job.title}`} value={job.visibility} disabled={managingJobId === job.id} onChange={event => void updateOwnedJob(job.id, { visibility: event.target.value as OwnedJob['visibility'] })} style={{ padding: '6px 8px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', color: 'var(--ink)', fontSize: 11.5 }}><option value="network">Network only</option><option value="public">Public</option></select> : <KPill color="default">Public</KPill>}
                    <KBtn variant="ghost" size="sm" onClick={() => void updateOwnedJob(job.id, { status: job.status === 'open' ? 'closed' : 'open' })}>{job.status === 'open' ? 'Close' : 'Reopen'}</KBtn>
                    {jobCapabilities.referralRequests && <KBtn variant="ghost" size="sm" onClick={() => { const next = expandedOwnedJobId === job.id ? null : job.id; setExpandedOwnedJobId(next); if (next) void loadOwnedRequests(job.id) }}>Requests</KBtn>}
                    <button type="button" onClick={() => void deleteOwnedJob(job)} style={{ border: 'none', background: 'transparent', color: 'var(--signal)', cursor: 'pointer', fontSize: 11.5 }}>Delete</button>
                  </div>
                  {expandedOwnedJobId === job.id && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--rule-soft)', display: 'grid', gap: 7 }}>
                      {(ownedRequests[job.id] ?? []).map(request => <div key={request.id} style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap', padding: '8px 9px', borderRadius: 9, background: 'var(--paper-soft)' }}><KAvatar name={request.requester?.full_name ?? 'Member'} src={request.requester?.avatar_url} size={28} /><div style={{ flex: 1, minWidth: 160 }}><div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{request.requester?.full_name ?? 'Member'}</div><div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{request.via ? `via ${request.via.full_name}` : 'Direct to you'}{request.note ? ` · ${request.note}` : ''}</div></div><KPill color={request.status === 'pending' ? 'ochre' : request.status === 'accepted' ? 'verd' : 'default'}>{request.status}</KPill>{request.status === 'pending' && <><KBtn variant="verd" size="sm" onClick={() => void respondToOwnedRequest(job.id, request.id, 'accepted')}>Accept</KBtn><KBtn variant="ghost" size="sm" onClick={() => void respondToOwnedRequest(job.id, request.id, 'declined')}>Decline</KBtn></>}</div>)}
                      {(ownedRequests[job.id] ?? []).length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>No referral requests yet.</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </KCard>
        )}

        {/* Search + Filters */}
        <div className="k-jobs-search" style={{ marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Search jobs by title or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14, color: 'var(--ink)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <div className="k-jobs-filter-grid" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <KCard className="k-jobs-share-card" style={{ padding: '18px 20px', marginBottom: 14 }}>
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
                <div className="k-job-share-row">
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

                <div className="k-job-share-row k-job-share-row-with-check">
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
                  <label className="k-job-share-remote" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={shareDraft.isRemote} onChange={(e) => updateShareDraft({ isRemote: e.target.checked })} />
                    Remote
                  </label>
                </div>

                <div className="k-job-share-row">
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

                <div style={{ padding: '12px 13px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)' }}>
                  <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Who should see this?</div>
                  {jobCapabilities.visibility ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                    {([['network', 'My network', 'Only direct and second-degree members, with a visible referral path.'], ['public', 'Public', 'Every Knotify member can discover it and request context from you.']] as const).map(([value, label, detail]) => <label key={value} style={{ padding: '10px 11px', borderRadius: 9, border: `1px solid ${shareVisibility === value ? 'var(--signal)' : 'var(--rule)'}`, background: shareVisibility === value ? 'var(--signal-soft)' : 'white', cursor: 'pointer' }}><input type="radio" name="job-visibility" value={value} checked={shareVisibility === value} onChange={() => setShareVisibility(value)} style={{ marginRight: 7 }} /><strong style={{ fontSize: 12.5, color: 'var(--ink)' }}>{label}</strong><span style={{ display: 'block', margin: '5px 0 0 21px', fontSize: 11, lineHeight: 1.4, color: 'var(--ink-muted)' }}>{detail}</span></label>)}
                  </div> : <div style={{ padding: '9px 10px', borderRadius: 9, background: 'white', color: 'var(--ink-muted)', fontSize: 11.5 }}>This posting will be public. Network-only distribution activates automatically after the database upgrade.</div>}
                </div>

                <div className="k-job-share-actions">
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

        <div className="k-jobs-results">
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
          <div data-tour="jobs-feed" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {(savedOnly ? jobs.filter((j) => j.saved) : jobs).map((job) => (
              <KCard key={job.id} style={{ padding: '18px 20px', cursor: 'pointer', position: 'relative', border: job.owned_by_me ? '1px solid rgba(216,68,43,.35)' : undefined, background: job.owned_by_me ? 'linear-gradient(145deg, rgba(216,68,43,.045), white 55%)' : undefined }} onClick={() => openJob(job.id)}>
                {/* Save button */}
                <button
                  onClick={(e) => { e.stopPropagation(); void toggleSave(job.id) }}
                  style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: job.saved ? 'var(--signal)' : 'var(--ink-faint)', lineHeight: 1 }}
                >
                  {job.saved ? '🔖' : '🏷️'}
                </button>
                {/* Company + title */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, paddingRight: 28 }}>
                  {job.company?.logo_url && !brokenLogoIds.has(job.id) ? (
                    <img
                      src={job.company.logo_url}
                      alt={job.company.name}
                      style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'contain', border: '0.5px solid var(--rule)', flexShrink: 0 }}
                      onError={() => setBrokenLogoIds((prev) => new Set(prev).add(job.id))}
                    />
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
                      {job.owned_by_me && <span style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,.2)', fontSize: 11, color: 'var(--signal)', fontWeight: 650 }}>Your posting · manage</span>}
                      <span style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', fontSize: 11, color: 'var(--ink-faint)' }}>{job.visibility === 'network' ? 'Network only' : 'Public'}</span>
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

                {((job.connection_context?.direct.length ?? 0) + (job.connection_context?.secondDegree.length ?? 0) > 0) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', marginBottom: 12, borderRadius: 10, background: 'var(--verd-soft)', border: '0.5px solid rgba(31,107,94,0.18)' }}>
                    <div style={{ display: 'flex', paddingLeft: 4 }}>
                      {[...(job.connection_context?.direct ?? []), ...(job.connection_context?.secondDegree ?? [])].slice(0, 4).map((person, index) => (
                        <div key={person.id} style={{ marginLeft: index === 0 ? 0 : -7, borderRadius: '50%', border: '2px solid var(--verd-soft)' }}>
                          <KAvatar name={person.full_name} src={person.avatar_url} size={25} />
                        </div>
                      ))}
                    </div>
                    <div style={{ minWidth: 0, fontSize: 11.5, color: 'var(--verd)', lineHeight: 1.35 }}>
                      {(job.connection_context?.direct.length ?? 0) > 0 && (
                        <span>{job.connection_context!.direct.length} direct connection{job.connection_context!.direct.length === 1 ? '' : 's'}</span>
                      )}
                      {(job.connection_context?.direct.length ?? 0) > 0 && (job.connection_context?.secondDegree.length ?? 0) > 0 && <span> · </span>}
                      {(job.connection_context?.secondDegree.length ?? 0) > 0 && (
                        <span>{job.connection_context!.secondDegree.length} second-degree path{job.connection_context!.secondDegree.length === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  </div>
                )}

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
                    {job.owned_by_me ? 'Manage posting' : job.company_id ? 'Ask for intro' : 'View & request path'}
                  </KBtn>
                </div>
              </KCard>
            ))}
          </div>
        )}
        </div>
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
                      {selectedJob.owned_by_me ? 'You own this posting. Manage its reach and incoming requests from Your postings at the top of the page.' : 'Ask them what they know before you apply — they can give you context or point you to the right person.'}
                    </p>
                    {!selectedJob.owned_by_me && <>
                      {jobCapabilities.referralRequests ? <>
                        {selectedJob.network_path_to_poster && <div style={{ marginBottom: 10, fontSize: 11.5, color: 'var(--verd)' }}>{selectedJob.network_path_to_poster.degree === 1 ? `Direct path to ${selectedJob.poster?.full_name ?? 'the poster'}` : `Path via ${selectedJob.network_path_to_poster.via?.full_name ?? 'a mutual connection'} → ${selectedJob.poster?.full_name ?? 'the poster'}`}</div>}
                        <textarea value={note} onChange={event => setNote(event.target.value.slice(0, 500))} placeholder="Why are you interested, and what help would be useful?" rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', marginBottom: 8, borderRadius: 9, border: '0.5px solid var(--rule)', background: 'white', resize: 'vertical', color: 'var(--ink)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12.5 }} />
                        <KBtn variant="verd" size="sm" fullWidth onClick={requestPosterReferral} disabled={requesting}>{requesting ? 'Sending…' : 'Request referral path'}</KBtn>
                      </> : <div style={{ marginBottom: 10, fontSize: 11.5, color: 'var(--ink-muted)' }}>Referral-path requests are temporarily paused. You can still message the person who shared this opening directly.</div>}
                    </>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <KBtn
                        variant="signal"
                        size="sm"
                        fullWidth
                        onClick={() => selectedJob.poster && navigate(`/messages?to=${selectedJob.poster.id}`)}
                        disabled={!selectedJob.poster || selectedJob.owned_by_me}
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
                    background: hasCompanyPaths ? 'var(--verd-soft)' : 'var(--paper-soft)',
                    border: `0.5px solid ${hasCompanyPaths ? 'rgba(31,107,94,0.2)' : 'var(--rule-soft)'}`,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: hasCompanyPaths ? 'var(--verd)' : 'var(--ink-faint)', marginBottom: 8 }}>
                    {hasConnections
                      ? `${connectionsAtCompany.length} direct connection${connectionsAtCompany.length === 1 ? '' : 's'} at this company`
                      : secondDegreeAtCompany.length
                        ? `${secondDegreeAtCompany.length} second-degree path${secondDegreeAtCompany.length === 1 ? '' : 's'} at this company`
                        : 'No connections at this company'}
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
                  ) : secondDegreeAtCompany.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {secondDegreeAtCompany.slice(0, 5).map((person) => {
                        const mutual = person.mutual_connections[0]
                        return (
                          <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <KAvatar name={person.full_name} src={person.avatar_url} size={30} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{person.full_name}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                                {mutual ? `Known through ${mutual.full_name}` : 'Second-degree connection'}
                              </div>
                            </div>
                            {mutual && (
                              <KBtn
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/messages?to=${mutual.id}&draft=${encodeURIComponent(`Could you introduce me to ${person.full_name} regarding the ${selectedJob.title} role at ${selectedJob.company?.name ?? 'their company'}?`)}`)}
                              >
                                Ask {mutual.full_name.split(' ')[0]}
                              </KBtn>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
                      Connect with someone at {selectedJob.company?.name ?? 'this company'} first.
                    </p>
                  )}
                  {!hasConnections && !selectedJob.owned_by_me && jobCapabilities.referralRequests && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--rule)' }}><textarea value={note} onChange={event => setNote(event.target.value.slice(0, 500))} placeholder="Tell the posting owner why this role fits you…" rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', marginBottom: 8, borderRadius: 9, border: '0.5px solid var(--rule)', background: 'white', resize: 'vertical', color: 'var(--ink)', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12.5 }} /><KBtn variant="signal" size="sm" fullWidth onClick={requestPosterReferral} disabled={requesting}>{requesting ? 'Sending…' : secondDegreeAtCompany.length ? 'Forward referral request' : 'Ask posting owner for a path'}</KBtn></div>}
                </div>
                )}

                {offerEligible && (
                  <div
                    style={{
                      padding: '16px 18px',
                      borderRadius: 14,
                      background: 'var(--paper-soft)',
                      border: '0.5px solid var(--rule-soft)',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
                      Know someone for this role?
                    </div>

                    {offerCandidates.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
                        None of your connections are waiting on a referral here.
                      </p>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {offerCandidates.map((u) => (
                            <label
                              key={u.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                            >
                              <input
                                type="radio"
                                name="offeree"
                                value={u.id}
                                checked={selectedOffereeId === u.id}
                                onChange={() => setSelectedOffereeId(u.id)}
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
                            value={offerNote}
                            onChange={(e) => setOfferNote(e.target.value.slice(0, 500))}
                            placeholder="Why you'd vouch for them…"
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
                            {offerNote.length}/500
                          </div>
                          <KBtn variant="verd" size="sm" fullWidth onClick={offerReferral} disabled={offering || !selectedOffereeId}>
                            {offering ? 'Sending…' : 'Refer them'}
                          </KBtn>
                        </div>
                      </>
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
