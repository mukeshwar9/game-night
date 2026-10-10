import SwitchRow from '../SwitchRow'
import useAccess from '../../hooks/useAccess'
import { setViewAsPlayer } from '../../lib/entitlements'
import { canPreviewMonetization, monetizationEnabled, setMonetizationPreview } from '../../lib/monetizationState'

// Admin and dev tools for the settings sheet. "View as regular player" hides the
// admin allowlist and dev bypass so the locks, paywall, shop and Pass look the way
// a signed-in player with no purchases sees them; it never unlocks anything. The
// monetization preview is dev only (a production build ignores the override).
export function AdminToolsPanel() {
  const access = useAccess()
  return (
    <>
      {access.canViewAsPlayer && (
        <>
          <SwitchRow
            label="VIEW AS REGULAR PLAYER"
            checked={access.viewAsPlayer}
            onChange={setViewAsPlayer}
            ariaLabel="View as a regular player"
          />
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            Hides your admin and dev unlocks and any purchases, so you see the locks, paywall, shop and Pass a new player sees. Only on this device.
          </p>
        </>
      )}
      {canPreviewMonetization() && (
        <>
          <SwitchRow
            label="MONETIZATION (DEV PREVIEW)"
            checked={monetizationEnabled()}
            onChange={setMonetizationPreview}
            ariaLabel="Preview monetization on"
          />
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            Dev servers only: switches the shop, Pass and locks on or off for this browser and reloads. Production builds ignore it.
          </p>
        </>
      )}
    </>
  )
}

// Mounted once in App: a persistent badge while "view as regular player" is on,
// so the locked look is never mistaken for the account's real state.
export function ViewAsPlayerBadge() {
  const access = useAccess()
  if (!access.viewAsPlayer) return null
  return (
    <div
      className="fixed left-2 z-50 pointer-events-none"
      style={{ bottom: 'calc(var(--app-tabbar-h, 0px) + 0.5rem)' }}
    >
      <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-full border-2 border-retro-cta bg-retro-tint-cta px-3 py-1.5 shadow-neon-cta">
        <span className="font-pixel text-[8px] text-retro-cta tracking-wider">VIEWING AS REGULAR PLAYER</span>
        <button
          type="button"
          onClick={() => setViewAsPlayer(false)}
          className="font-pixel text-[8px] text-retro-text underline underline-offset-2 hover:text-retro-cta transition-colors p-2 -m-2"
        >
          TURN OFF
        </button>
      </div>
    </div>
  )
}
