import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { isRoomCoordinator, pickCoordinator } from '../lib/coordinator'
import { markSeen, normalizeSeen } from '../lib/seenHistory'
import { commit, verifyReveal } from '../lib/commit'
import { seal, openWithPrivate, openWithKey, encryptWithKey, newSymmetricKey, sealKeyId } from '../lib/sealed'
import { scaledMs, timersOff } from '../lib/timerScale'
import { formatClock } from '../lib/format'
import { overlapsWord } from '../lib/wordMatch'
import {
  JO_MIN_PLAYERS, JO_CARDS, JO_CLUE_MS, JO_GUESS_MS, JO_REVEAL_GRACE_MS, JO_SEEN_KEY,
  seatOrder, pickWordIndex, clueError, cancelClues, scoreRating, clueGivers, wordHolders,
  giversNeedingSeal, readyToDeal, allCluesIn, pendingReveals, sealContext, clueContext,
  encodeDeal, decodeDeal, encodeClue, decodeClue, verifyClues, normalizeRound, buildCard,
  nextCard, judgeCard, applyOutcome, isMatchOver,
} from '../lib/justOneLogic'
import { JUST_ONE_WORDS } from '../lib/decks/justone'
import useSealKey from '../hooks/useSealKey'
import useCommitReveal, { clearSecret, secretKey } from '../hooks/useCommitReveal'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import GameSwitcher from '../components/GameSwitcher'
import RoundEndPanel from '../components/RoundEndPanel'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// Rules (cancellation, judging, scoring, rotation) live in
// src/lib/justOneLogic.js.
//
// -----------------------------------------------------------------------------
// SECRECY MODEL — read before touching the round shape.
//
// Every `games/$id` field is world-readable, and the guesser must not see the
// mystery word or the cancelled clues. So:
//   * Every player publishes a public key (`game.sealKeys`, src/lib/sealed.js
//     + src/hooks/useSealKey.js).
//     A clue-giver's client (the dealer) picks the word and a random per-card
//     round key, and seals `{ word, wordSalt, key }` for each clue-giver
//     (`round.sealed`). Only a salted commitment of the word is public
//     (`round.wordCommit`). The guesser gets no box.
//   * Clues are committed while writing (`round.clues[uid].h`, commit.js
//     format; plaintext + salt stay in the writer's sessionStorage), so nobody
//     can adjust theirs after seeing the others.
//   * Once everyone is in, each writer re-publishes `{ text, salt }` encrypted
//     under the round key (`round.enc`). Clue-givers can read and compare
//     them; the guesser can't. The judge (online-aware coordinator among the
//     word holders) verifies every clue against its commitment, cancels
//     duplicates and publishes only the survivors (`round.survivors`).
//   * At the result the word, its salt and the round key go public
//     (`round.reveal`): every client verifies the word commitment and every
//     clue, and sees the cancelled ones.
//
// REMAINING TRUST LIMITS (no trusted server, so detect-not-prevent):
//   * Every clue-giver knows the word by design; a modified client could leak
//     it to the guesser, or the judge could publish wrong survivors / a wrong
//     verdict. Word and clue commitments make a lie visible at the result;
//     nothing rolls it back.
//   * A clue-giver who reopens the room in a new tab gets a fresh key and is
//     re-sealed by a current holder; one whose clue secret is lost simply
//     counts as no clue after a short grace.
// -----------------------------------------------------------------------------

const CLUE_SECRET_KEY = 'justone-clue'
const newNonce = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)))
  .map(b => b.toString(16).padStart(2, '0')).join('')
const OUTCOME_TEXT = { correct: 'CORRECT!', wrong: 'WRONG GUESS', skip: 'PASSED' }
const OUTCOME_CLASS = {
  correct: 'text-retro-win text-glow-win',
  wrong: 'text-retro-p2 text-glow-p2',
  skip: 'text-retro-dim',
}

