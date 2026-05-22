import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiPost } from '../lib/api'
import { useSessionStore } from '../store/session'
import { SignInCard2 } from '../components/ui/sign-in-card-2'

export function AuthPage() {
  const setToken = useSessionStore((s) => s.setToken)
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
      if (loginError || !data.session) throw loginError ?? new Error('Missing session')
      setToken(data.session.access_token)
      // onAuthStateChange in App.tsx fires SIGNED_IN and updates the token,
      // which switches AnimatedRoutes to ProtectedRoutes → redirects /auth → /home
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      if (message.toLowerCase().includes('invalid login credentials')) {
        setError('Invalid email or password.')
      } else if (message.toLowerCase().includes('email not confirmed')) {
        setError('Email not confirmed. Use a confirmed account or disable email confirmation in Supabase Auth settings.')
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

      if (!fullName.trim() || !username.trim()) {
        throw new Error('Full Name and Username are required for sign up')
      }
      if (!normalizedEmail || !trimmedPassword) {
        throw new Error('Email and password are required')
      }

      const { error: signUpError } = await supabase.auth.signUp({ email: normalizedEmail, password: trimmedPassword })
      if (signUpError) throw signUpError

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: trimmedPassword,
      })
      if (loginError || !data.session) throw loginError ?? new Error('Missing session')
      setToken(data.session.access_token)

      await apiPost('/api/auth/complete-profile', {
        fullName: fullName.trim(),
        username: username.trim(),
        locationCity: 'Munich',
        status: 'open_to_work',
      })
      // onAuthStateChange fires SIGNED_IN — routing handled automatically
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed'
      if (message.toLowerCase().includes('email not confirmed')) {
        setError('Signup succeeded but email confirmation is enabled. Confirm the email, then login.')
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

