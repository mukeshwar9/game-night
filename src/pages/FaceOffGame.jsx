import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { db } from '../lib/firebase'
import FaceOffBoard from '../components/FaceOffBoard'
import GameStatus from '../components/GameStatus'
import OfflineNotice from '../components/loading/OfflineNotice'
import {
  QUESTIONS, answerQuestion, askQuestion, canAsk, canName, dealFaces, judge, nameFace, normalizeRound,
  otherSide, pendingAsk, phaseOf, remainingFor, splitFor, traitOf,
} from '../lib/faceoffLogic'
import { commit, verifyReveal } from '../lib/commit'
import { generateSeedHex } from '../lib/diceLogic'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'

// FACE OFF — two players, turn-based, each hiding one of 24 faces.
//
// The room holds only a salted commitment of each secret (commit.js). The
// secret itself stays in this tab's sessionStorage, so a player who reopens
// the room in a new tab has lost it and must concede the round. Questions are
// answered by the asked player's client from the face's real traits; when a
// face is named both secrets are revealed and every client checks the
// commitments and every answer before the round is decided (faceoffLogic.judge).

const STAMP_MS = 1100
const secretKey = (gameId) => `faceoff-secret-${gameId}`
function readSecret(gameId, seed) {
  try {
    const s = JSON.parse(sessionStorage.getItem(secretKey(gameId)) || 'null')
    return s && s.seed === seed && Number.isInteger(s.i) && typeof s.salt === 'string' ? s : null
  } catch { return null }
}

