// GIF-like how-to-play demos: silent, autoplaying, infinite-loop SVG clips
// for the rules sheet. All motion is CSS keyframes (see index.css "rule
// clips") so the app's REDUCE MOTION setting freezes them into a readable
// end-state automatically — real GIFs can't do that. Render <RuleClip/>
// unconditionally: it returns null for games without a clip yet, so
// RulesModal can mount it above OBJECTIVE with no per-game branches.
function TttClip({ cls }) {
  const a = (name, dur = '6s') => ({
    className: 'clip-anim clip-still',
    style: { animationName: name, animationDuration: dur },
  })
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Tic tac toe demo: X takes the diagonal">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      <g className="stroke-retro-dim" strokeWidth="2.5" strokeLinecap="round">
        <line x1="38" y1="20" x2="38" y2="76" />
        <line x1="58" y1="20" x2="58" y2="76" />
        <line x1="20" y1="38" x2="76" y2="38" />
        <line x1="20" y1="58" x2="76" y2="58" />
      </g>
      <g className="stroke-retro-p1" strokeWidth="4" strokeLinecap="round">
        <line x1="24" y1="24" x2="34" y2="34" {...a('clip-t0')} />
        <line x1="34" y1="24" x2="24" y2="34" {...a('clip-t0')} />
        <line x1="43" y1="43" x2="53" y2="53" {...a('clip-t2')} />
        <line x1="53" y1="43" x2="43" y2="53" {...a('clip-t2')} />
        <line x1="62" y1="62" x2="72" y2="72" {...a('clip-t4')} />
        <line x1="72" y1="62" x2="62" y2="72" {...a('clip-t4')} />
      </g>
      <g fill="none" className="stroke-retro-p2" strokeWidth="4">
        <circle cx="67" cy="29" r="6" {...a('clip-t1')} />
        <circle cx="29" cy="67" r="6" {...a('clip-t3')} />
      </g>
      <line x1="22" y1="22" x2="74" y2="74" className="stroke-retro-win"
        strokeWidth="4" strokeLinecap="round" {...a('clip-strike')} />
    </svg>
  )
}

function ConnectFourClip({ cls }) {
  const a = (name, dur = '6s') => ({
    className: 'clip-anim clip-still',
    style: { animationName: name, animationDuration: dur },
  })
  const xs = [28, 42, 56, 70]
  const ys = [46, 58, 70]
  const drops = [
    { c: 0, anim: 'clip-d0', fill: 'fill-retro-p1' },
    { c: 1, anim: 'clip-d1', fill: 'fill-retro-p2' },
    { c: 2, anim: 'clip-d2', fill: 'fill-retro-p1' },
    { c: 3, anim: 'clip-d3', fill: 'fill-retro-cta' },
  ]
  const taken = new Set(drops.map(d => `${d.c},2`))
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Connect four demo: discs drop, four connect">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      <rect x="16" y="30" width="64" height="46" rx="10" className="fill-retro-p1" />
      {ys.map((y, r) =>
        xs.map((x, c) =>
          taken.has(`${c},${r}`) ? null : (
            <circle key={`${c}-${r}`} cx={x} cy={y} r="5.5" className="fill-retro-card" opacity="0.85" />
          ),
        ),
      )}
      {drops.map((d, i) => (
        <circle key={i} cx={xs[d.c]} cy={ys[2]} r="6.5" className={d.fill} {...a(d.anim)} />
      ))}
      <circle cx={xs[3]} cy={ys[2]} r="9.5" fill="none" className="stroke-retro-win"
        strokeWidth="2.5" {...a('clip-ping')} />
    </svg>
  )
}

function PongClip({ cls }) {
  const a = (name, dur = '4s', delay) => ({
    className: delay ? 'clip-anim' : 'clip-anim clip-still',
    style: { animationName: name, animationDuration: dur, ...(delay ? { animationDelay: delay } : {}) },
  })
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Pong demo: rally back and forth">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-card" />
      <rect x="14" y="28" width="68" height="40" rx="10"
        className="fill-retro-card stroke-retro-border" strokeWidth="2" />
      <line x1="48" y1="33" x2="48" y2="63" className="stroke-retro-dim"
        strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
      <rect x="20" y="40" width="4.5" height="16" rx="2.25" className="fill-retro-p1" {...a('clip-paddle-l')} />
      <rect x="71.5" y="40" width="4.5" height="16" rx="2.25" className="fill-retro-p2" {...a('clip-paddle-r')} />
      {/* motion ghosts trail the ball (negative delays = mid-flight on load) */}
      <circle cx="48" cy="48" r="4" className="fill-retro-cta" opacity="0.12" {...a('clip-ball', '4s', '-0.3s')} />
      <circle cx="48" cy="48" r="4" className="fill-retro-cta" opacity="0.25" {...a('clip-ball', '4s', '-0.15s')} />
      <circle cx="48" cy="48" r="4" className="fill-retro-cta" {...a('clip-ball')} />
    </svg>
  )
}

