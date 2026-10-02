// Tiny external store for the two avatar overlays, so the profile, the settings
// sheet and anything else can open them with one call and a single
// <AvatarStudioHost/> (mounted in App) renders them on top of any page, rooms
// included.
//   openAvatarStudio()  the full-screen look editor
//   openPetPicker()     the pet sheet, kept apart from the look editor
let state = { open: null }
const listeners = new Set()

function set(next) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export const getAvatarStudioUi = () => state
export function subscribeAvatarStudioUi(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const openAvatarStudio = () => set({ open: 'look' })
export const openPetPicker = () => set({ open: 'pet' })
export const closeAvatarOverlay = () => set({ open: null })
