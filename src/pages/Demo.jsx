import { useState } from 'react';
import Board from '../components/Board';
import DotsAndBoxesBoard from '../components/DotsAndBoxesBoard';
import SosBoard from '../components/SosBoard';
import SimonBoard from '../components/SimonBoard';
import GameStatus from '../components/GameStatus';
import PlayerCard from '../components/PlayerCard';
import WaitingRoom from '../components/WaitingRoom';
import HangmanGallows from '../components/HangmanGallows';
import WordDisplay from '../components/WordDisplay';
import LetterKeyboard from '../components/LetterKeyboard';
import WordSetter from '../components/WordSetter';
import { getWinner } from '../lib/gameLogic';
import { applyGuess, isWordGuessed, countWrong, MAX_WRONG } from '../lib/hangmanLogic';
import {
  DB_EDGE_COUNT,
  DB_BOX_COUNT,
  applyEdgeMove,
  getDotsAndBoxesWinner,
} from '../lib/dotsAndBoxesLogic';
import {
  SOS_CELL_COUNT,
  normalizeSosLines,
  applySosMove,
  getSosWinner,
} from '../lib/sosLogic';
import { applySimonMove, normalizeSimonSequence } from '../lib/simonLogic';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import ThemeSwitcher from '../components/ThemeSwitcher';