export default function FaceOffGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isSpectator = !mySymbol
  const me = mySymbol || 'X'
  const opp = otherSide(me)
  const raw = game.round ?? null
  const round = useMemo(() => normalizeRound(raw), [raw])
  const faces = useMemo(() => (round.seed ? dealFaces(round.seed) : []), [round.seed])
  const phase = phaseOf(raw)
  const playing = game.status === 'playing'
  const finished = game.status === 'finished'
  const roundRef = ref(db, `games/${gameId}/round`)

  // The secret is re-read whenever the deal changes (a new round is a new seed).
  const [secretState, setSecretState] = useState(null)
  const secret = secretState?.seed === round.seed ? secretState : readSecret(gameId, round.seed)

  const [selected, setSelected] = useState(null)
  const [naming, setNaming] = useState(false)
  const [candidate, setCandidate] = useState(null)
  const [busy, run] = useBusy()

  // Deal: whichever seat gets there first writes the seed, once.
  useEffect(() => {
    if (isSpectator || !playing || round.seed) return
    runTransaction(ref(db, `games/${gameId}/round`), (r) => {
      if (r?.fSeed) return
      return { ...(r || {}), fSeed: generateSeedHex(), fTurn: r?.fTurn === 'O' ? 'O' : 'X' }
    }).catch(() => {})
  }, [isSpectator, playing, round.seed, gameId])

  const lockSecret = () => {
    if (candidate == null || round.commit[me]) return
    const i = candidate
    run(async () => {
      const { hash, salt } = await commit(String(i))
      const mine = { seed: round.seed, i, salt }
      sessionStorage.setItem(secretKey(gameId), JSON.stringify(mine))
      setSecretState(mine)
      await update(ref(db, `games/${gameId}/round/fCommit`), { [me]: hash })
      setCandidate(null)
      sounds.move(me)
    }, () => toast.error('COULD NOT LOCK YOUR FACE — CHECK CONNECTION'))
  }

  const ask = () => {
    if (!selected || !canAsk(raw, me, selected)) return
    const q = selected
    run(async () => {
      await runTransaction(roundRef, (r) => askQuestion(r, me, q) ?? undefined)
      setSelected(null)
      sounds.move(me)
    }, () => toast.error('COULD NOT ASK — CHECK CONNECTION'))
  }

  const confirmName = () => {
    if (candidate == null || !canName(raw, me)) return
    const i = candidate
    run(async () => {
      await runTransaction(roundRef, (r) => nameFace(r, me, i) ?? undefined)
      setNaming(false)
      setCandidate(null)
    }, () => toast.error('COULD NOT NAME THE FACE — CHECK CONNECTION'))
  }

  // Answer the question my rival just asked, from my face's real trait.
  const pending = pendingAsk(raw)
  const toAnswer = playing && !isSpectator && pending && pending.by === opp && secret ? `${pending.index}:${pending.q}` : null
  useEffect(() => {
    if (!toAnswer) return
    const q = toAnswer.split(':')[1]
    runTransaction(ref(db, `games/${gameId}/round`), (r) => answerQuestion(r, me, traitOf(faces, secret.i, q)) ?? undefined).catch(() => {})
  }, [toAnswer, gameId, me, faces, secret])

  // A face was named: publish my secret so the round can be checked.
  const mustReveal = playing && !isSpectator && !!round.name && !round.reveal[me] && !!secret
  useEffect(() => {
    if (!mustReveal) return
    update(ref(db, `games/${gameId}/round/fReveal`), { [me]: { i: secret.i, salt: secret.salt } }).catch(() => {})
  }, [mustReveal, gameId, me, secret])

  const finish = (winner, reason) => runTransaction(ref(db, `games/${gameId}`), (cur) => {
    if (!cur || cur.status !== 'playing') return
    const scores = { ...(cur.scores || {}) }
    if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
    return { ...cur, winner, status: 'finished', scores, round: { ...(cur.round || {}), fResult: { reason } }, lastActivityAt: Date.now() }
  })

  // Both secrets are in: check the commitments and every answer, then decide.
  const judgeKey = playing && !isSpectator && phase === 'judge' ? `${round.reveal.X.i}:${round.reveal.O.i}:${round.name.i}` : null
  useEffect(() => {
    if (!judgeKey) return
    let live = true
    ;(async () => {
      const r = normalizeRound(raw)
      const valid = {
        X: await verifyReveal(r.commit.X, String(r.reveal.X.i), r.reveal.X.salt),
        O: await verifyReveal(r.commit.O, String(r.reveal.O.i), r.reveal.O.salt),
      }
      const verdict = judge(faces, raw, valid)
      if (live && verdict) finish(verdict.winner, verdict.reason).catch(() => {})
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- judgeKey names the exact reveals being judged; `raw` and `finish` are read once for it
  }, [judgeKey])

  // My committed face is gone from this tab (reopened elsewhere): I cannot
  // answer, so the only fair move is to concede the round.
  const lostSecret = playing && !isSpectator && !!round.commit[me] && !secret
  const concede = () => run(() => finish(opp, 'concede'), () => toast.error('CONCEDE FAILED — CHECK CONNECTION'))

  // The answer to my latest question lands as a stamp for a moment.
  const myAnswered = round.asks.filter((a) => a.by === me && a.a != null)
  const [stampSeen, setStampSeen] = useState(myAnswered.length)
  const showStamp = !isSpectator && myAnswered.length > stampSeen
  useEffect(() => {
    if (myAnswered.length <= stampSeen) return
    const n = myAnswered.length
    if (myAnswered[n - 1].a) sounds.go(); else sounds.buzz()
    const id = setTimeout(() => setStampSeen(n), STAMP_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the count; the array is rebuilt every render
  }, [myAnswered.length, stampSeen])

  const winner = game.winner ?? null
  const prevWinner = useRef(winner)
  useEffect(() => {
    if (winner && prevWinner.current !== winner && !isSpectator) {
      if (winner === me) sounds.win(); else if (winner === 'draw') sounds.draw(); else sounds.lose()
    }
    prevWinner.current = winner
  }, [winner, me, isSpectator])

  if (!faces.length) {
    return <p className="py-10 text-center font-pixel text-[10px] text-retro-dim arcade-blink">DEALING 24 FACES…</p>
  }

  // ─── What the board shows ──────────────────────────────────────────────────
  const names = {
    X: mySymbol === 'X' ? 'YOU' : (game.players?.X?.name ?? 'PLAYER 1'),
    O: mySymbol === 'O' ? 'YOU' : (game.players?.O?.name ?? 'PLAYER 2'),
  }
  const leftOf = (s) => remainingFor(faces, raw, s)
  const boardSide = me
  const standing = new Set(leftOf(boardSide))
  const down = new Set(faces.map((_, i) => i).filter((i) => !standing.has(i)))
  const revealed = finished || phase === 'judge'
  const secretOf = (s) => {
    if (revealed && round.reveal[s]) return faces[round.reveal[s].i] ?? null
    return s === me && !isSpectator && secret ? faces[secret.i] : null
  }
  const seats = {
    X: { name: names.X, secret: secretOf('X'), left: leftOf('X').length, wins: game.scores?.X || 0 },
    O: { name: names.O, secret: secretOf('O'), left: leftOf('O').length, wins: game.scores?.O || 0 },
  }
  const asked = Object.fromEntries(myAnswered.map((a) => [a.q, a.a]))
  const lastOf = (s) => round.asks.filter((a) => a.by === s).slice(-1)
  const log = [...lastOf(me), ...lastOf(opp)]
  const myTurn = playing && !isSpectator && round.turn === me
  const mode = !playing || isSpectator ? 'watch' : phase === 'pick' ? (round.commit[me] ? 'watch' : 'pick') : naming && phase === 'ask' && myTurn ? 'name' : 'ask'
  const canAct = phase === 'ask' && myTurn && !lostSecret
  const sel = canAct && selected && canAsk(raw, me, selected) ? selected : null
  const highlight = mode === 'ask' && sel ? new Set([...standing].filter((i) => faces[i].traits[sel] === 1)) : null
  const oppName = names[opp].toUpperCase()

  let hint
  if (finished) hint = ''
  else if (isSpectator) hint = `${names[round.turn].toUpperCase()} TO ASK`
  else if (phase === 'pick') hint = round.commit[me] ? `WAITING FOR ${oppName} TO PICK A FACE…` : 'TAP THE FACE YOU WANT TO HIDE'
  else if (phase === 'reveal' || phase === 'judge') hint = 'A FACE WAS NAMED · CHECKING BOTH SECRETS…'
  else if (phase === 'answer') hint = pending?.by === me ? `${oppName} IS ANSWERING…` : 'ANSWERING FROM YOUR FACE…'
  else hint = myTurn ? (sel ? 'ASK IT, OR TRY ANOTHER' : 'YOUR TURN · TAP A QUESTION TO SEE ITS SPLIT') : `${oppName} IS CHOOSING A QUESTION…`

  let primary = null
  let secondary = null
  if (mode === 'pick') {
    primary = { label: busy ? 'LOCKING…' : candidate == null ? 'TAP A FACE' : `HIDE ${faces[candidate].name}`, sub: 'YOUR RIVAL MUST FIND IT', onClick: lockSecret, disabled: candidate == null || busy }
  } else if (mode === 'name') {
    primary = { label: busy ? 'NAMING…' : candidate == null ? 'TAP A FACE' : `IT'S ${faces[candidate].name}!`, onClick: confirmName, disabled: candidate == null || busy }
    secondary = { label: 'BACK', onClick: () => { setNaming(false); setCandidate(null) }, disabled: busy }
  } else if (mode === 'ask' && !finished) {
    primary = { label: busy ? 'ASKING…' : 'ASK', sub: sel ? QUESTIONS.find((q) => q.id === sel).label : 'PICK A QUESTION', onClick: ask, disabled: !sel || busy }
    secondary = { label: 'NAME THE FACE', sub: `${standing.size} LEFT`, onClick: () => { setNaming(true); setSelected(null); setCandidate(null) }, disabled: !canAct || busy }
  }

  const reason = raw?.fResult?.reason
  const matchTarget = 3
  const matchWinner = (game.scores?.X || 0) >= matchTarget ? 'X' : (game.scores?.O || 0) >= matchTarget ? 'O' : null

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      <FaceOffBoard
        faces={faces}
        seats={seats}
        mySide={mySymbol}
        turn={playing && (phase === 'ask' || phase === 'answer') ? round.turn : null}
        down={down}
        highlight={highlight}
        mode={mode}
        candidate={candidate}
        onFace={(i) => { sounds.touch(); setCandidate(i) }}
        log={log}
        asked={asked}
        selected={sel}
        onQuestion={canAct ? (q) => { sounds.touch(); setSelected(selected === q ? null : q) } : null}
        split={sel ? splitFor(faces, raw, me, sel) : null}
        stamp={showStamp ? myAnswered[myAnswered.length - 1].a : null}
        primary={primary}
        secondary={secondary}
        hint={hint}
      />

      {lostSecret && (
        <div className="rounded border-2 border-retro-danger bg-retro-tint-danger p-2 text-center space-y-1.5">
          <p className="font-pixel text-[8px] text-retro-danger leading-relaxed">YOUR SECRET FACE IS NOT IN THIS TAB, SO YOU CANNOT ANSWER</p>
          <button onClick={concede} disabled={busy} className="min-h-11 px-4 rounded border-2 border-retro-danger font-pixel text-[9px] text-retro-danger press disabled:opacity-50">
            {busy ? 'CONCEDING…' : 'CONCEDE THIS ROUND'}
          </button>
        </div>
      )}

      {!finished && !isSpectator && !opponentOnline && <OfflineNotice label="OPPONENT" />}

      {finished && (
        <div className="space-y-2">
          <p className={cn('text-center font-pixel text-[8px] leading-relaxed', reason === 'cheat' ? 'text-retro-danger' : 'text-retro-dim')}>
            {reason === 'named' ? 'THE NAMED FACE WAS RIGHT'
              : reason === 'wrong' ? 'THE NAMED FACE WAS WRONG'
                : reason === 'cheat' ? 'AN ANSWER DID NOT MATCH THE REVEALED FACE'
                  : reason === 'concede' ? 'THE ROUND WAS CONCEDED' : ''}
          </p>
          <GameStatus
            status={game.status} winner={game.winner} mySymbol={mySymbol}
            scores={game.scores} players={game.players} gameType={game.gameType}
            onPlayAgain={!matchWinner && !proposal && !isSpectator ? onPlayAgain : null}
            onNewMatch={matchWinner && !proposal && !isSpectator ? onNewMatch : null}
            onSwitchGame={!proposal && !isSpectator ? onSwitchGame : null}
          />
        </div>
      )}
    </div>
  )
}
