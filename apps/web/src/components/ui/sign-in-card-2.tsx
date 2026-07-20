/**
 * knotify · Auth Screen
 * Warm editorial sign-in / sign-up / password reset request
 */
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { KnotifyLogoImg, KPill } from '@/lib/knotify'

type AuthMode = 'login' | 'signup' | 'forgot'
type MessageTone = 'error' | 'success'

type SignInCard2Props = {
  mode: AuthMode
  email: string
  password: string
  fullName: string
  username: string
  usernameStatus?: { tone: 'checking' | 'available' | 'taken'; message: string; suggestions: string[] } | null
  loading: boolean
  message?: string | null
  messageTone?: MessageTone
  onModeChange: (mode: AuthMode) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onFullNameChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  /** When set, shows an "invited by" banner above the heading. */
  inviteBanner?: string | null
  /** When true, hides the login/signup switcher (e.g. invite-only with no invite). */
  hideSignupTab?: boolean
  /** When true, the email field is read-only (verified invite pins the address). */
  emailLocked?: boolean
  /** Mandatory legal consent — required to create an account. */
  termsAccepted: boolean
  onTermsAcceptedChange: (value: boolean) => void
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--ink-faint)',
        marginBottom: 7,
        paddingLeft: 2,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      {children}
    </div>
  )
}

function FieldBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '0 14px',
        borderRadius: 12,
        background: 'var(--paper-soft)',
        border: '0.5px solid var(--rule)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 48,
      }}
    >
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 14,
  color: 'var(--ink)',
  fontFamily: "'IBM Plex Sans', sans-serif",
}

function getHeaderCopy(mode: AuthMode) {
  if (mode === 'forgot') {
    return {
      pill: 'account recovery',
      title: (
        <>
          Reset your
          <br />
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
            password.
          </span>
        </>
      ),
      subtitle: 'Enter your email and we will send a secure reset link.',
    }
  }

  if (mode === 'login') {
    return {
      pill: 'for members',
      title: (
        <>
          Welcome back
          <br />
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
            to your knot.
          </span>
        </>
      ),
      subtitle: 'Sign in to continue to knotify.',
    }
  }

  return {
    pill: 'new member',
    title: (
      <>
        Start your
        <br />
        <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>
          knot.
        </span>
      </>
    ),
    subtitle: 'Create your account to get started.',
  }
}