// Local hangman with no Firebase — both roles in one tab
function HangmanDemo() {
  const [phase, setPhase] = useState('setting'); // 'setting' | 'guessing' | 'reveal'
  const [word, setWord] = useState('');
  const [guesses, setGuesses] = useState({});
  const [result, setResult] = useState(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [stepperCount, setStepperCount] = useState(0);

  const handleWordSet = (w) => {
    setWord(w);
    setGuesses({});
    setWrongCount(0);
    setResult(null);
    setPhase('guessing');
  };

  const handleGuess = (letter) => {
    if (phase !== 'guessing' || letter in guesses) return;
    const positions = applyGuess(word, letter);
    const guessVal = positions.length > 0 ? positions : false;
    const newGuesses = { ...guesses, [letter]: guessVal };
    const newWrong = countWrong(newGuesses);
    setGuesses(newGuesses);
    setWrongCount(newWrong);

    if (isWordGuessed(word, newGuesses)) {
      setResult('guessed');
      setPhase('reveal');
    } else if (newWrong >= MAX_WRONG) {
      setResult('hanged');
      setPhase('reveal');
    }
  };

  const reset = () => {
    setPhase('setting');
    setWord('');
    setGuesses({});
    setWrongCount(0);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider">HANGWOMAN DEMO</p>

      {/* Gallows stepper (always visible) */}
      <div className="space-y-2">
        <p className="font-pixel text-[10px] text-retro-border text-center">GALLOWS PREVIEW</p>
        <HangmanGallows wrongCount={stepperCount} />
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setStepperCount(c => Math.max(0, c - 1))}
            className="px-3 py-1 font-pixel text-[10px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95"
          >
            –
          </button>
          <span className="font-pixel text-[10px] text-retro-dim self-center">{stepperCount}/{MAX_WRONG}</span>
          <button
            onClick={() => setStepperCount(c => Math.min(MAX_WRONG, c + 1))}
            className="px-3 py-1 font-pixel text-[10px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95"
          >
            +
          </button>
        </div>
      </div>

      <div className="border-t border-retro-border pt-4 space-y-4">
        <p className="font-pixel text-[10px] text-retro-border text-center">LIVE DEMO — ENTER WORD, THEN GUESS</p>

        {phase === 'setting' && (
          <WordSetter onWordSet={handleWordSet} />
        )}

        {(phase === 'guessing' || phase === 'reveal') && (
          <>
            <HangmanGallows wrongCount={wrongCount} />
            <WordDisplay
              wordLength={word.length}
              guesses={guesses}
              revealedWord={phase === 'reveal' ? word : null}
            />
            <div className="text-center space-y-1">
              {phase === 'reveal' ? (
                <>
                  <p className={cn(
                    'font-pixel text-xs',
                    result === 'guessed' ? 'text-retro-p1' : 'text-retro-p2',
                  )}>
                    {result === 'guessed' ? 'WORD GUESSED!' : 'HANGED!'}
                  </p>
                  <p className="font-mono text-[10px] text-retro-dim">
                    Word: <span className="text-retro-cta">{word}</span>
                  </p>
                  <button
                    onClick={reset}
                    className="mt-2 px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
                  >
                    PLAY AGAIN
                  </button>
                </>
              ) : (
                <p className="font-pixel text-[10px] text-retro-cta animate-pulse">
                  GUESS A LETTER
                </p>
              )}
              <p className="font-mono text-[10px] text-retro-dim">{wrongCount}/{MAX_WRONG} wrong</p>
            </div>
            {phase === 'guessing' && (
              <LetterKeyboard guesses={guesses} onGuess={handleGuess} disabled={false} />
            )}
          </>
        )}
      </div>
    </div>
  );
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
    setEdges(result.edges)
    setBoxes(result.boxes)
    if (gameResult) {
      setWinner(gameResult.winner)
      setStatus('finished')
    } else if (result.completedBoxes.length === 0) {
      setCurrentTurn(currentTurn === 'X' ? 'O' : 'X')
    }
    // extra turn: currentTurn stays if boxes were completed
  }

  const reset = () => {
    setEdges(Array(DB_EDGE_COUNT).fill(''))
    setBoxes(Array(DB_BOX_COUNT).fill(''))
    setCurrentTurn('X')
    setStatus('playing')
    setWinner(null)
  }

  return (
    <div className="space-y-4">
      <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider">DOTS &amp; BOXES DEMO</p>
      <DotsAndBoxesBoard
        board={edges}
        boxes={boxes}
        onMove={handleMove}
        disabled={status !== 'playing'}
        currentTurn={currentTurn}
      />
      <div className="text-center space-y-2">
        {status === 'playing' ? (
          <p className="font-pixel text-[10px] text-retro-cta animate-pulse">
            {currentTurn === 'X' ? 'X' : 'O'}&apos;S TURN
          </p>
        ) : (
          <p className={cn(
            'font-pixel text-[10px]',
            winner === 'X' ? 'text-retro-p1' : winner === 'O' ? 'text-retro-p2' : 'text-retro-dim',
          )}>
            {winner === 'draw' ? 'DRAW!' : `${winner} WINS!`}
          </p>
        )}
        <button
          onClick={reset}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
        >
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
    setBoard(result.board)
    setSosLines(result.sosLines)
    if (gameResult) {
      setWinner(gameResult.winner)
      setStatus('finished')
    } else if (result.completedCount === 0) {
      setCurrentTurn(currentTurn === 'X' ? 'O' : 'X')
    }
    // extra turn: currentTurn stays if completedCount > 0
  }

  const reset = () => {
    setBoard(Array(SOS_CELL_COUNT).fill(''))
    setSosLines([])
    setCurrentTurn('X')
    setStatus('playing')
    setWinner(null)
  }

  return (
    <div className="space-y-4">
      <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider">SOS DEMO</p>
      <SosBoard
        board={board}
        sosLines={sosLines}
        onMove={handleMove}
        disabled={status !== 'playing'}
        currentTurn={currentTurn}
      />
      <div className="text-center space-y-2">
        {status === 'playing' ? (
          <p className="font-pixel text-[10px] text-retro-cta animate-pulse">
            {currentTurn}&apos;S TURN
          </p>
        ) : (
          <p className={cn(
            'font-pixel text-[10px]',
            winner === 'X' ? 'text-retro-p1' : winner === 'O' ? 'text-retro-p2' : 'text-retro-dim',
          )}>
            {winner === 'draw' ? 'DRAW!' : `${winner} WINS!`}
          </p>
        )}
        <button
          onClick={reset}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
        >
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
    const game = { simonSequence: seq, simonProgress: progress }
    const r = applySimonMove(game, padIndex, currentTurn)
    if (!r) return
    if (r.result) {
      setWinner(r.result.winner)
      setStatus('finished')
      return
    }
    const { simonSequence, simonProgress, currentTurn: nextTurn } = r.updates
    if (simonSequence !== undefined) setSeq(normalizeSimonSequence(simonSequence))
    if (simonProgress !== undefined) setProgress(simonProgress)
    if (nextTurn !== undefined) setCurrentTurn(nextTurn)
  }

  const reset = () => {
    setSeq([])
    setProgress(0)
    setCurrentTurn('X')
    setStatus('playing')
    setWinner(null)
  }

  return (
    <div className="space-y-4">
      <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider">SIMON DEMO</p>
      <div className="grid grid-cols-2 gap-2">
        <PlayerCard name="Alice" symbol="X" isActive={status === 'playing' && currentTurn === 'X'} isMe />
        <PlayerCard name="Bob" symbol="O" isActive={status === 'playing' && currentTurn === 'O'} isMe={false} />
      </div>
      <SimonBoard
        onMove={handleMove}
        disabled={status !== 'playing'}
        simonSequence={seq}
        simonProgress={progress}
      />
      <div className="text-center space-y-2">
        {status === 'finished' && (
          <p className={cn(
            'font-pixel text-[10px]',
            winner === 'X' ? 'text-retro-p1' : 'text-retro-p2',
          )}>
            {winner} WINS!
          </p>
        )}
        <button
          onClick={reset}
          className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
        >
          RESET
        </button>
      </div>
    </div>
  )
}

