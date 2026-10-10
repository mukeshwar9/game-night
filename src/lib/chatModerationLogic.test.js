import { describe, it, expect } from 'vitest'
import {
  JEV_MODEL, MOD_CATEGORIES, HIDE_CATEGORIES, SEVERITY_LEVELS, buildModerationRequest, moderationDecision,
  buildTriageRequest, triageSummary, TRIAGE_CATEGORIES,
} from './chatModerationLogic'

const choice = (label, p) => ({ type: 'choice', choice: label, probabilities: { [label]: p }, confidence: p })
const score = (v) => ({ type: 'score', score: v })

describe('buildModerationRequest', () => {
  const req = buildModerationRequest({
    message: { name: 'Ben', text: 'whats ur snap' },
    recent: Array.from({ length: 9 }, (_, i) => ({ name: 'Ana', text: `line ${i}` })),
    room: { gameType: 'connectfour', public: true },
  })

  it('asks Jev one Choice, one Score and one Noul over the same state', () => {
    expect(req.model).toBe(JEV_MODEL)
    expect(req.questions.category).toMatchObject({ type: 'choice', criteria: MOD_CATEGORIES })
    expect(req.questions.severity).toMatchObject({ type: 'score', criteria: SEVERITY_LEVELS })
    expect(req.questions.aimed_at_player.type).toBe('noul')
    expect(Object.keys(req.questions.aimed_at_player.criteria)).toEqual(['true', 'false'])
  })

  it('sends the line, the last six lines before it and the room', () => {
    expect(req.state.message).toEqual({ author: 'Ben', text: 'whats ur snap' })
    expect(req.state.recent).toHaveLength(6)
    expect(req.state.recent[5].text).toBe('line 8')
    expect(req.state.room).toMatchObject({ game: 'connectfour', public: true, authorIsSpectator: false })
  })

  it('references state paths that exist', () => {
    expect(req.questions.category.instructions).toContain('`message.text`')
    expect(req.questions.category.instructions).toContain('`recent`')
  })

  it('clamps long fields', () => {
    const r = buildModerationRequest({ message: { name: 'n'.repeat(99), text: 't'.repeat(999) } })
    expect(r.state.message.author).toHaveLength(40)
    expect(r.state.message.text).toHaveLength(200)
    expect(r.state.recent).toEqual([])
  })
})

describe('moderationDecision', () => {
  it('does nothing for fine chat and friendly banter, however confident', () => {
    expect(moderationDecision({ category: choice('fine', 0.99), severity: score(0) }).action).toBe('none')
    expect(moderationDecision({ category: choice('friendly_banter', 0.95), severity: score(0.4) }).action).toBe('none')
  })

  it('hides a confident serious category', () => {
    for (const c of HIDE_CATEGORIES) {
      expect(moderationDecision({ category: choice(c, 0.9), severity: score(1) })).toMatchObject({ action: 'hide', category: c })
    }
  })

  it('hides a less certain one when the severity is high', () => {
    expect(moderationDecision({ category: choice('hate_or_slur', 0.5), severity: score(2.4) }).action).toBe('hide')
  })

  it('sends an uncertain serious call to review instead of acting', () => {
    expect(moderationDecision({ category: choice('targeted_insult', 0.55), severity: score(0.8) }).action).toBe('review')
  })

  it('ignores a weak signal', () => {
    expect(moderationDecision({ category: choice('targeted_insult', 0.3), severity: score(0.5) }).action).toBe('none')
  })

  it('treats a missing or malformed response as no action', () => {
    expect(moderationDecision(undefined).action).toBe('none')
    expect(moderationDecision({ category: { choice: 42 } }).action).toBe('none')
  })
})

describe('report triage', () => {
  it('asks for category, severity and whether the context supports the report', () => {
    const req = buildTriageRequest({ targetName: 'Ben', text: 'u suck', chatContext: 'Ana: gg\nBen: u suck', message: 'Chat report — Ben: "u suck"' })
    expect(req.questions.category.criteria).toEqual(TRIAGE_CATEGORIES)
    expect(req.questions.supported.type).toBe('noul')
    expect(req.state.conversation).toContain('Ben: u suck')
    expect(req.state.reported).toMatchObject({ player: 'Ben', content: 'u suck' })
  })

  it('ranks a supported severe report above an unfounded one', () => {
    const bad = triageSummary({ category: choice('hate_or_slur', 0.9), severity: score(3), supported: { noul: 0.95 } }, 5)
    const meh = triageSummary({ category: choice('not_a_violation', 0.9), severity: score(0), supported: { noul: 0.1 } }, 5)
    expect(bad.priority).toBeGreaterThan(meh.priority)
    expect(bad).toMatchObject({ category: 'hate_or_slur', severity: 3, supported: 0.95, at: 5 })
  })

  it('survives a missing response', () => {
    expect(triageSummary(null, 1)).toMatchObject({ category: 'unknown', priority: 0, at: 1 })
  })
})
