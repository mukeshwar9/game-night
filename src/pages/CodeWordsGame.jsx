import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { isRoomCoordinator, pickCoordinator } from '../lib/coordinator'
import { markSeen, normalizeSeen } from '../lib/seenHistory'
import { seal, openWithPrivate, sealKeyId, normalizeSealKeys } from '../lib/sealed'
import { TEAM_IDS, otherTeam, balanceTeams, shuffleTeams, moveToTeam, pickRoleHolders, teamMembers } from '../lib/teams'
import {
  CW_MIN_PLAYERS, CW_MIN_PER_TEAM, CW_MAX_CLUE_NUMBER, CW_SEEN_KEY, NEUTRAL, ASSASSIN,
  TEAM_LABEL, TEAM_GLYPH,
  seatOrder, pickBoardWords, randomSeed, deriveKey, verifyCard, verifySeed, normalizeRound, canStartBoard,
  buildBoard, nextBoardSetup, isSpymaster, spymasterIds, readyToDeal, keyHolders,
  spymastersNeedingSeal, sealContext, applyDeal, validateClue, applyClue, isOnTurnGuesser,
  canGuess, applyGuess, canPass, endTurn, remainingCards, applyReveal, boardScores, tallyWins,
} from '../lib/codeWordsLogic'
import useSealKey from '../hooks/useSealKey'
import GameSwitcher from '../components/GameSwitcher'
import RoundEndPanel from '../components/RoundEndPanel'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// Rules (dealing, key derivation, clue validation, reveals, scoring) live in
// src/lib/codeWordsLogic.js; team balancing/rotation in src/lib/teams.js.
//
// -----------------------------------------------------------------------------
// KEY-SECRECY MODEL — read before touching the round shape.
//
// Every `games/$id` field is world-readable, so the key (which card belongs to
// which team) is never written in plaintext while the board is live:
//   * Every seat publishes a public key (`game.sealKeys`, src/lib/sealed.js +
//     src/hooks/useSealKey.js). One
//     spymaster's client — the dealer — draws a random seed, derives the
//     layout + one salt per card from it, and writes only the 25 salted
//     commitments (`round.commits`) plus a sealed copy of the seed for each
//     spymaster (`round.sealed`). Guessers and spectators see neither.
//   * A locked guess waits in `round.pending` until a key-holding spymaster's
//     client (the online-aware coordinator among holders) publishes that
//     card's identity + salt; every client verifies it against the commitment
//     and flags a mismatch (⚠) on the card.
//   * A spymaster who reopens the room in a new tab publishes a new public
//     key; a current holder re-seals the seed for it.
//   * When the board ends, the seed is published so everyone can re-derive
//     and check the whole key.
//
// REMAINING TRUST LIMITS (no trusted server, so detect-not-prevent):
//   * The dealer is a spymaster, who must know the key anyway — but a modified
//     spymaster client could leak it to a guesser out of band, or publish a
//     false identity for a card. A false identity fails its commitment check
//     and is flagged to everyone; it is not rolled back.
//   * A player can still read the key over their spymaster's shoulder or
//     screen share — the usual Codenames table etiquette applies.
//   * If every spymaster loses their tab-local key at once, nobody can reveal
//     cards; the coordinator gets a RESTART BOARD button (new key, same words).
// -----------------------------------------------------------------------------

const IDENTITY_NAME = { A: TEAM_LABEL.A, B: TEAM_LABEL.B, [NEUTRAL]: 'BYSTANDER', [ASSASSIN]: 'ASSASSIN' }
const IDENTITY_GLYPH = { A: TEAM_GLYPH.A, B: TEAM_GLYPH.B, [NEUTRAL]: '·', [ASSASSIN]: '☠' }

// Token classes per identity: filled (revealed) and outlined (spymaster key).
const FILLED = {
  A: 'bg-retro-tint-p1 border-retro-p1 text-retro-p1',
  B: 'bg-retro-tint-p2 border-retro-p2 text-retro-p2',
  [NEUTRAL]: 'bg-retro-surface border-retro-border text-retro-dim',
  [ASSASSIN]: 'bg-retro-tint-danger border-retro-danger text-retro-danger',
}
const OUTLINE = {
  A: 'border-retro-p1 text-retro-text',
  B: 'border-retro-p2 text-retro-text',
  [NEUTRAL]: 'border-retro-border text-retro-dim',
  [ASSASSIN]: 'border-retro-danger text-retro-danger',
}
const TEAM_TEXT = { A: 'text-retro-p1', B: 'text-retro-p2' }
const TEAM_GLOW = { A: 'text-glow-p1', B: 'text-glow-p2' }
const TEAM_BORDER = { A: 'border-retro-p1', B: 'border-retro-p2' }

const teamName = (t) => `${TEAM_GLYPH[t]} ${TEAM_LABEL[t]}`
const newNonce = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)))
  .map(b => b.toString(16).padStart(2, '0')).join('')

