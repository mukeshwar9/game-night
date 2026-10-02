import { describe, it, expect, beforeEach } from 'vitest'
import {
  FEEDBACK_COOLDOWN_MS, FEEDBACK_MAX_LENGTH,
  normalizeFeedbackType, normalizeFeedbackStatus, normalizeFeedbackItem, normalizeFeedbackList,
  countFeedback, feedbackCooldownLeft, buildErrorFeedbackMessage,
  saveFeedbackDraft, readFeedbackDraft, clearFeedbackDraft, buildReport, sortReports,
} from './feedback'

describe('normalizeFeedbackType / normalizeFeedbackStatus', () => {
  it('keeps known values and defaults the rest', () => {
    expect(normalizeFeedbackType('feature')).toBe('feature')
    expect(normalizeFeedbackType('report')).toBe('report')
    expect(normalizeFeedbackType('rant')).toBe('bug')
    expect(normalizeFeedbackType(undefined)).toBe('bug')
    expect(normalizeFeedbackStatus('done')).toBe('done')
    expect(normalizeFeedbackStatus('wontfix')).toBe('open')
    expect(normalizeFeedbackStatus(null)).toBe('open')
  })
})

describe('normalizeFeedbackItem', () => {
  it('coerces every field to a safe type', () => {
    expect(normalizeFeedbackItem('id1', { type: 'x', status: 3, message: 42, createdAt: 'yesterday', by: 'u1' })).toEqual({
      id: 'id1',
      type: 'bug',
      status: 'open',
      message: '',
      page: '',
      by: 'u1',
      name: '',
      avatar: '',
      createdAt: 0,
      updatedAt: 0,
    })
  })

  it('keeps report-only fields for reports', () => {
    const item = normalizeFeedbackItem('r', { type: 'report', message: 'Chat report — Bob: "x"', gameId: 'AB12CD', targetUid: 't', targetName: 'Bob', text: 'x' })
    expect(item).toMatchObject({ type: 'report', gameId: 'AB12CD', targetUid: 't', targetName: 'Bob', text: 'x' })
    expect(normalizeFeedbackItem('b', { type: 'bug', gameId: 'AB12CD' })).not.toHaveProperty('gameId')
  })

  it('returns null for non-objects', () => {
    expect(normalizeFeedbackItem('x', null)).toBeNull()
    expect(normalizeFeedbackItem('x', 'text')).toBeNull()
  })
})

describe('normalizeFeedbackList / countFeedback', () => {
  const val = {
    a: { type: 'bug', status: 'open', createdAt: 1 },
    b: { type: 'report', status: 'done', createdAt: 3 },
    c: 'junk',
    d: { type: 'feature', status: 'open', createdAt: 2 },
  }

  it('drops junk and sorts newest first', () => {
    expect(normalizeFeedbackList(val).map(i => i.id)).toEqual(['b', 'd', 'a'])
    expect(normalizeFeedbackList(null)).toEqual([])
  })

  it('counts by type and open status', () => {
    expect(countFeedback(normalizeFeedbackList(val))).toEqual({ all: 3, open: 2, bug: 1, feature: 1, report: 1 })
    expect(countFeedback(null)).toEqual({ all: 0, open: 0, bug: 0, feature: 0, report: 0 })
  })
})

describe('feedbackCooldownLeft', () => {
  it('is 0 with no previous submission or once the window has passed', () => {
    expect(feedbackCooldownLeft(null, 1000)).toBe(0)
    expect(feedbackCooldownLeft(1000, 1000 + FEEDBACK_COOLDOWN_MS)).toBe(0)
  })

  it('counts down inside the window', () => {
    expect(feedbackCooldownLeft(1000, 1000)).toBe(FEEDBACK_COOLDOWN_MS)
    expect(feedbackCooldownLeft(1000, 11_000)).toBe(FEEDBACK_COOLDOWN_MS - 10_000)
  })

  it('ignores a timestamp from the future (clock change) instead of locking the form', () => {
    expect(feedbackCooldownLeft(5_000_000, 1000)).toBe(0)
    expect(feedbackCooldownLeft(NaN, 1000)).toBe(0)
  })
})

describe('buildErrorFeedbackMessage', () => {
  it('pre-fills the route and a one-line error', () => {
    const msg = buildErrorFeedbackMessage({ message: 'TypeError:\n  x is null', route: '/game/:id' })
    expect(msg).toBe('The app crashed on /game/:id.\nError: TypeError: x is null\n\nWhat I was doing: ')
  })

  it('stays within the feedback length limit', () => {
    expect(buildErrorFeedbackMessage({ message: 'x'.repeat(5000) }).length).toBeLessThanOrEqual(FEEDBACK_MAX_LENGTH)
    expect(buildErrorFeedbackMessage().length).toBeGreaterThanOrEqual(10)
  })
})