// Shared storyboard helper: staggered pop-ins (clip-t0..t4), drops
// (clip-d0..d3), win pings and the rally loop are one vocabulary — every
// board game below is a new composition, no new keyframes needed.
const anim = (name, dur = '6s') => ({
  className: 'clip-anim clip-still',
  style: { animationName: name, animationDuration: dur },
})

function SimClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Sim demo: color edges, the closing edge loses">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p2" />
      <g strokeWidth="4" strokeLinecap="round">
        <line x1="48" y1="20" x2="24" y2="68" className="stroke-retro-text" {...anim('clip-t0')} />
        <line x1="24" y1="68" x2="72" y2="68" className="stroke-retro-text" {...anim('clip-t1')} />
        <line x1="72" y1="68" x2="48" y2="20" className="stroke-retro-p1" {...anim('clip-t2')} />
      </g>
      <circle cx="48" cy="20" r="4.5" className="fill-retro-p2" {...anim('clip-t0')} />
      <circle cx="24" cy="68" r="4.5" className="fill-retro-p2" {...anim('clip-t1')} />
      <circle cx="72" cy="68" r="4.5" className="fill-retro-p2" {...anim('clip-t2')} />
      <circle cx="48" cy="52" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function ChompClip({ cls }) {
  const cells = []
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) cells.push([24 + c * 13, 30 + r * 13])
  const bites = { 1: 'clip-t0', 2: 'clip-t1', 5: 'clip-t2' }
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Chomp demo: bites taken, poison avoided">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      {cells.map(([x, y], i) =>
        bites[i] ? (
          <rect key={i} x={x} y={y} width="11" height="11" rx="2.5" className="fill-retro-p1" {...anim(bites[i])} />
        ) : (
          <rect key={i} x={x} y={y} width="11" height="11" rx="2.5" className="fill-retro-card" opacity="0.9" />
        ),
      )}
      <circle cx="29.5" cy="35.5" r="3.5" className="fill-retro-text" />
      <circle cx="29.5" cy="35.5" r="6.5" fill="none" className="stroke-retro-win" strokeWidth="2" {...anim('clip-ping')} />
    </svg>
  )
}

function BreakthroughClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Breakthrough demo: pawn races to the far row">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      <line x1="30" y1="16" x2="66" y2="16" className="stroke-retro-win" strokeWidth="4" strokeLinecap="round" />
      <line x1="48" y1="24" x2="48" y2="66" className="stroke-retro-dim" strokeWidth="2.5" strokeDasharray="4 5" />
      <circle cx="60" cy="30" r="6" className="fill-retro-p2" opacity="0.7" />
      <circle cx="48" cy="66" r="7" className="fill-retro-p1" {...anim('clip-t0')} />
      <circle cx="48" cy="44" r="7" className="fill-retro-p1" {...anim('clip-t2')} />
      <circle cx="48" cy="16" r="8" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function AtaxxClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Ataxx demo: clone, jump, convert">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p2" />
      <circle cx="76" cy="52" r="7" className="fill-retro-p2" opacity="0.8" />
      <circle cx="30" cy="54" r="10" className="fill-retro-p1" {...anim('clip-t0')} />
      <circle cx="58" cy="42" r="7" className="fill-retro-p1" {...anim('clip-t1')} />
      <circle cx="62" cy="64" r="7" className="fill-retro-p1" {...anim('clip-t2')} />
      <circle cx="60" cy="53" r="13" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function KamisadoClip({ cls }) {
  const towers = [
    { x: 22, fill: 'fill-retro-p1' },
    { x: 38, fill: 'fill-retro-p2' },
    { x: 54, fill: 'fill-retro-cta' },
    { x: 70, fill: 'fill-retro-win' },
  ]
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Kamisado demo: towers advance, landing picks next">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      {towers.map((t, i) => (
        i === 2
          ? <rect key={i} x={t.x} y="36" width="11" height="28" rx="3" className={t.fill} {...anim('clip-t2')} />
          : <rect key={i} x={t.x} y="38" width="11" height="26" rx="3" className={t.fill} opacity="0.5" />
      ))}
      <circle cx="59.5" cy="26" r="8" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function OnitamaClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Onitama demo: card move, pawn steps">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      <rect x="16" y="18" width="29" height="20" rx="4" className="fill-retro-card" opacity="0.9" />
      <rect x="51" y="18" width="29" height="20" rx="4" className="fill-retro-card" opacity="0.9" />
      <circle cx="30" cy="28" r="3" className="fill-retro-p1" />
      <circle cx="65" cy="28" r="3" className="fill-retro-p2" />
      <rect x="52" y="54" width="16" height="16" rx="4" fill="none" className="stroke-retro-win" strokeWidth="2.5" strokeDasharray="3 3" />
      <circle cx="32" cy="62" r="7" className="fill-retro-p1" {...anim('clip-t1')} />
      <circle cx="60" cy="62" r="8" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function QuartoClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Quarto demo: place the given piece">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      <line x1="18" y1="38" x2="78" y2="38" className="stroke-retro-dim" strokeWidth="2.5" />
      <rect x="26" y="16" width="9" height="22" rx="2" className="fill-retro-p1" opacity="0.75" />
      <rect x="42" y="26" width="9" height="12" rx="2" className="fill-retro-p2" opacity="0.75" />
      <circle cx="60" cy="28" r="7" className="fill-retro-cta" opacity="0.75" />
      <rect x="72" y="24" width="10" height="10" rx="2" className="fill-retro-win" opacity="0.75" />
      <rect x="30" y="52" width="15" height="15" rx="3" fill="none" className="stroke-retro-dim" strokeWidth="2" />
      <rect x="51" y="52" width="15" height="15" rx="3" fill="none" className="stroke-retro-dim" strokeWidth="2" />
      <circle cx="58" cy="59.5" r="6" className="fill-retro-cta" {...anim('clip-t2')} />
      <circle cx="58" cy="59.5" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function SantoriniClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Santorini demo: climb, build, dome">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      <rect x="28" y="64" width="40" height="10" rx="2" className="fill-retro-card" opacity="0.9" />
      <rect x="34" y="54" width="28" height="10" rx="2" className="fill-retro-card" opacity="0.9" />
      <rect x="40" y="44" width="16" height="10" rx="2" className="fill-retro-card" opacity="0.9" />
      <circle cx="36" cy="49" r="4" className="fill-retro-p1" {...anim('clip-t1')} />
      <circle cx="48" cy="38" r="6" className="fill-retro-p2" {...anim('clip-t3')} />
      <circle cx="48" cy="38" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function LoaClip({ cls }) {
  const path = [[24, 68], [40, 52], [56, 52], [72, 36]]
  const pops = ['clip-t0', 'clip-t1', 'clip-t2', 'clip-t3']
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Lines of Action demo: unite all stones">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p2" />
      <polyline points="24,68 40,52 56,52 72,36" fill="none" className="stroke-retro-dim" strokeWidth="3" strokeLinecap="round" />
      {path.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" className="fill-retro-p1" {...anim(pops[i])} />
      ))}
      <circle cx="72" cy="36" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function YavalathClip({ cls }) {
  const row = [24, 38, 52, 66]
  const pops = ['clip-t0', 'clip-t1', 'clip-t2', 'clip-t3']
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Yavalath demo: four wins, three loses">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      {row.map((x, i) => (
        <circle key={i} cx={x} cy="40" r="6" className="fill-retro-cta" {...anim(pops[i])} />
      ))}
      <circle cx="66" cy="40" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
      <circle cx="30" cy="64" r="5" className="fill-retro-p2" opacity="0.55" />
      <circle cx="44" cy="64" r="5" className="fill-retro-p2" opacity="0.55" />
      <circle cx="66" cy="64" r="5" className="fill-retro-p2" opacity="0.55" />
    </svg>
  )
}

