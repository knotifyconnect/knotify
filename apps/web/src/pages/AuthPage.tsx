import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiPost } from '../lib/api'
import { SignInCard2 } from '../components/ui/sign-in-card-2'

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
  const location = useLocation()
  const [searchParams] = useSearchParams()
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
          emailRedirectTo: `${window.location.origin}/login?verified=1`,
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
        redirectTo: `${window.location.origin}/reset-password`,
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


