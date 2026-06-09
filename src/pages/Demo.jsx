import { useState } from 'react';
import Board from '../components/Board';
import GameStatus from '../components/GameStatus';
import PlayerCard from '../components/PlayerCard';
import WaitingRoom from '../components/WaitingRoom';
import HangmanGallows from '../components/HangmanGallows';
import WordDisplay from '../components/WordDisplay';
import LetterKeyboard from '../components/LetterKeyboard';
import WordSetter from '../components/WordSetter';
import { getWinner } from '../lib/gameLogic';
import { applyGuess, isWordGuessed, countWrong, MAX_WRONG } from '../lib/hangmanLogic';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

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
      <p className="font-pixel text-[9px] text-retro-dim text-center tracking-wider">HANGWOMAN DEMO</p>

      {/* Gallows stepper (always visible) */}
      <div className="space-y-2">
        <p className="font-pixel text-[8px] text-retro-border text-center">GALLOWS PREVIEW</p>
        <HangmanGallows wrongCount={stepperCount} />
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setStepperCount(c => Math.max(0, c - 1))}
            className="px-3 py-1 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-cyan/50 active:scale-95"
          >
            –
          </button>
          <span className="font-pixel text-[9px] text-retro-dim self-center">{stepperCount}/{MAX_WRONG}</span>
          <button
            onClick={() => setStepperCount(c => Math.min(MAX_WRONG, c + 1))}
            className="px-3 py-1 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-cyan/50 active:scale-95"
          >
            +
          </button>
        </div>
      </div>

      <div className="border-t border-retro-border pt-4 space-y-4">
        <p className="font-pixel text-[8px] text-retro-border text-center">LIVE DEMO — ENTER WORD, THEN GUESS</p>

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
                    result === 'guessed' ? 'text-retro-cyan' : 'text-retro-pink',
                  )}>
                    {result === 'guessed' ? 'WORD GUESSED!' : 'HANGED!'}
                  </p>
                  <p className="font-mono text-[10px] text-retro-dim">
                    Word: <span className="text-retro-yellow">{word}</span>
                  </p>
                  <button
                    onClick={reset}
                    className="mt-2 px-5 py-2 font-pixel text-[9px] border border-retro-cyan text-retro-cyan rounded hover:shadow-neon-cyan active:scale-95"
                  >
                    PLAY AGAIN
                  </button>
                </>
              ) : (
                <p className="font-pixel text-[9px] text-retro-yellow animate-pulse">
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
          <Link to="/" className="font-pixel text-[9px] text-retro-dim hover:text-retro-cyan transition-colors">
            ← HOME
          </Link>
          <span className="text-xs text-amber-400 bg-amber-950/60 border border-amber-700 rounded px-2 py-1 font-mono">
            Demo — local only
          </span>
        </div>

        {/* Hangman demo */}
        <div className="border border-retro-border rounded p-4 bg-retro-card">
          <HangmanDemo />
        </div>

        {/* TicTacToe demo */}
        <div className="border-t border-retro-border pt-4 space-y-4">
          <p className="font-pixel text-[8px] text-retro-border text-center tracking-wider">TIC TAC TOE DEMO</p>
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

        <div className="border-t border-retro-border pt-4">
          <p className="text-retro-border text-xs text-center font-pixel text-[8px] mb-3">WAITING ROOM PREVIEW</p>
          <WaitingRoom gameId="DEMO01" />
        </div>
      </div>
    </div>
  );
}
