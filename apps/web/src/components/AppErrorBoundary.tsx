import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui/Button'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  message: string
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Unexpected UI error',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary', error, info)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="min-h-screen bg-bg-base text-text-primary grid place-items-center p-4">
        <div className="w-full max-w-xl rounded-xl border border-border-default bg-bg-surface p-6 space-y-3">
          <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-text-secondary">The app hit an unexpected error and stopped rendering this screen.</p>
          <p className="text-sm text-accent-red break-words">{this.state.message}</p>
          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()}>Reload app</Button>
            <Button
              variant="secondary"
              onClick={() => {
                localStorage.removeItem('nodenet_token')
                window.location.href = '/'
              }}
            >
              Reset session
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
