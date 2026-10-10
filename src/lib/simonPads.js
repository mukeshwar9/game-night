// Simon pad identities: one fixed colour per quadrant (the --simon-* palette in
// src/index.css, deliberately not themed) plus a corner glyph that points at the
// pad's own position, so a colour-blind player — or the 1-BIT MONO theme — never
// depends on colour. Index order matches simonLogic's pad indices (0–3).

export const SIMON_PAD_META = [
  { key: 'green',  where: 'top left',     glyph: '◤' },
  { key: 'red',    where: 'top right',    glyph: '◥' },
  { key: 'yellow', where: 'bottom left',  glyph: '◣' },
  { key: 'blue',   where: 'bottom right', glyph: '◢' },
]

// CSS custom property value for a pad's colour channel triplet, for `--pad`.
export function simonPadVar(i) {
  const meta = SIMON_PAD_META[i] ?? SIMON_PAD_META[0]
  return `var(--simon-${meta.key})`
}

// Spoken name for a pad: "green pad, top left".
export function simonPadName(i) {
  const meta = SIMON_PAD_META[i]
  return meta ? `${meta.key} pad, ${meta.where}` : 'pad'
}
