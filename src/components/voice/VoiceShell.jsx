// Voice inside the party shell: the mic button in the footer, speaking glow and
// mute badges on the tiles, and the sheets (first-use intro, 13+ age check,
// per-person options) that used to hang off the in-page voice strip. Renders
// PartyShell itself so the shell's tiles and footer get the voice props; with
// voice off it is just the shell. Opens muted on join: tap the mic to talk.
import { useState } from 'react'
import PartyShell from '../PartyShell'
import BottomSheet from '../BottomSheet'
import { useVoice } from './VoiceProvider'
import { VoiceIcon, VoiceNotice, IntroSheet, AgeSheet, PersonSheet } from './VoicePanel'
import { getPlayerId } from '../../lib/playerId'
import { hostUidOf } from '../../lib/night'
import { isVoiceLive } from '../../lib/voiceLogic'
import { cn } from '@/lib/utils'

const BTN = 'shrink-0 w-11 h-11 flex items-center justify-center rounded border press transition-colors'

export default function VoiceShell({ gameId, extraSelfSheet = null, ...shellProps }) {
  const voice = useVoice()
  const { game } = shellProps
  const [sheet, setSheet] = useState(null) // 'intro' | 'age' | { person } | 'self'
  const [joinChoice, setJoinChoice] = useState({ listenOnly: false })
  const me = getPlayerId()
  const state = voice?.state
  const actions = voice?.actions
  const available = !!state?.available
  const live = !!state && isVoiceLive(state.status)

  const baseStatus = shellProps.statusFor
  const statusFor = state ? voiceStatus({ state, live, me, baseStatus }) : baseStatus

  if (!available) return <PartyShell {...shellProps} />

  const startJoin = () => {
    if (!state.seenIntro) { setSheet('intro'); return }
    actions.join(joinChoice)
  }
  const joining = state.status === 'joining'

  const micInner = live ? (
    <>
      {!state.listenOnly ? (
        <button
          type="button"
          onClick={actions.toggleMute}
          aria-pressed={state.muted}
          aria-label={state.muted ? 'Unmute microphone' : 'Mute microphone'}
          data-testid="voice-mute"
          className={cn(BTN, state.muted ? 'border-retro-danger bg-retro-danger text-retro-bg' : 'border-retro-win bg-retro-win text-retro-bg')}
        >
          <VoiceIcon name={state.muted ? 'micOff' : 'mic'} size={18} />
        </button>
      ) : (
        <span aria-label="Listening only" data-testid="voice-listen-only" className={cn(BTN, 'border-retro-border bg-retro-card text-retro-dim')}>
          <VoiceIcon name="speaker" size={18} />
        </span>
      )}
    </>
  ) : (
    <button
      type="button"
      onClick={startJoin}
      disabled={joining}
      aria-label="Join voice"
      data-testid="voice-join"
      className={cn(BTN, 'border-retro-cta bg-retro-card text-retro-cta disabled:opacity-50')}
    >
      {joining ? <span className="font-pixel text-[8px]">…</span> : <VoiceIcon name="mic" size={18} />}
    </button>
  )

  const mic = (
    <span className="shrink-0 flex" data-testid="voice-panel" data-status={state.status} data-error={state.error || undefined}>{micInner}</span>
  )

  const onPerson = (tile) => {
    if (tile.uid === me) { if (live || extraSelfSheet) setSheet('self'); return }
    setSheet({ person: { uid: tile.uid, name: tile.name, avatar: tile.avatar } })
  }

  const notice = (
    <>
      <VoiceNotice state={state} onAge={() => setSheet('age')} onClear={actions.clearError} />
      {state.notice === 'resumed' && !state.error && (
        <div className="rounded border border-retro-border bg-retro-card p-3 flex items-center gap-3" role="status" data-testid="voice-resumed">
          <span className="flex-1 font-pixel text-[9px] text-retro-text">VOICE PAUSED WHILE YOU WERE AWAY — YOU’RE BACK IN</span>
          <button type="button" onClick={actions.clearNotice} aria-label="Dismiss" className="min-h-11 min-w-11 text-retro-dim font-pixel text-[9px]">✕</button>
        </div>
      )}
      {live && state.directory?.[me]?.hostMuted && state.muted && (
        <p className="rounded border border-retro-border bg-retro-card p-2 text-center font-pixel text-[8px] text-retro-dim tracking-wider">HOST MUTED YOU · TAP THE MIC TO UNMUTE</p>
      )}
    </>
  )

  return (
    <>
      <PartyShell {...shellProps} statusFor={statusFor} onPerson={onPerson} trailing={mic} notice={notice} />
      {sheet === 'intro' && <IntroSheet onClose={() => setSheet(null)} onJoin={(listenOnly) => { setSheet(null); setJoinChoice({ listenOnly }); actions.join({ listenOnly }) }} />}
      {sheet === 'age' && <AgeSheet onClose={() => setSheet(null)} onSaved={() => { setSheet(null); actions.clearError(); actions.join(joinChoice) }} />}
      {sheet?.person && (
        <PersonSheet person={sheet.person} gameId={gameId} voice={voice} isHost={hostUidOf(game) === me} onClose={() => setSheet(null)} />
      )}
      {sheet === 'self' && (
        <BottomSheet onClose={() => setSheet(null)} ariaLabel="Your voice" className="bg-retro-card space-y-3">
          <h2 className="font-pixel text-xs text-retro-cta">YOU</h2>
          {extraSelfSheet}
          {live && (
            <button
              type="button"
              onClick={() => { setSheet(null); actions.leave() }}
              data-testid="voice-leave"
              className="w-full min-h-11 border border-retro-danger/60 bg-retro-tint-danger text-retro-danger font-pixel text-[9px] rounded"
            >
              LEAVE VOICE
            </button>
          )}
        </BottomSheet>
      )}
    </>
  )
}

function voiceStatus({ state, live, me, baseStatus }) {
  const out = {}
  for (const [uid, d] of Object.entries(state.directory || {})) {
    out[uid] = { inVoice: !!d?.on, muted: !!d?.muted, speaking: !!state.speaking?.[uid] }
  }
  if (live) out[me] = { inVoice: true, muted: state.muted, speaking: !!state.speaking?.[me] }
  return mergeStatus(baseStatus, out)
}

// Fold the live voice status into whatever the shell already carries for a uid
// (for example a video element), keeping both.
function mergeStatus(base, voice) {
  const out = {}
  for (const uid of new Set([...Object.keys(base || {}), ...Object.keys(voice)])) out[uid] = { ...(base?.[uid] || {}), ...(voice[uid] || {}) }
  return out
}
