import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** A render failure shows what went wrong instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('render failed', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="text-ivory absolute inset-0 flex items-center justify-center p-6">
        <div className="glass max-w-md p-5">
          <div className="label">something broke while rendering</div>
          <div className="mt-2 font-mono text-[12.5px] break-words">{this.state.error.message}</div>
          <div className="mt-4 flex gap-2">
            <button
              className="bg-amber text-bg h-8 rounded-full px-4 text-[12.5px] font-medium"
              onClick={() => {
                this.setState({ error: null })
                this.props.onReset?.()
              }}
            >
              Back home
            </button>
            <a className="btn h-8 rounded-full px-3" href="https://github.com/harshitaajoshi/codeskyline/issues" target="_blank" rel="noreferrer">
              Report
            </a>
          </div>
        </div>
      </div>
    )
  }
}
