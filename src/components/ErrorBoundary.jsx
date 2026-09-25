import { Component } from 'react'
import { reportError, routeKey } from '../lib/telemetry'
import { buildErrorFeedbackMessage, saveFeedbackDraft } from '../lib/feedback'

// The app has no other error boundary, so before this existed ANY uncaught error
// during render or inside a useEffect would unmount the whole React tree and leave
// a blank page (no console-visible cause in a production build). This boundary
// catches those, keeps the page from going blank, and surfaces the error +
// component stack on screen so the failing file:line is identifiable in one shot.
// Every catch is also reported to errors/{day} (telemetry.js), and REPORT THIS
// PROBLEM opens /notes pre-filled with the error.
//
// It sits outside the router and AuthProvider (see App.jsx), so navigation here
// is a full page load — which also discards the broken tree.
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
    reportError(error, { kind: 'boundary', componentStack: info?.componentStack })
    // Expose for automated tests / quick inspection.
    if (typeof window !== 'undefined') {
      window.__lastError = { message: String(error?.message || error), stack: error?.stack, componentStack: info?.componentStack }
    }
  }

  reportProblem = () => {
    const { error } = this.state
    saveFeedbackDraft({
      type: 'bug',
      message: buildErrorFeedbackMessage({
        message: String(error?.message || error),
        route: routeKey(window.location.pathname),
      }),
    })
    window.location.assign('/notes')
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-4 p-4">
        <p className="font-pixel text-sm text-retro-p2 text-glow-p2">SOMETHING BROKE</p>
        <p className="font-mono text-sm text-retro-dim text-center max-w-sm">Reload usually fixes it.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="min-h-11 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            RELOAD
          </button>
          <a
            href="/"
            className="min-h-11 flex items-center px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
          >
            HOME
          </a>
        </div>
        <button
          type="button"
          onClick={this.reportProblem}
          className="min-h-11 px-4 font-pixel text-[10px] text-retro-dim underline underline-offset-4 hover:text-retro-text transition-colors"
        >
          REPORT THIS PROBLEM
        </button>
        <details className="w-full max-w-lg text-retro-dim">
          <summary className="cursor-pointer font-pixel text-[10px] tracking-wider select-none hover:text-retro-text transition-colors">
            DETAILS
          </summary>
          <pre className="mt-2 w-full overflow-auto text-[11px] leading-relaxed font-mono text-retro-text bg-retro-card border border-retro-border rounded p-3 whitespace-pre-wrap">
{String(error?.message || error)}
{error?.stack ? '\n\n' + error.stack : ''}
{info?.componentStack ? '\n\nComponent stack:' + info.componentStack : ''}
          </pre>
        </details>
      </div>
    )
  }
}
