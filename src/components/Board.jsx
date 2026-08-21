import Cell from './Cell';

export default function Board({ board, onMove, disabled, winningLine = [], lastMove = null, cols = 3 }) {
  return (
    <div className="grid gap-2 sm:gap-3 w-full max-w-[300px] sm:max-w-[360px] mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {board.map((cell, i) => (
        <Cell
          key={i}
          index={i}
          value={cell}
          onClick={onMove}
          disabled={disabled}
          isWinning={winningLine.includes(i)}
          isLastMove={i === lastMove}
        />
      ))}
    </div>
  );
}
