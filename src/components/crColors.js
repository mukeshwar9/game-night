// Symbol → theme player channel for Chain Reaction (2P and 4P variant).
// X/O are the classic 2P colors (p1/p2); A/B are the 3rd/4th seats of the
// 4P variant (p3/p4). Static class strings only — Tailwind JIT must see every
// class literally in source (theming rules).
export const CR_SYMBOL_COLORS = {
  X: {
    orb: 'bg-retro-p1 shadow-neon-p1', text: 'text-retro-p1',
    cell: 'bg-retro-tint-p1 border-retro-p1/30',
    hover: 'hover:border-retro-p1/60 hover:bg-retro-p1/10 cursor-pointer',
    legend: 'text-retro-p1 text-glow-p1',
  },
  O: {
    orb: 'bg-retro-p2 shadow-neon-p2', text: 'text-retro-p2',
    cell: 'bg-retro-tint-p2 border-retro-p2/30',
    hover: 'hover:border-retro-p2/60 hover:bg-retro-p2/10 cursor-pointer',
    legend: 'text-retro-p2 text-glow-p2',
  },
  A: {
    orb: 'bg-retro-p3 shadow-neon-p3', text: 'text-retro-p3',
    cell: 'bg-retro-tint-p3 border-retro-p3/30',
    hover: 'hover:border-retro-p3/60 hover:bg-retro-p3/10 cursor-pointer',
    legend: 'text-retro-p3 text-glow-p3',
  },
  B: {
    orb: 'bg-retro-p4 shadow-neon-p4', text: 'text-retro-p4',
    cell: 'bg-retro-tint-p4 border-retro-p4/30',
    hover: 'hover:border-retro-p4/60 hover:bg-retro-p4/10 cursor-pointer',
    legend: 'text-retro-p4 text-glow-p4',
  },
}

export function crSymbolColor(symbol) {
  return CR_SYMBOL_COLORS[symbol] ?? CR_SYMBOL_COLORS.X
}
