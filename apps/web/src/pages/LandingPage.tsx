import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KnotifyLogo, KnotifyMark, KnotifyWordmark, KBtn, KPill, VerifiedBadge } from '@/lib/knotify'

// ─── Animated Network Graphic ───────────────────────────────────────────────
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

      // Draw edges
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

      // Draw nodes
      nodes.forEach((n, i) => {
        const pulse = n.primary ? 1 + 0.06 * Math.sin(t * 1.5) : 1

        if (n.primary) {
          // Outer pulse ring
          const ringAlpha = 0.15 + 0.08 * Math.sin(t * 1.5)
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * pulse * 1.8, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(216,68,43,${ringAlpha})`
          ctx.fill()
        }

        // Node circle
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

        // Label
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

// ─── Floating card components ────────────────────────────────────────────────
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

// ─── Nav ─────────────────────────────────────────────────────────────────────
function LandingNav({ onSignIn, onGetInvite }: { onSignIn: () => void; onGetInvite: () => void }) {
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
        <KnotifyLogo size={20} />
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
        <a href="#pillars" style={{ color: 'inherit', textDecoration: 'none' }}>
          Cafés
        </a>
        <a href="#employer" style={{ color: 'inherit', textDecoration: 'none' }}>
          For employers
        </a>
        <a href="#manifesto" style={{ color: 'inherit', textDecoration: 'none' }}>
          Manifesto
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KBtn variant="ghost" size="sm" onClick={onSignIn}>
          Sign in
        </KBtn>
        <KBtn variant="signal" size="sm" onClick={onGetInvite}>
          Get an invite
        </KBtn>
      </div>
    </nav>
  )
}

// ─── Main LandingPage ────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate()

  function goToSignIn() {
    navigate('/login')
  }

  function goToSignUp() {
    navigate('/signup')
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
      <LandingNav onSignIn={goToSignIn} onGetInvite={goToSignUp} />

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
            Invite only · Munich beta
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
            Networks
            <br />
            <span
              style={{
                fontStyle: 'italic',
                color: 'var(--signal)',
              }}
            >
              worth keeping.
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
            knotify is a quieter professional network. See the people you actually
            know as a living map. Verify what you can do. Get warm intros — over
            coffee, not over a feed.
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 32 }}>
            <KBtn
              variant="signal"
              size="lg"
              onClick={() => goToSignUp()}
              style={{ gap: 10 }}
            >
              <KnotifyMark size={16} color="#fff" />
              Request invite
            </KBtn>
            <KBtn variant="ghost" size="lg" onClick={() => goToSignIn()}>
              Sign in →
            </KBtn>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 36,
              marginTop: 40,
              fontSize: 12,
              color: 'var(--ink-faint)',
            }}
          >
            {[
              { n: '184', l: 'median knot size' },
              { n: '38m', l: 'avg meet length' },
              { n: '92%', l: 'warm-intro reply rate' },
            ].map((s) => (
              <div key={s.l}>
                <div
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontSize: 30,
                    fontWeight: 400,
                    letterSpacing: '-0.03em',
                    color: 'var(--ink)',
                    lineHeight: 1,
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginTop: 3,
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero visual */}
        <div style={{ position: 'relative', height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at center, rgba(216,68,43,0.07) 0%, transparent 65%)',
              pointerEvents: 'none',
            }}
          />
          <NetworkGraphic />

          {/* Floating cards */}
          <FloatCard style={{ top: 24, right: 0, width: 220, transform: 'rotate(2deg)' }}>
            <div
              style={{
                fontSize: 10,
                color: 'var(--ink-faint)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Maya · just verified
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
              }}
            >
              <VerifiedBadge size={13} />
              <span
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontStyle: 'italic',
                  fontSize: 16,
                }}
              >
                UX writing
              </span>
            </div>
            <div
              style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 3 }}
            >
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
            <div
              style={{
                fontSize: 10,
                color: 'var(--signal)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Tomorrow · 4:30pm
            </div>
            <div
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 16,
                lineHeight: 1.2,
                marginTop: 5,
              }}
            >
              Coffee with Maya
              <br />
              <span style={{ fontStyle: 'italic' }}>at Tortoise.</span>
            </div>
          </FloatCard>
        </div>
      </section>

      {/* ── Three pillars ── */}
      <section
        id="pillars"
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 40,
            }}
          >
            {[
              {
                n: '01',
                title: 'See your knot',
                body: 'Your network as a living map. Tier 1, 2 — and the path to anyone you want to meet.',
              },
              {
                n: '02',
                title: "Verify, don’t endorse",
                body: 'Skills are vouched for by named peers, timed challenges, or reviewed portfolios. No hollow likes.',
              },
              {
                n: '03',
                title: 'Meet, in person',
                body: 'Partner cafés in Munich. Soft check-in, perks for members, real conversations.',
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

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}
        >
          {[
            {
              step: 1,
              title: 'Request an invite',
              desc: 'knotify is invite-only. Your first connection is someone who knows you.',
              color: 'var(--signal)',
            },
            {
              step: 2,
              title: 'Build your knot',
              desc: 'Connect with people you actually know. Your network becomes a navigable map.',
              color: 'var(--signal)',
            },
            {
              step: 3,
              title: 'Verify your skills',
              desc: 'Three paths: peer attestation, timed challenge, or portfolio review. No hollow endorsements.',
              color: 'var(--verd)',
            },
            {
              step: 4,
              title: 'Get warm intros',
              desc: 'See who can introduce you to anyone. Over coffee at a partner café.',
              color: 'var(--ochre)',
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
              <div
                style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.5 }}
              >
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
          <div
            style={{
              fontSize: 15,
              color: 'var(--ink-muted)',
              lineHeight: 1.7,
            }}
          >
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

      {/* ── Employer strip ── */}
      <section
        id="employer"
        style={{ padding: '60px 40px' }}
      >
        <div
          style={{
            maxWidth: 1160,
            margin: '0 auto',
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 24,
            padding: '48px 52px',
            display: 'grid',
            gridTemplateColumns: '1.3fr 1fr',
            gap: 40,
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--signal)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              For employers · knotify Talent
            </div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 36,
                fontWeight: 400,
                letterSpacing: '-0.03em',
                margin: '0 0 16px',
                lineHeight: 1.1,
              }}
            >
              Hire through the people who'd{' '}
              <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
                vouch for them.
              </span>
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--ink-faint)',
                lineHeight: 1.6,
                margin: '0 0 24px',
                maxWidth: 480,
              }}
            >
              Post a role, surface candidates with verified skills inside your
              team's 2nd-degree network, and route every application through a warm
              referrer.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <KBtn variant="signal" size="md" onClick={() => goToSignUp()}>
                Get a demo
              </KBtn>
              <KBtn
                variant="ghost"
                size="md"
                onClick={() => goToSignIn()}
                style={{
                  borderColor: 'rgba(255,255,255,0.25)',
                  color: 'var(--paper)',
                }}
              >
                HR sign-in →
              </KBtn>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['TU München', 'LMU München', 'Personio', 'Celonis', 'Siemens', 'Allianz'].map(
              (company) => (
                <div
                  key={company}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    background: '#2A2622',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--paper)' }}>
                    {company}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                    2 open roles
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: '0.5px solid var(--rule-soft)',
          padding: '36px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: 'var(--ink-faint)',
        }}
      >
        <KnotifyLogo size={16} />
        <div style={{ display: 'flex', gap: 24 }}>
          {['Manifesto', 'Cafés', 'For employers', 'Privacy', 'Impressum'].map((l) => (
            <span
              key={l}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                if (l === 'Privacy') navigate('/privacy')
                else if (l === 'Impressum') navigate('/impressum')
              }}
            >
              {l}
            </span>
          ))}
        </div>
        <span>© 2026 knotify · Munich</span>
      </footer>
    </div>
  )
}