function DotsAndBoxesClip({ cls }) {
  const dots = []
  for (const y of [30, 48, 66])
    for (const x of [30, 48, 66]) dots.push([x, y])
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Dots and Boxes demo: close a box to claim it">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      <rect x="32" y="50" width="32" height="14" rx="2" className="fill-retro-p1" {...anim('clip-t4')} />
      <g className="stroke-retro-card" strokeWidth="4" strokeLinecap="round">
        <line x1="30" y1="48" x2="66" y2="48" {...anim('clip-t0')} />
        <line x1="30" y1="66" x2="66" y2="66" {...anim('clip-t1')} />
        <line x1="30" y1="48" x2="30" y2="66" {...anim('clip-t2')} />
        <line x1="66" y1="48" x2="66" y2="66" {...anim('clip-t3')} />
      </g>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" className="fill-retro-text" />
      ))}
      <circle cx="48" cy="57" r="11" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function SosClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="SOS demo: spell S-O-S on the diagonal">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p2" />
      <rect x="56" y="20" width="20" height="20" rx="5" className="fill-retro-card" opacity="0.95" />
      <rect x="38" y="38" width="20" height="20" rx="5" className="fill-retro-card" opacity="0.95" />
      <rect x="20" y="56" width="20" height="20" rx="5" className="fill-retro-card" opacity="0.95" />
      <polyline points="72,24 62,24 62,30 72,30 72,36 62,36" fill="none" className="stroke-retro-text" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...anim('clip-t0')} />
      <circle cx="48" cy="48" r="6" fill="none" className="stroke-retro-p2" strokeWidth="3.5" {...anim('clip-t1')} />
      <polyline points="36,60 26,60 26,66 36,66 36,72 26,72" fill="none" className="stroke-retro-text" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...anim('clip-t2')} />
      <line x1="22" y1="74" x2="74" y2="22" className="stroke-retro-win" strokeWidth="4" strokeLinecap="round" {...anim('clip-strike')} />
    </svg>
  )
}

