import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiPost } from '../lib/api'
import { SignInCard2 } from '../components/ui/sign-in-card-2'

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
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (location.pathname === '/signup') {
      setMode('signup')
      return
    }
    if (location.pathname === '/login') {
      setMode('login')
      return
    }
    const requestedMode = searchParams.get('mode')
    if (requestedMode === 'signup' || requestedMode === 'login') {
      setMode(requestedMode)
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
    setError(null)
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
      const message = err instanceof Error ? err.message : 'Login failed'
      if (message.toLowerCase().includes('invalid login credentials')) {
        setError('Invalid email or password.')
      } else if (message.toLowerCase().includes('email not confirmed')) {
        setError('Email not confirmed. Check your inbox and verify your email before logging in.')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function signup() {
    setLoading(true)
    setError(null)
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
      setError('Signup created. Check your email inbox and confirm your account before logging in.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed'
      if (message.toLowerCase().includes('email not confirmed')) {
        setError('Signup created. Check your email inbox and confirm your account before logging in.')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void (mode === 'login' ? login() : signup())
  }

  return (
    <SignInCard2
      mode={mode}
      email={email}
      password={password}
      fullName={fullName}
      username={username}
      loading={loading}
      error={error}
      onModeChange={setMode}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFullNameChange={setFullName}
      onUsernameChange={setUsername}
      onSubmit={onSubmit}
    />
  )
}