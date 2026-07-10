import { useState, useRef, useEffect } from 'react';
import SimonBoard from '../components/SimonBoard';
import GameStatus from '../components/GameStatus';
import PlayerCard from '../components/PlayerCard';
import HangmanGallows from '../components/HangmanGallows';
import WordDisplay from '../components/WordDisplay';
import LetterKeyboard from '../components/LetterKeyboard';
import TypingKeyboard from '../components/TypingKeyboard';
import WordSetter from '../components/WordSetter';
import ChimpBoard from '../components/ChimpBoard';
import VisualMemoryBoard from '../components/VisualMemoryBoard';
import {
  TicTacToeIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon, TypingIcon, MathIcon,
  ConnectFourIcon, GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon,
  TwoTruthsIcon, BluffIcon, WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon, WordDuelIcon,
} from '../components/GameIcons';
import PongCourt from '../components/PongCourt';
import SnakeArena from '../components/SnakeArena';
import { usePongControls } from '../hooks/usePongControls';
import { useSnakeControls } from '../hooks/useSnakeControls';
import { createState as createPongState, step as pongStep, computeAI as pongAI, getWinner as pongWinner, WIN_SCORE as PONG_WIN } from '../lib/pongLogic';
import { createState as createSnakeState, tick as snakeTick, computeAI as snakeAI, getWinner as snakeWinner, WIN_SCORE as SNAKE_WIN, TICK_MS as SNAKE_TICK } from '../lib/snakeLogic';
import { sounds } from '../lib/sounds';
import NumberPad from '../components/NumberPad';
import { generateQuestion, QUESTION_MS } from '../lib/mathLogic';
import { normalizeBoard } from '../lib/gameLogic';
import { applyGuess, isWordGuessed, countWrong, MAX_WRONG, wordStructure } from '../lib/hangmanLogic';
import { markGuess, isValidGuess, getKeyboardState, MAX_GUESSES as WD_MAX_GUESSES, WORD_LENGTH as WD_WORD_LENGTH } from '../lib/wordduelLogic';
import { applySimonMove, normalizeSimonSequence } from '../lib/simonLogic';
import { normalizeChimpLayout, generateChimpLayout, CHIMP_START_LEVEL } from '../lib/chimpLogic';
import { applyVmMove, normalizeVmArray, generateVmPattern, VM_START_LEVEL } from '../lib/visualMemoryLogic';
import { getGameConfig, freshGameState, GAME_CATEGORIES, getPlayerTag } from '../lib/games'
import { recordPlay } from '../lib/analytics'
import CategoryTabs from '../components/CategoryTabs';
import { pickBotMove } from '../lib/demoBots';
import { Link, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import NavBar from '../components/NavBar';
import TronDemo from './TronDemo';
import SumoDemo from './SumoDemo';
import SpaceduelDemo from './SpaceduelDemo';

function generateNumberLocal(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

// ─── Generic bot harness ──────────────────────────────────────────────────────

function BotBoardDemo({ type }) {
  const cfg = getGameConfig(type)
  const makeInit = () => ({
    ...freshGameState(type),
    status: 'playing', winner: null, winningLine: [], currentTurn: 'X',
  })
  const [game, setGame] = useState(makeInit)
  const timerRef = useRef(null)

  // Apply a move the same way Game.jsx handleMove does; returns next game or null if illegal.
  const applyOne = (g, payload, symbol) => {
    const board = cfg.boardSize ? normalizeBoard(g.board, cfg.boardSize) : (g.board || [])
    const index = cfg.getMoveIndex ? cfg.getMoveIndex(board, payload) : 0
    if (cfg.boardSize && index === -1) return null
    let updates, result
    if (cfg.applyMove) {
      const applied = cfg.applyMove({ board, game: g, index, move: payload, symbol })
      if (!applied) return null
      updates = applied.updates
      result = applied.result
    } else {
      const nb = [...board]
      nb[index] = symbol
      result = cfg.getWinner(nb)
      updates = { board: nb, currentTurn: symbol === 'X' ? 'O' : 'X' }
    }
    const next = { ...g, ...updates }
    if (result) {
      next.winner = result.winner
      next.status = 'finished'
      next.winningLine = result.line || []
    }
    return next
  }

  const handleHumanMove = (payload) => {
    setGame(g => {
      if (g.status !== 'playing' || g.currentTurn !== 'X') return g
      return applyOne(g, payload, 'X') || g
    })
  }

  // Bot turn driver — re-runs whenever game changes; handles extra-turns/passes/dice streaks
  // because it simply fires again while it's still O's turn.
  useEffect(() => {
    if (game.status !== 'playing' || game.currentTurn !== 'O') return
    timerRef.current = setTimeout(() => {
      setGame(g => {
        if (g.status !== 'playing' || g.currentTurn !== 'O') return g
        const move = pickBotMove(type, g, 'O')
        if (move === null || move === undefined) return g
        return applyOne(g, move, 'O') || g
      })
    }, 600)
    return () => clearTimeout(timerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, type])

  const reset = () => { clearTimeout(timerRef.current); setGame(makeInit()) }

  const board = cfg.boardSize ? normalizeBoard(game.board, cfg.boardSize) : []
  const canMove = game.status === 'playing' && game.currentTurn === 'X'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <PlayerCard name="You" symbol="X" isActive={canMove} isMe />
        <PlayerCard name="CPU" symbol="O" isActive={game.status === 'playing' && game.currentTurn === 'O'} isMe={false} />
      </div>
      <cfg.BoardComponent
        board={board}
        onMove={handleHumanMove}
        disabled={!canMove}
        winningLine={game.winningLine || []}
        currentTurn={game.currentTurn}
        {...(cfg.boardProps ? cfg.boardProps(game) : {})}
      />
      <GameStatus
        status={game.status}
        winner={game.winner}
        currentTurn={game.currentTurn}
        mySymbol="X"
        onPlayAgain={game.status === 'finished' ? reset : null}
      />
    </div>
  )
}

// ─── Party game card ──────────────────────────────────────────────────────────

const PARTY_BLURB = {
  twotruths: 'Spot the lie among three statements.',
  bluff: "Liar's dice — out-bluff your opponent.",
  wavelength: 'Read minds on a hidden spectrum.',
  fibbage: 'Invent fake answers, fool your friends.',
  spyfair: 'Find the spy before time runs out.',
}

function PartyGameCard({ type }) {
  const cfg = getGameConfig(type)
  return (
    <div className="space-y-4 text-center py-6">
      <p className="font-pixel text-sm text-retro-cta text-glow-cta">{cfg.label}</p>
      <p className="font-mono text-xs text-retro-dim leading-relaxed">{PARTY_BLURB[type] || cfg.desc}</p>
      <p className="font-pixel text-[10px] text-retro-dim leading-relaxed">
        NEEDS 2+ PLAYERS —<br />NO SOLO BOT FOR THIS ONE.
      </p>
      <Link
        to="/"
        className="inline-block px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
      >
        CREATE A ROOM →
      </Link>
    </div>
  )
}

// ─── Game demos ──────────────────────────────────────────────────────────────

function HangmanDemo() {
  const [phase, setPhase] = useState('setting')
  const [word, setWord] = useState('')
  const [hint, setHint] = useState('')
  const [guesses, setGuesses] = useState({})
  const [result, setResult] = useState(null)
  const [wrongCount, setWrongCount] = useState(0)
  const [stepperCount, setStepperCount] = useState(0)

  const handleWordSet = (w, h) => {
    setWord(w); setHint(h || ''); setGuesses({}); setWrongCount(0); setResult(null); setPhase('guessing')
  }

  const handleGuess = (letter) => {
    if (phase !== 'guessing' || letter in guesses) return
    const positions = applyGuess(word, letter)
    const guessVal = positions.length > 0 ? positions : false
    const newGuesses = { ...guesses, [letter]: guessVal }
    const newWrong = countWrong(newGuesses)
    setGuesses(newGuesses); setWrongCount(newWrong)
    if (isWordGuessed(word, newGuesses)) { setResult('guessed'); setPhase('reveal') }
    else if (newWrong >= MAX_WRONG) { setResult('hanged'); setPhase('reveal') }
  }

  const reset = () => {
    setPhase('setting'); setWord(''); setHint(''); setGuesses({}); setWrongCount(0); setResult(null)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-pixel text-[10px] text-retro-border text-center">GALLOWS PREVIEW</p>
        <HangmanGallows wrongCount={stepperCount} />
        <div className="flex justify-center gap-2">
          <button onClick={() => setStepperCount(c => Math.max(0, c - 1))}
            className="px-3 py-1 font-pixel text-[10px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95">–</button>
          <span className="font-pixel text-[10px] text-retro-dim self-center">{stepperCount}/{MAX_WRONG}</span>
          <button onClick={() => setStepperCount(c => Math.min(MAX_WRONG, c + 1))}
            className="px-3 py-1 font-pixel text-[10px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95">+</button>
        </div>
      </div>
      <div className="border-t border-retro-border pt-4 space-y-4">
        <p className="font-pixel text-[10px] text-retro-border text-center">LIVE DEMO — ENTER WORD, THEN GUESS</p>
        {phase === 'setting' && <WordSetter onWordSet={handleWordSet} />}
        {(phase === 'guessing' || phase === 'reveal') && (
          <>
            <HangmanGallows wrongCount={wrongCount} />
            <WordDisplay
              wordStructure={wordStructure(word)}
              hint={hint}
              guesses={guesses}
              revealedWord={phase === 'reveal' ? word : null}
            />
            <div className="text-center space-y-1">
              {phase === 'reveal' ? (
                <>
                  <p className={cn('font-pixel text-xs', result === 'guessed' ? 'text-retro-p1' : 'text-retro-p2')}>
                    {result === 'guessed' ? 'WORD GUESSED!' : 'HANGED!'}
                  </p>
                  <p className="font-mono text-[10px] text-retro-dim">
                    Word: <span className="text-retro-cta">{word}</span>
                  </p>
                  <button onClick={reset}
                    className="mt-2 px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
                    PLAY AGAIN
                  </button>
                </>
              ) : (
                <p className="font-pixel text-[10px] text-retro-cta animate-pulse">GUESS A LETTER</p>
              )}
              <p className="font-mono text-[10px] text-retro-dim">{wrongCount}/{MAX_WRONG} wrong</p>
            </div>
            {phase === 'guessing' && <LetterKeyboard guesses={guesses} onGuess={handleGuess} disabled={false} />}
          </>
        )}
      </div>
    </div>
  )
}

const WD_KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
]

function WordDuelDemo() {
  const [answer, setAnswer] = useState(() => {
    const common = ['ABOUT', 'ABOVE', 'ADULT', 'AFTER', 'AGAIN', 'AGREE', 'ALONE', 'AMONG', 'ANGEL', 'ANGRY',
      'BEACH', 'BEGAN', 'BEING', 'BLACK', 'BLOOD', 'BOARD', 'BRAIN', 'BREAK', 'BRING', 'BROWN',
      'CAUSE', 'CHAIR', 'CHECK', 'CHILD', 'CLEAN', 'CLEAR', 'CLOSE', 'COULD', 'COURT', 'COVER',
      'DANCE', 'DEATH', 'DREAM', 'DRINK', 'DRIVE', 'EARTH', 'EIGHT', 'EVERY', 'FAITH', 'FALSE',
      'FIELD', 'FIGHT', 'FIRST', 'FORCE', 'FORTH', 'FOUND', 'FRAME', 'FRESH', 'FRONT', 'GIVEN',
      'GLASS', 'GRAND', 'GREEN', 'GROUP', 'GUARD', 'GUESS', 'GUEST', 'HAPPY', 'HEART', 'HEAVY',
      'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'IDEAL', 'IMAGE', 'INDEX', 'JUDGE', 'KNOWN', 'LABEL',
      'LARGE', 'LAUGH', 'LEARN', 'LEAVE', 'LEVEL', 'LIGHT', 'LOCAL', 'LOOSE', 'LOWER', 'LUCKY',
      'LUNCH', 'MAJOR', 'MARRY', 'MATCH', 'MAYBE', 'MEDIA', 'METAL', 'MIGHT', 'MINOR', 'MONEY',
      'MONTH', 'MORAL', 'MOUTH', 'MOVIE', 'MUSIC', 'NEEDS', 'NEVER', 'NIGHT', 'NOISE', 'NORTH',
      'NOVEL', 'NURSE', 'OFFER', 'OFTEN', 'ORDER', 'OTHER', 'OWNER', 'PAPER', 'PARTY', 'PEACE',
      'PHASE', 'PHONE', 'PIANO', 'PIECE', 'PILOT', 'PITCH', 'PLACE', 'PLANE', 'PLANT', 'PLATE',
      'POINT', 'POUND', 'POWER', 'PRESS', 'PRICE', 'PRIDE', 'PRIZE', 'PROOF', 'QUEEN', 'QUICK',
      'QUIET', 'QUITE', 'RADIO', 'RAISE', 'RANGE', 'RAPID', 'RATIO', 'REACH', 'READY', 'RIGHT',
      'RIVER', 'ROUND', 'ROUTE', 'RURAL', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SENSE', 'SERVE',
      'SEVEN', 'SHALL', 'SHAPE', 'SHARE', 'SHARP', 'SHEET', 'SHELF', 'SHELL', 'SHIFT', 'SHIRT',
      'SHOCK', 'SHORT', 'SHOWN', 'SIGHT', 'SINCE', 'SIXTY', 'SKILL', 'SLEEP', 'SLOPE', 'SMALL',
      'SMART', 'SMILE', 'SMOKE', 'SOLID', 'SOLVE', 'SORRY', 'SOUND', 'SOUTH', 'SPACE', 'SPARE',
      'SPEAK', 'SPEED', 'SPEND', 'SPENT', 'SPLIT', 'SPOKE', 'SPORT', 'STAFF', 'STAGE', 'STAKE',
      'STAND', 'START', 'STATE', 'STEAM', 'STEEL', 'STICK', 'STILL', 'STOCK', 'STONE', 'STOOD',
      'STORE', 'STORM', 'STORY', 'STRIP', 'STUCK', 'STUDY', 'STUFF', 'STYLE', 'SUGAR', 'SUITE',
      'SWEET', 'TABLE', 'TASTE', 'TEACH', 'THANK', 'THEIR', 'THERE', 'THESE', 'THING', 'THINK',
      'THIRD', 'THOSE', 'THREE', 'THROW', 'TIGHT', 'TITLE', 'TODAY', 'TOTAL', 'TOUCH', 'TOUGH',
      'TRACK', 'TRADE', 'TRAIL', 'TRAIN', 'TREAT', 'TREND', 'TRIAL', 'TRIED', 'TRIES', 'TRULY',
      'TRUST', 'TRUTH', 'TWICE', 'UNDER', 'UNION', 'UNITY', 'UNTIL', 'UPPER', 'USAGE', 'USUAL',
      'VALID', 'VALUE', 'VIDEO', 'VIRUS', 'VISIT', 'VITAL', 'VOICE', 'WASTE', 'WATCH', 'WATER',
      'WHEEL', 'WHERE', 'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WHOSE', 'WOMAN', 'WORLD', 'WORRY',
      'WORSE', 'WORST', 'WORTH', 'WOULD', 'WOUND', 'WRONG', 'WROTE', 'YIELD', 'YOUNG', 'YOURS']
    return common[Math.floor(Math.random() * common.length)]
  })
  const [guesses, setGuesses] = useState([])
  const [current, setCurrent] = useState('')
  const [botScore, setBotScore] = useState(0)
  const [playerScore, setPlayerScore] = useState(0)
  const [roundResult, setRoundResult] = useState(null)

  const kbState = getKeyboardState(guesses)
  const done = guesses.length >= WD_MAX_GUESSES || guesses.some(g => g.marks === 'GGGGG')
  const solved = guesses.some(g => g.marks === 'GGGGG')

  const [botGuesses] = useState(() => 3 + Math.floor(Math.random() * 3))

  const handleKey = (key) => {
    if (done) return
    if (key === 'ENTER') {
      const word = current.toUpperCase()
      if (word.length !== WD_WORD_LENGTH) return
      if (!isValidGuess(word)) return
      const marks = markGuess(word, answer)
      const newGuesses = [...guesses, { word: word.toUpperCase(), marks }]
      setGuesses(newGuesses)
      setCurrent('')
    } else if (key === 'BACK') {
      setCurrent(prev => prev.slice(0, -1))
    } else if (current.length < WD_WORD_LENGTH) {
      setCurrent(prev => prev + key.toUpperCase())
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="flex gap-4 text-xs text-retro-dim mb-1">
        <span>YOU: {playerScore}</span>
        <span>BOT: {botScore}</span>
      </div>

      {roundResult && (
        <div className={cn(
          'text-sm font-bold mb-2',
          roundResult === 'win' ? 'text-retro-win' : roundResult === 'draw' ? 'text-retro-text' : 'text-retro-dim',
        )}>
          {roundResult === 'win' ? 'YOU WIN!' : roundResult === 'draw' ? 'DRAW' : 'BOT WINS'}
          <span className="text-xs text-retro-dim ml-2">
            (you: {solved ? guesses.length + '/6' : 'failed'}, bot: {botGuesses}/6)
          </span>
        </div>
      )}

      {/* Board */}
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: WD_MAX_GUESSES }).map((_, r) => {
          const g = guesses[r]
          const isCurrentRow = r === guesses.length && !done
          const cells = []
          for (let c = 0; c < WD_WORD_LENGTH; c++) {
            const letter = isCurrentRow ? (current[c] || '') : (g && g.word ? g.word[c] : '')
            const mark = isCurrentRow ? null : (g && g.marks ? g.marks[c] : null)
            cells.push(
              (() => {
                const colorClass = !mark ? 'bg-retro-card border-retro-border' :
                  mark === 'G' ? 'bg-retro-win border-retro-win' :
                  mark === 'Y' ? 'bg-[rgb(var(--c-cta))] border-[rgb(var(--c-cta))]' :
                  'bg-retro-dim border-retro-dim'
                return (
                  <div key={c} className={cn(
                    'w-10 h-10 flex items-center justify-center rounded',
                    'text-xl font-bold border-2 uppercase select-none',
                    'transition-colors duration-300',
                    colorClass,
                    letter && mark === 'G' ? 'text-white' : letter && mark === 'Y' ? 'text-white' : letter ? 'text-retro-text' : '',
                  )}>
                    {letter || ''}
                  </div>
                )
              })()
            )
          }
          return <div key={r} className="flex gap-1.5">{cells}</div>
        })}
      </div>

      {/* Keyboard */}
      <div className="flex flex-col items-center gap-1.5 w-full max-w-md mt-2">
        {WD_KB_ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            {ri === 2 && (
              <button
                className="px-2 py-2 rounded text-xs font-bold uppercase bg-retro-structure text-retro-text hover:bg-retro-border disabled:opacity-30"
                onClick={() => handleKey('ENTER')}
                disabled={done}
              >
                ↵
              </button>
            )}
            {row.map(l => {
              const s = kbState[l]
              const bg = s === 'G' ? 'bg-retro-win text-white' : s === 'Y' ? 'bg-[rgb(var(--c-cta))] text-white' : s === 'B' ? 'bg-retro-dim text-retro-dim' : 'bg-retro-structure text-retro-text'
              return (
                <button key={l} className={cn('px-1.5 py-2 rounded text-xs font-bold uppercase hover:opacity-80 disabled:opacity-30', bg)}
                  onClick={() => handleKey(l)} disabled={done}
                >
                  {l}
                </button>
              )
            })}
            {ri === 2 && (
              <button
                className="px-2 py-2 rounded text-xs font-bold uppercase bg-retro-structure text-retro-text hover:bg-retro-border disabled:opacity-30"
                onClick={() => handleKey('BACK')}
                disabled={done}
              >
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Done? Show result + restart */}
      {done && !roundResult && (
        <button
          className="mt-3 px-4 py-1.5 rounded text-xs font-bold uppercase bg-retro-cta text-white hover:opacity-90"
          onClick={() => {
            setRoundResult(solved ? (guesses.length < botGuesses ? 'win' : guesses.length === botGuesses ? 'draw' : 'lose') : 'lose')
            if (solved) {
              if (guesses.length < botGuesses) setPlayerScore(s => s + 1)
              else if (guesses.length === botGuesses) { setPlayerScore(s => s + 1); setBotScore(s => s + 1) }
              else setBotScore(s => s + 1)
            } else {
              setBotScore(s => s + 1)
            }
          }}
        >
          SHOW RESULT
        </button>
      )}

      {roundResult && (
        <button
          className="mt-2 px-4 py-1.5 rounded text-xs font-bold uppercase bg-retro-cta text-white hover:opacity-90"
          onClick={() => {
            const common = ['ABOUT', 'ABOVE', 'ADULT', 'AFTER', 'AGAIN', 'AGREE', 'ALONE', 'AMONG', 'ANGEL', 'ANGRY',
              'BEACH', 'BEGAN', 'BEING', 'BLACK', 'BLOOD', 'BOARD', 'BRAIN', 'BREAK', 'BRING', 'BROWN',
              'CAUSE', 'CHAIR', 'CHECK', 'CHILD', 'CLEAN', 'CLEAR', 'CLOSE', 'COULD', 'COURT', 'COVER',
              'DANCE', 'DEATH', 'DREAM', 'DRINK', 'DRIVE', 'EARTH', 'EIGHT', 'EVERY', 'FAITH', 'FALSE',
              'FIELD', 'FIGHT', 'FIRST', 'FORCE', 'FORTH', 'FOUND', 'FRAME', 'FRESH', 'FRONT', 'GIVEN']
            setAnswer(common[Math.floor(Math.random() * common.length)])
            setGuesses([])
            setCurrent('')
            setRoundResult(null)
          }}
        >
          NEXT ROUND
        </button>
      )}

      {/* New game */}
      {roundResult && playerScore + botScore >= 3 && (
        <button
          className="mt-1 px-4 py-1.5 rounded text-xs font-bold uppercase bg-retro-deep text-retro-text border border-retro-border hover:border-retro-dim"
          onClick={() => {
            setPlayerScore(0)
            setBotScore(0)
            const common = ['ABOUT', 'ABOVE', 'ADULT', 'AFTER', 'AGAIN']
            setAnswer(common[Math.floor(Math.random() * common.length)])
            setGuesses([])
            setCurrent('')
            setRoundResult(null)
          }}
        >
          NEW MATCH
        </button>
      )}
    </div>
  )
}

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
  const timerRef = useRef(null)

  useEffect(() => {
    if (phase !== 'showing') { clearInterval(timerRef.current); setCountdown(null); return }
    setCountdown(3)
    let rem = 3000
    const iv = setInterval(() => {
      rem -= 100
      setCountdown(Math.ceil(rem / 1000))
      if (rem <= 0) { clearInterval(iv); setCountdown(null); setPhase('recall') }
    }, 100)
    timerRef.current = iv
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
            <p className="font-pixel text-[9px] text-retro-p2 animate-pulse">{countdown}s</p>
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

const DEMO_ROUNDS = 4

function ReactionDemo() {
  const [phase, setPhase] = useState('start')
  const [times, setTimes] = useState([])
  const [lastTime, setLastTime] = useState(null)
  const [opTimes, setOpTimes] = useState(null)
  const roundStartRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const startRound = () => {
    setPhase('waiting')
    const delay = 1500 + Math.random() * 2500
    timerRef.current = setTimeout(() => {
      setPhase('ready')
      roundStartRef.current = performance.now()
    }, delay)
  }

  const handleClick = () => {
    switch (phase) {
      case 'start': startRound(); break
      case 'waiting':
        clearTimeout(timerRef.current)
        setPhase('too_early')
        break
      case 'ready': {
        const rt = Math.round(performance.now() - roundStartRef.current)
        setLastTime(rt)
        const newTimes = [...times, rt]
        setTimes(newTimes)
        if (newTimes.length === DEMO_ROUNDS) {
          const bot = Array.from({ length: DEMO_ROUNDS }, () => 180 + Math.round(Math.random() * 200))
          setOpTimes(bot)
          setPhase('done')
        } else {
          setPhase('result')
        }
        break
      }
      case 'result': startRound(); break
      case 'too_early': startRound(); break
    }
  }

  const reset = () => {
    clearTimeout(timerRef.current)
    setPhase('start'); setTimes([]); setLastTime(null); setOpTimes(null)
  }

  if (phase === 'done' && opTimes) {
    const avgY = Math.round(times.reduce((a, b) => a + b, 0) / DEMO_ROUNDS)
    const avgB = Math.round(opTimes.reduce((a, b) => a + b, 0) / DEMO_ROUNDS)
    const fastY = Math.min(...times)
    const fastB = Math.min(...opTimes)
    const winner = avgY < avgB ? 'YOU' : avgY > avgB ? 'BOT' : null
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', a: avgY, f: fastY, w: winner === 'YOU', col: 'retro-p1' },
            { label: 'BOT', a: avgB, f: fastB, w: winner === 'BOT', col: 'retro-p2' },
          ].map(({ label, a, f, w, col }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              <p className={cn('font-pixel text-xl', w ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {a}<span className="text-[8px] text-retro-dim">ms</span>
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">avg</p>
              <p className="font-pixel text-[9px] text-retro-cta">{f}ms best</p>
            </div>
          ))}
        </div>
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
          <div className="grid grid-cols-3 font-pixel text-[7px] text-retro-dim pb-1 border-b border-retro-border">
            <span className="text-retro-p1">YOU</span>
            <span className="text-center">RND</span>
            <span className="text-right text-retro-p2">BOT</span>
          </div>
          {times.map((t, i) => (
            <div key={i} className="grid grid-cols-3 font-pixel text-[8px]">
              <span className={t < opTimes[i] ? 'text-retro-win' : 'text-retro-text'}>{t}ms</span>
              <span className="text-center text-retro-dim">{i + 1}</span>
              <span className={cn('text-right', opTimes[i] < t ? 'text-retro-win' : 'text-retro-text')}>{opTimes[i]}ms</span>
            </div>
          ))}
        </div>
        {winner && (
          <p className="font-pixel text-[8px] text-retro-dim text-center">
            <span className={winner === 'YOU' ? 'text-retro-p1' : 'text-retro-p2'}>{winner}</span>
            {' WAS '}
            <span className="text-retro-win">{Math.abs(avgY - avgB)}ms</span>
            {' FASTER ON AVERAGE'}
          </p>
        )}
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        className={cn(
          'w-full rounded-xl border-2 transition-colors duration-75 select-none',
          'min-h-[180px] flex flex-col items-center justify-center gap-2',
          phase === 'ready'     ? 'bg-retro-win/20 border-retro-win shadow-neon-win' :
          phase === 'too_early' ? 'bg-retro-p2/15 border-retro-p2/50' :
                                  'bg-retro-surface border-retro-border',
          'active:scale-[0.98] cursor-pointer',
        )}
      >
        <p className={cn(
          'font-pixel text-center',
          phase === 'ready'     && 'text-3xl text-retro-win text-glow-win',
          phase === 'result'    && 'text-2xl text-retro-cta text-glow-cta',
          phase === 'too_early' && 'text-xl text-retro-p2',
          (phase === 'start' || phase === 'waiting') && 'text-base text-retro-dim',
        )}>
          {phase === 'ready'     ? 'CLICK!'        :
           phase === 'too_early' ? 'TOO EARLY!'    :
           phase === 'result'    ? `${lastTime}ms` :
           phase === 'waiting'   ? 'WAIT...'       :
           'TAP TO START'}
        </p>
        <p className={cn('font-pixel text-[9px]', phase === 'too_early' ? 'text-retro-p2' : 'text-retro-dim animate-pulse')}>
          {phase === 'waiting'   ? "DON'T CLICK YET"                       :
           phase === 'too_early' ? 'TAP TO TRY AGAIN'                      :
           phase === 'result'    ? `ROUND ${times.length}/${DEMO_ROUNDS} — TAP FOR NEXT` :
           phase === 'start'     ? `${DEMO_ROUNDS} ROUNDS · VS BOT`        :
           ''}
        </p>
      </button>
      <div className="flex items-center gap-2 font-pixel text-[8px]">
        <span className="text-retro-dim">ROUND</span>
        <div className="flex gap-1 flex-1">
          {Array.from({ length: DEMO_ROUNDS }, (_, i) => (
            <div key={i} className={cn(
              'flex-1 h-2 rounded-sm border',
              i < times.length ? 'bg-retro-cta border-retro-cta' : 'bg-retro-surface border-retro-border',
            )} />
          ))}
        </div>
        <span className="text-retro-dim">{times.length}/{DEMO_ROUNDS}</span>
      </div>
    </div>
  )
}

const DEMO_PASSAGE = "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How quickly daft jumping zebras vex."
const BOT_WPM = 55

function TypingDemo() {
  const [phase, setPhase]             = useState('idle')
  const [countdownSec, setCDown]      = useState(3)
  const [typed, setTyped]             = useState('')
  const [botProgress, setBotProgress] = useState(0)
  const [playerWpm, setPlayerWpm]     = useState(null)
  const [playerAcc, setPlayerAcc]     = useState(null)
  const startTimeRef   = useRef(null)
  const finishedRef    = useRef(false)
  const botIntervalRef = useRef(null)

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    let c = 3; setCDown(3)
    const id = setInterval(() => {
      c--
      if (c <= 0) { clearInterval(id); startTimeRef.current = Date.now(); setPhase('racing') }
      else setCDown(c)
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Bot at BOT_WPM chars/min (types correctly)
  useEffect(() => {
    if (phase !== 'racing') return
    const msPerChar = Math.round(60_000 / (BOT_WPM * 5))
    botIntervalRef.current = setInterval(() => {
      setBotProgress(p => Math.min(p + 1, DEMO_PASSAGE.length))
    }, msPerChar)
    return () => clearInterval(botIntervalRef.current)
  }, [phase])

  // Bot finishes
  useEffect(() => {
    if (phase === 'racing' && botProgress >= DEMO_PASSAGE.length) {
      clearInterval(botIntervalRef.current)
      setPhase('done')
    }
  }, [botProgress, phase])

  const handleKey = (char) => {
    if (phase !== 'racing' || finishedRef.current) return
    let newTyped
    if (char === 'BACKSPACE') {
      newTyped = typed.slice(0, -1)
    } else if (char === 'WORD_BACKSPACE') {
      const trimmed = typed.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      newTyped = lastSpace === -1 ? '' : typed.slice(0, lastSpace + 1)
      if (newTyped.length === typed.length) newTyped = typed.slice(0, -1)
    } else {
      if (typed.length >= DEMO_PASSAGE.length) return
      newTyped = typed + char
    }
    setTyped(newTyped)
    if (newTyped.length === DEMO_PASSAGE.length) {
      finishedRef.current = true
      clearInterval(botIntervalRef.current)
      const elapsed = Date.now() - startTimeRef.current
      const wpm = Math.max(1, Math.round((DEMO_PASSAGE.length / 5) / (elapsed / 60_000)))
      let matches = 0
      for (let i = 0; i < newTyped.length; i++) {
        if (newTyped[i] === DEMO_PASSAGE[i]) matches++
      }
      const acc = Math.round((matches / DEMO_PASSAGE.length) * 100)
      setPlayerWpm(wpm)
      setPlayerAcc(acc)
      setPhase('done')
    }
  }

  const reset = () => {
    clearInterval(botIntervalRef.current)
    setPhase('idle'); setCDown(3)
    setTyped(''); setBotProgress(0)
    setPlayerWpm(null); setPlayerAcc(null)
    finishedRef.current = false
  }

  if (phase === 'done') {
    const youFinished = playerWpm != null
    const botAcc = 100
    const botEffWpm = Math.round(BOT_WPM * botAcc / 100)
    const playerEffWpm = youFinished ? Math.round(playerWpm * (playerAcc ?? 100) / 100) : 0
    const youWon = youFinished && playerEffWpm > botEffWpm
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', wpm: playerWpm, acc: playerAcc, eff: youFinished ? playerEffWpm : null, col: 'retro-p1', won: youWon },
            { label: 'BOT', wpm: BOT_WPM,  acc: botAcc,    eff: botEffWpm,                          col: 'retro-p2', won: !youWon },
          ].map(({ label, wpm, acc, eff, col, won }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              {wpm != null ? (
                <>
                  <p className={cn('font-pixel text-xl tabular-nums', won ? 'text-retro-win text-glow-win' : 'text-retro-text')}>{wpm}</p>
                  <p className="font-pixel text-[8px] text-retro-dim">WPM</p>
                  {acc != null && <p className="font-pixel text-[8px] text-retro-cta">{acc}% ACC</p>}
                  {eff != null && <p className="font-pixel text-[8px] text-retro-dim">{eff} EFF</p>}
                </>
              ) : (
                <p className="font-pixel text-lg text-retro-dim">DNF</p>
              )}
            </div>
          ))}
        </div>
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {youWon ? <span className="text-retro-win">YOU WIN!</span> : youFinished ? <span className="text-retro-p2">BOT WINS!</span> : <span className="text-retro-p2">BOT FINISHED FIRST!</span>}
        </p>
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  const isRacing = phase === 'racing'
  return (
    <div className="space-y-3">
      {phase !== 'idle' && (
        <div className="space-y-1">
          {[
            { label: 'YOU', val: typed.length,  color: 'text-retro-p1' },
            { label: 'BOT', val: botProgress, color: 'text-retro-p2' },
          ].map(({ label, val, color }) => {
            const pct = Math.round((val / DEMO_PASSAGE.length) * 100)
            return (
              <div key={label} className="flex items-center gap-2">
                <span className={cn('font-pixel text-[8px] w-8', color)}>{label}</span>
                <div className="flex-1 h-2 bg-retro-surface rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-200', color === 'text-retro-p1' ? 'bg-retro-p1' : 'bg-retro-p2')}
                    style={{ width: `${pct}%` }} />
                </div>
                <span className="font-pixel text-[8px] text-retro-dim w-8 text-right tabular-nums">{pct}%</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-retro-surface border border-retro-border rounded p-3 font-mono text-[13px] leading-6 break-words min-h-[80px]">
        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="font-pixel text-[9px] text-retro-dim text-center">BEAT THE BOT · ERRORS HIGHLIGHTED · ⌫ CORRECTS</p>
            <button onClick={() => setPhase('countdown')}
              className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
              START
            </button>
          </div>
        )}
        {phase === 'countdown' && (
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="font-pixel text-5xl text-retro-win text-glow-win">{countdownSec}</p>
            <p className="font-pixel text-[9px] text-retro-dim animate-pulse">GET READY!</p>
          </div>
        )}
        {(isRacing || phase === 'done') && (
          <p>
            {DEMO_PASSAGE.split('').map((char, i) => {
              const isTyped   = i < typed.length
              const isCorrect = isTyped && typed[i] === DEMO_PASSAGE[i]
              const isWrong   = isTyped && !isCorrect
              const isCursor  = isRacing && i === typed.length
              const isGhost   = isRacing && botProgress > 0 && i === botProgress && i !== typed.length
              return (
                <span key={i} className={cn(
                  isCorrect ? 'text-retro-text' :
                  isWrong   ? 'text-retro-p2 bg-retro-p2/20' : 'text-retro-dim',
                  isCursor ? 'border-l-2 border-retro-cta' : '',
                  isGhost  ? 'border-b-2 border-retro-p2/60' : '',
                )}>
                  {char}
                </span>
              )
            })}
          </p>
        )}
      </div>

      {(isRacing || phase === 'countdown') && (
        <TypingKeyboard onKey={handleKey} disabled={!isRacing} />
      )}
    </div>
  )
}

const DEMO_R       = 20
const DEMO_GAME_MS = 30_000

function AimTrainerDemo() {
  const [phase, setPhase]         = useState('idle')
  const [countdownSec, setCDown]  = useState(3)
  const [timeLeft, setTimeLeft]   = useState(30)
  const [targetYou, setTargetYou] = useState(null)
  const [targetBot, setTargetBot] = useState(null)
  const [scoreYou, setScoreYou]   = useState(0)
  const [hitsYou,  setHitsYou]    = useState(0)
  const [ffYou,    setFfYou]      = useState(0)
  const [scoreBot, setScoreBot]   = useState(0)
  const containerRef = useRef(null)
  const endTimeRef   = useRef(null)
  const botTimerRef  = useRef(null)

  const spawnLocal = () => {
    const el = containerRef.current
    if (!el) return null
    const { width, height } = el.getBoundingClientRect()
    return {
      x: DEMO_R + Math.random() * (width  - 2 * DEMO_R),
      y: DEMO_R + Math.random() * (height - 2 * DEMO_R),
    }
  }

  // 3-2-1 countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    let c = 3
    setCDown(3)
    const id = setInterval(() => {
      c--
      if (c <= 0) {
        clearInterval(id)
        endTimeRef.current = Date.now() + DEMO_GAME_MS
        setTargetYou(spawnLocal())
        setTargetBot(spawnLocal())
        setPhase('active')
      } else {
        setCDown(c)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // 30s game timer
  useEffect(() => {
    if (phase !== 'active') return
    setTimeLeft(30)
    const id = setInterval(() => {
      const rem = Math.ceil((endTimeRef.current - Date.now()) / 1000)
      if (rem <= 0) { clearInterval(id); setPhase('done') }
      else setTimeLeft(rem)
    }, 100)
    return () => clearInterval(id)
  }, [phase])

  // Bot auto-clicks its own target
  useEffect(() => {
    if (phase !== 'active') return
    const scheduleBot = () => {
      botTimerRef.current = setTimeout(() => {
        if (phase !== 'active') return
        setScoreBot(s => s + 1)
        setTargetBot(spawnLocal())
        scheduleBot()
      }, 400 + Math.floor(Math.random() * 350))
    }
    scheduleBot()
    return () => clearTimeout(botTimerRef.current)
  }, [phase])

  const handleYouTargetClick = (e) => {
    e.stopPropagation()
    if (phase !== 'active') return
    setScoreYou(s => s + 1)
    setHitsYou(h => h + 1)
    setTargetYou(spawnLocal())
  }

  const handleBotTargetClick = (e) => {
    e.stopPropagation()
    if (phase !== 'active') return
    setScoreYou(s => s - 1)
    setFfYou(f => f + 1)
    // bot target stays
  }

  const reset = () => {
    clearTimeout(botTimerRef.current)
    setPhase('idle'); setCDown(3); setTimeLeft(30)
    setTargetYou(null); setTargetBot(null)
    setScoreYou(0); setHitsYou(0); setFfYou(0); setScoreBot(0)
  }

  if (phase === 'done') {
    const winner = scoreYou > scoreBot ? 'YOU' : scoreYou < scoreBot ? 'BOT' : null
    const diff   = Math.abs(scoreYou - scoreBot)
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', score: scoreYou, hits: hitsYou, ff: ffYou, w: winner === 'YOU', col: 'retro-p1' },
            { label: 'BOT', score: scoreBot, hits: scoreBot, ff: 0,    w: winner === 'BOT', col: 'retro-p2' },
          ].map(({ label, score, hits, ff, w, col }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              <p className={cn('font-pixel text-xl', w ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {score}
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">net pts</p>
              <p className="font-pixel text-[8px] text-retro-cta">{hits} hits</p>
              {ff > 0 && <p className="font-pixel text-[8px] text-retro-p2">{ff} FF</p>}
            </div>
          ))}
        </div>
        {winner ? (
          <p className="font-pixel text-[8px] text-retro-dim text-center">
            <span className={winner === 'YOU' ? 'text-retro-p1' : 'text-retro-p2'}>{winner}</span>
            {' SCORED '}
            <span className="text-retro-win">{diff} MORE POINT{diff !== 1 ? 'S' : ''}</span>
          </p>
        ) : (
          <p className="font-pixel text-[8px] text-retro-dim text-center">DRAW!</p>
        )}
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {phase !== 'idle' && (
        <div className="flex items-center justify-between px-1">
          <span className="font-pixel text-[9px] text-retro-p1">YOU {scoreYou}</span>
          <span className={cn('font-pixel text-2xl tabular-nums',
            phase === 'countdown' ? 'text-retro-dim' : 'text-retro-win text-glow-win'
          )}>
            {phase === 'countdown' ? countdownSec : timeLeft}
          </span>
          <span className="font-pixel text-[9px] text-retro-p2">{scoreBot} BOT</span>
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          'relative w-full h-56 rounded-xl border-2 overflow-hidden select-none',
          phase === 'active'    ? 'bg-retro-surface border-retro-border cursor-crosshair' :
          phase === 'countdown' ? 'bg-retro-surface/60 border-retro-border/50 cursor-default' :
                                  'bg-retro-surface border-retro-border cursor-default',
        )}
      >
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="font-pixel text-sm text-retro-dim">AIM TRAINER</p>
            <p className="font-pixel text-[8px] text-retro-dim text-center leading-loose">
              SHOOT YOUR COLOR · MISS = −1 PT · 30s
            </p>
            <button
              onClick={e => { e.stopPropagation(); setPhase('countdown') }}
              className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              START
            </button>
          </div>
        )}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="font-pixel text-6xl text-retro-win text-glow-win">{countdownSec}</p>
            <p className="font-pixel text-[9px] text-retro-dim animate-pulse">GET READY!</p>
          </div>
        )}
        {phase === 'active' && targetYou && (
          <button
            onClick={handleYouTargetClick}
            style={{
              position: 'absolute',
              left: targetYou.x - DEMO_R, top: targetYou.y - DEMO_R,
              width: DEMO_R * 2, height: DEMO_R * 2,
            }}
            className="rounded-full bg-retro-p1 shadow-neon-p1 hover:brightness-110 active:scale-90 transition-transform duration-75"
            aria-label="your target"
          />
        )}
        {phase === 'active' && targetBot && (
          <button
            onClick={handleBotTargetClick}
            style={{
              position: 'absolute',
              left: targetBot.x - DEMO_R, top: targetBot.y - DEMO_R,
              width: DEMO_R * 2, height: DEMO_R * 2,
            }}
            className="rounded-full bg-retro-p2 shadow-neon-p2 hover:brightness-110 active:scale-90 transition-transform duration-75"
            aria-label="bot's target"
          />
        )}
      </div>

      {phase === 'active' && (
        <div className="flex justify-center gap-6 font-pixel text-[8px] text-retro-dim">
          <span>HITS <span className="text-retro-p1">{hitsYou}</span></span>
          <span>FF <span className="text-retro-p2">{ffYou}</span></span>
        </div>
      )}
    </div>
  )
}

// ─── Math demo ────────────────────────────────────────────────────────────────

function demoSpeedPts(elapsed) {
  return Math.max(1, Math.ceil(5 * Math.max(0, (QUESTION_MS - elapsed) / QUESTION_MS)))
}

const DEMO_MATH_S = 60

function MathDemo() {
  const seedRef = useRef(null)
  if (!seedRef.current) seedRef.current = Math.floor(Math.random() * 1e9)

  const [phase, setPhase]           = useState('idle')
  const [cdSec, setCdSec]           = useState(3)
  const [qIndex, setQIndex]         = useState(0)
  const [answer, setAnswer]         = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [youScore, setYouScore]     = useState(0)
  const [botScore, setBotScore]     = useState(0)
  const [youStreak, setYouStreak]   = useState(0)
  const [botStreak, setBotStreak]   = useState(0)
  const [timeLeft, setTimeLeft]     = useState(DEMO_MATH_S)

  const playerLockedRef = useRef(false)
  const botLockedRef    = useRef(false)
  const botTimerRef     = useRef(null)
  const advTimerRef     = useRef(null)
  const qTimeoutRef     = useRef(null)
  const gameEndRef      = useRef(null)
  const qStartRef       = useRef(null)
  const streakRef       = useRef({ you: 0, bot: 0 })
  const qRef            = useRef(null)

  const q = generateQuestion(seedRef.current, qIndex)
  qRef.current = q

  const scheduleNextQuestion = () => {
    advTimerRef.current = setTimeout(() => {
      playerLockedRef.current = false
      botLockedRef.current    = false
      qStartRef.current       = Date.now()
      setQIndex(i => i + 1)
      setAnswer('')
      setLastResult(null)
    }, 1000)
  }

  const resolveQuestion = (by, submitted) => {
    clearTimeout(botTimerRef.current)
    clearTimeout(qTimeoutRef.current)
    if (phase === 'done') return
    const cq      = qRef.current
    const correct = submitted === cq.answer
    const elapsed = Date.now() - (qStartRef.current ?? Date.now())
    const speed   = demoSpeedPts(elapsed)
    const power   = cq.isPower ? 2 : 1
    const strk    = streakRef.current[by] >= 3 ? 2 : 1
    const pts     = correct ? speed * power * strk : 0
    const penalty = correct ? 0 : (cq.isPower ? 2 : 1)

    if (by === 'you') {
      setYouScore(s => Math.max(0, s + pts - penalty))
      if (correct) {
        setYouStreak(s => s + 1); setBotStreak(0)
        streakRef.current = { you: streakRef.current.you + 1, bot: 0 }
      } else {
        setYouStreak(0)
        streakRef.current = { ...streakRef.current, you: 0 }
      }
    } else {
      setBotScore(s => Math.max(0, s + pts - penalty))
      if (correct) {
        setBotStreak(s => s + 1); setYouStreak(0)
        streakRef.current = { you: 0, bot: streakRef.current.bot + 1 }
      } else {
        setBotStreak(0)
        streakRef.current = { ...streakRef.current, bot: 0 }
      }
    }

    setLastResult({ by, correct, pts })
    scheduleNextQuestion()
  }

  const handleKey = (key) => {
    if (phase !== 'playing' || playerLockedRef.current) return
    if (key === 'BACKSPACE') { setAnswer(a => a.slice(0, -1)); return }
    if (key === 'ENTER') { handleSubmit(); return }
    if (/^\d$/.test(key) && answer.length < 5) setAnswer(a => a + key)
  }

  const handleSubmit = () => {
    if (!answer || playerLockedRef.current || phase !== 'playing') return
    playerLockedRef.current = true
    botLockedRef.current    = true
    resolveQuestion('you', parseInt(answer, 10))
  }

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    let c = 3; setCdSec(3)
    const id = setInterval(() => {
      c--
      if (c <= 0) {
        clearInterval(id)
        gameEndRef.current = Date.now() + DEMO_MATH_S * 1000
        qStartRef.current  = Date.now()
        setPhase('playing')
      } else setCdSec(c)
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Game timer + bot scheduling per question
  useEffect(() => {
    if (phase !== 'playing') return
    playerLockedRef.current = false
    botLockedRef.current    = false

    // Game clock
    const clockId = setInterval(() => {
      const rem = Math.ceil((gameEndRef.current - Date.now()) / 1000)
      setTimeLeft(Math.max(0, rem))
      if (rem <= 0) { clearInterval(clockId); setPhase('done') }
    }, 100)

    // Bot answer
    const botDelay = 1000 + Math.random() * 2000
    botTimerRef.current = setTimeout(() => {
      if (botLockedRef.current || phase === 'done') return
      botLockedRef.current = true
      playerLockedRef.current = true
      const cq      = qRef.current
      const correct = Math.random() < 0.70
      const bad     = cq.answer + 1 + Math.floor(Math.random() * 4)
      resolveQuestion('bot', correct ? cq.answer : bad)
    }, botDelay)

    // 8s question timeout (skip — no points)
    qTimeoutRef.current = setTimeout(() => {
      if (botLockedRef.current) return
      botLockedRef.current    = true
      playerLockedRef.current = true
      setLastResult({ by: 'timeout', correct: false, pts: 0 })
      scheduleNextQuestion()
    }, QUESTION_MS)

    return () => {
      clearInterval(clockId)
      clearTimeout(botTimerRef.current)
      clearTimeout(qTimeoutRef.current)
    }
  }, [phase, qIndex])

  const reset = () => {
    clearTimeout(botTimerRef.current)
    clearTimeout(advTimerRef.current)
    clearTimeout(qTimeoutRef.current)
    seedRef.current             = Math.floor(Math.random() * 1e9)
    streakRef.current           = { you: 0, bot: 0 }
    playerLockedRef.current     = false
    botLockedRef.current        = false
    setPhase('idle'); setCdSec(3)
    setQIndex(0); setAnswer(''); setLastResult(null)
    setYouScore(0); setBotScore(0); setYouStreak(0); setBotStreak(0)
    setTimeLeft(DEMO_MATH_S)
  }

  if (phase === 'done') {
    const winner = youScore > botScore ? 'YOU' : youScore < botScore ? 'BOT' : null
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', score: youScore, won: winner === 'YOU', col: 'retro-p1' },
            { label: 'BOT', score: botScore, won: winner === 'BOT', col: 'retro-p2' },
          ].map(({ label, score, won, col }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              <p className={cn('font-pixel text-3xl tabular-nums', won ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {score}
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">POINTS</p>
            </div>
          ))}
        </div>
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {winner === 'YOU' ? <span className="text-retro-win">YOU WIN!</span>
          : winner === 'BOT' ? <span className="text-retro-p2">BOT WINS!</span>
          : <span className="text-retro-dim">DRAW!</span>}
          {' '}Q{qIndex} ANSWERED
        </p>
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="space-y-4 text-center">
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left">
          <p>● FIRST CORRECT ANSWER WINS THE ROUND</p>
          <p>⚡ POWER QUESTIONS · 2× POINTS</p>
          <p>🔥 3 IN A ROW = DOUBLE MULTIPLIER</p>
          <p>⏱ 60-SECOND DEMO TIMER</p>
        </div>
        <button onClick={() => setPhase('countdown')}
          className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
          START
        </button>
      </div>
    )
  }

  if (phase === 'countdown') {
    return (
      <div className="space-y-4 text-center py-4">
        <p className="font-pixel text-[9px] text-retro-dim animate-pulse">GET READY!</p>
        <p className="font-pixel text-7xl text-retro-win text-glow-win">{cdSec}</p>
      </div>
    )
  }

  const qPct    = qStartRef.current ? Math.max(0, 1 - (Date.now() - qStartRef.current) / QUESTION_MS) : 1
  const speedPts = demoSpeedPts(qStartRef.current ? Date.now() - qStartRef.current : 0)
  const barColor = qPct > 0.6 ? 'bg-retro-win' : qPct > 0.3 ? 'bg-retro-cta' : 'bg-retro-p2'
  const answered = playerLockedRef.current

  return (
    <div className="space-y-3">
      {/* Scores + timer */}
      <div className="flex items-center gap-2">
        <div className="bg-retro-card border border-retro-border rounded px-2 py-1 text-center min-w-[3rem]">
          <p className={cn('font-pixel text-base tabular-nums leading-none',
            timeLeft <= 10 ? 'text-retro-p2' : 'text-retro-win')}>{timeLeft}s</p>
        </div>
        <div className="flex-1 bg-retro-card border border-retro-border rounded p-1.5 space-y-1">
          <div className="flex justify-between font-pixel text-[9px]">
            <span className="text-retro-p1">YOU · {youScore}</span>
            <span className="text-retro-p2">{botScore} · BOT</span>
          </div>
          <div className="h-1.5 bg-retro-deep rounded-full overflow-hidden flex">
            <div className="bg-retro-p1 h-full transition-all duration-300"
              style={{ width: `${youScore + botScore > 0 ? (youScore / (youScore + botScore)) * 100 : 50}%` }} />
            <div className="bg-retro-p2 h-full flex-1" />
          </div>
        </div>
      </div>

      {/* Question card */}
      <div className={cn('bg-retro-surface border rounded p-4 text-center space-y-2',
        q.isPower ? 'border-retro-cta/60' : 'border-retro-border')}>
        {q.isPower && <p className="font-pixel text-[9px] text-retro-cta">⚡ POWER · 2×</p>}
        <div className="h-1 bg-retro-deep rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-100', barColor)}
            style={{ width: `${qPct * 100}%` }} />
        </div>
        <p className="font-pixel text-[9px] text-retro-dim">Q{qIndex + 1}</p>
        <p className="font-pixel text-3xl text-retro-text">{q.text}</p>
        <p className="font-pixel text-[9px] text-retro-dim">= ?</p>

        <div className="flex gap-1 justify-center">
          {[1,2,3,4,5].map(i => (
            <span key={i} className={cn('font-pixel text-[10px]',
              i <= speedPts ? 'text-retro-win' : 'text-retro-dim opacity-30')}>●</span>
          ))}
        </div>

        {!answered && (
          <div className="bg-retro-deep border border-retro-border rounded px-4 py-2 min-h-[2.5rem] flex items-center justify-center">
            <p className="font-pixel text-2xl text-retro-text tabular-nums">
              {answer || <span className="opacity-30">_</span>}
            </p>
          </div>
        )}
        {answered && lastResult?.correct === true && (
          <div className="bg-retro-tint-cta border border-retro-cta/60 rounded px-3 py-1.5">
            <p className="font-pixel text-[10px] text-retro-win">
              {lastResult.by === 'you' ? '✓ YOU' : '✓ BOT'} +{lastResult.pts}
            </p>
          </div>
        )}
        {answered && lastResult?.correct === false && lastResult?.by !== 'timeout' && (
          <div className="bg-retro-tint-p2 border border-retro-p2/60 rounded px-3 py-1.5">
            <p className="font-pixel text-[10px] text-retro-p2">
              {lastResult.by === 'you' ? '✗ WRONG' : '✗ BOT WRONG'} · ANS: {q.answer}
            </p>
          </div>
        )}
        {answered && lastResult?.by === 'timeout' && (
          <p className="font-pixel text-[9px] text-retro-dim">TIME'S UP · NEXT QUESTION...</p>
        )}
        {!answered && (
          <p className="font-pixel text-[8px] text-retro-dim animate-pulse">BOT IS THINKING ●●●</p>
        )}
      </div>

      {(youStreak >= 3 || botStreak >= 3) && (
        <p className="font-pixel text-[9px] text-retro-cta text-center">
          {youStreak >= 3 ? `🔥 YOU ×2 STREAK (${youStreak})` : `🔥 BOT ×2 STREAK (${botStreak})`}
        </p>
      )}

      <NumberPad onKey={handleKey} disabled={answered || phase !== 'playing'} />
    </div>
  )
}

// ─── Demo registry ────────────────────────────────────────────────────────────

// ─── Pong demo (you vs a reaction-handicapped AI, fully local) ──────────────────

const PONG_DT = 1 / 120

function PongDemo() {
  const courtRef = useRef(null)
  const simRef = useRef(null)
  if (!simRef.current) simRef.current = createPongState()
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

// ─── Snake demo (you vs a greedy AI, fully local) ──────────────────────────────

function SnakeDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (!simRef.current) simRef.current = createSnakeState()
  const [view, setView] = useState({ snakes: null, food: null, eatenX: 0, eatenO: 0 })
  const [winner, setWinner] = useState(null)
  const [round, setRound] = useState(0)
  const [scoreX, setScoreX] = useState(0)
  const [scoreO, setScoreO] = useState(0)
  const { getDir } = useSnakeControls(arenaRef, !winner)

  useEffect(() => {
    if (winner) return
    let timer, aiDir = 'left'
    const loop = () => {
      timer = setTimeout(loop, SNAKE_TICK)
      const s = simRef.current
      // AI re-evaluates every tick (cheap; the sim runs at ~8 Hz).
      aiDir = snakeAI(s, 'O')
      const inputs = { X: getDir(s.snakes.X.dir), O: aiDir }
      const { state: next, events } = snakeTick(s, inputs)
      simRef.current = next
      for (const e of events) {
        if (e.type === 'eat') sounds.hit()
        else if (e.type === 'die') sounds.miss()
      }
      setView({
        snakes: next.snakes,
        food: next.food,
        eatenX: next.snakes.X.eaten,
        eatenO: next.snakes.O.eaten,
      })
      const w = snakeWinner(next)
      if (w) {
        setWinner(w)
        if (w === 'X') setScoreX(n => n + 1)
        else if (w === 'O') setScoreO(n => n + 1)
        clearTimeout(timer)
      }
    }
    timer = setTimeout(loop, SNAKE_TICK)
    return () => clearTimeout(timer)
  }, [winner, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = createSnakeState()
    setView({ snakes: null, food: null, eatenX: 0, eatenO: 0 })
    setWinner(null)
    setRound(n => n + 1)
  }

  const matchWinner = scoreX >= 3 ? 'X' : scoreO >= 3 ? 'O' : null

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-6 font-pixel text-[10px]">
        <span className={cn('text-retro-p1', scoreX >= 3 && 'text-glow-p1')}>YOU {scoreX}</span>
        <span className="text-retro-dim">{SNAKE_WIN} WINS</span>
        <span className={cn('text-retro-p2', scoreO >= 3 && 'text-glow-p2')}>{scoreO} BOT</span>
      </div>
      <SnakeArena
        ref={arenaRef}
        snakes={view.snakes}
        food={view.food}
        eatenX={view.eatenX}
        eatenO={view.eatenO}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        overlay={winner ? (
          <p className="font-pixel text-base text-retro-cta text-glow-cta">
            {winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'BOT WINS' : 'DRAW'}
          </p>
        ) : null}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">FIRST TO {SNAKE_WIN} · ↑↓←→ · WASD · SWIPE</p>
      {matchWinner && (
        <p className="text-center font-pixel text-[10px] text-retro-win text-glow-win">
          {matchWinner === 'X' ? '🏆 MATCH: YOU' : '🏆 MATCH: BOT'}
        </p>
      )}
      {winner && (
        <div className="flex justify-center gap-2">
          {!matchWinner && (
            <button onClick={reset} className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
              NEXT ROUND
            </button>
          )}
          {matchWinner && (
            <button
              onClick={() => { setScoreX(0); setScoreO(0); reset() }}
              className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              PLAY AGAIN
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const DEMOS = [
  // vs-AI board games
  { type: 'tictactoe',    short: 'TTT',           Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="tictactoe" />    },
  { type: 'ultimatettt',  short: 'ULTIMATE\nTTT', Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="ultimatettt" />  },
  { type: 'connectfour',  short: 'CONNECT\nFOUR', Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfour" />  },
  { type: 'connectfourpop', short: 'C4 POP\nOUT', Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfourpop" /> },
  { type: 'gomoku',       short: 'GOMOKU',        Icon: GomokuIcon,       Component: () => <BotBoardDemo type="gomoku" />       },
  { type: 'reversi',      short: 'REVERSI',       Icon: ReversiIcon,      Component: () => <BotBoardDemo type="reversi" />      },
  { type: 'orderchaos',   short: 'ORDER &\nCHAOS',Icon: OrderChaosIcon,   Component: () => <BotBoardDemo type="orderchaos" />   },
  { type: 'sos',          short: 'SOS',           Icon: SosIcon,          Component: () => <BotBoardDemo type="sos" />          },
  { type: 'dotsandboxes',  short: 'DOTS &\nBOXES',  Icon: DotsAndBoxesIcon,   Component: () => <BotBoardDemo type="dotsandboxes" />  },
  { type: 'dice',          short: 'PIG',            Icon: DiceIcon,           Component: () => <BotBoardDemo type="dice" />          },
  { type: 'chainreaction', short: 'CHAIN\nREACTION',Icon: ChainReactionIcon,  Component: () => <BotBoardDemo type="chainreaction" /> },
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
  // Memory hot-seat
  { type: 'simon',        short: 'SIMON',         Icon: SimonIcon,        Component: SimonDemo        },
  { type: 'numbermemory', short: 'NUM\nMEMORY',   Icon: NumberMemoryIcon, Component: NumberMemoryDemo },
  { type: 'visualmemory', short: 'VIS\nMEMORY',   Icon: VisualMemoryIcon, Component: VisualMemoryDemo },
  { type: 'chimp',        short: 'CHIMP\nTEST',   Icon: ChimpIcon,        Component: ChimpDemo        },
  // Solo / hangwoman
  { type: 'hangwoman',    short: 'HANGWOMAN',     Icon: HangwomanIcon,    Component: HangmanDemo      },
  { type: 'wordduel',     short: 'WORD\nDUEL',    Icon: WordDuelIcon,     Component: WordDuelDemo     },
  // Party cards (2+ players only)
  { type: 'twotruths',    short: 'TWO\nTRUTHS',   Icon: TwoTruthsIcon,    Component: () => <PartyGameCard type="twotruths" />   },
  { type: 'bluff',        short: 'BLUFF',         Icon: BluffIcon,        Component: () => <PartyGameCard type="bluff" />       },
  { type: 'wavelength',   short: 'WAVE\nLENGTH',  Icon: WavelengthIcon,   Component: () => <PartyGameCard type="wavelength" />  },
  { type: 'fibbage',      short: 'FIBBAGE',       Icon: FibbageIcon,      Component: () => <PartyGameCard type="fibbage" />     },
  { type: 'spyfair',      short: 'SPYFAIR',       Icon: SpyfairIcon,      Component: () => <PartyGameCard type="spyfair" />     },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Demo() {
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
    <div className="min-h-screen bg-retro-bg flex flex-col items-center">
      <NavBar />
      <div className="w-full max-w-sm space-y-5 p-4 pt-5">
        {/* Header */}
        <div className="flex items-center justify-end">
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
                <span className="font-pixel text-[6px] text-retro-dim/70">{getPlayerTag(getGameConfig(type))}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active demo — key forces fresh mount on game switch */}
        <div key={selected} className="border border-retro-border rounded p-4 bg-retro-card">
          <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider mb-4">
            {active.short.replace('\n', ' ')} DEMO
          </p>
          <active.Component />
        </div>
      </div>
    </div>
  )
}