function GomokuClip({ cls }) {
  const lines = [20, 31, 42, 53, 64, 75]
  const stones = [31, 42, 53, 64, 75]
  const pops = ['clip-t0', 'clip-t1', 'clip-t2', 'clip-t3', 'clip-t4']
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Gomoku demo: five in a row wins">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      <g className="stroke-retro-dim" strokeWidth="1.5">
        {lines.map(v => <line key={`v${v}`} x1={v} y1="20" x2={v} y2="75" />)}
        {lines.map(v => <line key={`h${v}`} x1="20" y1={v} x2="75" y2={v} />)}
      </g>
      {stones.map((x, i) => (
        <circle key={i} cx={x} cy="42" r="5" className="fill-retro-text" {...anim(pops[i])} />
      ))}
      <circle cx="75" cy="42" r="9" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function ReversiClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Reversi demo: trap and flip the row">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      <circle cx="54" cy="42" r="7" className="fill-retro-text" />
      <circle cx="42" cy="54" r="7" className="fill-retro-text" />
      <circle cx="54" cy="54" r="7" className="fill-retro-card" opacity="0.95" />
      <circle cx="42" cy="42" r="7" className="fill-retro-text" {...anim('clip-t1')} />
      <circle cx="30" cy="42" r="7" className="fill-retro-text" {...anim('clip-t2')} />
      <circle cx="30" cy="42" r="11" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function ChainReactionClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Chain Reaction demo: orbs build, full cell bursts">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p2" />
      <g fill="none" className="stroke-retro-dim" strokeWidth="2">
        <rect x="28" y="28" width="18" height="18" rx="4" />
        <rect x="52" y="28" width="18" height="18" rx="4" />
        <rect x="28" y="52" width="18" height="18" rx="4" />
        <rect x="52" y="52" width="18" height="18" rx="4" />
      </g>
      <circle cx="61" cy="37" r="3" className="fill-retro-p1" {...anim('clip-t0')} />
      <circle cx="37" cy="61" r="3" className="fill-retro-p1" {...anim('clip-t1')} />
      <circle cx="61" cy="61" r="3" className="fill-retro-p1" {...anim('clip-t2')} />
      <circle cx="61" cy="67" r="3" className="fill-retro-p1" {...anim('clip-t3')} />
      <circle cx="61" cy="64" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function BlockadeClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Blockade demo: race across, wall them off">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      <line x1="30" y1="16" x2="66" y2="16" className="stroke-retro-win" strokeWidth="4" strokeLinecap="round" />
      <rect x="46" y="30" width="8" height="18" rx="2" className="fill-retro-card" opacity="0.9" {...anim('clip-t1')} />
      <rect x="46" y="52" width="8" height="18" rx="2" className="fill-retro-card" opacity="0.9" {...anim('clip-t2')} />
      <circle cx="30" cy="64" r="7" className="fill-retro-p1" {...anim('clip-t0')} />
      <circle cx="66" cy="64" r="7" className="fill-retro-p2" opacity="0.8" />
      <circle cx="48" cy="16" r="8" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function OrderChaosClip({ cls }) {
  const lines = [22, 32, 42, 52, 62, 72]
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Order and Chaos demo: five in a row for Order">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      <g className="stroke-retro-dim" strokeWidth="1.5">
        {lines.map(v => <line key={`v${v}`} x1={v} y1="22" x2={v} y2="72" />)}
        {lines.map(v => <line key={`h${v}`} x1="22" y1={v} x2="72" y2={v} />)}
      </g>
      <g className="stroke-retro-p1" strokeWidth="3.5" strokeLinecap="round">
        <line x1="23" y1="38" x2="31" y2="46" {...anim('clip-t0')} />
        <line x1="31" y1="38" x2="23" y2="46" {...anim('clip-t0')} />
        <line x1="43" y1="38" x2="51" y2="46" {...anim('clip-t2')} />
        <line x1="51" y1="38" x2="43" y2="46" {...anim('clip-t2')} />
        <line x1="63" y1="38" x2="71" y2="46" {...anim('clip-t4')} />
        <line x1="71" y1="38" x2="63" y2="46" {...anim('clip-t4')} />
      </g>
      <g fill="none" className="stroke-retro-p2" strokeWidth="3.5">
        <circle cx="37" cy="42" r="4.5" {...anim('clip-t1')} />
        <circle cx="57" cy="42" r="4.5" {...anim('clip-t3')} />
      </g>
      <circle cx="67" cy="42" r="9" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function HexClip({ cls }) {
  const path = [[28, 52], [41, 57], [54, 55], [67, 51]]
  const pops = ['clip-t0', 'clip-t1', 'clip-t2', 'clip-t3']
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Hex demo: connect your two edges">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      <polygon points="78,52 63,78 33,78 18,52 33,26 63,26" fill="none" className="stroke-retro-dim" strokeWidth="3" strokeLinejoin="round" />
      {path.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5.5" className="fill-retro-p1" {...anim(pops[i])} />
      ))}
      <circle cx="67" cy="51" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function BattleshipClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Battleship demo: hunt the fleet, score a hit">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p2" />
      <g className="stroke-retro-dim" strokeWidth="2.5" strokeLinecap="round">
        <line x1="20" y1="62" x2="76" y2="62" />
        <line x1="20" y1="70" x2="76" y2="70" />
        <line x1="20" y1="78" x2="76" y2="78" />
      </g>
      <rect x="32" y="48" width="32" height="10" rx="5" className="fill-retro-text" {...anim('clip-t0')} />
      <rect x="44" y="40" width="9" height="8" rx="2" className="fill-retro-card" opacity="0.9" {...anim('clip-t0')} />
      <polygon points="76,30 69.2,31.7 73.1,37.1 67.7,36 66,40 64.3,36 58.9,37.1 62.8,31.7 56,30 62.8,28.3 58.9,22.9 64.3,24 66,20 67.7,24 73.1,22.9 69.2,28.3" className="fill-retro-p1" {...anim('clip-t2')} />
      <circle cx="66" cy="30" r="12" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function MancalaClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Mancala demo: sow seeds around the pits">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      <ellipse cx="24" cy="52" rx="9" ry="7" className="fill-retro-text" opacity="0.85" />
      <ellipse cx="40" cy="52" rx="9" ry="7" className="fill-retro-text" opacity="0.85" />
      <ellipse cx="56" cy="52" rx="9" ry="7" className="fill-retro-text" opacity="0.85" />
      <ellipse cx="78" cy="52" rx="7" ry="14" className="fill-retro-p1" opacity="0.9" />
      <circle cx="21" cy="50" r="2.5" className="fill-retro-card" {...anim('clip-t0')} />
      <circle cx="27" cy="54" r="2.5" className="fill-retro-card" {...anim('clip-t0')} />
      <circle cx="40" cy="52" r="2.5" className="fill-retro-card" {...anim('clip-t1')} />
      <circle cx="56" cy="52" r="2.5" className="fill-retro-card" {...anim('clip-t2')} />
      <circle cx="78" cy="50" r="2.5" className="fill-retro-card" {...anim('clip-t3')} />
      <circle cx="78" cy="52" r="11" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function CheckersClip({ cls }) {
  const dark = []
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if ((r + c) % 2 === 1) dark.push([28 + c * 10, 28 + r * 10])
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Checkers demo: jump the rival piece">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p1" />
      {dark.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="10" height="10" className="fill-retro-text" opacity="0.7" />
      ))}
      <circle cx="43" cy="53" r="6" className="fill-retro-p2" opacity="0.85" />
      <circle cx="52" cy="52" r="6" className="fill-retro-p1 clip-anim clip-still" style={{ animationName: 'clip-ball', animationDuration: '6s' }} />
      <circle cx="33" cy="33" r="10" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function LanternsClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Lanterns demo: lay glowing tiles">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-p2" />
      <line x1="16" y1="26" x2="80" y2="26" className="stroke-retro-dim" strokeWidth="2" />
      <g className="stroke-retro-dim" strokeWidth="2">
        <line x1="32" y1="26" x2="32" y2="36" />
        <line x1="48" y1="26" x2="48" y2="36" />
        <line x1="64" y1="26" x2="64" y2="36" />
      </g>
      <rect x="26" y="36" width="12" height="16" rx="6" className="fill-retro-p1" {...anim('clip-t0')} />
      <rect x="42" y="36" width="12" height="16" rx="6" className="fill-retro-p2" {...anim('clip-t1')} />
      <rect x="58" y="36" width="12" height="16" rx="6" className="fill-retro-cta" {...anim('clip-t2')} />
      <circle cx="48" cy="44" r="11" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

