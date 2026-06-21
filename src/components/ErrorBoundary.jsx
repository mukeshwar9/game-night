import { Component } from 'react'

// The app has no other error boundary, so before this existed ANY uncaught error
// during render or inside a useEffect would unmount the whole React tree and leave
// a blank page (no console-visible cause in a production build). This boundary
// catches those, keeps the page from going blank, and surfaces the error +
// component stack on screen so the failing file:line is identifiable in one shot.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Also log so it shows up in DevTools / chrome-mcp console capture.
    console.error('[ErrorBoundary] caught:', error, info?.componentStack)
    this.setState({ info })
    // Expose for automated tests / quick inspection.
    if (typeof window !== 'undefined') {
      window.__lastError = { message: String(error?.message || error), stack: error?.stack, componentStack: info?.componentStack }
    }
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-4 p-4">
        <p className="font-pixel text-sm text-retro-p2 text-glow-p2">SOMETHING BROKE</p>
        <pre className="w-full max-w-lg overflow-auto text-[11px] leading-relaxed font-mono text-retro-text bg-retro-card border border-retro-border rounded p-3 whitespace-pre-wrap">
{String(error?.message || error)}
{error?.stack ? '\n\n' + error.stack : ''}
{info?.componentStack ? '\n\nComponent stack:' + info.componentStack : ''}
        </pre>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            RELOAD
          </button>
          <a
            href="/"
            className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
          >
            HOME
          </a>
        </div>
      </div>
    )
  }
}
