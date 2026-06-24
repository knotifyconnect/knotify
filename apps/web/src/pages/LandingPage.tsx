import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KnotifyLogoImg, KBtn, VerifiedBadge } from '@/lib/knotify'
import { WAITLIST_ROLES as ROLE_OPTIONS } from '@/lib/taxonomy'
import { useSeo } from '@/lib/seo'

// ─── FAQ content (mirrored by FAQPage JSON-LD in index.html) ──────────────────
const FAQS = [
  {
    q: 'What is knotify?',
    a: 'knotify is a trust-based professional network. Instead of a feed to scroll, you get a living map of the people you know, nudges before connections go cold, and warm introductions that turn quiet trust into real opportunities.',
  },
  {
    q: 'Who is knotify for?',
    a: 'Anyone building their first circle in a new university, city, career or community, and anyone keeping trusted relationships alive. Students, early-career professionals, and people who want meaningful connections rather than another social feed.',
  },
  {
    q: 'How do I build a network that actually lasts?',
    a: 'Add the people you already know, and knotify helps the right people stay close, support one another, and create opportunities in the moments that matter. You get a warmer reason to reach out and a nudge before a connection goes cold.',
  },
  {
    q: 'How is knotify different from LinkedIn?',
    a: 'LinkedIn is a feed and a resume. knotify is a relationship tool. There is nothing to post and no follower count to chase. You keep a private, living map of the people you actually know, get a nudge before a connection goes cold, and meet in person over coffee. It is built for people who want a real network, not an audience.',
  },
  {
    q: 'Where is knotify available?',
    a: 'knotify is launching in Munich first, but it is built for communities anywhere. Your network is not limited to one city, so you can keep relationships alive and create opportunities wherever the right people are.',
  },
  {
    q: 'Is knotify free, and when does it launch?',
    a: 'knotify is a free private beta. Join the waiting list and we will reach out as access opens to early communities.',
  },
]

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
  const [betaRisk, setBetaRisk] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!betaRisk) {
      setErrorMsg('Please confirm you understand this is an early beta.')
      return
    }
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
          beta_risk_consent: betaRisk,
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
          We'll be in touch when your spot opens up. We're opening access to early communities first.
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

      {/* International newcomer, styled selectable row */}
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
          I'm new in town and building my network
        </span>
      </label>

      {/* Beta-risk acknowledgement, mandatory */}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 11,
          padding: '11px 14px',
          borderRadius: 10,
          border: `0.5px solid ${betaRisk ? 'var(--signal)' : 'var(--rule)'}`,
          background: betaRisk ? 'var(--signal-soft)' : 'white',
          cursor: 'pointer',
          transition: 'all 0.14s',
        }}
      >
        <input
          type="checkbox"
          required
          checked={betaRisk}
          onChange={e => setBetaRisk(e.target.checked)}
          style={{ marginTop: 1, width: 16, height: 16, accentColor: 'var(--signal)', flexShrink: 0 }}
        />
        <span style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
          I understand knotify is an early beta. It may contain bugs, incomplete features and
          security risks, and I use it at my own risk.
        </span>
      </label>

      {/* Consent, GDPR required */}
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
      className="k-landing-nav"
      style={{
        background: scrolled ? 'rgba(244,239,230,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '0.5px solid var(--rule-soft)' : '0.5px solid transparent',
      }}
    >
      <div
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        <KnotifyLogoImg variant="wordmark" height={26} />
      </div>

      <div className="k-landing-nav-links">
        <a href="#how-it-works" style={{ color: 'inherit', textDecoration: 'none' }}>How it works</a>
        <a href="#manifesto" style={{ color: 'inherit', textDecoration: 'none' }}>Manifesto</a>
        <a href="#faq" style={{ color: 'inherit', textDecoration: 'none' }}>FAQ</a>
        <a href="/guides/" style={{ color: 'inherit', textDecoration: 'none' }}>Blog</a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KBtn variant="ghost" size="sm" onClick={onSignIn}>
          Beta login
        </KBtn>
        <KBtn variant="signal" size="sm" onClick={() => document.getElementById('beta-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          Join list
        </KBtn>
      </div>
    </nav>
  )
}

