import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import ThemePreview from '../components/ThemePreview'
import LockBadge, { PassStar } from '../components/premium/LockBadge'
import PassStatus from '../components/premium/PassStatus'
import useAccess from '../hooks/useAccess'
import { PACKS, PRICES, formatCents } from '../lib/premiumCatalog'
import { hasPack } from '../lib/premium'
import { premiumItems } from '../lib/premiumItems'
import { beginPurchase, openPaywall } from '../lib/premiumUi'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'theme', label: 'THEMES' },
  { id: 'avatar', label: 'AVATARS' },
  { id: 'emote', label: 'EMOTES' },
]

function Preview({ item }) {
  if (item.kind === 'theme') return <ThemePreview theme={item.id} caption={item.label} className="w-full h-24" />
  if (item.kind === 'avatar') return <div className="h-24 flex items-center justify-center"><Avatar id={item.preview} size={64} /></div>
  return <div className="h-24 flex items-center justify-center text-5xl" aria-hidden="true">{item.glyph}</div>
}

function PackSection({ pack, items, access }) {
  const owned = access.isUnlocked({ premium: true, pack: pack.id })
  const bought = hasPack(access.ent, pack.id)
  return (
    <section aria-label={pack.label} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-pixel text-[10px] tracking-widest text-retro-text">{pack.label}</h2>
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">{pack.blurb}</p>
        </div>
        {owned ? (
          <span className="shrink-0 font-pixel text-[9px] tracking-wider text-retro-win">{bought ? 'OWNED' : 'UNLOCKED'}</span>
        ) : (
          <button
            type="button"
            onClick={() => beginPurchase(`pack-${pack.id}`)}
            className="shrink-0 min-h-11 px-3 rounded border-2 border-retro-cta bg-retro-tint-cta text-retro-cta font-pixel text-[9px] tracking-wider active:scale-95 transition-all"
          >
            BUY {formatCents(pack.cents)}
          </button>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {items.map(item => {
          const open = access.isUnlocked(item)
          return (
            <li key={`${item.kind}:${item.id}`}>
              <button
                type="button"
                onClick={() => (open ? null : openPaywall(item))}
                aria-label={open ? item.label : `${item.label}, locked`}
                className={cn('w-full rounded border bg-retro-card p-2 text-left space-y-1 transition-colors', open ? 'border-retro-border cursor-default' : 'border-retro-border hover:border-retro-cta/60 active:scale-[0.98]')}
              >
                <Preview item={item} />
                <span className="flex items-center justify-between gap-1">
                  <span className="font-pixel text-[8px] tracking-wide text-retro-text truncate">{item.label}</span>
                  {!open && <LockBadge size={11} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function Shop() {
  const access = useAccess()
  const [tab, setTab] = useState('theme')
  const items = premiumItems(tab)
  const packs = PACKS.filter(p => p.kind === tab).map(p => ({ pack: p, items: items.filter(i => i.pack === p.id) })).filter(g => g.items.length)
  return (
    <main className="min-h-screen bg-retro-bg px-4 pt-4 pb-10">
      <div className="max-w-sm mx-auto space-y-4">
        <header className="space-y-1">
          <h1 className="font-pixel text-sm tracking-widest text-retro-cta text-glow-cta">SHOP</h1>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">Every game stays free. Shop items are looks only: they never change who wins.</p>
        </header>

        <PassStatus linkToPass />

        <div role="tablist" aria-label="Shop sections" className="grid grid-cols-3 gap-1 p-1 rounded border border-retro-border bg-retro-surface">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn('min-h-11 rounded font-pixel text-[9px] tracking-widest transition-all', tab === t.id ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim hover:text-retro-text')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="space-y-5">
          {packs.length ? packs.map(g => <PackSection key={g.pack.id} pack={g.pack} items={g.items} access={access} />) : (
            <p className="font-mono text-[11px] text-retro-dim text-center py-6">New {tab === 'avatar' ? 'avatar items' : `${tab}s`} are on the way.</p>
          )}
        </div>

        <section aria-label="Supporter" className="rounded border border-retro-border bg-retro-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-pixel text-[10px] tracking-widest text-retro-text flex items-center gap-2"><PassStar /> SUPPORTER</h2>
            {access.supporter
              ? <span className="font-pixel text-[9px] tracking-wider text-retro-win">THANK YOU</span>
              : (
                <button type="button" onClick={() => beginPurchase('supporter')} className="min-h-11 px-3 rounded border-2 border-retro-cta bg-retro-tint-cta text-retro-cta font-pixel text-[9px] tracking-wider active:scale-95 transition-all">
                  BACK US {formatCents(PRICES.supporter)}
                </button>
              )}
          </div>
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">A one-time thank-you for keeping Game Night going. You get a badge on your profile. Nothing else changes.</p>
        </section>

        <p className="text-center font-pixel text-[8px] tracking-wider text-retro-dim"><Link to="/pass" className="underline decoration-dotted underline-offset-2">GAME NIGHT PASS</Link></p>
      </div>
    </main>
  )
}