describe('feedback drafts', () => {
  beforeEach(() => {
    const data = new Map()
    globalThis.sessionStorage = {
      getItem: k => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: k => data.delete(k),
    }
  })

  it('hands a draft over until cleared', () => {
    saveFeedbackDraft({ type: 'bug', message: 'The app crashed' })
    expect(readFeedbackDraft()).toEqual({ type: 'bug', message: 'The app crashed' })
    expect(readFeedbackDraft()).toEqual({ type: 'bug', message: 'The app crashed' })
    clearFeedbackDraft()
    expect(readFeedbackDraft()).toBeNull()
  })

  it('never pre-selects the report type in the form', () => {
    saveFeedbackDraft({ type: 'report', message: 'hello there friend' })
    expect(readFeedbackDraft()?.type).toBe('bug')
  })
})

describe('buildReport', () => {
  it('quotes a chat message, as before', () => {
    expect(buildReport({ gameId: 'AB12CD', targetName: 'Bob', text: 'rude words' }))
      .toMatchObject({ message: 'Chat report — Bob: "rude words"', page: '/game/AB12CD' })
  })

  it('names the player for a profile report, which needs no room', () => {
    expect(buildReport({ context: 'profile', targetName: 'Bob' }))
      .toMatchObject({ message: 'Profile report — Bob', page: '/friends' })
  })

  it('reports a drawing with its word and the room', () => {
    expect(buildReport({ context: 'drawing', gameId: 'AB12CD', targetName: 'Bob', text: 'cat' }))
      .toMatchObject({ message: 'Drawing report — Bob (cat)', page: '/game/AB12CD' })
  })

  it('reports something said in voice with the reason (no audio is recorded)', () => {
    expect(buildReport({ context: 'voice', gameId: 'AB12CD', targetName: 'Bob', text: 'hateful or abusive' }))
      .toMatchObject({ message: 'Voice report — Bob (hateful or abusive)', page: '/game/AB12CD' })
  })

  it('falls back to a chat report for an unknown context and caps lengths', () => {
    expect(buildReport({ context: 'nope', gameId: 'X', targetName: 'n'.repeat(80), text: 't'.repeat(500) }).message.startsWith('Chat report —')).toBe(true)
    const r = buildReport({ gameId: 'X', targetName: 'n'.repeat(80), text: 't'.repeat(500) })
    expect(r.who).toHaveLength(40)
    expect(r.quoted).toHaveLength(200)
    expect(r.message.length).toBeLessThanOrEqual(FEEDBACK_MAX_LENGTH)
  })

  it('carries the chat lines around a chat report, capped, and none for other reports', () => {
    expect(buildReport({ gameId: 'X', targetName: 'Bob', text: 'hi', chatContext: 'Ann: hey\nBob: hi' }).chatContext).toBe('Ann: hey\nBob: hi')
    expect(buildReport({ gameId: 'X', targetName: 'Bob', text: 'hi', chatContext: 'c'.repeat(2000) }).chatContext).toHaveLength(1000)
    expect(buildReport({ context: 'profile', targetName: 'Bob', chatContext: 'Ann: hey' }).chatContext).toBe('')
  })
})

describe('report triage in the admin inbox', () => {
  const rep = (id, over = {}) => normalizeFeedbackItem(id, { type: 'report', message: 'Chat report — x', status: 'open', createdAt: 1, ...over })

  it('keeps the chat context and a normalized triage record', () => {
    const r = rep('a', { chatContext: 'Ann: hi', triage: { category: 'sexual', severity: 2.5, supported: 0.9, priority: 0.8, junk: 1 } })
    expect(r.chatContext).toBe('Ann: hi')
    expect(r.triage).toEqual({ category: 'sexual', severity: 2.5, supported: 0.9, priority: 0.8 })
    expect(rep('b').triage).toBeNull()
  })

  it('sorts open reports by triage priority, untriaged after, closed last', () => {
    const items = [
      rep('low', { triage: { priority: 0.1 }, createdAt: 5 }),
      rep('none', { createdAt: 9 }),
      rep('high', { triage: { priority: 0.9 }, createdAt: 2 }),
      rep('done', { status: 'done', triage: { priority: 1 }, createdAt: 3 }),
    ]
    expect(sortReports(items).map(i => i.id)).toEqual(['high', 'low', 'none', 'done'])
  })
})
