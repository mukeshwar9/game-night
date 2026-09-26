import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ref, update, set as dbSet, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { normalizeBoard, generateGameId } from '../lib/gameLogic'
import { freshGameState, getGameConfig, lobbySwitchOverrides, withFirstMover } from '../lib/games'
import { importWithRetry, lazyWithRetry } from '../lib/lazyWithRetry'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { recordRoom, recordMatch } from '../lib/profile'
import { recordPlay, recordRoundEnd } from '../lib/analytics'
import { setTelemetryContext } from '../lib/telemetry'
import { isSeatOnline } from '../lib/presenceLogic'
import LoadingLine from '@/components/loading/LoadingLine'
import GameStatus from '../components/GameStatus'
import PlayerCard from '../components/PlayerCard'
import WaitingRoom from '../components/WaitingRoom'
import InviteFriendModal from '../components/InviteFriendModal'
import WinEffect from '../components/WinEffect'
import OfflineNotice from '../components/loading/OfflineNotice'
import ProposalBanner from '../components/ProposalBanner'
import GameSwitcher from '../components/GameSwitcher'
import SettingsButton from '../components/SettingsButton'
import ChatLog from '../components/ChatLog'
import { isQuickChat } from '../lib/emotes'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { VideoCallReactionDock, VideoCallShell } from '../components/VideoCallLayout'
import RulesModal, { RulesButton } from '../components/RulesModal'
import LiveAnnouncer from '../components/LiveAnnouncer'
import Onboarding from '../components/LazyOnboarding'
import WatchingChip from '../components/WatchingChip'
import SeatOffer from '../components/SeatOffer'
import { isMyTurn, roomAnnouncement, seatedIds, spectatorCount } from '../lib/roomLogic'
import useRoomSession from '../hooks/room/useRoomSession'
import useProposal from '../hooks/room/useProposal'
import useAbandonRecovery from '../hooks/room/useAbandonRecovery'
import useBackGuard from '../hooks/room/useBackGuard'
import useFloats from '../hooks/room/useFloats'
import useRoomEffect from '../hooks/room/useRoomEffect'
import useTurnTitle from '../hooks/room/useTurnTitle'
import { buildSwitchUpdates, nextStarter } from '../hooks/room/roomUpdates'
// Game-night mode: night scoreboard, winner-stays seating, host controls.
import NightPanel from '../components/NightPanel'
import { RoomSwitchContext } from '../lib/roomSwitchContext'
import { recordNightMatch, nightSwitchUpdates, hostUidOf } from '../lib/night'
import { rotateWinnerStays } from '../lib/nightLogic'
import { getArrowsMatchEnd } from '../lib/arrowsLogic'
// Match-end rule, shared with the results Cloud Function (functions/).
import { matchTargetFor, isMatchFinish, isCoopGame } from '../lib/matchRules'

// The reaction bar and animated emoji pull in framer-motion (~120 KB). Load
// them only when a room first shows the bar or floats a reaction, not with
// the room page itself.
const EmoteBar = lazyWithRetry(() => import('../components/EmoteBar'))
const AnimatedEmoji = lazyWithRetry(() => import('../components/AnimatedEmoji'))

// Real-time custom arenas (M-05/M-24) — physics-driven games with their own
// dedicated page component, square/wide viewport-hungry courts, and a live
// score that keeps changing even while a modal hides the board.
const REALTIME_CUSTOM_GAMES = new Set(['pong', 'snake', 'tron', 'sumo', 'spaceduel', 'pacmac', 'airhockey', 'paint'])

