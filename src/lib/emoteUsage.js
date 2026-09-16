const MAX_TRACKED_EMOTES = 40

export function normalizeEmoteUsage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([glyph, value]) => glyph && value && typeof value === 'object')
      .map(([glyph, value]) => [glyph, {
        count: Number.isFinite(value.count) ? Math.max(0, Math.floor(value.count)) : 0,
        lastUsed: Number.isFinite(value.lastUsed) ? Math.max(0, value.lastUsed) : 0,
      }])
      .filter(([, value]) => value.count > 0),
  )
}

export function recordEmoteUsage(usage, glyph, lastUsed) {
  if (!glyph) return normalizeEmoteUsage(usage)
  const next = normalizeEmoteUsage(usage)
  const current = next[glyph] || { count: 0, lastUsed: 0 }
  next[glyph] = { count: current.count + 1, lastUsed: Math.max(0, lastUsed || 0) }

  const kept = Object.entries(next)
    .sort(([, a], [, b]) => b.count - a.count || b.lastUsed - a.lastUsed)
    .slice(0, MAX_TRACKED_EMOTES)
  return Object.fromEntries(kept)
}

export function getQuickEmotes(usage, defaults, limit = defaults.length) {
  const safeDefaults = [...new Set(defaults || [])].filter(Boolean)
  const entries = Object.entries(normalizeEmoteUsage(usage))
  if (entries.length === 0) return safeDefaults.slice(0, limit)

  const frequent = [...entries].sort(([, a], [, b]) => b.count - a.count || b.lastUsed - a.lastUsed)
  const recent = [...entries].sort(([, a], [, b]) => b.lastUsed - a.lastUsed || b.count - a.count)
  const result = []
  const add = (glyph) => {
    if (glyph && !result.includes(glyph) && result.length < limit) result.push(glyph)
  }

  for (const [glyph] of frequent.slice(0, Math.ceil(limit / 2))) add(glyph)
  for (const [glyph] of recent) add(glyph)
  for (const glyph of safeDefaults) add(glyph)
  return result
}
