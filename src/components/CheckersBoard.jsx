import { cn } from "@/lib/utils";

// One 8×8 checkers grid. Purely presentational — the page owns selection state.
// Cell encoding mirrors checkersLogic: '' | 'x' | 'X' | 'o' | 'O'
// (lowercase man, uppercase king). Dark playable squares: (r+c)%2===1.

const SIZE = 8;

export default function CheckersBoard({
  board = [], // string[64]
  selected = null, // index | null
  legalTargets = [], // [{ to, path }] for the selected piece
  onSelect, // (cell) => void — target or own-piece clicks
  disabled = false,
  accent = "p1", // viewer's side: highlights + which pieces are selectable
  lastFrom = null,
  lastTo = null,
}) {
  const accentBg = accent === "p1" ? "bg-retro-p1" : "bg-retro-p2";
  const ownChars = accent === "p1" ? ["x", "X"] : ["o", "O"];

  const targetsByTo = new Map(legalTargets.map((t) => [t.to, t]));
  const hopCells = new Set();
  for (const t of legalTargets) {
    for (let i = 0; i < t.path.length - 1; i++) hopCells.add(t.path[i]);
  }

  const handle = (cell) => {
    if (disabled || !onSelect) return;
    if (targetsByTo.has(cell) || ownChars.includes(board[cell])) onSelect(cell);
  };

  return (
    <div className={cn("grid grid-cols-8 gap-[2px] select-none", disabled && "opacity-70")}>
      {board.map((p, cell) => {
        const r = Math.floor(cell / SIZE);
        const c = cell % SIZE;
        const dark = (r + c) % 2 === 1;
        const isTarget = targetsByTo.has(cell);
        const isHop = hopCells.has(cell);
        const isSelected = cell === selected;
        const isOwn = ownChars.includes(p);
        const isKing = p === "X" || p === "O";
        const clickable = !disabled && (isTarget || isOwn);
        return (
          <button
            key={cell}
            onClick={() => handle(cell)}
            disabled={!clickable}
            aria-label={`${r}${c}${isKing ? " king" : p ? "" : " empty"}`}
            className={cn(
              "aspect-square min-w-[30px] rounded-[3px] flex items-center justify-center relative transition-colors",
              dark ? "bg-retro-deep" : "bg-retro-surface",
              isSelected && `ring-2 ${accent === "p1" ? "ring-retro-p1" : "ring-retro-p2"}`,
              isTarget && dark && "bg-retro-card",
              cell === lastFrom && "ring-1 ring-retro-border",
              cell === lastTo && `ring-1 ${accent === "p1" ? "ring-retro-p1/60" : "ring-retro-p2/60"}`,
              clickable && "cursor-pointer hover:brightness-125",
              isOwn && !disabled && "cursor-pointer",
            )}
          >
            {p && (
              <span
                className={cn(
                  "rounded-full flex items-center justify-center w-[78%] h-[78%] border-2 font-pixel text-[9px]",
                  p === "x" || p === "X"
                    ? "bg-retro-p1 border-retro-p1 text-retro-bg shadow-neon-p1"
                    : "bg-retro-p2 border-retro-p2 text-retro-bg shadow-neon-p2",
                  isKing && "ring-2 ring-offset-1 ring-offset-transparent",
                  isKing &&
                    (p === "X"
                      ? "ring-retro-bg/80 shadow-neon-p1"
                      : "ring-retro-bg/80 shadow-neon-p2"),
                )}
              >
                {isKing ? "★" : ""}
              </span>
            )}
            {isHop && (
              <span
                className={cn(
                  "absolute inset-0 m-auto w-[22%] h-[22%] rounded-full opacity-60",
                  accentBg,
                )}
              />
            )}
            {isTarget && (
              <span
                className={cn(
                  "absolute inset-0 m-auto w-[38%] h-[38%] rounded-full animate-pulse",
                  accentBg,
                  "shadow-glow-dot",
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
