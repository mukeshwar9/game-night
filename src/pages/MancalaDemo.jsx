import { useEffect, useRef, useState } from 'react'
import MancalaBoard from '../components/MancalaBoard'
import { INITIAL_PITS, applyMancalaMove, legalPits } from '../lib/mancalaLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo MANCALA vs a greedy bot — fully local, no Firebase.

const BOT_DELAY_MS = 700

function botPick(pits) {
  const legal = legalPits(pits, 'O')
  if (!legal.length) return null
  let best = null
  let bestScore = -Infinity
  for (const pit of legal) {
    const moved = applyMancalaMove(pits, pit, 'O')
    if (!moved) continue
    let score = moved.pits[13] * 10
    if (moved.extraTurn) score += 25
    score += moved.captured * 8
    score += Math.random() * 3 // tie-break noise
    if (score > bestScore) { bestScore = score; best = pit }
  }
  return best
}

export default function MancalaDemo() {
  const [pits, setPits] = useState(INITIAL_PITS)
  const [turn, setTurn] = useState('me')
  const [last, setLast] = useState(null)
  const [banner, setBanner] = useState(null)
  const timerRef = useRef(null)

  const done = pits[6] + pits[13] === 48
  const playerWon = done && pits[6] > pits[13]
  const draw = done && pits[6] === pits[13]
  const myTurn = turn === 'me' && !done

  const finishRound = (moved) => {
    setPits(moved.pits)
    if (moved.result) {
      const { winner } = moved.result
      if (winner === 'draw') sounds.draw()
      else if ((winner === 'X') === (turn === 'me')) sounds.win()
      else sounds.lose()
      setTurn('done')
      return true
    }
    return false
  }

  const handlePit = (pit) => {
    if (!myTurn || (pits[pit] ?? 0) === 0) return
    const before = pits[pit]
    const moved = applyMancalaMove(pits, pit, 'X')
    if (!moved) return
    sounds.move('X')
    if (moved.captured > 0) {
      sounds.hit(4)
      setBanner(`CAPTURED ${moved.captured}!`)
    }
    setLast({ pit, by: 'X', seeds: before })
    const over = finishRound(moved)
    if (!over && !moved.extraTurn) setTurn('bot')
    else if (moved.extraTurn && !over) {
      setBanner(b => b ?? 'GO AGAIN')
    }
  }

  // Bot driver — fires while it's the bot's turn; extra turns re-trigger.
  useEffect(() => {
    if (turn !== 'bot' || done) return
    timerRef.current = setTimeout(() => {
      setPits(current => {
        const pit = botPick(current)
        if (pit == null) return current
        const before = current[pit]
        const moved = applyMancalaMove(current, pit, 'O')
        if (!moved) return current
        sounds.move('O')
        setLast({ pit, by: 'O', seeds: before })
        if (moved.captured > 0) setBanner(`RIVAL CAPTURED ${moved.captured}!`)
        if (moved.result) {
          const { winner } = moved.result
          if (winner === 'draw') sounds.draw()
          else if (winner === 'X') sounds.win()
          else sounds.lose()
          setTurn('done')
        } else if (!moved.extraTurn) {
          setTurn('me')
        }
        return moved.pits
      })
    }, BOT_DELAY_MS)
    return () => clearTimeout(timerRef.current)
  }, [turn, done]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 1800)
    return () => clearTimeout(t)
  }, [banner])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const reset = () => {
    clearTimeout(timerRef.current)
    setPits(INITIAL_PITS()); setTurn('me'); setLast(null); setBanner(null)
  }

  return (
    <div className="space-y-4">
      {/* Score strip */}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className={cn('text-retro-p1', myTurn && 'text-glow-p1')}>
          YOU {pits[6] ?? 0}
        </span>
        <span className="text-retro-dim">
          {done ? 'FULL STORES' : myTurn ? 'YOUR SOW' : 'RIVAL SOWS…'}
        </span>
        <span className={cn('text-retro-p2', turn === 'bot' && !done && 'text-glow-p2')}>
          {pits[13] ?? 0} RIVAL
        </span>
      </div>

      {banner && (
        <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center">{banner}</p>
      )}

      <MancalaBoard
        pits={pits}
        last={last}
        onPit={handlePit}
        disabled={!myTurn}
        accent="p1"
      />

      <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
        TAP A PIT TO SOW · LAND IN YOUR STORE FOR AN EXTRA TURN<br />
        LAND IN AN EMPTY PIT TO CAPTURE THE OPPOSITE SEEDS
      </p>

      {done && (
        <div className="text-center space-y-2 pt-2">
          <p className={cn(
            'font-pixel text-sm',
            draw ? 'text-retro-dim' : playerWon ? 'text-retro-win text-glow-win' : 'text-retro-danger',
          )}>
            {draw ? `DEAD HEAT ${pits[6]}–${pits[13]}` : playerWon ? 'YOU WIN!' : 'RIVAL WINS'}
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  )
}
