import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../lib/AuthContext'
import { dismissInvite } from '../lib/social'
import { getGameConfig } from '../lib/games'

// Headless: surfaces new game invites as toasts from anywhere in the app.
// Only fresh invites toast: the seen-set dedupes within a session, and the
// age guard covers the mount race where the ref seeds before Firebase's
// first snapshot lands — without it, every stale pending invite would toast
// on each app load.
const MAX_TOAST_AGE_MS = 2 * 60 * 1000
export default function InviteToasts() {
  const { invites } = useAuth()
  const navigate = useNavigate()
  const seen = useRef(null)

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(invites.map(inv => inv.id))
      return
    }
    for (const inv of invites) {
      if (seen.current.has(inv.id)) continue
      seen.current.add(inv.id)
      if (inv.at && Date.now() - inv.at > MAX_TOAST_AGE_MS) continue
      const label = getGameConfig(inv.gameType)?.label || inv.gameType || 'a game'
      toast(`${inv.fromName || 'A friend'} invited you to ${label}`, {
        duration: 10000,
        action: {
          label: 'JOIN',
          onClick: () => {
            dismissInvite(inv.id)
            navigate(`/game/${inv.gameId}`)
          },
        },
      })
    }
  }, [invites, navigate])

  return null
}
