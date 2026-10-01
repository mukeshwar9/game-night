import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { normalizeChatLog } from '../lib/chat'
import { linkifyChatText } from '../lib/chat'
import { moderateText } from '../lib/moderationLogic'
import { toggleMute, unmute, useMutedMap } from '../lib/mute'
import { submitReport } from '../lib/feedback'
import { useAuth } from '../lib/AuthContext'
import useBusy from '../hooks/useBusy'

// Free-text chat log for a game room — renders the last few messages, newest
// at the bottom, auto-scrolling as new ones arrive. Null when there's nothing
// to show yet (no empty-card flash on room load).
//
// Trust tools: tapping another player's name opens BLOCK / REPORT for that
// message. A blocked player's messages are hidden and they can no longer send
// this account friend requests or invites (mute.js, synced to the account);
// a footer lists blocked authors present in the log with UNBLOCK. Text and names
// are masked again on display (moderateText) so messages from older clients
// that sent unmasked text are covered too.
export default function ChatLog({ chatLog, myUid }) {
  const { gameId } = useParams()
  const { profile } = useAuth()
  const muted = useMutedMap()
  const msgs = normalizeChatLog(chatLog)
  const scrollRef = useRef(null)
  const [openKey, setOpenKey] = useState(null)
  const [reporting, runReport] = useBusy()

  const shown = msgs.filter(([, msg]) => !muted[msg.by])
  const visible = shown.slice(-8)

  // Keyed on the newest message rather than a count: once the log is at its
  // cap, the count stops changing while messages keep arriving.
  const newestKey = visible[visible.length - 1]?.[0]
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [newestKey])

  // Blocked authors who have messages in this log, for the UNBLOCK footer.
  const mutedHere = []
  const seen = new Set()
  for (const [, msg] of msgs) {
    if (muted[msg.by] && !seen.has(msg.by)) {
      seen.add(msg.by)
      mutedHere.push({ uid: msg.by, name: moderateText(msg.name || '').text || 'PLAYER' })
    }
  }

  if (msgs.length === 0) return null

  const mute = (uid, name) => {
    toggleMute(uid, name)
    setOpenKey(null)
    toast(`${name} BLOCKED — NO MORE CHAT, FRIEND REQUESTS OR INVITES FROM THEM.`)
  }

  const report = (msg, name) => runReport(async () => {
    const res = await submitReport({
      gameId,
      targetUid: msg.by,
      targetName: name,
      text: msg.text || (msg.img ? '[sticker]' : ''),
      profile,
    })
    if (res.reason === 'cooldown') {
      toast.error(`WAIT ${Math.ceil(res.retryInMs / 1000)}S BEFORE SENDING ANOTHER REPORT.`)
      return
    }
    if (!res.ok) throw new Error('invalid')
    setOpenKey(null)
    toast.success('REPORTED — THANKS. YOU CAN ALSO BLOCK THEM.')
  }, () => toast.error("COULDN'T SEND THAT REPORT — TRY AGAIN."))

  return (
    <div className="border border-retro-border rounded bg-retro-card">
      <p className="font-pixel text-[8px] text-retro-dim px-2 pt-2 tracking-widest">CHAT</p>
      <div ref={scrollRef} data-selectable className="max-h-40 overflow-y-auto p-2 space-y-1">
        {visible.map(([key, msg]) => {
          const mine = msg.by === myUid
          const name = moderateText(msg.name || '').text || 'PLAYER'
          const open = openKey === key
          return (
            <div key={key}>
              {mine ? (
                <span className="font-pixel text-[8px] tracking-wider text-retro-p1">{name}{' '}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : key)}
                  aria-expanded={open}
                  aria-label={`${name} — block or report`}
                  className="font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text underline decoration-dotted underline-offset-2"
                >
                  {name}
                </button>
              )}
              {!mine && ' '}
              {msg.img ? (
                <img src={msg.img} alt="sticker" className="w-16 h-16 object-contain rounded mt-0.5" draggable={false} />
              ) : null}
              {msg.text ? (
                <span className="font-mono text-[11px] text-retro-text break-words leading-snug">
                  {linkifyChatText(moderateText(msg.text).text).map((seg, i) =>
                    seg.kind === 'link' ? (
                      <a
                        key={i}
                        href={seg.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-retro-cta underline underline-offset-2 break-all"
                      >
                        {seg.text}
                      </a>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                </span>
              ) : null}
              {open && (
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => mute(msg.by, name)}
                    className="min-h-8 px-2 rounded border border-retro-border font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text hover:border-retro-p1 transition-colors active:scale-95"
                  >
                    BLOCK {name}
                  </button>
                  <button
                    type="button"
                    onClick={() => report(msg, name)}
                    disabled={reporting}
                    className="min-h-8 px-2 rounded border border-retro-border font-pixel text-[8px] tracking-wider text-retro-p2 hover:border-retro-p2 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reporting ? 'REPORTING…' : 'REPORT'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {visible.length === 0 && (
          <p className="font-mono text-[10px] text-retro-dim">Only blocked players have chatted.</p>
        )}
      </div>
      {mutedHere.length > 0 && (
        <div className="border-t border-retro-border px-2 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-pixel text-[8px] text-retro-dim tracking-widest">BLOCKED:</span>
          {mutedHere.map(({ uid, name }) => (
            <button
              key={uid}
              type="button"
              onClick={() => unmute(uid)}
              className="min-h-8 font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text"
            >
              {name} · UNBLOCK
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
