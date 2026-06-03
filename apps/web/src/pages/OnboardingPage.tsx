import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPatch, apiPut } from '../lib/api'

type Me = {
  id: string
  email?: string | null
  full_name?: string | null
  headline?: string | null
  location_city?: string | null
  university?: string | null
  current_company?: string | null
  status?: 'studying' | 'open_to_work' | 'employed' | null
}

type Skill = {
  id: number
  name: string
  category: string | null
}

type ProfileExtended = {
  skills: Array<{ skill_id: number; id?: number; name?: string; category?: string | null }>
}

type CatalogResponse = {
  catalog: Skill[]
}

type MeResponse = {
  user: Me
}

type OnboardingStatus = {
  complete: boolean
  missing: string[]
  skillsCount: number
  minSkills: number
}

const STATUS_OPTIONS = [
  { value: 'studying', label: 'Studying' },
  { value: 'open_to_work', label: 'Open to work' },
  { value: 'employed', label: 'Employed' },
] as const

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at 18% 0%, rgba(194, 57, 43, 0.10), transparent 32%), linear-gradient(135deg, #f8f3ea 0%, #eee4d6 100%)',
  padding: '34px 18px 48px',
} as const

const shellStyle = {
  maxWidth: 1140,
  margin: '0 auto',
  display: 'grid',
  gap: 22,
} as const

const cardStyle = {
  border: '1px solid rgba(35, 31, 28, 0.10)',
  borderRadius: 30,
  background: 'rgba(255,255,255,0.86)',
  boxShadow: '0 28px 90px rgba(35, 31, 28, 0.09)',
} as const

const fieldStyle = {
  width: '100%',
  border: '1px solid rgba(35, 31, 28, 0.16)',
  borderRadius: 15,
  padding: '13px 14px',
  fontSize: 15,
  background: '#fffaf3',
  color: 'var(--ink)',
  outline: 'none',
  boxSizing: 'border-box',
} as const

const mutedStyle = {
  color: 'var(--ink-muted)',
  fontSize: 13,
  lineHeight: 1.55,
} as const

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontSize: 13, fontWeight: 850, color: 'var(--ink)' }}>{label}</span>
      {children}
      {hint ? <span style={mutedStyle}>{hint}</span> : null}
    </label>
  )
}

function statusLabel(value: Me['status']) {
  if (value === 'studying') return 'Studying'
  if (value === 'employed') return 'Employed'
  return 'Open to work'
}

