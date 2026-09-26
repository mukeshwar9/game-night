import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../lib/AuthContext'
import {
  FEEDBACK_STATUSES,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_MAX_LENGTH,
  clearFeedbackDraft,
  countFeedback,
  readFeedbackDraft,
  submitFeedback,
  subscribeFeedback,
  updateFeedbackStatus,
} from '../lib/feedback'
import { fetchRecentErrors, summarizeErrors } from '../lib/telemetry'
import { fetchRecentPlays, summarizePlays } from '../lib/analytics'
import { getGameConfig } from '../lib/games'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

const TYPE_OPTIONS = [
  { id: 'bug', label: 'BUG' },
  { id: 'feature', label: 'FEATURE' },
]

const TYPE_LABELS = { bug: 'BUG', feature: 'FEATURE', report: 'REPORT' }

const STATUS_LABELS = {
  open: 'OPEN',
  planned: 'PLANNED',
  done: 'DONE',
  closed: 'CLOSED',
}

// How far back the admin error and play views look.
const ADMIN_DAYS = 3

const ADMIN_TABS = [
  { id: 'notes', label: 'NOTES' },
  { id: 'errors', label: 'ERRORS' },
  { id: 'plays', label: 'PLAYS' },
]

export default function Notes() {
  const { profile } = useAuth()
  const isAdmin = profile?.admin === true
  // A draft handed over by ErrorBoundary's REPORT THIS PROBLEM, if any.
  const [draft] = useState(readFeedbackDraft)
  const [type, setType] = useState(draft?.type || 'bug')
  const [message, setMessage] = useState(draft?.message || '')
  const [saving, runSave] = useBusy()

  useEffect(() => { clearFeedbackDraft() }, [])

  const canSubmit = message.trim().length >= FEEDBACK_MIN_LENGTH && !saving

  const handleSubmit = () => {
    if (!canSubmit) return
    runSave(async () => {
      const res = await submitFeedback({
        type,
        message,
        page: window.location.href,
        profile,
      })
      if (res.reason === 'cooldown') {
        toast.error(`WAIT ${Math.ceil(res.retryInMs / 1000)}S BEFORE SENDING ANOTHER NOTE.`)
        return
      }
      if (!res.ok) throw new Error('invalid')
      setMessage('')
      setType('bug')
      toast.success('NOTE SENT!')
    }, () => toast.error("COULDN'T SEND THAT NOTE — TRY AGAIN."))
  }

  return (
    <div className="min-h-screen bg-retro-bg">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm md:max-w-3xl mx-auto space-y-6 pt-2">
          <h1 className="font-pixel text-base text-retro-cta text-glow-cta">NOTES</h1>

          <section className="bg-retro-card border border-retro-border rounded p-4 space-y-4">
            {draft && (
              <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
                Sorry about that crash. The error is filled in below — add what you were doing and hit SEND.
              </p>
            )}
            <div className="flex gap-2">
              {TYPE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setType(option.id)}
                  aria-pressed={type === option.id}
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
                maxLength={FEEDBACK_MAX_LENGTH}
                rows={7}
                placeholder="what happened, or what should exist?"
                className="w-full resize-none bg-retro-bg border border-retro-border rounded px-3 py-2 font-mono text-sm
                  text-retro-text placeholder:text-retro-dim focus:outline-none focus:border-retro-p1"
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-retro-dim">{message.trim().length}/{FEEDBACK_MAX_LENGTH}</p>
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

          {isAdmin && <AdminView />}
        </div>
      </div>
    </div>
  )
}

// Admin-only (users/{uid}/admin === true; the database rules enforce the
// same on every read here): feedback + reports, recent errors, play counters.
function AdminView() {
  const [tab, setTab] = useState('notes')
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-pixel text-[10px] text-retro-dim tracking-wider">ADMIN VIEW</h2>
        <div className="flex gap-1" role="tablist" aria-label="Admin view">
          {ADMIN_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'min-h-9 px-3 rounded border font-pixel text-[8px] transition-all active:scale-95',
                tab === t.id
                  ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
                  : 'border-retro-border bg-retro-bg text-retro-dim hover:text-retro-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'notes' && <FeedbackAdmin />}
      {tab === 'errors' && <ErrorsAdmin />}
      {tab === 'plays' && <PlaysAdmin />}
    </section>
  )
}