function toArray(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  return Object.values(val)
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
      <LoadingLine />
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

// Suspense fallback while a game's page or board chunk downloads (machine
// work, so the same PixelDots line as the room's own loading screen).
function GameAreaFallback() {
  return <LoadingLine className="py-12" />
}

// Floating emoji reactions — one per sender/glyph/burst, positioned on the
// sender's side of the screen (X left, O right) so simultaneous reactions
// from both players never collide.
function EmoteFloats({ floats }) {
  return (
    <div className="fixed inset-x-0 top-1/3 z-[90] pointer-events-none flex justify-center">
      {floats.map(f => (
        <div
          // re-keyed on count so a combo bump restarts the float animation —
          // otherwise the `forwards` fill leaves the element invisible while
          // its re-armed removal timer keeps it alive
          key={`${f.id}-${f.count}`}
          className={cn(
            'absolute flex flex-col items-center gap-1',
            f.kind === 'chat'
              ? (f.seat === 'X' ? 'left-[16%]' : f.seat === 'O' ? 'right-[16%]' : 'left-1/2 -translate-x-1/2')
              : f.spectator ? 'left-1/2 -translate-x-1/2'
                : (f.by === 'X' ? 'left-[16%]' : 'right-[16%]')
          )}
          style={{ animation: 'emote-float 2s ease-out forwards' }}
        >
          {f.kind === 'chat' ? (
            <div className="flex flex-col items-center gap-0.5 max-w-[60vw]">
              <span className="font-pixel text-[7px] text-retro-dim">{f.name}</span>
              <span className="font-pixel text-sm text-retro-cta text-glow-cta break-words">{f.text}</span>
            </div>
          ) : (
            <>
              <div
                className="flex items-center gap-1"
                style={{ transform: `translateX(${f.dx}px) rotate(${f.rot}deg)` }}
              >
                {isQuickChat(f.glyph) ? (
                  <span className="font-pixel text-xl text-retro-cta text-glow-cta whitespace-nowrap">{f.glyph}</span>
                ) : (
                  <Suspense fallback={<span className="w-20 h-20" aria-hidden="true" />}>
                    <AnimatedEmoji glyph={f.glyph} className="w-20 h-20 object-contain" />
                  </Suspense>
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
                  f.spectator ? 'text-retro-dim' : f.by === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2'
                )}>
                  {f.name}
                </span>
              )}
            </>
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
  const {
    game, loading, error, errorGameType, needName, invite, joinWithName, opponentOnline, opponentLeft,
    mySeat, mySymbol, connected, seatOffer, takeSeat,
  } = useRoomSession(gameId)
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectWinner, setWinEffectWinner] = useState(null)
  const [winEffectIntensity, setWinEffectIntensity] = useState('round')
  const [showRules, setShowRules] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const prevStatus = useRef(null)
  const prevTurn = useRef(null)
  const prevFilledCount = useRef(0)
  const prevDiceLast = useRef(null)
  const prevDiceTurnScore = useRef(0)
  const prevDiceRollIndex = useRef(0)
  const prevMoveCount = useRef(0)
  // F-48: the one unacknowledged board move (its token, 0 = none). A ref for
  // re-entry protection inside handleMove, mirrored to state for rendering.
  const pendingMoveRef = useRef(0)
  const moveTokenRef = useRef(0)
  const [movePending, setMovePending] = useState(false)
  const [moveSlow, setMoveSlow] = useState(false)
  const blockedMoveFeedbackAt = useRef(0)
  // Lobby liveliness (waiting-room chat/switch/join cues) bookkeeping.
  const mySwitchedTo = useRef(null)
  const lobbyLivelinessInit = useRef(false)
  const prevLobbyGameType = useRef(null)
  const prevLobbyHasOpponent = useRef(false)

  const { floats, sendEmote, sendChat, emoteCooldown, chatCooldown } = useFloats({ game, gameId, mySymbol })
  // Error reports (telemetry.js) carry the current gameType.
  useEffect(() => {
    setTelemetryContext({ gameType: game?.gameType ?? null })
    return () => setTelemetryContext({})
  }, [game?.gameType])
  const { showAbandonBanner, claimingWin, claimAbandonedWin } =
    useAbandonRecovery({ game, gameId, mySymbol, opponentOnline, opponentLeft })
  const { showLeaveConfirm, cancelLeaveMatch, confirmLeaveMatch, handleHomeLinkClick } =
    useBackGuard({ game, gameId, mySeat })
  // Per-game background protocols (registry `roomEffect`, e.g. Pig's seed).
  useRoomEffect({ game, gameId, mySymbol })

  // Turn/result line for screen readers (<LiveAnnouncer>) and the background
  // tab title — 2P rooms speak for the seat, party rooms for the uid.
  const isPartyRoom = !!(game && getGameConfig(game.gameType).nPlayer)
  const turnMe = isPartyRoom ? getPlayerId() : mySeat
  const announcement = roomAnnouncement(game, { me: turnMe, party: isPartyRoom })
  useTurnTitle(isMyTurn(game, turnMe))

  // Sounds + win effect — react to game state changes
  useEffect(() => {
    if (!game) return
    // F-48: while this client's own move is unacknowledged the snapshot is
    // only its optimistic local echo — hold the finish sound, win effect and
    // match record (and the prev* bookkeeping) until the write settles; the
    // effect re-runs then, or sees the rolled-back state if it was rejected.
    if (movePending) return
    const cfg = getGameConfig(game.gameType)

    if (cfg.nPlayer) {
      // Game night: count the finished party match (idempotent — see night.js).
      if (prevStatus.current === 'playing' && game.status === 'finished') recordNightMatch(gameId, game.gameType)
      // Play counters (analytics.js): the room's host/coordinator records each
      // finished party round, once. (Pages that end rounds in page-local
      // phases instead of status 'finished' record their own.)
      if (prevStatus.current === 'playing' && game.status === 'finished' && hostUidOf(game) === getPlayerId()) {
        recordRoundEnd(game.gameType, 'multi', 'finished')
      }
      prevStatus.current = game.status
      return
    }

    if (prevStatus.current === 'waiting' && game.status === 'playing') {
      sounds.join()
    }

    if (prevStatus.current === 'playing' && game.status === 'finished') {
      const w = game.winner
      // Play counters (analytics.js): one client records each round — the
      // winner's (X on a draw). A finish while the loser is offline is an
      // abandonment, which is exactly the CLAIM WIN / LEAVE path.
      if (mySymbol.current && mySymbol.current === (w === 'draw' ? 'X' : w)) {
        const loser = w === 'X' ? 'O' : w === 'O' ? 'X' : null
        const outcome = loser && !isSeatOnline(game.presence?.[loser]) ? 'abandoned' : 'finished'
        recordRoundEnd(game.gameType, 'multi', outcome)
      }
      // Round wins reached the target (or Password / Arrows' final round) —
      // the same rule the results function credits the leaderboard on.
      const isMatch = isMatchFinish(game)
      // Co-op finishes (Word Co-op, Password's team score) have no winner or
      // loser: play the match fanfare, skip the DRAW overlay and keep them
      // out of W/L stats and the night standings.
      const coopFinish = isCoopGame(game.gameType)
      if (coopFinish) sounds.matchWin()
      else if (w === 'draw') sounds.draw()
      else if (w === mySymbol.current) (isMatch ? sounds.matchWin() : sounds.win())
      else if (mySymbol.current) sounds.lose()
      setWinEffectWinner(w)
      setWinEffectIntensity(isMatch ? 'match' : 'round')
      setShowWinEffect(!coopFinish)
      // Game night: count the decided match into tonight's standings
      // (idempotent across every client that sees the finish — see night.js).
      if (isMatch && !coopFinish) recordNightMatch(gameId, game.gameType)
      if (isMatch && mySymbol.current && !coopFinish) {
        const opSym = mySymbol.current === 'X' ? 'O' : 'X'
        recordMatch({
          gameType: game.gameType,
          won: w === mySymbol.current,
          opponentName: game.players?.[opSym]?.name,
          opponentUid: game.players?.[opSym]?.playerId,
          opponentAvatar: game.players?.[opSym]?.avatar,
        })
      }
    }

    // Count non-empty cells; `!== ''` (not truthiness) so numeric ids/heights
    // of 0 (quarto piece 0, santorini level 1 ground) still count as filled.
    const filledCount = cfg.boardSize ? normalizeBoard(game.board, cfg.boardSize).filter(v => v !== '').length : 0

    if (cfg.applyMove) {
      if (cfg.rollFace) {
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
          // JSON compare covers both a single face and PIG BIG's pair.
          const verify = cfg.rollFace(game.diceSeed, idx)
            .then(expected => JSON.stringify(expected) !== JSON.stringify(game.diceLast))
          verify.then(mismatch => {
            if (mismatch) toast.error('ROLL MISMATCH — TAMPERING SUSPECTED')
          }).catch(() => {})
        }
      } else if (cfg.moveCountKey) {
        // Moves that don't always touch `board` (Blockade's pawn moves), so
        // filledCount can't detect them — track the registry's counter instead.
        if (
          game.status === 'playing' &&
          (game[cfg.moveCountKey] ?? 0) > prevMoveCount.current &&
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
    prevMoveCount.current = cfg.moveCountKey ? (game[cfg.moveCountKey] ?? 0) : 0
  }, [game, mySymbol, gameId, movePending])

  // Lobby liveliness — while a challenge-created lobby room (`game.lobby`)
  // sits in 'waiting', surface cues for activity that would otherwise happen
  // silently behind the chat/reaction UI: a remote game-type switch (toast +
  // bell) and the second seat filling (join sound, no auto-start). Guarded to
  // lobby rooms only — legacy/link-created rooms have no `lobby` flag and
  // never run this.
  useEffect(() => {
    if (!game || !game.lobby || game.status !== 'waiting') {
      lobbyLivelinessInit.current = false
      return
    }
    if (!lobbyLivelinessInit.current) {
      lobbyLivelinessInit.current = true
      prevLobbyGameType.current = game.gameType
      prevLobbyHasOpponent.current = !!(game.players?.X && game.players?.O)
      return
    }

    if (game.gameType !== prevLobbyGameType.current) {
      if (mySwitchedTo.current === game.gameType) {
        mySwitchedTo.current = null
      } else if (mySymbol.current) {
        const opSym = mySymbol.current === 'X' ? 'O' : 'X'
        const opName = (game.players?.[opSym]?.name || 'OPPONENT').toUpperCase()
        const label = getGameConfig(game.gameType)?.label || game.gameType
        toast(`${opName} SWITCHED TO ${label}`)
        sounds.bell()
      }
    }
    prevLobbyGameType.current = game.gameType

    const hasOpponent = !!(game.players?.X && game.players?.O)
    if (hasOpponent && !prevLobbyHasOpponent.current) {
      sounds.join()
    }
    prevLobbyHasOpponent.current = hasOpponent
  }, [game, mySymbol])

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

  // F-48: a move is PENDING from the tap until Firebase acknowledges the write.
  // The board shows the optimistic local echo straight away, but the move
  // sound, the win effect and the round-end buttons wait for the ack; no
  // second move is accepted meanwhile (extra-turn games included), and a
  // stale promise can never release a newer move (token check). Offline taps
  // are refused instead of queued — a queued write could land later on a
  // reset or switched game.
  const handleMove = async (colOrIndex) => {
    if (!game || !mySymbol.current) return
    if (pendingMoveRef.current) return // a write is pending — ignore rapid re-taps
    if (game.status !== 'playing') { blockedMoveFeedback(); return }
    if (game.currentTurn !== mySymbol.current) { blockedMoveFeedback(); return }

    const cfg = getGameConfig(game.gameType)
    if (cfg.custom) return
    if (connected === false) {
      toast.error("YOU'RE OFFLINE — MOVE NOT SENT")
      navigator.vibrate?.(30)
      return
    }
    // Seeded dice (Pig): the deterministic roll seed must be established
    // before any roll so no client can fall back to insecure Math.random().
    // Banks are seedless.
    if (cfg.rollFace && colOrIndex === 'roll' && !game.diceSeed) return
    const board = normalizeBoard(game.board, cfg.boardSize)
    const index = cfg.getMoveIndex(board, colOrIndex)
    if (index === -1) return

    // Acquire before any async preparation (Pig's roll face) so a fast second
    // tap can't compute from the pre-tap board.
    const token = ++moveTokenRef.current
    pendingMoveRef.current = token
    const release = () => {
      if (pendingMoveRef.current !== token) return
      pendingMoveRef.current = 0
      setMovePending(false)
      setMoveSlow(false)
    }

    try {
      // For Pig, precompute the deterministic die face (async) from the shared
      // seed so applyDiceMove can stay synchronous (the demo/bot harness calls
      // it without a face, falling back to Math.random which is fine vs a bot).
      let movePayload = colOrIndex
      if (cfg.rollFace) {
        let face
        if (colOrIndex === 'roll' && game.diceSeed) {
          face = await cfg.rollFace(game.diceSeed, game.diceRollIndex ?? 0)
        }
        movePayload = { action: colOrIndex, face }
      }

      let updates, result
      if (cfg.applyMove) {
        const applied = cfg.applyMove({ board, game, index, move: movePayload, symbol: mySymbol.current })
        // Rejected by the game's own rules (non-flanking Reversi cell, illegal
        // pop, …) — give the same feedback as any other blocked tap instead of
        // silently swallowing it.
        if (!applied) { release(); blockedMoveFeedback(); return }
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

      const isBustMove = !!cfg.rollFace && (Array.isArray(updates.diceLast) ? updates.diceLast[0] === 1 && updates.diceLast[1] === 1 : updates.diceLast === 1)

      if (result) {
        updates.winner = result.winner
        updates.status = 'finished'
        if (result.line?.length) updates.winningLine = result.line
        if (result.winner !== 'draw') {
          updates[`scores/${result.winner}`] = (game.scores?.[result.winner] || 0) + 1
        }
      }

      updates.lastActivityAt = Date.now()
      setMovePending(true)
      // A slow ack gets a visible "SAVING MOVE…" line (the sound alone would
      // otherwise just be missing).
      const slowTimer = setTimeout(() => { if (pendingMoveRef.current === token) setMoveSlow(true) }, 1200)
      try {
        await update(ref(db, `games/${gameId}`), updates)
        if (isBustMove) sounds.bust()
        else if (!cfg.quietMoves) sounds.move(mySymbol.current)
      } catch {
        // Firebase rolls the optimistic echo back to the server's state.
        toast.error('MOVE NOT SAVED — CHECK CONNECTION')
      } finally {
        clearTimeout(slowTimer)
        release()
      }
    } catch {
      release()
      toast.error('MOVE FAILED — TRY AGAIN')
    }
  }

  // Apply functions (called directly when no second player / opponent offline)
  const applyPlayAgain = async () => {
    // Arrows: a decided/final match must start over, never advance into a
    // 4th tier-less round (safety net behind the page's New Match routing).
    if (game.gameType === 'arrows' && getArrowsMatchEnd(game)) return applyNewMatch()
    const starter = nextStarter(game)
    const fresh = freshGameState(game.gameType, game)
    // Word Race keeps its used answer indexes across rematches so PLAY AGAIN
    // cannot hand out the same puzzle repeatedly within a room.
    if (game.gameType === 'wordrace' && game.round?.used) {
      fresh.round = { used: game.round.used, roundNum: (game.round.roundNum || 1) + 1 }
    }
    try {
      if (game.gameType === 'wordcoop') {
        const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        // The Wordle answer list is ~100 KB: load it only when a co-op round
        // actually starts, never as part of the room page.
        const [{ getAnswerList }, { buildWordCoopRoundStart }] = await Promise.all([
          importWithRetry(() => import('../lib/dictionary')),
          importWithRetry(() => import('../lib/wordcoopLogic')),
        ])
        const round = buildWordCoopRoundStart({
          answerList: getAnswerList(),
          previousRound: game.round,
          seed,
          starter,
        })
        await update(ref(db, `games/${gameId}`), {
          ...freshGameState('wordcoop'),
          status: 'playing',
          winner: null,
          winningLine: null,
          proposal: null,
          starter,
          currentTurn: starter,
          round,
          lastActivityAt: Date.now(),
        })
        return
      }
      await update(ref(db, `games/${gameId}`), {
        ...withFirstMover(fresh, game.gameType, starter),
        status: 'playing',
        winner: null,
        winningLine: null,
        proposal: null,
        starter,
        lastActivityAt: Date.now(),
      })
    } catch { toast.error('PLAY AGAIN FAILED — CHECK CONNECTION') }
  }

  // A hoisted declaration: applyPlayAgain above calls it (Arrows' finished
  // match), and the React compiler rejects the forward reference to a const.
  async function applyNewMatch() {
    const starter = nextStarter(game)
    const fresh = freshGameState(game.gameType)
    // A new match still starts with a fresh word. Preserve prior indexes as a
    // room-level deck history, matching Word Race's non-repeat promise.
    if (game.gameType === 'wordrace' && game.round?.used) fresh.round = { used: game.round.used }
    // Anagrams and Word Co-op keep their room-level no-repeat history across
    // matches too (a New Match used to reset it and replay recent racks/words).
    if (game.gameType === 'anagrams' && game.round?.usedRacks) {
      fresh.round = { phase: 'ready', roundNum: 1, usedRacks: game.round.usedRacks }
    }
    if (game.gameType === 'wordcoop') {
      // Lazy, as in applyPlayAgain: the answer list is ~100 KB.
      let words
      try {
        words = await Promise.all([
          importWithRetry(() => import('../lib/dictionary')),
          importWithRetry(() => import('../lib/wordcoopLogic')),
        ])
      } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION'); return }
      const [{ getAnswerList }, { buildWordCoopRoundStart }] = words
      fresh.round = buildWordCoopRoundStart({
        answerList: getAnswerList(),
        previousRound: game.round,
        seed: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        starter,
      })
      fresh.currentTurn = starter
    }
    // Pong: a new match keeps the host's lobby picks (mode, match length).
    if (game.gameType === 'pong') Object.assign(fresh, { matchLength: game.matchLength ?? 3, pongMode: game.pongMode ?? 'classic' })
    try {
      await update(ref(db, `games/${gameId}`), {
        ...withFirstMover(fresh, game.gameType, starter),
        status: 'playing',
        winner: null,
        winningLine: null,
        'scores/X': 0,
        'scores/O': 0,
        proposal: null,
        starter,
        // Game night: winner stays — the loser swaps out for the next player
        // in the room's queue (no-op when nobody is waiting).
        ...rotateWinnerStays(game, Date.now()),
        lastActivityAt: Date.now(),
      })
    } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION') }
  }

  const applySwitchGame = async (newType) => {
    sessionStorage.removeItem(`hangwoman-word-${gameId}`)
    // Per-game secrets are keyed by gameId: leaving them behind lets a stale
    // word/lie grade (or false-cheat) a later round after switching back.
    // wordduel secrets live in localStorage, one key per seat.
    sessionStorage.removeItem(`twotruths-${gameId}`)
    try {
      localStorage.removeItem(`wordduel-word-${gameId}-X`)
      localStorage.removeItem(`wordduel-word-${gameId}-O`)
    } catch { /* private mode — ignore */ }
    // Suppresses the lobby-liveliness "opponent switched" toast for a switch
    // this client itself initiated (see the liveliness effect above).
    mySwitchedTo.current = newType
    // Game night: party <-> 2P switches reseat the room (winner stays).
    const updates = nightSwitchUpdates(game, newType, buildSwitchUpdates(game, newType))
    try {
      await update(ref(db, `games/${gameId}`), game.status === 'waiting' ? lobbySwitchOverrides(updates) : updates)
      recordPlay(newType, 'multi')
    } catch { toast.error('SWITCH FAILED — CHECK CONNECTION') }
  }

  const { propose, acceptProposal, declineProposal, cancelProposal } = useProposal({
    game, gameId, mySymbol, opponentOnline, applyPlayAgain, applyNewMatch, applySwitchGame,
  })

  // --- N-player (party game) actions ---
  // START for party games with a registry `startRound`. A transaction that
  // only starts a room that isn't already playing, so two clients who both
  // believe they're the host during a handover can't double-start (the round
  // is built from the server's copy of the room). startRound gets the room
  // too, for its timer scale and presence.
  const handleNStart = async () => {
    const cfg = getGameConfig(game.gameType)
    if (!cfg.startRound) return // spyfair & co. drive their own start
    try {
      await runTransaction(ref(db, `games/${gameId}`), cur => {
        if (!cur || cur.status === 'playing' || cur.gameType !== game.gameType) return
        const sr = cfg.startRound(cur.players || {}, cur)
        if (!sr) return
        return { ...cur, status: 'playing', winner: null, ...sr, proposal: null, lastActivityAt: Date.now() }
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

  // Invite screen — useRoomSession decides when (an unseated visitor still
  // on a placeholder name). The full first-run flow (name, then look) shows
  // the game, host and places left, saves both to the profile, and then
  // re-runs the join; the name is already in localStorage/profile by then,
  // so joinWithName('') just keeps it instead of writing it twice.
  if (needName) {
    return (
      <Onboarding
        invite={{ gameId, ...invite }}
        onDone={() => joinWithName('')}
      />
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
    // Game night: the host override (`hostUid`, TRANSFER HOST) wins while that
    // player is here and online; otherwise the first online seat in join order.
    const isHost = hostUidOf(game) === myUid
    const amSeated = !!nplayers[myUid]
    const watching = spectatorCount(game.spectators, seatedIds(nplayers))
    const nProps = {
      gameId, game, mySeat: myUid, players: nplayers, isHost,
      onStart: handleNStart,
      onSwitchGame: (t) => applySwitchGame(t),
      onNewMatch: applyNNewMatch,
      proposal: null,
    }
    return (
      <RoomSwitchContext.Provider value={true}>
      <VideoCallShell><div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {showLeaveConfirm && (
          <LeaveMatchConfirm onConfirm={confirmLeaveMatch} onCancel={cancelLeaveMatch} />
        )}
        {showRules && (
          <RulesModal gameType={game.gameType} onClose={() => setShowRules(false)} />
        )}
        {floats.length > 0 && <EmoteFloats floats={floats} />}
        <LiveAnnouncer message={announcement} />
        <div className={cn('w-full space-y-4', cfg.maxWidth)} key={game.gameType}>
          <div className="game-header flex items-start justify-between gap-2">
            <Link to="/" onClick={handleHomeLinkClick} className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors inline-block p-3 -m-3">← HOME</Link>
            <div className="game-header-actions flex items-center justify-end gap-3">
              <SettingsButton />
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

              {cfg.badge && (
                <span className="game-header-meta font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded">{cfg.badge}</span>
              )}
              <WatchingChip count={watching} />
              <span className="game-header-meta font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
            </div>
          </div>

          <Suspense fallback={<GameAreaFallback />}>
            <cfg.Page {...nProps} />
          </Suspense>

          {/* Game night: kicked notice, lobby timers, tonight's scoreboard, host controls */}
          <NightPanel game={game} gameId={gameId} nPlayer />

          <ChatLog chatLog={game.chatLog} myUid={myUid} />

          {/* Seated players and spectators alike can react once a round is on. */}
          {game.status !== 'waiting' && (
            <VideoCallReactionDock><Suspense fallback={null}><EmoteBar onSend={sendEmote} cooldown={emoteCooldown} onSendText={sendChat} textCooldown={chatCooldown} /></Suspense></VideoCallReactionDock>
          )}
        </div>
        {showInvite && (
          <InviteFriendModal gameId={gameId} gameType={game.gameType} excludeUids={seatedIds(nplayers)} onClose={() => setShowInvite(false)} />
        )}
      </div></VideoCallShell>
      </RoomSwitchContext.Provider>
    )
  }

  const board = isCustom ? [] : normalizeBoard(game.board, cfg.boardSize)
  const winningLine = toArray(game.winningLine)
  const isSpectator = !mySeat
  const watching = spectatorCount(game.spectators, seatedIds(game.players))
  const opSym = mySeat === 'X' ? 'O' : 'X'
  const canMove = !isSpectator && game.status === 'playing' && game.currentTurn === mySeat
  // M-05/M-24: physics-driven arenas with their own dedicated page and a
  // score that keeps changing even while a modal covers the board.
  const isRealtimeCustom = REALTIME_CUSTOM_GAMES.has(game.gameType)
  const matchStillRunning = isRealtimeCustom && game.status === 'playing' && (showRules || showInvite)

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchTarget = matchTargetFor(game)
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
    // Game night: a 2P game a party room switched into may switch back to party games.
    <RoomSwitchContext.Provider value={!!game.partyRoom}>
    <VideoCallShell><div className={cn(
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
      <LiveAnnouncer message={announcement} />

      <div className={cn(
        'w-full',
        // M-46: Chain Reaction's 8-row board is the tallest non-realtime
        // board — tighten the vertical rhythm so board+status still fit a
        // 667px viewport (iPhone SE) without pushing status off-screen.
        cfg.compactLayout ? 'space-y-2' : 'space-y-4',
        cfg.maxWidth,
        isRealtimeCustom && '[@media(max-height:420px)]:space-y-1.5',
      )} key={game.gameType}>
        {/* Header */}
        <div className="game-header flex items-start justify-between gap-2">
          <Link to="/" onClick={handleHomeLinkClick} className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors inline-block p-3 -m-3">
            ← HOME
          </Link>
          <div className={cn('game-header-actions flex items-center justify-end gap-3', isRealtimeCustom && '[@media(max-height:420px)]:gap-1.5')}>
            <SettingsButton />
            <RulesButton onClick={() => setShowRules(true)} />
            {/* M-24: GameSwitcher opens its own full-screen sheet whose open
                state never surfaces to this component, so a live-score
                banner can't cover it — gate the trigger itself instead so a
                real-time match's physics/score can never keep changing
                invisibly behind an opened switcher. */}
            {!isSpectator && !activeProposal && !(isRealtimeCustom && game.status === 'playing') && (
              <GameSwitcher
                variant="icon"
                currentType={game.gameType}
                onSwitch={(t) => (game.status === 'waiting' ? applySwitchGame(t) : propose('switch', t))}
              />
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

            {cfg.badge && (
              <span className="game-header-meta font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded">{cfg.badge}</span>
            )}
            <WatchingChip count={watching} />
            <span className="game-header-meta font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
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

        {/* Abandoned-opponent recovery (F-23) — after 120s continuously offline
            (60s for custom real-time games, where a vanished peer hard-freezes
            the round and forfeit would be the only other exit) */}
        {!isSpectator && game.status === 'playing' && game.players?.[opSym] && showAbandonBanner && (
          <div className="border-2 border-retro-p2/50 bg-retro-card rounded p-3 text-center space-y-2">
            <p className="font-pixel text-[10px] text-retro-p2 leading-relaxed">
              {opponentLeft ? 'OPPONENT LEFT THE MATCH' : 'OPPONENT\'S BEEN GONE A WHILE'}
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

        {/* A 2P seat freed up in the lobby — offer it to a spectator. */}
        {seatOffer && <SeatOffer onTakeSeat={takeSeat} />}

        {/* Game area */}
        {game.status === 'waiting' ? (
          <WaitingRoom gameId={gameId} gameType={game.gameType} game={game} mySymbol={mySeat} onSwitch={applySwitchGame} opponentOnline={opponentOnline} />
        ) : isCustom ? (
          <Suspense fallback={<GameAreaFallback />}>
            <cfg.Page
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<GameAreaFallback />}>
            <cfg.BoardComponent
              board={board}
              onMove={handleMove}
              disabled={!canMove || movePending || (!!cfg.rollFace && !game.diceSeed)}
              winningLine={winningLine}
              currentTurn={game.currentTurn}
              lastMove={game.lastMove ?? null}
              mySymbol={mySeat}
              {...(cfg.boardProps ? cfg.boardProps(game) : {})}
              {...(cfg.rollFace ? { diceSeedPending: !game.diceSeed } : {})}
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
              passNote={game.passNote ?? null}
              onPlayAgain={game.status === 'finished' && !isSpectator && !matchWinner && !activeProposal && !movePending ? () => propose('playAgain') : null}
              onNewMatch={matchWinner && !isSpectator && !activeProposal && !movePending ? () => propose('newMatch') : null}
              onSwitchGame={!isSpectator && !activeProposal && !movePending ? (t) => propose('switch', t) : null}
            />
            {/* F-48: an unacknowledged move, once it's taking a while. */}
            {movePending && (moveSlow || connected === false) && (
              <p role="status" className="text-center font-pixel text-[9px] text-retro-dim tracking-wider">
                {connected === false ? 'MOVE PENDING — WAITING FOR CONNECTION' : 'SAVING MOVE…'}
              </p>
            )}
            {game.status === 'finished' && (
              <Link
                to="/leaderboard"
                className="block text-center font-mono text-[10px] text-retro-dim hover:text-retro-text transition-colors p-2 -m-2"
              >
                SEE WHERE YOU RANK →
              </Link>
            )}
          </Suspense>
        )}

        {/* Game night: winner-stays line, kicked notice, tonight's scoreboard between games, host controls */}
        <NightPanel game={game} gameId={gameId} nPlayer={false} />

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

        {/* Free-text chat log — visible to spectators too; self-hides when empty.
            Silent games (registry `quiet`, e.g. HUNCH) hide typed chat; emotes stay. */}
        {!cfg.quiet && <ChatLog chatLog={game.chatLog} myUid={getPlayerId()} />}

        {/* Emote / reaction bar — hidden while waiting for an opponent (M-XX:
            nobody to react to yet). Shown to a seated player once an
            opponent has joined, or to a spectator watching a live game. */}
        {((!isSpectator && !!game.players?.O) || (isSpectator && (game.status === 'playing' || game.status === 'finished'))) && (
          <VideoCallReactionDock><Suspense fallback={null}><EmoteBar onSend={sendEmote} cooldown={emoteCooldown} onSendText={cfg.quiet ? undefined : sendChat} textCooldown={chatCooldown} quiet={!!cfg.quiet} /></Suspense></VideoCallReactionDock>
        )}
      </div>
      {showInvite && (
        <InviteFriendModal gameId={gameId} gameType={game.gameType} excludeUids={seatedIds(game.players)} onClose={() => setShowInvite(false)} />
      )}
    </div></VideoCallShell>
    </RoomSwitchContext.Provider>
  )
}
