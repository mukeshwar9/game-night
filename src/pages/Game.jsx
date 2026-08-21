import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ref, onValue, update, get, runTransaction, onDisconnect, set as dbSet } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { normalizeBoard, generateGameId } from '../lib/gameLogic'
import { freshGameState, getGameConfig } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { recordRoom, recordMatch } from '../lib/profile'
import { recordPlay } from '../lib/analytics'
import ArcadeLoader from '@/components/ArcadeLoader'
import GameStatus from '../components/GameStatus'
import PlayerCard from '../components/PlayerCard'
import WaitingRoom from '../components/WaitingRoom'
import InviteFriendModal from '../components/InviteFriendModal'
import WinEffect from '../components/WinEffect'
import OfflineNotice from '../components/loading/OfflineNotice'
import HangmanGame from './HangmanGame'
import NumberMemoryGame from './NumberMemoryGame'
import ChimpGame from './ChimpGame'
import ReactionGame from './ReactionGame'
import AimTrainerGame from './AimTrainerGame'
import TypingGame from './TypingGame'
import MathGame from './MathGame'
import TwoTruthsGame from './TwoTruthsGame'
import BluffBattleGame from './BluffBattleGame'
import PongGame from './PongGame'
import SnakeGame from './SnakeGame'
import TronGame from './TronGame'
import SumoGame from './SumoGame'
import SpaceduelGame from './SpaceduelGame'
import PaintGame from './PaintGame'
import WordDuelGame from './WordDuelGame'
import WordHuntGame from './WordHuntGame'
import MineRaceGame from './MineRaceGame'
import BattleshipGame from './BattleshipGame'
import WavelengthGame from './WavelengthGame'
import FibbageGame from './FibbageGame'
import HerdGame from './HerdGame'
import TriviaGame from './TriviaGame'
import SpyfairGame from './SpyfairGame'
import SketchGame from './SketchGame'
import ProposalBanner from '../components/ProposalBanner'
import GameSwitcher from '../components/GameSwitcher'
import EmoteBar from '../components/EmoteBar'
import { isQuickChat } from '../lib/emotes'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ThemeSwitcher from '../components/ThemeSwitcher'
import RulesModal, { RulesButton } from '../components/RulesModal'
import {
  commitSeed, deriveSeed, generateSeedHex, rollFaceAsync, rollFacePairAsync,
} from '../lib/diceLogic'

const GAME_TTL_MS = 24 * 60 * 60 * 1000

// Real-time games where one round decides the match (page-level `matchWinner`
// already uses scores ≥ 1; the parent's matchTarget must agree so the
// "New Match" button supersedes "Play Again" once the round resolves).
const SINGLE_ROUND_GAMES = new Set(['tron', 'sumo', 'spaceduel'])

// Real-time custom arenas (M-05/M-24) — physics-driven games with their own
// dedicated page component, square/wide viewport-hungry courts, and a live
// score that keeps changing even while a modal hides the board.
const REALTIME_CUSTOM_GAMES = new Set(['pong', 'snake', 'tron', 'sumo', 'spaceduel'])

function toArray(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  return Object.values(val)
}

function playersToSeatList(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .map(p => ({ name: p.name, playerId: p.playerId, joinedAt: p.joinedAt || 0, avatar: p.avatar ?? null }))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

function buildSwitchUpdates(game, newType) {
  const newCfg = getGameConfig(newType)
  const seats = playersToSeatList(game.players)
  const base = {
    gameType: newType,
    ...freshGameState(newType),
    winner: null,
    winningLine: null,
    proposal: null,
    lastActivityAt: Date.now(),
  }
  if (newCfg.nPlayer) {
    const players = {}
    for (const s of seats) {
      players[s.playerId] = { name: s.name, playerId: s.playerId, joinedAt: s.joinedAt, online: true, avatar: s.avatar ?? null }
    }
    return { ...base, players, scores: {}, status: 'waiting' }
  }
  const players = {}
  if (seats[0]) players.X = { name: seats[0].name, playerId: seats[0].playerId, joinedAt: seats[0].joinedAt, avatar: seats[0].avatar ?? null }
  if (seats[1]) players.O = { name: seats[1].name, playerId: seats[1].playerId, joinedAt: seats[1].joinedAt, avatar: seats[1].avatar ?? null }
  return { ...base, players, scores: { X: 0, O: 0 }, status: seats.length >= 2 ? 'playing' : 'waiting' }
}

// M-64: after ~8s on a stalled room-join, surface a "still connecting" hint
// plus a way out instead of leaving a bare spinner with no escape.
function LoadingScreen() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ArcadeLoader variant="inline" />
      {slow && (
        <div className="flex flex-col items-center gap-2">
          <p className="font-pixel text-[10px] text-retro-dim tracking-wider">STILL CONNECTING…</p>
          <Link
            to="/"
            className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity inline-block p-3 -m-3"
          >
            CANCEL
          </Link>
        </div>
      )}
    </div>
  )
}

