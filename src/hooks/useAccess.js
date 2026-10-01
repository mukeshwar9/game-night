import { useSyncExternalStore } from 'react'
import { getAccess, subscribeAccess } from '../lib/entitlements'

// What the viewer has bought: { pass, supporter, admin, bypass, isUnlocked(item), loaded, … }.
// Re-renders when entitlements/{uid} changes. Components call
// `access.isUnlocked(item)` for any registry entry; free items are always open.
export default function useAccess() {
  return useSyncExternalStore(subscribeAccess, getAccess, getAccess)
}
