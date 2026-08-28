import { useEffect, useMemo, useRef, useState } from 'react'
import BattleshipBoard from '../components/BattleshipBoard'
import {
  FLEET_SPEC,
  shipCells,
  validateFleet,
  randomFleet,
  gradeShot,
  allSunk,
  remainingShips,
  pickShot,
  canPlace,
} from '../lib/battleshipLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo BATTLESHIP vs a HUNT/TARGET bot — fully local, no Firebase.

const BOT_DELAY_MS = 700

function cellsOf(fleet, ship) {
  const spec = FLEET_SPEC.find(s => s.ship === ship)
  return shipCells(spec.size, fleet[ship].orient, fleet[ship].cell)
}

// cell index -> { shipIdx, seg } for hull rendering (color + end-cap) in
// BattleshipBoard. seg is derived from shipCells() order (index 0 = start,
// last = end) plus the ship's orient.
function fleetCellMap(fleet) {
  const map = new Map()
  for (const ship of Object.keys(fleet)) {
    const shipIdx = FLEET_SPEC.findIndex(s => s.ship === ship)
    const { orient } = fleet[ship]
    const cells = cellsOf(fleet, ship)
    cells.forEach((c, i) => {
      const pos = i === 0 ? 'start' : i === cells.length - 1 ? 'end' : 'mid'
      map.set(c, { shipIdx, seg: `${pos}-${orient}` })
    })
  }
  return map
}

