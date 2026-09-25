import { Suspense, useState, useRef, useEffect } from 'react';
import SimonBoard from '../components/SimonBoard';
import PlayerCard from '../components/PlayerCard';
import HangmanGallows from '../components/HangmanGallows';
import WordDisplay from '../components/WordDisplay';
import LetterKeyboard from '../components/LetterKeyboard';
import WordSetter from '../components/WordSetter';
import ChimpBoard from '../components/ChimpBoard';
import VisualMemoryBoard from '../components/VisualMemoryBoard';
import LoadingLine from '../components/loading/LoadingLine';
import {
  TicTacToeIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon, TypingIcon, MathIcon,
  ConnectFourIcon, GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon,
  TwoTruthsIcon, BluffIcon, WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon, WordDuelIcon, BlockadeIcon, PairsIcon,
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
import { applyGuess, isWordGuessed, countWrong, MAX_WRONG, wordStructure } from '../lib/hangmanLogic';
import { markGuess, isValidGuess, getKeyboardState, MAX_GUESSES as WD_MAX_GUESSES, WORD_LENGTH as WD_WORD_LENGTH } from '../lib/wordduelLogic';
import {
  generateGrid, findPath, scoreWord, scoreWords, canonicalize,
  neighborsOf, COUNTDOWN_MS, ROUND_MS,
} from '../lib/wordhuntLogic'
import { loadDictionary } from '../lib/wordhuntDictionary'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
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

function DemoFallback() {
  return <LoadingLine className="py-12" />
}

function generateNumberLocal(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
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
                <p className="font-pixel text-[10px] text-retro-cta arcade-blink">GUESS A LETTER</p>
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
                    letter && mark ? 'text-retro-bg' : letter ? 'text-retro-text' : '',
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
              const bg = s === 'G' ? 'bg-retro-win text-retro-bg' : s === 'Y' ? 'bg-[rgb(var(--c-cta))] text-retro-bg' : s === 'B' ? 'bg-retro-dim text-retro-bg' : 'bg-retro-structure text-retro-text'
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
          className="mt-3 px-4 py-1.5 rounded text-xs font-bold uppercase bg-retro-cta text-retro-bg hover:opacity-90"
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
          className="mt-2 px-4 py-1.5 rounded text-xs font-bold uppercase bg-retro-cta text-retro-bg hover:opacity-90"
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

function pad2WH(n) { return String(n).padStart(2, '0') }
function fmtTimeWH(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${pad2WH(s % 60)}`
}
function displayLetterWH(letter) {
  return letter === 'q' ? 'Qu' : String(letter ?? '').toUpperCase()
}

// Self-contained practice round — own grid/timer/drag-trace, no networking,
// no shared UI code with WordHuntGame.jsx (per spec §0 finding 7 / §6.6).
function WordHuntDemo() {
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000_000))
  const grid = generateGrid(seed)

  const [dict, setDict] = useState(null)
  const [dictError, setDictError] = useState(false)
  const [retrying, runRetry] = useBusy()

  useEffect(() => {
    let cancelled = false
    loadDictionary()
      .then((d) => { if (!cancelled) setDict(d) })
      .catch(() => { if (!cancelled) setDictError(true) })
    return () => { cancelled = true }
  }, [])

  // RETRY button handler — mirrors WordHuntGame.jsx's retryDictionary: wrapped
  // in useBusy so a double-tap can't fire two concurrent retries, and a
  // failure toasts instead of leaving the button silently inert.
  const retryDictionary = () => {
    runRetry(async () => {
      setDictError(false)
      const d = await loadDictionary()
      setDict(d)
    }, () => {
      setDictError(true)
      toast.error("COULDN'T LOAD WORD LIST — TRY AGAIN")
    })
  }

  const [startedAt, setStartedAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [words, setWords] = useState([])
  const [score, setScore] = useState(0)
  const [lastResult, setLastResult] = useState(null)
  const [botScore, setBotScore] = useState(null)
  const [path, setPath] = useState([])
  const [dragging, setDragging] = useState(false)
  const [typedWord, setTypedWord] = useState('')
  const [inputShake, setInputShake] = useState(null)

  const foundWordsRef = useRef(new Set())
  const draggingRef = useRef(false)
  const pathRef = useRef([])
  const doneRef = useRef(false)
  const resultIdRef = useRef(0)
  const shakeTimerRef = useRef(null)

  const isCountdown = !!startedAt && now < startedAt + COUNTDOWN_MS
  const isPlaying = !!startedAt && now >= startedAt + COUNTDOWN_MS
    && now < startedAt + COUNTDOWN_MS + ROUND_MS
  const countdownSec = isCountdown ? Math.ceil((startedAt + COUNTDOWN_MS - now) / 1000) : 0
  const deadline = startedAt ? startedAt + COUNTDOWN_MS + ROUND_MS : null
  const timeLeftMs = deadline ? Math.max(0, deadline - now) : ROUND_MS
  const isDone = !!startedAt && now >= (startedAt + COUNTDOWN_MS + ROUND_MS)

  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= startedAt + COUNTDOWN_MS + ROUND_MS && !doneRef.current) {
        doneRef.current = true
        setBotScore(Math.floor(Math.random() * 40) + 20)
      }
    }, 100)
    return () => clearInterval(id)
  }, [startedAt])

  const rawWordFromPath = (p) => p.map((i) => (grid[i] === 'q' ? 'qu' : grid[i])).join('')

  // Flashes/shakes are driven directly from this handler (a plain event-driven
  // function, not an effect body) rather than reacting to `lastResult` via a
  // separate useEffect — avoids a react-hooks/set-state-in-effect violation
  // (see WordHuntGame.jsx's own note on this same lint rule).
  const handleSubmit = (rawWord) => {
    if (!dict || !isPlaying) return
    const word = canonicalize(rawWord)
    clearTimeout(shakeTimerRef.current)

    const reject = (kind) => {
      setInputShake(kind)
      setLastResult({ kind, id: ++resultIdRef.current })
      // Clear any stale path left over from a previous valid find — otherwise
      // this rejection's amber flash paints tiles that already scored a point
      // (see WordHuntGame.jsx's WordGrid effect for the same fix in the
      // multiplayer version).
      setPath([])
      shakeTimerRef.current = setTimeout(() => setInputShake(null), 400)
    }

    if (word.length < 3) { sounds.miss(); reject('invalid'); return }
    if (foundWordsRef.current.has(word)) { reject('duplicate'); return }
    if (!dict.has(word)) { sounds.miss(); reject('invalid'); return }
    const p = findPath(grid, word)
    if (!p) { sounds.miss(); reject('invalid'); return }

    foundWordsRef.current.add(word)
    const newWords = [...words, word]
    setWords(newWords)
    setScore(scoreWords(newWords))
    sounds.hit(newWords.length)
    setLastResult({ kind: 'valid', id: ++resultIdRef.current })
    setPath(p)
    shakeTimerRef.current = setTimeout(() => { if (!draggingRef.current) setPath([]) }, 500)
  }

  // Cleanup only — no setState here, so this effect never risks the
  // set-state-in-effect rule.
  useEffect(() => () => clearTimeout(shakeTimerRef.current), [])

  const startDrag = (index) => {
    if (!isPlaying) return
    draggingRef.current = true
    pathRef.current = [index]
    setDragging(true)
    setPath([index])
  }

  const handlePointerMove = (e) => {
    if (!draggingRef.current || !isPlaying) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest?.('[data-wh-cell]')
    if (!cellEl) return
    const idx = Number(cellEl.dataset.whCell)
    const last = pathRef.current[pathRef.current.length - 1]
    if (idx === last || pathRef.current.includes(idx)) return
    if (!neighborsOf(last).includes(idx)) return
    pathRef.current = [...pathRef.current, idx]
    setPath(pathRef.current)
  }

  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const finalPath = pathRef.current
    if (finalPath.length > 0) handleSubmit(rawWordFromPath(finalPath))
  }

  useEffect(() => {
    if (!isPlaying) return
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        setTypedWord((w) => {
          if (w.length > 0) handleSubmit(w)
          return ''
        })
      } else if (e.key === 'Backspace') {
        setTypedWord((w) => w.slice(0, -1))
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        setTypedWord((w) => (w.length < 20 ? w + e.key.toUpperCase() : w))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSubmit closes over current words/dict each render; re-binding per render is fine here (demo only)
  }, [isPlaying])

  const cellState = (index) => {
    const pos = path.indexOf(index)
    if (pos === -1) return 'idle'
    if (dragging) return 'path'
    if (lastResult?.kind === 'valid') return 'valid'
    if (lastResult?.kind === 'duplicate') return 'duplicate'
    if (lastResult?.kind === 'invalid') return 'invalid'
    return 'path'
  }

  const reset = () => {
    setStartedAt(null)
    setNow(Date.now())
    setWords([])
    setScore(0)
    setLastResult(null)
    setBotScore(null)
    setPath([])
    foundWordsRef.current = new Set()
    doneRef.current = false
  }

  if (!dict) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <LoadingLine />
        {dictError && (
          <>
            <p className="font-pixel text-[9px] text-retro-p2 mt-3">COULDN&apos;T LOAD WORD LIST</p>
            <button
              onClick={retryDictionary}
              disabled={retrying}
              className="mt-2 px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-50"
            >
              {retrying ? 'RETRYING…' : 'RETRY'}
            </button>
          </>
        )}
      </div>
    )
  }

  if (isDone) {
    const bot = botScore ?? 0
    const result = score > bot ? 'win' : score < bot ? 'lose' : 'draw'
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <p className={cn(
          'text-sm font-bold',
          result === 'win' ? 'text-retro-win' : result === 'draw' ? 'text-retro-text' : 'text-retro-dim',
        )}>
          {result === 'win' ? 'YOU WIN!' : result === 'draw' ? 'DRAW' : 'BOT WINS'}
        </p>
        <div className="flex gap-6 text-xs text-retro-dim">
          <span>YOU: {score} ({words.length} words)</span>
          <span>BOT: {bot}</span>
        </div>
        <button
          className="mt-2 px-4 py-1.5 rounded text-xs font-bold uppercase bg-retro-cta text-retro-bg hover:opacity-90"
          onClick={reset}
        >
          PLAY AGAIN
        </button>
      </div>
    )
  }

  if (!startedAt) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
          <p>● TRACE ADJACENT TILES (DIAGONALS COUNT)</p>
          <p>✎ ≥3 LETTERS · NO REUSING A TILE · Qu COUNTS AS 2</p>
          <p>⏱ 80-SECOND HUNT · HIGHEST SCORE WINS</p>
        </div>
        <button
          onClick={() => setStartedAt(Date.now())}
          className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          READY
        </button>
      </div>
    )
  }

  if (isCountdown) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
        <p className="font-pixel text-7xl text-retro-win text-glow-win">{countdownSec}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="flex items-center gap-3">
        <div className="bg-retro-card border border-retro-border rounded px-3 py-1.5 text-center min-w-[4rem]">
          <p className={cn(
            'font-pixel text-[18px] tabular-nums leading-none',
            timeLeftMs < 10_000 ? 'text-retro-p2 text-glow-p2 arcade-blink' : 'text-retro-win',
          )}>
            {fmtTimeWH(timeLeftMs)}
          </p>
          <p className="font-pixel text-[7px] text-retro-dim mt-0.5">TIME LEFT</p>
        </div>
        <p className="font-pixel text-[10px] text-retro-text">SCORE: {score}</p>
      </div>

      <div
        className="relative grid grid-cols-4 gap-2 max-w-xs mx-auto touch-none select-none"
        style={{ touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
      >
        {Array.from({ length: 16 }, (_, i) => {
          const state = cellState(i)
          return (
            <div
              key={i}
              data-wh-cell={i}
              className="aspect-square"
              onPointerDown={() => startDrag(i)}
            >
              <div
                className={cn(
                  'w-full h-full flex items-center justify-center rounded border font-pixel select-none',
                  'text-sm sm:text-base transition-colors duration-150',
                  state === 'idle' && 'bg-retro-card border-retro-border text-retro-text',
                  state === 'path' && 'bg-retro-tint-cta border-retro-cta text-retro-cta',
                  state === 'valid' && 'bg-retro-win border-retro-win text-retro-bg',
                  state === 'duplicate' && 'bg-retro-tint-cta border-retro-cta text-retro-cta',
                  state === 'invalid' && 'bg-retro-tint-p2 border-retro-p2 text-retro-p2',
                )}
              >
                {displayLetterWH(grid[i])}
              </div>
            </div>
          )
        })}
      </div>

      <div
        className={cn(
          'mx-auto max-w-xs rounded border px-3 py-2 text-center transition-colors w-full',
          inputShake === 'duplicate' && 'border-retro-cta bg-retro-tint-cta',
          inputShake === 'invalid' && 'border-retro-p2 bg-retro-tint-p2',
          !inputShake && 'border-retro-border bg-retro-card',
        )}
      >
        <span className="font-pixel text-xs tracking-widest text-retro-text">
          {typedWord || <span className="opacity-30">TYPE A WORD…</span>}
        </span>
      </div>

      <div className="bg-retro-card border border-retro-border rounded p-2 max-h-32 overflow-y-auto w-full max-w-xs">
        {words.length === 0 ? (
          <p className="font-pixel text-[9px] text-retro-dim text-center py-3">TRACE OR TYPE WORDS TO FIND THEM HERE</p>
        ) : (
          <ul className="space-y-1">
            {[...words].reverse().map((w, i) => (
              <li key={`${w}-${words.length - i}`} className="flex justify-between font-mono text-xs text-retro-text px-1">
                <span className="uppercase tracking-wide">{w}</span>
                <span className="text-retro-win font-pixel text-[9px]">{scoreWord(w)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
  { type: 'wordhunt',     short: 'WORD\nHUNT',    Icon: WordHuntIcon,     Component: WordHuntDemo     },
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
