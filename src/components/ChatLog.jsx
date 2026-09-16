import { useEffect, useRef } from 'react'
import { normalizeChatLog } from '../lib/chat'

// Free-text chat log for a game room — renders the last few messages, newest
// at the bottom, auto-scrolling as new ones arrive. Null when there's nothing
// to show yet (no empty-card flash on room load).
export default function ChatLog({ chatLog, myUid }) {
  const msgs = normalizeChatLog(chatLog)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs.length])

  if (msgs.length === 0) return null

  const visible = msgs.slice(-8)

  return (
    <div className="border border-retro-border rounded bg-retro-card">
      <p className="font-pixel text-[7px] text-retro-dim px-2 pt-2 tracking-widest">CHAT</p>
      <div ref={scrollRef} className="max-h-40 overflow-y-auto p-2 space-y-1">
        {visible.map(([key, msg]) => (
          <div key={key}>
            <span className={`font-pixel text-[7px] tracking-wider ${msg.by === myUid ? 'text-retro-p1' : 'text-retro-dim'}`}>
              {msg.name}{' '}
            </span>
            <span className="font-mono text-[11px] text-retro-text break-words leading-snug">
              {msg.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
