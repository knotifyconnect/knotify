import { useState } from 'react'
import type { FormEvent } from 'react'
import { SignInCard2 } from '@/components/ui/sign-in-card-2'

export function SignInCard2Demo() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <SignInCard2
      mode={mode}
      email={email}
      password={password}
      fullName={fullName}
      username={username}
      loading={false}
      message={null}
      messageTone="error"
      onModeChange={setMode}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFullNameChange={setFullName}
      onUsernameChange={setUsername}
      onSubmit={onSubmit}
    />
  )
}

