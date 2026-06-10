import { useState } from 'react'
import { validateWord } from '../lib/hangmanLogic'
import { cn } from '@/lib/utils'

export default function WordSetter({ onWordSet, loading = false }) {
  const [raw, setRaw] = useState('')
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setRaw(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
    setError('')
  }

  const handleSubmit = () => {
    const word = validateWord(raw)
    if (!word) {
      setError('3–12 LETTERS, A–Z ONLY')
      return
    }
    onWordSet(word)
  }

  return (
    <div className="space-y-4 text-center">
      <p className="font-pixel text-[10px] text-retro-dim tracking-wider">
        YOU ARE THE WORD-KEEPER
      </p>
      <p className="font-mono text-xs text-retro-dim">
        Choose a word — your opponent must guess it
      </p>
      <div className="space-y-2">
        <input
          type="text"
          value={raw}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={12}
          autoFocus
          placeholder="TYPE A WORD"
          className={cn(
            'w-full bg-retro-card border-2 rounded px-4 py-3',
            'font-pixel text-sm text-retro-p1 tracking-widest text-center',
            'placeholder-retro-border focus:outline-none transition-colors',
            error ? 'border-retro-p2' : 'border-retro-border focus:border-retro-p1',
          )}
        />
        {error && (
          <p className="font-pixel text-[10px] text-retro-p2 animate-pulse">{error}</p>
        )}
        {raw && !error && (
          <p className="font-mono text-[10px] text-retro-dim">{raw.length} letters</p>
        )}
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
