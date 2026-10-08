import { describe, expect, it } from 'vitest'
import {
  ARRIVING_TTL_MS, BANNER_MS, COUNTDOWN_MS, arrivalCopy, arrivalProgress, arrivalState, arrivingCount,
  countdownEligible, hostWaitingLine, inviteShareText, movesBlocked, newcomerName,
} from './arrivalLogic'

describe('countdownEligible', () => {
  it('takes a turn-based board duel', () => {
    expect(countdownEligible({})).toBe(true)
    expect(countdownEligible({ boardSize: 9 })).toBe(true)
  })
  it('leaves real-time, simultaneous, party, custom and start-step games alone', () => {
    for (const flag of ['custom', 'nPlayer', 'realtime', 'simultaneous', 'waitForStart']) {
      expect(countdownEligible({ [flag]: true })).toBe(false)
    }
  })
  it('skips challenge lobbies, which have their own START', () => {
    expect(countdownEligible({}, { lobby: true })).toBe(false)
    expect(countdownEligible({}, {})).toBe(true)
  })
  it('is false without a config', () => {
    expect(countdownEligible(null)).toBe(false)
  })
})

describe('arrivalState', () => {
  const t0 = 1_000_000
  it('has nothing without a stamp', () => {
    expect(arrivalState({ startsAt: undefined, now: t0 })).toBeNull()
    expect(arrivalState({ startsAt: null, now: t0 })).toBeNull()
    expect(arrivalState({ startsAt: 'soon', now: t0 })).toBeNull()
    expect(arrivalState({ startsAt: NaN, now: t0 })).toBeNull()
  })
  it('counts 3, 2, 1 across three seconds', () => {
    expect(arrivalState({ startsAt: t0, now: t0 })?.count).toBe(3)
    expect(arrivalState({ startsAt: t0, now: t0 + 999 })?.count).toBe(3)
    expect(arrivalState({ startsAt: t0, now: t0 + 1000 })?.count).toBe(2)
    expect(arrivalState({ startsAt: t0, now: t0 + 1999 })?.count).toBe(2)
    expect(arrivalState({ startsAt: t0, now: t0 + 2000 })?.count).toBe(1)
    expect(arrivalState({ startsAt: t0, now: t0 + 2999 })?.count).toBe(1)
  })
  it('is over at three seconds, and stays over', () => {
    expect(arrivalState({ startsAt: t0, now: t0 + COUNTDOWN_MS })).toBeNull()
    expect(arrivalState({ startsAt: t0, now: t0 + 60_000 })).toBeNull()
  })
  it('never runs longer than the countdown when the clock runs behind the stamp', () => {
    const s = arrivalState({ startsAt: t0, now: t0 - 5000 })
    expect(s?.count).toBe(3)
    expect(s?.msLeft).toBe(COUNTDOWN_MS)
  })
  it('shows the banner for the first stretch only', () => {
    expect(arrivalState({ startsAt: t0, now: t0 + BANNER_MS - 1 })?.showBanner).toBe(true)
    expect(arrivalState({ startsAt: t0, now: t0 + BANNER_MS })?.showBanner).toBe(false)
  })
  it('keeps the whole beat within three seconds', () => {
    expect(COUNTDOWN_MS).toBeLessThanOrEqual(3000)
    expect(BANNER_MS).toBeLessThanOrEqual(COUNTDOWN_MS)
  })
})

describe('movesBlocked', () => {
  it('blocks during the countdown only', () => {
    expect(movesBlocked({ startsAt: 100, now: 150 })).toBe(true)
    expect(movesBlocked({ startsAt: 100, now: 100 + COUNTDOWN_MS })).toBe(false)
    expect(movesBlocked({ startsAt: undefined, now: 150 })).toBe(false)
  })
})

