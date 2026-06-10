import { useState, useRef, useEffect } from 'react';
import Board from '../components/Board';
import DotsAndBoxesBoard from '../components/DotsAndBoxesBoard';
import SosBoard from '../components/SosBoard';
import SimonBoard from '../components/SimonBoard';
import GameStatus from '../components/GameStatus';
import PlayerCard from '../components/PlayerCard';
import HangmanGallows from '../components/HangmanGallows';
import WordDisplay from '../components/WordDisplay';
import LetterKeyboard from '../components/LetterKeyboard';
import WordSetter from '../components/WordSetter';
import ChimpBoard from '../components/ChimpBoard';
import VisualMemoryBoard from '../components/VisualMemoryBoard';
import {
  TicTacToeIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon,
} from '../components/GameIcons';
import { getWinner } from '../lib/gameLogic';
import { applyGuess, isWordGuessed, countWrong, MAX_WRONG } from '../lib/hangmanLogic';
import {
  DB_EDGE_COUNT, DB_BOX_COUNT, applyEdgeMove, getDotsAndBoxesWinner,
} from '../lib/dotsAndBoxesLogic';
import {
  SOS_CELL_COUNT, normalizeSosLines, applySosMove, getSosWinner,
} from '../lib/sosLogic';
import { applySimonMove, normalizeSimonSequence } from '../lib/simonLogic';
import { normalizeChimpLayout, generateChimpLayout, CHIMP_START_LEVEL } from '../lib/chimpLogic';
import { applyVmMove, normalizeVmArray, generateVmPattern, VM_START_LEVEL } from '../lib/visualMemoryLogic';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import ThemeSwitcher from '../components/ThemeSwitcher';

