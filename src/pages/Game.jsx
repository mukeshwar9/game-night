import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ref, onValue, update, get, runTransaction, onDisconnect, set as dbSet } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { normalizeBoard } from '../lib/gameLogic'
import { freshGameState, getGameConfig } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { recordRoom, recordMatch } from '../lib/profile'
import ArcadeLoader from '@/components/ArcadeLoader'
import GameStatus from '../components/GameStatus'
import PlayerCard from '../components/PlayerCard'
import WaitingRoom from '../components/WaitingRoom'
import InviteFriendModal from '../components/InviteFriendModal'
import WinEffect from '../components/WinEffect'
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
import WordDuelGame from './WordDuelGame'
import WavelengthGame from './WavelengthGame'
import FibbageGame from './FibbageGame'
import SpyfairGame from './SpyfairGame'
import ProposalBanner from '../components/ProposalBanner'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ThemeSwitcher from '../components/ThemeSwitcher'
import RulesModal, { RulesButton } from '../components/RulesModal'
import {
  commitSeed, deriveSeed, generateSeedHex, rollFaceAsync,
} from '../lib/diceLogic'

const GAME_TTL_MS = 24 * 60 * 60 * 1000

// Real-time games where one round decides the match (page-level `matchWinner`
// already uses scores ≥ 1; the parent's matchTarget must agree so the
// "New Match" button supersedes "Play Again" once the round resolves).
const SINGLE_ROUND_GAMES = new Set(['tron', 'sumo', 'spaceduel'])

const EMOTES = ['🔥', '😂', '😭', '😎', '👏', '💀']

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

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-retro-bg flex items-center justify-center">
      <ArcadeLoader variant="inline" />
    </div>
  )
}