describe('arrivalCopy', () => {
  const players = { X: { name: 'Neon Dragon' }, O: { name: 'Sleepy Pickle' } }
  it('tells the host who is here and who goes first', () => {
    expect(arrivalCopy({ mySeat: 'X', players, currentTurn: 'X' })).toEqual({ title: 'SLEEPY PICKLE IS HERE!', sub: 'YOU GO FIRST' })
    expect(arrivalCopy({ mySeat: 'X', players, currentTurn: 'O' }).sub).toBe('SLEEPY PICKLE GOES FIRST')
  })
  it('welcomes the guest in', () => {
    expect(arrivalCopy({ mySeat: 'O', players, currentTurn: 'X' })).toEqual({ title: "YOU'RE IN!", sub: 'NEON DRAGON GOES FIRST' })
    expect(arrivalCopy({ mySeat: 'O', players, currentTurn: 'O' }).sub).toBe('YOU GO FIRST')
  })
  it('has words for missing names', () => {
    expect(arrivalCopy({ mySeat: 'X', players: {}, currentTurn: 'X' }).title).toBe('YOUR FRIEND IS HERE!')
    expect(arrivalCopy({ mySeat: 'O', players: {}, currentTurn: 'X' }).sub).toBe('THE HOST GOES FIRST')
  })
})

describe('arrivingCount', () => {
  const now = 10_000_000
  it('counts people with the invite open', () => {
    expect(arrivingCount({ a: now - 1000, b: now - 5000 }, { now })).toBe(2)
  })
  it('does not count yourself or someone already seated', () => {
    expect(arrivingCount({ me: now, seated: now, other: now }, { now, selfUid: 'me', seatedUids: ['seated'] })).toBe(1)
  })
  it('drops stale entries and junk', () => {
    expect(arrivingCount({ old: now - ARRIVING_TTL_MS - 1, bad: 'x', nul: null }, { now })).toBe(0)
    expect(arrivingCount({ fresh: now + 2000 }, { now })).toBe(1)
  })
  it('is zero for no data', () => {
    expect(arrivingCount(null, { now })).toBe(0)
    expect(arrivingCount(undefined, { now })).toBe(0)
  })
})

describe('inviteShareText', () => {
  it('names the host and the game', () => {
    expect(inviteShareText({ hostName: 'Maya', gameLabel: 'CONNECT FOUR' })).toBe('Maya saved you a seat for Connect Four on Game Night. Come play!')
    expect(inviteShareText({ hostName: 'Maya', gameLabel: 'DOTS & BOXES' })).toContain('Dots & Boxes')
  })
  it('falls back without a name or a game', () => {
    expect(inviteShareText({ gameLabel: 'SOS' })).toBe('A friend saved you a seat for Sos on Game Night. Come play!')
    expect(inviteShareText({ hostName: 'Maya' })).toBe('Maya saved you a seat on Game Night. Come play!')
  })
  it('has a party wording', () => {
    expect(inviteShareText({ hostName: 'Maya', party: true })).toBe('Maya saved you a seat at their Game Night party. Come play!')
  })
})

describe('hostWaitingLine', () => {
  it('says the host is waiting and what they picked', () => {
    expect(hostWaitingLine({ hostName: 'Neon Dragon', gameLabel: 'Connect Four' })).toBe('NEON DRAGON IS WAITING · PICKED CONNECT FOUR')
    expect(hostWaitingLine({ hostName: 'Neon Dragon' })).toBe('NEON DRAGON IS WAITING FOR YOU')
  })
  it('stays quiet without a host name', () => {
    expect(hostWaitingLine({ hostName: '', gameLabel: 'SOS' })).toBeNull()
    expect(hostWaitingLine({})).toBeNull()
  })
})

describe('arrivalProgress', () => {
  it('reads alone and ready', () => {
    expect(arrivalProgress({ present: 1, cap: 4 })).toMatchObject({ alone: true, text: '1 OF 2 · WAITING FOR A FRIEND' })
    expect(arrivalProgress({ present: 2, cap: 4 })).toMatchObject({ alone: false, text: '2 HERE · READY TO PLAY' })
  })
})

describe('newcomerName', () => {
  const me = { uid: 'me', name: 'Me' }
  it('names the newest arrival', () => {
    expect(newcomerName([me], [me, { uid: 'a', name: 'Kai' }], 'me')).toBe('KAI')
    expect(newcomerName([me], [me, { uid: 'a', name: 'Kai' }, { uid: 'b', name: 'Lou' }], 'me')).toBe('LOU')
  })
  it('is null when nobody new is there', () => {
    expect(newcomerName([me], [me], 'me')).toBeNull()
    expect(newcomerName([me, { uid: 'a' }], [me, { uid: 'a' }], 'me')).toBeNull()
  })
  it('never names yourself and falls back on a blank name', () => {
    expect(newcomerName([], [me], 'me')).toBeNull()
    expect(newcomerName([me], [me, { uid: 'a', name: ' ' }], 'me')).toBe('A FRIEND')
  })
})
