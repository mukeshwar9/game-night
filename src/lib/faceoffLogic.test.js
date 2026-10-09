import { describe, it, expect } from 'vitest'
import { isValidKitAvatar, decodeAvatar } from './avatarKit'
import {
  FACE_COUNT, QUESTIONS, BOT_LEVELS,
  dealFaces, traitOf, normalizeRound, phaseOf, pendingAsk, askedBy, canAsk, canName, remainingFor, splitFor,
  askQuestion, answerQuestion, nameFace, judge, botMove, otherSide,
} from './faceoffLogic'

const SEED = 'faceoff-test-seed'
const faces = dealFaces(SEED)
const picked = (extra = {}) => ({ fSeed: SEED, fTurn: 'X', fCommit: { X: 'hx', O: 'ho' }, ...extra })
// X asks `q` and O answers truthfully for the secret face `secretO`.
const ask = (round, side, q, secret) => answerQuestion(askQuestion(round, side, q), otherSide(side), traitOf(faces, secret, q))

describe('dealFaces', () => {
  it('deals 24 named faces that are valid kit avatars', () => {
    expect(faces).toHaveLength(FACE_COUNT)
    expect(new Set(faces.map((f) => f.name)).size).toBe(FACE_COUNT)
    for (const f of faces) expect(isValidKitAvatar(f.avatar), f.avatar).toBe(true)
  })

  it('is the same deal for the same seed and a different one for another', () => {
    expect(dealFaces(SEED)).toEqual(faces)
    expect(dealFaces('another-seed').map((f) => f.avatar)).not.toEqual(faces.map((f) => f.avatar))
  })

  it('gives every face a different set of answers', () => {
    const keys = faces.map((f) => QUESTIONS.map((q) => f.traits[q.id]).join(''))
    expect(new Set(keys).size).toBe(FACE_COUNT)
  })

  it('makes every question split a fresh board at least 8 to 16', () => {
    for (const seed of [SEED, 'a', 'b', 'c', 'd']) {
      const deal = dealFaces(seed)
      for (const q of QUESTIONS) {
        const yes = deal.filter((f) => f.traits[q.id] === 1).length
        expect(yes, `${seed} ${q.id}`).toBeGreaterThanOrEqual(8)
        expect(yes, `${seed} ${q.id}`).toBeLessThanOrEqual(16)
      }
    }
  })

  it('draws each trait on the face: the answer matches the kit look', () => {
    for (const f of faces) {
      const look = decodeAvatar(f.avatar)
      expect(look.hat !== 'none').toBe(f.traits.hat === 1)
      expect(look.glasses !== 'none').toBe(f.traits.glasses === 1)
      expect(look.beard !== 'none').toBe(f.traits.beard === 1)
      expect(['long', 'wavy', 'braids'].includes(look.hair)).toBe(f.traits.long === 1)
      expect(['hblack', 'hdark'].includes(look.hairColor)).toBe(f.traits.dark === 1)
      expect(['smile', 'grin'].includes(look.mouth)).toBe(f.traits.smile === 1)
    }
  })
})

describe('phases', () => {
  it('waits for both secret picks before any question', () => {
    expect(phaseOf({ fSeed: SEED })).toBe('pick')
    expect(phaseOf({ fSeed: SEED, fCommit: { X: 'hx' } })).toBe('pick')
    expect(phaseOf(picked())).toBe('ask')
    expect(canAsk({ fSeed: SEED, fCommit: { X: 'hx' } }, 'X', 'hat')).toBe(false)
  })

  it('goes ask → answer → ask, passing the turn with the answer', () => {
    const asked = askQuestion(picked(), 'X', 'hat')
    expect(phaseOf(asked)).toBe('answer')
    expect(pendingAsk(asked)).toMatchObject({ by: 'X', q: 'hat', index: 0 })
    expect(canAsk(asked, 'X', 'glasses')).toBe(false)
    const answered = answerQuestion(asked, 'O', 1)
    expect(phaseOf(answered)).toBe('ask')
    expect(normalizeRound(answered).turn).toBe('O')
    expect(pendingAsk(answered)).toBe(null)
  })

  it('goes to reveal on a name and to judge once both secrets are in', () => {
    const named = nameFace(picked(), 'X', 3)
    expect(phaseOf(named)).toBe('reveal')
    expect(canAsk(named, 'X', 'hat')).toBe(false)
    expect(phaseOf({ ...named, fReveal: { X: { i: 1, salt: 's' } } })).toBe('reveal')
    expect(phaseOf({ ...named, fReveal: { X: { i: 1, salt: 's' }, O: { i: 3, salt: 't' } } })).toBe('judge')
  })
})

describe('asking', () => {
  it('only lets the player to move ask, and each question once', () => {
    expect(canAsk(picked(), 'O', 'hat')).toBe(false)
    expect(askQuestion(picked(), 'O', 'hat')).toBe(null)
    expect(askQuestion(picked(), 'X', 'nope')).toBe(null)
    let r = ask(picked(), 'X', 'hat', 5)
    r = ask(r, 'O', 'hat', 2)          // the rival may ask the same question about my face
    expect(askedBy(r, 'X')).toEqual(['hat'])
    expect(canAsk(r, 'X', 'hat')).toBe(false)
    expect(canAsk(r, 'X', 'glasses')).toBe(true)
  })

  it('only the player who was asked can answer, with a 0 or 1', () => {
    const asked = askQuestion(picked(), 'X', 'hat')
    expect(answerQuestion(asked, 'X', 1)).toBe(null)
    expect(answerQuestion(asked, 'O', 'yes')).toBe(null)
    expect(answerQuestion(picked(), 'O', 1)).toBe(null)
  })

  it('reads the question log back from the sparse object Firebase returns', () => {
    const r = normalizeRound({ fAsks: { 0: { by: 'X', q: 'hat', a: 0 }, 1: { by: 'O', q: 'smile' } } })
    expect(r.asks).toEqual([{ by: 'X', q: 'hat', a: 0 }, { by: 'O', q: 'smile', a: null }])
    // A gap would shift later answers, so the log stops there.
    expect(normalizeRound({ fAsks: { 0: { by: 'X', q: 'hat', a: 0 }, 2: { by: 'X', q: 'smile', a: 1 } } }).asks).toHaveLength(1)
  })
})

