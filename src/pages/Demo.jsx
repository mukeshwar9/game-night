import { Suspense, useState, useRef, useEffect } from 'react';
import LoadingLine from '../components/loading/LoadingLine';
import {
  TicTacToeIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon, TypingIcon, MathIcon,
  ConnectFourIcon, GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon,
  TwoTruthsIcon, BluffIcon, WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon, WordDuelIcon, WordRaceIcon, AnagramsIcon, BlockadeIcon, PairsIcon,
  WordHuntIcon, PaintIcon, SketchIcon, PacmacIcon,
  HexIcon, MinesIcon, HerdIcon, TriviaIcon, BattleshipIcon,
  SimIcon, ChompIcon, BreakthroughIcon, AtaxxIcon, KamisadoIcon,
  OnitamaIcon, QuartoIcon, SantoriniIcon, LoaIcon, YavalathIcon,
  MancalaIcon, CheckersIcon, AirHockeyIcon, ArtilleryIcon, ArrowsIcon,
} from '../components/GameIcons';
import { getGameConfig, GAME_CATEGORIES, supportsLocalPlay } from '../lib/games'
import { recordPlay } from '../lib/analytics'
import CategoryTabs from '../components/CategoryTabs';
import { Link, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { VideoCallShell } from '../components/VideoCallLayout';
import SettingsButton from '../components/SettingsButton'
import { PARTY_BLURB } from './demos/partyBlurbs';
import { lazyWithRetry } from '../lib/lazyWithRetry';

// Demos outside this file load on demand: the hub only needs the picker,
// and a /solo/:type deep link downloads just the one game it opens.
const BotBoardDemo = lazyWithRetry(() => import('./demos/BotBoardDemo'))
const PartyGameCard = lazyWithRetry(() => import('./demos/PartyGameCard'))
const ReactionDemo = lazyWithRetry(() => import('./demos/ReactionDemo'))
const TypingDemo = lazyWithRetry(() => import('./demos/TypingDemo'))
const AimTrainerDemo = lazyWithRetry(() => import('./demos/AimTrainerDemo'))
const MathDemo = lazyWithRetry(() => import('./demos/MathDemo'))
const SnakeDemo = lazyWithRetry(() => import('./demos/SnakeDemo'))
const PongDemo = lazyWithRetry(() => import('./PongDemo'))
const TronDemo = lazyWithRetry(() => import('./TronDemo'))
const SumoDemo = lazyWithRetry(() => import('./SumoDemo'))
const WavelengthDemo = lazyWithRetry(() => import('./WavelengthDemo'))
const FibbageDemo = lazyWithRetry(() => import('./FibbageDemo'))
const SpyfairDemo = lazyWithRetry(() => import('./SpyfairDemo'))
const SpaceduelDemo = lazyWithRetry(() => import('./SpaceduelDemo'))
const PaintDemo = lazyWithRetry(() => import('./PaintDemo'))
const PacmacDemo = lazyWithRetry(() => import('./PacmacDemo'))
const MineRaceDemo = lazyWithRetry(() => import('./MineRaceDemo'))
const BattleshipDemo = lazyWithRetry(() => import('./BattleshipDemo'))
const MancalaDemo = lazyWithRetry(() => import('./MancalaDemo'))
const CheckersDemo = lazyWithRetry(() => import('./CheckersDemo'))
const AirHockeyDemo = lazyWithRetry(() => import('./AirHockeyDemo'))
const ArtilleryDemo = lazyWithRetry(() => import('./ArtilleryDemo'))
const TriviaDemo = lazyWithRetry(() => import('./TriviaDemo'))
const HerdDemo = lazyWithRetry(() => import('./HerdDemo'))
const ArrowsDemo = lazyWithRetry(() => import('./ArrowsDemo'))
const HangmanDemo = lazyWithRetry(() => import('./HangmanDemo'))
const WordDuelDemo = lazyWithRetry(() => import('./WordDuelDemo'))
const WordRaceDemo = lazyWithRetry(() => import('./WordRaceDemo'))
const WordHuntDemo = lazyWithRetry(() => import('./WordHuntDemo'))
const AnagramsDemo = lazyWithRetry(() => import('./AnagramsDemo'))
// Memory solo runs share one chunk.
const SimonSolo = lazyWithRetry(() => import('./MemorySoloDemos').then(m => ({ default: m.SimonSolo })))
const VisualMemorySolo = lazyWithRetry(() => import('./MemorySoloDemos').then(m => ({ default: m.VisualMemorySolo })))
const ChimpSolo = lazyWithRetry(() => import('./MemorySoloDemos').then(m => ({ default: m.ChimpSolo })))
const NumberMemorySolo = lazyWithRetry(() => import('./MemorySoloDemos').then(m => ({ default: m.NumberMemorySolo })))

function DemoFallback() {
  return <LoadingLine className="py-12" />
}

// ─── Demo registry ────────────────────────────────────────────────────────────

const DEMOS = [
  // vs-AI board games
  { type: 'tictactoe',    short: 'TTT',           Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="tictactoe" />    },
  { type: 'tictactoe4',   short: 'TTT\n4×4',      Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="tictactoe4" />   },
  { type: 'ultimatettt',  short: 'ULTIMATE\nTTT', Icon: TicTacToeIcon,    Component: () => <BotBoardDemo type="ultimatettt" />  },
  { type: 'connectfour',  short: 'CONNECT\nFOUR', Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfour" />  },
  { type: 'connectfour5', short: 'C4\nFIVE',      Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfour5" /> },
  { type: 'connectfourpop', short: 'C4 POP\nOUT', Icon: ConnectFourIcon,  Component: () => <BotBoardDemo type="connectfourpop" /> },
  { type: 'dice-big',     short: 'PIG\nBIG',      Icon: DiceIcon,         Component: () => <BotBoardDemo type="dice-big" />     },
  { type: 'gomoku',       short: 'GOMOKU',        Icon: GomokuIcon,       Component: () => <BotBoardDemo type="gomoku" />       },
  { type: 'gomokuswap',   short: 'GOMOKU\nSWAP',  Icon: GomokuIcon,       Component: () => <BotBoardDemo type="gomokuswap" />   },
  { type: 'reversi',      short: 'REVERSI',       Icon: ReversiIcon,      Component: () => <BotBoardDemo type="reversi" />      },
  { type: 'orderchaos',   short: 'ORDER &\nCHAOS',Icon: OrderChaosIcon,   Component: () => <BotBoardDemo type="orderchaos" />   },
  { type: 'sos',          short: 'SOS',           Icon: SosIcon,          Component: () => <BotBoardDemo type="sos" />          },
  { type: 'dotsandboxes',  short: 'DOTS &\nBOXES',  Icon: DotsAndBoxesIcon,   Component: () => <BotBoardDemo type="dotsandboxes" />  },
  { type: 'dotsandboxes4', short: 'DOTS\n4×4',      Icon: DotsAndBoxesIcon,   Component: () => <BotBoardDemo type="dotsandboxes4" /> },
  { type: 'dice',          short: 'PIG',            Icon: DiceIcon,           Component: () => <BotBoardDemo type="dice" />          },
  { type: 'chainreaction', short: 'CHAIN\nREACTION',Icon: ChainReactionIcon,  Component: () => <BotBoardDemo type="chainreaction" /> },
  { type: 'chainreaction6',short: 'CHAIN\n6×8',     Icon: ChainReactionIcon,  Component: () => <BotBoardDemo type="chainreaction6" /> },
  { type: 'blockade',      short: 'BLOCKADE',       Icon: BlockadeIcon,       Component: () => <BotBoardDemo type="blockade" /> },
  { type: 'pairs',         short: 'PAIRS',          Icon: PairsIcon,          Component: () => <BotBoardDemo type="pairs" /> },
  { type: 'hex',           short: 'HEX',            Icon: HexIcon,            Component: () => <BotBoardDemo type="hex" /> },
  { type: 'sim',           short: 'SIM',            Icon: SimIcon,            Component: () => <BotBoardDemo type="sim" /> },
  { type: 'chomp',         short: 'CHOMP',          Icon: ChompIcon,          Component: () => <BotBoardDemo type="chomp" /> },
  { type: 'breakthrough',  short: 'BREAK\nTHROUGH', Icon: BreakthroughIcon,   Component: () => <BotBoardDemo type="breakthrough" /> },
  { type: 'ataxx',         short: 'ATAXX',          Icon: AtaxxIcon,          Component: () => <BotBoardDemo type="ataxx" /> },
  { type: 'kamisado',      short: 'KAMISADO',       Icon: KamisadoIcon,       Component: () => <BotBoardDemo type="kamisado" /> },
  { type: 'onitama',       short: 'ONITAMA',        Icon: OnitamaIcon,        Component: () => <BotBoardDemo type="onitama" /> },
  { type: 'quarto',        short: 'QUARTO',         Icon: QuartoIcon,         Component: () => <BotBoardDemo type="quarto" /> },
  { type: 'santorini',     short: 'SANTORINI',      Icon: SantoriniIcon,      Component: () => <BotBoardDemo type="santorini" /> },
  { type: 'loa',           short: 'LINES OF\nACTION', Icon: LoaIcon,          Component: () => <BotBoardDemo type="loa" /> },
  { type: 'yavalath',      short: 'YAVALATH',       Icon: YavalathIcon,       Component: () => <BotBoardDemo type="yavalath" /> },
  { type: 'battleship',    short: 'BATTLE\nSHIP',   Icon: BattleshipIcon,     Component: BattleshipDemo },
  { type: 'mancala',       short: 'MANCALA',        Icon: MancalaIcon,        Component: MancalaDemo },
  { type: 'checkers',      short: 'CHECKERS',       Icon: CheckersIcon,       Component: CheckersDemo },
  { type: 'airhockey',     short: 'AIR\nHOCKEY',    Icon: AirHockeyIcon,      Component: AirHockeyDemo },
  { type: 'artillery',     short: 'ARTIL-\nLERY',   Icon: ArtilleryIcon,      Component: ArtilleryDemo },
  // Skill bots
  { type: 'reaction',     short: 'REACTION\nTIME',Icon: ReactionIcon,     Component: ReactionDemo     },
  { type: 'aim',          short: 'AIM\nTRAINER',  Icon: AimIcon,          Component: AimTrainerDemo   },
  { type: 'typing',       short: 'TYPING\nRACE',  Icon: TypingIcon,       Component: TypingDemo       },
  { type: 'math',         short: 'MENTAL\nMATH',  Icon: MathIcon,         Component: MathDemo         },
  { type: 'pong',         short: 'PONG',          Icon: PongIcon,         Component: PongDemo         },
  { type: 'snake',        short: 'SNAKE\nBATTLE', Icon: SnakeIcon,        Component: SnakeDemo        },
  { type: 'tron',         short: 'TRON',          Icon: TronIcon,         Component: TronDemo         },
  { type: 'sumo',         short: 'SUMO\nARENA',   Icon: SumoIcon,         Component: SumoDemo         },
  { type: 'spaceduel',    short: 'SPACE\nDUEL',   Icon: SpaceDuelIcon,    Component: SpaceduelDemo    },
  { type: 'paint',        short: 'PAINT\nTURF',   Icon: PaintIcon,        Component: PaintDemo        },
  { type: 'pacmac',       short: 'PAC\nMAC',      Icon: PacmacIcon,       Component: PacmacDemo       },
  { type: 'minesweeper',  short: 'MINE\nRACE',    Icon: MinesIcon,        Component: MineRaceDemo     },
  { type: 'arrows',       short: 'ARROWS',        Icon: ArrowsIcon,       Component: ArrowsDemo        },
  // Memory — single-player runs (grow until you slip, beat your best)
  { type: 'simon',        short: 'SIMON',         Icon: SimonIcon,        Component: SimonSolo,        solo: true },
  { type: 'numbermemory', short: 'NUM\nMEMORY',   Icon: NumberMemoryIcon, Component: NumberMemorySolo, solo: true },
  { type: 'visualmemory', short: 'VIS\nMEMORY',   Icon: VisualMemoryIcon, Component: VisualMemorySolo, solo: true },
  { type: 'chimp',        short: 'CHIMP\nTEST',   Icon: ChimpIcon,        Component: ChimpSolo,        solo: true },
  // Solo / hangwoman
  { type: 'hangwoman',    short: 'HANGWOMAN',     Icon: HangwomanIcon,    Component: HangmanDemo      },
  { type: 'wordduel',     short: 'WORD\nDUEL',    Icon: WordDuelIcon,     Component: WordDuelDemo     },
  { type: 'wordrace',     short: 'WORD\nRACE',    Icon: WordRaceIcon,     Component: WordRaceDemo     },
  { type: 'wordhunt',     short: 'WORD\nHUNT',    Icon: WordHuntIcon,     Component: WordHuntDemo     },
  { type: 'anagrams',     short: 'ANA-\nGRAMS',   Icon: AnagramsIcon,     Component: AnagramsDemo     },
  // Party cards (2+ players only)
  { type: 'twotruths',    short: 'TWO\nTRUTHS',   Icon: TwoTruthsIcon,    Component: () => <PartyGameCard type="twotruths" />   },
  { type: 'bluff',        short: 'BLUFF',         Icon: BluffIcon,        Component: () => <PartyGameCard type="bluff" />       },
  { type: 'wavelength',   short: 'WAVE\nLENGTH',  Icon: WavelengthIcon,   Component: WavelengthDemo   },
  { type: 'fibbage',      short: 'FIBBAGE',       Icon: FibbageIcon,      Component: FibbageDemo      },
  { type: 'spyfair',      short: 'SPYFAIR',       Icon: SpyfairIcon,      Component: SpyfairDemo      },
  { type: 'herd',         short: 'HERD\nMIND',    Icon: HerdIcon,         Component: HerdDemo         },
  { type: 'trivia',       short: 'TRIVIA\nBLITZ', Icon: TriviaIcon,       Component: TriviaDemo       },
  { type: 'sketch',       short: 'SKETCH',        Icon: SketchIcon,       Component: () => <PartyGameCard type="sketch" />      },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

// Local pass-and-play: two people share one screen/keyboard, alternating
// moves on the real BoardComponent with no bot and no Firebase. Reuses the
// generic BotBoardDemo engine (mode="local") — no per-game code needed.
function LocalPlayPage({ routeType }) {
  const cfg = getGameConfig(routeType)
  const playRecorded = useRef(false)
  useEffect(() => {
    if (playRecorded.current) return
    playRecorded.current = true
    recordPlay(routeType, 'local')
  }, [routeType])

  return (
    <VideoCallShell><div className="min-h-screen bg-retro-bg flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-end gap-3">
          <SettingsButton />
          <span className="text-xs text-retro-p2 bg-retro-tint-p2 border border-retro-p2/60 rounded px-2 py-1 font-mono">
            PASS & PLAY
          </span>
        </div>
        <div className="border border-retro-border rounded p-4 bg-retro-card space-y-1">
          <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider">
            {cfg.label} — PASS & PLAY
          </p>
          <p className="font-pixel text-[8px] text-retro-dim text-center">
            SHARE THIS SCREEN — TAKE TURNS
          </p>
          <div className="pt-3">
            <Suspense fallback={<DemoFallback />}>
              <BotBoardDemo type={routeType} mode="local" />
            </Suspense>
          </div>
        </div>
      </div>
    </div></VideoCallShell>
  )
}

// Explicit dead end for a deep-linked /solo/:type with no demo entry — an
// unknown type, or a registry type that advertises solo before its demo ships.
// It must never silently play a different game (GAMEPLAY-01: tictactoe4 /
// connectfour5 / dice-big used to fall back to their base game's demo). Kept in
// the hook-free dispatcher: DemoHub holds state and does not remount on param
// change, so a conditional return inside it would break rules-of-hooks.
function SoloNotAvailable({ routeType }) {
  // getGameConfig falls back to GAME_TYPES[0] for unknown types, so compare
  // back to distinguish "registry type, no demo" from a garbage deep link.
  const cfg = getGameConfig(routeType)
  const known = cfg?.type === routeType
  return (
    <VideoCallShell><div className="min-h-screen bg-retro-bg flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="border border-retro-border rounded p-6 bg-retro-card text-center space-y-3">
          <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 tracking-wider">NO SOLO DEMO</p>
          <p className="font-mono text-xs text-retro-dim leading-relaxed">
            {known
              ? <>{cfg.label} DOESN&apos;T HAVE SOLO PLAY YET.</>
              : <>UNKNOWN GAME &quot;{String(routeType).toUpperCase()}&quot;.</>}
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <Link
              to="/"
              className="px-5 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
            >
              CREATE A ROOM →
            </Link>
            <Link
              to="/demo"
              className="px-5 py-2.5 border border-retro-border text-retro-dim font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-text transition-all active:scale-95"
            >
              ALL DEMOS
            </Link>
          </div>
        </div>
      </div>
    </div></VideoCallShell>
  )
}

// Dispatcher — no hooks of its own, so branching to a different child
// component ahead of any hook call stays rules-of-hooks safe.
export default function Demo({ mode }) {
  const { type: routeType } = useParams()

  if (mode === 'local' && routeType && supportsLocalPlay(routeType)) {
    return <LocalPlayPage routeType={routeType} />
  }
  // /solo/:type with no demo entry gets the explicit not-available card; only
  // a bare /demo (no type) or a valid /solo/:type reaches the hub.
  if (mode !== 'local' && routeType && !DEMOS.some(d => d.type === routeType)) {
    return <SoloNotAvailable routeType={routeType} />
  }
  // /local/:type with an invalid/ineligible type falls back to the hub below.
  return <DemoHub />
}

function DemoHub() {
  const { type: routeType } = useParams()
  const hasRouteType = !!routeType && DEMOS.some(d => d.type === routeType)
  const initialType = hasRouteType ? routeType : 'tictactoe'
  const [selected, setSelected] = useState(initialType)
  const [activeCat, setActiveCat] = useState(() => getGameConfig(initialType)?.category || 'board')
  const active = DEMOS.find(d => d.type === selected)

  // Party cards don't start an actual solo game (2+ players only) — every
  // other selection mounts a fresh bot/skill demo, so that's the play. Landing
  // on the bare /demo hub defaults to tictactoe with no explicit intent, so
  // that first mount is skipped — but arriving via a /solo/:type deep link
  // (e.g. from the catalog's VS AI option) IS an intentional play and should
  // be recorded immediately.
  const playRecorded = useRef(hasRouteType)
  useEffect(() => {
    if (!playRecorded.current) { playRecorded.current = true; return }
    if (!(selected in PARTY_BLURB)) recordPlay(selected, 'solo')
  }, [selected])

  const demoCounts = {}
  for (const d of DEMOS) {
    const cat = getGameConfig(d.type)?.category
    if (cat) demoCounts[cat] = (demoCounts[cat] || 0) + 1
  }
  const demoCategories = GAME_CATEGORIES.map(c => ({ ...c, count: demoCounts[c.id] || 0 })).filter(c => c.count > 0)
  const shown = DEMOS.filter(d => getGameConfig(d.type)?.category === activeCat)

  return (
    <VideoCallShell><div className="min-h-screen bg-retro-bg flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-end gap-3">
          <SettingsButton />
          <span className="text-xs text-retro-cta bg-retro-tint-cta border border-retro-cta/60 rounded px-2 py-1 font-mono">
            Demo
          </span>
        </div>

        {/* Game picker */}
        <div className="space-y-2">
          <CategoryTabs categories={demoCategories} active={activeCat} onSelect={setActiveCat} />
          <div className="grid grid-cols-4 gap-2">
            {shown.map(({ type, short, Icon, solo }) => (
              <button
                key={type}
                onClick={() => setSelected(type)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded border transition-all active:scale-95',
                  selected === type
                    ? 'border-retro-cta text-retro-cta shadow-neon-cta bg-retro-tint-cta'
                    : 'border-retro-border text-retro-dim hover:border-retro-p1/50 hover:text-retro-text bg-retro-card',
                )}
              >
                <Icon />
                <span className="font-pixel text-[7px] text-center leading-tight whitespace-pre-line">{short}</span>
                <span className="font-pixel text-[6px] text-retro-dim/70">{type in PARTY_BLURB ? '2+ PLAYERS' : solo ? 'SOLO' : 'VS CPU'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active demo — key forces fresh mount on game switch */}
        <div key={selected} className="border border-retro-border rounded p-4 bg-retro-card">
          <p className="font-pixel text-[10px] text-retro-dim text-center tracking-wider mb-4">
            {active.short.replace('\n', ' ')} {active.solo ? 'SOLO RUN' : 'DEMO'}
          </p>
          <Suspense fallback={<DemoFallback />}>
            <active.Component />
          </Suspense>
        </div>
      </div>
    </div></VideoCallShell>
  )
}
