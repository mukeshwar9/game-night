import { Suspense, useSyncExternalStore } from 'react'
import { useAuth } from '../lib/AuthContext'
import { canonicalAvatarId, defaultAvatarForId } from '../lib/avatarKit'
import { getPlayerId } from '../lib/playerId'
import { lazyWithRetry } from '../lib/lazyWithRetry'
import { closeAvatarOverlay, getAvatarStudioUi, openAvatarStudio, subscribeAvatarStudioUi } from '../lib/avatarStudioUi'

const AvatarStudio = lazyWithRetry(() => import('./AvatarStudio'))
const PetPicker = lazyWithRetry(() => import('./PetPicker'))

// Mounted once in App: renders the look editor or the pet sheet when the store
// asks, seeded from the saved profile (localStorage mirror before it loads).
export default function AvatarStudioHost() {
  const ui = useSyncExternalStore(subscribeAvatarStudioUi, getAvatarStudioUi, getAvatarStudioUi)
  const { profile } = useAuth()
  if (!ui.open) return null
  const saved = canonicalAvatarId(profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId()))
  const name = profile?.displayName || localStorage.getItem('playerName') || ''
  return (
    <Suspense fallback={null}>
      {ui.open === 'look'
        ? <AvatarStudio key={saved} saved={saved} name={name} onClose={closeAvatarOverlay} />
        : <PetPicker key={saved} saved={saved} onClose={closeAvatarOverlay} onEditLook={openAvatarStudio} />}
    </Suspense>
  )
}
