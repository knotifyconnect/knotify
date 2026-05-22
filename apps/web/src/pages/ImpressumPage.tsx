import { useNavigate } from 'react-router-dom'
import { KnotifyLogo, KBtn } from '@/lib/knotify'

export function ImpressumPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
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
        <KnotifyLogo size={19} />
        <KBtn variant="ghost" size="sm" onClick={() => navigate('/')}>← Back</KBtn>
      </nav>

      <article
        style={{
          maxWidth: 600,
          margin: '56px auto',
          padding: '0 24px',
          lineHeight: 1.7,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: 12,
          }}
        >
          Rechtliches
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 42,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: '0 0 8px',
          }}
        >
          Impressum
        </h1>
        <p
          style={{
            fontStyle: 'italic',
            fontFamily: "'Fraunces', serif",
            color: 'var(--signal)',
            fontSize: 16,
            margin: '0 0 40px',
          }}
        >
          Angaben gemäß § 5 TMG
        </p>

        <div
          style={{
            background: 'white',
            border: '0.5px solid var(--rule)',
            borderRadius: 16,
            padding: 28,
            fontSize: 15,
            lineHeight: 1.7,
          }}
        >
          <p style={{ margin: '0 0 4px', fontWeight: 500 }}>[Vor- und Nachname / Firmenname]</p>
          <p style={{ margin: '0 0 4px' }}>[Straße und Hausnummer]</p>
          <p style={{ margin: '0 0 20px' }}>[PLZ] München, Deutschland</p>

          <p style={{ margin: '0 0 4px' }}>
            <strong>E-Mail:</strong>{' '}
            <a href="mailto:hallo@knotify.app" style={{ color: 'var(--signal)' }}>
              hallo@knotify.app
            </a>
          </p>

          <p style={{ margin: '20px 0 0', fontSize: 13, color: 'var(--ink-faint)' }}>
            Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV: [Vor- und Nachname, Adresse wie
            oben]
          </p>
        </div>

        <p
          style={{
            marginTop: 24,
            fontSize: 12.5,
            color: 'var(--ink-faint)',
            lineHeight: 1.6,
          }}
        >
          Dieses Impressum enthält Platzhalter. Bitte tragen Sie die vollständigen Angaben des
          Betreibers ein, bevor der Dienst öffentlich zugänglich gemacht wird.
        </p>
      </article>
    </div>
  )
}
