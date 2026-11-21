import { forwardRef } from 'react'

// The games search box shared by the catalog/switcher picker (GamePicker) and
// the party lobby. Matching itself lives in lib/gameSearch.js.
const GameSearchInput = forwardRef(function GameSearchInput({ value, onChange, placeholder, testId }, ref) {
  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        enterKeyHint="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search games"
        data-testid={testId}
        className="w-full min-h-11 bg-retro-card border-2 border-retro-border text-retro-text
          font-mono text-sm placeholder-retro-dim rounded pl-4 pr-11 py-2.5
          focus:outline-none focus:border-retro-p1 transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); ref?.current?.focus() }}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 px-4 flex items-center justify-center
            text-retro-dim hover:text-retro-text font-pixel text-xs transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  )
})

export default GameSearchInput