// ─── Main LandingPage ─────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate()

  useSeo({
    title: 'knotify · Networks worth keeping.',
    description:
      'knotify is a trust-based professional network. Keep valuable relationships alive, turn quiet trust into warm introductions, and create more referrals, support and real opportunities. Join the private beta.',
    path: '/',
  })

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
      <section className="k-landing-hero">
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
            Private beta
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
            Networks worth
            <br />
            <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
              keeping.
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
            Whether you're building your first circle or keeping trusted
            relationships alive, knotify helps the right people stay close,
            support one another, and create opportunities in the moments that
            matter.
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
            Beta access is by approval. We're opening to early communities first.
          </p>
        </div>

        {/* Hero visual */}
        <div className="k-landing-hero-graphic">
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

      {/* ── Dual audience ── */}
      <section
        style={{
          padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 40px)',
          maxWidth: 1160,
          margin: '0 auto',
        }}
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
          Which sounds more like you?
        </div>
        <h2
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 42,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: '0 0 40px',
          }}
        >
          Two ways in,{' '}
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>one network.</span>
        </h2>

        <div className="k-landing-dual">
          {[
            {
              eyebrow: 'New here',
              accent: 'var(--signal)',
              accentSoft: 'var(--signal-soft)',
              title: <>Building your <span style={{ fontStyle: 'italic' }}>first circle?</span></>,
              body: 'You are new to a university, city, career, or community. You need people who can offer:',
              items: ['practical help', 'honest advice', 'shared experience', 'warm introductions', 'a way into new opportunities'],
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22V12" />
                  <path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6Z" />
                  <path d="M12 12c0-3 2-5 6-5 0 4-3 5-6 5Z" />
                </svg>
              ),
            },
            {
              eyebrow: 'Already connected',
              accent: 'var(--ochre)',
              accentSoft: 'var(--ochre-soft)',
              title: <>Keeping <span style={{ fontStyle: 'italic' }}>relationships</span> alive?</>,
              body: 'You already built connections with valuable people, but time passes and they quietly fade. You want to:',
              items: ['reconnect with purpose', 'stay close to the right people', 'help without being overwhelmed', 'remain useful to your network', 'create opportunities for one another'],
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              ),
            },
          ].map((card) => (
            <div
              key={card.eyebrow}
              style={{
                background: 'white',
                border: '0.5px solid var(--rule)',
                borderRadius: 16,
                padding: 'clamp(24px, 3vw, 32px)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.accent }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div
                  style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: card.accentSoft, color: card.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {card.icon}
                </div>
                <span
                  style={{
                    fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                    fontWeight: 600, color: card.accent,
                  }}
                >
                  {card.eyebrow}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: 26,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                }}
              >
                {card.title}
              </div>
              <p style={{ fontSize: 15, color: 'var(--ink-muted)', lineHeight: 1.6, margin: '12px 0 20px' }}>
                {card.body}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {card.items.map((t) => (
                  <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14.5, color: 'var(--ink)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: card.accent, flexShrink: 0 }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Three pillars ── */}
      <section
        id="cafes"
        style={{
          background: 'var(--paper-soft)',
          borderTop: '0.5px solid var(--rule-soft)',
          borderBottom: '0.5px solid var(--rule-soft)',
          padding: 'clamp(40px, 6vw, 64px) clamp(16px, 4vw, 40px)',
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
            Land it. Keep it. Grow it.
          </div>
          <div className="k-landing-3col">
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
                body: 'Real connection happens in person. Find your people at partner cafés across Munich, enjoy member perks, and use side quests to break the ice.',
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
        style={{ padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 40px)', maxWidth: 1160, margin: '0 auto' }}
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
          This is where{' '}
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
            knotify fits.
          </span>
        </h2>

        <div className="k-landing-flow">
          {[
            {
              step: 1,
              title: 'You need something, or have something to offer',
              desc: 'Advice, support, an introduction, mentoring, or a career insight.',
            },
            {
              step: 2,
              title: 'knotify finds the right people',
              desc: 'And the warmest way to reach them, with shared context and a real reason to connect.',
            },
            {
              step: 3,
              title: 'A real conversation happens',
              desc: 'Online or over coffee at a partner café in Munich.',
            },
            {
              step: 4,
              title: 'The relationship stays alive',
              desc: 'And becomes more valuable for both sides over time.',
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
                  background: 'var(--signal)',
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
                  lineHeight: 1.2,
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
          padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 40px)',
          background: 'var(--paper-soft)',
          borderTop: '0.5px solid var(--rule-soft)',
        }}
      >
        <div className="k-landing-manifesto">
          <div>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              Manifesto
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
              The professional internet rewards the loudest ones. The person who
              posts daily, celebrates publicly and makes it all look effortless.
            </p>
            <p style={{ margin: '0 0 16px' }}>
              But most of what actually builds a career happens quietly. The call
              you took at 11 PM. The intros you selflessly made for someone who
              couldn't pay you back. The time you read the draft twice, just because
              they asked.
            </p>
            <p style={{ margin: '0 0 16px' }}>
              knotify is built for that. For the people who show up without an
              audience. We track what professional life actually runs on. Who knows
              you, who'll vouch for you, who you've sat across from. Not your
              follower count. Not how often you post.
            </p>
            <p style={{ margin: 0 }}>
              If that sounds slow, yes. That's the point.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        id="faq"
        style={{
          padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 40px)',
          maxWidth: 820,
          margin: '0 auto',
        }}
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
          FAQ
        </div>
        <h2
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 42,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: '0 0 40px',
          }}
        >
          Questions,{' '}
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>answered.</span>
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FAQS.map((f) => (
            <details
              key={f.q}
              style={{
                borderBottom: '0.5px solid var(--rule)',
                padding: '18px 0',
              }}
            >
              <summary
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: 19,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  cursor: 'pointer',
                  listStyle: 'none',
                }}
              >
                {f.q}
              </summary>
              <p style={{ fontSize: 15, color: 'var(--ink-muted)', lineHeight: 1.6, margin: '12px 0 0' }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Closer than you think ── */}
      <section
        style={{
          background: 'var(--paper-soft)',
          borderTop: '0.5px solid var(--rule-soft)',
          borderBottom: '0.5px solid var(--rule-soft)',
          padding: 'clamp(48px, 6vw, 80px) clamp(16px, 4vw, 40px)',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(30px, 4vw, 44px)',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              margin: '0 0 36px',
            }}
          >
            The right people are often{' '}
            <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>closer than you think.</span>
          </h2>
          <div className="k-landing-3col" style={{ gap: 32 }}>
            {[
              { title: 'One person', accent: 'to ask.' },
              { title: 'One person', accent: 'to help.' },
              { title: 'One relationship', accent: 'worth keeping.' },
            ].map((item) => (
              <div key={item.accent} style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                {item.title}
                <br />
                <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>{item.accent}</span>
              </div>
            ))}
          </div>

          {/* App store badges */}
          <div style={{ marginTop: 44 }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 16 }}>
              Coming soon
            </div>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { store: 'App Store', sub: 'Coming soon to the' },
                { store: 'Google Play', sub: 'Coming soon to' },
              ].map((b) => (
                <div
                  key={b.store}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 18px 10px 12px',
                    borderRadius: 14,
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    opacity: 0.92,
                  }}
                >
                  <img src="/app-icon.svg" alt="knotify app icon" width={36} height={36} style={{ borderRadius: 9, flexShrink: 0 }} />
                  <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                    <div style={{ fontSize: 10, color: 'rgba(250,246,238,0.6)' }}>{b.sub}</div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 500 }}>{b.store}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 40px)' }}>
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
            <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>losing connections?</span>
          </h2>
          <p style={{ fontSize: 15, color: 'var(--ink-muted)', marginBottom: 28, lineHeight: 1.6 }}>
            The private beta is opening to a limited group. Join the waiting list below.
          </p>
          <BetaForm compact />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="k-landing-footer">
        <KnotifyLogoImg variant="full" height={48} />
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {([
            ['Manifesto', () => document.getElementById('manifesto')?.scrollIntoView({ behavior: 'smooth' })],
            ['Blog', () => { window.location.href = '/guides/' }],
            ['Privacy', () => navigate('/privacy')],
            ['Impressum', () => navigate('/impressum')],
          ] as const).map(([label, fn]) => (
            <span key={label} style={{ cursor: 'pointer' }} onClick={fn}>
              {label}
            </span>
          ))}
        </div>
        <span>© 2026 knotify</span>
      </footer>
    </div>
  )
}