export function OnboardingPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [headline, setHeadline] = useState('')
  const [locationCity, setLocationCity] = useState('Munich')
  const [university, setUniversity] = useState('')
  const [currentCompany, setCurrentCompany] = useState('')
  const [status, setStatus] = useState<'studying' | 'open_to_work' | 'employed'>('open_to_work')

  const [catalog, setCatalog] = useState<Skill[]>([])
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([])
  const [skillQuery, setSkillQuery] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [meResult, catalogResult, extendedResult] = await Promise.all([
          apiGet<MeResponse>('/api/users/me'),
          apiGet<CatalogResponse>('/api/users/skills/catalog'),
          apiGet<ProfileExtended>('/api/users/me/profile-extended'),
        ])

        if (!mounted) return

        const user = meResult.user
        setFullName(user.full_name ?? '')
        setHeadline(user.headline ?? '')
        setLocationCity(user.location_city ?? 'Munich')
        setUniversity(user.university ?? '')
        setCurrentCompany(user.current_company ?? '')
        setStatus(user.status ?? 'open_to_work')
        setCatalog(catalogResult.catalog ?? [])
        setSelectedSkillIds((extendedResult.skills ?? []).map((s) => s.skill_id).filter(Boolean))
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load onboarding')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [])

  const selectedSkills = useMemo(() => {
    const selected = new Set(selectedSkillIds)
    return catalog.filter((skill) => selected.has(skill.id))
  }, [catalog, selectedSkillIds])

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase()
    const selected = new Set(selectedSkillIds)

    return catalog
      .filter((skill) => !selected.has(skill.id))
      .filter((skill) => {
        if (!q) return true
        return `${skill.name} ${skill.category ?? ''}`.toLowerCase().includes(q)
      })
      .slice(0, 20)
  }, [catalog, selectedSkillIds, skillQuery])

  const hasContext = Boolean(headline.trim() || university.trim() || currentCompany.trim())

  const checks = [
    { label: 'Add your name', done: fullName.trim().length >= 2 },
    { label: 'Add context', done: hasContext },
    { label: 'Add your city', done: locationCity.trim().length >= 2 },
    { label: 'Choose 3 skills', done: selectedSkillIds.length >= 3 },
  ]

  const completedCount = checks.filter((check) => check.done).length
  const canSave = completedCount === checks.length

  function toggleSkill(skillId: number) {
    setSelectedSkillIds((prev) => {
      if (prev.includes(skillId)) return prev.filter((id) => id !== skillId)
      if (prev.length >= 5) return prev
      return [...prev, skillId]
    })
  }

  async function save() {
    if (!canSave) {
      setError('Finish the missing items first. Empty profiles make the network useless.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await apiPatch('/api/users/me', {
        fullName: fullName.trim(),
        headline: headline.trim() || null,
        locationCity: locationCity.trim(),
        university: university.trim(),
        currentCompany: currentCompany.trim(),
        status,
      })

      await apiPut('/api/users/me/skills', {
        skillIds: selectedSkillIds,
      })

      const statusResult = await apiGet<OnboardingStatus>('/api/users/me/onboarding-status')
      if (!statusResult.complete) {
        throw new Error(`Still missing: ${statusResult.missing.join(', ')}`)
      }

      navigate('/profile', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save onboarding')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'grid', placeItems: 'center', color: 'var(--ink-muted)' }}>
        Loading profile setup...
      </div>
    )
  }

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <header style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--signal)', fontWeight: 900 }}>
              knotify / profile setup
            </div>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(42px, 6vw, 72px)', lineHeight: 0.92, letterSpacing: '-0.045em', margin: 0, fontWeight: 400 }}>
              Build your first signal.
            </h1>
            <p style={{ maxWidth: 700, color: 'var(--ink-muted)', fontSize: 17, lineHeight: 1.62, margin: 0 }}>
              This is not a CV. It is the card people see before they decide whether to connect, refer, message, or help.
            </p>
          </div>

          <div style={{ minWidth: 156, ...cardStyle, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 800 }}>Ready</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 40, lineHeight: 1 }}>{completedCount}</span>
              <span style={{ color: 'var(--ink-muted)' }}>/ {checks.length}</span>
            </div>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
          <section style={{ ...cardStyle, padding: 26, display: 'grid', gap: 24 }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ color: 'var(--signal)', fontWeight: 900, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  01 / Identity
                </div>
                <h2 style={{ margin: '8px 0 4px', fontSize: 25, letterSpacing: '-0.03em' }}>How should people remember you?</h2>
                <p style={{ ...mutedStyle, margin: 0 }}>Use a real name and a headline that gives people context quickly.</p>
              </div>

              <Field label="Name">
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jaydip Gohil" style={fieldStyle} />
              </Field>

              <Field label="Headline" hint="Examples: CS student building AI products, product designer, robotics researcher.">
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="CS student building AI products" maxLength={120} style={fieldStyle} />
              </Field>
            </div>

            <div style={{ height: 1, background: 'rgba(35, 31, 28, 0.08)' }} />

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ color: 'var(--signal)', fontWeight: 900, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  02 / Context
                </div>
                <h2 style={{ margin: '8px 0 4px', fontSize: 25, letterSpacing: '-0.03em' }}>Where do you belong right now?</h2>
                <p style={{ ...mutedStyle, margin: 0 }}>This helps the network place you: city, school, company, project, or current direction.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="City">
                  <input value={locationCity} onChange={(e) => setLocationCity(e.target.value)} placeholder="Munich" style={fieldStyle} />
                </Field>

                <Field label="Current status">
                  <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={fieldStyle}>
                    {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="University">
                  <input value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="TUM" style={fieldStyle} />
                </Field>

                <Field label="Company or project">
                  <input value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)} placeholder="knotify / student founder" style={fieldStyle} />
                </Field>
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(35, 31, 28, 0.08)' }} />

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ color: 'var(--signal)', fontWeight: 900, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  03 / Proof direction
                </div>
                <h2 style={{ margin: '8px 0 4px', fontSize: 25, letterSpacing: '-0.03em' }}>What should people come to you for?</h2>
                <p style={{ ...mutedStyle, margin: 0 }}>Pick 3 to 5 skills. Start narrow. You can add more proof later.</p>
              </div>

              <input value={skillQuery} onChange={(e) => setSkillQuery(e.target.value)} placeholder="Search skills..." style={fieldStyle} />

              {selectedSkills.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 850 }}>Selected</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selectedSkills.map((skill) => (
                      <button key={skill.id} type="button" onClick={() => toggleSkill(skill.id)} style={{ border: '1px solid rgba(194, 57, 43, 0.38)', background: 'rgba(194, 57, 43, 0.08)', color: 'var(--signal)', borderRadius: 999, padding: '9px 12px', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>
                        Selected: {skill.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {filteredSkills.map((skill) => (
                  <button key={skill.id} type="button" onClick={() => toggleSkill(skill.id)} disabled={selectedSkillIds.length >= 5} style={{ border: '1px solid rgba(35, 31, 28, 0.13)', background: '#fffaf3', color: 'var(--ink)', borderRadius: 999, padding: '9px 12px', fontSize: 13, cursor: selectedSkillIds.length >= 5 ? 'not-allowed' : 'pointer', opacity: selectedSkillIds.length >= 5 ? 0.5 : 1 }}>
                    Add {skill.name}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div style={{ border: '1px solid rgba(180, 40, 40, 0.25)', background: 'rgba(180, 40, 40, 0.08)', color: '#9f1d1d', borderRadius: 16, padding: 13, fontSize: 13 }}>
                {error}
              </div>
            ) : null}

            <button type="button" onClick={save} disabled={saving || !canSave} style={{ border: 0, borderRadius: 999, padding: '15px 18px', background: canSave ? 'var(--signal)' : 'rgba(35, 31, 28, 0.16)', color: canSave ? 'white' : 'rgba(35, 31, 28, 0.50)', fontWeight: 900, cursor: canSave && !saving ? 'pointer' : 'not-allowed', fontSize: 15 }}>
              {saving ? 'Saving profile...' : canSave ? 'Finish and view profile' : 'Complete the missing signal'}
            </button>
          </section>

          <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 18 }}>
            <div style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 900 }}>
                Live profile card
              </div>

              <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
                <div style={{ width: 54, height: 54, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'rgba(194, 57, 43, 0.10)', color: 'var(--signal)', fontWeight: 900, fontSize: 18 }}>
                  {(fullName.trim()[0] ?? '?').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em' }}>
                    {fullName.trim() || 'Your name'}
                  </div>
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 2 }}>
                    {headline.trim() || 'Add a headline'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ borderRadius: 999, background: 'rgba(35,31,28,0.06)', padding: '7px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>
                  {locationCity.trim() || 'City'}
                </span>
                <span style={{ borderRadius: 999, background: 'rgba(35,31,28,0.06)', padding: '7px 10px', fontSize: 12, color: 'var(--ink-muted)' }}>
                  {statusLabel(status)}
                </span>
              </div>

              <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.55 }}>
                {[university.trim(), currentCompany.trim()].filter(Boolean).join(' / ') || 'Add university, company, or project'}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedSkills.length ? selectedSkills.map((skill) => (
                  <span key={skill.id} style={{ borderRadius: 999, border: '1px solid rgba(194,57,43,0.22)', background: 'rgba(194,57,43,0.07)', color: 'var(--signal)', padding: '7px 10px', fontSize: 12, fontWeight: 850 }}>
                    {skill.name}
                  </span>
                )) : (
                  <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Your skills will appear here.</span>
                )}
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 18, display: 'grid', gap: 10 }}>
              {checks.map((check) => (
                <div key={check.label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900, background: check.done ? 'rgba(45, 130, 80, 0.16)' : 'rgba(35, 31, 28, 0.09)', color: check.done ? '#21663e' : 'var(--ink-muted)' }}>
                    {check.done ? '?' : ''}
                  </span>
                  <span style={{ fontSize: 13, color: check.done ? 'var(--ink)' : 'var(--ink-muted)', fontWeight: check.done ? 850 : 650 }}>
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
