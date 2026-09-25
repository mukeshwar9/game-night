import { useEffect, useRef, useState } from 'react'
import { ref, update, push } from 'firebase/database'
import { db } from '../../lib/firebase'
import { getGameConfig } from '../../lib/games'
import { getPlayerId } from '../../lib/playerId'
import { sanitizeChatText, isValidChatMessage, normalizeChatLog, chatKeysToPrune, CHAT_LOG_CAP } from '../../lib/chat'
import { sounds } from '../../lib/sounds'

// Emoji reactions and free-text chat for a room: sends them (rate-limited,
// floated optimistically for the sender) and floats newly received ones.
// `floats` feeds Game.jsx's EmoteFloats overlay.
export default function useFloats({ game, gameId, mySymbol }) {
  const [floats, setFloats] = useState([])
  const prevEmoteTs = useRef(0)
  const emoteInit = useRef(false)
  const emoteIdRef = useRef(0)
  const emoteTimeouts = useRef(new Map())
  const emoteReadyAt = useRef(0)
  const emoteSoundReadyAt = useRef(0)
  const [emoteCooldown, setEmoteCooldown] = useState(false)
  const prevChatTs = useRef(0)
  const chatInit = useRef(false)
  const chatReadyAt = useRef(0)
  const [chatCooldown, setChatCooldown] = useState(false)

  // Push a reaction onto the floats array — appends a new float, or (within
  // 1.5s of the same glyph from the same sender) bumps the existing float's
  // combo count and re-arms its removal timer.
  const pushEmote = (e) => {
    const name = game?.players?.[e.by]?.name ?? ''
    const now = Date.now()
    if (document.visibilityState === 'visible' && now >= emoteSoundReadyAt.current) {
      emoteSoundReadyAt.current = now + 140
      sounds.reaction(e.glyph, { volume: (e.by === mySymbol.current || e.by === getPlayerId()) ? 0.7 : 1 })
    }
    setFloats(prev => {
      const last = prev[prev.length - 1]
      const now = Date.now()
      if (last && last.glyph === e.glyph && last.by === e.by && now - last.at < 1500) {
        const existing = emoteTimeouts.current.get(last.id)
        if (existing) clearTimeout(existing)
        const t = setTimeout(() => {
          setFloats(f => f.filter(fl => fl.id !== last.id))
          emoteTimeouts.current.delete(last.id)
        }, 2000)
        emoteTimeouts.current.set(last.id, t)
        return prev.map(fl => (fl.id === last.id ? { ...fl, count: fl.count + 1, at: now } : fl))
      }
      const id = ++emoteIdRef.current
      const dx = Math.round((Math.random() * 2 - 1) * 24)
      const rot = Math.round((Math.random() * 2 - 1) * 10)
      const float = { id, glyph: e.glyph, by: e.by, name, count: 1, dx, rot, at: now }
      const t = setTimeout(() => {
        setFloats(f => f.filter(fl => fl.id !== id))
        emoteTimeouts.current.delete(id)
      }, 2000)
      emoteTimeouts.current.set(id, t)
      return [...prev, float]
    })
  }

  // Push a chat message onto the floats array — unlike pushEmote, always a
  // fresh float (no combo/count merging), same 2s removal timing.
  const pushChatFloat = (msg) => {
    const id = ++emoteIdRef.current
    const float = { id, kind: 'chat', text: msg.text, name: msg.name, seat: msg.seat ?? null, count: 1, at: Date.now() }
    const t = setTimeout(() => {
      setFloats(f => f.filter(fl => fl.id !== id))
      emoteTimeouts.current.delete(id)
    }, 2000)
    emoteTimeouts.current.set(id, t)
    setFloats(prev => [...prev, float])
  }

  // Clear any pending float-removal timers on unmount
  useEffect(() => {
    const timeouts = emoteTimeouts.current
    return () => {
      timeouts.forEach(t => clearTimeout(t))
      timeouts.clear()
    }
  }, [])

  // Emote channel — float a newly-received reaction (skip the stale one
  // present on join). `hasGame` is a dep so the join guard latches on the
  // first snapshot even when the room has no emote yet — otherwise the first
  // reaction received after joining would be mistaken for the stale one.
  const hasGame = !!game
  const emote = game?.emote
  const emoteTs = emote?.ts
  useEffect(() => {
    if (!hasGame) return // don't latch the init guard before the first snapshot
    if (!emoteInit.current) {
      emoteInit.current = true
      prevEmoteTs.current = emoteTs || 0
      return
    }
    if (!emote || !emoteTs || emoteTs === prevEmoteTs.current) return
    prevEmoteTs.current = emoteTs
    pushEmote(emote)
    // `emote` and pushEmote are deliberately omitted: this effect only needs
    // to fire when a NEW emote lands (ts changes) — by the time it runs,
    // `emote`/`pushEmote` are already the values from that same render, so
    // omitting them causes no staleness. Depending on the `emote` object
    // would refire on every unrelated Firebase snapshot instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGame, emoteTs])

  // Chat channel — float the newest free-text message (skip whatever was
  // already in the log on join, and our own — already floated optimistically
  // by sendChat). Same first-snapshot latch as the emote channel.
  const chatLog = game?.chatLog
  useEffect(() => {
    if (!hasGame) return // don't latch the init guard before the first snapshot
    const entries = normalizeChatLog(chatLog)
    const newest = entries[entries.length - 1]?.[1]
    if (!chatInit.current) {
      chatInit.current = true
      prevChatTs.current = newest?.ts || 0
      return
    }
    if (!newest || newest.ts <= prevChatTs.current) return
    prevChatTs.current = newest.ts
    if (newest.by === getPlayerId()) return
    if (!isValidChatMessage(newest)) return
    pushChatFloat(newest)
    sounds.emote()
  }, [hasGame, chatLog])

  const sendEmote = async (glyph) => {
    // Party rooms never assign X/O seats (mySymbol stays null) — identify by
    // uid there so reactions work; players[].name lookup in pushEmote is
    // uid-keyed in nPlayer rooms. 2P spectators stay muted as before.
    const sender = mySymbol.current
      || (getGameConfig(game?.gameType)?.nPlayer ? getPlayerId() : null)
    if (!sender) return false
    const now = Date.now()
    if (now < emoteReadyAt.current) return false
    emoteReadyAt.current = now + 600
    setEmoteCooldown(true)
    setTimeout(() => setEmoteCooldown(false), 600)

    prevEmoteTs.current = now
    pushEmote({ by: sender, glyph, ts: now })
    try {
      await update(ref(db, `games/${gameId}`), { emote: { by: sender, glyph, ts: now } })
    } catch { /* ignore */ }
    return true
  }

  // Free-text chat — sanitize, rate-limit (2s), float our own message
  // optimistically, append via a push id, and prune the log back to cap.
  const sendChat = async (raw) => {
    const text = sanitizeChatText(raw)
    if (!text) return false
    const now = Date.now()
    if (now < chatReadyAt.current) return false
    chatReadyAt.current = now + 2000
    setChatCooldown(true)
    setTimeout(() => setChatCooldown(false), 2000)

    const msg = {
      by: getPlayerId(),
      name: localStorage.getItem('playerName') || 'PLAYER',
      text,
      ts: now,
      ...(mySymbol.current ? { seat: mySymbol.current } : {}),
    }
    prevChatTs.current = now
    pushChatFloat(msg)
    const k = push(ref(db, `games/${gameId}/chatLog`)).key
    const updates = { [k]: msg }
    for (const key of chatKeysToPrune(normalizeChatLog(game?.chatLog), CHAT_LOG_CAP - 1)) updates[key] = null
    try {
      await update(ref(db, `games/${gameId}/chatLog`), updates)
    } catch { return false }
    return true
  }

  return { floats, sendEmote, sendChat, emoteCooldown, chatCooldown }
}
