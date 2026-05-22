import { useNavigate } from 'react-router-dom'
import { KnotifyLogo, KBtn } from '@/lib/knotify'

export function PrivacyPage() {
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
          maxWidth: 740,
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
          Legal
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
          Datenschutz&shy;erklärung
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
          Privacy Policy — knotify, v1.0 · May 2026
        </p>

        <Section title="1. Wer ist verantwortlich?">
          <p>
            Verantwortliche im Sinne der DSGVO ist: [Betreiber — Adresse eintragen]. E-Mail:{' '}
            <a href="mailto:privacy@knotify.app" style={{ color: 'var(--signal)' }}>
              privacy@knotify.app
            </a>
          </p>
        </Section>

        <Section title="2. Welche Daten erheben wir?">
          <p>
            Wir erheben nur Daten, die zur Bereitstellung des Dienstes notwendig sind: E-Mail-Adresse
            und Passwort (Authentifizierung), vollständiger Name und Benutzername (Profildarstellung),
            hochgeladene Profilbilder, Verbindungen zwischen Nutzern (Netzwerkgraph), Nachrichten
            (Ende-zu-Ende-verschlüsselt geplant), sowie Aktivitätsprotokoll (Anmeldungen,
            IP-Adresse, User-Agent).
          </p>
        </Section>

        <Section title="3. Rechtsgrundlagen (Art. 6 DSGVO)">
          <ul style={{ paddingLeft: 20 }}>
            <li>Art. 6 Abs. 1 lit. b — Vertragserfüllung (Kontozugang)</li>
            <li>Art. 6 Abs. 1 lit. c — Rechtliche Verpflichtung</li>
            <li>Art. 6 Abs. 1 lit. f — Berechtigte Interessen (Sicherheit, Missbrauchsschutz)</li>
          </ul>
        </Section>

        <Section title="4. Drittanbieter">
          <p>
            <strong>Supabase (EU-Region Frankfurt):</strong> Datenbankhosting, Authentifizierung und
            Dateispeicherung. Verarbeitung auf Grundlage eines Auftragsverarbeitungsvertrags (DPA).
          </p>
          <p>
            <strong>Anthropic (USA):</strong> KI-gestützte CV-Analyse (sofern aktiviert). Die
            Übermittlung erfolgt nur mit ausdrücklicher Zustimmung auf Basis von Standardvertragsklauseln
            (SCCs, Art. 46 DSGVO).
          </p>
        </Section>

        <Section title="5. Ihre Rechte (Art. 15–21 DSGVO)">
          <p>
            Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
            Datenübertragbarkeit und Widerspruch. Richten Sie Anfragen an{' '}
            <a href="mailto:privacy@knotify.app" style={{ color: 'var(--signal)' }}>
              privacy@knotify.app
            </a>
            . Sie haben außerdem das Recht, sich bei der zuständigen Datenschutzbehörde zu beschweren.
          </p>
        </Section>

        <Section title="6. Cookies">
          <p>
            Wir verwenden ausschließlich technisch notwendige Session-Cookies zur Authentifizierung.
            Keine Tracking- oder Marketing-Cookies.
          </p>
        </Section>

        <Section title="7. Speicherdauer">
          <p>
            Kontodaten werden für die Dauer der Mitgliedschaft gespeichert. Nach Löschung des Kontos
            werden personenbezogene Daten innerhalb von 30 Tagen vollständig entfernt, sofern keine
            gesetzlichen Aufbewahrungspflichten entgegenstehen.
          </p>
        </Section>
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          margin: '0 0 10px',
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}
