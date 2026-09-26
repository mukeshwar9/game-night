import { useState } from 'react'
import { validateSetterWord, hintRevealsWord, WORD_RULE_ANY, WORD_RULE_DICTIONARY } from '../lib/hangmanLogic'
import WordFeedback from './WordFeedback'
import { cn } from '@/lib/utils'

// Word entry for the word-keeper. `rule` is 'dictionary' (one word from the
// word list, 4+ letters) or 'any' (the ANY WORD house rule: 3–30 letters,
// phrases allowed). `dictionary` is the loaded word list ({ has }) or null
// while it loads. Callers that pass no rule (the local demo) get 'any'.
export default function WordSetter({
  onWordSet,
  loading = false,
  rule = WORD_RULE_ANY,
  dictionary = null,
  dictionaryError = false,
  onRetryDictionary = null,
}) {
  const [raw, setRaw] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [hintError, setHintError] = useState('')
  const [errorId, setErrorId] = useState(0)

  const needsList = rule === WORD_RULE_DICTIONARY
  const listLoading = needsList && !dictionary && !dictionaryError

  const handleChange = (e) => {
    const sanitized = e.target.value
      .toUpperCase()
      .replace(/[^A-Z ]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^ /, '')
    setRaw(sanitized)
    setError('')
  }

  const fail = (setter, message) => {
    setter(message)
    setErrorId(n => n + 1)
  }

  const handleSubmit = () => {
    if (loading || listLoading) return
    const check = validateSetterWord(raw, { rule, dictionary })
    if (!check.ok) {
      fail(setError, check.message)
      return
    }
    const cleanHint = hint.trim()
    if (cleanHint && hintRevealsWord(cleanHint, check.word)) {
      fail(setHintError, 'THE HINT GIVES THE WORD AWAY')
      return
    }
    onWordSet(check.word, cleanHint)
  }

  const letterCount = raw.replace(/ /g, '').length
  const wordCount = raw.trim() ? raw.trim().split(/\s+/).length : 0
  const disabled = loading || listLoading || !raw

  return (
    <div className="space-y-4 text-center">
      <p className="font-pixel text-[10px] text-retro-dim tracking-wider">
        YOU ARE THE WORD-KEEPER
      </p>
      <p className="font-mono text-xs text-retro-dim">
        {needsList
          ? 'Choose one real word, 4+ letters — your opponent must guess it'
          : 'Choose any word or phrase, 3–30 letters — your opponent must guess it'}
      </p>
      <div className="space-y-2">
        <label htmlFor="hangwoman-word" className="sr-only">Secret word</label>
        <input
          id="hangwoman-word"
          type="text"
          value={raw}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={40}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={needsList ? 'TYPE A WORD' : 'TYPE A WORD OR PHRASE'}
          aria-invalid={!!error}
          aria-describedby="hangwoman-word-feedback"
          className={cn(
            'w-full bg-retro-card border-2 rounded px-4 py-3',
            'font-pixel text-sm text-retro-p1 tracking-widest text-center',
            // Mono, unspaced placeholder so the full prompt fits a phone-width field
            'placeholder-retro-dim placeholder:font-mono placeholder:text-xs placeholder:tracking-normal',
            'focus:outline-none transition-colors',
            error ? 'border-retro-p2' : 'border-retro-border focus:border-retro-p1',
          )}
        />
        <div id="hangwoman-word-feedback">
          <WordFeedback message={error} tone="bad" id={errorId} />
        </div>
        {raw && !error && (
          <p className="font-mono text-[10px] text-retro-dim">
            {letterCount} letter{letterCount !== 1 ? 's' : ''}
            {wordCount > 1 && ` · ${wordCount} words`}
          </p>
        )}
        <label htmlFor="hangwoman-hint" className="sr-only">Hint (optional)</label>
        <input
          id="hangwoman-hint"
          type="text"
          value={hint}
          onChange={e => { setHint(e.target.value); setHintError('') }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={80}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="ADD A HINT (OPTIONAL)"
          aria-invalid={!!hintError}
          className={cn(
            'w-full bg-retro-card border rounded px-4 py-2',
            'font-mono text-xs text-retro-dim tracking-wide text-center',
            'placeholder-retro-dim focus:outline-none transition-colors',
            hintError ? 'border-retro-p2' : 'border-retro-border/50 focus:border-retro-border',
          )}
        />
        <WordFeedback message={hintError} tone="bad" id={errorId} />
      </div>
      {needsList && dictionaryError && (
        <div className="space-y-2">
          <p className="font-pixel text-[9px] text-retro-p2">WORD LIST DIDN&apos;T LOAD</p>
          {onRetryDictionary && (
            <button
              type="button"
              onClick={onRetryDictionary}
              className="px-4 py-2 font-pixel text-[9px] rounded border border-retro-border text-retro-text hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
            >
              RETRY
            </button>
          )}
          <p className="font-mono text-[10px] text-retro-dim">Or turn on the ANY WORD house rule.</p>
        </div>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled}
        className={cn(
          'px-8 py-3 font-pixel text-[10px] rounded border-2 transition-all active:scale-95',
          disabled
            ? 'border-retro-border text-retro-border cursor-not-allowed'
            : 'border-retro-p1 text-retro-p1 hover:shadow-neon-p1 hover:bg-retro-tint-p1',
        )}
      >
        {loading ? 'LOCKING…' : listLoading ? 'LOADING WORDS…' : 'LOCK IT IN'}
      </button>
    </div>
  )
}
