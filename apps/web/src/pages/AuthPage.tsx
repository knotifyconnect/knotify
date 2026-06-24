import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiPost } from '../lib/api'
import { SignInCard2 } from '../components/ui/sign-in-card-2'
import { useSeo } from '../lib/seo'

const API_BASE = import.meta.env.VITE_API_URL || ''

type AuthMode = 'login' | 'signup' | 'forgot'
type MessageTone = 'error' | 'success'

type SupabaseAuthUserLike = {
  email_confirmed_at?: string | null
  confirmed_at?: string | null
  user_metadata?: Record<string, unknown>
}

function isEmailConfirmed(user: SupabaseAuthUserLike | null | undefined) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at)
}

export function AuthPage() {
  useSeo({
    title: 'Sign in · knotify',
    description: 'Sign in to knotify, the professional network for Munich students and internationals.',
    path: '/login',
    noindex: true,
  })

  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [betaOpen, setBetaOpen] = useState<boolean | null>(null)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/status`)
      .then(r => r.json())
      .then((d: { betaOpen: boolean }) => setBetaOpen(d.betaOpen))
      .catch(() => setBetaOpen(true))
  }, [])

  async function joinWaitlist(e: FormEvent) {
    e.preventDefault()
    setWaitlistLoading(true)
    setWaitlistError('')
    try {
      await apiPost('/api/beta/signup', { email: waitlistEmail.trim().toLowerCase() })
      setWaitlistSubmitted(true)
    } catch (err) {
      setWaitlistError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setWaitlistLoading(false)
    }
  }

  // Persist invite code across email-confirmation redirect so we can claim it
  // after the user verifies and logs in for the first time (handled in OnboardingPage).
  useEffect(() => {
    const code = searchParams.get('invite')
    if (code) {
      try { localStorage.setItem('knotify:pendingInvite', code.trim().toUpperCase()) } catch { /* ignore */ }
    }
  }, [searchParams])
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<MessageTone>('error')

  function showError(value: string) {
    setMessage(value)
    setMessageTone('error')
  }

  function showSuccess(value: string) {
    setMessage(value)
    setMessageTone('success')
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setMessage(null)
    setPassword('')
  }

  useEffect(() => {
    const passwordReset = searchParams.get('passwordReset') === '1'
    const verified = searchParams.get('verified') === '1'

    if (location.pathname === '/signup') {
      changeMode('signup')
      return
    }
    if (location.pathname === '/forgot-password') {
      changeMode('forgot')
      return
    }
    if (location.pathname === '/login') {
      changeMode('login')

      if (passwordReset) {
        showSuccess('Password updated. Sign in with your new password.')
      } else if (verified) {
        showSuccess('Email confirmed. Sign in to continue.')
      }

      return
    }

    const requestedMode = searchParams.get('mode')
    if (requestedMode === 'signup' || requestedMode === 'login' || requestedMode === 'forgot') {
      changeMode(requestedMode)
    }
  }, [location.pathname, searchParams])

  async function completeProfileFromForm() {
    await apiPost('/api/auth/complete-profile', {
      fullName: fullName.trim(),
      username: username.trim(),
      locationCity: 'Munich',
      status: 'open_to_work',
    })
  }

  async function completeProfileFromMetadata(user: SupabaseAuthUserLike | null | undefined) {
    const metadata = user?.user_metadata ?? {}
    const metadataFullName = typeof metadata.fullName === 'string' ? metadata.fullName.trim() : ''
    const metadataUsername = typeof metadata.username === 'string' ? metadata.username.trim() : ''

    if (!metadataFullName || !metadataUsername) return

    await apiPost('/api/auth/complete-profile', {
      fullName: metadataFullName,
      username: metadataUsername,
      locationCity: 'Munich',
      status: 'open_to_work',
    })
  }

  async function login() {
    setLoading(true)
    setMessage(null)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const trimmedPassword = password.trim()

      if (!normalizedEmail || !trimmedPassword) {
        throw new Error('Email and password are required')
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: trimmedPassword,
      })

      if (loginError || !data.session) {
        throw loginError ?? new Error('Missing session')
      }

      if (!isEmailConfirmed(data.user)) {
        await supabase.auth.signOut()
        throw new Error('Email not confirmed. Check your inbox and verify your email before logging in.')
      }

      await completeProfileFromMetadata(data.user).catch(() => undefined)
    } catch (err) {
      const value = err instanceof Error ? err.message : 'Login failed'

      if (value.toLowerCase().includes('invalid login credentials')) {
        showError('Invalid email or password.')
      } else if (value.toLowerCase().includes('email not confirmed')) {
        showError('Email not confirmed. Check your inbox and verify your email before logging in.')
      } else {
        showError(value)
      }
    } finally {
      setLoading(false)
    }
  }

  async function signup() {
    setLoading(true)
    setMessage(null)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const trimmedPassword = password.trim()
      const cleanedFullName = fullName.trim()
      const cleanedUsername = username.trim()

      if (!cleanedFullName || !cleanedUsername) {
        throw new Error('Full Name and Username are required for sign up')
      }
      if (!normalizedEmail || !trimmedPassword) {
        throw new Error('Email and password are required')
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: trimmedPassword,
        options: {
          emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/login?verified=1`,
          data: {
            fullName: cleanedFullName,
            username: cleanedUsername,
          },
        },
      })

      if (signUpError) throw signUpError

      if (data.session && isEmailConfirmed(data.user)) {
        await completeProfileFromForm()
        return
      }

      await supabase.auth.signOut()
      setMode('login')
      setPassword('')
      showSuccess('Signup created. Check your email inbox and confirm your account before logging in.')
    } catch (err) {
      const value = err instanceof Error ? err.message : 'Sign up failed'

      if (value.toLowerCase().includes('email not confirmed')) {
        showSuccess('Signup created. Check your email inbox and confirm your account before logging in.')
      } else {
        showError(value)
      }
    } finally {
      setLoading(false)
    }
  }

  async function sendPasswordReset() {
    setLoading(true)
    setMessage(null)

    try {
      const normalizedEmail = email.trim().toLowerCase()

      if (!normalizedEmail) {
        throw new Error('Enter your email address to receive a reset link.')
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/reset-password`,
      })

      if (resetError) throw resetError

      showSuccess('If an account exists for this email, we sent a password reset link.')
    } catch (err) {
      const value = err instanceof Error ? err.message : 'Could not send reset link'
      const normalizedValue = value.toLowerCase()

      if (normalizedValue.includes('rate limit') || normalizedValue.includes('too many')) {
        showError('Too many reset emails sent. Please try again later.')
      } else {
        showError(value)
      }
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()

    if (mode === 'login') {
      void login()
      return
    }

    if (mode === 'signup') {
      void signup()
      return
    }

    void sendPasswordReset()
  }

  if (betaOpen === false) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ marginBottom: 28, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a09287', fontWeight: 500 }}>knotify</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 700, color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 14px', lineHeight: 1.1 }}>
            Munich's network<br />is invite-only right now.
          </h1>
          <p style={{ fontSize: 15, color: '#6b5f55', lineHeight: 1.7, margin: '0 0 32px' }}>
            We're opening up in waves. Drop your email and we'll let you know when your spot is ready. Already have an invite? Check your inbox.
          </p>

          {waitlistSubmitted ? (
            <div style={{ background: 'rgba(45,125,70,0.08)', border: '0.5px solid rgba(45,125,70,0.2)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#2d7d46', marginBottom: 4 }}>You're on the list.</div>
              <div style={{ fontSize: 13, color: '#6b5f55' }}>We'll email you at <strong>{waitlistEmail}</strong> when your spot opens up.</div>
            </div>
          ) : (
            <form onSubmit={joinWaitlist} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={waitlistEmail}
                onChange={e => setWaitlistEmail(e.target.value)}
                style={{ padding: '13px 14px', borderRadius: 10, border: '0.5px solid rgba(84,72,58,0.2)', background: '#fff', fontSize: 14, color: '#1a1410', outline: 'none', fontFamily: 'inherit' }}
              />
              {waitlistError && <div style={{ fontSize: 13, color: '#D8442B' }}>{waitlistError}</div>}
              <button
                type="submit"
                disabled={waitlistLoading}
                style={{ padding: '13px', borderRadius: 10, border: 'none', background: '#1a1410', color: '#fff', fontSize: 14, fontWeight: 600, cursor: waitlistLoading ? 'not-allowed' : 'pointer', opacity: waitlistLoading ? 0.6 : 1 }}
              >
                {waitlistLoading ? 'Joining…' : 'Join the waitlist'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '0.5px solid rgba(84,72,58,0.12)' }}>
            <button
              onClick={() => setBetaOpen(true)}
              style={{ background: 'none', border: 'none', fontSize: 13, color: '#a09287', cursor: 'pointer', padding: 0 }}
            >
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (betaOpen === null) {
    return <div style={{ minHeight: '100vh', background: '#f5f0e8' }} />
  }

  return (
    <SignInCard2
      mode={mode}
      email={email}
      password={password}
      fullName={fullName}
      username={username}
      loading={loading}
      message={message}
      messageTone={messageTone}
      onModeChange={changeMode}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFullNameChange={setFullName}
      onUsernameChange={setUsername}
      onSubmit={onSubmit}
    />
  )
}


