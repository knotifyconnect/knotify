/**
 * SettingsPage — the account & preferences home.
 *
 * Every control here is wired to something real:
 *  · Account   — email (from the Supabase session), password reset, sign out
 *  · Preferences — sound effects (lib/sound, device-level)
 *  · Privacy   — usage-analytics consent (lib/analyticsConsent getConsent/setConsent)
 *  · Danger    — request account deletion (privacy@knotify.app)
 *
 * Design: modernized flat sections (white + soft shadow), Fraunces title,
 * IBM Plex body. No nested-card chrome.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, Mail, Lock, Bell, ShieldCheck, Volume2, HelpCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/session'
import { getConsent, setConsent } from '../lib/analyticsConsent'
import { soundEnabled, setSoundEnabled } from '../lib/sound'
import { DeskHeader, T, Toggle } from '../lib/desk'
import { KBtn } from '../lib/knotify'
import { useTour } from '../components/tour/TourProvider'

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', boxShadow: 'var(--lift-1)', borderRadius: 18, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: description ? 4 : 14 }}>
        <span style={{ color: T.inkMuted, display: 'flex' }}>{icon}</span>
        <h2 style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
      </div>
      {description && <p style={{ fontSize: 13, color: T.inkMuted, margin: '0 0 16px', lineHeight: 1.5 }}>{description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </section>
  )
}

function Row({ label, sub, right, onClick }: { label: string; sub?: string; right?: React.ReactNode; onClick?: () => void }) {
  const interactive = Boolean(onClick)
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '13px 4px',
        borderTop: `0.5px solid ${T.ruleSoft}`, cursor: interactive ? 'pointer' : 'default',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12.5, color: T.inkMuted, marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>{sub}</div>}
      </div>
      {right}
      {interactive && !right && <ChevronRight size={16} color={T.inkFaint} style={{ flexShrink: 0 }} />}
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const setToken = useSessionStore((s) => s.setToken)
  const [email, setEmail] = useState<string>('')
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sound, setSound] = useState(soundEnabled())
  const [analyticsOn, setAnalyticsOn] = useState(getConsent() === 'granted')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tour = useTour()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')).catch(() => {})
  }, [])

  async function sendPasswordReset() {
    if (!email) return
    setResetState('sending')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/reset-password`,
    })
    setResetState(error ? 'error' : 'sent')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setToken(null)
    window.location.href = '/'
  }

  function toggleSound() {
    const next = !sound
    setSound(next)
    setSoundEnabled(next)
  }

  function toggleAnalytics() {
    const next = !analyticsOn
    setAnalyticsOn(next)
    setConsent(next ? 'granted' : 'denied')
    if (next) void import('../lib/analytics').then((m) => m.initAnalytics()).catch(() => {})
  }

  function requestDeletion() {
    const subject = encodeURIComponent('Account deletion request')
    const body = encodeURIComponent(`Please delete my knotify account associated with ${email || '(your email)'}.`)
    window.location.href = `mailto:privacy@knotify.app?subject=${subject}&body=${body}`
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 60 }}>
      <DeskHeader kicker="Account" title="Settings" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Section icon={<Mail size={17} />} title="Account">
          <Row label="Email" sub={email || 'Loading…'} />
          <Row
            label="Password"
            sub={
              resetState === 'sent' ? 'Reset link sent — check your inbox.'
              : resetState === 'error' ? 'Could not send the reset link. Try again.'
              : 'We\'ll email you a secure link to set a new password.'
            }
            right={
              <KBtn variant="ghost" size="sm" onClick={sendPasswordReset} disabled={resetState === 'sending' || !email}>
                {resetState === 'sending' ? 'Sending…' : resetState === 'sent' ? 'Sent' : 'Change password'}
              </KBtn>
            }
          />
          <Row
            label="Sign out"
            sub="Sign out of knotify on this device."
            right={<KBtn variant="ink" size="sm" onClick={signOut}><LogOut size={13} /> Sign out</KBtn>}
          />
        </Section>

        <Section icon={<Bell size={17} />} title="Preferences">
          <Row
            label="Sound effects"
            sub="Play a short sound when you complete a quest or earn credibility."
            right={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Volume2 size={15} color={sound ? T.verd : T.inkFaint} /><Toggle on={sound} onClick={toggleSound} /></span>}
          />
        </Section>

        <Section icon={<HelpCircle size={17} />} title="Help">
          <Row
            label="Show me around"
            sub="Replay the guided tour of Home, the knot graph, messages and quests."
            right={<KBtn variant="ghost" size="sm" onClick={tour.start}>Start tour</KBtn>}
          />
        </Section>

        <Section icon={<ShieldCheck size={17} />} title="Privacy">
          <Row
            label="Usage analytics"
            sub="Help us improve knotify with anonymous product analytics. You can turn this off anytime."
            right={<Toggle on={analyticsOn} onClick={toggleAnalytics} />}
          />
          <Row label="Privacy policy" onClick={() => navigate('/privacy')} />
          <Row label="Imprint (Impressum)" onClick={() => navigate('/impressum')} />
        </Section>

        <Section icon={<Lock size={17} />} title="Danger zone" description="Deleting your account removes your profile, connections and messages. This cannot be undone.">
          {confirmDelete ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `0.5px solid ${T.ruleSoft}`, paddingTop: 14 }}>
              <div style={{ fontSize: 13.5, color: T.ink }}>This will start an account deletion request. Continue?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <KBtn variant="signal" size="sm" onClick={requestDeletion}>Yes, request deletion</KBtn>
                <KBtn variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</KBtn>
              </div>
            </div>
          ) : (
            <Row
              label="Delete account"
              sub="Send an account deletion request to our team."
              right={
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  style={{ background: 'none', border: `1px solid ${T.signal}`, color: T.signal, fontSize: 12.5, fontWeight: 600, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: T.text }}
                >
                  Delete account
                </button>
              }
            />
          )}
        </Section>
      </div>
    </div>
  )
}
