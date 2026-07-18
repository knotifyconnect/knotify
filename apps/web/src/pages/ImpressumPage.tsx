import { useNavigate } from 'react-router-dom'
import { KnotifyLogoImg, KBtn } from '@/lib/knotify'
import { useSeo } from '@/lib/seo'
import { LEGAL, LEGAL_ADDRESS } from '@/lib/legal'

export function ImpressumPage() {
  const navigate = useNavigate()

  useSeo({
    title: 'Impressum · knotify',
    description: 'Anbieterkennzeichnung und Kontaktangaben für knotify.',
    path: '/impressum',
  })

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(18px, 5vw, 40px)', height: 64, borderBottom: '0.5px solid var(--rule-soft)' }}>
        <KnotifyLogoImg variant="wordmark" height={24} />
        <KBtn variant="ghost" size="sm" onClick={() => navigate('/')}>← Back</KBtn>
      </nav>

      <article style={{ maxWidth: 680, margin: 'clamp(32px, 8vw, 56px) auto', padding: '0 24px 48px', lineHeight: 1.7 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>Rechtliches</div>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(34px, 7vw, 42px)', fontWeight: 400, letterSpacing: '-0.03em', margin: '0 0 8px' }}>Impressum</h1>
        <p style={{ fontStyle: 'italic', fontFamily: "'Fraunces', serif", color: 'var(--signal)', fontSize: 16, margin: '0 0 40px' }}>
          Angaben gemäß § 5 DDG
        </p>

        <LegalCard title="Diensteanbieter">
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{LEGAL.operatorName}</p>
          {LEGAL_ADDRESS.map((line) => <p key={line} style={{ margin: '0 0 4px' }}>{line}</p>)}
          <p style={{ margin: '14px 0 0' }}><strong>Vertreten durch:</strong> {LEGAL.representative}</p>
        </LegalCard>

        <LegalCard title="Kontakt">
          <p style={{ margin: 0 }}>
            <strong>E-Mail:</strong>{' '}
            <a href={`mailto:${LEGAL.email}`} style={{ color: 'var(--signal)' }}>{LEGAL.email}</a>
          </p>
          {LEGAL.phone && <p style={{ margin: '4px 0 0' }}><strong>Telefon:</strong> {LEGAL.phone}</p>}
        </LegalCard>

        {(LEGAL.registerCourt || LEGAL.registerNumber || LEGAL.vatId) && (
          <LegalCard title="Register- und Steuerangaben">
            {LEGAL.registerCourt && <p style={{ margin: '0 0 4px' }}><strong>Registergericht:</strong> {LEGAL.registerCourt}</p>}
            {LEGAL.registerNumber && <p style={{ margin: '0 0 4px' }}><strong>Registernummer:</strong> {LEGAL.registerNumber}</p>}
            {LEGAL.vatId && <p style={{ margin: 0 }}><strong>Umsatzsteuer-ID gemäß § 27a UStG:</strong> {LEGAL.vatId}</p>}
          </LegalCard>
        )}

        <LegalCard title="Redaktionell verantwortlich">
          <p style={{ margin: 0 }}>{LEGAL.representative}, Anschrift wie oben.</p>
        </LegalCard>

        <LegalCard title="Verbraucherstreitbeilegung">
          <p style={{ margin: 0 }}>
            Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </LegalCard>

        <LegalCard title="Haftung für Links">
          <p style={{ margin: 0 }}>
            Für Inhalte externer Websites, auf die wir verlinken, sind ausschließlich deren Betreiber verantwortlich. Bei Bekanntwerden einer Rechtsverletzung entfernen wir den betreffenden Link.
          </p>
        </LegalCard>
      </article>
    </div>
  )
}

function LegalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 16, padding: 24, fontSize: 14.5, lineHeight: 1.7, marginBottom: 14 }}>
      <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 10px' }}>{title}</h2>
      <div style={{ color: 'var(--ink-soft)' }}>{children}</div>
    </section>
  )
}
