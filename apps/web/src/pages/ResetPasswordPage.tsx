import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { KnotifyLogo, KnotifyMark, KPill } from '@/lib/knotify'

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 14,
  color: 'var(--ink)',
  fontFamily: "'IBM Plex Sans', sans-serif",
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

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    setSuccess(false)

    try {
      const nextPassword = password.trim()
      const repeatedPassword = confirmPassword.trim()

      if (nextPassword.length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }

      if (nextPassword !== repeatedPassword) {
        throw new Error('Passwords do not match.')
      }

      const { error } = await supabase.auth.updateUser({
        password: nextPassword,
      })

      if (error) throw error

      await supabase.auth.signOut()
      setPassword('')
      setConfirmPassword('')
      navigate('/login?passwordReset=1', { replace: true })
    } catch (err) {
      setSuccess(false)

      const value = err instanceof Error ? err.message : 'Could not update password.'
      const normalizedValue = value.toLowerCase()

      if (
        normalizedValue.includes('auth session missing') ||
        normalizedValue.includes('session missing') ||
        normalizedValue.includes('invalid') ||
        normalizedValue.includes('expired')
      ) {
        setMessage('This reset link is expired or already used. Request a new password reset link.')
      } else {
        setMessage(value)
      }
    } finally {
      setLoading(false)
    }
  }

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
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <KnotifyLogo size={22} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <KPill color="signal">account recovery</KPill>
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
          Choose a new
          <br />
          <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>password.</span>
        </h1>

        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginBottom: 28 }}>
          Enter a new password for your knotify account.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>New password</FieldLabel>
            <FieldBox>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="········"
                style={inputStyle}
                required
                disabled={loading || success}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
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

          <div>
            <FieldLabel>Confirm password</FieldLabel>
            <FieldBox>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="········"
                style={inputStyle}
                required
                disabled={loading || success}
              />
            </FieldBox>
          </div>

          {message && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: success ? 'rgba(65, 128, 92, 0.1)' : 'var(--signal-soft)',
                border: success ? '0.5px solid rgba(65, 128, 92, 0.25)' : '0.5px solid rgba(216,68,43,0.25)',
                color: success ? 'var(--verd)' : 'var(--signal-deep)',
                fontSize: 13,
              }}
            >
              {message}
            </div>
          )}

          {!success && (
            <button
              type="submit"
              disabled={loading}
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
                cursor: loading ? 'wait' : 'pointer',
                marginTop: 4,
                transition: 'background 0.15s ease',
              }}
            >
              {loading ? 'Updating password…' : (
                <>
                  <KnotifyMark size={16} color="#fff" />
                  Update password
                </>
              )}
            </button>
          )}

          {success && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 12,
                background: 'var(--signal)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 500,
                fontFamily: "'IBM Plex Sans', sans-serif",
                border: 'none',
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              Back to sign in
            </button>
          )}

          {!success && message?.toLowerCase().includes('reset link') && (
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 12,
                background: 'var(--signal)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 500,
                fontFamily: "'IBM Plex Sans', sans-serif",
                border: 'none',
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              Request a new reset link
            </button>
          )}
        </form>
      </div>
    </div>
  )
}