export default function Demo() {
  const [board, setBoard] = useState(Array(9).fill(''));
  const [currentTurn, setCurrentTurn] = useState('X');
  const [status, setStatus] = useState('playing');
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState([]);
  const mySymbol = 'X';

  const handleMove = (index) => {
    if (status !== 'playing' || board[index]) return;
    const newBoard = [...board];
    newBoard[index] = currentTurn;
    const result = getWinner(newBoard);
    setBoard(newBoard);
    if (result) {
      setWinner(result.winner);
      setWinningLine(result.line);
      setStatus('finished');
    } else {
      setCurrentTurn(currentTurn === 'X' ? 'O' : 'X');
    }
  };

  const reset = () => {
    setBoard(Array(9).fill(''));
    setCurrentTurn('X');
    setStatus('playing');
    setWinner(null);
    setWinningLine([]);
  };

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-5">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/" className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">
            ← HOME
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <span className="text-xs text-retro-cta bg-retro-tint-cta border border-retro-cta/60 rounded px-2 py-1 font-mono">
              Demo — local only
            </span>
          </div>
        </div>

        {/* Hangman demo */}
        <div className="border border-retro-border rounded p-4 bg-retro-card">
          <HangmanDemo />
        </div>

        {/* TicTacToe demo */}
        <div className="border-t border-retro-border pt-4 space-y-4">
          <p className="font-pixel text-[10px] text-retro-border text-center tracking-wider">TIC TAC TOE DEMO</p>
          <div className="grid grid-cols-2 gap-2">
            <PlayerCard name="Alice" symbol="X" isActive={status === 'playing' && currentTurn === 'X'} isMe />
            <PlayerCard name="Bob" symbol="O" isActive={status === 'playing' && currentTurn === 'O'} isMe={false} />
          </div>
          <Board board={board} onMove={handleMove} disabled={status !== 'playing'} winningLine={winningLine} />
          <GameStatus
            status={status}
            winner={winner}
            currentTurn={currentTurn}
            mySymbol={mySymbol}
            onPlayAgain={status === 'finished' ? reset : null}
          />
        </div>

        {/* Dots and Boxes demo */}
        <div className="border-t border-retro-border pt-4">
          <div className="border border-retro-border rounded p-4 bg-retro-card">
            <DotsAndBoxesDemo />
          </div>
        </div>

        {/* SOS demo */}
        <div className="border-t border-retro-border pt-4">
          <div className="border border-retro-border rounded p-4 bg-retro-card">
            <SosDemo />
          </div>
        </div>

        {/* Simon demo */}
        <div className="border-t border-retro-border pt-4">
          <div className="border border-retro-border rounded p-4 bg-retro-card">
            <SimonDemo />
          </div>
        </div>

        <div className="border-t border-retro-border pt-4">
          <p className="text-retro-border text-xs text-center font-pixel text-[10px] mb-3">WAITING ROOM PREVIEW</p>
          <WaitingRoom gameId="DEMO01" />
        </div>
      </div>
    </div>
  );
}
