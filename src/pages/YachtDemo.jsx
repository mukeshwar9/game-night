import { useEffect, useState } from 'react'
import YachtBoard from '../components/YachtBoard'
import {
  BOT_LEVELS, BOXES, ROLLS_PER_TURN,
  botBox, botHolds, canRoll, createRound, normalizeRound, resolveRoll, scoreTurn, sheetTotals, toggleHold,
} from '../lib/yachtLogic'
import { generateSeedHex } from '../lib/diceLogic'
import { useAuth } from '../lib/AuthContext'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { readBotRecord, recordBotResult, formatLevelRecord, describeLevelRecord } from '../lib/botRecordLogic'

// Solo YACHT against a bot. The same round object and the same moves as the
// online room (yachtLogic.js), kept in local state instead of the room.

const ME = 'you'
const CPU = 'cpu'
const BOT_STEP_MS = 850
const boxLabel = (id) => BOXES.find((b) => b.id === id)?.label ?? ''
const fresh = () => createRound([ME, CPU], generateSeedHex())
const rollNow = (round, uid) => resolveRoll({ ...round, yReq: { i: round.yRollIndex, by: uid, at: Date.now() } }) ?? round

export default function YachtDemo() {
  const { profile } = useAuth()
  const [raw, setRaw] = useState(fresh)
  const [result, setResult] = useState(null)
  const [level, setLevel] = useState('normal')
  const [record, setRecord] = useState(() => readBotRecord('yacht'))
  const [viewPick, setViewPick] = useState(ME)
  const [pick, setPick] = useState(null)
  const round = normalizeRound(raw)
  const turnUid = round.seats[round.turn]
  const myTurn = !result && turnUid === ME
  const rolled = round.rollsLeft < ROLLS_PER_TURN
  const selected = pick && pick.at === round.rollIndex && pick.turn === round.turn ? pick.id : null

  const finish = (res) => {
    setRaw(res.round)
    if (!res.result) return
    setResult(res.result)
    const w = res.result.winner
    if (w === ME) sounds.win(); else if (w === 'draw') sounds.draw(); else sounds.lose()
    if (w !== 'draw') setRecord(recordBotResult('yacht', level, w === ME ? 'win' : 'loss'))
  }

  // The bot plays its turn one visible step at a time: roll, keep, roll, bank.
  useEffect(() => {
    if (result || turnUid !== CPU) return
    const id = setTimeout(() => {
      const r = normalizeRound(raw)
      const sheet = r.sheets[CPU]
      if (r.rollsLeft === ROLLS_PER_TURN) { sounds.pigRoll(1); setRaw(rollNow(raw, CPU)); return }
      const holds = botHolds(r.dice, sheet, level)
      const keepAll = holds.every(Boolean)
      if (r.rollsLeft > 0 && !keepAll && level !== 'easy') {
        sounds.pigRoll(1)
        setRaw(rollNow({ ...raw, yHeld: holds }, CPU))
        return
      }
      const res = scoreTurn(raw, CPU, botBox(r.dice, sheet, level))
      if (res) { sounds.move('O'); finish(res) }
    }, BOT_STEP_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `finish` only closes over setters and the level already listed
  }, [raw, result, turnUid, level])

  const roll = () => { if (canRoll(raw, ME)) { sounds.pigRoll(1); setRaw(rollNow(raw, ME)) } }
  const hold = (k) => { if (toggleHold(raw, ME, k)) { sounds.touch(); setRaw((r) => toggleHold(r, ME, k) ?? r) } }
  const score = () => {
    const res = selected && scoreTurn(raw, ME, selected)
    if (!res) return
    sounds.move('X')
    setPick(null)
    finish(res)
  }
  const again = () => { setRaw(fresh()); setResult(null); setPick(null); setViewPick(ME) }

  const names = { [ME]: 'YOU', [CPU]: 'CPU' }
  const seats = round.seats.map((uid) => ({
    uid, name: names[uid], avatar: uid === ME ? profile?.avatar : null, total: sheetTotals(round.sheets[uid]).total,
  }))
  const last = round.last
  const announce = last ? { seat: round.seats.indexOf(last.by), text: `${names[last.by]} · ${boxLabel(last.box)} +${last.pts}` } : null
  const viewUid = round.seats.includes(viewPick) ? viewPick : ME
  const started = round.rollIndex > 0

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      <YachtBoard
        key={`${round.turn}:${round.rollIndex}`}
        seats={seats}
        turnUid={result ? null : turnUid}
        myUid={ME}
        viewUid={viewUid}
        onView={setViewPick}
        dice={round.dice}
        held={round.held}
        rollsLeft={round.rollsLeft}
        rolling={rolled}
        sheet={round.sheets[viewUid]}
        myTurn={myTurn}
        selected={selected}
        onSelect={(id) => { sounds.touch(); setPick({ id, at: round.rollIndex, turn: round.turn }) }}
        onHold={hold}
        onRoll={myTurn && canRoll(raw, ME) ? roll : null}
        onScore={myTurn && rolled ? score : null}
        announce={announce}
        justBox={last && last.by === viewUid ? last.box : null}
      />

      {result ? (
        <div className="text-center space-y-2">
          <p className={cn('font-pixel text-sm', result.winner === ME ? 'text-retro-win text-glow-win' : result.winner === 'draw' ? 'text-retro-text' : 'text-retro-danger')}>
            {result.winner === ME ? 'YOU WIN!' : result.winner === 'draw' ? 'IT\'S A DRAW' : 'CPU WINS'}
            <span className="block mt-1 text-[9px] text-retro-dim">{seats[0].total} — {seats[1].total}</span>
          </p>
          <button onClick={again} className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press">
            PLAY AGAIN
          </button>
        </div>
      ) : (
        <>
          <p className={cn('text-center font-pixel text-[9px]', myTurn ? 'text-retro-cta' : 'text-retro-dim')} role="status">
            {myTurn
              ? (!rolled ? 'YOUR TURN · ROLL THE DICE' : selected ? 'TAP SCORE TO BANK IT' : round.rollsLeft ? 'HOLD DICE, ROLL AGAIN OR PICK A BOX' : 'NO ROLLS LEFT · PICK A BOX')
              : 'CPU IS ROLLING…'}
          </p>
          {/* The level is fixed once the first die is rolled, so a late switch cannot claim a harder win. */}
          <div className="flex justify-center gap-1.5">
            {BOT_LEVELS.map((d) => (
              <button
                key={d}
                onClick={() => setLevel(d)}
                disabled={started}
                aria-pressed={level === d}
                aria-label={`${d} bot, your record ${describeLevelRecord(record[d])}`}
                className={cn(
                  'px-3 py-1 font-pixel text-[8px] uppercase rounded border-2 transition press flex flex-col items-center gap-0.5 disabled:opacity-60',
                  level === d ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
                )}
              >
                <span>{d}</span>
                {formatLevelRecord(record[d]) && <span className="text-[7px] text-retro-dim">{formatLevelRecord(record[d])}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
