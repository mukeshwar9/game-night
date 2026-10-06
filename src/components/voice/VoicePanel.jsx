import { useState } from 'react'
import { toast } from 'sonner'
import Avatar from '../Avatar'
import BottomSheet from '../BottomSheet'
import useBusy from '../../hooks/useBusy'
import { useVoice } from './VoiceProvider'
import { getPlayerId } from '../../lib/playerId'
import { birthYearOptions } from '../../lib/premium'
import { saveBirthYear } from '../../lib/entitlements'
import { blockPlayer } from '../../lib/mute'
import { submitReport } from '../../lib/feedback'
import { useAuth } from '../../lib/AuthContext'
import { hostUidOf } from '../../lib/night'
import { voiceMembers, voiceErrorText } from '../../lib/voiceLogic'
import { cn } from '@/lib/utils'

// Party voice controls (screens 16, 18–22): the lobby card and the in-game
// strip, the first-use sheet, the 13+ age check, the mic-blocked fallback, and
// the per-person sheet (volume, mute for me, host mute, block, report).
// Renders nothing when voice is off or this room has no voice.

const MIC = <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
const MIC_OFF = <path d="M2 2l20 20M18.9 13.2A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M12 19v3" />
const SPEAKER = <path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
const HANGUP = <path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-3.3-2.7m-2.7-3.3a19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.4 2.1L8.1 9.9M23 1L1 23" />