export function SignInCard2({
  mode,
  email,
  password,
  fullName,
  username,
  usernameStatus,
  loading,
  message,
  messageTone = 'error',
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onFullNameChange,
  onUsernameChange,
  onSubmit,
  inviteBanner,
  hideSignupTab,
  emailLocked,
  termsAccepted,
  onTermsAcceptedChange,
}: SignInCard2Props) {
  const [showPassword, setShowPassword] = useState(false)
  const header = getHeaderCopy(mode)
  const showSignupFields = mode === 'signup'
  const showPasswordField = mode !== 'forgot'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'IBM Plex Sans', sans-serif",
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '42%',
          height: '100vh',
          background: 'var(--ink)',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 52,
          boxSizing: 'border-box',
        }}
        className="hidden lg:flex"
      >
        <div>
          <KnotifyLogoImg light height={24} />
        </div>

        <div>
          <div
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontStyle: 'italic',
              fontSize: 48,
              fontWeight: 400,
              color: 'white',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            Networks
            <br />
            <span style={{ color: 'var(--signal)' }}>worth keeping.</span>
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 14,
              color: 'var(--ink-faint)',
              lineHeight: 1.6,
              maxWidth: 380,
            }}
          >
            A quieter professional network for Munich students. Real connections, verified
            skills, warm introductions.
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-faint)',
            display: 'flex',
            gap: 20,
          }}
        >
          <span>© 2026 knotify</span>
          <span>Munich</span>
        </div>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 420,
          marginLeft: 'auto',
          position: 'relative',
          zIndex: 1,
        }}
        className="lg:ml-[42%] lg:pl-16 lg:pr-8"
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }} className="lg:hidden">
          <KnotifyLogoImg variant="wordmark" height={26} />
        </div>

        {inviteBanner && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--paper-soft)',
              border: '0.5px solid var(--rule)',
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 18,
              fontSize: 13.5,
              color: 'var(--ink)',
            }}
          >
            <span style={{ fontSize: 16 }}>🎟️</span>
            <span><strong>{inviteBanner}</strong> invited you to knotify.</span>
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <KPill color="signal">{header.pill}</KPill>
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 36,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: '12px 0 6px',
          }}
        >
          {header.title}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginBottom: 28 }}>
          {header.subtitle}
        </p>

        {mode !== 'forgot' && !hideSignupTab && (
          <div
            style={{
              display: 'flex',
              background: 'var(--paper-soft)',
              borderRadius: 12,
              padding: 4,
              gap: 4,
              marginBottom: 24,
              border: '0.5px solid var(--rule)',
            }}
          >
            {(['login', 'signup'] as AuthMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 9,
                  border: 'none',
                  background: mode === m ? 'white' : 'transparent',
                  color: mode === m ? 'var(--ink)' : 'var(--ink-muted)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontSize: 13.5,
                  fontWeight: mode === m ? 500 : 400,
                  cursor: loading ? 'wait' : 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: mode === m ? '0 1px 4px rgba(84,72,58,0.12)' : 'none',
                }}
              >
                {m === 'login' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {showSignupFields && (
            <div>
              <FieldLabel>Full name</FieldLabel>
              <FieldBox>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => onFullNameChange(e.target.value)}
                  placeholder="Your full name"
                  style={inputStyle}
                  required
                  disabled={loading}
                />
              </FieldBox>
            </div>
          )}

          {showSignupFields && (
            <div>
              <FieldLabel>Username</FieldLabel>
              <FieldBox>
                <span style={{ color: 'var(--ink-faint)', fontSize: 14 }}>@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  placeholder="your_handle"
                  style={inputStyle}
                  disabled={loading}
                />
              </FieldBox>
              <div style={{ marginTop: 6, paddingLeft: 2, fontSize: 11.5, color: usernameStatus?.tone === 'taken' ? 'var(--signal)' : usernameStatus?.tone === 'available' ? 'var(--verd)' : 'var(--ink-faint)' }}>
                {usernameStatus?.message ?? 'Optional. We’ll create a readable unique username from your name.'}
              </div>
              {usernameStatus?.suggestions.length ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                  {usernameStatus.suggestions.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => onUsernameChange(suggestion)} disabled={loading} style={{ border: '0.5px solid var(--rule)', borderRadius: 999, background: 'var(--paper)', color: 'var(--ink-muted)', padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>@{suggestion}</button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          <div>
            <FieldLabel>Email</FieldLabel>
            <FieldBox>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="you@example.com"
                style={emailLocked ? { ...inputStyle, opacity: 0.7, cursor: 'not-allowed' } : inputStyle}
                required
                disabled={loading}
                readOnly={emailLocked}
              />
            </FieldBox>
            {emailLocked && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6, paddingLeft: 2 }}>
                Your invite is tied to this address.
              </div>
            )}
          </div>

          {showPasswordField && (
            <div>
              <FieldLabel>Password</FieldLabel>
              <FieldBox>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="········"
                  style={inputStyle}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--ink-faint)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </FieldBox>
            </div>
          )}

          {mode === 'login' && (
            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => onModeChange('forgot')}
                disabled={loading}
                style={{
                  fontSize: 12,
                  color: 'var(--signal)',
                  cursor: loading ? 'wait' : 'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  textDecoration: 'none',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                Trouble signing in? →
              </button>
            </div>
          )}

          {showSignupFields && (
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => onTermsAcceptedChange(e.target.checked)}
                disabled={loading}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--signal)', flexShrink: 0 }}
              />
              <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.55 }}>
                I agree to knotify's{' '}
                <a href="/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--ink-muted)', textDecoration: 'underline' }}>
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--ink-muted)', textDecoration: 'underline' }}>
                  Privacy Policy
                </a>
                , including how my data is processed.
              </span>
            </label>
          )}

          {message && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: messageTone === 'success' ? 'rgba(65, 128, 92, 0.1)' : 'var(--signal-soft)',
                border:
                  messageTone === 'success'
                    ? '0.5px solid rgba(65, 128, 92, 0.25)'
                    : '0.5px solid rgba(216,68,43,0.25)',
                color: messageTone === 'success' ? 'var(--verd)' : 'var(--signal-deep)',
                fontSize: 13,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (showSignupFields && !termsAccepted)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              height: 48,
              borderRadius: 12,
              background: loading ? 'var(--signal-deep)' : 'var(--signal)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 500,
              fontFamily: "'IBM Plex Sans', sans-serif",
              border: 'none',
              cursor: loading ? 'wait' : showSignupFields && !termsAccepted ? 'not-allowed' : 'pointer',
              opacity: showSignupFields && !termsAccepted && !loading ? 0.55 : 1,
              marginTop: 4,
              transition: 'background 0.15s ease, opacity 0.15s ease',
            }}
          >
            {loading ? (
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  animation: 'spin 0.7s linear infinite',
                  display: 'inline-block',
                }}
              />
            ) : (
              <>
                {mode === 'login' && 'Sign in'}
                {mode === 'signup' && 'Create account'}
                {mode === 'forgot' && 'Send reset link'}
              </>
            )}
          </button>
        </form>

        <p
          style={{
            textAlign: 'center',
            fontSize: 12.5,
            color: 'var(--ink-faint)',
            marginTop: 20,
          }}
        >
          {mode === 'forgot' ? 'Remembered your password? ' : mode === 'login' ? "Don't have an account? " : 'Already a member? '}
          <button
            type="button"
            onClick={() => onModeChange(mode === 'login' ? 'signup' : 'login')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--signal)',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: 12.5,
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            {mode === 'login' ? 'Get an invite →' : 'Sign in'}
          </button>
        </p>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
