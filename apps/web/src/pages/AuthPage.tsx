import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiGet, apiPost, ApiError } from '../lib/api'
import { SignInCard2 } from '../components/ui/sign-in-card-2'
import { useSeo } from '../lib/seo'
import { readPendingInvite, writePendingInvite } from '../lib/invite'
import { useSessionStore } from '../store/session'

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

  // The invite code can arrive in the URL or have been stashed on a prior visit.
  // Not upper-cased: verified email-invite tokens are case-sensitive.
  const inviteCode = (searchParams.get('invite') || readPendingInvite() || '').trim()
  // Approval emails link here with ?email=... so an already-approved waitlist
  // signup skips straight to the form instead of the waitlist screen.
  const approvedEmailParam = (searchParams.get('email') || '').trim()

  const [accessMode, setAccessMode] = useState<'open' | 'invite_only' | null>(null)
  const [inviteValid, setInviteValid] = useState(false)
  const [inviterName, setInviterName] = useState<string | null>(null)
  const [lockedEmail, setLockedEmail] = useState<string | null>(null)
  // A visitor without an invite can still choose to sign in to an existing account.
  const [forceAuth, setForceAuth] = useState(false)

  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (inviteCode) params.set('invite', inviteCode)
    if (approvedEmailParam) params.set('email', approvedEmailParam)
    const q = params.toString() ? `?${params.toString()}` : ''
    fetch(`${API_BASE}/api/access/context${q}`)
      .then(r => r.json())
      .then((d: { mode: 'open' | 'invite_only'; invite: { valid: boolean; inviterName: string | null; lockedEmail: string | null } | null }) => {
        setAccessMode(d.mode)
        setInviteValid(Boolean(d.invite?.valid))
        setInviterName(d.invite?.inviterName ?? null)
        // Verified email invites (and approved waitlist emails) pin signup to that address.
        if (d.invite?.valid && d.invite.lockedEmail) {
          setLockedEmail(d.invite.lockedEmail)
          setEmail(d.invite.lockedEmail)
        } else {
          setLockedEmail(null)
        }
      })
      .catch(() => setAccessMode('open'))
  }, [inviteCode, approvedEmailParam])

  async function joinWaitlist(e: FormEvent) {
    e.preventDefault()
    setWaitlistLoading(true)
    setWaitlistError('')
    try {
      await apiPost('/api/beta', { email: waitlistEmail.trim().toLowerCase(), marketing_consent: true })
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
    if (code) writePendingInvite(code)
  }, [searchParams])
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<{ tone: 'checking' | 'available' | 'taken'; message: string; suggestions: string[] } | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<MessageTone>('error')
  const setProfileSetupBlocking = useSessionStore((s) => s.setProfileSetupBlocking)

  useEffect(() => {
    if (mode !== 'signup' || fullName.trim().length < 2) {
      setUsernameStatus(null)
      return
    }
    const timer = window.setTimeout(() => {
      setUsernameStatus({ tone: 'checking', message: 'Checking username…', suggestions: [] })
      const params = new URLSearchParams({ fullName: fullName.trim() })
      // Until the member edits the handle, keep deriving it from their latest
      // full name instead of freezing an early suggestion mid-typing.
      if (usernameTouched && username.trim()) params.set('username', username.trim())
      apiGet<{ available: boolean | null; normalizedPreferred: string | null; suggestions: string[] }>(`/api/auth/username-options?${params}`)
        .then((result) => {
          if (!usernameTouched && result.suggestions[0]) {
            setUsername(result.suggestions[0])
            setUsernameStatus({ tone: 'available', message: `@${result.suggestions[0]} is ready for you`, suggestions: result.suggestions.slice(1) })
            return
          }
          if (result.available === false) {
            setUsernameStatus({ tone: 'taken', message: 'That username is taken.', suggestions: result.suggestions })
          } else if (result.normalizedPreferred) {
            setUsernameStatus({ tone: 'available', message: `@${result.normalizedPreferred} is available`, suggestions: result.suggestions.filter((item) => item !== result.normalizedPreferred) })
          } else {
            setUsernameStatus({ tone: 'available', message: 'Leave this blank and we’ll assign a unique name-based username.', suggestions: result.suggestions })
          }
        })
        .catch(() => setUsernameStatus(null))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [mode, fullName, username, usernameTouched])

  // Set when the username chosen at signup was already taken and the profile
  // row couldn't be created. The session stays alive so the user can pick a
  // different one here, instead of the app silently falling back to an
  // auto-generated username.
  const [usernameConflict, setUsernameConflict] = useState<{ fullName: string; termsAccepted: boolean } | null>(null)
  const [retryUsername, setRetryUsername] = useState('')
  const [retrySubmitting, setRetrySubmitting] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

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
      termsAccepted,
    })
  }

  async function completeProfileFromMetadata(user: SupabaseAuthUserLike | null | undefined) {
    const metadata = user?.user_metadata ?? {}
    const metadataFullName = typeof metadata.fullName === 'string' ? metadata.fullName.trim() : ''
    const metadataUsername = typeof metadata.username === 'string' ? metadata.username.trim() : ''

    if (!metadataFullName) return

    await apiPost('/api/auth/complete-profile', {
      fullName: metadataFullName,
      username: metadataUsername || undefined,
      locationCity: 'Munich',
      status: 'open_to_work',
      // Recorded at signup time in the auth identity metadata — the server only
      // trusts this to satisfy the requirement for brand-new accounts (see
      // apps/api/src/routes/auth.ts), never to overwrite an existing acceptance.
      termsAccepted: metadata.termsAccepted === true,
    })
  }

  // Enters username-conflict recovery mode: the session stays alive (so the
  // retry form below can call complete-profile again) but App.tsx is told to
  // withhold routing into the authenticated app until it's resolved.
  function enterUsernameConflict(nameForConflict: string, termsAcceptedForConflict: boolean) {
    setUsernameConflict({ fullName: nameForConflict, termsAccepted: termsAcceptedForConflict })
    setRetryUsername('')
    setRetryError(null)
  }

  async function submitUsernameRetry(e: FormEvent) {
    e.preventDefault()
    if (!usernameConflict) return

    const nextUsername = retryUsername.trim()
    if (!nextUsername) {
      setRetryError('Enter a username.')
      return
    }

    setRetrySubmitting(true)
    setRetryError(null)
    try {
      await apiPost('/api/auth/complete-profile', {
        fullName: usernameConflict.fullName,
        username: nextUsername,
        locationCity: 'Munich',
        status: 'open_to_work',
        termsAccepted: usernameConflict.termsAccepted,
      })
      setUsernameConflict(null)
      setProfileSetupBlocking(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRetryError('That username is taken too — try another.')
      } else {
        setRetryError(err instanceof Error ? err.message : 'Could not save username. Please try again.')
      }
    } finally {
      setRetrySubmitting(false)
    }
  }

  async function cancelUsernameConflict() {
    await supabase.auth.signOut()
    setUsernameConflict(null)
    setProfileSetupBlocking(false)
    setMode('login')
    setPassword('')
  }

  async function login() {
    setLoading(true)
    setMessage(null)
    setProfileSetupBlocking(true)
    let enteredConflict = false

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

      try {
        await completeProfileFromMetadata(data.user)
      } catch (profileErr) {
        // The chosen username lost a race (someone already has it) or the
        // profile otherwise failed to save. Keep the session alive so the
        // recovery form can retry with a different username, instead of
        // letting the user continue into the app where /api/users/me would
        // silently create their account under a random fallback username.
        if (profileErr instanceof ApiError && profileErr.status === 409) {
          const metadata = data.user?.user_metadata ?? {}
          const metadataFullName = typeof metadata.fullName === 'string' ? metadata.fullName.trim() : ''
          enterUsernameConflict(metadataFullName, metadata.termsAccepted === true)
          enteredConflict = true
          return
        }
        await supabase.auth.signOut()
        throw new Error('We could not finish setting up your profile. Please try again, or contact support if this keeps happening.')
      }
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
      if (!enteredConflict) setProfileSetupBlocking(false)
    }
  }

  async function signup() {
    setLoading(true)
    setMessage(null)
    setProfileSetupBlocking(true)
    let enteredConflict = false

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const trimmedPassword = password.trim()
      const cleanedFullName = fullName.trim()
      const cleanedUsername = username.trim()

      if (!cleanedFullName) {
        throw new Error('Full name is required for sign up')
      }
      if (usernameStatus?.tone === 'taken') throw new Error('That username is already taken. Choose one of the available suggestions.')
      if (!normalizedEmail || !trimmedPassword) {
        throw new Error('Email and password are required')
      }
      if (!termsAccepted) {
        throw new Error('Please accept the Terms of Service and Privacy Policy to continue.')
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: trimmedPassword,
        options: {
          emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/login?verified=1`,
          data: {
            fullName: cleanedFullName,
            ...(cleanedUsername ? { username: cleanedUsername } : {}),
            // Travels with the auth identity so the server can validate access
            // server-side at first request, without trusting localStorage.
            ...(inviteCode ? { inviteCode } : {}),
            termsAccepted: true,
          },
        },
      })

      if (signUpError) throw signUpError

      if (data.session && isEmailConfirmed(data.user)) {
        try {
          await completeProfileFromForm()
        } catch (profileErr) {
          if (profileErr instanceof ApiError && profileErr.status === 409) {
            enterUsernameConflict(cleanedFullName, true)
            enteredConflict = true
            return
          }
          await supabase.auth.signOut()
          throw new Error('We could not finish setting up your profile. Please try again, or contact support if this keeps happening.')
        }
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
      if (!enteredConflict) setProfileSetupBlocking(false)
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

  if (accessMode === null) {
    return <div style={{ minHeight: '100vh', background: '#f5f0e8' }} />
  }

  if (usernameConflict) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ marginBottom: 28, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a09287', fontWeight: 500 }}>knotify</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 14px', lineHeight: 1.15 }}>
            That username is taken.
          </h1>
          <p style={{ fontSize: 15, color: '#6b5f55', lineHeight: 1.7, margin: '0 0 28px' }}>
            Someone already has that handle, {usernameConflict.fullName || 'there'}. Pick another one to finish setting up your account.
          </p>

          <form onSubmit={submitUsernameRetry} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              required
              autoFocus
              placeholder="anna_m"
              value={retryUsername}
              onChange={e => setRetryUsername(e.target.value)}
              style={{ padding: '13px 14px', borderRadius: 10, border: '0.5px solid rgba(84,72,58,0.2)', background: '#fff', fontSize: 14, color: '#1a1410', outline: 'none', fontFamily: 'inherit' }}
            />
            {retryError && <div style={{ fontSize: 13, color: '#D8442B' }}>{retryError}</div>}
            <button
              type="submit"
              disabled={retrySubmitting}
              style={{ padding: '13px', borderRadius: 10, border: 'none', background: '#1a1410', color: '#fff', fontSize: 14, fontWeight: 600, cursor: retrySubmitting ? 'not-allowed' : 'pointer', opacity: retrySubmitting ? 0.6 : 1 }}
            >
              {retrySubmitting ? 'Saving…' : 'Save username'}
            </button>
          </form>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '0.5px solid rgba(84,72,58,0.12)' }}>
            <button
              onClick={() => { void cancelUsernameConflict() }}
              style={{ background: 'none', border: 'none', fontSize: 13, color: '#a09287', cursor: 'pointer', padding: 0 }}
            >
              Cancel and sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Invite-only, no valid invite, and the visitor hasn't chosen to sign in:
  // show the waitlist. This is the only place public signup is withheld.
  if (accessMode === 'invite_only' && !inviteValid && !forceAuth) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ marginBottom: 28, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a09287', fontWeight: 500 }}>knotify</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 700, color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 14px', lineHeight: 1.1 }}>
            Munich's network<br />is invite-only right now.
          </h1>
          <p style={{ fontSize: 15, color: '#6b5f55', lineHeight: 1.7, margin: '0 0 32px' }}>
            We're opening up in waves. Drop your email and we'll let you know when your spot is ready. Got an invite link from a member? Open it to join straight away.
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
              onClick={() => { setForceAuth(true); changeMode('login') }}
              style={{ background: 'none', border: 'none', fontSize: 13, color: '#a09287', cursor: 'pointer', padding: 0 }}
            >
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  const invited = accessMode === 'invite_only' && inviteValid

  return (
    <SignInCard2
      mode={mode}
      email={email}
      password={password}
      fullName={fullName}
      username={username}
      usernameStatus={usernameStatus}
      loading={loading}
      message={message}
      messageTone={messageTone}
      onModeChange={changeMode}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFullNameChange={setFullName}
      onUsernameChange={(value) => { setUsernameTouched(true); setUsername(value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+/, '').slice(0, 32)) }}
      onSubmit={onSubmit}
      inviteBanner={invited ? inviterName : null}
      hideSignupTab={accessMode === 'invite_only' && !inviteValid}
      emailLocked={Boolean(lockedEmail) && mode === 'signup'}
      termsAccepted={termsAccepted}
      onTermsAcceptedChange={setTermsAccepted}
    />
  )
}