export default function JustOneGame({
  gameId, game, mySeat, players,
  onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const phase = round?.phase ?? null
  const status = game.status
  const nonce = round?.nonce ?? ''
  const seats = useMemo(() => seatOrder(players), [players])
  const order = round?.order?.length ? round.order : seats
  const isOnline = (uid) => players?.[uid]?.online !== false
  const nameOf = (uid) => players?.[uid]?.name || 'PLAYER'
  const isPlayer = !!mySeat && !!players?.[mySeat]
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid ?? null)
  // Sealing key (room-level `sealKeys`); needs Web Crypto, i.e. HTTPS/localhost.
  const { pair, sealKeys, supported: cryptoOk } = useSealKey(gameId, isPlayer ? mySeat : null, game.sealKeys)
  const noTimer = timersOff(game.timerScale)

  const live = status !== 'waiting' && !!round
  const amGuesser = live && round.guesser === mySeat
  const amGiver = live && isPlayer && order.includes(mySeat) && !amGuesser
  const givers = live ? clueGivers(round, order) : []

  const clueSecret = useCommitReveal(gameId, CLUE_SECRET_KEY, nonce || undefined)
  const timed = live && (phase === 'clues' || phase === 'guess' || phase === 'compare')
  const { now } = useServerClock(timed ? 500 : 0)

  const [starting, runStart] = useBusy()
  const [submitting, runSubmit] = useBusy()
  const [guessingBusy, runGuess] = useBusy()
  const [passing, runPass] = useBusy()
  const [closing, runClose] = useBusy()
  const [skipping, runSkip] = useBusy()
  const [clueInput, setClueInput] = useState('')
  const [clueErr, setClueErr] = useState('')
  const [guessInput, setGuessInput] = useState('')
  const [guessErr, setGuessErr] = useState('')

  // Fresh inputs for every card (render-phase derive).
  const [prevNonce, setPrevNonce] = useState(nonce)
  if (prevNonce !== nonce) {
    setPrevNonce(nonce)
    setClueInput('')
    setClueErr('')
    setGuessInput('')
    setGuessErr('')
  }

  // ---------------------------------------------------------------------------
  // My sealed deal: { word, wordSalt, key } — clue-givers only.
  // ---------------------------------------------------------------------------
  const [dealState, setDealState] = useState(null) // { nonce, boxId, ok, word, wordSalt, key }
  const myBox = amGiver ? round.sealed[mySeat] : null
  const boxForMe = myBox && pair && myBox.kid === sealKeyId(pair.pub) ? myBox : null
  const sameBox = dealState && dealState.nonce === nonce && boxForMe && dealState.boxId === boxForMe.epk
  const myDeal = sameBox && dealState.ok ? dealState : null

  useEffect(() => {
    if (!boxForMe || !round || sameBox) return
    let alive = true
    const wordCommit = round.wordCommit
    ;(async () => {
      const opened = await openWithPrivate(pair.privJwk, pair.pub, boxForMe, sealContext(gameId, nonce, mySeat))
      const deal = opened ? decodeDeal(opened.plaintext) : null
      const ok = !!deal && !!wordCommit && await verifyReveal(wordCommit, deal.word, deal.wordSalt)
      if (alive) setDealState({ nonce, boxId: boxForMe.epk, ok, ...(ok ? deal : {}) })
    })().catch(() => {})
    return () => { alive = false }
  }, [boxForMe?.epk, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Result: everything is public — verify the word and every clue.
  const [audit, setAudit] = useState(null) // { nonce, wordOk, clues: { uid: { text, ok } } }
  const reveal = (phase === 'result' || phase === 'over') ? round.reveal : null
  useEffect(() => {
    if (!reveal?.key || (audit && audit.nonce === nonce)) return
    let alive = true
    const commits = round.clues
    const enc = round.enc
    const wordCommit = round.wordCommit
    ;(async () => {
      const wordOk = !!wordCommit && await verifyReveal(wordCommit, reveal.word, reveal.wordSalt)
      const clues = {}
      for (const [uid, box] of Object.entries(enc)) {
        const opened = decodeClue(await openWithKey(reveal.key, box, clueContext(gameId, nonce, uid)))
        const ok = !!opened && !!commits[uid]?.h && await verifyReveal(commits[uid].h, opened.text, opened.salt)
        clues[uid] = { text: opened?.text ?? '???', ok }
      }
      if (alive) setAudit({ nonce, wordOk, clues })
    })().catch(() => {})
    return () => { alive = false }
  }, [reveal?.key, nonce]) // eslint-disable-line react-hooks/exhaustive-deps
  const cardAudit = audit && audit.nonce === nonce ? audit : null

  // Clue-givers can read every clue once they are published (compare/guess).
  const [peek, setPeek] = useState(null) // { nonce, sig, clues: { uid: text } }
  const encSig = live ? Object.keys(round.enc).sort().join(',') : ''
  useEffect(() => {
    if (!myDeal || !encSig || phase === 'result' || phase === 'over') return
    if (peek && peek.nonce === nonce && peek.sig === encSig) return
    let alive = true
    const enc = round.enc
    ;(async () => {
      const clues = {}
      for (const [uid, box] of Object.entries(enc)) {
        const opened = decodeClue(await openWithKey(myDeal.key, box, clueContext(gameId, nonce, uid)))
        if (opened) clues[uid] = opened.text
      }
      if (alive) setPeek({ nonce, sig: encSig, clues })
    })().catch(() => {})
    return () => { alive = false }
  }, [!!myDeal, encSig, nonce, phase]) // eslint-disable-line react-hooks/exhaustive-deps
  const giverView = peek && peek.nonce === nonce ? peek.clues : {}

  // ---------------------------------------------------------------------------
  // Background protocol: deal, re-seal, close clues, compare, publish my
  // encrypted clue, judge. (Publishing my public key is useSealKey's job.)
  // ---------------------------------------------------------------------------
  const dealerId = live && phase === 'dealing'
    ? pickCoordinator(givers.filter(uid => sealKeys[uid]), players)
    : null
  const canDeal = live && phase === 'dealing' && readyToDeal(round, order, sealKeys, isOnline)
  const dealing = useRef(null)
  useEffect(() => {
    if (!canDeal || dealerId !== mySeat || status !== 'playing') return
    if (dealing.current === nonce) return
    dealing.current = nonce
    const frame = round
    const pubkeys = sealKeys
    ;(async () => {
      const wordIndex = pickWordIndex(normalizeSeen(game.seen?.[JO_SEEN_KEY]), frame.used)
      const word = JUST_ONE_WORDS[wordIndex]
      const { hash: wordCommit, salt: wordSalt } = await commit(word)
      const payload = encodeDeal({ word, wordSalt, key: newSymmetricKey() })
      const sealed = {}
      for (const uid of clueGivers(frame, order)) {
        const pub = pubkeys[uid]
        if (!pub) continue
        sealed[uid] = (await seal(pub, payload, sealContext(gameId, nonce, uid))).box
      }
      await runTransaction(ref(db, `games/${gameId}/round`), cur => {
        if (!cur) return cur
        if (cur.phase !== 'dealing' || cur.nonce !== nonce) return
        return { ...cur, phase: 'clues', wordCommit, sealed, phaseStartedAt: getServerNow() }
      })
    })().catch(() => { dealing.current = null })
  }, [canDeal, dealerId, mySeat, status, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // The judge: online-aware coordinator among players holding the word.
  const holders = live ? wordHolders(round, order, sealKeys) : []
  const judgeId = holders.length ? pickCoordinator(holders, players) : null
  const amJudge = !!myDeal && judgeId === mySeat

  const resealed = useRef(new Set())
  const needSeal = live && phase !== 'dealing' && phase !== 'result' && phase !== 'over' ? giversNeedingSeal(round, order, sealKeys) : []
  const needSealSig = needSeal.map(uid => `${uid}:${sealKeyId(sealKeys[uid])}`).join(',')
  useEffect(() => {
    if (!amJudge || !needSealSig) return
    const payload = encodeDeal(myDeal)
    for (const uid of needSeal) {
      const pub = sealKeys[uid]
      const tag = `${nonce}:${uid}:${sealKeyId(pub)}`
      if (resealed.current.has(tag)) continue
      resealed.current.add(tag)
      seal(pub, payload, sealContext(gameId, nonce, uid))
        .then(({ box }) => runTransaction(ref(db, `games/${gameId}/round`), cur => {
          if (!cur) return cur
          if (cur.nonce !== nonce || cur.sealed?.[uid]?.kid === box.kid) return
          return { ...cur, sealed: { ...(cur.sealed || {}), [uid]: box } }
        }))
        .catch(() => resealed.current.delete(tag))
    }
  }, [amJudge, needSealSig]) // eslint-disable-line react-hooks/exhaustive-deps

  const clueMs = scaledMs(JO_CLUE_MS, game.timerScale)
  const guessMs = scaledMs(JO_GUESS_MS, game.timerScale)
  const phaseEnds = !live || round.phaseStartedAt == null ? null
    : phase === 'clues' && clueMs != null ? round.phaseStartedAt + clueMs
      : phase === 'guess' && guessMs != null ? round.phaseStartedAt + guessMs
        : null
  const remainingMs = phaseEnds != null ? Math.max(0, phaseEnds - now) : null
  const timeUp = remainingMs != null && remainingMs <= 0

  const closeClues = () => runTransaction(ref(db, `games/${gameId}/round`), cur => {
    if (!cur) return cur
    if (cur.phase !== 'clues' || cur.nonce !== nonce) return
    return { ...cur, phase: 'compare', phaseStartedAt: getServerNow() }
  })

  // clues → compare once everyone online has committed (or time is up).
  const closedRef = useRef(null)
  const cluesIn = live && phase === 'clues' && allCluesIn(round, order, isOnline)
  useEffect(() => {
    if (!amJudge || phase !== 'clues') return
    if (!cluesIn && !timeUp) return
    if (closedRef.current === nonce) return
    closedRef.current = nonce
    closeClues().catch(() => { closedRef.current = null })
  }, [amJudge, phase, cluesIn, timeUp, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // compare: publish my clue, encrypted under the round key.
  const encPublished = useRef(null)
  useEffect(() => {
    if (!amGiver || !myDeal || phase !== 'compare') return
    const mine = round.clues[mySeat]
    if (!mine?.h || round.enc[mySeat]) return
    const stored = clueSecret.read()
    if (!stored || stored.hash !== mine.h || stored.text == null) return
    if (encPublished.current === nonce) return
    encPublished.current = nonce
    encryptWithKey(myDeal.key, encodeClue({ text: stored.text, salt: stored.salt }), clueContext(gameId, nonce, mySeat))
      .then(box => runTransaction(ref(db, `games/${gameId}/round`), cur => {
        if (!cur) return cur
        if (cur.phase !== 'compare' || cur.nonce !== nonce || cur.enc?.[mySeat]) return
        return { ...cur, enc: { ...(cur.enc || {}), [mySeat]: box } }
      }))
      .catch(() => { encPublished.current = null })
  }, [amGiver, !!myDeal, phase, nonce, round?.enc?.[mySeat]]) // eslint-disable-line react-hooks/exhaustive-deps

  // compare → guess: the judge verifies and cancels, publishing survivors only.
  const compared = useRef(null)
  const waitingReveals = live && phase === 'compare' ? pendingReveals(round).length : 0
  const graceOver = live && phase === 'compare' && round.phaseStartedAt != null && now >= round.phaseStartedAt + JO_REVEAL_GRACE_MS
  useEffect(() => {
    if (!amJudge || phase !== 'compare') return
    if (waitingReveals > 0 && !graceOver) return
    if (compared.current === nonce) return
    compared.current = nonce
    const enc = round.enc
    const commits = round.clues
    const { word, key } = myDeal
    ;(async () => {
      const opened = {}
      for (const [uid, box] of Object.entries(enc)) {
        opened[uid] = decodeClue(await openWithKey(key, box, clueContext(gameId, nonce, uid)))
      }
      const { verified } = await verifyClues(commits, opened)
      const { survivors } = cancelClues(verified, word)
      const committed = Object.values(commits).filter(c => c?.h).length
      await runTransaction(ref(db, `games/${gameId}/round`), cur => {
        if (!cur) return cur
        if (cur.phase !== 'compare' || cur.nonce !== nonce) return
        return {
          ...cur, phase: 'guess', survivors,
          cancelledCount: committed - Object.keys(survivors).length,
          phaseStartedAt: getServerNow(),
        }
      })
    })().catch(() => { compared.current = null })
  }, [amJudge, phase, waitingReveals, graceOver, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // guess timer: an unanswered guess counts as a pass.
  const autoPassed = useRef(null)
  useEffect(() => {
    if (!amJudge || phase !== 'guess' || !timeUp) return
    if (autoPassed.current === nonce) return
    autoPassed.current = nonce
    runTransaction(ref(db, `games/${gameId}/round`), cur => {
      if (!cur) return cur
      if (cur.phase !== 'guess' || cur.nonce !== nonce) return
      return { ...cur, phase: 'judging', guess: null }
    }).catch(() => { autoPassed.current = null })
  }, [amJudge, phase, timeUp, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // judging → result/over: verdict, score, and everything goes public.
  const judged = useRef(null)
  useEffect(() => {
    if (!amJudge || phase !== 'judging') return
    if (judged.current === nonce) return
    judged.current = nonce
    const { word, wordSalt, key } = myDeal
    const wordIndex = JUST_ONE_WORDS.indexOf(word)
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = normalizeRound(current.round)
      if (!r || r.phase !== 'judging' || r.nonce !== nonce) return
      const verdict = judgeCard(r, { word, guess: r.guess?.text ?? null })
      const seatIds = seatOrder(current.players)
      const seen = wordIndex < 0 ? current.seen : {
        ...(current.seen || {}),
        [JO_SEEN_KEY]: markSeen(normalizeSeen(current.seen?.[JO_SEEN_KEY]), [wordIndex]),
      }
      return {
        ...current,
        seen,
        lastActivityAt: Date.now(),
        round: {
          ...r,
          phase: verdict.over ? 'over' : 'result',
          outcome: verdict.outcome,
          score: verdict.score,
          played: verdict.played,
          reveal: { word, wordSalt, key },
          used: wordIndex < 0 ? r.used : [...r.used, wordIndex],
          history: [...r.history, verdict.entry],
        },
        ...(verdict.over ? {
          status: 'finished',
          winner: null,
          scores: Object.fromEntries(seatIds.map(id => [id, verdict.score])),
        } : {}),
      }
    }).catch(() => { judged.current = null })
  }, [amJudge, phase, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Result sound — for everyone, on the judging → result flip (not on mount).
  const prevPhase = useRef(phase)
  useEffect(() => {
    const prev = prevPhase.current
    prevPhase.current = phase
    if (prev !== 'judging' || (phase !== 'result' && phase !== 'over')) return
    if (round.outcome === 'correct') sounds.win()
    else if (round.outcome === 'wrong') sounds.lose()
    else sounds.miss()
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // A card's clue secret is spent once the next card is dealt.
  const lastNonce = useRef(nonce)
  useEffect(() => {
    if (lastNonce.current && lastNonce.current !== nonce) {
      clearSecret(secretKey(CLUE_SECRET_KEY, gameId, lastNonce.current))
    }
    lastNonce.current = nonce
  }, [nonce, gameId])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const startMatch = () => runStart(async () => {
    if (!amCoordinator || seats.length < JO_MIN_PLAYERS) return
    const card = buildCard({
      nonce: newNonce(), card: 1, played: 0, score: 0, order: seats, guesser: seats[0],
    })
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      if (current.status !== 'waiting') return
      return { ...current, status: 'playing', winner: null, round: card, proposal: null, lastActivityAt: Date.now() }
    })
  }, () => toast.error('START FAILED — CHECK CONNECTION'))

  const submitClue = () => {
    if (!amGiver || !myDeal || phase !== 'clues' || round.clues[mySeat]?.h) return
    const text = clueInput.trim()
    const err = clueError(text) || (overlapsWord(text, myDeal.word) ? 'NO FORMS OF THE MYSTERY WORD' : null)
    if (err) { setClueErr(err); return }
    setClueErr('')
    runSubmit(async () => {
      const { hash } = await clueSecret.commit(text, { text })
      const { committed } = await runTransaction(ref(db, `games/${gameId}/round`), cur => {
        if (!cur) return cur
        if (cur.phase !== 'clues' || cur.nonce !== nonce || cur.clues?.[mySeat]?.h) return
        return { ...cur, clues: { ...(cur.clues || {}), [mySeat]: { h: hash } } }
      })
      if (!committed) { setClueErr('TOO LATE — CLUES ARE CLOSED'); return }
      sounds.move('X')
    }, () => toast.error('CLUE FAILED — CHECK CONNECTION'))
  }

  const submitGuess = () => {
    if (!amGuesser || phase !== 'guess') return
    const text = guessInput.trim()
    if (!text) { setGuessErr('TYPE A GUESS'); return }
    setGuessErr('')
    runGuess(async () => {
      await runTransaction(ref(db, `games/${gameId}/round`), cur => {
        if (!cur) return cur
        if (cur.phase !== 'guess' || cur.nonce !== nonce) return
        return { ...cur, phase: 'judging', guess: { text: text.slice(0, 40) } }
      })
      sounds.move('O')
    }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))
  }

  const passCard = () => runPass(async () => {
    if (!amGuesser || phase !== 'guess') return
    await runTransaction(ref(db, `games/${gameId}/round`), cur => {
      if (!cur) return cur
      if (cur.phase !== 'guess' || cur.nonce !== nonce) return
      return { ...cur, phase: 'judging', guess: null }
    })
  }, () => toast.error('PASS FAILED — CHECK CONNECTION'))

  // Any player may deal the next card once the result is up (transactional,
  // so two taps advance exactly once). RoundEndPanel owns busy + toast.
  const goNextCard = async () => {
    if (!isPlayer || !round) return
    const nextNonce = newNonce()
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = normalizeRound(current.round)
      if (!r || r.phase !== 'result' || r.nonce !== nonce || current.status !== 'playing') return
      const next = nextCard(r, { nonce: nextNonce, isOnline: uid => current.players?.[uid]?.online !== false })
      if (!next) return
      return { ...current, round: next, proposal: null, lastActivityAt: Date.now() }
    })
  }

  // Stuck card (nobody online holds the word): skip it unscored.
  const skipCard = () => runSkip(async () => {
    if (!amCoordinator || !round) return
    const nextNonce = newNonce()
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = normalizeRound(current.round)
      if (!r || r.nonce !== nonce || current.status !== 'playing') return
      if (r.phase === 'result' || r.phase === 'over') return
      const { score, played } = applyOutcome(r, 'skip')
      const history = [...r.history, { word: null, outcome: 'skip', guesser: r.guesser, guess: null }]
      const base = { ...r, score, played, history }
      if (isMatchOver(played)) {
        const seatIds = seatOrder(current.players)
        return {
          ...current,
          status: 'finished', winner: null, lastActivityAt: Date.now(),
          round: { ...base, phase: 'over', outcome: 'skip' },
          scores: Object.fromEntries(seatIds.map(id => [id, score])),
        }
      }
      const next = nextCard(base, { nonce: nextNonce, isOnline: uid => current.players?.[uid]?.online !== false })
      return { ...current, round: next, lastActivityAt: Date.now() }
    })
  }, () => toast.error('SKIP FAILED — CHECK CONNECTION'))

  // ---------------------------------------------------------------------------
  // Render: lobby
  // ---------------------------------------------------------------------------
  if (status === 'waiting' || !round) {
    const need = Math.max(0, JO_MIN_PLAYERS - seats.length)
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <p className="font-pixel text-xs text-retro-cta text-glow-cta tracking-widest">JUST ONE</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Play together. Everyone but the guesser writes ONE secret one-word clue —
            matching clues cancel out. {JO_CARDS} cards, one team score.
          </p>
          {!cryptoOk && (
            <p className="font-pixel text-[9px] text-retro-p2 leading-relaxed">
              THIS DEVICE CAN&apos;T RECEIVE THE SECRET WORD — OPEN THE GAME OVER HTTPS
            </p>
          )}
        </div>
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">PLAYERS ({seats.length})</p>
          <ul className="space-y-1">
            {seats.map((uid, i) => (
              <li key={uid} className="flex items-center justify-between font-mono text-[11px]">
                <span className={cn(uid === mySeat ? 'text-retro-p1 text-glow-p1' : 'text-retro-text')}>
                  {i + 1}. {nameOf(uid)}{uid === mySeat ? ' (YOU)' : ''}
                </span>
                <span className={cn('font-pixel text-[8px]', isOnline(uid) ? 'text-retro-win' : 'text-retro-dim')}>
                  {isOnline(uid) ? 'ONLINE' : 'OFF'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {amCoordinator ? (
          <div className="text-center">
            {need === 0 ? (
              <button
                onClick={startMatch}
                disabled={starting}
                className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                {starting ? 'STARTING…' : 'START GAME'}
              </button>
            ) : (
              <p className="font-pixel text-[10px] text-retro-dim arcade-blink">NEED {need} MORE PLAYER{need === 1 ? '' : 'S'}</p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
            {need === 0 ? 'WAITING FOR THE HOST TO START…' : `WAITING FOR PLAYERS (${seats.length}/${JO_MIN_PLAYERS})`}
          </p>
        )}
        {isPlayer && !proposal && onSwitchGame && <GameSwitcher currentType="justone" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: match over
  // ---------------------------------------------------------------------------
  if (phase === 'over') {
    const headline = `${round.score} / ${JO_CARDS}`
    return (
      <div className="space-y-4">
        <RoundEndPanel
          caption="TEAM SCORE"
          headline={headline}
          sub={<p className="font-pixel text-[10px] text-retro-win text-glow-win">{scoreRating(round.score)}</p>}
          actions={isPlayer ? [
            !proposal && onNewMatch && { key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch },
          ] : []}
          share={isPlayer ? { gameLabel: 'JUST ONE', headline: `WE SCORED ${headline}`, sub: 'Just One · Game Night' } : null}
        >
          <CardHistory history={round.history} nameOf={nameOf} />
        </RoundEndPanel>
        {isPlayer && !proposal && onSwitchGame && <GameSwitcher currentType="justone" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: a card in play
  // ---------------------------------------------------------------------------
  const committedCount = Object.values(round.clues).filter(c => c?.h).length
  const onlineGivers = givers.filter(isOnline)
  const iCommitted = !!round.clues[mySeat]?.h
  const survivors = round.survivors || {}
  const stuck = phase !== 'result' && (
    phase === 'dealing'
      ? onlineGivers.length === 0
      : holders.filter(isOnline).length === 0
  )
  const timerBar = remainingMs != null && (
    <p className={cn('font-pixel text-[9px] tabular-nums', remainingMs <= 10_000 ? 'text-retro-danger' : 'text-retro-dim')}>
      {formatClock(remainingMs)}
    </p>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between font-pixel text-[9px] tracking-widest">
        <span className="text-retro-dim">CARD {round.card} / {JO_CARDS}</span>
        <span className="text-retro-win" data-testid="jo-score">SCORE {round.score}</span>
      </div>

      <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2" aria-live="polite">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">
          {amGuesser ? 'YOU ARE THE GUESSER' : `GUESSER: ${nameOf(round.guesser).toUpperCase()}`}
        </p>
        {phase === 'dealing' && (
          <p className="font-pixel text-[10px] text-retro-cta arcade-blink">DEALING THE MYSTERY WORD…</p>
        )}
        {(phase === 'clues' || phase === 'compare' || phase === 'guess' || phase === 'judging') && amGiver && (
          myDeal ? (
            <>
              <p className="font-pixel text-[8px] text-retro-dim">MYSTERY WORD</p>
              <p className="font-pixel text-lg text-retro-cta text-glow-cta tracking-widest" data-testid="jo-word">
                {myDeal.word.toUpperCase()}
              </p>
              <p className="font-mono text-[9px] text-retro-dim">Don&apos;t say it out loud!</p>
            </>
          ) : (
            <p className="font-pixel text-[9px] text-retro-p2">
              {!cryptoOk ? "THIS DEVICE CAN'T OPEN THE WORD — IT NEEDS HTTPS"
                : sameBox && !dealState.ok ? '⚠ YOUR CARD FAILED ITS CHECK' : 'RECEIVING THE WORD…'}
            </p>
          )
        )}
        {phase === 'clues' && amGuesser && (
          <p className="font-pixel text-[10px] text-retro-cta arcade-blink">YOUR TEAM IS WRITING CLUES…</p>
        )}
        {phase === 'compare' && (
          <p className="font-pixel text-[10px] text-retro-cta arcade-blink">COMPARING CLUES…</p>
        )}
        {phase === 'judging' && (
          <p className="font-pixel text-[10px] text-retro-cta arcade-blink">
            {round.guess ? `CHECKING "${String(round.guess.text).toUpperCase()}"…` : 'PASSING…'}
          </p>
        )}
        {phase === 'result' && round.reveal && (
          <>
            <p className={cn('font-pixel text-sm', OUTCOME_CLASS[round.outcome])} data-testid="jo-outcome">
              {OUTCOME_TEXT[round.outcome] || ''}
            </p>
            <p className="font-mono text-[11px] text-retro-dim">
              The word was <span className="font-pixel text-retro-cta text-glow-cta">{String(round.reveal.word).toUpperCase()}</span>
              {cardAudit && !cardAudit.wordOk && <span className="font-pixel text-[8px] text-retro-danger"> ⚠ UNVERIFIED</span>}
            </p>
            {round.guess && (
              <p className="font-mono text-[10px] text-retro-dim">
                {nameOf(round.guesser)} guessed “{round.guess.text}”
              </p>
            )}
          </>
        )}
      </div>

      {/* CLUES: write one */}
      {phase === 'clues' && (
        <div className="space-y-2">
          {timerBar ? <div className="text-right">{timerBar}</div> : noTimer && (
            <p className="font-pixel text-[8px] text-retro-dim text-center">NO TIMER · CLUES REVEAL WHEN EVERYONE IS IN</p>
          )}
          {amGiver && myDeal && !iCommitted && (
            <div className="space-y-2">
              <input
                type="text"
                value={clueInput}
                maxLength={24}
                onChange={e => { setClueInput(e.target.value); setClueErr('') }}
                onKeyDown={e => e.key === 'Enter' && submitClue()}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="ONE-WORD CLUE"
                aria-label="Your one-word clue"
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1"
              />
              {clueErr && <p className="font-pixel text-[9px] text-retro-p2 text-center">{clueErr}</p>}
              <button
                onClick={submitClue}
                disabled={submitting}
                className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
              >
                {submitting ? 'LOCKING…' : 'LOCK IN CLUE'}
              </button>
              <p className="font-mono text-[9px] text-retro-dim text-center">
                Matching clues cancel out — go for something only you would think of.
              </p>
            </div>
          )}
          {amGiver && iCommitted && (
            <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center">
              LOCKED IN ✓ — HIDDEN UNTIL EVERYONE IS IN
            </p>
          )}
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {committedCount}/{givers.length} CLUES IN
          </p>
          {noTimer && amJudge && committedCount > 0 && !cluesIn && (
            <button
              onClick={() => runClose(closeClues, () => toast.error('CLOSE FAILED — CHECK CONNECTION'))}
              disabled={closing}
              className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95 disabled:opacity-40"
            >
              {closing ? 'CLOSING…' : 'REVEAL CLUES NOW'}
            </button>
          )}
        </div>
      )}

      {/* GUESS / JUDGING: the surviving clues */}
      {(phase === 'guess' || phase === 'judging') && (
        <div className="space-y-3">
          <ClueBoard
            survivors={survivors}
            giverView={amGiver ? giverView : null}
            nameOf={nameOf}
          />
          {round.cancelledCount > 0 && (
            <p className="font-pixel text-[9px] text-retro-p2 text-center" data-testid="jo-cancelled">
              {round.cancelledCount} CLUE{round.cancelledCount === 1 ? '' : 'S'} CANCELLED
            </p>
          )}
          {phase === 'guess' && timerBar && <div className="text-right">{timerBar}</div>}
          {phase === 'guess' && amGuesser && (
            <div className="space-y-2">
              <input
                type="text"
                value={guessInput}
                maxLength={30}
                onChange={e => { setGuessInput(e.target.value); setGuessErr('') }}
                onKeyDown={e => e.key === 'Enter' && submitGuess()}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="YOUR GUESS"
                aria-label="Your guess"
                autoFocus
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1"
              />
              {guessErr && <p className="font-pixel text-[9px] text-retro-p2 text-center">{guessErr}</p>}
              <div className="flex gap-2">
                <button
                  onClick={submitGuess}
                  disabled={guessingBusy || passing}
                  className="flex-1 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
                >
                  {guessingBusy ? 'GUESSING…' : 'GUESS'}
                </button>
                <button
                  onClick={passCard}
                  disabled={guessingBusy || passing}
                  className="px-4 py-2.5 border-2 border-retro-border text-retro-dim font-pixel text-[10px] rounded hover:border-retro-p2 hover:text-retro-p2 active:scale-95 disabled:opacity-40"
                >
                  {passing ? 'PASSING…' : 'PASS'}
                </button>
              </div>
              <p className="font-mono text-[9px] text-retro-dim text-center">A wrong guess also loses the next card — passing is free.</p>
            </div>
          )}
          {phase === 'guess' && !amGuesser && (
            <p className="font-pixel text-[9px] text-retro-dim text-center arcade-blink">
              {nameOf(round.guesser).toUpperCase()} IS GUESSING…
            </p>
          )}
        </div>
      )}

      {/* RESULT: every clue, verified */}
      {phase === 'result' && (
        <RoundEndPanel
          actions={isPlayer ? [{
            key: 'next', label: 'NEXT CARD', busyLabel: 'DEALING…', variant: 'next',
            onClick: goNextCard, errorMsg: 'NEXT CARD FAILED — CHECK CONNECTION',
          }] : []}
        >
          <div className="space-y-1.5">
            {Object.keys(round.clues).map(uid => {
              const a = cardAudit?.clues?.[uid]
              const survived = uid in survivors
              return (
                <div key={uid} className="flex items-center justify-between font-mono text-[11px] bg-retro-surface border border-retro-border/60 rounded px-3 py-1.5">
                  <span className={cn(survived ? 'text-retro-text' : 'text-retro-dim line-through')}>
                    {a ? a.text.toUpperCase() : '…'}
                    {a && !a.ok && <span className="font-pixel text-[8px] text-retro-danger no-underline"> ⚠</span>}
                  </span>
                  <span className="font-pixel text-[8px] text-retro-dim">
                    {nameOf(uid).toUpperCase()}{survived ? '' : ' · CANCELLED'}
                  </span>
                </div>
              )
            })}
            {Object.keys(round.clues).length === 0 && (
              <p className="font-mono text-[10px] text-retro-dim text-center">No clues this card.</p>
            )}
          </div>
        </RoundEndPanel>
      )}

      {stuck && (
        <div className="border border-retro-p2 rounded p-3 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-p2">NOBODY ONLINE HOLDS THIS CARD&apos;S WORD</p>
          {amCoordinator ? (
            <button
              onClick={skipCard}
              disabled={skipping}
              className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 active:scale-95 disabled:opacity-40"
            >
              {skipping ? 'SKIPPING…' : 'SKIP THIS CARD'}
            </button>
          ) : (
            <p className="font-mono text-[10px] text-retro-dim">Waiting for a clue-giver to come back…</p>
          )}
        </div>
      )}

      {isPlayer && !proposal && onSwitchGame && phase === 'result' && (
        <GameSwitcher currentType="justone" onSwitch={onSwitchGame} />
      )}
    </div>
  )
}

// Surviving clues as cards; clue-givers also see the cancelled ones struck out.
function ClueBoard({ survivors, giverView, nameOf }) {
  const shown = Object.entries(survivors)
  const cancelled = giverView ? Object.entries(giverView).filter(([uid]) => !(uid in survivors)) : []
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" data-testid="jo-clues">
        {shown.map(([uid, text]) => (
          <div key={uid} className="bg-retro-card border-2 border-retro-p1 rounded p-3 text-center space-y-1">
            <p className="font-pixel text-[11px] text-retro-p1 text-glow-p1 break-all">{String(text).toUpperCase()}</p>
            <p className="font-pixel text-[8px] text-retro-dim">{nameOf(uid).toUpperCase()}</p>
          </div>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center">EVERY CLUE WAS CANCELLED</p>
      )}
      {cancelled.length > 0 && (
        <p className="font-mono text-[10px] text-retro-dim text-center">
          Cancelled (hidden from the guesser):{' '}
          {cancelled.map(([uid, text]) => (
            <span key={uid} className="line-through mr-2">{String(text).toUpperCase()}</span>
          ))}
        </p>
      )}
    </div>
  )
}

function CardHistory({ history, nameOf }) {
  if (!history?.length) return null
  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
      <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">CARDS</p>
      {history.map((h, i) => (
        <div key={i} className="flex items-center justify-between font-mono text-[11px]">
          <span className="text-retro-text">{h.word ? String(h.word).toUpperCase() : '—'}</span>
          <span className="flex items-center gap-2">
            <span className="text-retro-dim">{nameOf(h.guesser)}</span>
            <span className={cn('font-pixel text-[8px]', OUTCOME_CLASS[h.outcome])}>{OUTCOME_TEXT[h.outcome]}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
