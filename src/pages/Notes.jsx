import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../lib/AuthContext'
import {
  FEEDBACK_STATUSES,
  submitFeedback,
  subscribeFeedback,
  updateFeedbackStatus,
} from '../lib/feedback'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

const TYPE_OPTIONS = [
  { id: 'bug', label: 'BUG' },
  { id: 'feature', label: 'FEATURE' },
]

const STATUS_LABELS = {
  open: 'OPEN',
  planned: 'PLANNED',
  done: 'DONE',
  closed: 'CLOSED',
}

export default function Notes() {
  const { profile } = useAuth()
  const isAdmin = profile?.admin === true
  const [type, setType] = useState('bug')
  const [message, setMessage] = useState('')
  const [items, setItems] = useState(null)
  const [saving, runSave] = useBusy()
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    return subscribeFeedback(setItems)
  }, [isAdmin])

  const canSubmit = message.trim().length >= 10 && !saving
  const visibleItems = isAdmin ? items : []

  const handleSubmit = () => {
    if (!canSubmit) return
    runSave(async () => {
      const res = await submitFeedback({
        type,
        message,
        page: window.location.href,
        profile,
      })
      if (!res.ok) throw new Error('invalid')
      setMessage('')
      setType('bug')
      toast.success('NOTE SENT!')
    }, () => toast.error("COULDN'T SEND THAT NOTE — TRY AGAIN."))
  }

  const setStatus = async (id, status) => {
    setUpdatingId(id)
    try {
      await updateFeedbackStatus(id, status)
      toast.success('STATUS UPDATED!')
    } catch {
      toast.error("COULDN'T UPDATE STATUS.")
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-retro-bg">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm md:max-w-3xl mx-auto space-y-6 pt-2">
          <h1 className="font-pixel text-base text-retro-cta text-glow-cta">NOTES</h1>

          <section className="bg-retro-card border border-retro-border rounded p-4 space-y-4">
            <div className="flex gap-2">
              {TYPE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setType(option.id)}
                  className={cn(
                    'flex-1 min-h-10 rounded border font-pixel text-[9px] transition-all active:scale-95',
                    type === option.id
                      ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                      : 'border-retro-border bg-retro-bg text-retro-dim hover:text-retro-text hover:border-retro-p1',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="block space-y-2">
              <span className="font-pixel text-[10px] text-retro-dim tracking-wider">DETAILS</span>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={1000}
                rows={7}
                placeholder="what happened, or what should exist?"
                className="w-full resize-none bg-retro-bg border border-retro-border rounded px-3 py-2 font-mono text-sm
                  text-retro-text placeholder:text-retro-dim focus:outline-none focus:border-retro-p1"
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-retro-dim">{message.trim().length}/1000</p>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="min-h-11 px-5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
                  hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'SENDING…' : 'SEND'}
              </button>
            </div>
          </section>

          {isAdmin && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-pixel text-[10px] text-retro-dim tracking-wider">ADMIN VIEW</h2>
                <span className="font-mono text-[10px] text-retro-dim">{visibleItems?.length || 0} NOTES</span>
              </div>

              {visibleItems === null ? (
                <EmptyState>ADMIN ACCESS REQUIRED</EmptyState>
              ) : visibleItems.length === 0 ? (
                <EmptyState>NO NOTES YET</EmptyState>
              ) : (
                <div className="space-y-3">
                  {visibleItems.map(item => (
                    <FeedbackCard
                      key={item.id}
                      item={item}
                      updating={updatingId === item.id}
                      onStatus={setStatus}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function FeedbackCard({ item, updating, onStatus }) {
  return (
    <article className="bg-retro-card border border-retro-border rounded p-3 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar id={item.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'font-pixel text-[8px]',
              item.type === 'feature' ? 'text-retro-p1' : 'text-retro-p2',
            )}>
              {item.type === 'feature' ? 'FEATURE' : 'BUG'}
            </span>
            <span className="font-pixel text-[8px] text-retro-dim">{STATUS_LABELS[item.status] || 'OPEN'}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-retro-dim truncate">
            {item.name || 'Player'} · {formatDate(item.createdAt)}
          </p>
        </div>
      </div>

      <p className="font-mono text-sm leading-relaxed text-retro-text whitespace-pre-wrap break-words">{item.message}</p>

      {item.page && (
        <p className="font-mono text-[10px] text-retro-dim break-all">{item.page}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {FEEDBACK_STATUSES.map(status => (
          <button
            key={status}
            type="button"
            onClick={() => onStatus(item.id, status)}
            disabled={updating || item.status === status}
            className={cn(
              'min-h-9 px-3 rounded border font-pixel text-[8px] transition-all active:scale-95 disabled:cursor-not-allowed',
              item.status === status
                ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
                : 'border-retro-border bg-retro-bg text-retro-dim hover:text-retro-text hover:border-retro-p1 disabled:opacity-40',
            )}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </article>
  )
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).toUpperCase()
}
