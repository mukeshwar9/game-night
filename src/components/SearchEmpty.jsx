// The "no games match" moment shared by the catalog and the party picker: say
// what was searched, offer CLEAR SEARCH, and suggest terms that do find games.
import { SUGGESTED_SEARCH_TERMS } from '../lib/gameSearch'

export default function SearchEmpty({ query, onClear, onSuggest, testId }) {
  return (
    <div data-testid={testId} className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-3">
      <p className="font-mono text-sm text-retro-text break-words">
        No games match &ldquo;{query.trim()}&rdquo;.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[9px] tracking-wider rounded hover:shadow-neon-cta transition press"
      >
        CLEAR SEARCH
      </button>
      <div className="space-y-2">
        <p className="font-mono text-xs text-retro-dim">Try one of these:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTED_SEARCH_TERMS.map(term => (
            <button
              key={term}
              type="button"
              onClick={() => onSuggest(term)}
              className="min-h-11 px-3 border border-retro-border bg-retro-surface text-retro-text font-mono text-xs rounded hover:border-retro-cta/60 transition press"
            >
              {term}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