function Icon({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const REASONS = [
  'Said something hateful or abusive in voice',
  'Sexual or adult talk',
  'Seems to be under 13',
  'Rude name, chat or drawing',
  'Something else',
]

export default function VoicePanel({ game, gameId, compact = false }) {
  const voice = useVoice()
  const [sheet, setSheet] = useState(null) // 'intro' | 'age' | { person }
  // The intro choice (mic or listen only) carries through the age check.
  const [joinChoice, setJoinChoice] = useState({ listenOnly: false })
  if (!voice?.state.available) return null
  const { state, actions } = voice
  const me = getPlayerId()
  const members = voiceMembers(game)
  const inVoice = members.filter(m => state.directory?.[m.uid]?.on || (m.uid === me && isLive(state.status)))
  const live = isLive(state.status)
  const hostUid = hostUidOf(game)

  const startJoin = () => {
    if (!state.seenIntro) { setSheet('intro'); return }
    actions.join(joinChoice)
  }

  return (
    <div className="w-full space-y-2" data-testid="voice-panel" data-status={state.status} data-error={state.error || undefined}>
      {live ? (
        <div className={cn('flex items-center gap-2 rounded border border-retro-win/60 bg-retro-tint-p1', compact ? 'px-2.5 py-1.5' : 'p-3')}>
          <span className="text-retro-win shrink-0"><Icon>{SPEAKER}</Icon></span>
          <span className="flex-1 min-w-0">
            <span className="block font-pixel text-[8px] text-retro-win tracking-wider">VOICE · {inVoice.length}</span>
            {!compact && <span className="block font-mono text-[10px] text-retro-dim">{statusLine(state)}</span>}
          </span>
          <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {inVoice.map(m => (
              <button
                key={m.uid}
                type="button"
                onClick={() => (m.uid === me ? null : setSheet({ person: m }))}
                aria-label={m.uid === me ? 'You' : `Voice options for ${m.name}`}
                className={cn('relative rounded-md shrink-0', state.speaking[m.uid] && 'ring-2 ring-retro-win ring-offset-1 ring-offset-retro-card')}
              >
                <Avatar id={m.avatar} size={24} />
                {state.directory?.[m.uid]?.muted && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-retro-danger text-retro-bg flex items-center justify-center"><Icon size={9}>{MIC_OFF}</Icon></span>
                )}
              </button>
            ))}
          </span>
          {!state.listenOnly && (
            <button
              type="button"
              onClick={actions.toggleMute}
              aria-pressed={state.muted}
              aria-label={state.muted ? 'Unmute microphone' : 'Mute microphone'}
              data-testid="voice-mute"
              className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', state.muted ? 'bg-retro-danger text-retro-bg' : 'bg-retro-win text-retro-bg')}
            >
              <Icon size={18}>{state.muted ? MIC_OFF : MIC}</Icon>
            </button>
          )}
          <button
            type="button"
            onClick={() => actions.leave()}
            aria-label="Leave voice"
            data-testid="voice-leave"
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-retro-danger/60 bg-retro-tint-danger text-retro-danger"
          >
            <Icon size={18}>{HANGUP}</Icon>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 border border-retro-border bg-retro-card rounded p-3">
          <span className="text-retro-win"><Icon size={18}>{SPEAKER}</Icon></span>
          <span className="flex-1 min-w-0">
            <span className="block font-pixel text-[9px] text-retro-text">VOICE</span>
            <span className="block font-mono text-[10px] text-retro-dim">
              {state.status === 'paused' ? 'paused while you were away'
                : inVoice.length ? `${inVoice.length} in voice` : 'talk while you play · off until you join'}
            </span>
          </span>
          <button
            type="button"
            onClick={startJoin}
            disabled={state.status === 'joining'}
            data-testid="voice-join"
            className="min-h-11 px-3 border-2 border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider rounded transition-all active:scale-95 disabled:opacity-50"
          >
            {state.status === 'joining' ? 'JOINING…' : 'JOIN VOICE'}
          </button>
        </div>
      )}

      {live && state.directory?.[me]?.hostMuted && state.muted && (
        <p className="text-center font-pixel text-[8px] text-retro-dim tracking-wider">HOST MUTED YOU · TAP THE MIC TO UNMUTE</p>
      )}

      <VoiceNotice state={state} onAge={() => setSheet('age')} onClear={actions.clearError} />
      {state.notice === 'resumed' && !state.error && (
        <div className="rounded border border-retro-border bg-retro-card p-3 flex items-center gap-3" role="status" data-testid="voice-resumed">
          <span className="flex-1 font-pixel text-[9px] text-retro-text">VOICE PAUSED WHILE YOU WERE AWAY — YOU’RE BACK IN</span>
          <button type="button" onClick={actions.clearNotice} aria-label="Dismiss" className="min-h-11 min-w-11 text-retro-dim font-pixel text-[9px]">✕</button>
        </div>
      )}

      {sheet === 'intro' && <IntroSheet onClose={() => setSheet(null)} onJoin={(listenOnly) => { setSheet(null); setJoinChoice({ listenOnly }); actions.join({ listenOnly }) }} />}
      {sheet === 'age' && <AgeSheet onClose={() => setSheet(null)} onSaved={() => { setSheet(null); actions.clearError(); actions.join(joinChoice) }} />}
      {sheet?.person && (
        <PersonSheet
          person={sheet.person}
          gameId={gameId}
          voice={voice}
          isHost={hostUid === me}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

function isLive(status) {
  return status === 'connecting' || status === 'connected' || status === 'reconnecting' || status === 'failed'
}

function statusLine(state) {
  if (state.status === 'reconnecting') return 'reconnecting… the game keeps going'
  if (state.status === 'failed') return 'voice dropped · check your connection'
  if (state.status === 'connecting') return 'connecting…'
  if (state.listenOnly) return 'listening only'
  return 'all connected'
}

function VoiceNotice({ state, onAge, onClear }) {
  const code = state.error
  if (!code) return null
  if (code === 'mic-denied') {
    return (
      <div className="rounded border border-retro-danger/50 bg-retro-tint-danger p-3 space-y-2" role="status" data-testid="voice-mic-blocked">
        <p className="font-pixel text-[9px] text-retro-danger">MIC IS BLOCKED</p>
        <p className="font-mono text-[11px] text-retro-text">You can still hear everyone. To talk, allow the microphone for Game Night in your settings.</p>
        <button type="button" onClick={onClear} className="min-h-11 w-full border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] rounded">OK</button>
      </div>
    )
  }
  if (code === 'age-required') {
    return (
      <div className="rounded border border-retro-cta/50 bg-retro-tint-cta p-3 flex items-center gap-3" role="status" data-testid="voice-age">
        <span className="flex-1 font-pixel text-[9px] text-retro-cta">VOICE NEEDS AN AGE CHECK</span>
        <button type="button" onClick={onAge} className="min-h-11 px-3 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded">CHECK</button>
      </div>
    )
  }
  return (
    <div className="rounded border border-retro-border bg-retro-card p-3 flex items-center gap-3" role="status" data-testid="voice-error">
      <span className="flex-1 font-pixel text-[9px] text-retro-text">{voiceErrorText(code)}</span>
      <button type="button" onClick={onClear} aria-label="Dismiss" className="min-h-11 min-w-11 text-retro-dim font-pixel text-[9px]">✕</button>
    </div>
  )
}

function IntroSheet({ onClose, onJoin }) {
  return (
    <BottomSheet onClose={onClose} ariaLabel="Join voice?" className="bg-retro-card space-y-3">
      <h2 className="font-pixel text-xs text-retro-cta">JOIN VOICE?</h2>
      <p className="font-mono text-[12px] text-retro-text">Live audio with the people in this party only. Nothing is recorded.</p>
      <ul className="space-y-1 font-mono text-[11px] text-retro-dim">
        <li>· Tap anyone to mute, block or report them</li>
        <li>· Music stops while you’re in voice</li>
        <li>· Voice pauses if you leave the app</li>
      </ul>
      <button type="button" onClick={() => onJoin(false)} className="w-full min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] tracking-wider rounded">JOIN WITH MIC</button>
      <button type="button" onClick={() => onJoin(true)} className="w-full min-h-11 border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] tracking-wider rounded">LISTEN ONLY</button>
      <button type="button" onClick={onClose} className="w-full min-h-11 font-pixel text-[8px] text-retro-dim">NOT NOW</button>
    </BottomSheet>
  )
}

function AgeSheet({ onClose, onSaved }) {
  const [year, setYear] = useState('')
  const [busy, run] = useBusy()
  const save = () => run(async () => {
    await saveBirthYear(Number(year))
    onSaved()
  }, () => toast.error("COULDN'T SAVE THAT — TRY AGAIN"))
  return (
    <BottomSheet onClose={onClose} ariaLabel="Age check" className="bg-retro-card space-y-3">
      <h2 className="font-pixel text-xs text-retro-cta">AGE CHECK</h2>
      <label htmlFor="voice-birth-year" className="block font-mono text-[11px] text-retro-text">Voice is for 13 and over. What year were you born?</label>
      <select
        id="voice-birth-year"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className="w-full min-h-11 rounded border border-retro-border bg-retro-surface text-retro-text font-mono text-sm px-2"
      >
        <option value="">Choose a year</option>
        {birthYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <button type="button" onClick={save} disabled={!year || busy} className="w-full min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded disabled:opacity-50">
        {busy ? 'SAVING…' : 'CONTINUE'}
      </button>
    </BottomSheet>
  )
}

function PersonSheet({ person, gameId, voice, isHost, onClose }) {
  const { state, actions } = voice
  const { profile } = useAuth()
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState(REASONS[0])
  const [blockBusy, runBlock] = useBusy()
  const [reportBusy, runReport] = useBusy()
  const [muteAllBusy, runMuteAll] = useBusy()
  const volume = state.volumes[person.uid] ?? 1
  const localMuted = !!state.localMutes[person.uid]

  const block = () => runBlock(async () => {
    await blockPlayer(person.uid, person.name)
    toast.success(`BLOCKED ${String(person.name).toUpperCase()}`)
    onClose()
  }, () => toast.error("COULDN'T BLOCK — TRY AGAIN"))

  const report = () => runReport(async () => {
    const res = await submitReport({ context: 'voice', gameId, targetUid: person.uid, targetName: person.name, text: reason, profile })
    if (res.reason === 'cooldown') { toast.error(`WAIT ${Math.ceil(res.retryInMs / 1000)}S BEFORE SENDING ANOTHER REPORT.`); return }
    if (!res.ok) throw new Error('invalid')
    toast.success('REPORTED — THANKS. WE REVIEW REPORTS WITHIN 24 HOURS.')
    onClose()
  }, () => toast.error("COULDN'T SEND THAT REPORT — TRY AGAIN."))

  return (
    <BottomSheet onClose={onClose} ariaLabel={`Voice options for ${person.name}`} className="bg-retro-card space-y-3">
      <div className="flex items-center gap-3">
        <Avatar id={person.avatar} size={48} />
        <span className="flex-1 min-w-0">
          <span className="block font-mono text-sm text-retro-text truncate">{person.name}</span>
          <span className="block font-pixel text-[8px] text-retro-win">{state.speaking[person.uid] ? 'SPEAKING' : 'IN VOICE'}</span>
        </span>
      </div>
      {!reporting ? (
        <>
          <label htmlFor="voice-volume" className="block font-pixel text-[8px] tracking-wider text-retro-dim">THEIR VOLUME (ONLY FOR YOU)</label>
          <input
            id="voice-volume"
            type="range" min="0" max="1" step="0.05"
            value={volume}
            onChange={(e) => actions.setVolume(person.uid, Number(e.target.value))}
            className="w-full accent-current text-retro-win"
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => actions.toggleLocalMute(person.uid)} aria-pressed={localMuted} className="min-h-11 border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] rounded">
              {localMuted ? 'UNMUTE' : 'MUTE'}
            </button>
            {isHost ? (
              <button
                type="button"
                onClick={() => runMuteAll(() => actions.hostMute(person.uid), () => toast.error("COULDN'T MUTE — TRY AGAIN"))}
                disabled={muteAllBusy}
                className="min-h-11 border-2 border-retro-cta text-retro-cta font-pixel text-[9px] rounded disabled:opacity-50"
              >
                {muteAllBusy ? 'MUTING…' : 'MUTE ALL'}
              </button>
            ) : <span />}
          </div>
          {isHost && <p className="font-mono text-[10px] text-retro-dim">MUTE ALL asks them to stay quiet until they unmute themselves. REMOVE and BLOCK are enforced.</p>}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-retro-border/60">
            <button type="button" onClick={block} disabled={blockBusy} className="min-h-11 border border-retro-danger/60 bg-retro-tint-danger text-retro-danger font-pixel text-[9px] rounded disabled:opacity-50">
              {blockBusy ? 'BLOCKING…' : 'BLOCK'}
            </button>
            <button type="button" onClick={() => setReporting(true)} className="min-h-11 border border-retro-danger/60 bg-retro-tint-danger text-retro-danger font-pixel text-[9px] rounded">
              REPORT
            </button>
          </div>
          <p className="font-mono text-[10px] text-retro-dim">Blocking means you never hear each other again, here or in future parties.</p>
        </>
      ) : (
        <fieldset className="space-y-2">
          <legend className="font-mono text-[11px] text-retro-dim mb-1">What happened?</legend>
          {REASONS.map(r => (
            <label key={r} className={cn('flex items-center gap-3 rounded border px-3 min-h-11', reason === r ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border bg-retro-bg')}>
              <input type="radio" name="voice-report" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-current text-retro-cta" />
              <span className="font-mono text-[12px] text-retro-text">{r}</span>
            </label>
          ))}
          <button type="button" onClick={report} disabled={reportBusy} className="w-full min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded disabled:opacity-50">
            {reportBusy ? 'SENDING…' : 'SEND REPORT'}
          </button>
        </fieldset>
      )}
    </BottomSheet>
  )
}
