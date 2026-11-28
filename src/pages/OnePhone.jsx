import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GAME_TYPES, supportsLocalPlay } from '../lib/games'
import { COUNT_OPTIONS, countsByTile, gamesForCount, localPlayerRange, parseCount } from '../lib/onePhoneLogic'

// ONE PHONE: the door for people in the same room. First question is how many
// are here; then only the games that run on one phone for that many.
export default function OnePhone() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const count = parseCount(params.get('n'))
  const tiles = useMemo(() => countsByTile(GAME_TYPES, supportsLocalPlay), [])
  const games = useMemo(
    () => (count ? gamesForCount(GAME_TYPES, count, supportsLocalPlay) : []),
    [count],
  )

  return (
    <main className="min-h-screen bg-retro-bg p-4">
      <div className="w-full max-w-md mx-auto space-y-4">
        <header className="flex items-center gap-2 pt-1">
          {count ? (
            <button
              type="button"
              onClick={() => setParams({})}
              aria-label="Change number of players"
              className="min-h-11 min-w-11 flex items-center justify-center text-retro-dim hover:text-retro-cta font-pixel text-[10px] rounded transition-colors press"
            >
              ←
            </button>
          ) : (
            <Link
              to="/"
              aria-label="Back to home"
              className="min-h-11 min-w-11 flex items-center justify-center text-retro-dim hover:text-retro-cta font-pixel text-[10px] rounded transition-colors press"
            >
              ←
            </Link>
          )}
          <h1 className="font-pixel text-[11px] text-retro-text tracking-wider flex-1">
            {count ? `${count === 5 ? '5+' : count} ON ONE PHONE` : "WHO'S PLAYING?"}
          </h1>
          {count && (
            <span className="font-pixel text-[8px] text-retro-win border border-retro-win/40 rounded px-2 py-1">
              {games.length} {games.length === 1 ? 'GAME' : 'GAMES'}
            </span>
          )}
        </header>

        {!count && (
          <>
            <p className="font-mono text-xs text-retro-dim">On this phone, passed around or face to face.</p>
            <div className="grid grid-cols-2 gap-3" data-testid="one-phone-counts">
              {COUNT_OPTIONS.map((o) => (
                <button
                  key={o.n}
                  type="button"
                  onClick={() => setParams({ n: String(o.n) })}
                  disabled={tiles[o.n] === 0}
                  data-testid={`one-phone-count-${o.n}`}
                  className="glass glass-tx min-h-24 flex flex-col items-center justify-center gap-1 bg-retro-card border border-retro-border rounded hover:border-retro-cta/60 transition press-card disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span className="font-pixel text-2xl text-retro-cta text-glow-cta">{o.label}</span>
                  <span className="font-pixel text-[8px] text-retro-text tracking-wider">PLAYERS</span>
                  <span className="font-mono text-[11px] text-retro-dim">
                    {tiles[o.n] === 0 ? 'start a party' : `${tiles[o.n]} ${tiles[o.n] === 1 ? 'game' : 'games'}`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {count && games.length === 0 && (
          <div className="border border-retro-border bg-retro-card rounded p-4 space-y-3 text-center">
            <p className="font-mono text-xs text-retro-dim">No game runs on one phone for this many people yet.</p>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center px-4 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded press"
            >
              BACK TO HOME · START A PARTY
            </Link>
          </div>
        )}

        {count && games.length > 0 && (
          <ul className="space-y-2" data-testid="one-phone-games">
            {games.map((g) => {
              const { min, max } = localPlayerRange(g)
              const Icon = g.Icon
              return (
                <li key={g.type}>
                  <button
                    type="button"
                    onClick={() => navigate('/local/' + g.type)}
                    data-testid={`one-phone-game-${g.type}`}
                    className="glass glass-tx w-full min-h-16 flex items-center gap-3 bg-retro-card border border-retro-border rounded px-3 py-2 text-left hover:border-retro-cta/60 transition press-card"
                  >
                    <span className="shrink-0 w-10 h-10 flex items-center justify-center" aria-hidden="true">
                      {Icon && <Icon />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-pixel text-[10px] text-retro-text tracking-wider truncate">{g.label}</span>
                      <span className="block font-mono text-[11px] text-retro-dim truncate">{g.desc}</span>
                    </span>
                    <span className="shrink-0 font-pixel text-[8px] text-retro-dim">
                      {min === max ? `${min}P` : `${min}-${max}P`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
