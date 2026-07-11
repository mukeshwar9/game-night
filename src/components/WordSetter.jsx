import { useState } from 'react'
import { validateWord } from '../lib/hangmanLogic'
import { cn } from '@/lib/utils'

export default function WordSetter({ onWordSet, loading = false }) {
  const [raw, setRaw] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const sanitized = e.target.value
      .toUpperCase()
      .replace(/[^A-Z ]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^ /, '')
    setRaw(sanitized)
    setError('')
  }

  const handleSubmit = () => {
    const word = validateWord(raw)
    if (!word) {
      setError('3–30 LETTERS · A–Z & SPACES')
      return
    }
    onWordSet(word, hint.trim())
  }

  const letterCount = raw.replace(/ /g, '').length
  const wordCount = raw.trim() ? raw.trim().split(/\s+/).length : 0

  return (
    <div className="space-y-4 text-center">
      <p className="font-pixel text-[10px] text-retro-dim tracking-wider">
        YOU ARE THE WORD-KEEPER
      </p>
      <p className="font-mono text-xs text-retro-dim">
        Choose a word or phrase — your opponent must guess it
      </p>
      <div className="space-y-2">
        <input
          type="text"
          value={raw}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={40}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="TYPE A WORD OR PHRASE"
          className={cn(
            'w-full bg-retro-card border-2 rounded px-4 py-3',
            'font-pixel text-sm text-retro-p1 tracking-widest text-center',
            'placeholder-retro-border focus:outline-none transition-colors',
            error ? 'border-retro-p2' : 'border-retro-border focus:border-retro-p1',
          )}
        />
        {error && (
          <p className="font-pixel text-[10px] text-retro-p2">{error}</p>
        )}
        {raw && !error && (
          <p className="font-mono text-[10px] text-retro-dim">
            {letterCount} letter{letterCount !== 1 ? 's' : ''}
            {wordCount > 1 && ` · ${wordCount} words`}
          </p>
        )}
        <input
          type="text"
          value={hint}
          onChange={e => setHint(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={80}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="ADD A HINT (OPTIONAL)"
          className={cn(
            'w-full bg-retro-card border rounded px-4 py-2',
            'font-mono text-xs text-retro-dim tracking-wide text-center',
            'placeholder-retro-border/60 focus:outline-none transition-colors',
            'border-retro-border/50 focus:border-retro-border',
          )}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={loading || !raw}
        className={cn(
          'px-8 py-3 font-pixel text-[10px] rounded border-2 transition-all active:scale-95',
          loading || !raw
            ? 'border-retro-border text-retro-border cursor-not-allowed'
            : 'border-retro-p1 text-retro-p1 hover:shadow-neon-p1 hover:bg-retro-tint-p1',
        )}
      >
        {loading ? 'LOCKING…' : 'LOCK IT IN'}
      </button>
    </div>
  )
}
