import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KnotifyLogoImg, KBtn, VerifiedBadge } from '@/lib/knotify'
import { WAITLIST_ROLES as ROLE_OPTIONS } from '@/lib/taxonomy'

// ─── Animated Network Graphic ────────────────────────────────────────────────
function NetworkGraphic() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const W = 480, H = 480
    canvas.width = W
    canvas.height = H

    const nodes = [
      { x: 240, y: 180, r: 22, label: 'You', primary: true },
      { x: 140, y: 100, r: 14, label: 'A', primary: false },
      { x: 340, y: 110, r: 14, label: 'B', primary: false },
      { x: 100, y: 240, r: 12, label: 'C', primary: false },
      { x: 380, y: 240, r: 12, label: 'D', primary: false },
      { x: 170, y: 340, r: 11, label: 'E', primary: false },
      { x: 320, y: 340, r: 11, label: 'F', primary: false },
      { x: 240, y: 390, r: 10, label: 'G', primary: false },
      { x: 60,  y: 160, r: 9,  label: 'H', primary: false },
      { x: 420, y: 310, r: 9,  label: 'I', primary: false },
    ]

    const edges = [
      [0,1],[0,2],[0,3],[0,4],[1,2],[1,8],[2,4],[3,5],[4,6],[5,7],[6,7],[4,9]
    ]

    let t = 0
    const animId = { current: 0 }

    function draw() {
      ctx.clearRect(0, 0, W, H)

      edges.forEach(([a, b]) => {
        const na = nodes[a], nb = nodes[b]
        const alpha = 0.12 + 0.04 * Math.sin(t * 0.8 + a * 0.5)
        ctx.strokeStyle = `rgba(84,72,58,${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(na.x, na.y)
        ctx.lineTo(nb.x, nb.y)
        ctx.stroke()
      })

      nodes.forEach((n, i) => {
        const pulse = n.primary ? 1 + 0.06 * Math.sin(t * 1.5) : 1

        if (n.primary) {
          const ringAlpha = 0.15 + 0.08 * Math.sin(t * 1.5)
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * pulse * 1.8, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(216,68,43,${ringAlpha})`
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2)

        if (n.primary) {
          const grad = ctx.createRadialGradient(n.x - 4, n.y - 4, 2, n.x, n.y, n.r)
          grad.addColorStop(0, '#E5614A')
          grad.addColorStop(1, '#D8442B')
          ctx.fillStyle = grad
        } else {
          const alpha = 0.7 + 0.15 * Math.sin(t * 0.6 + i)
          ctx.fillStyle = `rgba(237,232,222,${alpha})`
        }
        ctx.fill()

        ctx.strokeStyle = n.primary ? 'rgba(216,68,43,0.40)' : 'rgba(84,72,58,0.18)'
        ctx.lineWidth = n.primary ? 1.5 : 1
        ctx.stroke()

        ctx.fillStyle = n.primary ? '#fff' : 'rgba(84,72,58,0.55)'
        ctx.font = `${n.primary ? '500' : '400'} ${n.primary ? 11 : 9}px 'IBM Plex Sans', sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(n.label, n.x, n.y)
      })

      t += 0.025
      animId.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId.current)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 420, height: 420, opacity: 0.9 }}
    />
  )
}

// ─── Floating card ────────────────────────────────────────────────────────────
function FloatCard({
  children,
  style,
}: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 14,
        background: 'white',
        border: '0.5px solid var(--rule)',
        boxShadow: '0 8px 24px rgba(40,30,20,0.08)',
        position: 'absolute',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Beta signup form ─────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '0.5px solid var(--rule)',
  background: 'white',
  fontSize: 14,
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: "'IBM Plex Sans', sans-serif",
  boxSizing: 'border-box',
}

function BetaForm({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [isInternational, setIsInternational] = useState(false)
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!consent) {
      setErrorMsg('Please accept the terms to continue.')
      return
    }
    setState('loading')
    setErrorMsg('')

    try {
      const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/beta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          role: role || null,
          is_international: isInternational,
          marketing_consent: consent,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Something went wrong.')
        setState('error')
      } else {
        setState('success')
      }
    } catch {
      setErrorMsg('Network error. Please try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div
        style={{
          padding: compact ? '14px 18px' : '18px 22px',
          borderRadius: 12,
          background: 'rgba(216,68,43,0.06)',
          border: '0.5px solid rgba(216,68,43,0.2)',
          color: 'var(--signal-deep)',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>You're on the list.</div>
        <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
          We'll be in touch when your spot opens up. We're onboarding Munich's international
          community first.
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          required
          placeholder="Full name"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 140 }}
        />
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 140 }}
        />
      </div>

      <select
        required
        value={role}
        onChange={e => setRole(e.target.value)}
        style={{ ...inputStyle, color: role ? 'var(--ink)' : 'var(--ink-faint)', cursor: 'pointer' }}
      >
        <option value="" disabled>I am a…</option>
        {ROLE_OPTIONS.map(r => (
          <option key={r.value} value={r.value} style={{ color: 'var(--ink)' }}>
            {r.label}
          </option>
        ))}
      </select>

      {/* International newcomer — styled selectable row */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '11px 14px',
          borderRadius: 10,
          border: `0.5px solid ${isInternational ? 'var(--signal)' : 'var(--rule)'}`,
          background: isInternational ? 'var(--signal-soft)' : 'white',
          cursor: 'pointer',
          transition: 'all 0.14s',
        }}
      >
        <input
          type="checkbox"
          checked={isInternational}
          onChange={e => setIsInternational(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--signal)', flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
          I'm an international newcomer to Munich
        </span>
      </label>

      {/* Consent — GDPR required */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={e => setConsent(e.target.checked)}
          style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--signal)', flexShrink: 0 }}
        />
        <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.55 }}>
          I agree to receive product updates and occasional marketing communications from knotify.
          I can unsubscribe at any time. See our{' '}
          <a href="/privacy" style={{ color: 'var(--ink-muted)', textDecoration: 'underline' }}>
            Privacy Policy
          </a>.
        </span>
      </label>

      {errorMsg && (
        <div style={{ fontSize: 12, color: 'var(--signal)' }}>{errorMsg}</div>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        style={{
          padding: '13px 22px',
          borderRadius: 10,
          background: 'var(--signal)',
          color: '#fff',
          border: 'none',
          fontSize: 14.5,
          fontWeight: 600,
          cursor: state === 'loading' ? 'not-allowed' : 'pointer',
          opacity: state === 'loading' ? 0.7 : 1,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        {state === 'loading' ? 'Joining…' : 'Join waiting list'}
      </button>
    </form>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function LandingNav({ onSignIn }: { onSignIn: () => void }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 40px',
        height: 64,
        background: scrolled ? 'rgba(244,239,230,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '0.5px solid var(--rule-soft)' : '0.5px solid transparent',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        <KnotifyLogoImg variant="wordmark" height={26} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          fontSize: 13.5,
          color: 'var(--ink-muted)',
        }}
      >
        <a href="#how-it-works" style={{ color: 'inherit', textDecoration: 'none' }}>
          How it works
        </a>
        <a href="#cafes" style={{ color: 'inherit', textDecoration: 'none' }}>
          Cafés
        </a>
        <a href="#manifesto" style={{ color: 'inherit', textDecoration: 'none' }}>
          Manifesto
        </a>
        <a href="/employers" style={{ color: 'inherit', textDecoration: 'none' }}>
          For employers
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KBtn variant="ghost" size="sm" onClick={onSignIn}>
          Beta login
        </KBtn>
        <KBtn variant="signal" size="sm" onClick={() => document.getElementById('beta-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          Join waiting list
        </KBtn>
      </div>
    </nav>
  )
}

// ─── Main LandingPage ─────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate()

  function goToSignIn() {
    navigate('/login')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontFamily: "'IBM Plex Sans', sans-serif",
        overflowX: 'hidden',
      }}
    >
      <LandingNav onSignIn={goToSignIn} />

      {/* ── Hero ── */}
      <section
        style={{
          padding: '72px 40px 80px',
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 56,
          alignItems: 'center',
          maxWidth: 1160,
          margin: '0 auto',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 12px',
              borderRadius: 999,
              background: 'var(--signal-soft)',
              color: 'var(--signal-deep)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: 'var(--signal)',
                display: 'inline-block',
              }}
            />
            Private beta · Munich
          </div>

          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 'clamp(54px, 6vw, 88px)',
              lineHeight: 0.92,
              fontWeight: 400,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            Relationships
            <br />
            <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
              don't decay.
            </span>
          </h1>

          <p
            style={{
              fontSize: 17,
              color: 'var(--ink-muted)',
              marginTop: 22,
              lineHeight: 1.6,
              maxWidth: 460,
            }}
          >
            knotify tells you who is going cold, who just hit a milestone, and
            who you can actually help — so the people who matter don't slip away.
          </p>

          {/* Beta form */}
          <div id="beta-form" style={{ marginTop: 32, maxWidth: 460 }}>
            <BetaForm />
          </div>

          <p
            style={{
              marginTop: 14,
              fontSize: 11.5,
              color: 'var(--ink-faint)',
            }}
          >
            Beta access is by approval. We're starting with Munich's international community.
          </p>
        </div>

        {/* Hero visual */}
        <div style={{ position: 'relative', height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at center, rgba(216,68,43,0.07) 0%, transparent 65%)',
              pointerEvents: 'none',
            }}
          />
          <NetworkGraphic />

          <FloatCard style={{ top: 24, right: 0, width: 220, transform: 'rotate(2deg)' }}>
            <div style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Maya · just verified
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <VerifiedBadge size={13} />
              <span style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 16 }}>
                UX writing
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 3 }}>
              3 peer attestations · score 92
            </div>
          </FloatCard>

          <FloatCard
            style={{
              bottom: 60,
              left: 0,
              width: 200,
              transform: 'rotate(-2deg)',
              background: 'var(--ink)',
              color: 'var(--paper)',
              border: 'none',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--signal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Tomorrow · 4:30pm
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, lineHeight: 1.2, marginTop: 5 }}>
              Coffee with Maya
              <br />
              <span style={{ fontStyle: 'italic' }}>at Tortoise.</span>
            </div>
          </FloatCard>
        </div>
      </section>

      {/* ── Three pillars ── */}
      <section
        id="cafes"
        style={{
          background: 'var(--paper-soft)',
          borderTop: '0.5px solid var(--rule-soft)',
          borderBottom: '0.5px solid var(--rule-soft)',
          padding: '64px 40px',
        }}
      >
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              marginBottom: 28,
            }}
          >
            Three things, well
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
            {[
              {
                n: '01',
                title: 'Land your network',
                body: 'New to Munich? Get matched to the people, groups and events that fit who you are and what you are into.',
              },
              {
                n: '02',
                title: 'Keep it warm',
                body: 'Your network is a living map. knotify nudges you before the people who matter slip away.',
              },
              {
                n: '03',
                title: 'Meet at the café',
                body: 'Real connection happens in person. Partner cafés across Munich, perks for members, side quests to break the ice.',
              },
            ].map((p) => (
              <div key={p.n}>
                <div
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontStyle: 'italic',
                    fontSize: 38,
                    color: 'var(--signal)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}
                >
                  {p.n}
                </div>
                <div
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontSize: 22,
                    fontWeight: 500,
                    marginTop: 8,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {p.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: 'var(--ink-muted)',
                    marginTop: 8,
                    lineHeight: 1.55,
                  }}
                >
                  {p.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        style={{ padding: '80px 40px', maxWidth: 1160, margin: '0 auto' }}
      >
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: 16,
          }}
        >
          How it works
        </div>
        <h2
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 42,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: '0 0 48px',
          }}
        >
          Simple,{' '}
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
            by design.
          </span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {[
            {
              step: 1,
              title: 'Add the people you know',
              desc: 'Not everyone — just the ones that matter. Your network becomes a living, navigable map.',
              color: 'var(--signal)',
            },
            {
              step: 2,
              title: 'See who needs attention',
              desc: 'knotify surfaces who is going cold, who just hit a milestone, and who is waiting on something from you.',
              color: 'var(--signal)',
            },
            {
              step: 3,
              title: 'Reach out — or meet in person',
              desc: 'Make the ask, send the intro, or book a coffee at a partner café in Munich.',
              color: 'var(--verd)',
            },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                background: 'white',
                border: '0.5px solid var(--rule)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: item.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'IBM Plex Mono', monospace",
                  marginBottom: 16,
                }}
              >
                {item.step}
              </div>
              <div
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  marginBottom: 8,
                }}
              >
                {item.title}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Manifesto ── */}
      <section
        id="manifesto"
        style={{
          padding: '80px 40px',
          background: 'var(--paper-soft)',
          borderTop: '0.5px solid var(--rule-soft)',
        }}
      >
        <div
          style={{
            maxWidth: 1160,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1.4fr',
            gap: 60,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              Manifesto · short
            </div>
            <blockquote
              style={{
                fontFamily: "'Fraunces', serif",
                fontStyle: 'italic',
                fontSize: 28,
                fontWeight: 400,
                color: 'var(--signal)',
                margin: '18px 0 0',
                lineHeight: 1.2,
                padding: 0,
              }}
            >
              "We don't post.
              <br />
              We notice.
              <br />
              We introduce."
            </blockquote>
          </div>
          <div style={{ fontSize: 15, color: 'var(--ink-muted)', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 16px' }}>
              The professional internet is loud. It rewards people who shout, recycle,
              and self-congratulate. It does not reward the quiet excellence that
              actually moves careers — the call you took at 11pm, the intro you made
              for someone who couldn't pay you back, the time you read a draft twice.
            </p>
            <p style={{ margin: '0 0 16px' }}>
              knotify is for the second kind of person. We measure what professional
              life actually rests on: who knows you, who'll vouch for you, who you've
              sat across from. Not your follower count. Not your post velocity.
            </p>
            <p style={{ margin: 0 }}>
              If that sounds slow — yes. That's the point.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section style={{ padding: '80px 40px' }}>
        <div
          style={{
            maxWidth: 560,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 38,
              fontWeight: 400,
              letterSpacing: '-0.03em',
              margin: '0 0 12px',
            }}
          >
            Ready to stop{' '}
            <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>losing people?</span>
          </h2>
          <p style={{ fontSize: 15, color: 'var(--ink-muted)', marginBottom: 28, lineHeight: 1.6 }}>
            The Munich beta is opening to a limited group. Join the waiting list below.
          </p>
          <BetaForm compact />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: '0.5px solid var(--rule-soft)',
          padding: '40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
          fontSize: 11,
          color: 'var(--ink-faint)',
        }}
      >
        <KnotifyLogoImg variant="full" height={48} />
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {([
            ['Manifesto', () => document.getElementById('manifesto')?.scrollIntoView({ behavior: 'smooth' })],
            ['Cafés', () => document.getElementById('cafes')?.scrollIntoView({ behavior: 'smooth' })],
            ['For employers', () => navigate('/employers')],
            ['Privacy', () => navigate('/privacy')],
            ['Impressum', () => navigate('/impressum')],
          ] as const).map(([label, fn]) => (
            <span key={label} style={{ cursor: 'pointer' }} onClick={fn}>
              {label}
            </span>
          ))}
        </div>
        <span>© 2026 knotify · Munich</span>
      </footer>
    </div>
  )
}