describe('the board', () => {
  it('flips down every face an answer rules out, on the asker\'s board only', () => {
    const secretO = 7
    const r = ask(picked(), 'X', 'hat', secretO)
    const left = remainingFor(faces, r, 'X')
    expect(left).toContain(secretO)
    expect(left.every((i) => faces[i].traits.hat === faces[secretO].traits.hat)).toBe(true)
    expect(left.length).toBeLessThan(FACE_COUNT)
    expect(remainingFor(faces, r, 'O')).toHaveLength(FACE_COUNT)
  })

  it('previews how a question would split the standing faces', () => {
    const s = splitFor(faces, picked(), 'X', 'glasses')
    expect(s.yes + s.no).toBe(FACE_COUNT)
    expect(s.yes).toBe(faces.filter((f) => f.traits.glasses === 1).length)
  })

  it('narrows to exactly the secret face after all six honest answers', () => {
    const secretO = 11
    let r = picked()
    for (const q of QUESTIONS) {
      r = ask(r, 'X', q.id, secretO)
      r = { ...r, fTurn: 'X' }
    }
    expect(remainingFor(faces, r, 'X')).toEqual([secretO])
  })
})

describe('naming and judging', () => {
  const end = (name, secrets, valid = { X: true, O: true }, base = picked()) => judge(
    faces,
    { ...nameFace(base, 'X', name), fReveal: { X: { i: secrets.X, salt: 'a' }, O: { i: secrets.O, salt: 'b' } } },
    valid,
  )

  it('only lets the player to move name a face on the board', () => {
    expect(canName(picked(), 'X')).toBe(true)
    expect(nameFace(picked(), 'O', 3)).toBe(null)
    expect(nameFace(picked(), 'X', FACE_COUNT)).toBe(null)
    expect(nameFace(askQuestion(picked(), 'X', 'hat'), 'X', 3)).toBe(null)
  })

  it('a right name wins and a wrong name loses', () => {
    expect(end(4, { X: 9, O: 4 })).toMatchObject({ winner: 'X', reason: 'named' })
    expect(end(5, { X: 9, O: 4 })).toMatchObject({ winner: 'O', reason: 'wrong' })
  })

  it('has no result until both secrets are revealed', () => {
    expect(judge(faces, nameFace(picked(), 'X', 4), { X: true, O: true })).toBe(null)
  })

  it('a reveal that does not match its commitment forfeits', () => {
    expect(end(4, { X: 9, O: 4 }, { X: true, O: false })).toMatchObject({ winner: 'X', reason: 'cheat', cheats: ['O'] })
    expect(end(4, { X: 9, O: 4 }, { X: false, O: true })).toMatchObject({ winner: 'O', reason: 'cheat', cheats: ['X'] })
    expect(end(4, { X: 9, O: 4 }, { X: false, O: false })).toMatchObject({ winner: 'draw', reason: 'cheat' })
  })

  it('a false answer forfeits, even when the name was wrong', () => {
    const secretO = 4
    const lie = traitOf(faces, secretO, 'hat') ? 0 : 1
    const lied = { ...answerQuestion(askQuestion(picked(), 'X', 'hat'), 'O', lie), fTurn: 'X' }
    expect(end(5, { X: 9, O: secretO }, { X: true, O: true }, lied)).toMatchObject({ winner: 'X', reason: 'cheat', cheats: ['O'] })
  })
})

describe('botMove', () => {
  const fixed = (v) => () => v

  it('asks while several faces stand and names the last one', () => {
    for (const level of BOT_LEVELS) expect(botMove(faces, picked(), 'X', level, fixed(0))).toHaveProperty('ask')
    const secretO = 11
    let r = picked()
    for (const q of QUESTIONS) r = { ...ask(r, 'X', q.id, secretO), fTurn: 'X' }
    expect(botMove(faces, r, 'X', 'easy', fixed(0))).toEqual({ name: secretO })
  })

  it('never repeats a question', () => {
    const r = { ...ask(picked(), 'X', 'hat', 3), fTurn: 'X' }
    for (const v of [0, 0.3, 0.6, 0.99]) expect(botMove(faces, r, 'X', 'easy', fixed(v)).ask).not.toBe('hat')
  })

  it('picks the most even split on NORMAL', () => {
    const q = botMove(faces, picked(), 'X', 'normal', fixed(0)).ask
    const even = (id) => { const s = splitFor(faces, picked(), 'X', id); return Math.min(s.yes, s.no) }
    expect(even(q)).toBe(Math.max(...QUESTIONS.map((x) => even(x.id))))
  })

  it('finds any secret face within six questions and a name', () => {
    for (const secretO of [0, 5, 13, 23]) {
      let r = picked()
      let named = null
      for (let turn = 0; turn < 7 && named == null; turn++) {
        const m = botMove(faces, r, 'X', 'normal', fixed(0))
        if (m.name != null) named = m.name
        else r = { ...ask(r, 'X', m.ask, secretO), fTurn: 'X' }
      }
      expect(named).toBe(secretO)
    }
  })
})