// Floating emoji reactions — one per sender/glyph/burst, positioned on the
// sender's side of the screen (X left, O right) so simultaneous reactions
// from both players never collide.
function EmoteFloats({ floats }) {
  return (
    <div className="fixed inset-x-0 top-1/3 z-50 pointer-events-none flex justify-center">
      {floats.map(f => (
        <div
          // re-keyed on count so a combo bump restarts the float animation —
          // otherwise the `forwards` fill leaves the element invisible while
          // its re-armed removal timer keeps it alive
          key={`${f.id}-${f.count}`}
          className={cn('absolute flex flex-col items-center gap-1', f.by === 'X' ? 'left-[16%]' : 'right-[16%]')}
          style={{ animation: 'emote-float 2s ease-out forwards' }}
        >
          <div
            className="flex items-center gap-1"
            style={{ transform: `translateX(${f.dx}px) rotate(${f.rot}deg)` }}
          >
            {isQuickChat(f.glyph) ? (
              <span className="font-pixel text-xl text-retro-cta text-glow-cta whitespace-nowrap">{f.glyph}</span>
            ) : (
              <span className="text-6xl">{f.glyph}</span>
            )}
            {f.count > 1 && (
              <span
                key={f.count}
                className="font-pixel text-sm text-retro-cta text-glow-cta"
                style={{ animation: 'emote-pop 0.15s ease-out' }}
              >
                ×{f.count}
              </span>
            )}
          </div>
          {f.name && (
            <span className={cn(
              'font-pixel text-[8px]',
              f.by === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2'
            )}>
              {f.name}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// M-22: lightweight in-app confirm for an intercepted back-gesture / "← HOME"
// tap during an active match — full-screen so a fast edge-swipe can't miss
// it, same danger-toned vocabulary as the rest of the app's destructive
// confirmations. Rendered above everything else, including modal backdrops.
function LeaveMatchConfirm({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-retro-card border-2 border-retro-danger/60 rounded p-5 text-center space-y-4">
        <p className="font-pixel text-[11px] text-retro-danger text-glow-danger tracking-widest">LEAVE MATCH?</p>
        <p className="font-mono text-[11px] text-retro-dim leading-relaxed">YOU&apos;LL LEAVE THE ROUND MID-PLAY.</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1/50 transition-all active:scale-95"
          >
            STAY
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-retro-danger text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-danger transition-all active:scale-95"
          >
            LEAVE
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Game() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorGameType, setErrorGameType] = useState(null)
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectWinner, setWinEffectWinner] = useState(null)
  const [winEffectIntensity, setWinEffectIntensity] = useState('round')
  const [floats, setFloats] = useState([])
  const prevEmoteTs = useRef(0)
  const emoteInit = useRef(false)
  const emoteIdRef = useRef(0)
  const emoteTimeouts = useRef(new Map())
  const emoteReadyAt = useRef(0)
  const [emoteCooldown, setEmoteCooldown] = useState(false)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const [showRules, setShowRules] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showAbandonBanner, setShowAbandonBanner] = useState(false)
  const [claimingWin, setClaimingWin] = useState(false)
  const [needName, setNeedName] = useState(false)
  const [nameVersion, setNameVersion] = useState(0)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  // mySymbol (ref) is the source of truth read inside effects/handlers/async
  // callbacks; mySeat (state) mirrors it for reads during render, since a ref
  // read during render isn't guaranteed to reflect the latest value. Every
  // write goes through assignSeat() to keep the two in lockstep. All writes
  // happen synchronously within the init() async flow in the effect below,
  // before that same flow's first setGame — so a render can never observe
  // `game` populated while `mySeat` is still stale.
  const mySymbol = useRef(null)
  const [mySeat, setMySeat] = useState(null)
  const assignSeat = (s) => { mySymbol.current = s; setMySeat(s) }
  const prevStatus = useRef(null)
  const prevTurn = useRef(null)
  const prevFilledCount = useRef(0)
  const prevDiceLast = useRef(null)
  const prevDiceTurnScore = useRef(0)
  const prevDiceRollIndex = useRef(0)
  const prevBlockadeMoves = useRef(0)
  const diceSeedARef = useRef(null) // X's local seedA (sessionStorage-backed)
  const prevProposal = useRef(null)
  const nPlayerCleanup = useRef(null)
  const moveInFlight = useRef(false)
  const blockedMoveFeedbackAt = useRef(0)
  const spectatorToastShown = useRef(false)
  const abandonTimerRef = useRef(null)

  // Firebase init: join room, set up listeners, set up presence
  useEffect(() => {
    if (configError || !db) {
      // configError/db are module-level constants set once at import time
      // (see src/lib/firebase.js) — this is a one-time sync of that static
      // condition into state on mount, not a reactive cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(configError || 'Firebase is not configured.')
      setLoading(false)
      return
    }

    const playerName = localStorage.getItem('playerName')
    if (!playerName) {
      setNeedName(true)
      setLoading(false)
      return
    }
    const playerAvatar = localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())

    const gameRef = ref(db, `games/${gameId}`)
    let cancelled = false
    let unsubGame = null
    let unsubPresence = null
    let unsubOpPresence = null

    const init = async () => {
      let snap
      try { snap = await get(gameRef) }
      catch {
        if (!cancelled) { setError('CONNECTION ERROR. CHECK YOUR NETWORK.'); setLoading(false) }
        return
      }

      if (cancelled) return

      if (!snap.exists()) {
        setError('GAME NOT FOUND — CODE MAY BE WRONG OR GAME HAS EXPIRED.')
        setLoading(false)
        return
      }

      const data = snap.val()

      const lastActive = data.lastActivityAt ?? data.createdAt
      if (lastActive && Date.now() - lastActive > GAME_TTL_MS) {
        setErrorGameType(data.gameType || null)
        setError('THIS GAME HAS EXPIRED. CREATE A NEW ONE!')
        setLoading(false)
        return
      }

      const cfgData = getGameConfig(data.gameType)
      if (cfgData.nPlayer) {
        const myId = getPlayerId()
        let amPlayer = !!data.players?.[myId]
        if (amPlayer) {
          try { await update(ref(db, `games/${gameId}/players/${myId}`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (data.status === 'waiting' && Object.keys(data.players || {}).length < (cfgData.maxPlayers || 8)) {
          try {
            const { committed } = await runTransaction(
              ref(db, `games/${gameId}/players/${myId}`),
              cur => { if (cur) return; return { name: playerName, joinedAt: Date.now(), playerId: myId, online: true, avatar: playerAvatar } }
            )
            amPlayer = committed
          } catch { amPlayer = false }
        }
        if (cancelled) return
        setLoading(false)
        if (amPlayer) recordRoom({ id: gameId, gameType: data.gameType })
        unsubGame = onValue(gameRef, snap => { if (!cancelled && snap.exists()) setGame(snap.val()) })
        if (amPlayer) {
          const presRef = ref(db, `games/${gameId}/players/${myId}/online`)
          unsubPresence = onValue(ref(db, '.info/connected'), snap => {
            if (cancelled || !snap.val()) return
            onDisconnect(presRef).set(false)
            dbSet(presRef, true)
          })
          nPlayerCleanup.current = myId
        }
        return
      }

      const stored = sessionStorage.getItem(`game-${gameId}`)

      if (stored && JSON.parse(stored).symbol) {
        // 1. Valid sessionStorage record
        assignSeat(JSON.parse(stored).symbol)
      } else {
        // 2. Try playerId reclaim
        const myId = getPlayerId()
        if (data.players?.X?.playerId === myId) {
          assignSeat('X')
          sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
          try { await update(ref(db, `games/${gameId}/players/X`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (data.players?.O?.playerId === myId) {
          assignSeat('O')
          sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'O', name: playerName }))
          try { await update(ref(db, `games/${gameId}/players/O`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (!data.players?.O) {
          // 3. Claim O slot via transaction
          try {
            const { committed } = await runTransaction(
              ref(db, `games/${gameId}/players/O`),
              current => {
                if (current !== null) return
                return { name: playerName, joinedAt: Date.now(), playerId: getPlayerId(), avatar: playerAvatar }
              }
            )
            if (committed) {
              assignSeat('O')
              sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'O', name: playerName }))
              const joinUpdates = { status: 'playing' }
              if (data.gameType === 'hangwoman') {
                joinUpdates['round/setter'] = 'X'
                joinUpdates['round/phase'] = 'setting'
                joinUpdates['round/wrongCount'] = 0
              }
              await update(gameRef, joinUpdates)
            } else {
              assignSeat(null)
              sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: null }))
              // We lost the race for O — someone else's write committed first.
              // Mark the generic full-room notice as already shown so it doesn't
              // also fire once `game` reflects both seats filled.
              spectatorToastShown.current = true
              toast("SEAT TAKEN — YOU'RE SPECTATING")
            }
          } catch { assignSeat(null) }
        } else {
          // 4. Spectator
          assignSeat(null)
        }
      }

      if (cancelled) return
      setLoading(false)
      if (mySymbol.current) recordRoom({ id: gameId, gameType: data.gameType })

      unsubGame = onValue(gameRef, snap => {
        if (!cancelled && snap.exists()) setGame(snap.val())
      })

      // Presence — players only, not spectators
      if (mySymbol.current) {
        const presRef = ref(db, `games/${gameId}/presence/${mySymbol.current}`)

        unsubPresence = onValue(ref(db, '.info/connected'), snap => {
          if (cancelled || !snap.val()) return
          onDisconnect(presRef).set({ online: false })
          dbSet(presRef, { online: true })
        })

        const opSym = mySymbol.current === 'X' ? 'O' : 'X'
        unsubOpPresence = onValue(ref(db, `games/${gameId}/presence/${opSym}`), snap => {
          if (cancelled) return
          const d = snap.val()
          setOpponentOnline(!d || d.online !== false)
        })
      }
    }

    init()

    return () => {
      cancelled = true
      if (unsubGame) unsubGame()
      if (unsubPresence) unsubPresence()
      if (unsubOpPresence) unsubOpPresence()
      // Mark offline on clean unmount (tab navigation)
      if (nPlayerCleanup.current && db) {
        const presRef = ref(db, `games/${gameId}/players/${nPlayerCleanup.current}/online`)
        onDisconnect(presRef).cancel().catch(() => {})
        dbSet(presRef, false).catch(() => {})
      } else if (mySymbol.current && db) {
        const presRef = ref(db, `games/${gameId}/presence/${mySymbol.current}`)
        onDisconnect(presRef).cancel().catch(() => {})
        dbSet(presRef, { online: false }).catch(() => {})
      }
    }
  }, [gameId, nameVersion])

  // Sounds + win effect — react to game state changes
  useEffect(() => {
    if (!game) return

    if (getGameConfig(game.gameType).nPlayer) {
      prevStatus.current = game.status
      return
    }

    if (prevStatus.current === 'waiting' && game.status === 'playing') {
      sounds.join()
    }

    if (prevStatus.current === 'playing' && game.status === 'finished') {
      const w = game.winner
      const sx = game.scores?.X || 0
      const so = game.scores?.O || 0
      const matchTarget = game.gameType === 'pong' ? (game.matchLength ?? 3)
        : SINGLE_ROUND_GAMES.has(game.gameType) ? 1 : 3
      const isMatch = sx >= matchTarget || so >= matchTarget
      if (w === 'draw') sounds.draw()
      else if (w === mySymbol.current) (isMatch ? sounds.matchWin() : sounds.win())
      else if (mySymbol.current) sounds.lose()
      setWinEffectWinner(w)
      setWinEffectIntensity(isMatch ? 'match' : 'round')
      setShowWinEffect(true)
      if (isMatch && mySymbol.current) {
        const opSym = mySymbol.current === 'X' ? 'O' : 'X'
        recordMatch({
          gameType: game.gameType,
          won: w === mySymbol.current,
          opponentName: game.players?.[opSym]?.name,
          opponentUid: game.players?.[opSym]?.playerId,
        })
      }
    }

    const cfg = getGameConfig(game.gameType)
    const filledCount = cfg.boardSize ? normalizeBoard(game.board, cfg.boardSize).filter(Boolean).length : 0

    if (cfg.applyMove) {
      const isPigType = cfg.type === 'dice' || cfg.type === 'dice-big'
      if (isPigType) {
        // Pig is boardless (filledCount always 0): detect an opponent action
        // by tracking the die roll index + turn score, and verify the roll
        // face against the deterministic seed (anti-cheat, see diceLogic.js).
        const opp = prevTurn.current && prevTurn.current !== mySymbol.current
        const rolled = (game.diceRollIndex ?? 0) > prevDiceRollIndex.current
        const bankedOrBust = (game.diceTurnScore ?? 0) === 0
          && prevDiceTurnScore.current > 0
          && JSON.stringify(game.diceLast) !== JSON.stringify(prevDiceLast.current)
        const isBust = Array.isArray(game.diceLast)
          ? game.diceLast[0] === 1 && game.diceLast[1] === 1
          : game.diceLast === 1
        if (game.status === 'playing' && opp && (rolled || bankedOrBust)) {
          if (isBust) sounds.bust()
          else sounds.move(prevTurn.current)
        }
        // Verify a deterministic roll (only meaningful once diceSeed is set).
        if (rolled && game.diceSeed && game.diceLast != null) {
          const idx = (game.diceRollIndex ?? 0) - 1
          const verify = cfg.type === 'dice-big'
            ? rollFacePairAsync(game.diceSeed, idx).then(expected => JSON.stringify(expected) !== JSON.stringify(game.diceLast))
            : rollFaceAsync(game.diceSeed, idx).then(expected => expected !== game.diceLast)
          verify.then(mismatch => {
            if (mismatch) toast.error('ROLL MISMATCH — TAMPERING SUSPECTED')
          }).catch(() => {})
        }
      } else if (cfg.type === 'blockade') {
        // Blockade: pawn moves never touch `board` (only wall placements do),
        // so filledCount can't detect them — track blockadeMoves instead.
        if (
          game.status === 'playing' &&
          (game.blockadeMoves ?? 0) > prevBlockadeMoves.current &&
          prevTurn.current &&
          prevTurn.current !== mySymbol.current
        ) {
          sounds.move(prevTurn.current)
        }
      } else {
        // Other applyMove games: detect opponent moves by filled count increase
        if (
          game.status === 'playing' &&
          filledCount > prevFilledCount.current &&
          prevTurn.current &&
          prevTurn.current !== mySymbol.current
        ) {
          sounds.move(prevTurn.current)
        }
      }
    } else {
      // Standard games: opponent's move = turn flipped to mine
      if (
        game.status === 'playing' &&
        prevTurn.current &&
        game.currentTurn !== prevTurn.current &&
        game.currentTurn === mySymbol.current
      ) {
        sounds.move(prevTurn.current)
      }
    }

    prevStatus.current = game.status
    prevTurn.current = game.currentTurn
    prevFilledCount.current = filledCount
    prevDiceLast.current = game.diceLast ?? null
    prevDiceTurnScore.current = game.diceTurnScore ?? 0
    prevDiceRollIndex.current = game.diceRollIndex ?? 0
    prevBlockadeMoves.current = game.blockadeMoves ?? 0
  }, [game])

  // Proposal effect — sound + declined toast
  useEffect(() => {
    if (!game) return
    const proposal = game.proposal ?? null

    // Opponent newly proposed — play join sound
    if (
      proposal &&
      !proposal.declined &&
      proposal.by !== mySymbol.current &&
      mySymbol.current &&
      !prevProposal.current
    ) {
      sounds.join()
    }

    // Opponent declined my proposal (guard: only on the transition to declined)
    if (
      proposal &&
      proposal.declined &&
      proposal.by === mySymbol.current &&
      !prevProposal.current?.declined
    ) {
      const opSym = mySymbol.current === 'X' ? 'O' : 'X'
      const opName = (game.players?.[opSym]?.name || opSym).toUpperCase()
      toast.error(`${opName} DECLINED`)
      update(ref(db, `games/${gameId}`), { proposal: null }).catch(() => {})
    }

    prevProposal.current = proposal
  }, [game, gameId])

  // Push a reaction onto the floats array — appends a new float, or (within
  // 1.5s of the same glyph from the same sender) bumps the existing float's
  // combo count and re-arms its removal timer.
  const pushEmote = (e) => {
    const name = game?.players?.[e.by]?.name ?? ''
    e.glyph === '🤫' ? sounds.shh() : sounds.emote()
    setFloats(prev => {
      const last = prev[prev.length - 1]
      const now = Date.now()
      if (last && last.glyph === e.glyph && last.by === e.by && now - last.at < 1500) {
        const existing = emoteTimeouts.current.get(last.id)
        if (existing) clearTimeout(existing)
        const t = setTimeout(() => {
          setFloats(f => f.filter(fl => fl.id !== last.id))
          emoteTimeouts.current.delete(last.id)
        }, 2000)
        emoteTimeouts.current.set(last.id, t)
        return prev.map(fl => (fl.id === last.id ? { ...fl, count: fl.count + 1, at: now } : fl))
      }
      const id = ++emoteIdRef.current
      const dx = Math.round((Math.random() * 2 - 1) * 24)
      const rot = Math.round((Math.random() * 2 - 1) * 10)
      const float = { id, glyph: e.glyph, by: e.by, name, count: 1, dx, rot, at: now }
      const t = setTimeout(() => {
        setFloats(f => f.filter(fl => fl.id !== id))
        emoteTimeouts.current.delete(id)
      }, 2000)
      emoteTimeouts.current.set(id, t)
      return [...prev, float]
    })
  }

  // Clear any pending float-removal timers on unmount
  useEffect(() => {
    const timeouts = emoteTimeouts.current
    return () => {
      timeouts.forEach(t => clearTimeout(t))
      timeouts.clear()
    }
  }, [])

  // Emote channel — float a newly-received reaction (skip the stale one present on join)
  useEffect(() => {
    const e = game?.emote
    if (!emoteInit.current) {
      emoteInit.current = true
      prevEmoteTs.current = e?.ts || 0
      return
    }
    if (!e || !e.ts || e.ts === prevEmoteTs.current) return
    prevEmoteTs.current = e.ts
    pushEmote(e)
    // game?.emote and pushEmote are deliberately omitted: this effect only
    // needs to fire when a NEW emote lands (ts changes) — by the time it
    // runs, `e`/`pushEmote` are already the values from that same render, so
    // omitting them causes no staleness. Depending on the whole `game?.emote`
    // object would refire on every unrelated Firebase snapshot instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.emote?.ts])

  // A fresh snapshot means React state has caught up with the last write —
  // safe to accept the next move (see moveInFlight in handleMove).
  useEffect(() => {
    moveInFlight.current = false
  }, [game])

  // One-time spectator notice — fires only once, when a full 2-seat room
  // resolves us to a spectator (never for the never-seated-but-empty-room case).
  useEffect(() => {
    if (!game || spectatorToastShown.current) return
    if (!mySymbol.current && game.players?.X && game.players?.O) {
      spectatorToastShown.current = true
      toast("ROOM'S FULL — YOU'RE SPECTATING")
    }
  }, [game])

  // Abandoned-opponent recovery (F-23) — after 120s of CONTINUOUS opponent
  // offline time in a standard 2P turn-based round, offer claim-win / invite
  // / go-home instead of leaving the board interactive forever. Restarts the
  // window (not cumulative) on any presence flap, and clears on every
  // status/gameType change (round end, rematch, switch) so it never fires stale.
  const hasPlayerX = !!game?.players?.X
  const hasPlayerO = !!game?.players?.O
  useEffect(() => {
    if (abandonTimerRef.current) { clearTimeout(abandonTimerRef.current); abandonTimerRef.current = null }
    // Reset is intentionally synchronous and unconditional here — it must
    // clear on every dep change (round end, rematch, switch) before the
    // guards below decide whether to re-arm the timer, so a stale banner
    // never lingers into a new round.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAbandonBanner(false)

    if (!game || !mySymbol.current) return
    const gcfg = getGameConfig(game.gameType)
    if (gcfg.nPlayer || gcfg.custom) return
    if (game.status !== 'playing') return
    const opSym = mySymbol.current === 'X' ? 'O' : 'X'
    if (!game.players?.[opSym]) return
    if (opponentOnline) return

    abandonTimerRef.current = setTimeout(() => setShowAbandonBanner(true), 120_000)
    return () => {
      if (abandonTimerRef.current) { clearTimeout(abandonTimerRef.current); abandonTimerRef.current = null }
    }
    // `game` is deliberately omitted — depending on the whole object would
    // restart this 120s window on every move/turn flip, not just on the
    // gameType/status/presence transitions that should actually reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.gameType, game?.status, opponentOnline, hasPlayerX, hasPlayerO])

  // Pig anti-cheat: coin-flipping protocol to establish a shared deterministic
  // roll seed (see src/lib/diceLogic.js). X commits seedA, O contributes seedB,
  // X reveals seedA, both derive diceSeed. Runs only for gameType 'dice'.
  const coinFlipStarted = useRef(false)
  useEffect(() => {
    if (!game || game.gameType !== 'dice' || game.status !== 'playing') return
    if (!mySymbol.current) return
    const sym = mySymbol.current
    const SK = `pig-seedA-${gameId}`

    // Reset the one-shot gate when the protocol state has been fully cleared
    // (e.g. a "play again" reset) so the coin flip can run again.
    if (!game.diceSeedCommitX && !game.diceSeedB && !game.diceSeedRevealX && !game.diceSeed) {
      coinFlipStarted.current = false
    }

    ;(async () => {
      const gameRef = ref(db, `games/${gameId}`)
      // Step 1 — X commits seedA (once both seats are present).
      if (sym === 'X' && !game.diceSeedCommitX && game.players?.O && !coinFlipStarted.current) {
        coinFlipStarted.current = true
        const seedA = generateSeedHex()
        try { sessionStorage.setItem(SK, seedA) } catch { /* private mode */ }
        diceSeedARef.current = seedA
        const hash = await commitSeed(seedA)
        await update(gameRef, { diceSeedCommitX: hash }).catch(() => {})
        return
      }
      // Step 2 — O contributes seedB once the commit is on the wire.
      if (sym === 'O' && game.diceSeedCommitX && !game.diceSeedB && !coinFlipStarted.current) {
        coinFlipStarted.current = true
        const seedB = generateSeedHex()
        await update(gameRef, { diceSeedB: seedB }).catch(() => {})
        return
      }
      // Step 3 — X reveals seedA once O has contributed.
      if (sym === 'X' && game.diceSeedCommitX && game.diceSeedB && !game.diceSeedRevealX) {
        let seedA = ''
        try { seedA = sessionStorage.getItem(SK) || '' } catch { /* */ }
        if (!seedA) seedA = diceSeedARef.current || ''
        if (seedA) {
          // Verify our local seedA still matches the published commit; if a
          // same-tab reload wiped sessionStorage we cannot soundly reveal.
          const hash = await commitSeed(seedA)
          if (hash !== game.diceSeedCommitX) return
          await update(gameRef, { diceSeedRevealX: seedA }).catch(() => {})
        }
        return
      }
      // Step 4 — host (X) derives and publishes diceSeed once both halves exist.
      if (sym === 'X' && game.diceSeedRevealX && game.diceSeedB && !game.diceSeed) {
        const seed = await deriveSeed(game.diceSeedRevealX, game.diceSeedB)
        await update(gameRef, { diceSeed: seed }).catch(() => {})
        return
      }
    })()
  }, [game, gameId])

  // M-22: is this client a seated player in a currently-live round? Covers
  // both game families — 2P `mySeat` and n-player uid-keyed `players`.
  // Spectators are never guarded (nothing of theirs to lose).
  const isActivePlay = !!game && game.status === 'playing' && (
    getGameConfig(game.gameType).nPlayer
      ? !!game.players?.[getPlayerId()]
      : !!mySeat
  )

  // M-22: guard the browser back gesture / iOS edge-swipe during an active
  // match instead of silently ejecting the seated player. Pushes one history
  // marker for the whole "playing" window; overlays (Rules/Invite/Switcher)
  // push their own marker on top via useModalHistory, so a back-gesture while
  // one is open just closes that overlay (its own listener fires unconditionally)
  // — this listener only reacts once ITS marker is the one actually consumed,
  // i.e. it lets the topmost pushed state win. On a genuine pop past our
  // marker we can't veto the browser's already-applied history change, so we
  // re-push the marker (undoing the URL/entry effect) and surface the confirm
  // instead; confirming does a normal client-side navigate('/') rather than
  // trying to replay the exact number of back-steps.
  useEffect(() => {
    if (!isActivePlay) return
    window.history.pushState({ matchGuard: true }, '')

    const onPopState = (e) => {
      if (e.state && (e.state.matchGuard || e.state.modalHistory)) return
      window.history.pushState({ matchGuard: true }, '')
      setShowLeaveConfirm(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isActivePlay, gameId])

  const cancelLeaveMatch = () => setShowLeaveConfirm(false)
  const confirmLeaveMatch = () => {
    setShowLeaveConfirm(false)
    navigate('/')
  }
  const handleHomeLinkClick = (e) => {
    if (isActivePlay) {
      e.preventDefault()
      setShowLeaveConfirm(true)
    }
  }

  // M-15: a blocked tap (not your turn / round not live) otherwise resolves
  // silently on touch, which has no hover state to pre-sense a disabled
  // board. Throttled to ~1s so rapid taps during the opponent's turn don't
  // spam toasts/haptics.
  const blockedMoveFeedback = () => {
    const now = Date.now()
    if (now - blockedMoveFeedbackAt.current < 1000) return
    blockedMoveFeedbackAt.current = now
    toast.error('NOT YOUR TURN')
    navigator.vibrate?.(30)
  }

  const handleMove = async (colOrIndex) => {
    if (!game || !mySymbol.current) return
    if (moveInFlight.current) return // a write is pending — ignore rapid re-taps
    if (game.status !== 'playing') { blockedMoveFeedback(); return }
    if (game.currentTurn !== mySymbol.current) { blockedMoveFeedback(); return }

    const cfg = getGameConfig(game.gameType)
    if (cfg.custom) return
    // Pig: the deterministic roll seed must be established before any roll so
    // no client can fall back to insecure Math.random(). Banks are seedless.
    const isPig = (t) => t === 'dice' || t === 'dice-big'
    if (isPig(cfg.type) && colOrIndex === 'roll' && !game.diceSeed) return
    const board = normalizeBoard(game.board, cfg.boardSize)
    const index = cfg.getMoveIndex(board, colOrIndex)
    if (index === -1) return

    // For Pig, precompute the deterministic die face (async) from the shared
    // seed so applyDiceMove can stay synchronous (the demo/bot harness calls
    // it without a face, falling back to Math.random which is fine vs a bot).
    let movePayload = colOrIndex
    if (isPig(cfg.type)) {
      let face
      if (colOrIndex === 'roll' && game.diceSeed) {
        face = cfg.type === 'dice-big'
          ? await rollFacePairAsync(game.diceSeed, game.diceRollIndex ?? 0)
          : await rollFaceAsync(game.diceSeed, game.diceRollIndex ?? 0)
      }
      movePayload = { action: colOrIndex, face }
    }

    let updates, result
    if (cfg.applyMove) {
      const applied = cfg.applyMove({ board, game, index, move: movePayload, symbol: mySymbol.current })
      if (!applied) return
      updates = applied.updates
      result = applied.result
    } else {
      const newBoard = [...board]
      newBoard[index] = mySymbol.current
      result = cfg.getWinner(newBoard)
      updates = { board: newBoard, currentTurn: mySymbol.current === 'X' ? 'O' : 'X' }
    }

    // M-47: persist the cell/edge just played so boards can render a lasting
    // marker after the placement animation ends. Board-array games only —
    // boardless games (dice/simon/visualmemory) have no cell grid to mark.
    // A hook that already set its own lastMove wins.
    if (cfg.boardSize > 0 && updates.lastMove === undefined) updates.lastMove = index

    // Block re-entry until the write settles or the next snapshot lands — the
    // turn guard above reads React state, which lags the synchronous local
    // Firebase echo, so a fast second tap could recompute from the pre-tap board.
    moveInFlight.current = true

    const isBustMove = isPig(cfg.type) && (Array.isArray(updates.diceLast) ? updates.diceLast[0] === 1 && updates.diceLast[1] === 1 : updates.diceLast === 1)
    if (isBustMove) {
      sounds.bust()
    } else {
      sounds.move(mySymbol.current)
    }

    if (result) {
      updates.winner = result.winner
      updates.status = 'finished'
      if (result.line?.length) updates.winningLine = result.line
      if (result.winner !== 'draw') {
        updates[`scores/${result.winner}`] = (game.scores?.[result.winner] || 0) + 1
      }
    }

    updates.lastActivityAt = Date.now()
    try { await update(ref(db, `games/${gameId}`), updates) }
    catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
    finally { moveInFlight.current = false }
  }

  // Apply functions (called directly when no second player / opponent offline)
  const applyPlayAgain = async () => {
    try {
      await update(ref(db, `games/${gameId}`), {
        ...freshGameState(game.gameType),
        status: 'playing',
        winner: null,
        winningLine: null,
        proposal: null,
        lastActivityAt: Date.now(),
      })
    } catch { toast.error('PLAY AGAIN FAILED — CHECK CONNECTION') }
  }

  const applyNewMatch = async () => {
    try {
      await update(ref(db, `games/${gameId}`), {
        ...freshGameState(game.gameType),
        status: 'playing',
        winner: null,
        winningLine: null,
        'scores/X': 0,
        'scores/O': 0,
        proposal: null,
        lastActivityAt: Date.now(),
      })
    } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION') }
  }

  const applySwitchGame = async (newType) => {
    sessionStorage.removeItem(`hangwoman-word-${gameId}`)
    try {
      await update(ref(db, `games/${gameId}`), buildSwitchUpdates(game, newType))
      recordPlay(newType, 'multi')
    } catch { toast.error('SWITCH FAILED — CHECK CONNECTION') }
  }

  // --- N-player (party game) actions ---
  const handleNStart = async () => {
    const cfg = getGameConfig(game.gameType)
    const sr = cfg.startRound ? cfg.startRound(game.players || {}) : null
    if (!sr) return // spyfair drives its own start
    try {
      await update(ref(db, `games/${gameId}`), {
        status: 'playing', winner: null, ...sr, proposal: null, lastActivityAt: Date.now(),
      })
    } catch { toast.error('START FAILED — CHECK CONNECTION') }
  }

  const applyNNewMatch = async () => {
    try {
      await update(ref(db, `games/${gameId}`), {
        ...freshGameState(game.gameType),
        status: 'waiting', winner: null, scores: {}, proposal: null, lastActivityAt: Date.now(),
      })
    } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION') }
  }

  // Propose or apply directly (if solo / opponent offline)
  const propose = async (action, gameType = null) => {
    if (!game || !mySymbol.current) return
    if (!game.players?.O || opponentOnline === false) {
      if (action === 'playAgain') return applyPlayAgain()
      if (action === 'newMatch') return applyNewMatch()
      if (action === 'switch') return applySwitchGame(gameType)
    }
    try {
      await update(ref(db, `games/${gameId}`), {
        proposal: { action, gameType, by: mySymbol.current, declined: false },
      })
    } catch { toast.error('PROPOSAL FAILED — CHECK CONNECTION') }
  }

  const acceptProposal = async () => {
    if (!game?.proposal) return
    const { action, gameType: gt } = game.proposal
    if (action === 'playAgain') return applyPlayAgain()
    if (action === 'newMatch') return applyNewMatch()
    if (action === 'switch') return applySwitchGame(gt)
  }

  const declineProposal = async () => {
    try {
      await update(ref(db, `games/${gameId}`), { 'proposal/declined': true })
    } catch { toast.error('DECLINE FAILED — CHECK CONNECTION') }
  }

  const cancelProposal = async () => {
    try {
      await update(ref(db, `games/${gameId}`), { proposal: null })
    } catch { toast.error('CANCEL FAILED — CHECK CONNECTION') }
  }

  // F-23 claim-win — same finish shape as a normal round win (winner + score
  // bump on the standard `games/{id}` node), so the existing win-effect/
  // recordMatch machinery fires on both clients unmodified. Wrapped in a
  // transaction that re-reads status/presence server-side so a last-second
  // reconnect-and-move from the opponent can't be clobbered.
  const claimAbandonedWin = async () => {
    if (!game || !mySymbol.current || claimingWin) return
    const mySym = mySymbol.current
    const opSym = mySym === 'X' ? 'O' : 'X'
    setClaimingWin(true)
    try {
      const { committed } = await runTransaction(ref(db, `games/${gameId}`), cur => {
        if (!cur || cur.status !== 'playing') return
        const presenceOp = cur.presence?.[opSym]
        const stillOffline = presenceOp && presenceOp.online === false
        if (!stillOffline) return
        return {
          ...cur,
          winner: mySym,
          status: 'finished',
          scores: { ...(cur.scores || {}), [mySym]: (cur.scores?.[mySym] || 0) + 1 },
          lastActivityAt: Date.now(),
        }
      })
      if (!committed) toast.error("COULDN'T CLAIM — OPPONENT MAY BE BACK")
    } catch { toast.error('CLAIM FAILED — CHECK CONNECTION') }
    finally { setClaimingWin(false) }
  }

  // Create a fresh room of the given type (used by dead-end error screens and
  // the spectator "start your own room" CTA) — a trimmed replica of Home.jsx's
  // createGame, since Home.jsx is off-limits to import from here.
  const createNewRoom = async (gameType) => {
    const playerName = localStorage.getItem('playerName')
    if (!playerName) { navigate('/'); return }
    const playerAvatar = localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
    setCreatingRoom(true)
    try {
      const newId = generateGameId()
      const myId = getPlayerId()
      const cfg = getGameConfig(gameType)
      const now = Date.now()
      const gameData = cfg.nPlayer
        ? {
          gameType,
          status: 'waiting',
          scores: {},
          createdAt: now,
          lastActivityAt: now,
          players: { [myId]: { name: playerName, joinedAt: now, playerId: myId, online: true, avatar: playerAvatar } },
          ...freshGameState(gameType),
        }
        : {
          gameType,
          status: 'waiting',
          scores: { X: 0, O: 0 },
          createdAt: now,
          lastActivityAt: now,
          players: { X: { name: playerName, joinedAt: now, playerId: myId, avatar: playerAvatar } },
          ...freshGameState(gameType),
        }
      await dbSet(ref(db, `games/${newId}`), gameData)
      recordPlay(gameType, 'multi')
      if (!cfg.nPlayer) {
        sessionStorage.setItem(`game-${newId}`, JSON.stringify({ symbol: 'X', name: playerName }))
      }
      recordRoom({ id: newId, gameType })
      navigate(`/game/${newId}`)
    } catch {
      toast.error('CONNECTION ERROR. TRY AGAIN.')
      setCreatingRoom(false)
    }
  }

  const toggleMute = () => setMuted(sounds.toggle())

  const sendEmote = async (glyph) => {
    if (!mySymbol.current) return
    // sendEmote only ever runs from an onClick handler, never during render;
    // the compiler's static analysis can't see that, hence the disable.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    if (now < emoteReadyAt.current) return
    emoteReadyAt.current = now + 600
    setEmoteCooldown(true)
    setTimeout(() => setEmoteCooldown(false), 600)

    prevEmoteTs.current = now
    pushEmote({ by: mySymbol.current, glyph, ts: now })
    try {
      await update(ref(db, `games/${gameId}`), { emote: { by: mySymbol.current, glyph, ts: now } })
    } catch { /* ignore */ }
  }

  // Feature A — name prompt for invited players
  if (needName) {
    const handleNameSubmit = () => {
      const trimmed = nameInput.trim()
      if (!trimmed) { setNameError('ENTER YOUR NAME FIRST'); return }
      localStorage.setItem('playerName', trimmed)
      setNeedName(false)
      setLoading(true)
      setNameVersion(v => v + 1)
    }

    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h2 className="font-pixel text-sm text-retro-cta text-glow-cta">YOU&apos;RE INVITED!</h2>
          <p className="font-mono text-xs text-retro-dim">
            ROOM <span className="text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
          </p>
          <input
            type="text"
            placeholder="PLAYER ONE"
            value={nameInput}
            onChange={e => { setNameInput(e.target.value); setNameError('') }}
            onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
            maxLength={20}
            aria-label="Your name"
            className="w-full bg-retro-card border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest placeholder-retro-border rounded px-4 py-3 focus:outline-none focus:border-retro-p1 transition-colors"
          />
          {nameError && (
            <p className="font-pixel text-[10px] text-retro-p2">{nameError}</p>
          )}
          <button
            onClick={handleNameSubmit}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            JOIN GAME
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <LoadingScreen />

  if (error) {
    const errorCfg = errorGameType ? getGameConfig(errorGameType) : null
    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="font-pixel text-[10px] text-retro-p2 text-center max-w-xs leading-relaxed">{error}</p>
        {errorCfg && (
          <button
            onClick={() => createNewRoom(errorGameType)}
            disabled={creatingRoom}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {creatingRoom ? 'CREATING…' : `START A NEW ${errorCfg.label} ROOM`}
          </button>
        )}
        <Link to="/" className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity inline-block p-3 -m-3">
          ← BACK TO HOME
        </Link>
      </div>
    )
  }

  if (!game) return <LoadingScreen />

  const cfg = getGameConfig(game.gameType)
  const isCustom = !!cfg.custom

  // Family-mismatch guard — a cross-family switch (party ⇄ 2P) reshapes the
  // players node (uid keys vs 'X'/'O'), leaving every client seatless. The
  // in-room picker filters those switches out, but stale clients or rooms
  // switched before that fix can still land here — show a clear error instead
  // of a silently dead board. (uids are long random strings, never 'X'/'O'.)
  const seatKeys = Object.keys(game.players || {})
  const familyMismatch = cfg.nPlayer
    ? !!(game.players?.X || game.players?.O)
    : seatKeys.length > 0 && !game.players.X && !game.players.O
  if (familyMismatch) {
    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="font-pixel text-[10px] text-retro-p2 text-center max-w-xs leading-relaxed">
          THIS ROOM&apos;S GAME MODE CHANGED AND NO LONGER MATCHES ITS PLAYERS. START A FRESH GAME FROM HOME.
        </p>
        <Link to="/" className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity inline-block p-3 -m-3">
          ← BACK TO HOME
        </Link>
      </div>
    )
  }

  if (cfg.nPlayer) {
    const myUid = getPlayerId()
    const nplayers = game.players || {}
    const seatList = playersToSeatList(nplayers)
    const isHost = seatList[0]?.playerId === myUid
    const amSeated = !!nplayers[myUid]
    const nProps = {
      gameId, game, mySeat: myUid, players: nplayers, isHost,
      onStart: handleNStart,
      onSwitchGame: (t) => applySwitchGame(t),
      onNewMatch: applyNNewMatch,
      proposal: null,
    }
    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {showLeaveConfirm && (
          <LeaveMatchConfirm onConfirm={confirmLeaveMatch} onCancel={cancelLeaveMatch} />
        )}
        {showRules && (
          <RulesModal gameType={game.gameType} onClose={() => setShowRules(false)} />
        )}
        {floats.length > 0 && <EmoteFloats floats={floats} />}
        <div className={cn('w-full space-y-4', cfg.maxWidth)} key={game.gameType}>
          <div className="flex items-center justify-between">
            <Link to="/" onClick={handleHomeLinkClick} className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors inline-block p-3 -m-3">← HOME</Link>
            <div className="flex items-center gap-3">
              <ThemeSwitcher />
              <RulesButton onClick={() => setShowRules(true)} />
              {amSeated && game.status !== 'waiting' && (
                <GameSwitcher variant="icon" currentType={game.gameType} onSwitch={(t) => applySwitchGame(t)} />
              )}
              {amSeated && (
                <button
                  onClick={() => setShowInvite(true)}
                  title="Invite a friend"
                  aria-label="Invite a friend"
                  className="text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                  </svg>
                </button>
              )}
              <button
                onClick={toggleMute}
                title={muted ? 'Unmute sounds' : 'Mute sounds'}
                className="text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded"
              >
                {muted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Unmute">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Mute">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  </svg>
                )}
              </button>
              {cfg.badge && (
                <span className="font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded">{cfg.badge}</span>
              )}
              <span className="font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
            </div>
          </div>

          {game.gameType === 'wavelength' ? (
            <WavelengthGame {...nProps} />
          ) : game.gameType === 'fibbage' ? (
            <FibbageGame {...nProps} />
          ) : game.gameType === 'herd' ? (
            <HerdGame {...nProps} />
          ) : game.gameType === 'trivia' ? (
            <TriviaGame {...nProps} />
          ) : game.gameType === 'sketch' ? (
            <SketchGame {...nProps} />
          ) : (
            <SpyfairGame {...nProps} />
          )}

          {amSeated && game.status !== 'waiting' && (
            <EmoteBar onSend={sendEmote} cooldown={emoteCooldown} />
          )}
        </div>
        {showInvite && (
          <InviteFriendModal gameId={gameId} gameType={game.gameType} onClose={() => setShowInvite(false)} />
        )}
      </div>
    )
  }

  const board = isCustom ? [] : normalizeBoard(game.board, cfg.boardSize)
  const winningLine = toArray(game.winningLine)
  const isSpectator = !mySeat
  const opSym = mySeat === 'X' ? 'O' : 'X'
  const canMove = !isSpectator && game.status === 'playing' && game.currentTurn === mySeat
  // M-05/M-24: physics-driven arenas with their own dedicated page and a
  // score that keeps changing even while a modal covers the board.
  const isRealtimeCustom = REALTIME_CUSTOM_GAMES.has(game.gameType)
  const matchStillRunning = isRealtimeCustom && game.status === 'playing' && (showRules || showInvite)

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchTarget = game.gameType === 'pong' ? (game.matchLength ?? 3)
    : SINGLE_ROUND_GAMES.has(game.gameType) ? 1 : 3
  const matchWinner = scoreX >= matchTarget ? 'X' : scoreO >= matchTarget ? 'O' : null

  // Presence: show dot for players — green for me, live status for opponent
  const getPresence = (sym) => {
    if (isSpectator) return undefined
    if (sym === mySeat) return true
    return opponentOnline
  }

  // Proposal: hide action buttons while a proposal is pending (not declined by me)
  const activeProposal = game.proposal && !game.proposal.declined ? game.proposal : null

  // M-43: GameStatus renders round-end CTAs as a sticky bottom bar for
  // standard (non-custom) games once the round/match is over — reserve
  // matching space at the bottom of the page so it never covers content.
  const reservesStickyBar = !isCustom && game.status === 'finished'

  return (
    <div className={cn(
      'min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]',
      // M-05: on short/landscape viewports, real-time arenas need every
      // pixel of height back from the outer shell chrome.
      isRealtimeCustom && '[@media(max-height:420px)]:p-1.5 [@media(max-height:420px)]:pt-[max(0.375rem,env(safe-area-inset-top))] [@media(max-height:420px)]:pb-[max(0.375rem,env(safe-area-inset-bottom))]',
      reservesStickyBar && 'pb-24',
    )}>
      {showLeaveConfirm && (
        <LeaveMatchConfirm onConfirm={confirmLeaveMatch} onCancel={cancelLeaveMatch} />
      )}

      {/* M-24: modals hide a still-simulating real-time match — surface the
          live score so an invisible point swing isn't a surprise. */}
      {matchStillRunning && (
        <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] inset-x-0 z-[60] flex justify-center px-4 pointer-events-none">
          <div className="flex items-center gap-2 bg-retro-danger/90 border border-retro-danger text-retro-bg font-pixel text-[9px] tracking-widest px-3 py-2 rounded shadow-neon-danger">
            <span className="w-1.5 h-1.5 rounded-full bg-retro-bg animate-pulse" aria-hidden="true" />
            MATCH STILL RUNNING · {game.gameType === 'pong' ? `${game.pongScoreX ?? 0}–${game.pongScoreO ?? 0}` : `${scoreX}–${scoreO}`}
          </div>
        </div>
      )}

      {showWinEffect && (
        <WinEffect winner={winEffectWinner} intensity={winEffectIntensity} onDone={() => setShowWinEffect(false)} />
      )}

      {showRules && (
        <RulesModal gameType={game.gameType} onClose={() => setShowRules(false)} />
      )}

      {floats.length > 0 && <EmoteFloats floats={floats} />}

      <div className={cn(
        'w-full',
        // M-46: Chain Reaction's 8-row board is the tallest non-realtime
        // board — tighten the vertical rhythm so board+status still fit a
        // 667px viewport (iPhone SE) without pushing status off-screen.
        game.gameType === 'chainreaction' ? 'space-y-2' : 'space-y-4',
        cfg.maxWidth,
        isRealtimeCustom && '[@media(max-height:420px)]:space-y-1.5',
      )} key={game.gameType}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to="/" onClick={handleHomeLinkClick} className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors inline-block p-3 -m-3">
            ← HOME
          </Link>
          <div className={cn('flex items-center gap-3', isRealtimeCustom && '[@media(max-height:420px)]:gap-1.5')}>
            <ThemeSwitcher />
            <RulesButton onClick={() => setShowRules(true)} />
            {/* M-24: GameSwitcher opens its own full-screen sheet whose open
                state never surfaces to this component, so a live-score
                banner can't cover it — gate the trigger itself instead so a
                real-time match's physics/score can never keep changing
                invisibly behind an opened switcher. */}
            {!isSpectator && game.status !== 'waiting' && !activeProposal && !(isRealtimeCustom && game.status === 'playing') && (
              <GameSwitcher variant="icon" currentType={game.gameType} onSwitch={(t) => propose('switch', t)} />
            )}
            {!isSpectator && (
              <button
                onClick={() => setShowInvite(true)}
                title="Invite a friend"
                aria-label="Invite a friend"
                className="text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                </svg>
              </button>
            )}
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
              className="text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded"
            >
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Unmute">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/>
                  <line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Mute">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              )}
            </button>
            {cfg.badge && (
              <span className="font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded">{cfg.badge}</span>
            )}
            <span className="font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
          </div>
        </div>

        {/* Players — hidden on short/landscape real-time viewports (M-05):
            every real-time arena page already renders its own compact
            name/score readout above the court. Also hidden for custom games
            that render their own name/score UI (M-26, e.g. MathGame's
            ScoreBar) so the two readouts don't duplicate. */}
        {!cfg.hidePlayerCards && (
          <div className={cn('grid grid-cols-2 gap-2', isRealtimeCustom && '[@media(max-height:420px)]:hidden')}>
            <PlayerCard
              name={game.players?.X?.name}
              symbol="X"
              avatar={game.players?.X?.avatar}
              isActive={game.status === 'playing' && game.currentTurn === 'X'}
              isMe={mySeat === 'X'}
              score={scoreX}
              online={getPresence('X')}
            />
            <PlayerCard
              name={game.players?.O?.name}
              symbol="O"
              avatar={game.players?.O?.avatar}
              isActive={game.status === 'playing' && game.currentTurn === 'O'}
              isMe={mySeat === 'O'}
              score={scoreO}
              online={getPresence('O')}
            />
          </div>
        )}

        {/* Disconnect warning (non-custom — hangwoman handles this inline) */}
        {!isCustom && !isSpectator && !opponentOnline && game.status === 'playing' && !showAbandonBanner && (
          <OfflineNotice />
        )}

        {/* Abandoned-opponent recovery (F-23) — after 120s continuously offline */}
        {!isCustom && !isSpectator && game.status === 'playing' && game.players?.[opSym] && showAbandonBanner && (
          <div className="border-2 border-retro-p2/50 bg-retro-card rounded p-3 text-center space-y-2">
            <p className="font-pixel text-[10px] text-retro-p2 leading-relaxed">
              OPPONENT&apos;S BEEN GONE A WHILE
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={claimAbandonedWin}
                disabled={claimingWin}
                className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
              >
                {claimingWin ? 'CLAIMING…' : 'CLAIM WIN'}
              </button>
              <button
                onClick={() => setShowInvite(true)}
                className="border border-retro-border text-retro-text font-pixel text-[10px] px-4 py-2 rounded hover:border-retro-p1/50 transition-all active:scale-95"
              >
                INVITE A FRIEND
              </button>
              <button
                onClick={() => navigate('/')}
                className="border border-retro-border text-retro-dim font-pixel text-[10px] px-4 py-2 rounded hover:text-retro-text transition-all active:scale-95"
              >
                SAVE & GO HOME
              </button>
            </div>
          </div>
        )}

        {/* Proposal banner — shown for both standard and custom branches.
            M-45: rendered as a fixed overlay (mirroring WinEffect's pattern
            in this file) instead of an in-flow block, so a proposal landing
            mid-turn never reflows/shifts the board under a mid-tap finger. */}
        {activeProposal && game.status !== 'waiting' && (
          <div className="fixed inset-x-0 top-[max(3.5rem,calc(env(safe-area-inset-top)+2.75rem))] z-40 flex justify-center px-4 pointer-events-none">
            <div className={cn('w-full pointer-events-auto', cfg.maxWidth)}>
              <ProposalBanner
                proposal={activeProposal}
                mySymbol={mySeat}
                players={game.players}
                onAccept={acceptProposal}
                onDecline={declineProposal}
                onCancel={cancelProposal}
              />
            </div>
          </div>
        )}

        {/* Game area */}
        {game.status === 'waiting' ? (
          <WaitingRoom gameId={gameId} gameType={game.gameType} game={game} mySymbol={mySeat} />
        ) : isCustom ? (
          game.gameType === 'reaction' ? (
            <ReactionGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'aim' ? (
            <AimTrainerGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'typing' ? (
            <TypingGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'math' ? (
            <MathGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'minesweeper' ? (
            <MineRaceGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'battleship' ? (
            <BattleshipGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'numbermemory' ? (
            <NumberMemoryGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'chimp' ? (
            <ChimpGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'twotruths' ? (
            <TwoTruthsGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'bluff' ? (
            <BluffBattleGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'pong' ? (
            <PongGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'snake' ? (
            <SnakeGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'tron' ? (
            <TronGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'sumo' ? (
            <SumoGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'spaceduel' ? (
            <SpaceduelGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'paint' ? (
            <PaintGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'wordduel' ? (
            <WordDuelGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'wordhunt' ? (
            <WordHuntGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : (
            <HangmanGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          )
        ) : (
          <>
            <cfg.BoardComponent
              board={board}
              onMove={handleMove}
              disabled={!canMove || (cfg.type === 'dice' && !game.diceSeed)}
              winningLine={winningLine}
              currentTurn={game.currentTurn}
              lastMove={game.lastMove ?? null}
              {...(cfg.boardProps ? cfg.boardProps(game) : {})}
              {...(cfg.type === 'dice' ? { diceSeedPending: !game.diceSeed } : {})}
            />
            <GameStatus
              status={game.status}
              winner={game.winner}
              currentTurn={game.currentTurn}
              mySymbol={mySeat}
              scores={game.scores}
              players={game.players}
              gameType={game.gameType}
              extraTurn={!!game.extraTurn}
              onPlayAgain={game.status === 'finished' && !isSpectator && !matchWinner && !activeProposal ? () => propose('playAgain') : null}
              onNewMatch={matchWinner && !isSpectator && !activeProposal ? () => propose('newMatch') : null}
              onSwitchGame={!isSpectator && !activeProposal ? (t) => propose('switch', t) : null}
            />
          </>
        )}

        {!isCustom && isSpectator && (game.status === 'playing' || game.status === 'finished') && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center font-pixel text-[10px] text-retro-border">SPECTATING</p>
            <button
              onClick={() => createNewRoom(game.gameType)}
              disabled={creatingRoom}
              className="px-4 py-2 border-2 border-retro-border text-retro-text font-pixel text-[9px] rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-50"
            >
              {creatingRoom ? 'CREATING…' : `START YOUR OWN ${cfg.label} ROOM`}
            </button>
          </div>
        )}

        {/* Emote / reaction bar — players only, once the room is live */}
        {!isSpectator && game.status !== 'waiting' && (
          <EmoteBar onSend={sendEmote} cooldown={emoteCooldown} />
        )}
      </div>
      {showInvite && (
        <InviteFriendModal gameId={gameId} gameType={game.gameType} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
