/**
 * Render-error isolation (feature "Error boundary"): a crash in one widget or
 * area must not unmount the whole app. Per-widget + per-area boundaries render
 * a small card with the message and a Retry (remount children) control.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from './i18n'

interface Props {
  name?: string
  children: ReactNode
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
    console.error(`[clive] render error in ${this.props.name ?? 'app'}`, error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div data-error-boundary={this.props.name ?? 'app'} className="rounded-lg border border-error/40 bg-error/5 p-3 text-xs">
        <div className="font-semibold text-error">{i18n.t('common.crashed', { name: this.props.name ?? '' })}</div>
        <div className="mt-1 line-clamp-3 opacity-60">{String(this.state.error.message ?? this.state.error)}</div>
        <button data-bar-control className="btn btn-xs btn-outline mt-2" onClick={this.reset}>
          {i18n.t('common.retry')}
        </button>
      </div>
    )
  }
}
