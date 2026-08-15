// Reaction emoji registry — single source for UI lists and sound coverage tests.

function unique(list) {
  return [...new Set(list)]
}

export const EMOTES_PRIMARY = ['🔥', '😂', '😭', '😎', '👏', '💀', '🤫']

const PRIMARY_FACES = ['😂', '😭', '😎', '🤫']

// Full Unicode smiley / face catalog (no skin tones). Order = picker grid order.
export const EMOTES_FACES = [
  // Happy / laugh
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇',
  '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋',
  // Silly
  '😛', '😜', '🤪', '😝', '🤑',
  // Social
  '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨',
  // Neutral
  '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬',
  // Breath / lie / shake
  '😮‍💨', '🤥', '🫨',
  // Calm / tired
  '😌', '😔', '😪', '🤤', '😴', '🥱',
  // Sick
  '😷', '🤒', '🤕', '🤢', '🤮', '🤧',
  // Hot / cold / woozy
  '🥵', '🥶', '🥴', '😵', '😵‍💫', '🤯',
  // Costume
  '🤠', '🥳', '🥸', '😎', '🤓', '🧐',
  // Worried / sad
  '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '🥹',
  '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
  // Struggle
  '😖', '😣', '😞', '😓', '😩', '😫', '😤',
  // Angry
  '😡', '😠', '🤬', '😈', '👿',
  // Fantasy / meme
  '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
  // Atmosphere
  '😶‍🌫️', '🫠',
]

export const EMOTES_GESTURES = [
  '🔥', '👏', '💀', '❤️', '🎉', '🤔', '😱', '👍', '🙏', '💪', '😤', '🎯', '⚡', '🍀',
]

export const EMOTES_PICKER_FACES = unique([...PRIMARY_FACES, ...EMOTES_FACES])
export const EMOTES_PICKER_GESTURES = unique(EMOTES_GESTURES)
export const EMOTES_PICKER_ALL = unique([...EMOTES_PICKER_FACES, ...EMOTES_PICKER_GESTURES])

// Quick-chat chips — one-tap intent phrases for 2P rooms (GG / NICE / etc).
// Fixed allowlist so the write is bounded and needs no moderation.
export const QUICK_CHAT = ['GG', 'NICE!', 'OOPS', 'YOUR MOVE', 'REMATCH?', 'BRB']

export function isQuickChat(text) {
  return QUICK_CHAT.includes(text)
}
