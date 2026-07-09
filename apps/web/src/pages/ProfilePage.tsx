/**
 * knotify · Profile, own profile with full edit (S2 rework).
 *
 * Sections:
 *  - Hero: avatar, name, headline, bio (500 char), status, stats
 *  - Working on now (latest Pulse update)
 *  - Experience (repeatable entries)
 *  - Education (repeatable entries)
 *  - Skills (curated picker from skill_catalog)
 *  - Languages (multi-select)
 *  - Links (website / GitHub / LinkedIn)
 *  - CV extract → diff preview modal
 *  - Timeline (recent updates)
 *  - Avatar editor
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiGetCached, apiPatch, apiPost, apiPostForm, apiPut } from '../lib/api'
import { trackEvent } from '../lib/analytics'
import { CareerPathCard } from '../components/profile/CareerPathCard'
import { ReferralAskModal } from '../components/ReferralAskModal'
import { KAvatar, KBtn, KCard, KPill, VerifiedBadge } from '../lib/knotify'
import { DeskHeader, Toggle, CredRingDark } from '../lib/desk'
import { AvatarPicker } from '../components/ui/avatar-picker'
import { AvatarGroup } from '../components/ui/avatar-1'
import { avatarUrl } from '../lib/avatar'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  CvImportReviewModal,
  type CvApplyPayload,
  type CvPreview,
  type CvPreviewAnalysis,
  type CvPreviewResponse,
  type CvPreviewSkill,
} from '../components/profile/CvImportReviewModal'
const CV_PREVIEW_TIMEOUT_MS = 45_000

// ─── Types ──────────────────────────────────────────────────────────────────

type Me = {
  id: string
  full_name: string
  username: string
  avatar_url?: string | null
    bio: string | null
  headline: string | null
  location_city: string | null
  university: string | null
  current_company: string | null
  website_url: string | null
  github_url: string | null
  linkedin_url: string | null
  languages: string[]
  status: string
  referral_score: number
  open_to_roles?: boolean
  asks_per_month?: number | null
  can_help_with?: string | null
  is_hr?: boolean
  is_admin?: boolean
  banner_url?: string | null
  profile_layout?: Array<{ id: string; visible: boolean }> | null
}

type EducationEntry = {
  id?: string
  institution: string
  degree: string
  field: string
  start_year: string
  end_year: string
  description: string
}

type ExperienceEntry = {
  id?: string
  company: string
  role: string
  start_date: string
  end_date: string
  description: string
}

type SkillCatalogItem = {
  id: number
  name: string
  category: string
}

type ProfileExtended = {
  education: EducationEntry[]
  experience: ExperienceEntry[]
  skills: Array<{ skill_id: number; name: string; category: string; source: string }>
  languages: string[]
}


type CvApplyResponse = {
  applied: {
    educationInserted: number
    experienceInserted: number
    skillsInserted: number
  }
  user: {
    id: string
    headline: string | null
    bio: string | null
    languages: string[]
  }
  education: Array<{
    id: string
    institution: string
    degree: string | null
    field: string | null
    startYear: number | null
    endYear: number | null
    description: string | null
    sortOrder: number
  }>
  experience: Array<{
    id: string
    company: string
    role: string
    startDate: string | null
    endDate: string | null
    description: string | null
    sortOrder: number
  }>
  skills: CvPreviewSkill[]
}


type ProfileUpdate = {
  id: string
  user_id: string
  content: string
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  'English', 'German', 'French', 'Spanish', 'Italian', 'Portuguese',
  'Mandarin', 'Japanese', 'Korean', 'Arabic', 'Russian', 'Hindi',
  'Dutch', 'Polish', 'Turkish', 'Swedish', 'Norwegian', 'Danish',
]

async function imageFileToDataUrl(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read image file'))
      img.src = objectUrl
    })
    const size = 160
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not available')
    const scale = Math.max(size / image.width, size / image.height)
    const dw = image.width * scale
    const dh = image.height * scale
    ctx.fillStyle = '#F4EFE6'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function statusMeta(status: string) {
  if (status === 'employed') return { label: 'Employed', color: 'verd' as const }
  if (status === 'open_to_work') return { label: 'Open to work', color: 'ochre' as const }
  return { label: 'Studying', color: 'default' as const }
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  if (Number.isNaN(diff) || diff < 0) return value
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(value).toLocaleDateString()
}

function SectionHead({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
        {label}
      </div>
      {action && (
        <button type="button" onClick={onAction} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--signal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
          {action}
        </button>
      )}
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: 9,
  border: '0.5px solid var(--rule)',
  background: 'var(--paper-soft)',
  fontSize: 13.5,
  fontFamily: "'IBM Plex Sans', sans-serif",
  color: 'var(--ink)',
  outline: 'none',
  boxSizing: 'border-box',
}

// Downscale an uploaded image to a JPEG data URL (banners are wide, keep bytes sane).
async function downscaleImage(file: File, maxW: number, quality: number): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = dataUrl
  })
  const scale = Math.min(1, maxW / img.width)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

// A calm branded default banner when the user hasn't uploaded one — reflects rank.
function defaultBanner(tier?: string): string {
  const map: Record<string, string> = {
    'Loose end': 'linear-gradient(120deg, #EBE4D6 0%, #D9D1BF 100%)',
    Overhand: 'linear-gradient(120deg, #F0E0B5 0%, #C8941F 120%)',
    Bowline: 'linear-gradient(120deg, #1F6B5E 0%, #123f38 120%)',
    Masthead: 'linear-gradient(120deg, #1A1815 0%, #5C2A4F 120%)',
  }
  return map[tier ?? ''] ?? 'linear-gradient(120deg, #F4EFE6 0%, #E5D2DD 60%, #C8DDD7 100%)'
}

// Widgets the user can show/hide on their own profile (persisted to profile_layout).
const PROFILE_WIDGETS: { id: string; label: string }[] = [
  { id: 'credibility', label: 'Credibility' },
  { id: 'working', label: 'Working on now' },
  { id: 'asks', label: 'Open asks' },
  { id: 'invite', label: 'Invite link' },
]

// Read-first "add" affordance: a quiet full-width prompt that opens a composer.
const ghostAddStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px dashed var(--rule)',
  background: 'transparent',
  color: 'var(--ink-muted)',
  fontSize: 13.5,
  fontFamily: "'IBM Plex Sans', sans-serif",
  cursor: 'pointer',
}

function fieldLabel(text: string) {
  return (
    <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>
      {text}
    </label>
  )
}

const emptyEdu = (): EducationEntry => ({ institution: '', degree: '', field: '', start_year: '', end_year: '', description: '' })
const emptyExp = (): ExperienceEntry => ({ company: '', role: '', start_date: '', end_date: '', description: '' })

// ─── Main page ───────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const [meId, setMeId] = useState<string | null>(null)

  // Resolve "is this my own profile or someone else's?"
  useEffect(() => {
    if (!userId) return
    apiGetCached<{ user: { id: string } }>('/api/users/me', { ttlMs: 30_000 })
      .then((d) => setMeId(d.user.id))
      .catch(() => setMeId(null))
  }, [userId])

  // If we have a userId param AND it's not my own ID → public view
  if (userId && meId && userId !== meId) {
    return <PublicProfileView userId={userId} />
  }
  // While we don't know yet whether it's me, show public view (safer)
  if (userId && !meId) {
    return <PublicProfileView userId={userId} />
  }

  return <OwnProfileView />
}

function OwnProfileView() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [me, setMe] = useState<Me | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [highlightedProfileSection, setHighlightedProfileSection] = useState<string | null>(null)
  const updatesSectionRef = useRef<HTMLDivElement | null>(null)
  const experienceSectionRef = useRef<HTMLDivElement | null>(null)
  const educationSectionRef = useRef<HTMLDivElement | null>(null)

  // Setup flow state
  const [setupFullName, setSetupFullName] = useState('')
  const [setupUsername, setSetupUsername] = useState('')
  const [setupSaving, setSetupSaving] = useState(false)

  // Avatar
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false)
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Extended profile (edu/exp/skills/languages)
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [experience, setExperience] = useState<ExperienceEntry[]>([])
  const [userSkillIds, setUserSkillIds] = useState<number[]>([])
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalogItem[]>([])
  const [skillsEditOpen, setSkillsEditOpen] = useState(false)

  // Edit-mode drafts for edu/exp
  const [eduEditing, setEduEditing] = useState(false)
  const [eduDraft, setEduDraft] = useState<EducationEntry[]>([])
  const [expEditing, setExpEditing] = useState(false)
  const [expDraft, setExpDraft] = useState<ExperienceEntry[]>([])
  const [extSaving, setExtSaving] = useState(false)

  // Progressive-disclosure composers (read-first: forms appear only on demand)
  const [composingUpdate, setComposingUpdate] = useState(false)
  const [composingAsk, setComposingAsk] = useState(false)

  // Profile widgets that moved here from Home: credibility + invite link + banner.
  const [credibility, setCredibility] = useState<{ score: number; tier: string; next: { name: string; at: number } | null; gigUnlocked: boolean; gigUnlockAt: number; weeklyDelta: number; percentile: number | null } | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [bannerBusy, setBannerBusy] = useState(false)
  const [customizing, setCustomizing] = useState(false)

  useEffect(() => {
    apiGetCached<{ credibility_score: number; tier: string; next_tier: { name: string; at: number } | null; gig_unlocked: boolean; gig_unlock_at: number; weekly_delta?: number; percentile?: number | null }>('/api/quests', { ttlMs: 30_000 })
      .then((r) => setCredibility({ score: r.credibility_score, tier: r.tier, next: r.next_tier, gigUnlocked: r.gig_unlocked, gigUnlockAt: r.gig_unlock_at, weeklyDelta: r.weekly_delta ?? 0, percentile: r.percentile ?? null }))
      .catch(() => {})
    apiGetCached<{ url: string }>('/api/invites/me', { ttlMs: 60_000 }).then((r) => setInviteUrl(r.url)).catch(() => {})
  }, [])

  async function saveBanner(file: File | null) {
    setBannerBusy(true)
    try {
      const bannerUrl = file ? await downscaleImage(file, 1600, 0.82) : null
      const res = await apiPatch<{ user: Me }>('/api/users/me', { bannerUrl })
      setMe((m) => (m ? { ...m, banner_url: res.user.banner_url } : m))
    } catch { /* ignore */ } finally {
      setBannerBusy(false)
    }
  }

  function copyInvite() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
      .then(() => { setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000) })
      .catch(() => {})
  }


  // CV preview/import. Preview data remains in component memory only.
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvExtracting, setCvExtracting] = useState(false)
  const [cvElapsedSeconds, setCvElapsedSeconds] = useState(0)
  const [cvExtractResult, setCvExtractResult] = useState<CvPreview | null>(null)
  const [cvAnalysis, setCvAnalysis] = useState<CvPreviewAnalysis | null>(null)
  const [cvSkills, setCvSkills] = useState<CvPreviewSkill[]>([])
  const [cvError, setCvError] = useState<string | null>(null)
  const cvInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!cvExtracting) {
      setCvElapsedSeconds(0)
      return
    }

    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setCvElapsedSeconds(
        Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
      )
    }, 1000)

    return () => window.clearInterval(timer)
  }, [cvExtracting])

  // Updates (working on now)
  const [updates, setUpdates] = useState<ProfileUpdate[]>([])
  const [updateDraft, setUpdateDraft] = useState('')
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [updatesError, setUpdatesError] = useState<string | null>(null)

  // Open asks
  const [myAsks, setMyAsks] = useState<Array<{ id: string; content: string; created_at: string }>>([])
  const [askDraft, setAskDraft] = useState('')
  const [postingAsk, setPostingAsk] = useState(false)
  const [asksError, setAsksError] = useState<string | null>(null)

  // Connection count for stats
  const [connectionCount, setConnectionCount] = useState(0)

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    apiGetCached<{ connections: Array<{ status: string }> }>('/api/connections', { ttlMs: 10_000 })
      .then((d) => setConnectionCount((d.connections ?? []).filter((c) => c.status === 'accepted').length))
      .catch(() => setConnectionCount(0))
  }, [])


  useEffect(() => {
    apiGetCached<{ user: Me }>('/api/users/me', { ttlMs: 30_000 })
      .then((data) => {
        setMe(data.user)
        setAvatarDraft(data.user.avatar_url ?? null)
        setLoadError(null)
      })
      .catch((err) => {
        setMe(null)
        setLoadError(err instanceof Error ? err.message : 'Failed to load profile')
      })
  }, [])

  useEffect(() => {
    if (!me) return
    void loadExtended()
    void loadMyUpdates()
    void loadMyAsks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  useEffect(() => {
    apiGetCached<{ catalog?: SkillCatalogItem[]; skills?: SkillCatalogItem[] }>('/api/users/skills/catalog', { ttlMs: 5 * 60_000 })
      .then((d) => setSkillCatalog(d.catalog ?? d.skills ?? []))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Failed to load skill catalog:', err)
        setSkillCatalog([])
      })
  }, [])

  async function loadExtended() {
    try {
      const data = await apiGetCached<ProfileExtended>('/api/users/me/profile-extended', { ttlMs: 30_000 })
      setEducation(data.education ?? [])
      setExperience(data.experience ?? [])
      setUserSkillIds((data.skills ?? []).map((s) => s.skill_id))
    } catch { /* ignore */ }
  }

  async function loadMyUpdates() {
    try {
      const data = await apiGetCached<{ updates: ProfileUpdate[] }>('/api/updates?scope=me&limit=8', { ttlMs: 10_000 })
      setUpdates(data.updates ?? [])
    } catch (err) {
      setUpdatesError(err instanceof Error ? err.message : 'Failed loading updates')
    }
  }

  async function loadMyAsks() {
    if (!me?.id) return
    try {
      const data = await apiGetCached<{ asks: Array<{ id: string; content: string; status: string; created_at: string }> }>(`/api/asks/by-user/${me.id}`, { ttlMs: 10_000 })
      setMyAsks((data.asks ?? []).filter((a) => a.status === 'open'))
    } catch { /* non-critical */ }
  }

  async function postAsk() {
    const content = askDraft.trim()
    if (!content) return
    setPostingAsk(true)
    setAsksError(null)
    try {
      await apiPost('/api/asks', { content })
      trackEvent('ask_created')
      setAskDraft('')
      await loadMyAsks()
    } catch (err) {
      setAsksError(err instanceof Error ? err.message : 'Failed posting ask')
    } finally {
      setPostingAsk(false)
    }
  }

  // ── Save profile info ─────────────────────────────────────────────────────

  async function onSave() {
    if (!me) return
    setSaving(true)
    try {
      const data = await apiPatch<{ user: Me }>('/api/users/me', {
        fullName: me.full_name,
        bio: me.bio ?? '',
        headline: me.headline ?? '',
        locationCity: me.location_city ?? '',
        university: me.university ?? '',
        currentCompany: me.current_company ?? '',
        websiteUrl: me.website_url ?? '',
        githubUrl: me.github_url ?? '',
        linkedinUrl: me.linkedin_url ?? '',
        languages: me.languages ?? [],
        openToRoles: me.open_to_roles ?? false,
        asksPerMonth: me.asks_per_month ?? null,
        canHelpWith: me.can_help_with ?? null,
      })
      setMe(data.user)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Avatar ────────────────────────────────────────────────────────────────

  async function onAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); return }
    try {
      setAvatarError(null)
      setAvatarDraft(await imageFileToDataUrl(file))
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not process image')
    } finally { event.target.value = '' }
  }

  async function saveAvatar() {
    if (!me || !avatarDraft || avatarSaving) return
    try {
      setAvatarSaving(true)
      setAvatarError(null)
      const data = await apiPatch<{ user: Me }>('/api/users/me', { avatarUrl: avatarDraft })
      setMe(data.user)
      setAvatarDraft(data.user.avatar_url ?? null)
      setAvatarEditorOpen(false)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not save avatar')
    } finally { setAvatarSaving(false) }
  }

  // ── Education & Experience ────────────────────────────────────────────────

  function scrollToProfileSection(section: 'updates' | 'experience' | 'education') {
    const ref =
      section === 'updates'
        ? updatesSectionRef
        : section === 'experience'
          ? experienceSectionRef
          : educationSectionRef

    setHighlightedProfileSection(section)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        ref.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    })

    window.setTimeout(() => {
      setHighlightedProfileSection((current) => current === section ? null : current)
    }, 1800)
  }

  function startEduEdit() {
    setEduDraft(education.map((e) => ({ ...e })))
    setEduEditing(true)
  }

  function startExpEdit() {
    setExpDraft(experience.map((e) => ({ ...e })))
    setExpEditing(true)
  }

  async function saveEducation() {
    setExtSaving(true)
    try {
      const data = await apiPut<{ education: EducationEntry[] }>('/api/users/me/education', { education: eduDraft })
      setEducation(data.education ?? eduDraft)
      setEduEditing(false)
    } catch { /* ignore */ }
    finally { setExtSaving(false) }
  }

  async function saveExperience() {
    setExtSaving(true)
    try {
      const data = await apiPut<{ experience: ExperienceEntry[] }>('/api/users/me/experience', { experience: expDraft })
      setExperience(data.experience ?? expDraft)
      setExpEditing(false)
    } catch { /* ignore */ }
    finally { setExtSaving(false) }
  }

  // ── Skills ────────────────────────────────────────────────────────────────

  async function saveSkills(skillIds: number[]) {
    try {
      await apiPut('/api/users/me/skills', { skillIds })
      setUserSkillIds(skillIds)
    } catch { /* ignore */ }
  }


  // ── CV preview/import ─────────────────────────────────────────────────────

  async function extractCv() {
    if (!cvFile) return

    setCvExtracting(true)
    setCvError(null)

    try {
      const form = new FormData()
      form.append('cv', cvFile)

      const result = await apiPostForm<CvPreviewResponse>(
        '/api/cv/preview',
        form,
        { timeoutMs: CV_PREVIEW_TIMEOUT_MS }
      )

      const preview = result.preview
      const hasPreview =
        Boolean(preview.headline || preview.bio) ||
        preview.education.length > 0 ||
        preview.experience.length > 0 ||
        preview.skills.length > 0 ||
        preview.languages.length > 0

      if (!hasPreview) {
        setCvAnalysis(result.analysis)
        setCvSkills([])
        setCvError(
          'No profile data could be extracted. Make sure the PDF contains selectable text.'
        )
        return
      }

      setCvExtractResult(preview)
      setCvAnalysis(result.analysis)
      setCvSkills(preview.skills)
    } catch (err) {
      setCvError(
        err instanceof Error ? err.message : 'CV preview failed'
      )
    } finally {
      setCvExtracting(false)
      setCvFile(null)

      if (cvInputRef.current) {
        cvInputRef.current.value = ''
      }
    }
  }

  async function applyCvDiff(payload: CvApplyPayload) {
    setCvError(null)

    try {
      const result = await apiPost<CvApplyResponse>(
        '/api/cv/apply',
        payload
      )

      setMe((current) =>
        current
          ? {
              ...current,
              headline: result.user.headline,
              bio: result.user.bio,
              languages: result.user.languages,
            }
          : current
      )

      setEducation(
        result.education.map((item) => ({
          id: item.id,
          institution: item.institution,
          degree: item.degree ?? '',
          field: item.field ?? '',
          start_year:
            item.startYear === null ? '' : String(item.startYear),
          end_year:
            item.endYear === null ? '' : String(item.endYear),
          description: item.description ?? '',
        }))
      )

      setExperience(
        result.experience.map((item) => ({
          id: item.id,
          company: item.company,
          role: item.role,
          start_date: item.startDate ?? '',
          end_date: item.endDate ?? '',
          description: item.description ?? '',
        }))
      )

      setUserSkillIds(
        result.skills
          .map((skill) => skill.catalogSkillId)
          .filter((id): id is number => typeof id === 'number')
      )

      setCvSkills(
        result.skills.map((skill) => ({
          ...skill,
          matchedCatalog: true,
        }))
      )

      setCvExtractResult(null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'CV import failed'

      setCvError(message)
      throw err
    }
  }

  // ── Updates ───────────────────────────────────────────────────────────────

  async function postUpdate() {
    const content = updateDraft.trim()
    if (!content) return
    setPostingUpdate(true)
    setUpdatesError(null)
    try {
      await apiPost('/api/updates', { content })
      trackEvent('update_posted')
      setUpdateDraft('')
      await loadMyUpdates()
    } catch (err) {
      setUpdatesError(err instanceof Error ? err.message : 'Failed posting update')
    } finally { setPostingUpdate(false) }
  }

  // ─── No profile yet ──────────────────────────────────────────────────────

  if (!me) {
    const needsProfile = (loadError ?? '').includes('[404]')
    return (
      <div style={{ maxWidth: 480, margin: '40px auto' }}>
        <KCard style={{ padding: 28 }}>
          {needsProfile ? (
            <>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', marginBottom: 8, color: 'var(--ink)' }}>
                Complete your profile
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginBottom: 20 }}>
                This account needs a profile to join the knot.
              </p>
              {[
                { label: 'Full name', val: setupFullName, set: setSetupFullName, ph: 'Anna Müller' },
                { label: 'Username', val: setupUsername, set: setSetupUsername, ph: 'anna_m' },
              ].map(({ label, val, set, ph }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 5 }}>{label}</label>
                  <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph} style={{ ...fieldStyle }} />
                </div>
              ))}
              <KBtn variant="signal" size="md" fullWidth disabled={setupSaving} onClick={async () => {
                setSetupSaving(true)
                setLoadError(null)
                try {
                  await apiPost('/api/auth/complete-profile', { fullName: setupFullName.trim(), username: setupUsername.trim(), locationCity: 'Munich', status: 'open_to_work' })
                  const data = await apiGet<{ user: Me }>('/api/users/me')
                  setMe(data.user)
                } catch (err) { setLoadError(err instanceof Error ? err.message : 'Failed to create profile') }
                finally { setSetupSaving(false) }
              }}>
                {setupSaving ? 'Creating…' : 'Join the knot'}
              </KBtn>
              {loadError && <p style={{ fontSize: 12, color: 'var(--signal)', marginTop: 10 }}>{loadError}</p>}
            </>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>{loadError ?? 'Loading profile…'}</p>
          )}
        </KCard>
      </div>
    )
  }

    const pill = statusMeta(me.status)
  const userSkills = skillCatalog.filter((s) => userSkillIds.includes(s.id))
  const profileMeta = [
    me.location_city,
    me.current_company,
    me.university,
  ].filter(Boolean).join(' · ') || `@${me.username}`
  const skillsByCategory = skillCatalog.reduce<Record<string, SkillCatalogItem[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  // Customizable widgets: user can show/hide these (saved to the account).
  const hiddenWidgets = new Set((me.profile_layout ?? []).filter((w) => !w.visible).map((w) => w.id))
  const isWidgetVisible = (id: string) => !hiddenWidgets.has(id)
  // No tabs: everything shows, laid out as a dense two-column dashboard (below).
  const showOverview = true
  const showResume = true
  function toggleWidget(id: string) {
    const next = PROFILE_WIDGETS.map((w) => ({ id: w.id, visible: w.id === id ? hiddenWidgets.has(id) : !hiddenWidgets.has(w.id) }))
    setMe((m) => (m ? { ...m, profile_layout: next } : m))
    apiPatch('/api/users/me', { profileLayout: next }).catch(() => {})
  }

  const profileActions = [
    {
      key: 'customize',
      label: customizing ? 'Done' : 'Customize',
      variant: customizing ? 'signal' as const : 'ghost' as const,
      onClick: () => setCustomizing((c) => !c),
      disabled: false,
    },
    {
      key: 'settings',
      label: 'Settings',
      variant: 'ghost' as const,
      onClick: () => navigate('/settings'),
      disabled: false,
    },
    {
      key: 'public',
      label: 'View as public',
      variant: 'ghost' as const,
      onClick: () => navigate(`/profile/${me.id}`),
      disabled: false,
    },
    {
      key: 'edit',
      label: editMode ? (saving ? 'Saving...' : 'Save profile') : 'Edit profile',
      variant: editMode ? 'signal' as const : 'ink' as const,
      onClick: () => { if (editMode) void onSave(); else setEditMode(true) },
      disabled: saving,
    },
  ]

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gap: isMobile ? 18 : 22 }}>

      {/* ─── Banner + identity (interconnected: avatar overlaps the cover) ─── */}
      <div>
        {/* Cover */}
        <div style={{ position: 'relative', height: isMobile ? 128 : 180, borderRadius: 20, overflow: 'hidden', background: me.banner_url ? `center/cover no-repeat url(${me.banner_url})` : defaultBanner(credibility?.tier), boxShadow: 'var(--lift-1)' }}>
          {!me.banner_url && (
            <>
              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.32) 1px, transparent 1px)', backgroundSize: '22px 22px', opacity: ['Bowline', 'Masthead'].includes(credibility?.tier ?? '') ? 0.5 : 0.32 }} />
              <div style={{ position: 'absolute', left: 20, bottom: 16 }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 15, color: ['Bowline', 'Masthead'].includes(credibility?.tier ?? '') ? 'rgba(255,255,255,0.92)' : 'var(--ink-soft)' }}>
                  {credibility ? `${credibility.tier} · knotting Munich` : 'knotting Munich'}
                </span>
              </div>
            </>
          )}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, background: 'rgba(26,24,21,0.5)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: bannerBusy ? 'wait' : 'pointer', backdropFilter: 'blur(4px)' }}>
              {bannerBusy ? 'Uploading…' : me.banner_url ? 'Change cover' : '＋ Cover photo'}
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={bannerBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void saveBanner(f) }} />
            </label>
            {me.banner_url && (
              <button type="button" onClick={() => void saveBanner(null)} disabled={bannerBusy} aria-label="Remove cover" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(26,24,21,0.5)', color: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1, backdropFilter: 'blur(4px)' }}>✕</button>
            )}
          </div>
        </div>

        {/* Identity — avatar overlaps the cover, actions sit alongside */}
        <div style={{ padding: isMobile ? '0 2px' : '0 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-end', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 14, flexWrap: 'wrap', marginTop: isMobile ? -40 : -52 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={avatarDraft || me.avatar_url || avatarUrl(me.full_name, 160)}
                alt={me.full_name}
                style={{ width: isMobile ? 92 : 116, height: isMobile ? 92 : 116, borderRadius: 30, border: '4px solid var(--paper)', objectFit: 'cover', display: 'block', boxShadow: 'var(--lift-2)' }}
              />
              <button
                type="button"
                onClick={() => setAvatarEditorOpen(true)}
                aria-label="Edit photo"
                style={{ position: 'absolute', right: -6, bottom: -6, border: '2px solid var(--paper)', borderRadius: 999, background: 'var(--signal)', color: 'white', fontSize: 11, fontWeight: 600, padding: '5px 11px', cursor: 'pointer', boxShadow: 'var(--lift-1)' }}
              >
                Edit
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, auto)', gap: 8, width: isMobile ? '100%' : 'auto', paddingBottom: isMobile ? 0 : 4 }}>
              {profileActions.map((action) => (
                <KBtn
                  key={action.key}
                  variant={action.variant}
                  size="sm"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  fullWidth={isMobile}
                  style={{ minHeight: 40, justifyContent: 'center' }}
                >
                  {action.label}
                </KBtn>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.02, fontWeight: 500, letterSpacing: '-0.03em', margin: 0, color: 'var(--ink)' }}>
                {me.full_name}
              </h1>
              <KPill color={pill.color}>{pill.label}</KPill>
            </div>

            {editMode ? (
              <input
                value={me.headline ?? ''}
                onChange={(e) => setMe({ ...me, headline: e.target.value.slice(0, 120) })}
                placeholder="e.g. CS student building AI products"
                style={{ ...fieldStyle, maxWidth: 560 }}
              />
            ) : (
              <p style={{ margin: 0, color: me.headline ? 'var(--ink-soft)' : 'var(--ink-faint)', fontSize: 16, lineHeight: 1.5, maxWidth: 620 }}>
                {me.headline || 'Add a headline so people know what to come to you for.'}
              </p>
            )}

            <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{profileMeta}</div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : 'repeat(3, max-content)', gap: isMobile ? 12 : 22, marginTop: 6 }}>
              {([
                { label: 'connections', value: connectionCount, onClick: () => navigate('/map') },
                { label: 'skills', value: userSkillIds.length, onClick: undefined },
                { label: 'updates', value: updates.length, onClick: undefined },
              ] as { label: string; value: number; onClick?: () => void }[]).map(({ label, value, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: onClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-start', gap: 5, fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{value}</span>
                  <span style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {customizing && (
        <KCard style={{ padding: '18px 20px' }}>
          <SectionHead label="Customize your profile" />
          <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '0 0 12px' }}>Choose which widgets appear on your profile. Saved to your account.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PROFILE_WIDGETS.map((w) => (
              <label key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: '0.5px solid var(--rule-soft)', cursor: 'pointer' }}>
                <span style={{ fontSize: 14, color: 'var(--ink)' }}>{w.label}</span>
                <Toggle on={isWidgetVisible(w.id)} onClick={() => toggleWidget(w.id)} />
              </label>
            ))}
          </div>
        </KCard>
      )}

      {/* Bio */}
      {editMode ? (
        <div>
          <textarea
            value={me.bio ?? ''}
            onChange={(e) => setMe({ ...me, bio: e.target.value.slice(0, 500) })}
            placeholder="Short bio: what are you building, learning, or looking for?"
            rows={3}
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'", marginTop: 3 }}>
            {(me.bio ?? '').length}/500
          </div>
        </div>
      ) : me.bio ? (
        <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0, maxWidth: 720 }}>{me.bio}</p>
      ) : null}

      {/* ─── Dense two-column dashboard of profile widgets ───────────────── */}
      <div className="k-profile-cols" style={editMode ? { columnCount: 1 } : undefined}>

      {/* ─── Credibility widget (moved from Home) ────────────────────────── */}
      {isWidgetVisible('credibility') && credibility && showOverview && (
        <button type="button" onClick={() => navigate('/quests')} style={{ textAlign: 'left', cursor: 'pointer', border: 'none', padding: 22, borderRadius: 18, background: 'var(--ink)', color: 'var(--paper-soft)', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(216,68,43,0.3) 0%, transparent 70%)' }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
            <CredRingDark score={credibility.score} max={credibility.next?.at ?? 120} size={66} label={credibility.tier} sub={`Credibility${credibility.percentile != null ? ` · top ${credibility.percentile}%` : ''}`} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'rgba(250,246,238,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>This week</div>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 20, color: 'var(--ochre)' }}>{credibility.weeklyDelta > 0 ? `+${credibility.weeklyDelta}` : '0'}</div>
            </div>
          </div>
          {credibility.next && (
            <div style={{ marginTop: 16, position: 'relative' }}>
              <div style={{ height: 5, borderRadius: 999, background: 'rgba(250,246,238,0.1)' }}>
                <div style={{ width: `${Math.min(100, Math.round((credibility.score / (credibility.next.at || 1)) * 100))}%`, height: '100%', borderRadius: 999, background: 'var(--ochre)' }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(250,246,238,0.55)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{credibility.next.at - credibility.score} pts to {credibility.next.name}</span>
                <span style={{ color: credibility.gigUnlocked ? '#8fe0ab' : 'rgba(250,246,238,0.45)' }}>{credibility.gigUnlocked ? 'Gigs unlocked' : `Gigs at ${credibility.gigUnlockAt}`}</span>
              </div>
            </div>
          )}
        </button>
      )}
      {/* ─── Edit mode fields ────────────────────────────────────────────────── */}
      {editMode && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Basic info" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
                            { label: 'Full name', key: 'full_name' as const },
              { label: 'City', key: 'location_city' as const },
              { label: 'University', key: 'university' as const },
              { label: 'Current company', key: 'current_company' as const },
              { label: 'Website', key: 'website_url' as const },
              { label: 'GitHub URL', key: 'github_url' as const },
              { label: 'LinkedIn URL', key: 'linkedin_url' as const },
            ] as { label: string; key: keyof Me }[]).map(({ label, key }) => (
              <div key={key} style={{ gridColumn: key === 'full_name' ? 'span 2' : undefined }}>
                {fieldLabel(label)}
                <input
                  value={(me[key] as string | null) ?? ''}
                  onChange={(e) => setMe({ ...me, [key]: e.target.value })}
                  style={{ ...fieldStyle }}
                />
              </div>
            ))}
          </div>

          {/* Languages */}
          <div style={{ marginTop: 14 }}>
            {fieldLabel('Languages')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = (me.languages ?? []).includes(lang)
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      const langs = me.languages ?? []
                      setMe({ ...me, languages: active ? langs.filter((l) => l !== lang) : [...langs, lang] })
                    }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      border: active ? 'none' : '0.5px solid var(--rule)',
                      background: active ? 'var(--ink)' : 'transparent',
                      color: active ? 'var(--paper)' : 'var(--ink-muted)',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}
                  >
                    {lang}
                  </button>
                )
              })}
            </div>
          </div>
        </KCard>
      )}

      {/* ─── Working on now ─────────────────────────────────────────────────── */}
      {isWidgetVisible('working') && showOverview && (
      <div ref={updatesSectionRef} style={{ scrollMarginTop: 96 }}>
      <KCard style={{ padding: '20px 22px', outline: highlightedProfileSection === 'updates' ? '3px solid rgba(216,68,43,0.32)' : 'none', boxShadow: highlightedProfileSection === 'updates' ? '0 0 0 8px rgba(216,68,43,0.08)' : undefined }}>
        <SectionHead label="Working on now" action={updates[0] && !composingUpdate ? 'Post update' : undefined} onAction={() => setComposingUpdate(true)} />
        {composingUpdate ? (
          <div>
            <textarea
              autoFocus
              value={updateDraft}
              onChange={(e) => setUpdateDraft(e.target.value.slice(0, 280))}
              placeholder="New project, certification, internship update…"
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'" }}>{updateDraft.length}/280</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <KBtn variant="ghost" size="sm" onClick={() => setComposingUpdate(false)}>Cancel</KBtn>
                <KBtn variant="signal" size="sm" disabled={!updateDraft.trim() || postingUpdate} onClick={() => { void postUpdate(); setComposingUpdate(false) }}>
                  {postingUpdate ? 'Posting…' : 'Post update'}
                </KBtn>
              </div>
            </div>
            {updatesError && <p style={{ fontSize: 12, color: 'var(--signal)', marginTop: 6 }}>{updatesError}</p>}
          </div>
        ) : updates[0] ? (
          <div>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink)', margin: '0 0 6px' }}>{updates[0].content}</p>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{relativeTime(updates[0].created_at)}</div>
          </div>
        ) : (
          <button type="button" onClick={() => setComposingUpdate(true)} style={ghostAddStyle}>
            + Share what you're working on
          </button>
        )}
      </KCard>
      </div>
      )}

      {/* ─── Open asks ──────────────────────────────────────────────────────── */}
      {isWidgetVisible('asks') && showOverview && (
      <KCard style={{ padding: '20px 22px' }}>
        <SectionHead label="Open asks" action={myAsks.length > 0 && !composingAsk ? 'Post ask' : undefined} onAction={() => setComposingAsk(true)} />
        {myAsks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: composingAsk ? 16 : 0 }}>
            {myAsks.map((a, i) => (
              <div key={a.id} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : '0.5px solid var(--rule-soft)' }}>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink)', margin: '0 0 4px' }}>{a.content}</p>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{relativeTime(a.created_at)}</div>
              </div>
            ))}
          </div>
        )}
        {composingAsk ? (
          <div style={{ marginTop: myAsks.length > 0 ? 0 : 0 }}>
            <textarea
              autoFocus
              value={askDraft}
              onChange={(e) => setAskDraft(e.target.value.slice(0, 300))}
              placeholder="Looking for intros to fintech investors, a senior designer, an advisor…"
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'" }}>{askDraft.length}/300</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <KBtn variant="ghost" size="sm" onClick={() => setComposingAsk(false)}>Cancel</KBtn>
                <KBtn variant="signal" size="sm" disabled={!askDraft.trim() || postingAsk} onClick={() => { void postAsk(); setComposingAsk(false) }}>
                  {postingAsk ? 'Posting…' : 'Post ask'}
                </KBtn>
              </div>
            </div>
            {asksError && <p style={{ fontSize: 12, color: 'var(--signal)', marginTop: 6 }}>{asksError}</p>}
          </div>
        ) : myAsks.length === 0 ? (
          <button type="button" onClick={() => setComposingAsk(true)} style={ghostAddStyle}>
            + Let your network know what you need
          </button>
        ) : null}
      </KCard>
      )}

      {/* ─── Experience / Education / Skills / CV (résumé tab) ──────────────── */}
      {showResume && (<>
      <div ref={experienceSectionRef} style={{ scrollMarginTop: 96 }}>
      <KCard style={{ padding: '18px 20px', marginBottom: 16, outline: highlightedProfileSection === 'experience' ? '3px solid rgba(216,68,43,0.32)' : 'none', boxShadow: highlightedProfileSection === 'experience' ? '0 0 0 8px rgba(216,68,43,0.08)' : undefined }}>
        <SectionHead
          label="Experience"
          action={expEditing ? undefined : 'Edit'}
          onAction={startExpEdit}
        />
        {!expEditing ? (
          experience.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0, fontStyle: 'italic' }}>
              No experience added yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {experience.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--paper-deep)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'var(--ink-faint)', flexShrink: 0 }}>
                    {(e.company[0] ?? '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{e.role}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{e.company}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                      {e.start_date ? e.start_date.slice(0, 7) : ''}{e.end_date ? ` → ${e.end_date.slice(0, 7)}` : e.start_date ? ' → present' : ''}
                    </div>
                    {e.description && <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: '4px 0 0' }}>{e.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
              {expDraft.map((e, i) => (
                <div key={i} style={{ padding: '14px 16px', borderRadius: 10, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', position: 'relative' }}>
                  <button type="button" onClick={() => setExpDraft((d) => d.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 15 }}>×</button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {([['Role *', 'role'], ['Company *', 'company'], ['Start date', 'start_date'], ['End date', 'end_date']] as [string, keyof ExperienceEntry][]).map(([lbl, key]) => (
                      <div key={key}>
                        {fieldLabel(lbl)}
                        <input value={e[key] as string} onChange={(ev) => setExpDraft((d) => d.map((x, j) => j === i ? { ...x, [key]: ev.target.value } : x))} placeholder={key.includes('date') ? 'YYYY-MM' : ''} style={{ ...fieldStyle }} />
                      </div>
                    ))}
                    <div style={{ gridColumn: 'span 2' }}>
                      {fieldLabel('Description')}
                      <textarea value={e.description} onChange={(ev) => setExpDraft((d) => d.map((x, j) => j === i ? { ...x, description: ev.target.value } : x))} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setExpDraft((d) => [...d, emptyExp()])}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px dashed var(--rule)', background: 'transparent', color: 'var(--ink-muted)', fontSize: 13, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}>
                + Add position
              </button>
              <KBtn variant="signal" size="sm" disabled={extSaving} onClick={saveExperience}>
                {extSaving ? 'Saving…' : 'Save experience'}
              </KBtn>
              <KBtn variant="ghost" size="sm" onClick={() => setExpEditing(false)}>Cancel</KBtn>
            </div>
          </div>
        )}
      </KCard>
      </div>

      {/* ─── Education ──────────────────────────────────────────────────────── */}
      <div ref={educationSectionRef} style={{ scrollMarginTop: 96 }}>
      <KCard style={{ padding: '18px 20px', marginBottom: 16, outline: highlightedProfileSection === 'education' ? '3px solid rgba(216,68,43,0.32)' : 'none', boxShadow: highlightedProfileSection === 'education' ? '0 0 0 8px rgba(216,68,43,0.08)' : undefined }}>
        <SectionHead
          label="Education"
          action={eduEditing ? undefined : 'Edit'}
          onAction={startEduEdit}
        />
        {!eduEditing ? (
          education.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0, fontStyle: 'italic' }}>
              No education added yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {education.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--paper-deep)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'var(--ink-faint)', flexShrink: 0 }}>
                    🎓
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{e.institution}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                      {[e.degree, e.field].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                      {e.start_year}{e.end_year ? ` → ${e.end_year}` : ''}
                    </div>
                    {e.description && <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: '4px 0 0' }}>{e.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
              {eduDraft.map((e, i) => (
                <div key={i} style={{ padding: '14px 16px', borderRadius: 10, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', position: 'relative' }}>
                  <button type="button" onClick={() => setEduDraft((d) => d.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 15 }}>×</button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {([['Institution *', 'institution'], ['Degree', 'degree'], ['Field of study', 'field'], ['Start year', 'start_year'], ['End year', 'end_year']] as [string, keyof EducationEntry][]).map(([lbl, key]) => (
                      <div key={key} style={{ gridColumn: key === 'institution' ? 'span 2' : undefined }}>
                        {fieldLabel(lbl)}
                        <input value={e[key] as string} onChange={(ev) => setEduDraft((d) => d.map((x, j) => j === i ? { ...x, [key]: ev.target.value } : x))} placeholder={key.includes('year') ? 'YYYY' : ''} style={{ ...fieldStyle }} />
                      </div>
                    ))}
                    <div style={{ gridColumn: 'span 2' }}>
                      {fieldLabel('Description')}
                      <textarea value={e.description} onChange={(ev) => setEduDraft((d) => d.map((x, j) => j === i ? { ...x, description: ev.target.value } : x))} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setEduDraft((d) => [...d, emptyEdu()])}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px dashed var(--rule)', background: 'transparent', color: 'var(--ink-muted)', fontSize: 13, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}>
                + Add education
              </button>
              <KBtn variant="signal" size="sm" disabled={extSaving} onClick={saveEducation}>
                {extSaving ? 'Saving…' : 'Save education'}
              </KBtn>
              <KBtn variant="ghost" size="sm" onClick={() => setEduEditing(false)}>Cancel</KBtn>
            </div>
          </div>
        )}
      </KCard>
      </div>

      {/* ─── Skills ─────────────────────────────────────────────────────────── */}
      <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
        <SectionHead label="Skills" action="Edit" onAction={() => setSkillsEditOpen((v) => !v)} />

        {/* Current skills */}
        {userSkills.length === 0 && !skillsEditOpen ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '0 0 10px', fontStyle: 'italic' }}>
            No skills added yet. Click Edit to pick from our curated list.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: skillsEditOpen ? 14 : 0 }}>
            {userSkills.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: 'var(--verd-soft)', border: '0.5px solid rgba(31,107,94,0.2)', fontSize: 12, color: 'var(--verd)', fontWeight: 500, fontFamily: "'IBM Plex Sans'" }}>
                {s.name}
                <button type="button" onClick={() => saveSkills(userSkillIds.filter((id) => id !== s.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--verd)', fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Skill picker (by category) */}
        {skillsEditOpen && (
          <div style={{ borderTop: userSkills.length > 0 ? '0.5px solid var(--rule-soft)' : 'none', paddingTop: userSkills.length > 0 ? 14 : 0 }}>
            {skillCatalog.length === 0 ? (
              <div style={{ padding: '16px 14px', borderRadius: 10, background: 'var(--ochre-soft)', border: '0.5px solid rgba(200,148,31,0.22)', fontSize: 13, color: 'var(--ochre)', lineHeight: 1.55 }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>Skill catalog not loaded.</strong>
                The skill catalog is empty, the database migration (<code style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12 }}>018_profile_v2_messages_v2_jobs_v2.sql</code>) may not have been applied yet. Ask the admin to run it.
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginBottom: 10 }}>
                Click to add or remove:
              </div>
            )}
            {Object.entries(skillsByCategory).map(([category, items]) => (
              <div key={category} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
                  {category}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {items.map((s) => {
                    const active = userSkillIds.includes(s.id)
                    return (
                      <button key={s.id} type="button"
                        onClick={() => saveSkills(active ? userSkillIds.filter((id) => id !== s.id) : [...userSkillIds, s.id])}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: active ? 'none' : '0.5px solid var(--rule)',
                          background: active ? 'var(--ink)' : 'transparent',
                          color: active ? 'var(--paper)' : 'var(--ink-muted)',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          fontWeight: active ? 500 : 400,
                          transition: 'all 0.1s',
                        }}
                      >
                        {active ? '✓ ' : ''}{s.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <KBtn variant="ghost" size="sm" onClick={() => setSkillsEditOpen(false)}>Done</KBtn>
          </div>
        )}
      </KCard>

      {/* ─── CV upload + career path suggestions ────────────────────────────── */}
      <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
        <SectionHead label="CV & career paths" />
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Review an editable preview before saving. The PDF and extracted raw text are not stored by this import flow.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '0.5px dashed var(--rule)', background: 'var(--paper-soft)', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v8M3 6l4-4 4 4M2 12h10" stroke="var(--ink-faint)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {cvFile ? cvFile.name : 'Upload CV (PDF)'}
            <input ref={cvInputRef} type="file" accept="application/pdf" onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
          </label>
          <KBtn variant="signal" size="sm" disabled={!cvFile || cvExtracting} onClick={extractCv}>
            {cvExtracting ? 'Analysing…' : 'Upload & analyse'}
          </KBtn>
        </div>
        {cvExtracting && (
          <div style={{ marginTop: 9, fontSize: 11.5, color: 'var(--ink-muted)', lineHeight: 1.45 }}>
            Analysing locally... {cvElapsedSeconds}s. The request stops after 45 seconds and falls back safely when the model is slow.
          </div>
        )}
        {cvError && <p style={{ fontSize: 12, color: 'var(--signal)', marginTop: 8 }}>{cvError}</p>}

        {/* Career path suggestions */}
        {cvAnalysis?.careerPaths && cvAnalysis.careerPaths.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              Suggested career paths
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {cvAnalysis.careerPaths.map((path, idx) => (
                <CareerPathCard key={idx} path={path} />
              ))}
            </div>
          </div>
        )}


        {/* Latest in-memory CV skill preview */}
        {cvSkills.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px solid var(--rule-soft)' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Latest CV skill preview
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cvSkills.map((skill, index) => (
                <span
                  key={String(skill.catalogSkillId ?? 'new') + ':' + skill.name + ':' + index}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: skill.matchedCatalog
                      ? 'var(--verd-soft)'
                      : 'var(--paper-soft)',
                    border: skill.matchedCatalog
                      ? '0.5px solid rgba(31,107,94,0.25)'
                      : '0.5px solid var(--rule)',
                    fontSize: 11.5,
                    color: skill.matchedCatalog
                      ? 'var(--verd)'
                      : 'var(--ink-muted)',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                  title={skill.category}
                >
                  {skill.matchedCatalog ? '✓ ' : ''}
                  {skill.name}
                </span>
              ))}
            </div>

            <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8, fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
              Preview only. Skills are saved only after you approve them in the review window.
            </p>
          </div>
        )}

      </KCard>
      </>)}

      {/* ─── Links ──────────────────────────────────────────────────────────── */}
      {!editMode && showResume && (me.website_url || me.github_url || me.linkedin_url) && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Links" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {me.website_url && (
              <a href={me.website_url.startsWith('http') ? me.website_url : `https://${me.website_url}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'transparent', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', fontFamily: "'IBM Plex Sans'" }}>
                🌐 Website
              </a>
            )}
            {me.github_url && (
              <a href={me.github_url.startsWith('http') ? me.github_url : `https://github.com/${me.github_url}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'transparent', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', fontFamily: "'IBM Plex Sans'" }}>
                ⌥ GitHub
              </a>
            )}
            {me.linkedin_url && (
              <a href={me.linkedin_url.startsWith('http') ? me.linkedin_url : `https://linkedin.com/in/${me.linkedin_url}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'transparent', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', fontFamily: "'IBM Plex Sans'" }}>
                💼 LinkedIn
              </a>
            )}
          </div>
        </KCard>
      )}

      {/* ─── Invite link (moved from Home) ──────────────────────────────────── */}
      {isWidgetVisible('invite') && inviteUrl && showOverview && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Invite your network" />
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>Share your personal link to bring people into Munich's professional graph.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-soft)', borderRadius: 10, border: '0.5px solid var(--rule)', padding: '8px 10px' }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviteUrl}</div>
            <button type="button" onClick={copyInvite} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 8, border: 'none', background: inviteCopied ? 'var(--verd)' : 'var(--ink)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}>
              {inviteCopied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </KCard>
      )}

      {/* ─── Availability & Asks ────────────────────────────────────────────── */}
      {showResume && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Availability" />
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={me.open_to_roles ?? false}
                  onChange={(e) => setMe({ ...me, open_to_roles: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: 'var(--signal)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13.5, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>
                  Open to roles, I'm looking for opportunities
                </span>
              </label>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6, fontFamily: "'IBM Plex Sans'" }}>
                  Asks I can take this month
                </div>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={me.asks_per_month ?? ''}
                  onChange={(e) => setMe({ ...me, asks_per_month: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="e.g. 3"
                  style={{ width: 80, padding: '7px 10px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper)', fontSize: 13.5, color: 'var(--ink)', fontFamily: "'IBM Plex Mono', monospace", outline: 'none' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6, fontFamily: "'IBM Plex Sans'" }}>
                  What I can specifically help with
                </div>
                <textarea
                  value={me.can_help_with ?? ''}
                  onChange={(e) => setMe({ ...me, can_help_with: e.target.value.slice(0, 300) })}
                  placeholder="e.g. Intros at Series A fintech startups, feedback on ML system design, hiring advice for early-stage teams"
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 3, textAlign: 'right' }}>
                  {(me.can_help_with ?? '').length}/300
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {me.open_to_roles && (
                <KPill color="signal">Open to roles</KPill>
              )}
              {(me.asks_per_month ?? 0) > 0 && (
                <div style={{ fontSize: 13.5, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>
                  Taking up to <strong>{me.asks_per_month}</strong> asks this month
                </div>
              )}
              {me.can_help_with && (
                <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.5 }}>
                  {me.can_help_with}
                </div>
              )}
              {!me.open_to_roles && !me.asks_per_month && !me.can_help_with && (
                <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'IBM Plex Sans'" }}>
                  Edit your profile to set your availability and what you can help with.
                </div>
              )}
            </div>
          )}
        </KCard>
      )}

      {/* ─── Timeline (recent updates) ──────────────────────────────────────── */}
      {updates.length > 1 && showOverview && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Timeline" />
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: 'var(--rule-soft)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {updates.map((u) => (
                <div key={u.id} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--paper)', border: '1.5px solid var(--rule)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: '0 0 3px', lineHeight: 1.5 }}>{u.content}</p>
                    <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{relativeTime(u.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </KCard>
      )}

      </div>{/* /k-profile-cols */}

      {/* ─── Avatar editor modal ──────────────────────────────────────────── */}
      {avatarEditorOpen && (
        <div onClick={() => setAvatarEditorOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,24,21,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(3px)' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640, background: 'var(--paper)', borderRadius: 20, padding: 24, boxShadow: '0 24px 80px rgba(26,24,21,0.28)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 400, margin: 0, letterSpacing: '-0.02em' }}>Edit avatar</h2>
                <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '3px 0 0' }}>Pick a style or upload your own photo.</p>
              </div>
              <KBtn variant="ghost" size="sm" onClick={() => setAvatarEditorOpen(false)}>Close</KBtn>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4">
              <AvatarPicker value={avatarDraft} onChange={setAvatarDraft} />
              <div style={{ padding: 14, borderRadius: 14, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>Upload custom</div>
                <input type="file" accept="image/*" onChange={onAvatarFileChange} style={{ width: '100%', fontSize: 12, marginBottom: 14 }} />
                <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Stack preview</div>
                <AvatarGroup
                  members={[
                    { username: me.username, src: avatarDraft || me.avatar_url || avatarUrl(me.full_name, 64) },
                    { username: 'lena', src: avatarUrl('Lena', 64) },
                    { username: 'max', src: avatarUrl('Max', 64) },
                  ]}
                  size={32}
                  limit={3}
                />
              </div>
            </div>
            {avatarError && <p style={{ fontSize: 12, color: 'var(--signal)', marginTop: 10 }}>{avatarError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <KBtn variant="ghost" size="sm" onClick={() => { setAvatarDraft(me.avatar_url ?? null); setAvatarError(null) }} disabled={avatarSaving}>Reset</KBtn>
              <KBtn variant="ghost" size="sm" onClick={() => setAvatarEditorOpen(false)} disabled={avatarSaving}>Cancel</KBtn>
              <KBtn variant="signal" size="sm" onClick={saveAvatar} disabled={!avatarDraft || avatarSaving || avatarDraft === (me.avatar_url ?? null)}>
                {avatarSaving ? 'Saving…' : 'Save avatar'}
              </KBtn>
            </div>
          </div>
        </div>
      )}


      {/* ─── CV review modal ────────────────────────────────────────────────── */}
      {cvExtractResult && (
        <CvImportReviewModal
          result={cvExtractResult}
          analysis={cvAnalysis}
          onApply={applyCvDiff}
          onClose={() => setCvExtractResult(null)}
        />
      )}

    </div>
  )
}

// ─── Public profile view ─────────────────────────────────────────────────────

type PublicUser = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
    bio: string | null
  headline: string | null
  location_city: string | null
  university: string | null
  current_company: string | null
  website_url: string | null
  github_url: string | null
  linkedin_url: string | null
  languages: string[] | null
  status: string
}

type PublicProfile = {
  user: PublicUser
  education: EducationEntry[]
  experience: ExperienceEntry[]
  skills: Array<{ skill_id: number; name: string; category: string }>
}

type ConnectionRow = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
}

function PublicProfileView({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [relation, setRelation] = useState<'none' | 'pending_out' | 'pending_in' | 'connected'>('none')
  const [pending, setPending] = useState(false)
  const [posts, setPosts] = useState<Array<{ id: string; title: string | null; body: string; created_at: string }>>([])
  const [referralModalOpen, setReferralModalOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    apiGet<PublicProfile>(`/api/users/public/${userId}`)
      .then((d) => { if (mounted) { setData(d); setErr(null) } })
      .catch((e) => { if (mounted) setErr(e instanceof Error ? e.message : 'Failed to load profile') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [userId])

  // Resolve connection state
  useEffect(() => {
    let mounted = true
    Promise.all([
      apiGet<{ user: { id: string } }>('/api/users/me'),
      apiGet<{ connections: ConnectionRow[] }>('/api/connections'),
    ]).then(([me, cx]) => {
      if (!mounted) return
      const conn = (cx.connections ?? []).find(
        (c) => (c.requester_id === userId && c.addressee_id === me.user.id) || (c.addressee_id === userId && c.requester_id === me.user.id)
      )
      if (!conn) return setRelation('none')
      if (conn.status === 'accepted') return setRelation('connected')
      if (conn.status === 'pending') return setRelation(conn.requester_id === me.user.id ? 'pending_out' : 'pending_in')
    }).catch(() => { /* ignore */ })
    return () => { mounted = false }
  }, [userId])

  // Latest posts by this user
  useEffect(() => {
    let mounted = true
    apiGet<{ posts: Array<{ id: string; title: string | null; body: string; created_at: string }> }>(`/api/posts?scope=all&limit=10`)
      .then((d) => {
        if (!mounted) return
        // We only want posts by this user, filter client-side since the route doesn't have a "by user" filter
        const filtered = (d.posts ?? []).filter((p: any) => p.author_id === userId).slice(0, 3)
        setPosts(filtered)
      }).catch(() => { /* ignore */ })
    return () => { mounted = false }
  }, [userId])

  async function connect() {
    setPending(true)
    try {
      await apiPost('/api/connections', { addresseeId: userId })
      trackEvent('connection_requested')
      setRelation('pending_out')
    } catch { /* ignore */ }
    finally { setPending(false) }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: '40px auto', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', color: 'var(--ink-muted)' }}>Loading profile…</p>
      </div>
    )
  }
  if (err || !data) {
    return (
      <div style={{ maxWidth: 540, margin: '60px auto' }}>
        <KCard style={{ padding: 28, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>{err ?? 'User not found.'}</p>
          <div style={{ marginTop: 14 }}>
            <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Back to Discover</KBtn>
          </div>
        </KCard>
      </div>
    )
  }

  const u = data.user
  const pill = statusMeta(u.status)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Hero */}
      <KCard style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: 72, background: 'linear-gradient(135deg, var(--ink) 0%, #2d2820 100%)' }} />
        <div style={{ padding: '0 24px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -32, marginBottom: 14 }}>
            <img
              src={u.avatar_url || avatarUrl(u.full_name, 160)}
              alt={u.full_name}
              style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid var(--paper)', objectFit: 'cover', display: 'block' }}
            />
            {referralModalOpen && data && (
              <ReferralAskModal
                peer={{ id: userId, full_name: u.full_name, username: u.username, avatar_url: u.avatar_url, headline: u.headline, current_company: u.current_company }}
                onClose={() => setReferralModalOpen(false)}
              />
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {relation === 'connected' && <KPill color="verd">✓ Connected</KPill>}
              {relation === 'pending_out' && <KBtn variant="ghost" size="sm" disabled>Request sent</KBtn>}
              {relation === 'pending_in' && <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Accept in Discover</KBtn>}
              {relation === 'none' && (
                <KBtn variant="signal" size="sm" disabled={pending} onClick={connect}>
                  {pending ? '…' : '+ Connect'}
                </KBtn>
              )}
              <KBtn variant="ghost" size="sm" onClick={() => navigate(`/messages?to=${u.id}`)}>Message</KBtn>
              {relation === 'connected' && (
                <KBtn variant="signal" size="sm" onClick={() => setReferralModalOpen(true)}>
                  Ask for referral
                </KBtn>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', margin: 0, color: 'var(--ink)' }}>
                {u.full_name}
              </h1>
              <VerifiedBadge size={16} />
              <KPill color={pill.color}>{pill.label}</KPill>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 6 }}>
                            @{u.username} · {[u.location_city, u.current_company ?? u.university].filter(Boolean).join(' · ') || 'knotify'}
            </div>
            {u.headline && (
              <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 6, fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
                {u.headline}
              </div>
            )}
            {u.bio && <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, margin: 0 }}>{u.bio}</p>}
          </div>

          {/* Links */}
          {(u.website_url || u.github_url || u.linkedin_url) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 12, borderTop: '0.5px solid var(--rule-soft)' }}>
              {u.website_url && (
                <a href={u.website_url.startsWith('http') ? u.website_url : `https://${u.website_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '5px 11px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 12, color: 'var(--ink)', textDecoration: 'none' }}>🌐 Website</a>
              )}
              {u.github_url && (
                <a href={u.github_url.startsWith('http') ? u.github_url : `https://github.com/${u.github_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '5px 11px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 12, color: 'var(--ink)', textDecoration: 'none' }}>⌥ GitHub</a>
              )}
              {u.linkedin_url && (
                <a href={u.linkedin_url.startsWith('http') ? u.linkedin_url : `https://linkedin.com/in/${u.linkedin_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '5px 11px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 12, color: 'var(--ink)', textDecoration: 'none' }}>💼 LinkedIn</a>
              )}
            </div>
          )}
        </div>
      </KCard>
{/* Experience */}
      {data.experience.length > 0 && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Experience" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.experience.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--paper-deep)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'var(--ink-faint)', flexShrink: 0 }}>
                  {(e.company[0] ?? '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{e.role}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{e.company}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                    {e.start_date ? String(e.start_date).slice(0, 7) : ''}{e.end_date ? ` → ${String(e.end_date).slice(0, 7)}` : e.start_date ? ' → present' : ''}
                  </div>
                  {e.description && <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: '4px 0 0' }}>{e.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </KCard>
      )}
{/* Education */}
      {data.education.length > 0 && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Education" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.education.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--paper-deep)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🎓</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{e.institution}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{[e.degree, e.field].filter(Boolean).join(' · ')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                    {e.start_year}{e.end_year ? ` → ${e.end_year}` : ''}
                  </div>
                  {e.description && <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: '4px 0 0' }}>{e.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </KCard>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Skills" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.skills.map((s) => (
              <span key={s.skill_id} style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--verd-soft)', border: '0.5px solid rgba(31,107,94,0.2)', fontSize: 12, color: 'var(--verd)', fontWeight: 500 }}>
                {s.name}
              </span>
            ))}
          </div>
        </KCard>
      )}

      {/* Languages */}
      {u.languages && u.languages.length > 0 && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Languages" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {u.languages.map((lang) => (
              <span key={lang} style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', fontSize: 12, color: 'var(--ink)' }}>{lang}</span>
            ))}
          </div>
        </KCard>
      )}

      {/* Recent posts */}
      {posts.length > 0 && (
        <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
          <SectionHead label="Recent on Pulse" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map((p) => (
              <div key={p.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                {p.title && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{p.title}</div>}
                <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
                  {p.body.length > 200 ? p.body.slice(0, 200) + '…' : p.body}
                </p>
                <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>{relativeTime(p.created_at)}</div>
              </div>
            ))}
          </div>
        </KCard>
      )}
    </div>
  )
}
