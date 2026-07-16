import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[OpenHood ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[rgba(255,80,0,0.12)] flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-[var(--color-danger)]" />
          </div>
          <h2 className="text-lg font-extrabold text-ink">
            {this.props.fallbackTitle || 'Something went wrong'}
          </h2>
          <p className="text-sm text-ink-3 mt-2 max-w-md">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <Button
            className="mt-5"
            onClick={() => {
              this.setState({ error: null })
              window.location.reload()
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Reload app
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
