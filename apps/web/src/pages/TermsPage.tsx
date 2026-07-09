import { useNavigate } from 'react-router-dom'
import { KnotifyLogoImg, KBtn } from '@/lib/knotify'
import { useSeo } from '@/lib/seo'

export function TermsPage() {
  const navigate = useNavigate()

  useSeo({
    title: 'Terms of Service · knotify',
    description:
      'Terms of Service for knotify, the professional network for Munich students and internationals.',
    path: '/terms',
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
        <KnotifyLogoImg variant="wordmark" height={24} />
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
          Nutzungs&shy;bedingungen
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
          Terms of Service, knotify, v1.0 · Juli 2026
        </p>

        <Section title="1. Geltungsbereich">
          <p>
            Diese Nutzungsbedingungen gelten für die Nutzung von knotify (der „Dienst"), betrieben
            von [Betreiber, Adresse eintragen]. Mit der Erstellung eines Kontos erkennen Sie diese
            Bedingungen sowie unsere{' '}
            <a href="/privacy" style={{ color: 'var(--signal)' }}>
              Datenschutzerklärung
            </a>{' '}
            an.
          </p>
        </Section>

        <Section title="2. Leistungsbeschreibung und Beta-Status">
          <p>
            knotify ist ein Netzwerkdienst für Studierende und internationale Fachkräfte in
            München. Der Dienst befindet sich derzeit in einer frühen Beta-Phase: Funktionen
            können unvollständig sein, sich ändern oder zeitweise nicht verfügbar sein. Eine
            Verfügbarkeits- oder Fehlerfreiheitsgarantie besteht nicht.
          </p>
        </Section>

        <Section title="3. Registrierung und Konto">
          <p>
            Zur Nutzung ist ein Konto erforderlich. Sie sind verpflichtet, wahrheitsgemäße Angaben
            zu machen und Ihre Zugangsdaten geheim zu halten. Sie sind für alle Aktivitäten
            verantwortlich, die über Ihr Konto erfolgen. Die Erstellung mehrerer Konten durch
            dieselbe Person sowie die Weitergabe von Zugangsdaten an Dritte sind nicht gestattet.
          </p>
        </Section>

        <Section title="4. Pflichten der Nutzer:innen">
          <ul style={{ paddingLeft: 20 }}>
            <li>Keine Belästigung, Diskriminierung oder unangemessenes Verhalten gegenüber anderen Mitgliedern.</li>
            <li>Keine irreführenden Angaben zur eigenen Identität, Qualifikation oder Position.</li>
            <li>Kein automatisiertes Auslesen (Scraping), Massen-Kontaktieren oder Missbrauch der Plattform.</li>
            <li>Keine Inhalte, die gegen geltendes Recht verstoßen oder Rechte Dritter verletzen.</li>
          </ul>
          <p>
            Verstöße können zur Einschränkung oder Kündigung des Kontos führen (siehe Ziffer 7).
          </p>
        </Section>

        <Section title="5. Inhalte und Rechte">
          <p>
            Sie behalten alle Rechte an den von Ihnen bereitgestellten Inhalten (z. B. Profildaten,
            Nachrichten, Beiträge). Sie räumen knotify ein einfaches, widerrufliches Recht ein,
            diese Inhalte innerhalb des Dienstes anzuzeigen und zu verarbeiten, soweit dies zur
            Erbringung des Dienstes erforderlich ist. knotify behält sich vor, Inhalte zu entfernen,
            die gegen diese Bedingungen verstoßen.
          </p>
        </Section>

        <Section title="6. Haftungsausschluss">
          <p>
            Der Dienst wird während der Beta-Phase „wie besehen" bereitgestellt. knotify haftet
            nicht für mittelbare Schäden, entgangenen Gewinn oder Datenverlust, soweit gesetzlich
            zulässig. Die Haftung für Vorsatz, grobe Fahrlässigkeit sowie Schäden an Leben, Körper
            oder Gesundheit bleibt unberührt.
          </p>
        </Section>

        <Section title="7. Kontobeendigung">
          <p>
            Sie können Ihr Konto jederzeit über die Einstellungen löschen. knotify kann Konten bei
            Verstößen gegen diese Bedingungen einschränken oder kündigen. Nach Löschung werden
            personenbezogene Daten gemäß unserer{' '}
            <a href="/privacy" style={{ color: 'var(--signal)' }}>
              Datenschutzerklärung
            </a>{' '}
            entfernt.
          </p>
        </Section>

        <Section title="8. Änderungen dieser Bedingungen">
          <p>
            Wir können diese Bedingungen anpassen, insbesondere um neue Funktionen oder rechtliche
            Anforderungen abzubilden. Über wesentliche Änderungen informieren wir per E-Mail oder
            In-App-Hinweis. Die fortgesetzte Nutzung nach Inkrafttreten gilt als Zustimmung.
          </p>
        </Section>

        <Section title="9. Anwendbares Recht und Gerichtsstand">
          <p>
            Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist, soweit
            gesetzlich zulässig, München.
          </p>
        </Section>

        <Section title="10. Kontakt">
          <p>
            Fragen zu diesen Bedingungen richten Sie an{' '}
            <a href="mailto:hello@knotify.app" style={{ color: 'var(--signal)' }}>
              hello@knotify.app
            </a>
            .
          </p>
        </Section>

        <p
          style={{
            marginTop: 24,
            fontSize: 12.5,
            color: 'var(--ink-faint)',
            lineHeight: 1.6,
          }}
        >
          Dieser Entwurf ist eine erste Fassung und enthält Platzhalter. Bitte vor dem öffentlichen
          Start rechtlich prüfen und die Betreiberangaben vervollständigen.
        </p>
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
