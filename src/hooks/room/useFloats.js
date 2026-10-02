import { useEffect, useRef, useState } from 'react'
import { ref, update, push, serverTimestamp } from 'firebase/database'
import { db } from '../../lib/firebase'
import { getGameConfig } from '../../lib/games'
import { getPlayerId } from '../../lib/playerId'
import { sanitizeChatText, isValidChatMessage, normalizeChatLog, chatKeysToPrune, CHAT_LOG_CAP } from '../../lib/chat'
import {
  CHAT_CLIENT_GAP_MS, EMOTE_CLIENT_GAP_MS, emoteKeysToPrune, floatDurationMs, newEmoteEntries, normalizeEmotes,
} from '../../lib/chatUiLogic'
import { sounds } from '../../lib/sounds'
import { isMuted } from '../../lib/mute'
import { moderateText } from '../../lib/moderationLogic'

// Emoji reactions and free-text chat for a room: sends them (rate-limited,
// floated optimistically for the sender) and floats newly received ones.
// `floats` feeds Game.jsx's EmoteFloats overlay; `announcement` feeds a polite
// live region so screen readers hear chat and reactions from other players.
//
// Reactions are a list (games/{id}/emotes/{pushId}), one entry per reaction,
// so two players reacting at the same moment both land. The single `emote`
// slot older clients still write is read too, so mixed-version rooms keep
// working. Every send also stamps chatLast/{uid} or emoteLast/{uid} with the
// server time — the database rules use the stamp to rate-limit senders.
export default function useFloats({ game, gameId, mySymbol }) {
  const [floats, setFloats] = useState([])
  const [announcement, setAnnouncement] = useState('')
  const prevEmoteTs = useRef(0)
  const emoteInit = useRef(false)
  const emotesInit = useRef(false)
  const seenEmoteKeys = useRef(new Set())
  const emoteIdRef = useRef(0)
  const emoteTimeouts = useRef(new Map())
  const emoteReadyAt = useRef(0)
  const emoteSoundReadyAt = useRef(0)
  const [emoteCooldown, setEmoteCooldown] = useState(false)
  const prevChatTs = useRef(0)
  const chatInit = useRef(false)
  const chatReadyAt = useRef(0)
  const [chatCooldown, setChatCooldown] = useState(false)

  const removeLater = (id, ms) => {
    const existing = emoteTimeouts.current.get(id)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      setFloats(f => f.filter(fl => fl.id !== id))
      emoteTimeouts.current.delete(id)
    }, ms)
    emoteTimeouts.current.set(id, t)
  }

  // The live-region text is set on the next tick, outside the snapshot effect
  // that received the message (LiveAnnouncer re-speaks on every change).
  const announceLater = (text) => { setTimeout(() => setAnnouncement(text), 0) }

  const senderName = (e) => game?.players?.[e.by]?.name ?? (typeof e.name === 'string' ? moderateText(e.name.slice(0, 20)).text : '')

  // Push a reaction onto the floats array — appends a new float, or (within
  // 1.5s of the same glyph from the same sender) bumps the existing float's
  // combo count and re-arms its removal timer.
  const pushEmote = (e) => {
    // Locally muted senders (mute.js) float nothing. `e.by` is a 2P seat
    // symbol or a uid (party seats and spectators).
    const byUid = game?.players?.[e.by]?.playerId ?? e.by
    const mine = e.by === mySymbol.current || byUid === getPlayerId()
    if (!mine && isMuted(byUid)) return
    const name = senderName(e)
    const now = Date.now()
    if (document.visibilityState === 'visible' && now >= emoteSoundReadyAt.current) {
      emoteSoundReadyAt.current = now + 140
      sounds.reaction(e.glyph, { volume: mine ? 0.7 : 1 })
    }
    if (!mine) announceLater(`${name || 'A player'} reacted ${e.glyph}`)
    const duration = floatDurationMs('')
    setFloats(prev => {
      const last = prev[prev.length - 1]
      const at = Date.now()
      if (last && last.kind !== 'chat' && last.glyph === e.glyph && last.by === e.by && at - last.at < 1500) {
        removeLater(last.id, duration)
        return prev.map(fl => (fl.id === last.id ? { ...fl, count: fl.count + 1, at } : fl))
      }
      const id = ++emoteIdRef.current
      const dx = Math.round((Math.random() * 2 - 1) * 12)
      const rot = Math.round((Math.random() * 2 - 1) * 10)
      removeLater(id, duration)
      return [...prev, { id, kind: 'emote', glyph: e.glyph, by: e.by, name, count: 1, dx, rot, at, duration, spectator: !!e.spectator }]
    })
  }

  // Push a chat message onto the floats array — unlike pushEmote, always a
  // fresh float (no combo/count merging); it stays up long enough to read.
  const pushChatFloat = (msg, { announce = false } = {}) => {
    const id = ++emoteIdRef.current
    // Masked on display too, for older clients that sent unmasked text.
    const text = moderateText(msg.text || '').text
    const name = moderateText(msg.name || '').text
    if (announce) announceLater(`${name || 'A player'} says: ${text}`)
    const duration = floatDurationMs(text)
    removeLater(id, duration)
    setFloats(prev => [...prev, { id, kind: 'chat', text, name, by: msg.seat ?? msg.by, seat: msg.seat ?? null, count: 1, at: Date.now(), duration }])
  }

  // Clear any pending float-removal timers on unmount
  useEffect(() => {
    const timeouts = emoteTimeouts.current
    return () => {
      timeouts.forEach(t => clearTimeout(t))
      timeouts.clear()
    }
  }, [])

  // Reaction list — float entries that arrive after join. The first snapshot
  // latches everything already present (stale reactions are not replayed);
  // our own sends are pre-marked as seen because they float optimistically.
  // `hasGame` is a dep so the latch happens on the first snapshot even when
  // the room has no reactions yet.
  const hasGame = !!game
  const emotesRaw = game?.emotes
  useEffect(() => {
    if (!hasGame) return
    const entries = normalizeEmotes(emotesRaw)
    if (!emotesInit.current) {
      emotesInit.current = true
      for (const [k] of entries) seenEmoteKeys.current.add(k)
      return
    }
    const fresh = newEmoteEntries(entries, seenEmoteKeys.current)
    for (const [k, e] of fresh) {
      seenEmoteKeys.current.add(k)
      pushEmote(e)
    }
    // pushEmote is deliberately omitted: it reads the same render's values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGame, emotesRaw])

  // Legacy single-slot reaction from clients older than the list — float a
  // newly-received one (skip the stale one present on join).
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
    // to fire when a NEW legacy emote lands (ts changes).
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
    if (isMuted(newest.by)) return
    if (!isValidChatMessage(newest) || newest.hidden) return
    pushChatFloat(newest, { announce: true })
    sounds.emote()
    // pushChatFloat is deliberately omitted (same render's values).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGame, chatLog])

  const sendEmote = async (glyph) => {
    // Seated 2P players send as their seat (X/O); everyone else — party
    // seats (uid-keyed players) and spectators of either room family — as
    // their uid. Spectators aren't in `players`, so their emote carries its
    // own name and a `spectator` flag (floated centre-stage, not on a side).
    const uid = getPlayerId()
    const sender = mySymbol.current || uid
    const party = !!getGameConfig(game?.gameType)?.nPlayer
    const spectator = party ? !game?.players?.[uid] : !mySymbol.current
    const now = Date.now()
    if (now < emoteReadyAt.current) return false
    emoteReadyAt.current = now + EMOTE_CLIENT_GAP_MS
    setEmoteCooldown(true)
    setTimeout(() => setEmoteCooldown(false), EMOTE_CLIENT_GAP_MS)

    const entry = { by: sender, glyph, ts: now }
    if (spectator) {
      entry.spectator = true
      entry.name = (localStorage.getItem('playerName') || 'WATCHER').slice(0, 20)
    }
    const k = push(ref(db, `games/${gameId}/emotes`)).key
    seenEmoteKeys.current.add(k)
    pushEmote(entry)
    const updates = { [`emotes/${k}`]: entry, [`emoteLast/${uid}`]: serverTimestamp() }
    const entries = normalizeEmotes(game?.emotes)
    for (const key of emoteKeysToPrune([...entries, [k, entry]])) updates[`emotes/${key}`] = null
    try {
      await update(ref(db, `games/${gameId}`), updates)
    } catch { /* ignore — a rate-limited or offline reaction just doesn't land */ }
    return true
  }

  // Free-text chat — sanitize, rate-limit, float our own message
  // optimistically, append via a push id, and prune the log back to cap.
  const sendChat = async (raw) => {
    const text = sanitizeChatText(raw)
    if (!text) return false
    const now = Date.now()
    if (now < chatReadyAt.current) return false
    chatReadyAt.current = now + CHAT_CLIENT_GAP_MS
    setChatCooldown(true)
    setTimeout(() => setChatCooldown(false), CHAT_CLIENT_GAP_MS)

    const uid = getPlayerId()
    const msg = {
      by: uid,
      name: localStorage.getItem('playerName') || 'PLAYER',
      text,
      ts: now,
      ...(mySymbol.current ? { seat: mySymbol.current } : {}),
    }
    prevChatTs.current = now
    pushChatFloat(msg)
    const k = push(ref(db, `games/${gameId}/chatLog`)).key
    const updates = { [`chatLog/${k}`]: msg, [`chatLast/${uid}`]: serverTimestamp() }
    for (const key of chatKeysToPrune(normalizeChatLog(game?.chatLog), CHAT_LOG_CAP - 1)) updates[`chatLog/${key}`] = null
    try {
      await update(ref(db, `games/${gameId}`), updates)
    } catch { return false }
    return true
  }

  return { floats, sendEmote, sendChat, emoteCooldown, chatCooldown, announcement }
}