function HunchClip({ cls }) {
  return (
    <svg viewBox="0 0 96 96" className={cls} role="img" aria-label="Hunch demo: read the tells, call the bluff">
      <rect x="0" y="0" width="96" height="96" className="fill-retro-tint-cta" />
      <rect x="22" y="38" width="15" height="24" rx="3" className="fill-retro-dim" opacity="0.5" />
      <rect x="59" y="38" width="15" height="24" rx="3" className="fill-retro-dim" opacity="0.5" />
      <rect x="40.5" y="38" width="15" height="24" rx="3" className="fill-retro-card" opacity="0.95" {...anim('clip-t1')} />
      <polygon points="48,43 49.8,48 55,48.2 50.8,51.2 52.2,56.2 48,53.4 43.8,56.2 45.2,51.2 41,48.2 46.2,48" className="fill-retro-p1" {...anim('clip-t3')} />
      <circle cx="48" cy="50" r="12" fill="none" className="stroke-retro-win" strokeWidth="2.5" {...anim('clip-ping')} />
    </svg>
  )
}

const CLIP_ALIAS = {
  ultimatettt: 'tictactoe',
  tictactoe4: 'tictactoe',
  connectfour5: 'connectfour',
  connectfourpop: 'connectfour',
  dotsandboxes4: 'dotsandboxes',
  pairs4: 'pairs',
  gomokuswap: 'gomoku',
  chainreaction6: 'chainreaction',
  chainreaction4: 'chainreaction',
}

const CLIPS = {
  tictactoe: TttClip,
  connectfour: ConnectFourClip,
  pong: PongClip,
  sim: SimClip,
  chomp: ChompClip,
  breakthrough: BreakthroughClip,
  ataxx: AtaxxClip,
  kamisado: KamisadoClip,
  onitama: OnitamaClip,
  quarto: QuartoClip,
  santorini: SantoriniClip,
  loa: LoaClip,
  yavalath: YavalathClip,
  dotsandboxes: DotsAndBoxesClip,
  sos: SosClip,
  gomoku: GomokuClip,
  reversi: ReversiClip,
  chainreaction: ChainReactionClip,
  blockade: BlockadeClip,
  orderchaos: OrderChaosClip,
  hex: HexClip,
  battleship: BattleshipClip,
  mancala: MancalaClip,
  checkers: CheckersClip,
  lanterns: LanternsClip,
  hunch: HunchClip,
}

// Variants + same-family games reuse the base clip (mirrors the art fallback).

// eslint-disable-next-line react-refresh/only-export-components
export const hasRuleClip = (type) => !!CLIPS[CLIP_ALIAS[type] || type]

export default function RuleClip({ type, className }) {
  const Clip = CLIPS[CLIP_ALIAS[type] || type]
  if (!Clip) return null
  return <Clip cls={className} />
}
