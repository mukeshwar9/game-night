// Retro pixel-art avatar registry. Keys are stored on the profile
// (`users/{uid}.avatar`) and in game player slots; the matching pixel-art SVG is
// rendered by src/components/Avatar.jsx. Keep this list and that component's
// `GLYPHS` map in sync.

export const AVATARS = [
  'invader', 'robot', 'ghost', 'alien',
  'skull', 'cat', 'ufo', 'wizard',
  'ninja', 'crown', 'dino', 'heart',
]

export function isValidAvatar(key) {
  return AVATARS.includes(key)
}

// Deterministic default so brand-new guests don't all look identical. Stable for
// a given id (uid), so the same person keeps the same default until they pick.
export function defaultAvatarForId(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATARS[h % AVATARS.length]
}
