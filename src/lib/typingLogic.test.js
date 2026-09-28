import { describe, it, expect } from 'vitest'
import {
  MIN_ELAPSED_MS, PASSAGES, TYPING_QUOTES, TYPING_CONTENT_REVISION,
  DEFAULT_TYPING_CONFIG, normalizeTypingConfig, isValidTypingConfig, generateTypingContent,
  countCorrectChars, computeWpm, computeAccuracy, computeEffWpm,
  createTypingProgress, recordTypingAttempt, eraseTypingText, applyTypingValue, typingMetrics,
  isTypingComplete, typingWpm, pickPassageIndex,
  isTypingDone, typingRaceEntry, typingLiveKey, typingRow, typingResultBreakdown,
} from './typingLogic'

describe('typing configuration and shared content', () => {
  it('uses medium quotes with both optional character classes off by default', () => {
    expect(normalizeTypingConfig(null)).toEqual(DEFAULT_TYPING_CONFIG)
    expect(DEFAULT_TYPING_CONFIG).toMatchObject({ length: 'medium', punctuation: false, numbers: false })
  })

  it('validates only supported versioned quote settings', () => {
    expect(isValidTypingConfig(DEFAULT_TYPING_CONFIG)).toBe(true)
    expect(isValidTypingConfig({ ...DEFAULT_TYPING_CONFIG, length: 'thicc' })).toBe(false)
    expect(isValidTypingConfig({ ...DEFAULT_TYPING_CONFIG, numbers: 1 })).toBe(false)
    expect(isValidTypingConfig({ ...DEFAULT_TYPING_CONFIG, unexpected: true })).toBe(false)
  })

  it('selects identical exact content for one seed and config', () => {
    const config = { ...DEFAULT_TYPING_CONFIG, punctuation: true, numbers: true }
    expect(generateTypingContent(716, config)).toEqual(generateTypingContent(716, config))
    expect(generateTypingContent(716, config).contentRevision).toBe(TYPING_CONTENT_REVISION)
  })

  it('supports short, medium, and long original passages with deterministic toggles', () => {
    for (const length of ['short', 'medium', 'long']) {
      const config = { ...DEFAULT_TYPING_CONFIG, length }
      const clean = generateTypingContent(9, config).passage
      const styled = generateTypingContent(9, { ...config, punctuation: true, numbers: true }).passage
      expect(clean.length).toBeGreaterThan(30)
      expect(styled).toMatch(/[.,!?]/)
      expect(styled).toMatch(/\d/)
      expect(clean).not.toMatch(/[.,!?]/)
    }
    expect(TYPING_QUOTES.every(q => ['short', 'medium', 'long'].includes(q.length))).toBe(true)
  })

  it('avoids recently seen quotes in the selected length while preserving deck indexes', () => {
    const first = generateTypingContent(0, DEFAULT_TYPING_CONFIG)
    const seen = { [first.quoteIndex]: 1 }
    expect(generateTypingContent(0, DEFAULT_TYPING_CONFIG, seen).quoteIndex).not.toBe(first.quoteIndex)
  })
})

describe('legacy passage and metric helpers', () => {
  it('keeps existing passage indexes append-only and unseen-first', () => {
    expect(PASSAGES.length).toBeGreaterThanOrEqual(12)
    for (const passage of PASSAGES) expect(passage.length).toBeGreaterThan(100)
    const seen = {}
    for (let i = 0; i < PASSAGES.length - 1; i++) seen[i] = i + 1
    expect(pickPassageIndex(seen, () => 0)).toBe(PASSAGES.length - 1)
  })

  it('retains bounded legacy helpers for old round results', () => {
    expect(countCorrectChars('the bat', 'the cat')).toBe(6)
    expect(computeWpm(25, 60_000)).toBe(5)
    expect(computeWpm(25, 0)).toBe(computeWpm(25, MIN_ELAPSED_MS))
    expect(computeAccuracy(8, 10)).toBe(80)
    expect(computeEffWpm(50, 80)).toBe(40)
    expect(computeEffWpm(null, 80)).toBeNull()
  })
})

