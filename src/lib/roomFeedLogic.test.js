import { describe, it, expect, vi } from 'vitest'
import { isStatsOnlyChange, createRoomFeed, HOT_STATS_INTERVAL_MS } from './roomFeedLogic'

const room = (stats, over = {}) => ({
  gameType: 'sidekick', status: 'playing', players: { a: { name: 'A' } },
  round: { id: 'r1', racers: { a: true }, stats: { r1: stats } }, ...over,
})

describe('isStatsOnlyChange', () => {
  it('is true when only a position report moved', () => {
    expect(isStatsOnlyChange(room({ a: { z: 1 } }), room({ a: { z: 2 } }))).toBe(true)
  })
  it('is false for any other change', () => {
    expect(isStatsOnlyChange(room({ a: { z: 1 } }), room({ a: { z: 1 } }, { status: 'finished' }))).toBe(false)
    expect(isStatsOnlyChange(room({ a: { z: 1 } }), room({ a: { z: 1 } }, { players: { a: { name: 'B' } } }))).toBe(false)
    const next = room({ a: { z: 1 } })
    next.round.racers = { a: true, b: true }
    expect(isStatsOnlyChange(room({ a: { z: 1 } }), next)).toBe(false)
    const withChat = room({ a: { z: 1 } }, { chatLog: { p1: { text: 'hi' } } })
    expect(isStatsOnlyChange(room({ a: { z: 1 } }), withChat)).toBe(false)
  })
  it('is false without a previous room or a round on either side', () => {
    expect(isStatsOnlyChange(null, room({}))).toBe(false)
    expect(isStatsOnlyChange({ a: 1 }, { a: 1, round: { id: 'x' } })).toBe(false)
  })
})

describe('createRoomFeed', () => {
  const setup = () => {
    let t = 1000
    const applied = []
    const timers = []
    const feed = createRoomFeed((g) => applied.push(g), {
      now: () => t,
      setTimer: (fn, ms) => { const id = timers.length + 1; timers.push({ id, fn, ms, live: true }); return id },
      clearTimer: (id) => { const x = timers.find((q) => q.id === id); if (x) x.live = false },
    })
    return { feed, applied, timers, advance: (ms) => { t += ms } }
  }

  it('delivers the first room and any non-stats change at once', () => {
    const { feed, applied } = setup()
    feed.push(room({ a: { z: 1 } }))
    feed.push(room({ a: { z: 1 } }, { status: 'finished' }))
    expect(applied).toHaveLength(2)
  })
  it('holds a stats-only change inside the interval and delivers the newest when it fires', () => {
    const { feed, applied, timers, advance } = setup()
    feed.push(room({ a: { z: 1 } }))
    advance(50)
    feed.push(room({ a: { z: 2 } }))
    advance(50)
    feed.push(room({ a: { z: 3 } }))
    expect(applied).toHaveLength(1)
    expect(timers.filter((x) => x.live)).toHaveLength(1)
    advance(HOT_STATS_INTERVAL_MS)
    timers[0].fn()
    expect(applied).toHaveLength(2)
    expect(applied[1].round.stats.r1.a.z).toBe(3)
  })
  it('delivers a stats-only change straight away once the interval has passed', () => {
    const { feed, applied, advance } = setup()
    feed.push(room({ a: { z: 1 } }))
    advance(HOT_STATS_INTERVAL_MS + 1)
    feed.push(room({ a: { z: 2 } }))
    expect(applied).toHaveLength(2)
  })
  it('lets a real change through at once and drops what was held', () => {
    const { feed, applied, timers, advance } = setup()
    feed.push(room({ a: { z: 1 } }))
    advance(10)
    feed.push(room({ a: { z: 2 } }))
    feed.push(room({ a: { z: 2 } }, { status: 'finished' }))
    expect(applied).toHaveLength(2)
    expect(applied[1].status).toBe('finished')
    expect(timers.every((x) => !x.live)).toBe(true)
  })
  it('does not hold anything for other games', () => {
    const { feed, applied } = setup()
    feed.push(room({ a: { z: 1 } }, { gameType: 'typing' }))
    feed.push(room({ a: { z: 2 } }, { gameType: 'typing' }))
    expect(applied).toHaveLength(2)
  })
  it('cancel clears the timer', () => {
    const { feed, timers, advance } = setup()
    feed.push(room({ a: { z: 1 } }))
    advance(10)
    feed.push(room({ a: { z: 2 } }))
    feed.cancel()
    expect(timers.every((x) => !x.live)).toBe(true)
    vi.clearAllTimers()
  })
})
