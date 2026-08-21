import { useEffect, useMemo, useRef, useState } from "react";
import CheckersBoard from "../components/CheckersBoard";
import {
  getLegalMoves,
  applyCheckersMove,
  getCheckersWinner,
  INITIAL_CHECKERS,
} from "../lib/checkersLogic";
import { sounds } from "../lib/sounds";
import { cn } from "@/lib/utils";

// Solo CHECKERS vs a greedy bot — fully local, no Firebase.

const BOT_DELAY_MS = 700;

function pieceCount(board, side) {
  return board.filter((p) => p && p.toUpperCase() === side).length;
}

// Greedy O: max captures, then crowning, then avoid landing where X can
// jump back next turn; ties broken by a little randomness.
function pickBotMove(board) {
  const moves = getLegalMoves(board, "O");
  if (!moves.length) return null;
  const scored = moves.map((m) => {
    const applied = applyCheckersMove(board, m.from, m.to);
    let score = m.captures.length * 100 + (m.promotes ? 50 : 0);
    const hunted =
      applied &&
      getLegalMoves(applied.board, "X").some((r) => r.captures.includes(m.to));
    if (hunted) score -= m.captures.length > 0 ? 10 : 40;
    score += Math.random() * 5;
    return { move: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

export default function CheckersDemo() {
  const [board, setBoard] = useState(INITIAL_CHECKERS);
  const [turn, setTurn] = useState("me");
  const [selected, setSelected] = useState(null);
  const [lastMove, setLastMove] = useState({ from: null, to: null });
  const [banner, setBanner] = useState(null);
  const [result, setResult] = useState(null); // null | 'win' | 'lose' | 'draw'
  const botTimerRef = useRef(null);

  const done = result !== null;
  const myTurn = turn === "me" && !done;

  const allMoves = useMemo(() => (myTurn ? getLegalMoves(board, "X") : []), [board, myTurn]);
  const forcedCapture = allMoves.some((m) => m.captures.length > 0);
  // Only pieces that actually have a legal move are selectable (forced-capture UX).
  const movableFroms = useMemo(
    () =>
      new Set(
        forcedCapture ? allMoves.filter((m) => m.captures.length > 0).map((m) => m.from) : allMoves.map((m) => m.from),
      ),
    [allMoves, forcedCapture],
  );
  const targets = useMemo(
    () => (selected === null ? [] : allMoves.filter((m) => m.from === selected)),
    [allMoves, selected],
  );

  // Bot driver: moves whenever it's the bot's turn.
  useEffect(() => {
    if (turn !== "bot" || done) return;
    botTimerRef.current = setTimeout(() => {
      const move = pickBotMove(board);
      if (!move) {
        setResult("win");
        sounds.win();
        return;
      }
      const applied = applyCheckersMove(board, move.from, move.to);
      if (!applied) {
        setTurn("me");
        return;
      }
      if (applied.promoted) sounds.bell();
      else if (move.captures.length > 0) sounds.bust();
      else sounds.move();
      if (move.captures.length > 1) setBanner(`BOT MULTI-JUMPS ${move.captures.length}!`);
      else if (move.captures.length > 0) setBanner("BOT TAKES A MAN");
      setLastMove({ from: move.from, to: move.to });
      setBoard(applied.board);
      const winner = getCheckersWinner(applied.board);
      if (winner) {
        setResult(winner.winner === "O" ? "lose" : winner.winner === "draw" ? "draw" : "win");
        if (winner.winner === "O") sounds.lose();
        else if (winner.winner === "draw") sounds.draw();
        else sounds.win();
        return;
      }
      setTurn("me");
    }, BOT_DELAY_MS);
    return () => clearTimeout(botTimerRef.current);
  }, [turn, done, board]);

  useEffect(() => () => clearTimeout(botTimerRef.current), []);

  // Auto-clear banners.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  const handleSelect = (cell) => {
    if (!myTurn) return;
    if (cell === selected) {
      setSelected(null);
      return;
    }
    if (movableFroms.has(cell)) {
      setSelected(cell);
      return;
    }
    const target = targets.find((t) => t.to === cell);
    if (!target || selected === null) return;
    const applied = applyCheckersMove(board, selected, target.to);
    setSelected(null);
    if (!applied) return;
    if (target.captures.length > 0) sounds.bust();
    else sounds.move();
    if (target.captures.length > 1) setBanner(`MULTI-JUMP! ${target.captures.length} TAKEN`);
    else if (target.captures.length > 0) setBanner("MAN TAKEN!");
    setLastMove({ from: selected, to: target.to });
    setBoard(applied.board);
    const winner = getCheckersWinner(applied.board);
    if (winner) {
      setResult(winner.winner === "O" ? "lose" : winner.winner === "draw" ? "draw" : "win");
      if (winner.winner === "O") sounds.lose();
      else if (winner.winner === "draw") sounds.draw();
      else sounds.win();
      return;
    }
    setTurn("bot");
  };

  const reset = () => {
    clearTimeout(botTimerRef.current);
    setBoard(INITIAL_CHECKERS());
    setTurn("me");
    setSelected(null);
    setLastMove({ from: null, to: null });
    setBanner(null);
    setResult(null);
    sounds.go();
  };

  const myMen = pieceCount(board, "X");
  const botMen = pieceCount(board, "O");

  return (
    <div className="space-y-4">
      {/* Status */}
      <p className={cn(
        "font-pixel text-[10px] text-center",
        done
          ? "text-retro-dim"
          : myTurn
            ? "text-retro-cta text-glow-cta arcade-blink"
            : "text-retro-dim arcade-blink",
      )}>
        {done ? "GAME OVER" : myTurn ? "YOUR MOVE" : "BOT THINKS…"}
      </p>
      {!done && forcedCapture && myTurn && (
        <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center">
          CAPTURE AVAILABLE — JUMPS ARE FORCED
        </p>
      )}

      {/* Banner */}
      {banner && (
        <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center">{banner}</p>
      )}

      <div className="flex justify-center">
        <div className="w-full max-w-[360px] space-y-2">
          <div className="flex justify-between font-pixel text-[8px] tracking-widest">
            <span className="text-retro-p2">BOT · {botMen} MEN</span>
            <span className="text-retro-dim">CHECKERS</span>
            <span className="text-retro-p1">YOU · {myMen} MEN</span>
          </div>
          <CheckersBoard
            board={board}
            selected={selected}
            legalTargets={targets}
            onSelect={handleSelect}
            disabled={!myTurn}
            accent="p1"
            lastFrom={lastMove.from}
            lastTo={lastMove.to}
          />
        </div>
      </div>

      {/* Actions */}
      {!done && (
        <button
          onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95"
        >
          ↺ NEW GAME
        </button>
      )}

      {done && (
        <div className="text-center space-y-2 pt-2">
          <p className={cn(
            "font-pixel text-sm",
            result === "win" ? "text-retro-win text-glow-win" : result === "draw" ? "text-retro-dim" : "text-retro-danger",
          )}>
            {result === "win" ? "BOT ELIMINATED — YOU WIN!" : result === "draw" ? "STALEMATE — DRAW" : "YOUR MEN ARE LOST"}
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
