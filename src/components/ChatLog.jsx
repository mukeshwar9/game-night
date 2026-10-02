import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { normalizeChatLog, linkifyChatText, reportContextFor } from '../lib/chat'
import { moderateText } from '../lib/moderationLogic'
import { toggleMute, unmute, useMutedMap } from '../lib/mute'
import { submitReport } from '../lib/feedback'
import { useAuth } from '../lib/AuthContext'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

const ACTION_BTN = 'min-h-11 px-3 rounded border border-retro-border font-pixel text-[8px] tracking-wider transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'

function timeLabel(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

// The room's chat history, shown in the chat sheet: your lines on the right,
// everyone else's on the left, newest at the bottom, auto-scrolling as new
// ones arrive. Lines the chat moderation function hid (`hidden`) and lines
// from blocked players are left out.
//
// Trust tools: tapping another player's name opens BLOCK / REPORT for that
// message. A blocked player's messages are hidden and they can no longer send
// this account friend requests or invites (mute.js, synced to the account);
// a footer lists blocked authors present in the log with UNBLOCK. A report
// carries the few lines before the reported one, so whoever reviews it sees
// the conversation. Text and names are masked again on display (moderateText)
// so messages from older clients that sent unmasked text are covered too.
export default function ChatLog({ chatLog, myUid, className = '' }) {
  const { gameId } = useParams()
  const { profile } = useAuth()
  const muted = useMutedMap()
  const msgs = normalizeChatLog(chatLog)
  const scrollRef = useRef(null)
  const [openKey, setOpenKey] = useState(null)
  const [reporting, runReport] = useBusy()

  const visible = msgs.filter(([, msg]) => !muted[msg.by] && !msg.hidden)

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

  const mute = (uid, name) => {
    toggleMute(uid, name)
    setOpenKey(null)
    toast(`${name} BLOCKED — NO MORE CHAT, FRIEND REQUESTS OR INVITES FROM THEM.`, {
      action: { label: 'UNDO', onClick: () => unmute(uid) },
    })
  }

  const report = (key, msg, name) => runReport(async () => {
    const res = await submitReport({
      gameId,
      targetUid: msg.by,
      targetName: name,
      text: msg.text || (msg.img ? '[sticker]' : ''),
      chatContext: reportContextFor(msgs, key),
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
    <div className={cn('flex flex-col', className)}>
      <div ref={scrollRef} data-selectable className="min-h-0 flex-1 overflow-y-auto py-2 space-y-2" aria-label="Chat history">
        {visible.length === 0 && (
          <p className="font-mono text-xs text-retro-dim text-center pt-6">
            {msgs.length > 0 ? 'Only blocked players have chatted.' : 'No messages yet — say hi.'}
          </p>
        )}
        {visible.map(([key, msg]) => {
          const mine = msg.by === myUid
          const name = moderateText(msg.name || '').text || 'PLAYER'
          const open = openKey === key
          return (
            <div key={key} className={cn('flex flex-col max-w-[85%]', mine ? 'ml-auto items-end' : 'items-start')}>
              <div className="flex items-baseline gap-1.5 mb-0.5">
                {mine ? (
                  <span className="font-pixel text-[8px] tracking-wider text-retro-p1">YOU</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenKey(open ? null : key)}
                    aria-expanded={open}
                    aria-label={`${name} — block or report`}
                    className="font-pixel text-[9px] tracking-wider text-retro-p2 hover:text-retro-text underline decoration-dotted underline-offset-2"
                  >
                    {name}
                  </button>
                )}
                <span className="font-mono text-[10px] text-retro-dim">{timeLabel(msg.ts)}</span>
              </div>
              {msg.img ? (
                <img src={msg.img} alt="sticker" className="w-16 h-16 object-contain rounded" draggable={false} />
              ) : null}
              {msg.text ? (
                <span className={cn(
                  'font-mono text-[13px] text-retro-text break-words leading-snug px-2.5 py-1.5 rounded-lg',
                  mine ? 'bg-retro-tint-p1 rounded-br-sm' : 'bg-retro-tint-p2 rounded-bl-sm',
                )}>
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
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => mute(msg.by, name)}
                    className={cn(ACTION_BTN, 'text-retro-dim hover:text-retro-text hover:border-retro-p1')}
                  >
                    BLOCK {name}
                  </button>
                  <button
                    type="button"
                    onClick={() => report(key, msg, name)}
                    disabled={reporting}
                    className={cn(ACTION_BTN, 'text-retro-p2 hover:border-retro-p2')}
                  >
                    {reporting ? 'REPORTING…' : 'REPORT'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {mutedHere.length > 0 && (
        <div className="shrink-0 border-t border-retro-border pt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-pixel text-[8px] text-retro-dim tracking-widest">BLOCKED:</span>
          {mutedHere.map(({ uid, name }) => (
            <button
              key={uid}
              type="button"
              onClick={() => unmute(uid)}
              className="min-h-11 font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text"
            >
              {name} · UNBLOCK
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
