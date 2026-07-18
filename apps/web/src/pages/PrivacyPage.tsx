import { useNavigate } from 'react-router-dom'
import { KnotifyLogoImg, KBtn } from '@/lib/knotify'
import { useSeo } from '@/lib/seo'
import { LEGAL, LEGAL_OPERATOR_INLINE } from '@/lib/legal'

export function PrivacyPage() {
  const navigate = useNavigate()

  useSeo({
    title: 'Privacy Policy · knotify',
    description: 'Information about how knotify processes personal data under the GDPR.',
    path: '/privacy',
  })

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(18px, 5vw, 40px)', height: 64, borderBottom: '0.5px solid var(--rule-soft)' }}>
        <KnotifyLogoImg variant="wordmark" height={24} />
        <KBtn variant="ghost" size="sm" onClick={() => navigate('/')}>← Back</KBtn>
      </nav>

      <article style={{ maxWidth: 780, margin: 'clamp(32px, 8vw, 56px) auto', padding: '0 24px 56px', lineHeight: 1.7 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>Legal</div>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(34px, 7vw, 42px)', fontWeight: 400, letterSpacing: '-0.03em', margin: '0 0 8px' }}>Datenschutz&shy;erklärung</h1>
        <p style={{ fontStyle: 'italic', fontFamily: "'Fraunces', serif", color: 'var(--signal)', fontSize: 16, margin: '0 0 40px' }}>
          Version 2.0 · 18. Juli 2026
        </p>

        <Section title="1. Verantwortlicher und Kontakt">
          <p>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist {LEGAL_OPERATOR_INLINE}.</p>
          <p>Datenschutzanfragen richten Sie bitte an <Mail address={LEGAL.privacyEmail} />.</p>
        </Section>

        <Section title="2. Welche Daten wir verarbeiten">
          <ul>
            <li><strong>Konto- und Profildaten:</strong> E-Mail-Adresse, Authentifizierungsdaten, Name, Benutzername, Profilfoto, Profilangaben, Fähigkeiten, Ausbildung und Berufserfahrung.</li>
            <li><strong>Netzwerk- und Kommunikationsdaten:</strong> Verbindungen, Einladungen, Empfehlungen, Nachrichten, Reaktionen, Meeting- und Kaffee-Einladungen sowie Zustell- und Lesestatus.</li>
            <li><strong>Inhalte:</strong> Beiträge, Anfragen, Feedback, Job- und Veranstaltungsinteraktionen sowie freiwillig hochgeladene Dokumente. Beim CV-Import wird das Dokument zur Analyse verarbeitet; der Importablauf speichert weder die PDF-Datei noch den extrahierten Rohtext dauerhaft.</li>
            <li><strong>Nutzungs- und Gerätedaten:</strong> aufgerufene Seiten und Funktionen, Zeitstempel, Browser-/Geräteinformationen, IP-Adresse sowie Fehler- und Sicherheitsprotokolle.</li>
            <li><strong>Standortdaten:</strong> Stadt und nur bei freiwilliger Freigabe genauere Standortangaben für Karten- oder Treffpunktfunktionen.</li>
          </ul>
          <p>Nachrichten sind derzeit transportverschlüsselt, aber nicht Ende-zu-Ende-verschlüsselt. Bitte senden Sie keine besonderen Kategorien personenbezogener Daten oder vertrauliche Geheimnisse über die Plattform.</p>
        </Section>

        <Section title="3. Zwecke und Rechtsgrundlagen">
          <ul>
            <li>Bereitstellung von Konto, Profil, Netzwerkgraph, Nachrichten, Empfehlungen und weiteren Plattformfunktionen: Art. 6 Abs. 1 lit. b DSGVO.</li>
            <li>Betriebssicherheit, Missbrauchsverhinderung, Fehleranalyse und Durchsetzung unserer Regeln: Art. 6 Abs. 1 lit. f DSGVO. Unser Interesse ist ein sicherer und zuverlässiger Dienst.</li>
            <li>Optionale Produktanalyse: Art. 6 Abs. 1 lit. a DSGVO. Die Einwilligung kann jederzeit in den Einstellungen oder über den Cookie-Hinweis widerrufen werden.</li>
            <li>Erfüllung gesetzlicher Pflichten und Bearbeitung rechtlicher Anfragen: Art. 6 Abs. 1 lit. c DSGVO.</li>
          </ul>
        </Section>

        <Section title="4. Empfänger und Auftragsverarbeiter">
          <p>Wir setzen Dienstleister nur ein, soweit dies für Betrieb, Sicherheit oder eine von Ihnen gewählte Funktion erforderlich ist:</p>
          <ul>
            <li><strong>Supabase:</strong> Datenbank, Authentifizierung, Realtime-Funktionen und Speicher.</li>
            <li><strong>Vercel und/oder Cloudflare:</strong> Hosting, Auslieferung und Schutz der Webanwendung, abhängig von der jeweiligen Bereitstellung.</li>
            <li><strong>Resend:</strong> Versand transaktionaler E-Mails.</li>
            <li><strong>Sentry:</strong> technische Fehlerdiagnose, soweit aktiviert.</li>
            <li><strong>PostHog:</strong> optionale Produktanalyse nur nach Einwilligung.</li>
            <li><strong>Anthropic oder Google:</strong> KI-gestützte Dokument- oder Assistenzfunktionen, wenn eine solche Funktion ausdrücklich genutzt und serverseitig aktiviert wird. Lokale Modelle können alternativ eingesetzt werden.</li>
          </ul>
          <p>Mit Auftragsverarbeitern schließen wir erforderliche Vereinbarungen nach Art. 28 DSGVO. Eine Weitergabe zu Werbezwecken oder ein Verkauf personenbezogener Daten findet nicht statt.</p>
        </Section>

        <Section title="5. Übermittlungen in Drittländer">
          <p>Einzelne Dienstleister können Daten außerhalb des Europäischen Wirtschaftsraums verarbeiten. In diesem Fall stützen wir die Übermittlung auf einen Angemessenheitsbeschluss oder geeignete Garantien wie die EU-Standardvertragsklauseln und prüfen zusätzliche Schutzmaßnahmen.</p>
        </Section>

        <Section title="6. Speicherdauer">
          <ul>
            <li>Konto-, Profil-, Netzwerk- und Kommunikationsdaten speichern wir grundsätzlich bis zur Löschung des Kontos oder der jeweiligen Inhalte.</li>
            <li>Sicherheits- und technische Protokolle werden nur so lange aufbewahrt, wie sie zur Fehleranalyse und Missbrauchsabwehr erforderlich sind.</li>
            <li>Einwilligungsnachweise und Daten, die gesetzlichen Aufbewahrungspflichten unterliegen, werden für die gesetzlich vorgeschriebene Dauer gespeichert.</li>
            <li>Backups werden nach ihrem regulären Rotationszyklus überschrieben. Eine sofortige selektive Löschung einzelner Datensätze aus verschlüsselten Sicherungen ist technisch nicht immer möglich.</li>
          </ul>
        </Section>

        <Section title="7. Cookies und lokale Speicherung">
          <p>Technisch notwendige Speichermechanismen halten Ihre Sitzung, Sicherheitseinstellungen und App-Präferenzen. Optionale Analyse wird erst nach Ihrer Einwilligung aktiviert. Sie können die Einwilligung jederzeit mit Wirkung für die Zukunft ändern; die Rechtmäßigkeit der vorherigen Verarbeitung bleibt unberührt.</p>
        </Section>

        <Section title="8. Ihre Rechte">
          <p>Sie haben nach Maßgabe der Art. 15–21 DSGVO das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Einwilligungen können Sie jederzeit widerrufen. Zur Ausübung Ihrer Rechte genügt eine Nachricht an <Mail address={LEGAL.privacyEmail} />.</p>
          <p>Sie können sich außerdem bei einer Datenschutzaufsichtsbehörde beschweren. Für nicht-öffentliche Stellen in Bayern ist regelmäßig das <a href="https://www.lda.bayern.de/" target="_blank" rel="noreferrer" style={{ color: 'var(--signal)' }}>Bayerische Landesamt für Datenschutzaufsicht</a> zuständig.</p>
        </Section>

        <Section title="9. Automatisierte Empfehlungen">
          <p>knotify kann Profile, Beziehungen, Fähigkeiten und Aktivitätssignale nutzen, um Kontakte, Jobs oder nächste Schritte zu priorisieren. Diese Empfehlungen treffen keine rechtlich bindenden Entscheidungen und entfalten keine vergleichbar erhebliche Wirkung im Sinne von Art. 22 DSGVO.</p>
        </Section>

        <Section title="10. Sicherheit und Änderungen">
          <p>Wir setzen rollenbasierte Zugriffe, Transportverschlüsselung, Zugriffskontrollen und technische Protokollierung ein. Kein Onlinedienst kann absolute Sicherheit garantieren. Bei wesentlichen Änderungen dieser Erklärung informieren wir in der App oder per E-Mail und aktualisieren Version und Datum auf dieser Seite.</p>
        </Section>
      </article>
    </div>
  )
}

function Mail({ address }: { address: string }) {
  return <a href={`mailto:${address}`} style={{ color: 'var(--signal)' }}>{address}</a>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 10px' }}>{title}</h2>
      <div style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.7 }}>{children}</div>
    </section>
  )
}
