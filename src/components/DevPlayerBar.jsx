import { useEffect, useState } from 'react'
import { devSlot } from '../lib/devTesting'
import { onValue, ref } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { getUid } from '../lib/auth'
import { cn } from '@/lib/utils'

// F-51: development-only UI for the same-browser local-multiplayer testing
// mode. Rendered only when testing mode is on (dev flag + loopback host).
// - Launcher (no devPlayer slot in this tab): full-screen slot picker; every
//   button opens an ordinary new tab bound to that slot via ?devPlayer=.
// - Bar (a slot is active): persistent dev badge with slot, uid, and emulator
//   connection state, plus the slot menu for opening more players.

const SLOT_LABEL = { spectator: 'SPECTATOR' }
const slotLabel = (s) => SLOT_LABEL[s] || s.toUpperCase()

function slotUrl(slot) {
  const url = new URL(window.location.href)
  url.searchParams.set('devPlayer', slot)
  return url.toString()
}

function openSlot(slot) {
  // noopener = a fully separate browsing context: no sessionStorage copy-in,
  // no opener reference. The explicit ?devPlayer= param is belt-and-braces.
  window.open(slotUrl(slot), '_blank', 'noopener')
}

function SlotMenu({ current }) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'spectator'].map(slot => (
        <button
          key={slot}
          onClick={() => openSlot(slot)}
          aria-label={`OPEN PLAYER SLOT ${slotLabel(slot)}`}
          disabled={slot === current}
          className={cn(
            'min-h-11 min-w-11 px-2.5 py-2.5 font-pixel text-[9px] rounded border-2 transition-all active:scale-95',
            slot === current
              ? 'border-retro-cta bg-retro-tint-cta text-retro-cta opacity-50 cursor-default'
              : 'border-retro-border bg-retro-card text-retro-dim hover:border-retro-cta/50 hover:text-retro-cta',
          )}
        >
          {slotLabel(slot)}
        </button>
      ))}
    </div>
  )
}

// Full-screen launcher — shown when testing mode is on and this tab has no
// slot. Deliberately OUTSIDE the normal app tree (App.jsx returns early), so
// the launcher tab never authenticates or touches Firebase at all.
export function DevPlayerLauncher() {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-6 p-4">
      <div className="text-center space-y-2">
        <h1 className="font-pixel text-lg text-retro-cta text-glow-cta tracking-widest">DEV MULTIPLAYER LAUNCHER</h1>
        <p className="font-mono text-xs text-retro-dim">
          LOCAL EMULATORS · project {`demo-gamenight-test`} · each slot = its own anonymous identity
        </p>
        {configError && <p className="font-mono text-xs text-retro-danger max-w-md">{configError}</p>}
      </div>
      <SlotMenu current={null} />
      <p className="font-mono text-[10px] text-retro-dim text-center max-w-md leading-relaxed">
        Start emulators first: <span className="text-retro-cta">npm run test:emulators</span> (auth + database) and{' '}
        <span className="text-retro-cta">npm run dev:test</span>. Emulator data is disposable.
      </p>
    </div>
  )
}

// Persistent badge for slot tabs: slot, truncated uid, emulator DB connection.
export default function DevPlayerBar() {
  const connected = useEmulatorConnected()
  const [menuOpen, setMenuOpen] = useState(false)
  const uid = getUid()

  return (
    <>
      {menuOpen && (
        <div className="fixed bottom-16 right-3 z-[70] max-w-[95vw] rounded border-2 border-retro-border bg-retro-bg/95 p-3 backdrop-blur-sm">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest mb-2">OPEN ANOTHER PLAYER</p>
          <SlotMenu current={devSlot} />
        </div>
      )}
      <button
        onClick={() => setMenuOpen(o => !o)}
        aria-label="DEVELOPER PLAYER BADGE"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] right-2 z-[70] flex items-center gap-2 rounded border-2 border-retro-border bg-retro-bg/90 px-2.5 py-1.5 backdrop-blur"
      >
        <span className="font-pixel text-[8px] text-retro-cta tracking-widest">DEV {slotLabel(devSlot)}</span>
        <span className="font-mono text-[9px] text-retro-dim">{uid ? uid.slice(0, 8) : 'NO UID'}</span>
        <span className={cn('font-pixel text-[8px] tracking-wider', connected ? 'text-retro-win' : 'text-retro-danger arcade-blink')}>
          {connected ? 'EMU-OK' : 'EMU-DOWN'}
        </span>
      </button>
    </>
  )
}

function useEmulatorConnected() {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!db) return undefined
    const unsub = onValue(ref(db, '.info/connected'), snap => setConnected(!!snap.val()))
    return unsub
  }, [])
  return connected
}
