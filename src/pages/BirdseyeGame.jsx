import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, push, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import BirdseyeArena from '../components/birdseye/BirdseyeArena'
import BirdChip from '../components/birdseye/BirdChip'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import { DUEL_SHOTS_EACH, BIRDS, duelBird } from '../lib/birdseyeCore'
import { replayDuel } from '../lib/birdseyeLogic'
import { cn } from '@/lib/utils'

// BIRDSEYE online duel — the Artillery model. Firebase stores only the fort
// index and an append-only shot list ({ by, b, a, p, k }); every client
// replays it through the deterministic sim. Both seats throw at ONE fort,
// alternating, three birds each: more scarecrows popped wins (points break
// ties). The shooter flies live and writes the shot when it settles, so the
// rival then watches the very same flight replayed — from their own camera.

export default function BirdseyeGame({ gameId, game, mySymbol, opponentOnline, onPlayAgain }) {
  const me = mySymbol === 'X' ? 'X' : mySymbol === 'O' ? 'O' : null
  const rival = me === 'X' ? 'O' : 'X'
  const fortIdx = Number.isInteger(game.bsFort) ? game.bsFort : 0
  const shots = game.bsShots
  const duel = useMemo(() => replayDuel(fortIdx, shots), [fortIdx, shots])
  const fort = duel.fort
  const playing = game.status === 'playing'
  const myTurn = !!me && playing && game.currentTurn === me && !duel.done
  const [sending, setSending] = useState(false)
  const [playback, setPlayback] = useState(null)
  // Bumped when my shot did not reach the room, so the sling reloads and I can
  // throw that bird again (the flown result was never recorded).
  const [retry, setRetry] = useState(0)
  const seenRef = useRef(null)
  const sendingRef = useRef(false) // synchronous double-send guard
  const finishTries = useRef(0)
  const [finishNonce, setFinishNonce] = useState(0)

  // Animate each newly arrived shot I did not throw myself (first render only
  // marks what is already there, so a reload does not replay old shots).
  useEffect(() => {
    const keys = duel.records.map(r => r.key)
    if (seenRef.current == null) { seenRef.current = new Set(keys); return }
    const fresh = duel.records.filter(r => !seenRef.current.has(r.key))
    for (const r of fresh) seenRef.current.add(r.key)
    const last = fresh[fresh.length - 1]
    if (last && last.by !== me) setPlayback({ id: last.key, before: last.before, shot: last.shot })
  }, [duel, me])

  // The board to show: my bird in the sling on my turn, else the settled fort.
  const board = useMemo(() => ({
    key: `${fort.id}|${duel.records.length}|${myTurn ? 'aim' : 'wait'}|${retry}`,
    snap: duel.snap,
    bird: myTurn ? duel.nextBird(me) : null,
  }), [fort, duel, myTurn, me, retry])
  const showBoard = playback ? null : board

  // Finish the round once the replay says it is over (any client; the
  // transaction serialises, exactly like Artillery). The verdict is re-derived
  // from the room's own shot list inside the transaction, never trusted from
  // this client's (possibly optimistic) copy. The rival's last shot finishes
  // only after its playback, so the result does not cover the flight.
  useEffect(() => {
    if (!duel.done || !playing || playback) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing') return
      const end = replayDuel(Number.isInteger(current.bsFort) ? current.bsFort : 0, current.bsShots)
      if (!end.done) return
      const next = { ...current, status: 'finished', winner: end.winner }
      if (end.winner !== 'draw') next.scores = { ...current.scores, [end.winner]: (current.scores?.[end.winner] || 0) + 1 }
      return next
    }).then(() => { finishTries.current = 0 }, () => {
      // Every client runs this, so a failure is retried a few times and
      // surfaced once (shared toast id) instead of leaving the room stuck.
      if (finishTries.current++ < 3) setTimeout(() => setFinishNonce(n => n + 1), 2000)
      else toast.error('COULD NOT END THE ROUND — CHECK YOUR CONNECTION', { id: 'birdseye-finish' })
    })
  }, [duel.done, playing, playback, gameId, finishNonce])

  const onSettled = (e) => {
    if (!e.live) { setPlayback(null); return }
    if (!myTurn || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    const shotRef = push(ref(db, `games/${gameId}/bsShots`))
    const rec = { by: me, b: e.shot.b, a: e.shot.a, p: e.shot.p, k: e.shot.k }
    const fail = (msg) => { toast.error(msg); setRetry(n => n + 1) }
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing' || current.currentTurn !== me) return
      return { ...current, bsShots: { ...(current.bsShots || {}), [shotRef.key]: rec }, currentTurn: rival }
    })
      .then(res => { if (!res.committed) fail('SHOT NOT SAVED — IT WAS NOT YOUR TURN') })
      .catch(() => fail('SHOT FAILED TO SEND — THROW AGAIN'))
      .finally(() => { sendingRef.current = false; setSending(false) })
  }

  const seatHud = (seat) => (
    <span className={cn('font-pixel text-[7px] rounded px-1.5 py-1 bg-retro-card/85 flex items-center gap-1',
      seat === 'X' ? 'text-retro-p1' : 'text-retro-p2', playing && game.currentTurn === seat && 'ring-1 ring-current')}>
      {seat === me ? 'YOU' : me ? 'RIVAL' : seat} · {duel.pops[seat]} POP{duel.pops[seat] === 1 ? '' : 'S'}
      <span className="flex">
        {Array.from({ length: DUEL_SHOTS_EACH }, (_, k) => <BirdChip key={k} id={duelBird(fort, k)} used={k < duel.thrown[seat]} className="w-3.5 h-3.5" />)}
      </span>
    </span>
  )
  const order = me ? [me, rival] : ['X', 'O']
  const hudLeft = (
    <>
      <span className="font-pixel text-[7px] text-retro-text bg-retro-card/85 rounded px-1.5 py-1">{fort.id} {fort.name} · {duel.crowsLeft} LEFT</span>
      {order.map(s => <span key={s}>{seatHud(s)}</span>)}
    </>
  )

  let banner = null
  if (playing && !duel.done) {
    if (playback) banner = <span className="text-retro-dim">RIVAL&apos;S SHOT — WATCH IT LAND</span>
    else if (sending) banner = <span className="text-retro-dim">SENDING YOUR SHOT…</span>
    else if (myTurn) banner = <span className="text-retro-cta text-glow-cta">YOUR BIRD: {BIRDS[duel.nextBird(me)].name} — PULL BACK</span>
    else if (me) banner = <span className="text-retro-dim">RIVAL IS AIMING…</span>
  }

  return (
    <div className="space-y-3">
      {!me && <SpectatorCard game={game} />}
      {banner && <p className="font-pixel text-[10px] text-center arcade-blink">{banner}</p>}
      <BirdseyeArena
        fort={fort}
        board={showBoard}
        playback={playback}
        onSettled={onSettled}
        hudLeft={hudLeft}
        className="h-[min(62vh,560px)] min-h-[400px]"
      />
      <GameStatus status={game.status} winner={game.winner} currentTurn={null} mySymbol={me || 'X'} players={game.players} onPlayAgain={me ? onPlayAgain ?? null : null} />
      {opponentOnline === false && playing && <p className="font-pixel text-[8px] text-retro-dim text-center">RIVAL OFFLINE</p>}
    </div>
  )
}
