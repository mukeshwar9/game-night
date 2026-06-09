import Cell from './Cell';

export default function Board({ board, onMove, disabled, winningLine = [] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[300px] sm:max-w-[360px] mx-auto">
      {board.map((cell, i) => (
        <Cell
          key={i}
          index={i}
          value={cell}
          onClick={onMove}
          disabled={disabled}
          isWinning={winningLine.includes(i)}
        />
      ))}
    </div>
  );
}
