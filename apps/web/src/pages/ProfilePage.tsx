/**
 * knotify · Profile — own profile with full edit (S2 rework).
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
import { apiGet, apiPatch, apiPost, apiPostForm, apiPut } from '../lib/api'
import { CareerPathCard } from '../components/profile/CareerPathCard'
import { KAvatar, KBtn, KCard, KPill, VerifiedBadge } from '../lib/knotify'
import { AvatarPicker } from '../components/ui/avatar-picker'
import { AvatarGroup } from '../components/ui/avatar-1'
import { avatarUrl } from '../lib/avatar'

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
  is_hr?: boolean
  is_admin?: boolean
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

type CvExtractResult = {
  education: EducationEntry[]
  experience: ExperienceEntry[]
  skillIds: number[]
  skillNames?: string[]
  bio: string | null
  headline: string | null
  languages?: string[]
}

type CareerPath = {
  title?: string
  description?: string
  matchScore?: number
  skillGaps?: Array<{ skill?: string; priority?: string }>
}

type CvAnalysis = {
  id: string
  career_paths: CareerPath[]
  extracted_skills: Array<{ name?: string; category?: string; confidence?: string }>
  analysis_status: string
  created_at: string
}

type CvSkill = {
  id: string
  name: string
  category: string | null
  is_verified: boolean
  source: string
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {label}
      </div>
      {action && (
        <button type="button" onClick={onAction} style={{ fontSize: 12, color: 'var(--signal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
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
    apiGet<{ user: { id: string } }>('/api/users/me')
      .then((d) => setMeId(d.user.id))
      .catch(() => setMeId(null))
  }, [])

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
  const [me, setMe] = useState<Me | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)

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

  // CV extract
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvExtracting, setCvExtracting] = useState(false)
  const [cvExtractResult, setCvExtractResult] = useState<CvExtractResult | null>(null)
  const [cvError, setCvError] = useState<string | null>(null)
  const cvInputRef = useRef<HTMLInputElement>(null)
  // Legacy CV analysis (career paths + cv-extracted skills from /api/cv/upload)
  const [cvAnalysis, setCvAnalysis] = useState<CvAnalysis | null>(null)
  const [cvSkills, setCvSkills] = useState<CvSkill[]>([])

  // Updates (working on now)
  const [updates, setUpdates] = useState<ProfileUpdate[]>([])
  const [updateDraft, setUpdateDraft] = useState('')
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [updatesError, setUpdatesError] = useState<string | null>(null)

  // Connection count for stats
  const [connectionCount, setConnectionCount] = useState(0)

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    apiGet<{ connections: Array<{ status: string }> }>('/api/connections')
      .then((d) => setConnectionCount((d.connections ?? []).filter((c) => c.status === 'accepted').length))
      .catch(() => setConnectionCount(0))
  }, [])

  // Load any existing CV analysis (career paths + cv-extracted skills)
  useEffect(() => {
    apiGet<{ analysis: CvAnalysis | null; skills: CvSkill[] }>('/api/cv/analysis')
      .then((d) => { setCvAnalysis(d.analysis ?? null); setCvSkills(d.skills ?? []) })
      .catch(() => { /* no analysis yet, fine */ })
  }, [])

  useEffect(() => {
    apiGet<{ user: Me }>('/api/users/me')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  useEffect(() => {
    apiGet<{ catalog?: SkillCatalogItem[]; skills?: SkillCatalogItem[] }>('/api/users/skills/catalog')
      .then((d) => setSkillCatalog(d.catalog ?? d.skills ?? []))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Failed to load skill catalog:', err)
        setSkillCatalog([])
      })
  }, [])

  async function loadExtended() {
    try {
      const data = await apiGet<ProfileExtended>('/api/users/me/profile-extended')
      setEducation(data.education ?? [])
      setExperience(data.experience ?? [])
      setUserSkillIds((data.skills ?? []).map((s) => s.skill_id))
    } catch { /* ignore */ }
  }

  async function loadMyUpdates() {
    try {
      const data = await apiGet<{ updates: ProfileUpdate[] }>('/api/updates?scope=me&limit=8')
      setUpdates(data.updates ?? [])
    } catch (err) {
      setUpdatesError(err instanceof Error ? err.message : 'Failed loading updates')
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

  // ── CV extract ────────────────────────────────────────────────────────────

  // Upload CV → original multipart endpoint → career paths + cv-extracted skills.
  // Refreshes profile-extended so any auto-filled fields show up right away.
  async function extractCv() {
    if (!cvFile) return
    setCvExtracting(true)
    setCvError(null)
    try {
      const form = new FormData()
      form.append('cv', cvFile)
      const result = await apiPostForm<{
        analysisId: string
        analysis: {
          careerPaths: CareerPath[]
          extractedSkills: Array<{ name?: string; category?: string }>
          summary?: string
          profileExtract?: {
            headline: string | null
            bio: string | null
            education: Array<{ institution: string; degree: string; field: string; start_year: string; end_year: string; description: string }>
            experience: Array<{ company: string; role: string; start_date: string; end_date: string; description: string }>
          } | null
        }
        skills: CvSkill[]
      }>('/api/cv/upload', form)

      // Re-fetch full analysis (server normalises shape)
      try {
        const fresh = await apiGet<{ analysis: CvAnalysis | null; skills: CvSkill[] }>('/api/cv/analysis')
        setCvAnalysis(fresh.analysis ?? null)
        setCvSkills(fresh.skills ?? result.skills ?? [])
      } catch {
        setCvAnalysis({
          id: result.analysisId,
          career_paths: result.analysis.careerPaths ?? [],
          extracted_skills: result.analysis.extractedSkills ?? [],
          analysis_status: 'complete',
          created_at: new Date().toISOString(),
        })
        setCvSkills(result.skills ?? [])
      }

      // Build the diff preview from Claude's profile extraction
      const pe = result.analysis.profileExtract
      const extractedNames = (result.analysis.extractedSkills ?? []).map((s) => s.name ?? '').filter(Boolean)
      // Match against catalog — if catalog not yet loaded, IDs will be empty but we still
      // open the modal (hasDiff uses extractedNames, not matchedSkillIds, as the gate)
      const matchedSkillIds = skillCatalog
        .filter((s) => extractedNames.some((n) => n.toLowerCase() === s.name.toLowerCase()))
        .map((s) => s.id)

      const hasDiff = (pe?.education?.length ?? 0) > 0
        || (pe?.experience?.length ?? 0) > 0
        || extractedNames.length > 0
        || !!(pe?.bio || pe?.headline)

      if (hasDiff) {
        setCvExtractResult({
          education: pe?.education ?? [],
          experience: pe?.experience ?? [],
          skillIds: matchedSkillIds,
          skillNames: extractedNames,
          bio: pe?.bio ?? null,
          headline: pe?.headline ?? null,
        })
      } else {
        setCvError('CV uploaded but no profile data could be extracted. Make sure the PDF contains selectable text.')
      }

      // Refresh profile-extended in case server auto-filled anything mapped to curated skills
      try { await loadExtended() } catch { /* noop */ }
    } catch (err) {
      setCvError(err instanceof Error ? err.message : 'CV extraction failed')
    } finally {
      setCvExtracting(false)
      setCvFile(null)
      if (cvInputRef.current) cvInputRef.current.value = ''
    }
  }

  async function applyCvDiff(diff: CvExtractResult, opts: { edu: boolean; exp: boolean; skills: boolean; bio: boolean }) {
    const promises: Promise<unknown>[] = []
    if (opts.edu && diff.education.length) promises.push(apiPut('/api/users/me/education', { education: diff.education }).then((d: unknown) => { const t = d as { education: EducationEntry[] }; setEducation(t.education ?? diff.education) }))
    if (opts.exp && diff.experience.length) promises.push(apiPut('/api/users/me/experience', { experience: diff.experience }).then((d: unknown) => { const t = d as { experience: ExperienceEntry[] }; setExperience(t.experience ?? diff.experience) }))
    if (opts.skills && diff.skillIds.length) promises.push(apiPut('/api/users/me/skills', { skillIds: diff.skillIds }).then(() => setUserSkillIds(diff.skillIds)))
    if (opts.bio && (diff.bio || diff.headline) && me) {
      const patch: Record<string, string> = {}
      if (diff.bio) patch.bio = diff.bio
      if (diff.headline) patch.headline = diff.headline
      promises.push(apiPatch<{ user: Me }>('/api/users/me', patch).then((d) => setMe(d.user)))
    }
    await Promise.allSettled(promises)
    setCvExtractResult(null)
  }

  // ── Updates ───────────────────────────────────────────────────────────────

  async function postUpdate() {
    const content = updateDraft.trim()
    if (!content) return
    setPostingUpdate(true)
    setUpdatesError(null)
    try {
      await apiPost('/api/updates', { content })
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

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ─── Hero card ──────────────────────────────────────────────────────── */}
      <KCard style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
        {/* Top gradient band with subtle radial accent */}
        <div
          style={{
            height: 110,
            background:
              'radial-gradient(circle at 20% 30%, rgba(216,68,43,0.18) 0%, transparent 50%), linear-gradient(135deg, var(--ink) 0%, #2d2820 100%)',
            position: 'relative',
          }}
        />
        <div style={{ padding: '0 26px 24px' }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -48, marginBottom: 18 }}>
            <div style={{ position: 'relative' }}>
              <img
                src={avatarDraft || me.avatar_url || avatarUrl(me.full_name, 160)}
                alt={me.full_name}
                style={{ width: 96, height: 96, borderRadius: '50%', border: '4px solid var(--paper)', objectFit: 'cover', display: 'block', boxShadow: '0 6px 18px rgba(26,24,21,0.12)' }}
              />
              <button type="button" onClick={() => setAvatarEditorOpen(true)}
                style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: '50%', background: 'var(--signal)', border: '2px solid var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, boxShadow: '0 2px 6px rgba(216,68,43,0.32)' }}
                title="Edit avatar"
              >✎</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <KBtn variant="ghost" size="sm" onClick={() => { setEditMode(!editMode) }}>
                {editMode ? 'Cancel' : 'Edit profile'}
              </KBtn>
              {editMode && (
                <KBtn variant="signal" size="sm" disabled={saving} onClick={onSave}>
                  {saving ? 'Saving…' : 'Save'}
                </KBtn>
              )}
            </div>
          </div>

          {/* Name + headline + bio */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontWeight: 400, letterSpacing: '-0.025em', margin: 0, color: 'var(--ink)' }}>
                {me.full_name}
              </h1>
              <VerifiedBadge size={17} />
              <KPill color={pill.color}>{pill.label}</KPill>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginBottom: 8 }}>
              {profileMeta}
            </div>

            {/* Headline */}
            {editMode ? (
              <input
                value={me.headline ?? ''}
                onChange={(e) => setMe({ ...me, headline: e.target.value.slice(0, 120) })}
                placeholder="Software engineer · building at XYZ"
                style={{ ...fieldStyle, fontSize: 14, marginBottom: 8 }}
              />
            ) : me.headline && (
              <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 6, fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
                {me.headline}
              </div>
            )}

            {/* Bio */}
            {editMode ? (
              <div>
                <textarea
                  value={me.bio ?? ''}
                  onChange={(e) => setMe({ ...me, bio: e.target.value.slice(0, 500) })}
                  placeholder="Tell your knot what you're working on… (up to 500 chars)"
                  rows={3}
                  style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'", marginTop: 3 }}>
                  {(me.bio ?? '').length}/500
                </div>
              </div>
            ) : (
              me.bio && (
                <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, margin: 0 }}>{me.bio}</p>
              )
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, paddingTop: 18, borderTop: '0.5px solid var(--rule-soft)' }}>
            {[
              { label: 'Connections', value: String(connectionCount), icon: '🤝' },
              { label: 'Skills',      value: String(userSkillIds.length || 0), icon: '✦' },
              { label: 'Karma',       value: String(me.referral_score ?? 0).padStart(3, '0'), icon: '✺' },
            ].map(({ label, value, icon }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  padding: '12px 10px',
                  borderRadius: 12,
                  background: 'var(--paper-soft)',
                  border: '0.5px solid var(--rule-soft)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, color: 'var(--ink-faint)', marginBottom: 4, lineHeight: 1 }}>{icon}</div>
                <div style={{ fontSize: 22, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500, color: 'var(--ink)', lineHeight: 1, marginBottom: 5 }}>
                  {value}
                </div>
                <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </KCard>

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
      <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
        <SectionHead label="Working on now" />
        {updates[0] ? (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink)', margin: '0 0 6px' }}>{updates[0].content}</p>
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{relativeTime(updates[0].created_at)}</div>
          </div>
        ) : (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0, fontStyle: 'italic' }}>
            Nothing posted yet. Share what you're building.
          </p>
        )}
        <div style={{ marginTop: 14 }}>
          <textarea
            value={updateDraft}
            onChange={(e) => setUpdateDraft(e.target.value.slice(0, 280))}
            placeholder="New project, certification, internship update…"
            rows={2}
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'" }}>{updateDraft.length}/280</span>
            <KBtn variant="signal" size="sm" disabled={!updateDraft.trim() || postingUpdate} onClick={postUpdate}>
              {postingUpdate ? 'Posting…' : 'Post update'}
            </KBtn>
          </div>
          {updatesError && <p style={{ fontSize: 12, color: 'var(--signal)', marginTop: 6 }}>{updatesError}</p>}
        </div>
      </KCard>

      {/* ─── Experience ─────────────────────────────────────────────────────── */}
      <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
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

      {/* ─── Education ──────────────────────────────────────────────────────── */}
      <KCard style={{ padding: '18px 20px', marginBottom: 16 }}>
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
                The skill catalog is empty — the database migration (<code style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12 }}>018_profile_v2_messages_v2_jobs_v2.sql</code>) may not have been applied yet. Ask the admin to run it.
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
          Upload your CV — Claude analyses it, suggests career paths, and extracts your skills.
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
        {cvError && <p style={{ fontSize: 12, color: 'var(--signal)', marginTop: 8 }}>{cvError}</p>}

        {/* Career path suggestions */}
        {cvAnalysis?.career_paths && cvAnalysis.career_paths.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              Suggested career paths
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {cvAnalysis.career_paths.map((path, idx) => (
                <CareerPathCard key={idx} path={path} />
              ))}
            </div>
          </div>
        )}

        {/* CV-extracted skills */}
        {cvSkills.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px solid var(--rule-soft)' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Skills extracted from your CV
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cvSkills.map((s) => (
                <span
                  key={s.id}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: s.is_verified ? 'var(--verd-soft)' : 'var(--paper-soft)',
                    border: `0.5px solid ${s.is_verified ? 'rgba(31,107,94,0.25)' : 'var(--rule)'}`,
                    fontSize: 11.5,
                    color: s.is_verified ? 'var(--verd)' : 'var(--ink-muted)',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                  title={s.category ?? undefined}
                >
                  {s.is_verified ? '✓ ' : ''}{s.name}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8, fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
              Match these against the curated skills list (Skills section above) to make them verifiable on your profile.
            </p>
          </div>
        )}
      </KCard>

      {/* ─── Links ──────────────────────────────────────────────────────────── */}
      {!editMode && (me.website_url || me.github_url || me.linkedin_url) && (
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

      {/* ─── Timeline (recent updates) ──────────────────────────────────────── */}
      {updates.length > 1 && (
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

      {/* ─── CV diff preview modal ───────────────────────────────────────────── */}
      {cvExtractResult && (
        <CvDiffModal
          result={cvExtractResult}
          skillCatalog={skillCatalog}
          onApply={applyCvDiff}
          onClose={() => setCvExtractResult(null)}
        />
      )}
    </div>
  )
}

// ─── CV diff modal ────────────────────────────────────────────────────────────

function CvDiffModal({
  result,
  skillCatalog,
  onApply,
  onClose,
}: {
  result: CvExtractResult
  skillCatalog: SkillCatalogItem[]
  onApply: (r: CvExtractResult, opts: { edu: boolean; exp: boolean; skills: boolean; bio: boolean }) => Promise<void>
  onClose: () => void
}) {
  const [applyEdu, setApplyEdu] = useState(true)
  const [applyExp, setApplyExp] = useState(true)
  const [applySkills, setApplySkills] = useState(true)
  const [applyBio, setApplyBio] = useState(!!(result.bio || result.headline))
  const [applying, setApplying] = useState(false)

  const extractedSkillNames = (result.skillNames && result.skillNames.length)
    ? result.skillNames
    : skillCatalog.filter((s) => result.skillIds.includes(s.id)).map((s) => s.name)

  async function apply() {
    setApplying(true)
    try {
      await onApply(result, { edu: applyEdu, exp: applyExp, skills: applySkills, bio: applyBio })
    } finally { setApplying(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,24,21,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, background: 'var(--paper)', borderRadius: 18, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 500, margin: 0, letterSpacing: -0.2 }}>CV extraction preview</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '4px 0 0' }}>Review what Claude found. Toggle sections on/off before applying.</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-faint)' }}>✕</button>
        </div>

        {/* Section toggles */}
        {[
          { key: 'edu', label: 'Education', count: result.education.length, value: applyEdu, set: setApplyEdu },
          { key: 'exp', label: 'Experience', count: result.experience.length, value: applyExp, set: setApplyExp },
          { key: 'skills', label: 'Skills', count: extractedSkillNames.length, value: applySkills, set: setApplySkills },
          { key: 'bio', label: 'Bio / Headline', count: result.bio || result.headline ? 1 : 0, value: applyBio, set: setApplyBio },
        ].map(({ key, label, count, value, set }) => count > 0 && (
          <div key={key} style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 10, border: `0.5px solid ${value ? 'var(--verd)' : 'var(--rule)'}`, background: value ? 'var(--verd-soft)' : 'var(--paper-soft)', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{label} <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 400 }}>({count} item{count > 1 ? 's' : ''})</span></div>
              <button type="button" onClick={() => set((v) => !v)}
                style={{ padding: '4px 10px', borderRadius: 999, border: value ? 'none' : '0.5px solid var(--rule)', background: value ? 'var(--verd)' : 'transparent', color: value ? '#fff' : 'var(--ink-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}>
                {value ? '✓ Apply' : 'Skip'}
              </button>
            </div>

            {/* Preview content */}
            {key === 'edu' && result.education.map((e, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 3 }}>
                <strong>{e.institution}</strong>{e.degree ? ` · ${e.degree}` : ''}{e.start_year ? ` (${e.start_year}${e.end_year ? `–${e.end_year}` : ''})` : ''}
              </div>
            ))}
            {key === 'exp' && result.experience.map((e, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 3 }}>
                <strong>{e.role}</strong> at {e.company}{e.start_date ? ` (${e.start_date.slice(0, 7)})` : ''}
              </div>
            ))}
            {key === 'skills' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {extractedSkillNames.map((name) => (
                  <span key={name} style={{ padding: '3px 8px', borderRadius: 999, background: 'rgba(31,107,94,0.1)', fontSize: 11.5, color: 'var(--verd)' }}>{name}</span>
                ))}
              </div>
            )}
            {key === 'bio' && (
              <div>
                {result.headline && <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 3 }}><strong>Headline:</strong> {result.headline}</div>}
                {result.bio && <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}><strong>Bio:</strong> {result.bio.slice(0, 120)}{result.bio.length > 120 ? '…' : ''}</div>}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <KBtn variant="ghost" size="sm" onClick={onClose} disabled={applying}>Dismiss</KBtn>
          <KBtn variant="signal" size="sm" onClick={apply} disabled={applying || (!applyEdu && !applyExp && !applySkills && !applyBio)}>
            {applying ? 'Applying…' : 'Apply selected'}
          </KBtn>
        </div>
      </div>
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
        // We only want posts by this user — filter client-side since the route doesn't have a "by user" filter
        const filtered = (d.posts ?? []).filter((p: any) => p.author_id === userId).slice(0, 3)
        setPosts(filtered)
      }).catch(() => { /* ignore */ })
    return () => { mounted = false }
  }, [userId])

  async function connect() {
    setPending(true)
    try {
      await apiPost('/api/connections', { addresseeId: userId })
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
            <div style={{ display: 'flex', gap: 8 }}>
              {relation === 'connected' && <KPill color="verd">✓ Connected</KPill>}
              {relation === 'pending_out' && <KBtn variant="ghost" size="sm" disabled>Request sent</KBtn>}
              {relation === 'pending_in' && <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Accept in Discover</KBtn>}
              {relation === 'none' && (
                <KBtn variant="signal" size="sm" disabled={pending} onClick={connect}>
                  {pending ? '…' : '+ Connect'}
                </KBtn>
              )}
              <KBtn variant="ghost" size="sm" onClick={() => navigate(`/messages?to=${u.id}`)}>Message</KBtn>
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