export default function BattleshipDemo() {
  const [phase, setPhase] = useState('placing')
  const [draft, setDraft] = useState({})
  const [selected, setSelected] = useState('carrier')
  const [placeError, setPlaceError] = useState('')
  const [hoverCell, setHoverCell] = useState(null)
  const [playerFleet, setPlayerFleet] = useState(null)
  const [botFleet, setBotFleet] = useState(null)
  const [playerShots, setPlayerShots] = useState([]) // at the bot
  const [botShots, setBotShots] = useState([])       // at the player
  const [turn, setTurn] = useState('me')
  const [banner, setBanner] = useState(null)
  const botTimerRef = useRef(null)

  const draftValid = validateFleet(draft) === null
  const done = phase === 'done'
  const playerWon = done && allSunk(botFleet ?? {}, playerShots)
  const myTurn = phase === 'battle' && turn === 'me' && !done

  const draftCells = useMemo(() => fleetCellMap(draft), [draft])

  const playerFleetCells = useMemo(
    () => (playerFleet ? fleetCellMap(playerFleet) : draftCells),
    [playerFleet, draftCells],
  )

  // Hover preview — whole-ship footprint while placing, live-updates on rotate.
  const selectedSize = selected ? FLEET_SPEC.find(s => s.ship === selected)?.size : null
  const preview = useMemo(() => {
    if (phase !== 'placing' || !selected || hoverCell == null || selectedSize == null) return null
    const orient = draft[selected]?.orient ?? 'h'
    const row = Math.floor(hoverCell / 10)
    const cells = shipCells(selectedSize, orient, hoverCell)
      .filter(c => c >= 0 && c < 100 && (orient !== 'h' || Math.floor(c / 10) === row))
    const valid = canPlace(draft, selected, orient, hoverCell)
    return { cells, valid }
  }, [phase, selected, hoverCell, selectedSize, draft])

  // Bot driver: fires whenever it's the bot's turn.
  useEffect(() => {
    if (turn !== 'bot' || phase !== 'battle') return
    botTimerRef.current = setTimeout(() => {
      setBotShots(prev => {
        const cell = pickShot(prev)
        if (cell == null) return prev
        const result = gradeShot(playerFleet, cell, prev)
        if (result === 'hit') sounds.hit(4)
        if (result?.startsWith('sunk:')) setBanner(`RIVAL SUNK YOUR ${result.split(':')[1].toUpperCase()}!`)
        const next = [...prev, { cell, result }]
        if (allSunk(playerFleet, next)) {
          setPhase('done')
          sounds.lose()
        }
        setTurn(result === 'miss' ? 'me' : 'bot')
        return next
      })
    }, BOT_DELAY_MS)
    return () => clearTimeout(botTimerRef.current)
  }, [turn, phase, playerFleet]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(botTimerRef.current), [])

  // ── Placement ──────────────────────────────────────────────────────────────
  const placeShip = (cell) => {
    if (!selected) return
    const orient = draft[selected]?.orient ?? 'h'
    const candidate = { ...draft, [selected]: { orient, cell } }
    const err = validateFleet(candidate)
    if (err?.includes('overlap')) { setPlaceError('SHIPS OVERLAP'); return }
    if (err?.includes('overflows')) { setPlaceError("DOESN'T FIT THERE"); return }
    setPlaceError('')
    const next = { ...candidate }
    setDraft(next)
    setSelected(FLEET_SPEC.find(s => !next[s.ship])?.ship ?? null)
    setHoverCell(null)
  }

  const rotateSelected = () => {
    if (!selected) return
    setDraft(d => ({
      ...d,
      [selected]: { orient: d[selected]?.orient === 'v' ? 'h' : 'v', cell: d[selected]?.cell ?? 0 },
    }))
  }

  const handleReady = () => {
    if (!draftValid) return
    setPlayerFleet(draft)
    setBotFleet(randomFleet())
    setTurn('me')
    setPhase('battle')
    sounds.go()
  }

  // ── Shooting ───────────────────────────────────────────────────────────────
  const handleShoot = (cell) => {
    if (!myTurn || playerShots.some(s => s.cell === cell)) return
    const result = gradeShot(botFleet, cell, playerShots)
    if (result === 'hit') sounds.hit(4)
    else if (result?.startsWith('sunk:')) {
      sounds.bust()
      setBanner(`SUNK THE RIVAL ${result.split(':')[1].toUpperCase()}!`)
    } else sounds.miss()
    const next = [...playerShots, { cell, result }]
    setPlayerShots(next)
    if (allSunk(botFleet, next)) {
      setPhase('done')
      sounds.win()
      return
    }
    if (result === 'miss') setTurn('bot')
  }

  const reset = () => {
    clearTimeout(botTimerRef.current)
    setPhase('placing'); setDraft({}); setSelected('carrier'); setPlaceError('')
    setPlayerFleet(null); setBotFleet(null)
    setPlayerShots([]); setBotShots([]); setTurn('me'); setBanner(null)
  }

  // Auto-clear sunk banners.
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 2200)
    return () => clearTimeout(t)
  }, [banner])

  const toMap = arr => Object.fromEntries(arr.filter(s => s.result).map(s => [s.cell, s.result]))
  const myRemaining = playerFleet ? remainingShips(playerFleet, botShots) : []
  const botSunkNames = FLEET_SPEC
    .filter(({ ship }) => playerShots.some(s => s.result === `sunk:${ship}`))
    .map(s => s.ship)

  return (
    <div className="space-y-4">
      {/* Status */}
      {phase === 'placing' && (
        <div className="text-center space-y-1">
          <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1">DEPLOY YOUR FLEET</p>
          <p className="font-mono text-[10px] text-retro-dim">Tap a ship, then tap your waters.</p>
        </div>
      )}
      {phase === 'battle' && (
        <p className={cn(
          'font-pixel text-[10px] text-center arcade-blink',
          myTurn ? 'text-retro-cta text-glow-cta' : 'text-retro-dim',
        )}>
          {myTurn ? 'YOUR SHOT' : 'RIVAL AIMS…'}
        </p>
      )}

      {/* Banner */}
      {banner && (
        <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center">{banner}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-4 justify-items-center">
        {/* Targeting */}
        <div className="space-y-1 w-full max-w-sm md:max-w-md">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">TARGETING</p>
          <BattleshipBoard
            shots={toMap(playerShots)}
            lastCell={playerShots[playerShots.length - 1]?.cell}
            onCell={handleShoot}
            disabled={!myTurn}
            accent="p1"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {FLEET_SPEC.map(({ ship }) => (
              <span
                key={ship}
                className={cn(
                  'font-pixel text-[8px] uppercase px-1.5 py-0.5 rounded border',
                  botSunkNames.includes(ship)
                    ? 'border-retro-win text-retro-win'
                    : 'border-retro-border text-retro-dim',
                )}
              >
                {botSunkNames.includes(ship) ? `✕ ${ship}` : ship}
              </span>
            ))}
          </div>
        </div>

        {/* Your waters */}
        <div className="space-y-1 w-full max-w-sm md:max-w-md">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">YOUR WATERS</p>
          <BattleshipBoard
            shots={toMap(botShots)}
            fleetCells={playerFleetCells}
            lastCell={botShots[botShots.length - 1]?.cell}
            onCell={phase === 'placing' ? placeShip : undefined}
            disabled={phase !== 'placing'}
            accent="p2"
            preview={phase === 'placing' ? preview : null}
            onHoverCell={phase === 'placing' ? setHoverCell : undefined}
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {myRemaining.map(({ ship, sunk }) => (
              <span
                key={ship}
                className={cn(
                  'font-pixel text-[8px] uppercase px-1.5 py-0.5 rounded border',
                  sunk ? 'border-retro-danger text-retro-danger' : 'border-retro-p1 text-retro-p1',
                )}
              >
                {sunk ? `✕ ${ship}` : ship}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Dock / actions */}
      {phase === 'placing' && (
        <>
          <div className="space-y-1.5">
            {FLEET_SPEC.map(({ ship, size }) => {
              const placed = !!draft[ship]
              const isSelected = selected === ship
              return (
                <button
                  key={ship}
                  onClick={() => !placed && setSelected(ship)}
                  disabled={placed}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded border-2 transition-all active:scale-[0.98]',
                    isSelected && !placed
                      ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                      : placed
                        ? 'border-retro-win/60 text-retro-win opacity-70'
                        : 'border-retro-border text-retro-text hover:border-retro-p1/50',
                  )}
                >
                  <span className="font-mono text-[11px] uppercase">{ship}</span>
                  {placed ? (
                    <span className="font-pixel text-[9px] tracking-widest">✓ DEPLOYED</span>
                  ) : (
                    <span className="flex gap-px" aria-hidden="true">
                      {Array.from({ length: size }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'w-2.5 h-2.5 bg-retro-structure',
                            i === 0 && 'rounded-l-full',
                            i === size - 1 && 'rounded-r-full',
                          )}
                        />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {placeError && (
            <p className="font-pixel text-[9px] text-retro-danger text-center">{placeError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={rotateSelected}
              disabled={!selected}
              className="flex-1 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95 disabled:opacity-40"
            >
              ⟳ ROTATE
            </button>
            <button
              onClick={() => { setDraft(randomFleet()); setSelected(null); setPlaceError('') }}
              className="flex-1 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95"
            >
              ⚄ RANDOM
            </button>
            <button
              onClick={() => { setDraft({}); setSelected('carrier'); setPlaceError('') }}
              className="flex-1 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p2/50 active:scale-95"
            >
              ✕ CLEAR
            </button>
          </div>

          <button
            onClick={handleReady}
            disabled={!draftValid}
            className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
          >
            {draftValid ? 'READY — BATTLE STATIONS' : `PLACE ${5 - Object.keys(draft).length} MORE`}
          </button>
        </>
      )}

      {done && (
        <div className="text-center space-y-2 pt-2">
          <p className={cn(
            'font-pixel text-sm',
            playerWon ? 'text-retro-win text-glow-win' : 'text-retro-danger',
          )}>
            {playerWon ? 'FLEET DESTROYED — YOU WIN!' : 'YOUR FLEET IS LOST'}
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
