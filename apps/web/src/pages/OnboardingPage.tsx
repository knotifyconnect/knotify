import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPatch } from '../lib/api'
import {
  PERSONAS, INTERESTS, GOALS, MUNICH_TENURE, COMMON_LANGUAGES,
} from '../lib/taxonomy'

type Me = {
  id: string
  email?: string | null
  full_name?: string | null
  location_city?: string | null
  persona?: string | null
  interests?: string[] | null
  goals?: string[] | null
  is_international?: boolean | null
  home_country?: string | null
  munich_tenure?: string | null
  languages?: string[] | null
}

type MeResponse = { user: Me }
type OnboardingStatus = { complete: boolean; missing: string[] }

// ── shared styles ──────────────────────────────────────────────────────────
const page = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at 18% 0%, rgba(216,68,43,0.10), transparent 34%), var(--paper, #f5f0e8)',
  fontFamily: "'IBM Plex Sans', sans-serif",
  color: 'var(--ink)',
  padding: '40px 18px 64px',
} as const

const card = {
  maxWidth: 640,
  margin: '0 auto',
  background: 'white',
  border: '0.5px solid var(--rule)',
  borderRadius: 24,
  padding: 'clamp(24px, 4vw, 40px)',
  boxShadow: '0 18px 60px rgba(40,30,20,0.08)',
} as const

const input = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '0.5px solid var(--rule)',
  background: '#fffdf9',
  fontSize: 15,
  color: 'var(--ink)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'IBM Plex Sans', sans-serif",
} as const

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 999,
        border: `0.5px solid ${on ? 'var(--signal)' : 'var(--rule)'}`,
        background: on ? 'var(--signal)' : 'transparent',
        color: on ? '#fff' : 'var(--ink-muted)',
        fontSize: 13.5,
        cursor: 'pointer',
        fontFamily: "'IBM Plex Sans', sans-serif",
        transition: 'all 0.14s',
      }}
    >
      {children}
    </button>
  )
}

function StepHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--signal)', fontWeight: 700 }}>
        {eyebrow}
      </div>
      <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 400, letterSpacing: '-0.03em', margin: '8px 0 6px' }}>
        {title}
      </h2>
      {sub && <p style={{ color: 'var(--ink-muted)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{sub}</p>}
    </div>
  )
}

const TOTAL_STEPS = 4

export function OnboardingPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  // form state
  const [fullName, setFullName] = useState('')
  const [persona, setPersona] = useState<string>('')
  const [city, setCity] = useState('Munich')
  const [isInternational, setIsInternational] = useState<boolean | null>(null)
  const [homeCountry, setHomeCountry] = useState('')
  const [tenure, setTenure] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [customLang, setCustomLang] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { user } = await apiGet<MeResponse>('/api/users/me')
        if (!mounted) return
        setFullName(user.full_name ?? '')
        setPersona(user.persona ?? '')
        setCity(user.location_city ?? 'Munich')
        setIsInternational(user.is_international ?? null)
        setHomeCountry(user.home_country ?? '')
        setTenure(user.munich_tenure ?? '')
        setLanguages(user.languages ?? [])
        setInterests(user.interests ?? [])
        setGoals(user.goals ?? [])
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  function toggle(list: string[], setList: (v: string[]) => void, value: string, max?: number) {
    if (list.includes(value)) setList(list.filter(x => x !== value))
    else if (!max || list.length < max) setList([...list, value])
  }

  function addCustomLang() {
    const v = customLang.trim()
    if (v && !languages.includes(v)) setLanguages([...languages, v])
    setCustomLang('')
  }

  const stepValid = [
    fullName.trim().length >= 2 && !!persona,
    !!tenure && (isInternational !== true || homeCountry.trim().length > 1),
    interests.length >= 3,
    goals.length >= 1,
  ]

  async function finish() {
    setSaving(true)
    setError(null)
    try {
      await apiPatch('/api/users/me', {
        fullName: fullName.trim(),
        persona,
        locationCity: city.trim() || 'Munich',
        isInternational,
        homeCountry: isInternational ? homeCountry.trim() : null,
        munichTenure: tenure,
        languages,
        interests,
        goals,
      })
      const status = await apiGet<OnboardingStatus>('/api/users/me/onboarding-status')
      if (!status.complete) throw new Error(`Still missing: ${status.missing.join(', ')}`)
      navigate('/home', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function next() {
    setError(null)
    if (step < TOTAL_STEPS - 1) setStep(step + 1)
    else void finish()
  }

  if (loading) {
    return (
      <div style={{ ...page, display: 'grid', placeItems: 'center' }}>
        <span style={{ color: 'var(--ink-muted)' }}>Loading…</span>
      </div>
    )
  }

  return (
    <main style={page}>
      <div style={{ maxWidth: 640, margin: '0 auto 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <KnotifyWord />
        <span style={{ fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '0.06em' }}>
          Step {step + 1} of {TOTAL_STEPS}
        </span>
      </div>

      {/* progress bar */}
      <div style={{ maxWidth: 640, margin: '0 auto 18px', height: 4, borderRadius: 999, background: 'var(--rule-soft, rgba(84,72,58,0.12))' }}>
        <div style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--signal)', transition: 'width 0.25s' }} />
      </div>

      <div style={card}>
        {step === 0 && (
          <>
            <StepHeader eyebrow="Welcome to knotify" title="Let's start with you." sub="The basics so people can recognise you." />
            <div style={{ display: 'grid', gap: 16 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Full name</span>
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" style={input} />
              </label>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>I am a…</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PERSONAS.map(p => (
                    <Chip key={p.value} on={persona === p.value} onClick={() => setPersona(p.value)}>{p.label}</Chip>
                  ))}
                </div>
              </div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>City</span>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="Munich" style={input} />
              </label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <StepHeader eyebrow="You & Munich" title="Help us place you." sub="This is how we connect newcomers with the right people and events." />
            <div style={{ display: 'grid', gap: 18 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Are you an international newcomer to Munich?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Chip on={isInternational === true} onClick={() => setIsInternational(true)}>Yes</Chip>
                  <Chip on={isInternational === false} onClick={() => setIsInternational(false)}>No, I'm local</Chip>
                </div>
              </div>

              {isInternational === true && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Where are you from?</span>
                  <input value={homeCountry} onChange={e => setHomeCountry(e.target.value)} placeholder="e.g. India, Brazil, Italy" style={input} />
                </label>
              )}

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>How long have you been in Munich?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {MUNICH_TENURE.map(t => (
                    <Chip key={t} on={tenure === t} onClick={() => setTenure(t)}>{t}</Chip>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Languages you speak <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {[...COMMON_LANGUAGES, ...languages.filter(l => !(COMMON_LANGUAGES as readonly string[]).includes(l))].map(l => (
                    <Chip key={l} on={languages.includes(l)} onClick={() => toggle(languages, setLanguages, l)}>{l}</Chip>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={customLang}
                    onChange={e => setCustomLang(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLang() } }}
                    placeholder="Add another language"
                    style={{ ...input, flex: 1 }}
                  />
                  <button type="button" onClick={addCustomLang} style={{ ...input, width: 'auto', cursor: 'pointer', background: 'var(--paper-soft, #ede8df)' }}>Add</button>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <StepHeader eyebrow="Interests" title="What are you into?" sub="Pick at least 3. We use these to match you with people, groups and events — beyond just work." />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {INTERESTS.map(i => (
                <Chip key={i} on={interests.includes(i)} onClick={() => toggle(interests, setInterests, i)}>{i}</Chip>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: interests.length >= 3 ? 'var(--verd, #1f6b5e)' : 'var(--ink-faint)' }}>
              {interests.length} selected {interests.length < 3 ? `· pick ${3 - interests.length} more` : '✓'}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <StepHeader eyebrow="Goals" title="What do you want from knotify?" sub="Pick what matters most — this shapes what we surface for you." />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {GOALS.map(g => (
                <Chip key={g} on={goals.includes(g)} onClick={() => toggle(goals, setGoals, g)}>{g}</Chip>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: goals.length >= 1 ? 'var(--verd, #1f6b5e)' : 'var(--ink-faint)' }}>
              {goals.length} selected {goals.length < 1 ? '· pick at least 1' : '✓'}
            </div>
          </>
        )}

        {error && (
          <div style={{ marginTop: 18, border: '0.5px solid rgba(216,68,43,0.3)', background: 'rgba(216,68,43,0.07)', color: 'var(--signal)', borderRadius: 12, padding: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, gap: 12 }}>
          <button
            type="button"
            onClick={() => { setError(null); setStep(Math.max(0, step - 1)) }}
            disabled={step === 0}
            style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', fontSize: 14, cursor: step === 0 ? 'default' : 'pointer', opacity: step === 0 ? 0.4 : 1, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!stepValid[step] || saving}
            style={{
              padding: '12px 28px',
              borderRadius: 12,
              border: 'none',
              background: stepValid[step] && !saving ? 'var(--signal)' : 'rgba(84,72,58,0.2)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14.5,
              cursor: stepValid[step] && !saving ? 'pointer' : 'not-allowed',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            {saving ? 'Saving…' : step === TOTAL_STEPS - 1 ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    </main>
  )
}

function KnotifyWord() {
  return (
    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 18, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
      knotify
    </span>
  )
}
