import { useState } from 'react'
import BottomSheet from './BottomSheet'
import ChatLog from './ChatLog'
import { CHAT_MAX_LENGTH } from '../lib/chat'
import { QUICK_CHAT } from '../lib/emotes'
import { cn } from '@/lib/utils'

const CHIP_BTN_CLASS = 'shrink-0 px-2.5 min-h-11 flex items-center justify-center font-pixel text-[8px] tracking-widest rounded border border-retro-border bg-retro-bg hover:border-retro-cta/50 press transition disabled:opacity-50'

// Room chat as a bottom sheet: the history (with block/report on each name),
// quick phrases, and the input pinned at the bottom. `keyboardSafe` lifts the
// sheet above the phone keyboard, and the light backdrop keeps the top of the
// board visible while typing. Quick phrases are sent as chat lines, so they
// land in the history too.
export default function ChatSheet({ chatLog, myUid, onSendText, textCooldown, chatLock, onClose }) {
  const [text, setText] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const ok = await onSendText(text)
    if (ok) setText('')
  }
  return (
    <BottomSheet glass
      onClose={onClose}
      ariaLabel="Chat"
      keyboardSafe
      backdropClassName="bg-black/30"
      className="w-full sm:max-w-md h-[min(62vh,30rem)] bg-retro-card overflow-hidden flex flex-col"
    >
      <div className="shrink-0 flex items-center justify-between">
        <p className="font-pixel text-[10px] text-retro-text tracking-widest">CHAT</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="min-h-11 min-w-11 -mr-2 flex items-center justify-center font-pixel text-[10px] text-retro-dim hover:text-retro-text"
        >
          ✕
        </button>
      </div>
      <ChatLog chatLog={chatLog} myUid={myUid} className="min-h-0 flex-1" />
      {chatLock ? (
        <p className="shrink-0 mt-2 p-3 rounded border border-dashed border-retro-cta bg-retro-tint-cta font-pixel text-[8px] leading-relaxed tracking-wider text-retro-cta">
          {chatLock}
        </p>
      ) : (
        <>
          <div className="shrink-0 overflow-x-auto no-scrollbar mt-2">
            <div className="flex w-max gap-1.5">
              {QUICK_CHAT.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onSendText(t)}
                  disabled={textCooldown}
                  aria-label={`Send ${t}`}
                  className={CHIP_BTN_CLASS}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={submit} className="shrink-0 flex gap-2 w-full mt-2">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={CHAT_MAX_LENGTH}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Say something…"
              aria-label="Chat message"
              className="flex-1 min-w-0 min-h-11 bg-retro-bg border-2 border-retro-border text-retro-text
                font-mono text-sm placeholder-retro-dim rounded px-3 py-2
                focus:outline-none focus:border-retro-p1 transition-colors"
            />
            <button
              type="submit"
              disabled={!text.trim() || textCooldown}
              className={cn(
                'min-h-11 px-4 flex items-center justify-center bg-retro-p1 border-2 border-retro-p1 text-retro-bg',
                'font-pixel text-[10px] rounded transition-colors press',
                (!text.trim() || textCooldown) && 'opacity-50'
              )}
            >
              SEND
            </button>
          </form>
        </>
      )}
    </BottomSheet>
  )
}