describe('attempt-based typing score', () => {
  it('counts wrong attempts even after correction and keeps backspace from erasing history', () => {
    let progress = createTypingProgress()
    progress = recordTypingAttempt(progress, 'x', 'cat')
    progress = eraseTypingText(progress, '')
    progress = recordTypingAttempt(progress, 'c', 'cat')
    progress = recordTypingAttempt(progress, 'a', 'cat')
    progress = recordTypingAttempt(progress, 't', 'cat')
    expect(progress).toMatchObject({ typed: 'cat', attempts: 4, correctAttempts: 3, wrongAttempts: 1 })
    expect(typingMetrics(progress, 60_000, 3)).toMatchObject({ rawWpm: 0.8, netWpm: 0.6, accuracy: 75, missed: 0 })
  })

  it('measures raw from every printable attempt and net from correct attempts', () => {
    const metrics = typingMetrics({ attempts: 100, correctAttempts: 90, wrongAttempts: 10, progress: 80 }, 60_000, 100)
    expect(metrics).toMatchObject({ rawWpm: 20, netWpm: 18, accuracy: 90, missed: 20 })
  })

  it('requires exact completion and never reports a fake positive pace with no attempts', () => {
    expect(isTypingComplete('cat', 'cat')).toBe(true)
    expect(isTypingComplete('cax', 'cat')).toBe(false)
    expect(typingWpm(0, 1000)).toBe(0)
    expect(typingMetrics(createTypingProgress(), 0, 5)).toMatchObject({ accuracy: 0, missed: 5 })
  })

  it('reconciles a whole field value from the OS keyboard: insert, delete, replace, clamp', () => {
    let progress = applyTypingValue(createTypingProgress(), 'c', 'cat')
    expect(progress).toMatchObject({ typed: 'c', attempts: 1, correctAttempts: 1, wrongAttempts: 0 })
    progress = applyTypingValue(progress, 'ca', 'cat')
    progress = applyTypingValue(progress, 'cax', 'cat')
    expect(progress).toMatchObject({ typed: 'cax', attempts: 3, correctAttempts: 2, wrongAttempts: 1 })
    // Backspace deletes visible text but keeps the wrong attempt on the books.
    expect(applyTypingValue(progress, 'ca', 'cat'))
      .toMatchObject({ typed: 'ca', attempts: 3, correctAttempts: 2, wrongAttempts: 1 })
    // A replacement (autocorrect/selection) counts the new characters only once.
    expect(applyTypingValue({ typed: 'helo', attempts: 4, correctAttempts: 4, wrongAttempts: 0 }, 'hello', 'hello'))
      .toMatchObject({ typed: 'hello', attempts: 5, correctAttempts: 5, wrongAttempts: 0 })
    // Growth is clamped to the passage and an unchanged value is a no-op.
    expect(applyTypingValue(createTypingProgress(), 'cat!', 'cat').typed).toBe('cat')
    const same = applyTypingValue(progress, 'ca', 'cat')
    expect(applyTypingValue(same, 'ca', 'cat')).toBe(same)
  })

  it('ranks by net WPM, then accuracy, then finish time; exact ties share a rank', () => {
    expect(typingRaceEntry({ done: true, netWpm: 60, acc: 95, doneAt: 200 })).toEqual({
      sortKey: [-60, -95, 200], score: 60,
    })
    expect(typingRaceEntry({ done: true, netWpm: 60, acc: 96, doneAt: 300 }).sortKey)
      .toEqual([-60, -96, 300])
    expect(typingRaceEntry({ done: true, netWpm: 60, acc: 95, doneAt: 100 }).sortKey)
      .toEqual([-60, -95, 100])
    expect(typingRaceEntry({ done: true, wpm: 50, acc: 80, eff: 40 }).sortKey).toEqual([-40])
    expect(typingRaceEntry({ progress: 50 })).toMatchObject({ sortKey: null, score: null })
    expect(isTypingDone({ done: true })).toBe(false)
  })

  it('shows live pace and results detail without exposing typed text', () => {
    expect(typingLiveKey({ done: true, netWpm: 40, acc: 90, doneAt: 50 })).toEqual([0, -90, 50])
    expect(typingRow({ progress: 50, rawWpm: 30, netWpm: 25, acc: 90 }, 100))
      .toMatchObject({ primary: '25 WPM', secondary: 'RAW 30 · 90% ACC' })
    expect(typingRow({ done: true, netWpm: 60, rawWpm: 64, acc: 94, wrongAttempts: 4, missed: 0 }, 100))
      .toMatchObject({ primary: '60 WPM', secondary: 'RAW 64 · 94% ACC', detail: '4 ERR · 0 MISSED' })
    expect(typingResultBreakdown({ attempts: 10, correctAttempts: 8, wrongAttempts: 2, progress: 7 }, 10, 30_000))
      .toMatchObject({ attempts: 10, correctAttempts: 8, missed: 3, completed: false, legacy: false })
  })
})