export default function CodeWordsGame({
  gameId, game, mySeat, players,
  onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const phase = round?.phase ?? null
  const status = game.status
  const order = useMemo(() => seatOrder(players), [players])
  const isOnline = (uid) => players?.[uid]?.online !== false
  const nameOf = (uid) => players?.[uid]?.name || 'PLAYER'
  const isPlayer = !!mySeat && !!players?.[mySeat]
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid ?? null)
  // Sealing key (room-level `sealKeys`); needs Web Crypto, i.e. HTTPS/localhost.
  const { pair, sealKeys, supported: cryptoOk } = useSealKey(gameId, isPlayer ? mySeat : null, game.sealKeys)

  const live = status !== 'waiting' && !!round && phase !== 'lobby'
  const myTeam = live ? round.teams[mySeat] ?? null : null
  const amSpymaster = live && isSpymaster(round, mySeat)
  const nonce = round?.nonce ?? ''

  const [starting, runStart] = useBusy()
  const [lobbyBusy, runLobby] = useBusy()
  const [cluing, runClue] = useBusy()
  const [guessing, runGuess] = useBusy()
  const [passing, runPass] = useBusy()
  const [restarting, runRestart] = useBusy()
  const [clueText, setClueText] = useState('')
  const [clueNumber, setClueNumber] = useState(null)
  const [clueErr, setClueErr] = useState('')

  // ---------------------------------------------------------------------------
  // Key material (async derivations keyed by the inputs they came from, so a
  // stale result for a previous board is simply ignored at render time).
  // ---------------------------------------------------------------------------
  const [keyState, setKeyState] = useState(null) // { nonce, boxId, ok, seed, identities, salts }
  const [fullKey, setFullKey] = useState(null)   // { nonce, seed, ok, identities } — end-of-board audit
  const [checks, setChecks] = useState(null)     // { nonce, sig, bad: { [i]: true } }

  const myBox = amSpymaster ? round.sealed[mySeat] : null
  const boxForMe = myBox && pair && myBox.kid === sealKeyId(pair.pub) ? myBox : null
  const sameBox = keyState && keyState.nonce === nonce && boxForMe && keyState.boxId === boxForMe.epk
  const myKey = sameBox && keyState.ok ? keyState : null
  const keyFailed = sameBox && !keyState.ok

  useEffect(() => {
    if (!boxForMe || !round || sameBox) return
    let alive = true
    const startTeam = round.startTeam
    const commits = round.commits
    ;(async () => {
      const opened = await openWithPrivate(pair.privJwk, pair.pub, boxForMe, sealContext(gameId, round, mySeat))
      const seed = opened?.plaintext ?? null
      const ok = !!seed && await verifySeed(seed, startTeam, commits)
      const derived = ok ? await deriveKey(seed, startTeam) : null
      if (alive) {
        setKeyState({
          nonce, boxId: boxForMe.epk, ok, seed: ok ? seed : null,
          identities: derived?.identities ?? null, salts: derived?.salts ?? null,
        })
      }
    })().catch(() => {})
    return () => { alive = false }
  }, [boxForMe?.epk, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Board over: the seed is public — re-derive and audit the whole key.
  const publishedSeed = phase === 'over' ? round.seed : null
  useEffect(() => {
    if (!publishedSeed || (fullKey && fullKey.nonce === nonce && fullKey.seed === publishedSeed)) return
    let alive = true
    const startTeam = round.startTeam
    const commits = round.commits
    ;(async () => {
      const ok = await verifySeed(publishedSeed, startTeam, commits)
      const { identities } = await deriveKey(publishedSeed, startTeam)
      if (alive) setFullKey({ nonce, seed: publishedSeed, ok, identities })
    })().catch(() => {})
    return () => { alive = false }
  }, [publishedSeed, nonce]) // eslint-disable-line react-hooks/exhaustive-deps
  const auditKey = fullKey && fullKey.nonce === nonce && fullKey.seed === publishedSeed ? fullKey : null

  // Every published card reveal is checked against its commitment.
  const revealedSig = round ? Object.keys(round.revealed).join(',') : ''
  useEffect(() => {
    if (!round || !revealedSig) return
    if (checks && checks.nonce === nonce && checks.sig === revealedSig) return
    let alive = true
    const entries = Object.entries(round.revealed)
    const commits = round.commits
    ;(async () => {
      const bad = {}
      for (const [i, r] of entries) {
        if (!(await verifyCard(commits[i], r.t, r.s))) bad[i] = true
      }
      if (alive) setChecks({ nonce, sig: revealedSig, bad })
    })().catch(() => {})
    return () => { alive = false }
  }, [revealedSig, nonce]) // eslint-disable-line react-hooks/exhaustive-deps
  const badCards = checks && checks.nonce === nonce && checks.sig === revealedSig ? checks.bad : {}

  // ---------------------------------------------------------------------------
  // Background protocol: deal, re-seal, reveal guesses. (Publishing my public
  // key is useSealKey's job.)
  // ---------------------------------------------------------------------------
  const sms = live ? spymasterIds(round) : []
  const dealerId = live && phase === 'keying'
    ? pickCoordinator(sms.filter(uid => sealKeys[uid]), players)
    : null
  const canDeal = live && phase === 'keying' && readyToDeal(round, sealKeys, isOnline)
  const dealing = useRef(null)
  useEffect(() => {
    if (!canDeal || dealerId !== mySeat || status !== 'playing') return
    if (dealing.current === nonce) return
    dealing.current = nonce
    const startTeam = round.startTeam
    const pubkeys = sealKeys
    const frame = round
    ;(async () => {
      const seed = randomSeed()
      const { commits } = await deriveKey(seed, startTeam)
      const sealed = {}
      for (const uid of spymasterIds(frame)) {
        if (!pubkeys[uid]) continue
        sealed[uid] = (await seal(pubkeys[uid], seed, sealContext(gameId, frame, uid))).box
      }
      await runTransaction(ref(db, `games/${gameId}/round`), cur => {
        if (!cur) return cur
        const r = normalizeRound(cur)
        if (r.phase !== 'keying' || r.nonce !== nonce) return
        return applyDeal(r, { commits, sealed })
      })
    })().catch(() => { dealing.current = null })
  }, [canDeal, dealerId, mySeat, status, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // The key holder that reveals + re-seals: online-aware lowest uid among holders.
  const holders = live ? keyHolders(round, sealKeys) : []
  const revealerId = holders.length ? pickCoordinator(holders, players) : null
  const amRevealer = !!myKey && revealerId === mySeat

  const resealed = useRef(new Set())
  const needSeal = live && phase !== 'over' && phase !== 'keying' ? spymastersNeedingSeal(round, sealKeys) : []
  const needSealSig = needSeal.map(uid => `${uid}:${sealKeyId(sealKeys[uid])}`).join(',')
  useEffect(() => {
    if (!amRevealer || !needSealSig) return
    for (const uid of needSeal) {
      const pub = sealKeys[uid]
      const tag = `${nonce}:${uid}:${sealKeyId(pub)}`
      if (resealed.current.has(tag)) continue
      resealed.current.add(tag)
      const seed = myKey.seed
      const frame = round
      seal(pub, seed, sealContext(gameId, frame, uid))
        .then(({ box }) => runTransaction(ref(db, `games/${gameId}/round`), cur => {
          if (!cur) return cur
          if (cur.nonce !== nonce) return
          if (cur.sealed?.[uid]?.kid === box.kid) return
          return { ...cur, sealed: { ...(cur.sealed || {}), [uid]: box } }
        }))
        .catch(() => resealed.current.delete(tag))
    }
  }, [amRevealer, needSealSig]) // eslint-disable-line react-hooks/exhaustive-deps

  const revealing = useRef(null)
  const pendingIndex = live && phase === 'guess' ? round.pending?.index ?? null : null
  useEffect(() => {
    if (!amRevealer || pendingIndex == null || round.revealed[pendingIndex]) return
    const tag = `${nonce}:${pendingIndex}`
    if (revealing.current === tag) return
    revealing.current = tag
    const index = pendingIndex
    const identity = myKey.identities[index]
    const salt = myKey.salts[index]
    const seed = myKey.seed
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = normalizeRound(current.round)
      if (!r || r.nonce !== nonce) return
      const res = applyReveal(r, { index, identity, salt })
      if (!res) return
      const over = res.round.phase === 'over'
      return {
        ...current,
        // The board is decided: publish the seed so everyone can audit the
        // key, and bank the board in the match tally.
        round: over ? { ...res.round, seed, wins: tallyWins(r.wins, res.round) } : res.round,
        // Each board is one finished match for the night scoreboard.
        ...(over ? { status: 'finished', winner: null, scores: boardScores(res.round) } : {}),
        lastActivityAt: Date.now(),
      }
    }).catch(() => { revealing.current = null })
  }, [amRevealer, pendingIndex, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Sounds: one cue per newly revealed card, then the board result.
  // ---------------------------------------------------------------------------
  const soundState = useRef(null)
  useEffect(() => {
    if (!live) return
    const seen = Object.keys(round.revealed).map(Number)
    const prev = soundState.current
    soundState.current = { nonce, seen, phase }
    if (!prev || prev.nonce !== nonce) return
    const fresh = seen.filter(i => !prev.seen.includes(i))
    if (fresh.length > 0) {
      const t = round.revealed[fresh[fresh.length - 1]].t
      if (t === ASSASSIN) sounds.bust()
      else if (myTeam && t === myTeam) sounds.hit()
      else sounds.miss()
    }
    if (phase === 'over' && prev.phase !== 'over' && myTeam) {
      if (round.winner === myTeam) sounds.win()
      else sounds.lose()
    }
  }, [live, nonce, revealedSig, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fresh clue form whenever the turn changes (render-phase derive).
  const turnKey = live ? `${nonce}:${round.turn}:${round.clueLog.length}` : ''
  const [prevTurnKey, setPrevTurnKey] = useState(turnKey)
  if (prevTurnKey !== turnKey) {
    setPrevTurnKey(turnKey)
    setClueText('')
    setClueNumber(null)
    setClueErr('')
  }

  // ---------------------------------------------------------------------------
  // Lobby (status 'waiting'): teams + spymasters, set by the coordinator.
  // ---------------------------------------------------------------------------
  const lobbyRound = status === 'waiting' && phase === 'lobby' ? round : null
  const lobbyTeams = balanceTeams(order, lobbyRound?.teams)
  // Spymasters must be able to hold the key: online, with a published sealing
  // key (falls back to any member when nobody on a team qualifies).
  const canHoldKey = (uid) => isOnline(uid) && !!sealKeys[uid]
  const lobbySpies = pickRoleHolders(lobbyTeams, order, { previous: lobbyRound?.spymasters || {}, isEligible: canHoldKey })
  const startable = canStartBoard(lobbyTeams, order)

  const writeLobby = (teams, spymasters) => runLobby(
    () => update(ref(db, `games/${gameId}`), { round: { phase: 'lobby', teams, spymasters: spymasters || null } }),
    () => toast.error('UPDATE FAILED — CHECK CONNECTION'),
  )

  const startBoard = () => runStart(async () => {
    if (!amCoordinator || !startable) return
    const { words, indices } = pickBoardWords(normalizeSeen(game.seen?.[CW_SEEN_KEY]))
    const board = buildBoard({
      board: 1, nonce: newNonce(), teams: lobbyTeams, spymasters: lobbySpies, startTeam: TEAM_IDS[0], words,
    })
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      if (current.status !== 'waiting') return
      return {
        ...current,
        status: 'playing', winner: null, round: board, proposal: null, lastActivityAt: Date.now(),
        seen: { ...(current.seen || {}), [CW_SEEN_KEY]: markSeen(normalizeSeen(current.seen?.[CW_SEEN_KEY]), indices) },
      }
    })
  }, () => toast.error('START FAILED — CHECK CONNECTION'))

  // Next board: same teams (plus late joiners), spymasters rotate, other team
  // starts. RoundEndPanel owns the busy flag + failure toast for this CTA.
  const nextBoard = async () => {
    if (!amCoordinator || !round) return
    const { words, indices } = pickBoardWords(normalizeSeen(game.seen?.[CW_SEEN_KEY]))
    const nextNonce = newNonce()
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = normalizeRound(current.round)
      if (current.status !== 'finished' || !r || r.phase !== 'over' || r.nonce !== nonce) return
      const seats = seatOrder(current.players)
      const keys = normalizeSealKeys(current.sealKeys)
      const setup = nextBoardSetup({
        order: seats, teams: r.teams, spymasters: r.spymasters, startTeam: r.startTeam,
        isOnline: uid => current.players?.[uid]?.online !== false && !!keys[uid],
      })
      return {
        ...current,
        // Fresh per-board scores; `nightMark: null` lets the night scoreboard
        // record this board too (it only clears on fresh state otherwise).
        status: 'playing', winner: null, proposal: null, lastActivityAt: Date.now(),
        scores: null, nightMark: null,
        round: buildBoard({ board: r.board + 1, nonce: nextNonce, ...setup, words, wins: r.wins }),
        seen: { ...(current.seen || {}), [CW_SEEN_KEY]: markSeen(normalizeSeen(current.seen?.[CW_SEEN_KEY]), indices) },
      }
    })
  }

  // Stuck board (no spymaster can deal/reveal, or a team has nobody online to
  // play its turn): re-key the same words with online spymasters.
  const restartBoard = () => runRestart(async () => {
    if (!amCoordinator || !round) return
    const nextNonce = newNonce()
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = normalizeRound(current.round)
      if (current.status !== 'playing' || !r || r.nonce !== nonce) return
      const keys = normalizeSealKeys(current.sealKeys)
      const setup = nextBoardSetup({
        order: seatOrder(current.players), teams: r.teams, spymasters: r.spymasters, rotate: false,
        isOnline: uid => current.players?.[uid]?.online !== false && !!keys[uid],
      })
      return {
        ...current,
        lastActivityAt: Date.now(),
        round: buildBoard({ board: r.board, nonce: nextNonce, ...setup, startTeam: r.startTeam, words: r.words, wins: r.wins }),
      }
    })
  }, () => toast.error('RESTART FAILED — CHECK CONNECTION'))

  // ---------------------------------------------------------------------------
  // Turn actions
  // ---------------------------------------------------------------------------
  const roundTx = (fn) => runTransaction(ref(db, `games/${gameId}/round`), cur => {
    if (!cur) return cur
    const r = normalizeRound(cur)
    if (!r || r.nonce !== nonce) return
    const next = fn(r)
    return next || undefined
  })

  const giveClue = () => {
    const err = validateClue(clueText, clueNumber, round?.words)
    if (err) { setClueErr(err); return }
    setClueErr('')
    runClue(async () => {
      await roundTx(r => applyClue(r, { uid: mySeat, word: clueText, number: clueNumber }))
      sounds.move('X')
    }, () => toast.error('CLUE FAILED — CHECK CONNECTION'))
  }

  const myPick = live ? round.picks[mySeat] ?? null : null
  const amGuesser = live && isOnTurnGuesser(round, mySeat)

  const pointAt = (index) => {
    if (!amGuesser || round.pending || round.revealed[index]) return
    sounds.step()
    const next = myPick === index ? null : index
    update(ref(db, `games/${gameId}/round/picks`), { [mySeat]: next })
      .catch(() => toast.error('CONNECTION PROBLEM — TRY AGAIN'))
  }

  const lockGuess = (index) => runGuess(async () => {
    if (!canGuess(round, mySeat, index)) return
    sounds.move(myTeam === 'A' ? 'X' : 'O')
    await roundTx(r => applyGuess(r, { uid: mySeat, index }))
  }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))

  const passTurn = () => runPass(async () => {
    await roundTx(r => (canPass(r, mySeat) ? endTurn(r) : null))
  }, () => toast.error('END TURN FAILED — CHECK CONNECTION'))

  // ---------------------------------------------------------------------------
  // Render: lobby
  // ---------------------------------------------------------------------------
  if (status === 'waiting' || !round || phase === 'lobby') {
    const need = Math.max(0, CW_MIN_PLAYERS - order.length)
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <p className="font-pixel text-xs text-retro-cta text-glow-cta tracking-widest">CODE WORDS</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Two teams, one grid of words. Each team&apos;s spymaster sees the secret key
            and gives one-word clues — find your agents, never the assassin.
          </p>
          {!cryptoOk && (
            <p className="font-pixel text-[9px] text-retro-p2 leading-relaxed">
              THIS DEVICE CAN&apos;T HOLD THE SECRET KEY — OPEN THE GAME OVER HTTPS TO BE A SPYMASTER
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {TEAM_IDS.map(t => (
            <div key={t} className={cn('bg-retro-card border-2 rounded p-3 space-y-1.5', TEAM_BORDER[t])}>
              <p className={cn('font-pixel text-[9px] tracking-widest', TEAM_TEXT[t])}>{teamName(t)}</p>
              {teamMembers(lobbyTeams, t, order).map(uid => (
                <div key={uid} className="flex items-center justify-between gap-1 font-mono text-[11px]">
                  <span className={cn('truncate', uid === mySeat ? 'text-retro-cta' : 'text-retro-text', !isOnline(uid) && 'opacity-50')}>
                    {lobbySpies[t] === uid && <span className={TEAM_TEXT[t]} title="Spymaster">★ </span>}
                    {nameOf(uid)}{uid === mySeat ? ' (YOU)' : ''}
                  </span>
                  {amCoordinator && (
                    <span className="flex shrink-0 gap-1">
                      {lobbySpies[t] !== uid && (
                        <button
                          onClick={() => writeLobby(lobbyTeams, { ...lobbySpies, [t]: uid })}
                          disabled={lobbyBusy}
                          aria-label={`Make ${nameOf(uid)} spymaster`}
                          className="min-w-8 min-h-8 font-pixel text-[9px] text-retro-dim border border-retro-border rounded hover:text-retro-cta hover:border-retro-cta disabled:opacity-40"
                        >★</button>
                      )}
                      <button
                        onClick={() => {
                          const teams = moveToTeam(lobbyTeams, uid, otherTeam(t))
                          writeLobby(teams, lobbySpies[t] === uid ? { ...lobbySpies, [t]: null } : lobbySpies)
                        }}
                        disabled={lobbyBusy}
                        aria-label={`Move ${nameOf(uid)} to ${TEAM_LABEL[otherTeam(t)]}`}
                        className="min-w-8 min-h-8 font-pixel text-[9px] text-retro-dim border border-retro-border rounded hover:text-retro-cta hover:border-retro-cta disabled:opacity-40"
                      >⇄</button>
                    </span>
                  )}
                </div>
              ))}
              {teamMembers(lobbyTeams, t, order).length === 0 && (
                <p className="font-mono text-[10px] text-retro-dim">No one yet…</p>
              )}
            </div>
          ))}
        </div>
        <p className="text-center font-mono text-[10px] text-retro-dim">★ = spymaster · spymasters rotate every board</p>

        {amCoordinator ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => writeLobby(shuffleTeams(order), null)}
              disabled={lobbyBusy || order.length < 2}
              className="px-4 py-2.5 border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] rounded hover:shadow-neon-p1 transition-all active:scale-95 disabled:opacity-40"
            >
              {lobbyBusy ? 'SHUFFLING…' : 'SHUFFLE TEAMS'}
            </button>
            {startable ? (
              <button
                onClick={startBoard}
                disabled={starting}
                className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                {starting ? 'DEALING…' : 'START GAME'}
              </button>
            ) : (
              <p className="w-full text-center font-pixel text-[10px] text-retro-dim arcade-blink">
                {need > 0
                  ? `NEED ${need} MORE PLAYER${need === 1 ? '' : 'S'}`
                  : `EACH TEAM NEEDS ${CW_MIN_PER_TEAM}+ PLAYERS`}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
            {startable ? 'WAITING FOR THE HOST TO START…' : `WAITING FOR PLAYERS (${order.length}/${CW_MIN_PLAYERS})`}
          </p>
        )}

        {isPlayer && !proposal && onSwitchGame && <GameSwitcher currentType="codewords" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: board
  // ---------------------------------------------------------------------------
  const remaining = remainingCards(round)
  const turn = round.turn
  const identities = phase === 'over' && auditKey ? auditKey.identities : myKey?.identities ?? null
  const turnSpymaster = turn ? round.spymasters[turn] : null
  const onTurnGuessersOnline = turn ? teamMembers(round.teams, turn, order).filter(uid => uid !== turnSpymaster && isOnline(uid)) : []
  const onlineHolders = holders.filter(isOnline)
  const keylessSpymaster = sms.find(uid => isOnline(uid) && !sealKeys[uid])
  const stuckReason = phase === 'keying'
    ? (sms.filter(isOnline).length === 0 ? 'NO SPYMASTER IS ONLINE TO DEAL THE KEY'
      : keylessSpymaster ? `WAITING FOR ${nameOf(keylessSpymaster).toUpperCase()}'S DEVICE TO SHARE A KEY` : null)
    : phase === 'over' ? null
      : onlineHolders.length === 0 ? 'NO SPYMASTER ONLINE HOLDS THE KEY'
        : phase === 'clue' && turnSpymaster && !isOnline(turnSpymaster) ? `${TEAM_LABEL[turn]}'S SPYMASTER IS OFFLINE`
          : phase === 'guess' && onTurnGuessersOnline.length === 0 ? `NOBODY ON ${TEAM_LABEL[turn]} IS ONLINE TO GUESS`
            : null
  const pickersByCard = {}
  for (const [uid, i] of Object.entries(round.picks)) {
    if (round.teams[uid] !== turn) continue
    ;(pickersByCard[i] ||= []).push(uid)
  }
  const guessesLeftLabel = round.clue ? `${round.guessesLeft} GUESS${round.guessesLeft === 1 ? '' : 'ES'} LEFT` : ''

  const roleLine = !isPlayer || !myTeam
    ? 'SPECTATING'
    : `YOU: ${teamName(myTeam)} · ${amSpymaster ? 'SPYMASTER' : 'GUESSER'}`

  return (
    <div className="space-y-3">
      {/* Teams + cards left */}
      <div className="grid grid-cols-2 gap-2">
        {TEAM_IDS.map(t => (
          <div
            key={t}
            className={cn(
              'rounded border-2 px-2.5 py-2 space-y-1',
              TEAM_BORDER[t],
              turn === t && phase !== 'over' ? 'bg-retro-card' : 'bg-retro-surface opacity-80',
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn('font-pixel text-[9px] tracking-widest', TEAM_TEXT[t], turn === t && TEAM_GLOW[t])}>
                {teamName(t)}
              </span>
              <span className={cn('font-pixel text-[10px]', TEAM_TEXT[t])} aria-label={`${remaining[t]} cards left`}>
                {remaining[t]} LEFT
              </span>
            </div>
            <p className="font-mono text-[10px] text-retro-dim leading-snug">
              {teamMembers(round.teams, t, order).map((uid, i) => (
                <span key={uid} className={cn(!isOnline(uid) && 'opacity-50', uid === mySeat && 'text-retro-cta')}>
                  {i > 0 && ', '}{round.spymasters[t] === uid ? '★' : ''}{nameOf(uid)}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>

      {/* Status / clue banner */}
      <div className="bg-retro-card border border-retro-border rounded p-3 text-center space-y-1" aria-live="polite">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">{roleLine}</p>
        {phase === 'keying' && (
          <p className="font-pixel text-[10px] text-retro-cta arcade-blink">SHARING THE SECRET KEY WITH THE SPYMASTERS…</p>
        )}
        {phase === 'clue' && turn && (
          <p className={cn('font-pixel text-[10px]', TEAM_TEXT[turn])}>
            {turnSpymaster === mySeat ? 'YOUR CLUE, SPYMASTER' : `${teamName(turn)} · ${nameOf(turnSpymaster).toUpperCase()} IS THINKING…`}
          </p>
        )}
        {phase === 'guess' && round.clue && (
          <>
            <p className={cn('font-pixel text-sm tracking-widest', TEAM_TEXT[turn], TEAM_GLOW[turn])} data-testid="cw-clue">
              {round.clue.word} · {round.clue.number}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">
              {teamName(turn)} · {guessesLeftLabel}
              {round.pending && ' · REVEALING…'}
            </p>
          </>
        )}
        {phase === 'over' && round.winner && (
          <p className={cn('font-pixel text-sm', TEAM_TEXT[round.winner], TEAM_GLOW[round.winner])}>
            {teamName(round.winner)} WINS{round.endReason === 'assassin' ? ' — ASSASSIN FOUND!' : '!'}
          </p>
        )}
        {amSpymaster && phase !== 'keying' && phase !== 'over' && !myKey && (
          <p className="font-pixel text-[8px] text-retro-p2">
            {!cryptoOk ? "THIS DEVICE CAN'T OPEN THE KEY — IT NEEDS HTTPS"
              : keyFailed ? '⚠ YOUR KEY FAILED ITS CHECK — ASK THE HOST TO RESTART' : 'RECEIVING YOUR KEY…'}
          </p>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-5 gap-1" role="grid" aria-label="Code Words board">
        {round.words.map((word, i) => {
          const rev = round.revealed[i]
          const known = rev?.t ?? identities?.[i] ?? null
          const pending = round.pending?.index === i
          const mine = myPick === i
          const pickers = pickersByCard[i] || []
          const clickable = amGuesser && !rev && !round.pending && !guessing
          return (
            <button
              key={i}
              type="button"
              data-testid={`cw-card-${i}`}
              data-word={word}
              data-identity={identities?.[i] ?? rev?.t ?? ''}
              data-revealed={rev ? rev.t : ''}
              onClick={() => (mine ? lockGuess(i) : pointAt(i))}
              disabled={!clickable}
              aria-label={`${word}${rev ? `, ${IDENTITY_NAME[rev.t]}` : known ? `, key: ${IDENTITY_NAME[known]}` : ''}${mine ? ', your pick — tap again to guess' : ''}`}
              className={cn(
                'relative min-h-12 rounded border-2 px-0.5 py-1.5 flex items-center justify-center text-center transition-all',
                'font-mono text-[10px] sm:text-[11px] uppercase leading-tight break-all',
                rev ? FILLED[rev.t]
                  : known ? cn('bg-retro-card border-dashed', OUTLINE[known])
                    : 'bg-retro-card border-retro-border text-retro-text',
                clickable && 'hover:border-retro-cta active:scale-95',
                mine && 'ring-2 ring-retro-cta',
                pending && 'arcade-blink',
                rev && 'opacity-90',
              )}
            >
              {known && (
                <span className="absolute top-0 left-0.5 font-pixel text-[7px]" aria-hidden="true">{IDENTITY_GLYPH[known]}</span>
              )}
              {badCards[i] && (
                <span className="absolute top-0 right-0.5 font-pixel text-[7px] text-retro-danger" title="Reveal failed verification">⚠</span>
              )}
              <span className={cn(rev && 'line-through decoration-1 opacity-80')}>{word}</span>
              {pickers.length > 0 && !rev && (
                <span className="absolute bottom-0 inset-x-0 font-pixel text-[6px] text-retro-cta truncate px-0.5" aria-hidden="true">
                  {pickers.map(uid => nameOf(uid).slice(0, 3).toUpperCase()).join(' ')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Spymaster: give a clue */}
      {phase === 'clue' && turnSpymaster === mySeat && myKey && (
        <div className="bg-retro-card border-2 border-retro-cta rounded p-3 space-y-2">
          <input
            type="text"
            value={clueText}
            maxLength={24}
            onChange={e => { setClueText(e.target.value); setClueErr('') }}
            onKeyDown={e => e.key === 'Enter' && giveClue()}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="ONE-WORD CLUE"
            aria-label="Your one-word clue"
            className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1"
          />
          <div className="grid grid-cols-9 gap-1" role="radiogroup" aria-label="How many cards">
            {Array.from({ length: CW_MAX_CLUE_NUMBER }, (_, k) => k + 1).map(n => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={clueNumber === n}
                aria-label={`${n} card${n === 1 ? '' : 's'}`}
                onClick={() => { setClueNumber(n); setClueErr('') }}
                className={cn(
                  'h-10 rounded border-2 font-pixel text-[10px] transition-all active:scale-95',
                  clueNumber === n ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
                )}
              >{n}</button>
            ))}
          </div>
          {clueErr && <p className="font-pixel text-[9px] text-retro-p2 text-center">{clueErr}</p>}
          <button
            onClick={giveClue}
            disabled={cluing}
            className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
          >
            {cluing ? 'SENDING…' : 'GIVE CLUE'}
          </button>
        </div>
      )}

      {/* Guessers: point, confirm, end turn */}
      {phase === 'guess' && amGuesser && (
        <div className="space-y-2 text-center">
          <p className="font-mono text-[10px] text-retro-dim">
            Tap a card to point at it (your team sees it). Tap it again — or GUESS — to lock it in.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {myPick != null && !round.revealed[myPick] && (
              <button
                onClick={() => lockGuess(myPick)}
                disabled={guessing || !!round.pending}
                className="px-5 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
              >
                {guessing ? 'GUESSING…' : `GUESS ${round.words[myPick].toUpperCase()}`}
              </button>
            )}
            {canPass(round, mySeat) && (
              <button
                onClick={passTurn}
                disabled={passing}
                className="px-5 py-2.5 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 active:scale-95 disabled:opacity-40"
              >
                {passing ? 'ENDING…' : 'END TURN'}
              </button>
            )}
          </div>
        </div>
      )}
      {phase === 'guess' && !amGuesser && myTeam && (
        <p className="text-center font-pixel text-[9px] text-retro-dim">
          {myTeam === turn ? 'YOUR TEAM IS GUESSING — NO HINTS!' : `${teamName(turn)} IS GUESSING…`}
        </p>
      )}

      {/* Clue history */}
      {round.clueLog.length > 0 && (
        <div className="bg-retro-surface border border-retro-border/60 rounded p-2.5 space-y-1">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">CLUES</p>
          <div className="flex flex-wrap gap-1.5">
            {round.clueLog.map((c, i) => (
              <span key={i} className={cn('font-mono text-[10px] px-1.5 py-0.5 rounded border', TEAM_BORDER[c.team], TEAM_TEXT[c.team])}>
                {TEAM_GLYPH[c.team]} {c.word} · {c.number}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stuck: coordinator can re-key the board */}
      {stuckReason && (
        <div className="border border-retro-p2 rounded p-3 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-p2">{stuckReason}</p>
          {amCoordinator ? (
            <button
              onClick={restartBoard}
              disabled={restarting}
              className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 active:scale-95 disabled:opacity-40"
            >
              {restarting ? 'RESTARTING…' : 'RESTART BOARD'}
            </button>
          ) : (
            <p className="font-mono text-[10px] text-retro-dim">Waiting for them to come back — or for the host to restart the board.</p>
          )}
        </div>
      )}

      {/* Board over */}
      {phase === 'over' && (
        <RoundEndPanel
          caption={`BOARD ${round.board} OVER`}
          headline={myTeam ? (round.winner === myTeam ? 'YOUR TEAM WINS!' : 'YOUR TEAM LOSES') : `${teamName(round.winner)} WINS`}
          sub={(
            <p className="font-pixel text-[9px] text-retro-dim">
              {round.endReason === 'assassin' ? 'THE ASSASSIN WAS FOUND' : 'ALL AGENTS FOUND'}
              {auditKey && (auditKey.ok ? ' · KEY VERIFIED ✓' : ' · ⚠ KEY FAILED VERIFICATION')}
            </p>
          )}
          scores={{
            title: 'BOARDS WON',
            rows: [...order].sort((a, b) => (round.wins[b] || 0) - (round.wins[a] || 0)).map(uid => ({
              id: uid,
              name: nameOf(uid),
              score: round.wins[uid] || 0,
              you: uid === mySeat,
              marker: round.teams[uid] ? TEAM_GLYPH[round.teams[uid]] : null,
              muted: !isOnline(uid),
              win: round.teams[uid] === round.winner,
            })),
          }}
          actions={isPlayer ? [
            amCoordinator && !proposal && {
              key: 'next', label: 'NEXT BOARD', busyLabel: 'DEALING…', variant: 'next',
              onClick: nextBoard, errorMsg: 'NEXT BOARD FAILED — CHECK CONNECTION',
            },
            !proposal && onNewMatch && {
              key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch,
            },
          ] : []}
          share={isPlayer && myTeam ? {
            gameLabel: 'CODE WORDS',
            headline: round.winner === myTeam ? 'OUR TEAM WON!' : `${TEAM_LABEL[round.winner]} WON`,
            sub: 'Code Words · Game Night',
          } : null}
        >
          {!amCoordinator && (
            <p className="text-center font-pixel text-[9px] text-retro-dim arcade-blink">WAITING FOR THE NEXT BOARD…</p>
          )}
        </RoundEndPanel>
      )}

      {isPlayer && !proposal && onSwitchGame && phase === 'over' && (
        <GameSwitcher currentType="codewords" onSwitch={onSwitchGame} />
      )}
    </div>
  )
}
