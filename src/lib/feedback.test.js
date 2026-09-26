import { describe, it, expect, beforeEach } from 'vitest'
import {
  FEEDBACK_COOLDOWN_MS, FEEDBACK_MAX_LENGTH,
  normalizeFeedbackType, normalizeFeedbackStatus, normalizeFeedbackItem, normalizeFeedbackList,
  countFeedback, feedbackCooldownLeft, buildErrorFeedbackMessage,
  saveFeedbackDraft, readFeedbackDraft, clearFeedbackDraft,
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
