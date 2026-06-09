import { useState } from 'react';
import Board from '../components/Board';
import GameStatus from '../components/GameStatus';
import PlayerCard from '../components/PlayerCard';
import WaitingRoom from '../components/WaitingRoom';
import { getWinner } from '../lib/gameLogic';

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
    <div className="min-h-screen bg-gray-950 flex flex-col items-center p-4 pt-5">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-amber-400 bg-amber-950/60 border border-amber-700 rounded px-2 py-1">
            Demo mode — local play only
          </span>
          <span className="text-gray-700 font-mono text-xs tracking-widest">DEMO</span>
        </div>
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
        <div className="border-t border-gray-800 pt-4">
          <p className="text-gray-600 text-xs text-center mb-3">Waiting room preview</p>
          <WaitingRoom gameId="DEMO01" />
        </div>
      </div>
    </div>
  );
}
