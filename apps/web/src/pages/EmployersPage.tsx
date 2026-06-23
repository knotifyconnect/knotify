import { useNavigate } from 'react-router-dom'
import { KnotifyLogoImg, KBtn } from '@/lib/knotify'
import { useSeo } from '@/lib/seo'

export function EmployersPage() {
  const navigate = useNavigate()

  useSeo({
    title: 'Hire Munich Talent · For Employers · knotify',
    description:
      'Reach Munich students, internationals and professionals through real relationships, not cold job boards. Build a warm hiring pipeline with knotify. Partner with us in Munich.',
    path: '/employers',
  })

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 40px',
          height: 64,
          borderBottom: '0.5px solid var(--rule-soft)',
        }}
      >
        <div onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <KnotifyLogoImg variant="wordmark" height={26} />
        </div>
        <KBtn variant="signal" size="sm" onClick={() => navigate('/')}>
          Join waiting list
        </KBtn>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '72px 40px 40px' }}>
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
            marginBottom: 24,
          }}
        >
          For employers · Munich
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 'clamp(40px, 5vw, 60px)',
            lineHeight: 1,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: 0,
          }}
        >
          Meet Munich's talent{' '}
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>before they apply.</span>
        </h1>
        <p style={{ fontSize: 17, color: 'var(--ink-muted)', marginTop: 22, lineHeight: 1.6, maxWidth: 600 }}>
          knotify connects companies with the city's students, internationals and professionals
          through real relationships, not cold job boards. Host meet-and-greets, offer office
          tours, and build a warm pipeline of people who already know your team.
        </p>
      </section>

      {/* Value props */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 40px 72px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {[
            {
              title: 'Warm pipeline',
              body: 'Reach candidates who have engaged with your events, tours and team, not anonymous applicants.',
            },
            {
              title: 'Employer brand',
              body: 'Show up where Munich newcomers actually build their network. Become the company they already trust.',
            },
            {
              title: 'Real events',
              body: 'Run office tours, coffee chats and meet-and-greets that plug straight into the knotify network.',
            },
          ].map(c => (
            <div
              key={c.title}
              style={{
                background: 'white',
                border: '0.5px solid var(--rule)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: 20,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  marginBottom: 8,
                }}
              >
                {c.title}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.55 }}>{c.body}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 56 }}>
          <p style={{ fontSize: 15, color: 'var(--ink-muted)', marginBottom: 16 }}>
            Interested in partnering with knotify?
          </p>
          <a href="mailto:hello@knotify.pro?subject=Employer%20partnership">
            <KBtn variant="signal" size="lg">Get in touch, hello@knotify.pro</KBtn>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '0.5px solid var(--rule-soft)',
          padding: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          fontSize: 11,
          color: 'var(--ink-faint)',
        }}
      >
        <KnotifyLogoImg variant="full" height={44} />
        <div style={{ display: 'flex', gap: 24 }}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/privacy')}>Privacy</span>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/impressum')}>Impressum</span>
        </div>
        <span>© 2026 knotify · Munich</span>
      </footer>
    </div>
  )
}