function generateNumberLocal(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

// ─── Game demos ──────────────────────────────────────────────────────────────

function TicTacToeDemo() {
  const [board, setBoard] = useState(Array(9).fill(''))
  const [currentTurn, setCurrentTurn] = useState('X')
  const [status, setStatus] = useState('playing')
  const [winner, setWinner] = useState(null)
  const [winningLine, setWinningLine] = useState([])

  const handleMove = (index) => {
    if (status !== 'playing' || board[index]) return
    const newBoard = [...board]
    newBoard[index] = currentTurn
    const result = getWinner(newBoard)
    setBoard(newBoard)
    if (result) { setWinner(result.winner); setWinningLine(result.line); setStatus('finished') }
    else setCurrentTurn(currentTurn === 'X' ? 'O' : 'X')
  }

  const reset = () => {
    setBoard(Array(9).fill('')); setCurrentTurn('X')
    setStatus('playing'); setWinner(null); setWinningLine([])
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <PlayerCard name="Alice" symbol="X" isActive={status === 'playing' && currentTurn === 'X'} isMe />
        <PlayerCard name="Bob" symbol="O" isActive={status === 'playing' && currentTurn === 'O'} isMe={false} />
      </div>
      <Board board={board} onMove={handleMove} disabled={status !== 'playing'} winningLine={winningLine} />
      <GameStatus status={status} winner={winner} currentTurn={currentTurn} mySymbol="X"
        onPlayAgain={status === 'finished' ? reset : null} />
    </div>
  )
}

function HangmanDemo() {
  const [phase, setPhase] = useState('setting')
  const [word, setWord] = useState('')
  const [guesses, setGuesses] = useState({})
  const [result, setResult] = useState(null)
  const [wrongCount, setWrongCount] = useState(0)
  const [stepperCount, setStepperCount] = useState(0)

  const handleWordSet = (w) => {
    setWord(w); setGuesses({}); setWrongCount(0); setResult(null); setPhase('guessing')
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
    setPhase('setting'); setWord(''); setGuesses({}); setWrongCount(0); setResult(null)
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
            <WordDisplay wordLength={word.length} guesses={guesses}
              revealedWord={phase === 'reveal' ? word : null} />
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

function DotsAndBoxesDemo() {
  const [edges, setEdges] = useState(Array(DB_EDGE_COUNT).fill(''))
  const [boxes, setBoxes] = useState(Array(DB_BOX_COUNT).fill(''))
  const [currentTurn, setCurrentTurn] = useState('X')
  const [status, setStatus] = useState('playing')
  const [winner, setWinner] = useState(null)

  const handleMove = (index) => {
    if (status !== 'playing') return
    const result = applyEdgeMove(edges, boxes, index, currentTurn)
    if (!result) return
    const gameResult = getDotsAndBoxesWinner(result.boxes)
    setEdges(result.edges); setBoxes(result.boxes)
    if (gameResult) { setWinner(gameResult.winner); setStatus('finished') }
    else if (result.completedBoxes.length === 0) setCurrentTurn(currentTurn === 'X' ? 'O' : 'X')
  }

  const reset = () => {
    setEdges(Array(DB_EDGE_COUNT).fill('')); setBoxes(Array(DB_BOX_COUNT).fill(''))
    setCurrentTurn('X'); setStatus('playing'); setWinner(null)
  }

  return (
    <div className="space-y-4">
      <DotsAndBoxesBoard board={edges} boxes={boxes} onMove={handleMove}
        disabled={status !== 'playing'} currentTurn={currentTurn} />
      <div className="text-center space-y-2">
        {status === 'playing' ? (
          <p className="font-pixel text-[10px] text-retro-cta animate-pulse">{currentTurn}&apos;S TURN</p>
        ) : (
          <p className={cn('font-pixel text-[10px]',
            winner === 'X' ? 'text-retro-p1' : winner === 'O' ? 'text-retro-p2' : 'text-retro-dim')}>
            {winner === 'draw' ? 'DRAW!' : `${winner} WINS!`}
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

function SosDemo() {
  const [board, setBoard] = useState(Array(SOS_CELL_COUNT).fill(''))
  const [sosLines, setSosLines] = useState([])
  const [currentTurn, setCurrentTurn] = useState('X')
  const [status, setStatus] = useState('playing')
  const [winner, setWinner] = useState(null)

  const handleMove = ({ index, letter }) => {
    if (status !== 'playing') return
    const lines = normalizeSosLines(sosLines)
    const result = applySosMove(board, lines, index, letter, currentTurn)
    if (!result) return
    const gameResult = getSosWinner(result.board, result.sosLines)
    setBoard(result.board); setSosLines(result.sosLines)
    if (gameResult) { setWinner(gameResult.winner); setStatus('finished') }
    else if (result.completedCount === 0) setCurrentTurn(currentTurn === 'X' ? 'O' : 'X')
  }

  const reset = () => {
    setBoard(Array(SOS_CELL_COUNT).fill('')); setSosLines([])
    setCurrentTurn('X'); setStatus('playing'); setWinner(null)
  }

  return (
    <div className="space-y-4">
      <SosBoard board={board} sosLines={sosLines} onMove={handleMove}
        disabled={status !== 'playing'} currentTurn={currentTurn} />
      <div className="text-center space-y-2">
        {status === 'playing' ? (
          <p className="font-pixel text-[10px] text-retro-cta animate-pulse">{currentTurn}&apos;S TURN</p>
        ) : (
          <p className={cn('font-pixel text-[10px]',
            winner === 'X' ? 'text-retro-p1' : winner === 'O' ? 'text-retro-p2' : 'text-retro-dim')}>
            {winner === 'draw' ? 'DRAW!' : `${winner} WINS!`}
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

// ─── Demo registry ────────────────────────────────────────────────────────────

const DEMOS = [
  { type: 'tictactoe',   short: 'TTT',        Icon: TicTacToeIcon,     Component: TicTacToeDemo    },
  { type: 'hangwoman',   short: 'HANGWOMAN',   Icon: HangwomanIcon,     Component: HangmanDemo      },
  { type: 'dotsandboxes',short: 'DOTS &\nBOXES',Icon: DotsAndBoxesIcon, Component: DotsAndBoxesDemo },
  { type: 'sos',         short: 'SOS',         Icon: SosIcon,           Component: SosDemo          },
  { type: 'simon',       short: 'SIMON',       Icon: SimonIcon,         Component: SimonDemo        },
  { type: 'chimp',       short: 'CHIMP\nTEST', Icon: ChimpIcon,         Component: ChimpDemo        },
  { type: 'numbermemory',short: 'NUM\nMEMORY', Icon: NumberMemoryIcon,  Component: NumberMemoryDemo },
  { type: 'visualmemory',short: 'VIS\nMEMORY', Icon: VisualMemoryIcon,  Component: VisualMemoryDemo },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Demo() {
  const [selected, setSelected] = useState('tictactoe')
  const active = DEMOS.find(d => d.type === selected)

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-5">
      <div className="w-full max-w-sm space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to="/" className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">
            ← HOME
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <span className="text-xs text-retro-cta bg-retro-tint-cta border border-retro-cta/60 rounded px-2 py-1 font-mono">
              Demo
            </span>
          </div>
        </div>

        {/* Game picker */}
        <div className="grid grid-cols-4 gap-2">
          {DEMOS.map(({ type, short, Icon }) => (
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
            </button>
          ))}
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