const FILTERS = [
  { id: 'all', label: 'ALL' },
  { id: 'bug', label: 'BUGS' },
  { id: 'feature', label: 'FEATURES' },
  { id: 'report', label: 'REPORTS' },
]

function FeedbackAdmin() {
  const [items, setItems] = useState(undefined) // undefined = loading, null = denied
  const [filter, setFilter] = useState('all')
  const [updating, setUpdating] = useState(null) // { id, status } being saved

  useEffect(() => subscribeFeedback(setItems), [])

  const setStatus = async (id, status) => {
    if (updating) return
    setUpdating({ id, status })
    try {
      await updateFeedbackStatus(id, status)
      toast.success('STATUS UPDATED!')
    } catch {
      toast.error("COULDN'T UPDATE STATUS.")
    } finally {
      setUpdating(null)
    }
  }

  if (items === undefined) return <EmptyState>LOADING…</EmptyState>
  if (items === null) return <EmptyState>ADMIN ACCESS REQUIRED</EmptyState>

  const counts = countFeedback(items)
  const visible = filter === 'all' ? items : items.filter(i => i.type === filter)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'min-h-9 px-3 rounded border font-pixel text-[8px] transition-all active:scale-95',
              filter === f.id
                ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
                : 'border-retro-border bg-retro-bg text-retro-dim hover:text-retro-text',
            )}
          >
            {f.label} {counts[f.id] ?? 0}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-retro-dim">{counts.open} OPEN</span>
      </div>

      {visible.length === 0 ? (
        <EmptyState>NOTHING HERE YET</EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map(item => (
            <FeedbackCard
              key={item.id}
              item={item}
              updatingStatus={updating?.id === item.id ? updating.status : null}
              onStatus={setStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Loads `load()` once on mount and on REFRESH. `data` is undefined while the
// first load runs and null when it failed (e.g. denied by the rules).
function useAdminFetch(load) {
  const [data, setData] = useState(undefined)
  const [refreshing, runRefresh] = useBusy()
  const refresh = () => runRefresh(async () => {
    setData(await load())
  }, () => {
    setData(prev => (prev === undefined ? null : prev))
    toast.error("COULDN'T LOAD — CHECK ACCESS OR CONNECTION.")
  })
  // Initial load only; `refresh` is recreated each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [])
  return { data, refreshing, refresh }
}

function RefreshBar({ label, refreshing, onRefresh }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="font-mono text-[10px] text-retro-dim">{label}</p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="min-h-9 px-3 rounded border border-retro-border bg-retro-bg font-pixel text-[8px] text-retro-dim
          hover:text-retro-text hover:border-retro-p1 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {refreshing ? 'REFRESHING…' : 'REFRESH'}
      </button>
    </div>
  )
}

function ErrorsAdmin() {
  const { data, refreshing, refresh } = useAdminFetch(() => fetchRecentErrors(ADMIN_DAYS))
  const summary = data ? summarizeErrors(data) : null

  return (
    <div className="space-y-3">
      <RefreshBar
        label={summary ? `${summary.total} ERRORS · LAST ${ADMIN_DAYS} DAYS (UTC)` : `LAST ${ADMIN_DAYS} DAYS (UTC)`}
        refreshing={refreshing}
        onRefresh={refresh}
      />
      {data === undefined ? (
        <EmptyState>LOADING…</EmptyState>
      ) : data === null ? (
        <EmptyState>COULDN&apos;T LOAD ERRORS</EmptyState>
      ) : summary.total === 0 ? (
        <EmptyState>NO ERRORS REPORTED</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {summary.byGame.map(g => (
              <span key={g.gameType} className="px-2 py-1 rounded border border-retro-border font-mono text-[10px] text-retro-text">
                {g.gameType === 'none' ? 'NO GAME' : gameLabel(g.gameType)} · <span className="text-retro-p2">{g.count}</span>
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {summary.byMessage.slice(0, 20).map(m => (
              <article key={m.msg} className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
                <div className="flex items-start gap-3">
                  <span className="font-pixel text-[10px] text-retro-p2 shrink-0">×{m.count}</span>
                  <p className="font-mono text-[11px] text-retro-text break-words min-w-0 flex-1">{m.msg}</p>
                </div>
                <p className="font-mono text-[10px] text-retro-dim break-all">
                  {[m.route, m.gameType && gameLabel(m.gameType), m.build && `build ${m.build}`, formatDate(m.lastAt)].filter(Boolean).join(' · ')}
                </p>
                {m.stack && (
                  <details>
                    <summary className="cursor-pointer font-pixel text-[8px] text-retro-dim hover:text-retro-text">STACK</summary>
                    <pre className="mt-1 overflow-auto font-mono text-[10px] leading-relaxed text-retro-dim whitespace-pre-wrap">{m.stack}</pre>
                  </details>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PlaysAdmin() {
  const { data, refreshing, refresh } = useAdminFetch(() => fetchRecentPlays(ADMIN_DAYS))
  const rows = data ? summarizePlays(data) : null

  return (
    <div className="space-y-3">
      <RefreshBar label={`LAST ${ADMIN_DAYS} DAYS (UTC) · ALL MODES`} refreshing={refreshing} onRefresh={refresh} />
      {data === undefined ? (
        <EmptyState>LOADING…</EmptyState>
      ) : data === null ? (
        <EmptyState>COULDN&apos;T LOAD PLAYS</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>NO PLAYS RECORDED</EmptyState>
      ) : (
        <div className="bg-retro-card border border-retro-border rounded overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="text-retro-dim font-pixel text-[8px] tracking-wider">
                <th scope="col" className="text-left p-2">GAME</th>
                <th scope="col" className="text-right p-2">STARTED</th>
                <th scope="col" className="text-right p-2">FINISHED</th>
                <th scope="col" className="text-right p-2">ABANDONED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.type} className="border-t border-retro-border">
                  <th scope="row" className="text-left p-2 font-normal text-retro-text">{gameLabel(r.type)}</th>
                  <td className="text-right p-2 text-retro-text">{r.started}</td>
                  <td className="text-right p-2 text-retro-win">{r.finished}</td>
                  <td className="text-right p-2 text-retro-p2">{r.abandoned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function gameLabel(type) {
  const cfg = getGameConfig(type)
  return cfg?.type === type ? cfg.label : type
}

function FeedbackCard({ item, updatingStatus, onStatus }) {
  const typeColor = item.type === 'feature' ? 'text-retro-p1' : item.type === 'report' ? 'text-retro-cta' : 'text-retro-p2'
  return (
    <article className="bg-retro-card border border-retro-border rounded p-3 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar id={item.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('font-pixel text-[8px]', typeColor)}>{TYPE_LABELS[item.type] || 'BUG'}</span>
            <span className="font-pixel text-[8px] text-retro-dim">{STATUS_LABELS[item.status] || 'OPEN'}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-retro-dim truncate">
            {item.name || 'Player'} · {formatDate(item.createdAt)}
          </p>
        </div>
      </div>

      <p className="font-mono text-sm leading-relaxed text-retro-text whitespace-pre-wrap break-words">{item.message}</p>

      {item.type === 'report' ? (
        <p className="font-mono text-[10px] text-retro-dim break-all">
          REPORTED: {item.targetName || 'Player'} ({item.targetUid}) · ROOM {item.gameId} · BY {item.by}
        </p>
      ) : item.page && (
        <p className="font-mono text-[10px] text-retro-dim break-all">{item.page}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {FEEDBACK_STATUSES.map(status => (
          <button
            key={status}
            type="button"
            onClick={() => onStatus(item.id, status)}
            disabled={!!updatingStatus || item.status === status}
            className={cn(
              'min-h-9 px-3 rounded border font-pixel text-[8px] transition-all active:scale-95 disabled:cursor-not-allowed',
              item.status === status
                ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
                : 'border-retro-border bg-retro-bg text-retro-dim hover:text-retro-text hover:border-retro-p1 disabled:opacity-40',
            )}
          >
            {updatingStatus === status ? 'SAVING…' : STATUS_LABELS[status]}
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