export default function Game() {
  const { gameId } = useParams()
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectWinner, setWinEffectWinner] = useState(null)
  const [winEffectIntensity, setWinEffectIntensity] = useState('round')
  const [floatEmote, setFloatEmote] = useState(null)
  const prevEmoteTs = useRef(0)
  const emoteInit = useRef(false)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const [showRules, setShowRules] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [needName, setNeedName] = useState(false)
  const [nameVersion, setNameVersion] = useState(0)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const mySymbol = useRef(null)
  const prevStatus = useRef(null)
  const prevTurn = useRef(null)
  const prevFilledCount = useRef(0)
  const prevDiceLast = useRef(null)
  const prevDiceTurnScore = useRef(0)
  const prevDiceRollIndex = useRef(0)
  const diceSeedARef = useRef(null) // X's local seedA (sessionStorage-backed)
  const prevProposal = useRef(null)
  const nPlayerCleanup = useRef(null)
  const moveInFlight = useRef(false)

  // Firebase init: join room, set up listeners, set up presence
  useEffect(() => {
    if (configError || !db) {
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
        mySymbol.current = JSON.parse(stored).symbol
      } else {
        // 2. Try playerId reclaim
        const myId = getPlayerId()
        if (data.players?.X?.playerId === myId) {
          mySymbol.current = 'X'
          sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
          try { await update(ref(db, `games/${gameId}/players/X`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (data.players?.O?.playerId === myId) {
          mySymbol.current = 'O'
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
              mySymbol.current = 'O'
              sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'O', name: playerName }))
              const joinUpdates = { status: 'playing' }
              if (data.gameType === 'hangwoman') {
                joinUpdates['round/setter'] = 'X'
                joinUpdates['round/phase'] = 'setting'
                joinUpdates['round/wrongCount'] = 0
              }
              await update(gameRef, joinUpdates)
            } else {
              mySymbol.current = null
              sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: null }))
            }
          } catch { mySymbol.current = null }
        } else {
          // 4. Spectator
          mySymbol.current = null
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
        })
      }
    }

    const cfg = getGameConfig(game.gameType)
    const filledCount = cfg.boardSize ? normalizeBoard(game.board, cfg.boardSize).filter(Boolean).length : 0

    if (cfg.applyMove) {
      if (cfg.type === 'dice') {
        // Pig is boardless (filledCount always 0): detect an opponent action
        // by tracking the die roll index + turn score, and verify the roll
        // face against the deterministic seed (anti-cheat, see diceLogic.js).
        const opp = prevTurn.current && prevTurn.current !== mySymbol.current
        const rolled = (game.diceRollIndex ?? 0) > prevDiceRollIndex.current
        const bankedOrBust = (game.diceTurnScore ?? 0) === 0
          && prevDiceTurnScore.current > 0
          && game.diceLast !== prevDiceLast.current
        if (game.status === 'playing' && opp && (rolled || bankedOrBust)) {
          if (game.diceLast === 1) sounds.bust()
          else sounds.move(prevTurn.current)
        }
        // Verify a deterministic roll (only meaningful once diceSeed is set).
        if (rolled && game.diceSeed && game.diceLast != null) {
          const idx = (game.diceRollIndex ?? 0) - 1
          rollFaceAsync(game.diceSeed, idx).then(expected => {
            if (expected !== game.diceLast) {
              toast.error('ROLL MISMATCH — TAMPERING SUSPECTED')
            }
          }).catch(() => {})
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
    setFloatEmote(e)
    sounds.join()
    const t = setTimeout(() => setFloatEmote(null), 2000)
    return () => clearTimeout(t)
  }, [game?.emote?.ts])

  // A fresh snapshot means React state has caught up with the last write —
  // safe to accept the next move (see moveInFlight in handleMove).
  useEffect(() => {
    moveInFlight.current = false
  }, [game])

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

  const handleMove = async (colOrIndex) => {
    if (!game || !mySymbol.current) return
    if (moveInFlight.current) return // a write is pending — ignore rapid re-taps
    if (game.status !== 'playing') return
    if (game.currentTurn !== mySymbol.current) return

    const cfg = getGameConfig(game.gameType)
    if (cfg.custom) return
    // Pig: the deterministic roll seed must be established before any roll so
    // no client can fall back to insecure Math.random(). Banks are seedless.
    if (cfg.type === 'dice' && colOrIndex === 'roll' && !game.diceSeed) return
    const board = normalizeBoard(game.board, cfg.boardSize)
    const index = cfg.getMoveIndex(board, colOrIndex)
    if (index === -1) return

    // For Pig, precompute the deterministic die face (async) from the shared
    // seed so applyDiceMove can stay synchronous (the demo/bot harness calls
    // it without a face, falling back to Math.random which is fine vs a bot).
    let movePayload = colOrIndex
    if (cfg.type === 'dice') {
      let face
      if (colOrIndex === 'roll' && game.diceSeed) {
        face = await rollFaceAsync(game.diceSeed, game.diceRollIndex ?? 0)
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

    // Block re-entry until the write settles or the next snapshot lands — the
    // turn guard above reads React state, which lags the synchronous local
    // Firebase echo, so a fast second tap could recompute from the pre-tap board.
    moveInFlight.current = true

    if (cfg.type === 'dice' && updates.diceLast === 1) {
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
      if (action === 'playAgain') { applyPlayAgain(); return }
      if (action === 'newMatch') { applyNewMatch(); return }
      if (action === 'switch') { applySwitchGame(gameType); return }
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
    if (action === 'playAgain') { applyPlayAgain(); return }
    if (action === 'newMatch') { applyNewMatch(); return }
    if (action === 'switch') { applySwitchGame(gt); return }
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

  const toggleMute = () => setMuted(sounds.toggle())

  const sendEmote = async (glyph) => {
    if (!mySymbol.current) return
    try {
      await update(ref(db, `games/${gameId}`), { emote: { by: mySymbol.current, glyph, ts: Date.now() } })
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
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4">
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
            autoFocus
            aria-label="Your name"
            className="w-full bg-retro-card border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest placeholder-retro-border rounded px-4 py-3 focus:outline-none focus:border-retro-p1 transition-colors"
          />
          {nameError && (
            <p className="font-pixel text-[10px] text-retro-p2 animate-pulse">{nameError}</p>
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
    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-5 p-4">
        <p className="font-pixel text-[10px] text-retro-p2 text-center max-w-xs leading-relaxed">{error}</p>
        <Link to="/" className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity">
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
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-5 p-4">
        <p className="font-pixel text-[10px] text-retro-p2 text-center max-w-xs leading-relaxed">
          THIS ROOM&apos;S GAME MODE CHANGED AND NO LONGER MATCHES ITS PLAYERS. START A FRESH GAME FROM HOME.
        </p>
        <Link to="/" className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity">
          ← BACK TO HOME
        </Link>
      </div>
    )
  }

  if (cfg.nPlayer) {
    const mySeat = getPlayerId()
    const nplayers = game.players || {}
    const seatList = playersToSeatList(nplayers)
    const isHost = seatList[0]?.playerId === mySeat
    const amSeated = !!nplayers[mySeat]
    const nProps = {
      gameId, game, mySeat, players: nplayers, isHost,
      onStart: handleNStart,
      onSwitchGame: (t) => applySwitchGame(t),
      onNewMatch: applyNNewMatch,
      proposal: null,
    }
    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {showRules && (
          <RulesModal gameType={game.gameType} onClose={() => setShowRules(false)} />
        )}
        {floatEmote && (
          <div className="fixed inset-x-0 top-1/3 z-50 pointer-events-none flex justify-center">
            <div className="text-6xl" style={{ animation: 'emote-float 2s ease-out forwards' }}>
              {floatEmote.glyph}
            </div>
          </div>
        )}
        <div className={cn('w-full space-y-4', cfg.maxWidth)} key={game.gameType}>
          <div className="flex items-center justify-between">
            <Link to="/" className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">← HOME</Link>
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
                  className="text-retro-dim hover:text-retro-text transition-colors p-1 rounded"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                  </svg>
                </button>
              )}
              <button
                onClick={toggleMute}
                title={muted ? 'Unmute sounds' : 'Mute sounds'}
                className="text-retro-dim hover:text-retro-text transition-colors p-1 rounded"
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
          ) : (
            <SpyfairGame {...nProps} />
          )}

          {amSeated && game.status !== 'waiting' && (
            <div className="flex justify-center gap-1.5 pt-1">
              {EMOTES.map(g => (
                <button
                  key={g}
                  onClick={() => sendEmote(g)}
                  aria-label={`Send ${g} reaction`}
                  className="w-9 h-9 flex items-center justify-center text-base rounded border border-retro-border bg-retro-card hover:border-retro-p1/50 active:scale-90 transition-all"
                >
                  {g}
                </button>
              ))}
            </div>
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
  const isSpectator = !mySymbol.current
  const canMove = !isSpectator && game.status === 'playing' && game.currentTurn === mySymbol.current

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchTarget = game.gameType === 'pong' ? (game.matchLength ?? 3)
    : SINGLE_ROUND_GAMES.has(game.gameType) ? 1 : 3
  const matchWinner = scoreX >= matchTarget ? 'X' : scoreO >= matchTarget ? 'O' : null

  // Presence: show dot for players — green for me, live status for opponent
  const getPresence = (sym) => {
    if (isSpectator) return undefined
    if (sym === mySymbol.current) return true
    return opponentOnline
  }

  // Proposal: hide action buttons while a proposal is pending (not declined by me)
  const activeProposal = game.proposal && !game.proposal.declined ? game.proposal : null

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {showWinEffect && (
        <WinEffect winner={winEffectWinner} intensity={winEffectIntensity} onDone={() => setShowWinEffect(false)} />
      )}

      {showRules && (
        <RulesModal gameType={game.gameType} onClose={() => setShowRules(false)} />
      )}

      {floatEmote && (
        <div className="fixed inset-x-0 top-1/3 z-50 pointer-events-none flex justify-center">
          <div className="text-6xl" style={{ animation: 'emote-float 2s ease-out forwards' }}>
            {floatEmote.glyph}
          </div>
        </div>
      )}

      <div className={cn('w-full space-y-4', cfg.maxWidth)} key={game.gameType}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to="/" className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">
            ← HOME
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <RulesButton onClick={() => setShowRules(true)} />
            {!isSpectator && game.status !== 'waiting' && !activeProposal && (
              <GameSwitcher variant="icon" currentType={game.gameType} onSwitch={(t) => propose('switch', t)} />
            )}
            {!isSpectator && (
              <button
                onClick={() => setShowInvite(true)}
                title="Invite a friend"
                aria-label="Invite a friend"
                className="text-retro-dim hover:text-retro-text transition-colors p-1 rounded"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                </svg>
              </button>
            )}
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
              className="text-retro-dim hover:text-retro-text transition-colors p-1 rounded"
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

        {/* Players */}
        <div className="grid grid-cols-2 gap-2">
          <PlayerCard
            name={game.players?.X?.name}
            symbol="X"
            avatar={game.players?.X?.avatar}
            isActive={game.status === 'playing' && game.currentTurn === 'X'}
            isMe={mySymbol.current === 'X'}
            score={scoreX}
            online={getPresence('X')}
          />
          <PlayerCard
            name={game.players?.O?.name}
            symbol="O"
            avatar={game.players?.O?.avatar}
            isActive={game.status === 'playing' && game.currentTurn === 'O'}
            isMe={mySymbol.current === 'O'}
            score={scoreO}
            online={getPresence('O')}
          />
        </div>

        {/* Disconnect warning (non-custom — hangwoman handles this inline) */}
        {!isCustom && !isSpectator && !opponentOnline && game.status === 'playing' && (
          <p className="font-pixel text-[10px] text-retro-p2 text-center leading-relaxed animate-pulse">
            OPPONENT DISCONNECTED
          </p>
        )}

        {/* Proposal banner — shown for both standard and custom branches */}
        {activeProposal && game.status !== 'waiting' && (
          <ProposalBanner
            proposal={activeProposal}
            mySymbol={mySymbol.current}
            players={game.players}
            onAccept={acceptProposal}
            onDecline={declineProposal}
            onCancel={cancelProposal}
          />
        )}

        {/* Game area */}
        {game.status === 'waiting' ? (
          <WaitingRoom gameId={gameId} gameType={game.gameType} game={game} mySymbol={mySymbol.current} />
        ) : isCustom ? (
          game.gameType === 'reaction' ? (
            <ReactionGame
              gameId={gameId}
              game={game}
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'bluff' ? (
            <BluffBattleGame
              gameId={gameId}
              game={game}
              mySymbol={mySymbol.current}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : game.gameType === 'pong' ? (
            <PongGame
              gameId={gameId}
              game={game}
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              mySymbol={mySymbol.current}
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
              disabled={!canMove}
              winningLine={winningLine}
              currentTurn={game.currentTurn}
              {...(cfg.boardProps ? cfg.boardProps(game) : {})}
            />
            <GameStatus
              status={game.status}
              winner={game.winner}
              currentTurn={game.currentTurn}
              mySymbol={mySymbol.current}
              scores={game.scores}
              players={game.players}
              gameType={game.gameType}
              onPlayAgain={game.status === 'finished' && !isSpectator && !matchWinner && !activeProposal ? () => propose('playAgain') : null}
              onNewMatch={matchWinner && !isSpectator && !activeProposal ? () => propose('newMatch') : null}
              onSwitchGame={!isSpectator && !activeProposal ? (t) => propose('switch', t) : null}
            />
          </>
        )}

        {!isCustom && isSpectator && game.status === 'playing' && (
          <p className="text-center font-pixel text-[10px] text-retro-border">SPECTATING</p>
        )}

        {/* Emote / reaction bar — players only, once the room is live */}
        {!isSpectator && game.status !== 'waiting' && (
          <div className="flex justify-center gap-1.5 pt-1">
            {EMOTES.map(g => (
              <button
                key={g}
                onClick={() => sendEmote(g)}
                aria-label={`Send ${g} reaction`}
                className="w-9 h-9 flex items-center justify-center text-base rounded border border-retro-border bg-retro-card hover:border-retro-p1/50 active:scale-90 transition-all"
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
      {showInvite && (
        <InviteFriendModal gameId={gameId} gameType={game.gameType} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
