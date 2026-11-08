import { useEffect, useMemo, useRef, useState } from "react";
import CheckersBoard from "../components/CheckersBoard";
import {
  getLegalMoves,
  applyCheckersMove,
  getCheckersWinner,
  INITIAL_CHECKERS,
} from "../lib/checkersLogic";
import { pickCheckersMove } from "../lib/checkersBot";
import { sounds } from "../lib/sounds";
import { cn } from "@/lib/utils";
import CpuDifficultyChips from "../components/CpuDifficultyChips";
import useBotDifficulty from "../hooks/useBotDifficulty";
import { BOT_LEVEL_IDS } from "../lib/botLevels";

// Solo CHECKERS vs a bot — fully local, no Firebase. The CPU level (checkersBot.js)
// is picked above the board and remembered.

const BOT_DELAY_MS = 700;

function pieceCount(board, side) {
  return board.filter((p) => p && p.toUpperCase() === side).length;
}

export default function CheckersDemo() {
  const [board, setBoard] = useState(INITIAL_CHECKERS);
  const [turn, setTurn] = useState("me");
  const [selected, setSelected] = useState(null);
  const [lastMove, setLastMove] = useState({ from: null, to: null });
  const [banner, setBanner] = useState(null);
  const [result, setResult] = useState(null); // null | 'win' | 'lose' | 'draw'
  const botTimerRef = useRef(null);
  const [level, setLevel] = useBotDifficulty("checkers", BOT_LEVEL_IDS);

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
      const move = pickCheckersMove(board, "O", level);
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
  }, [turn, done, board, level]);

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
      <CpuDifficultyChips levels={BOT_LEVEL_IDS} value={level} onChange={setLevel} />
      {/* Status */}
      <p className={cn(
        "font-pixel text-[10px] text-center",
        done
          ? "text-retro-dim"
          : myTurn
            ? "text-retro-cta text-glow-cta"
            : "text-retro-dim",
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
          className="w-full min-h-11 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 press"
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
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition press"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
