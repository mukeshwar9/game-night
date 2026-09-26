import { Suspense, useState, useRef, useEffect } from 'react';
import SimonBoard from '../components/SimonBoard';
import PlayerCard from '../components/PlayerCard';
import ChimpBoard from '../components/ChimpBoard';
import VisualMemoryBoard from '../components/VisualMemoryBoard';
import LoadingLine from '../components/loading/LoadingLine';
import {
  TicTacToeIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon, TypingIcon, MathIcon,
  ConnectFourIcon, GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon,
  TwoTruthsIcon, BluffIcon, WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon, WordDuelIcon, WordRaceIcon, AnagramsIcon, BlockadeIcon, PairsIcon,
  WordHuntIcon, PaintIcon, SketchIcon, PacmacIcon,
  HexIcon, MinesIcon, HerdIcon, TriviaIcon, BattleshipIcon,
  SimIcon, ChompIcon, BreakthroughIcon, AtaxxIcon, KamisadoIcon,
  OnitamaIcon, QuartoIcon, SantoriniIcon, LoaIcon, YavalathIcon,
  MancalaIcon, CheckersIcon, AirHockeyIcon, ArtilleryIcon, ArrowsIcon,
} from '../components/GameIcons';
import PongCourt from '../components/PongCourt';
import { usePongControls } from '../hooks/usePongControls';
import { createState as createPongState, step as pongStep, computeAI as pongAI, getWinner as pongWinner, WIN_SCORE as PONG_WIN } from '../lib/pongLogic';
import { sounds } from '../lib/sounds';
import { applySimonMove, normalizeSimonSequence } from '../lib/simonLogic';
import { normalizeChimpLayout, generateChimpLayout, CHIMP_START_LEVEL } from '../lib/chimpLogic';
import { applyVmMove, normalizeVmArray, generateVmPattern, VM_START_LEVEL } from '../lib/visualMemoryLogic';
import { getGameConfig, GAME_CATEGORIES, supportsLocalPlay } from '../lib/games'
import { recordPlay } from '../lib/analytics'
import CategoryTabs from '../components/CategoryTabs';
import { Link, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { VideoCallShell } from '../components/VideoCallLayout';
import SettingsButton from '../components/SettingsButton'
import { PARTY_BLURB } from './demos/partyBlurbs';
import { lazyWithRetry } from '../lib/lazyWithRetry';

// Demos outside this file load on demand: the hub only needs the picker,
// and a /solo/:type deep link downloads just the one game it opens.
const BotBoardDemo = lazyWithRetry(() => import('./demos/BotBoardDemo'))
const PartyGameCard = lazyWithRetry(() => import('./demos/PartyGameCard'))
const ReactionDemo = lazyWithRetry(() => import('./demos/ReactionDemo'))
const TypingDemo = lazyWithRetry(() => import('./demos/TypingDemo'))
const AimTrainerDemo = lazyWithRetry(() => import('./demos/AimTrainerDemo'))
const MathDemo = lazyWithRetry(() => import('./demos/MathDemo'))
const SnakeDemo = lazyWithRetry(() => import('./demos/SnakeDemo'))
const TronDemo = lazyWithRetry(() => import('./TronDemo'))
const SumoDemo = lazyWithRetry(() => import('./SumoDemo'))
const WavelengthDemo = lazyWithRetry(() => import('./WavelengthDemo'))
const FibbageDemo = lazyWithRetry(() => import('./FibbageDemo'))
const SpyfairDemo = lazyWithRetry(() => import('./SpyfairDemo'))
const SpaceduelDemo = lazyWithRetry(() => import('./SpaceduelDemo'))
const PaintDemo = lazyWithRetry(() => import('./PaintDemo'))
const PacmacDemo = lazyWithRetry(() => import('./PacmacDemo'))
const MineRaceDemo = lazyWithRetry(() => import('./MineRaceDemo'))
const BattleshipDemo = lazyWithRetry(() => import('./BattleshipDemo'))
const MancalaDemo = lazyWithRetry(() => import('./MancalaDemo'))
const CheckersDemo = lazyWithRetry(() => import('./CheckersDemo'))
const AirHockeyDemo = lazyWithRetry(() => import('./AirHockeyDemo'))
const ArtilleryDemo = lazyWithRetry(() => import('./ArtilleryDemo'))
const TriviaDemo = lazyWithRetry(() => import('./TriviaDemo'))
const HerdDemo = lazyWithRetry(() => import('./HerdDemo'))
const ArrowsDemo = lazyWithRetry(() => import('./ArrowsDemo'))
const HangmanDemo = lazyWithRetry(() => import('./HangmanDemo'))
const WordDuelDemo = lazyWithRetry(() => import('./WordDuelDemo'))
const WordRaceDemo = lazyWithRetry(() => import('./WordRaceDemo'))
const WordHuntDemo = lazyWithRetry(() => import('./WordHuntDemo'))
const AnagramsDemo = lazyWithRetry(() => import('./AnagramsDemo'))

function DemoFallback() {
  return <LoadingLine className="py-12" />
}

function generateNumberLocal(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

// ─── Game demos ──────────────────────────────────────────────────────────────

function SimonDemo() {
  const [seq, setSeq] = useState([])
  const [progress, setProgress] = useState(0)
  const [currentTurn, setCurrentTurn] = useState('X')
  const [status, setStatus] = useState('playing')
  const [winner, setWinner] = useState(null)

  const handleMove = (padIndex) => {
    if (status !== 'playing') return
    const r = applySimonMove({ simonSequence: seq, simonProgress: progress }, padIndex, currentTurn)
    if (!r) return
    if (r.result) { setWinner(r.result.winner); setStatus('finished'); return }
    const { simonSequence, simonProgress, currentTurn: next } = r.updates
    if (simonSequence !== undefined) setSeq(normalizeSimonSequence(simonSequence))
    if (simonProgress !== undefined) setProgress(simonProgress)
    if (next !== undefined) setCurrentTurn(next)
  }

  const reset = () => {
    setSeq([]); setProgress(0); setCurrentTurn('X'); setStatus('playing'); setWinner(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <PlayerCard name="Alice" symbol="X" isActive={status === 'playing' && currentTurn === 'X'} isMe />
        <PlayerCard name="Bob" symbol="O" isActive={status === 'playing' && currentTurn === 'O'} isMe={false} />
      </div>
      <SimonBoard onMove={handleMove} disabled={status !== 'playing'} simonSequence={seq} simonProgress={progress} />
      <div className="text-center space-y-2">
        {status === 'finished' && (
          <p className={cn('font-pixel text-[10px]', winner === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
            {winner} WINS!
          </p>
        )}
        <button onClick={reset}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          RESET
        </button>
      </div>
    </div>
  )
}

function ChimpDemo() {
  const [layout, setLayout] = useState(() => generateChimpLayout(CHIMP_START_LEVEL))
  const [level, setLevel] = useState(CHIMP_START_LEVEL)
  const [progX, setProgX] = useState(0)
  const [progO, setProgO] = useState(0)
  const [doneX, setDoneX] = useState(false)
  const [doneO, setDoneO] = useState(false)
  const [seat, setSeat] = useState('X')
  const [status, setStatus] = useState('playing')
  const [winner, setWinner] = useState(null)

  const advance = (nx, no) => {
    if (nx && no) {
      const nl = level + 1
      setLevel(nl); setLayout(generateChimpLayout(nl))
      setProgX(0); setProgO(0); setDoneX(false); setDoneO(false); setSeat('X')
    }
  }

  const handleMove = (cellIndex) => {
    if (status !== 'playing') return
    const prog = seat === 'X' ? progX : progO
    const done = seat === 'X' ? doneX : doneO
    if (done) return
    const expected = normalizeChimpLayout(layout)[prog]
    if (expected !== cellIndex) { setWinner(seat === 'X' ? 'O' : 'X'); setStatus('finished'); return }
    const np = prog + 1
    if (np === level) {
      const nx = seat === 'X' ? true : doneX
      const no = seat === 'O' ? true : doneO
      if (seat === 'X') { setProgX(np); setDoneX(true) } else { setProgO(np); setDoneO(true) }
      advance(nx, no)
    } else {
      if (seat === 'X') setProgX(np); else setProgO(np)
    }
  }

  const reset = () => {
    setLayout(generateChimpLayout(CHIMP_START_LEVEL)); setLevel(CHIMP_START_LEVEL)
    setProgX(0); setProgO(0); setDoneX(false); setDoneO(false)
    setSeat('X'); setStatus('playing'); setWinner(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <PlayerCard name="Alice" symbol="X" isActive={seat === 'X' && !doneX && status === 'playing'} isMe={seat === 'X'} />
        <PlayerCard name="Bob" symbol="O" isActive={seat === 'O' && !doneO && status === 'playing'} isMe={seat === 'O'} />
      </div>
      <ChimpBoard onMove={handleMove} disabled={status !== 'playing' || (seat === 'X' ? doneX : doneO)}
        chimpLayout={layout} myProgress={seat === 'X' ? progX : progO} opProgress={seat === 'X' ? progO : progX}
        myDone={seat === 'X' ? doneX : doneO} opDone={seat === 'X' ? doneO : doneX} chimpLevel={level} />
      <div className="text-center space-y-2">
        {status === 'finished' && (
          <p className={cn('font-pixel text-[10px]', winner === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
            {winner} WINS!
          </p>
        )}
        {status === 'playing' && !(seat === 'X' ? doneX : doneO) && (
          <button onClick={() => setSeat(s => s === 'X' ? 'O' : 'X')}
            className="px-4 py-2 font-pixel text-[8px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95">
            PASS TO {seat === 'X' ? 'BOB' : 'ALICE'}
          </button>
        )}
        <button onClick={reset}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          RESET
        </button>
      </div>
    </div>
  )
}

function NumberMemoryDemo() {
  const [level, setLevel] = useState(1)
  const [number, setNumber] = useState(() => generateNumberLocal(1))
  const [phase, setPhase] = useState('showing')
  const [countdown, setCountdown] = useState(null)
  const [inputX, setInputX] = useState('')
  const [inputO, setInputO] = useState('')
  const [answerX, setAnswerX] = useState(null)
  const [answerO, setAnswerO] = useState(null)
  const [status, setStatus] = useState('playing')
  const [winner, setWinner] = useState(null)

  useEffect(() => {
    if (phase !== 'showing') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- countdown was left at null by the previous round's finish; must show 3 immediately, not wait for the first 100ms tick
    setCountdown(3)
    let rem = 3000
    const iv = setInterval(() => {
      rem -= 100
      setCountdown(Math.ceil(rem / 1000))
      if (rem <= 0) { clearInterval(iv); setCountdown(null); setPhase('recall') }
    }, 100)
    return () => clearInterval(iv)
  }, [phase])

  const resolve = (ax, ao) => {
    const xCorrect = ax === number
    const oCorrect = ao === number
    if (xCorrect && oCorrect) {
      const nl = level + 1
      setLevel(nl); setNumber(generateNumberLocal(nl))
      setPhase('showing'); setAnswerX(null); setAnswerO(null); setInputX(''); setInputO('')
    } else {
      setWinner(!xCorrect ? 'O' : 'X'); setStatus('finished')
    }
  }

  const submitX = () => {
    const ax = inputX.trim()
    if (!ax || answerX !== null) return
    setAnswerX(ax)
    if (answerO !== null) resolve(ax, answerO)
  }

  const submitO = () => {
    const ao = inputO.trim()
    if (!ao || answerO !== null) return
    setAnswerO(ao)
    if (answerX !== null) resolve(answerX, ao)
  }

  const reset = () => {
    setLevel(1); setNumber(generateNumberLocal(1)); setPhase('showing')
    setAnswerX(null); setAnswerO(null); setInputX(''); setInputO('')
    setStatus('playing'); setWinner(null)
  }

  if (status === 'finished') {
    return (
      <div className="space-y-3 text-center">
        <p className="font-pixel text-[8px] text-retro-dim">THE NUMBER WAS</p>
        <p className="font-pixel text-xl text-retro-cta text-glow-cta tracking-widest">{number}</p>
        <p className="font-pixel text-[8px]">
          <span className="text-retro-dim">X: </span>
          <span className={answerX === number ? 'text-retro-win' : 'text-retro-p2'}>{answerX ?? '—'}</span>
          <span className="text-retro-dim mx-3">·</span>
          <span className="text-retro-dim">O: </span>
          <span className={answerO === number ? 'text-retro-win' : 'text-retro-p2'}>{answerO ?? '—'}</span>
        </p>
        <p className={cn('font-pixel text-[10px]', winner === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
          {winner} WINS!
        </p>
        <button onClick={reset}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          RESET
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">{level} DIGIT{level > 1 ? 'S' : ''}</span>
        <span className="text-retro-dim">LEVEL {level}</span>
      </div>

      {phase === 'showing' && (
        <div className="bg-retro-surface border border-retro-border rounded p-6 text-center space-y-3">
          <p className="font-pixel text-[8px] text-retro-dim">MEMORIZE THIS NUMBER</p>
          <p className="font-pixel text-2xl text-retro-cta text-glow-cta tracking-widest">{number}</p>
          {countdown != null && (
            <p className="font-pixel text-[9px] text-retro-p2 arcade-blink">{countdown}s</p>
          )}
        </div>
      )}

      {phase === 'recall' && (
        <div className="space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim text-center">WHAT WAS THE NUMBER?</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-retro-card border border-retro-p1/40 rounded p-2 space-y-2">
              <p className="font-pixel text-[8px] text-retro-p1 text-center">ALICE</p>
              {answerX !== null ? (
                <p className="font-pixel text-[8px] text-retro-win text-center py-1">SUBMITTED ✓</p>
              ) : (
                <>
                  <input type="text" inputMode="numeric" maxLength={level + 2} value={inputX}
                    onChange={e => setInputX(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && submitX()}
                    autoFocus
                    className="w-full bg-retro-surface border border-retro-border text-retro-text font-pixel text-xs tracking-[0.2em] text-center rounded px-2 py-1 focus:outline-none focus:border-retro-p1"
                    placeholder={'?'.repeat(level)} />
                  <button onClick={submitX}
                    className="w-full py-1 bg-retro-p1/20 border border-retro-p1/60 text-retro-p1 font-pixel text-[8px] rounded hover:bg-retro-p1/30 active:scale-95">
                    SUBMIT
                  </button>
                </>
              )}
            </div>
            <div className="bg-retro-card border border-retro-p2/40 rounded p-2 space-y-2">
              <p className="font-pixel text-[8px] text-retro-p2 text-center">BOB</p>
              {answerO !== null ? (
                <p className="font-pixel text-[8px] text-retro-win text-center py-1">SUBMITTED ✓</p>
              ) : (
                <>
                  <input type="text" inputMode="numeric" maxLength={level + 2} value={inputO}
                    onChange={e => setInputO(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && submitO()}
                    className="w-full bg-retro-surface border border-retro-border text-retro-text font-pixel text-xs tracking-[0.2em] text-center rounded px-2 py-1 focus:outline-none focus:border-retro-p2"
                    placeholder={'?'.repeat(level)} />
                  <button onClick={submitO}
                    className="w-full py-1 bg-retro-p2/20 border border-retro-p2/60 text-retro-p2 font-pixel text-[8px] rounded hover:bg-retro-p2/30 active:scale-95">
                    SUBMIT
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VisualMemoryDemo() {
  const [pattern, setPattern] = useState(() => generateVmPattern(VM_START_LEVEL))
  const [clicked, setClicked] = useState([])
  const [level, setLevel] = useState(VM_START_LEVEL)
  const [currentTurn, setCurrentTurn] = useState('X')
  const [status, setStatus] = useState('playing')
  const [winner, setWinner] = useState(null)

  const handleMove = (cellIndex) => {
    if (status !== 'playing') return
    const r = applyVmMove({ vmPattern: pattern, vmClicked: clicked, vmLevel: level }, cellIndex, currentTurn)
    if (!r) return
    if (r.result) { setWinner(r.result.winner); setStatus('finished'); return }
    const { vmLevel, vmPattern, vmClicked, currentTurn: next } = r.updates
    if (vmLevel !== undefined) setLevel(vmLevel)
    if (vmPattern !== undefined) setPattern(normalizeVmArray(vmPattern))
    if (Object.prototype.hasOwnProperty.call(r.updates, 'vmClicked')) setClicked(normalizeVmArray(vmClicked))
    if (next !== undefined) setCurrentTurn(next)
  }

  const reset = () => {
    setPattern(generateVmPattern(VM_START_LEVEL)); setClicked([])
    setLevel(VM_START_LEVEL); setCurrentTurn('X'); setStatus('playing'); setWinner(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <PlayerCard name="Alice" symbol="X" isActive={status === 'playing' && currentTurn === 'X'} isMe />
        <PlayerCard name="Bob" symbol="O" isActive={status === 'playing' && currentTurn === 'O'} isMe={false} />
      </div>
      <VisualMemoryBoard onMove={handleMove} disabled={status !== 'playing'}
        vmPattern={pattern} vmClicked={clicked} vmLevel={level} />
      <div className="text-center space-y-2">
        {status === 'finished' && (
          <p className={cn('font-pixel text-[10px]', winner === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
            {winner} WINS!
          </p>
        )}
        <button onClick={reset}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          RESET
        </button>
      </div>
    </div>
  )
}

// ─── Demo registry ────────────────────────────────────────────────────────────

// ─── Pong demo (you vs a reaction-handicapped AI, fully local) ──────────────────

const PONG_DT = 1 / 120

function PongDemo() {
  const courtRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current === null) simRef.current = createPongState()
  const [view, setView] = useState({ ball: { x: 0.5, y: 0.5 }, paddles: { X: 0.5, O: 0.5 }, scoreX: 0, scoreO: 0, serving: false, pickups: [], effects: null, ballMod: null })
  const [winner, setWinner] = useState(null)
  const { getDir } = usePongControls(courtRef, !winner)

  useEffect(() => {
    if (winner) return
    let raf, last = performance.now(), acc = 0, aiDir = 0, aiAt = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1
      acc += dt
      // ~110ms reaction lag + a wider deadzone keep the AI beatable.
      if (now - aiAt > 110) { aiAt = now; aiDir = pongAI(simRef.current, 'O', { deadzone: 0.08 }) }
      const inputs = { X: getDir(simRef.current.paddles.X), O: aiDir }
      const events = []
      while (acc >= PONG_DT) {
        const r = pongStep(simRef.current, inputs, PONG_DT)
        simRef.current = r.state
        if (r.events.length) events.push(...r.events)
        acc -= PONG_DT
      }
      for (const e of events) {
        if (e.type === 'paddle') sounds.hit()
        else if (e.type === 'wall') sounds.wall?.()
        else if (e.type === 'score') sounds.go()
        else if (e.type === 'pickup') sounds.join?.()
      }
      setView({
        ball: simRef.current.ball, paddles: simRef.current.paddles,
        scoreX: simRef.current.score.X, scoreO: simRef.current.score.O,
        serving: simRef.current.serveIn > 0,
        pickups: simRef.current.pickups || [],
        effects: simRef.current.effects || null,
        ballMod: simRef.current.ballMod || null,
      })
      const w = pongWinner(simRef.current.score)
      if (w) { setWinner(w); cancelAnimationFrame(raf) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [winner]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = createPongState()
    setView({ ball: { x: 0.5, y: 0.5 }, paddles: { X: 0.5, O: 0.5 }, scoreX: 0, scoreO: 0, serving: false, pickups: [], effects: null, ballMod: null })
    setWinner(null)
  }

  return (
    <div className="space-y-3">
      <PongCourt
        ref={courtRef}
        ball={view.ball} paddles={view.paddles}
        scoreX={view.scoreX} scoreO={view.scoreO}
        mySide="X" namesX="YOU" namesO="BOT"
        serving={view.serving}
        pickups={view.pickups}
        effects={view.effects}
        ballMod={view.ballMod}
        overlay={winner ? (
          <p className="font-pixel text-base text-retro-cta text-glow-cta">{winner === 'X' ? 'YOU WIN!' : 'BOT WINS'}</p>
        ) : null}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">FIRST TO {PONG_WIN} · ↑/↓ · W/S · DRAG</p>
      {winner && (
        <div className="flex justify-center">
          <button onClick={reset} className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  )
}

const DEMOS = [
  // vs-AI board games
  { type: 'tictactoe',    short: 'TTT',           Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="tictactoe" />    },
  { type: 'tictactoe4',   short: 'TTT\n4×4',      Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="tictactoe4" />   },
  { type: 'ultimatettt',  short: 'ULTIMATE\nTTT', Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="ultimatettt" />  },
  { type: 'connectfour',  short: 'CONNECT\nFOUR', Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfour" />  },
  { type: 'connectfour5', short: 'C4\nFIVE',      Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfour5" /> },
  { type: 'connectfourpop', short: 'C4 POP\nOUT', Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfourpop" /> },
  { type: 'dice-big',     short: 'PIG\nBIG',      Icon: DiceIcon,         Component: () => <BotBoardDemo type="dice-big" />     },
  { type: 'gomoku',       short: 'GOMOKU',        Icon: GomokuIcon,       Component: () => <BotBoardDemo type="gomoku" />       },
  { type: 'gomokuswap',   short: 'GOMOKU\nSWAP',  Icon: GomokuIcon,       Component: () => <BotBoardDemo type="gomokuswap" />   },
  { type: 'reversi',      short: 'REVERSI',       Icon: ReversiIcon,      Component: () => <BotBoardDemo type="reversi" />      },
  { type: 'orderchaos',   short: 'ORDER &\nCHAOS',Icon: OrderChaosIcon,   Component: () => <BotBoardDemo type="orderchaos" />   },
  { type: 'sos',          short: 'SOS',           Icon: SosIcon,          Component: () => <BotBoardDemo type="sos" />          },
  { type: 'dotsandboxes',  short: 'DOTS &\nBOXES',  Icon: DotsAndBoxesIcon,   Component: () => <BotBoardDemo type="dotsandboxes" />  },
  { type: 'dotsandboxes4', short: 'DOTS\n4×4',      Icon: DotsAndBoxesIcon,   Component: () => <BotBoardDemo type="dotsandboxes4" /> },
  { type: 'dice',          short: 'PIG',            Icon: DiceIcon,           Component: () => <BotBoardDemo type="dice" />          },
  { type: 'chainreaction', short: 'CHAIN\nREACTION',Icon: ChainReactionIcon,  Component: () => <BotBoardDemo type="chainreaction" /> },
  { type: 'chainreaction6',short: 'CHAIN\n6×8',     Icon: ChainReactionIcon,  Component: () => <BotBoardDemo type="chainreaction6" /> },
  { type: 'blockade',      short: 'BLOCKADE',       Icon: BlockadeIcon,       Component: () => <BotBoardDemo type="blockade" /> },
  { type: 'pairs',         short: 'PAIRS',          Icon: PairsIcon,          Component: () => <BotBoardDemo type="pairs" /> },
  { type: 'hex',           short: 'HEX',            Icon: HexIcon,            Component: () => <BotBoardDemo type="hex" /> },
  { type: 'sim',           short: 'SIM',            Icon: SimIcon,            Component: () => <BotBoardDemo type="sim" /> },
  { type: 'chomp',         short: 'CHOMP',          Icon: ChompIcon,          Component: () => <BotBoardDemo type="chomp" /> },
  { type: 'breakthrough',  short: 'BREAK\nTHROUGH', Icon: BreakthroughIcon,   Component: () => <BotBoardDemo type="breakthrough" /> },
  { type: 'ataxx',         short: 'ATAXX',          Icon: AtaxxIcon,          Component: () => <BotBoardDemo type="ataxx" /> },
  { type: 'kamisado',      short: 'KAMISADO',       Icon: KamisadoIcon,       Component: () => <BotBoardDemo type="kamisado" /> },
  { type: 'onitama',       short: 'ONITAMA',        Icon: OnitamaIcon,        Component: () => <BotBoardDemo type="onitama" /> },
  { type: 'quarto',        short: 'QUARTO',         Icon: QuartoIcon,         Component: () => <BotBoardDemo type="quarto" /> },
  { type: 'santorini',     short: 'SANTORINI',      Icon: SantoriniIcon,      Component: () => <BotBoardDemo type="santorini" /> },
  { type: 'loa',           short: 'LINES OF\nACTION', Icon: LoaIcon,          Component: () => <BotBoardDemo type="loa" /> },
  { type: 'yavalath',      short: 'YAVALATH',       Icon: YavalathIcon,       Component: () => <BotBoardDemo type="yavalath" /> },
  { type: 'battleship',    short: 'BATTLE\nSHIP',   Icon: BattleshipIcon,     Component: BattleshipDemo },
  { type: 'mancala',       short: 'MANCALA',        Icon: MancalaIcon,        Component: MancalaDemo },
  { type: 'checkers',      short: 'CHECKERS',       Icon: CheckersIcon,       Component: CheckersDemo },
  { type: 'airhockey',     short: 'AIR\nHOCKEY',    Icon: AirHockeyIcon,      Component: AirHockeyDemo },
  { type: 'artillery',     short: 'ARTIL-\nLERY',   Icon: ArtilleryIcon,      Component: ArtilleryDemo },
  // Skill bots
  { type: 'reaction',     short: 'REACTION\nTIME',Icon: ReactionIcon,     Component: ReactionDemo     },
  { type: 'aim',          short: 'AIM\nTRAINER',  Icon: AimIcon,          Component: AimTrainerDemo   },
  { type: 'typing',       short: 'TYPING\nRACE',  Icon: TypingIcon,       Component: TypingDemo       },
  { type: 'math',         short: 'MENTAL\nMATH',  Icon: MathIcon,         Component: MathDemo         },
  { type: 'pong',         short: 'PONG',          Icon: PongIcon,         Component: PongDemo         },
  { type: 'snake',        short: 'SNAKE\nBATTLE', Icon: SnakeIcon,        Component: SnakeDemo        },
  { type: 'tron',         short: 'TRON',          Icon: TronIcon,         Component: TronDemo         },
  { type: 'sumo',         short: 'SUMO\nARENA',   Icon: SumoIcon,         Component: SumoDemo         },
  { type: 'spaceduel',    short: 'SPACE\nDUEL',   Icon: SpaceDuelIcon,    Component: SpaceduelDemo    },
  { type: 'paint',        short: 'PAINT\nTURF',   Icon: PaintIcon,        Component: PaintDemo        },
  { type: 'pacmac',       short: 'PAC\nMAC',      Icon: PacmacIcon,       Component: PacmacDemo       },
  { type: 'minesweeper',  short: 'MINE\nRACE',    Icon: MinesIcon,        Component: MineRaceDemo     },
  { type: 'arrows',       short: 'ARROWS',        Icon: ArrowsIcon,       Component: ArrowsDemo        },
  // Memory hot-seat
  { type: 'simon',        short: 'SIMON',         Icon: SimonIcon,        Component: SimonDemo        },
  { type: 'numbermemory', short: 'NUM\nMEMORY',   Icon: NumberMemoryIcon, Component: NumberMemoryDemo },
  { type: 'visualmemory', short: 'VIS\nMEMORY',   Icon: VisualMemoryIcon, Component: VisualMemoryDemo },
  { type: 'chimp',        short: 'CHIMP\nTEST',   Icon: ChimpIcon,        Component: ChimpDemo        },
  // Solo / hangwoman
  { type: 'hangwoman',    short: 'HANGWOMAN',     Icon: HangwomanIcon,    Component: HangmanDemo      },
  { type: 'wordduel',     short: 'WORD\nDUEL',    Icon: WordDuelIcon,     Component: WordDuelDemo     },
  { type: 'wordrace',     short: 'WORD\nRACE',    Icon: WordRaceIcon,     Component: WordRaceDemo     },
  { type: 'wordhunt',     short: 'WORD\nHUNT',    Icon: WordHuntIcon,     Component: WordHuntDemo     },
  { type: 'anagrams',     short: 'ANA-\nGRAMS',   Icon: AnagramsIcon,     Component: AnagramsDemo     },
  // Party cards (2+ players only)
  { type: 'twotruths',    short: 'TWO\nTRUTHS',   Icon: TwoTruthsIcon,    Component: () => <PartyGameCard type="twotruths" />   },
  { type: 'bluff',        short: 'BLUFF',         Icon: BluffIcon,        Component: () => <PartyGameCard type="bluff" />       },
  { type: 'wavelength',   short: 'WAVE\nLENGTH',  Icon: WavelengthIcon,   Component: WavelengthDemo   },
  { type: 'fibbage',      short: 'FIBBAGE',       Icon: FibbageIcon,      Component: FibbageDemo      },
  { type: 'spyfair',      short: 'SPYFAIR',       Icon: SpyfairIcon,      Component: SpyfairDemo      },
  { type: 'herd',         short: 'HERD\nMIND',    Icon: HerdIcon,         Component: HerdDemo         },
  { type: 'trivia',       short: 'TRIVIA\nBLITZ', Icon: TriviaIcon,       Component: TriviaDemo       },
  { type: 'sketch',       short: 'SKETCH',        Icon: SketchIcon,       Component: () => <PartyGameCard type="sketch" />      },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

// Local pass-and-play: two people share one screen/keyboard, alternating
// moves on the real BoardComponent with no bot and no Firebase. Reuses the
// generic BotBoardDemo engine (mode="local") — no per-game code needed.
function LocalPlayPage({ routeType }) {
  const cfg = getGameConfig(routeType)
  const playRecorded = useRef(false)
  useEffect(() => {
    if (playRecorded.current) return
    playRecorded.current = true
    recordPlay(routeType, 'local')
  }, [routeType])

  return (
    <VideoCallShell><div className="min-h-screen bg-retro-bg flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-end gap-3">
          <SettingsButton />
          <span className="text-xs text-retro-p2 bg-retro-tint-p2 border border-retro-p2/60 rounded px-2 py-1 font-mono">
            PASS & PLAY
          </span>
        </div>
        <div className="border border-retro-border rounded p-4 bg-retro-card space-y-1">
          <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider">
            {cfg.label} — PASS & PLAY
          </p>
          <p className="font-pixel text-[8px] text-retro-dim text-center">
            SHARE THIS SCREEN — TAKE TURNS
          </p>
          <div className="pt-3">
            <Suspense fallback={<DemoFallback />}>
              <BotBoardDemo type={routeType} mode="local" />
            </Suspense>
          </div>
        </div>
      </div>
    </div></VideoCallShell>
  )
}

// Explicit dead end for a deep-linked /solo/:type with no demo entry — an
// unknown type, or a registry type that advertises solo before its demo ships.
// It must never silently play a different game (GAMEPLAY-01: tictactoe4 /
// connectfour5 / dice-big used to fall back to their base game's demo). Kept in
// the hook-free dispatcher: DemoHub holds state and does not remount on param
// change, so a conditional return inside it would break rules-of-hooks.
function SoloNotAvailable({ routeType }) {
  // getGameConfig falls back to GAME_TYPES[0] for unknown types, so compare
  // back to distinguish "registry type, no demo" from a garbage deep link.
  const cfg = getGameConfig(routeType)
  const known = cfg?.type === routeType
  return (
    <VideoCallShell><div className="min-h-screen bg-retro-bg flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="border border-retro-border rounded p-6 bg-retro-card text-center space-y-3">
          <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 tracking-wider">NO SOLO DEMO</p>
          <p className="font-mono text-xs text-retro-dim leading-relaxed">
            {known
              ? <>{cfg.label} DOESN&apos;T HAVE SOLO PLAY YET.</>
              : <>UNKNOWN GAME &quot;{String(routeType).toUpperCase()}&quot;.</>}
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <Link
              to="/"
              className="px-5 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
            >
              CREATE A ROOM →
            </Link>
            <Link
              to="/demo"
              className="px-5 py-2.5 border border-retro-border text-retro-dim font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-text transition-all active:scale-95"
            >
              ALL DEMOS
            </Link>
          </div>
        </div>
      </div>
    </div></VideoCallShell>
  )
}

// Dispatcher — no hooks of its own, so branching to a different child
// component ahead of any hook call stays rules-of-hooks safe.
export default function Demo({ mode }) {
  const { type: routeType } = useParams()

  if (mode === 'local' && routeType && supportsLocalPlay(routeType)) {
    return <LocalPlayPage routeType={routeType} />
  }
  // /solo/:type with no demo entry gets the explicit not-available card; only
  // a bare /demo (no type) or a valid /solo/:type reaches the hub.
  if (mode !== 'local' && routeType && !DEMOS.some(d => d.type === routeType)) {
    return <SoloNotAvailable routeType={routeType} />
  }
  // /local/:type with an invalid/ineligible type falls back to the hub below.
  return <DemoHub />
}

function DemoHub() {
  const { type: routeType } = useParams()
  const hasRouteType = !!routeType && DEMOS.some(d => d.type === routeType)
  const initialType = hasRouteType ? routeType : 'tictactoe'
  const [selected, setSelected] = useState(initialType)
  const [activeCat, setActiveCat] = useState(() => getGameConfig(initialType)?.category || 'board')
  const active = DEMOS.find(d => d.type === selected)

  // Party cards don't start an actual solo game (2+ players only) — every
  // other selection mounts a fresh bot/skill demo, so that's the play. Landing
  // on the bare /demo hub defaults to tictactoe with no explicit intent, so
  // that first mount is skipped — but arriving via a /solo/:type deep link
  // (e.g. from the catalog's VS AI option) IS an intentional play and should
  // be recorded immediately.
  const playRecorded = useRef(hasRouteType)
  useEffect(() => {
    if (!playRecorded.current) { playRecorded.current = true; return }
    if (!(selected in PARTY_BLURB)) recordPlay(selected, 'solo')
  }, [selected])

  const demoCounts = {}
  for (const d of DEMOS) {
    const cat = getGameConfig(d.type)?.category
    if (cat) demoCounts[cat] = (demoCounts[cat] || 0) + 1
  }
  const demoCategories = GAME_CATEGORIES.map(c => ({ ...c, count: demoCounts[c.id] || 0 })).filter(c => c.count > 0)
  const shown = DEMOS.filter(d => getGameConfig(d.type)?.category === activeCat)

  return (
    <VideoCallShell><div className="min-h-screen bg-retro-bg flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-end gap-3">
          <SettingsButton />
          <span className="text-xs text-retro-cta bg-retro-tint-cta border border-retro-cta/60 rounded px-2 py-1 font-mono">
            Demo
          </span>
        </div>

        {/* Game picker */}
        <div className="space-y-2">
          <CategoryTabs categories={demoCategories} active={activeCat} onSelect={setActiveCat} />
          <div className="grid grid-cols-4 gap-2">
            {shown.map(({ type, short, Icon }) => (
              <button
                key={type}
                onClick={() => setSelected(type)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded border transition-all active:scale-95',
                  selected === type
                    ? 'border-retro-cta text-retro-cta shadow-neon-cta bg-retro-tint-cta'
                    : 'border-retro-border text-retro-dim hover:border-retro-p1/50 hover:text-retro-text bg-retro-card',
                )}
              >
                <Icon />
                <span className="font-pixel text-[7px] text-center leading-tight whitespace-pre-line">{short}</span>
                <span className="font-pixel text-[6px] text-retro-dim/70">{type in PARTY_BLURB ? '2+ PLAYERS' : 'VS CPU'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active demo — key forces fresh mount on game switch */}
        <div key={selected} className="border border-retro-border rounded p-4 bg-retro-card">
          <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider mb-4">
            {active.short.replace('\n', ' ')} DEMO
          </p>
          <Suspense fallback={<DemoFallback />}>
            <active.Component />
          </Suspense>
        </div>
      </div>
    </div></VideoCallShell>
  )
}
