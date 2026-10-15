// Voice and video inside the party shell: the mic and camera buttons in the
// footer, speaking glow, mute badges and live faces on the tiles, and the
// sheets (first-use intro, 13+ age check, camera explainer, per-person and
// self options) that used to hang off the in-page voice strip. Renders
// PartyShell itself so the shell's tiles and footer get these props; with voice
// off it is just the shell. Opens muted on join (tap the mic to talk); the
// camera is off every session until the player turns it on.
import { useState } from 'react'
import { ref, set } from 'firebase/database'
import { toast } from 'sonner'
import PartyShell from '../PartyShell'
import BottomSheet from '../BottomSheet'
import TileVideo from './TileVideo'
import { useVoice } from './VoiceProvider'
import { VoiceIcon, VoiceNotice, IntroSheet, AgeSheet, PersonSheet } from './VoicePanel'
import { db } from '../../lib/firebase'
import useBusy from '../../hooks/useBusy'
import { getPlayerId } from '../../lib/playerId'
import { hostUidOf } from '../../lib/night'
import { isVoiceLive, voiceErrorText } from '../../lib/voiceLogic'
import { cn } from '@/lib/utils'

const BTN = 'shrink-0 w-11 h-11 flex items-center justify-center rounded border press transition-colors'

export default function VoiceShell({ gameId, ...shellProps }) {
  const voice = useVoice()
  const { game } = shellProps
  const [sheet, setSheet] = useState(null) // 'intro' | 'age' | 'cam' | 'self' | { person }
  const [joinChoice, setJoinChoice] = useState({ listenOnly: false })
  // The camera explainer shows once per visit; nothing about the camera is
  // remembered across sessions.
  const [camIntroSeen, setCamIntroSeen] = useState(false)
  const me = getPlayerId()
  const state = voice?.state
  const actions = voice?.actions
  const available = !!state?.available
  const live = !!state && isVoiceLive(state.status)

  const baseStatus = shellProps.statusFor
  const statusFor = state ? voiceStatus({ state, live, me, baseStatus }) : baseStatus

  if (!available) return <PartyShell {...shellProps} />

  const camerasOff = game?.camerasOff === true
  const startJoin = () => {
    if (!state.seenIntro) { setSheet('intro'); return }
    actions.join(joinChoice)
  }
  const joining = state.status === 'joining'

  const onCamera = () => {
    if (state.cam === 'on') { actions.stopCamera(); return }
    if (state.cam === 'starting' || camerasOff) return
    if (!camIntroSeen) { setSheet('cam'); return }
    actions.startCamera()
  }

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
      <button
        type="button"
        onClick={onCamera}
        disabled={state.cam === 'starting' || camerasOff}
        aria-pressed={state.cam === 'on'}
        aria-label={camerasOff ? 'Cameras are off in this party' : state.cam === 'on' ? 'Turn camera off' : 'Turn camera on'}
        data-testid="camera-toggle"
        className={cn(BTN, state.cam === 'on' ? 'border-retro-win bg-retro-win text-retro-bg' : 'border-retro-border bg-retro-card text-retro-dim', 'disabled:opacity-50')}
      >
        <VoiceIcon name={state.cam === 'on' ? 'camera' : 'cameraOff'} size={18} />
      </button>
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
    <span className="shrink-0 flex gap-1.5" data-testid="voice-panel" data-status={state.status} data-error={state.error || undefined} data-cam={state.cam}>{micInner}</span>
  )

  const onPerson = (tile) => {
    if (tile.uid === me) { setSheet('self'); return }
    setSheet({ person: { uid: tile.uid, name: tile.name, avatar: tile.avatar } })
  }

  const notice = (
    <>
      <VoiceNotice state={state} onAge={() => setSheet('age')} onClear={actions.clearError} />
      <CameraNotice state={state} onClear={actions.clearCamError} />
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
      {sheet === 'cam' && (
        <CameraSheet
          initialEveryone={state.camAll}
          onClose={() => setSheet(null)}
          onStart={(everyone) => { setCamIntroSeen(true); setSheet(null); actions.startCamera({ everyone }) }}
        />
      )}
      {sheet === 'self' && (
        <SelfSheet
          gameId={gameId}
          game={game}
          voice={voice}
          live={live}
          isHost={hostUidOf(game) === me}
          onClose={() => setSheet(null)}
        />
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
  for (const [uid, stream] of Object.entries(state.videos || {})) {
    out[uid] = { ...(out[uid] || {}), video: <TileVideo stream={stream} /> }
  }
  if (state.localVideo) out[me] = { ...(out[me] || {}), video: <TileVideo stream={state.localVideo} mirror /> }
  return mergeStatus(baseStatus, out)
}

// Fold the live voice status into whatever the shell already carries for a uid,
// keeping both.
function mergeStatus(base, voice) {
  const out = {}
  for (const uid of new Set([...Object.keys(base || {}), ...Object.keys(voice)])) out[uid] = { ...(base?.[uid] || {}), ...(voice[uid] || {}) }
  return out
}

/** Camera problems and the weak-signal pause, in words that keep the game going. */
function CameraNotice({ state, onClear }) {
  if (state.camError === 'cam-denied') {
    return (
      <div className="rounded border border-retro-danger/50 bg-retro-tint-danger p-3 space-y-2" role="status" data-testid="camera-blocked">
        <p className="font-pixel text-[9px] text-retro-danger">CAMERA IS BLOCKED</p>
        <p className="font-mono text-[11px] text-retro-text">Your face stays an avatar and everything else works. To show it, allow the camera for Game Night in your device settings, then tap the camera again.</p>
        <button type="button" onClick={onClear} className="min-h-11 w-full border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] rounded">OK</button>
      </div>
    )
  }
  if (state.camError) {
    const text = state.camError === 'cam-failed' ? 'THE CAMERA WOULDN’T START — TRY AGAIN' : voiceErrorText(state.camError)
    return (
      <div className="rounded border border-retro-border bg-retro-card p-3 flex items-center gap-3" role="status" data-testid="camera-error">
        <span className="flex-1 font-pixel text-[9px] text-retro-text">{text}</span>
        <button type="button" onClick={onClear} aria-label="Dismiss" className="min-h-11 min-w-11 text-retro-dim font-pixel text-[9px]">✕</button>
      </div>
    )
  }
  if (state.videoPaused === 'weak') {
    return (
      <p className="rounded border border-retro-border bg-retro-card p-2 text-center font-pixel text-[8px] text-retro-dim tracking-wider" role="status" data-testid="video-weak">
        WEAK SIGNAL · VIDEO PAUSED · VOICE IS STILL ON
      </p>
    )
  }
  return null
}

function CameraSheet({ initialEveryone, onClose, onStart }) {
  const [everyone, setEveryone] = useState(!!initialEveryone)
  return (
    <BottomSheet onClose={onClose} ariaLabel="Turn on your camera?" className="bg-retro-card space-y-3">
      <h2 className="font-pixel text-xs text-retro-cta">SHOW YOUR FACE?</h2>
      <p className="font-mono text-[12px] text-retro-text">Your camera goes to the people in this private party who are on your friends list. Everyone else sees your avatar. Nothing is recorded.</p>
      <ul className="space-y-1 font-mono text-[11px] text-retro-dim">
        <li>· Anyone can hide your video for themselves</li>
        <li>· The host can switch cameras off for the party</li>
        <li>· It turns off when you leave or switch apps</li>
      </ul>
      <label className="flex items-center gap-3 rounded border border-retro-border bg-retro-bg px-3 min-h-11">
        <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} data-testid="cam-everyone" className="accent-current text-retro-cta" />
        <span className="font-pixel text-[8px] tracking-wider text-retro-text">SHOW MY VIDEO TO EVERYONE, NOT JUST FRIENDS</span>
      </label>
      <button type="button" onClick={() => onStart(everyone)} data-testid="cam-start" className="w-full min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] tracking-wider rounded">TURN ON CAMERA</button>
      <button type="button" onClick={onClose} className="w-full min-h-11 font-pixel text-[8px] text-retro-dim">NOT NOW</button>
    </BottomSheet>
  )
}

function SelfSheet({ gameId, game, voice, live, isHost, onClose }) {
  const { state, actions } = voice
  const [busy, run] = useBusy()
  const camerasOff = game?.camerasOff === true
  const toggleRoomCameras = () => run(
    () => set(ref(db, `games/${gameId}/camerasOff`), !camerasOff),
    () => toast.error("COULDN'T CHANGE THAT — TRY AGAIN"),
  )
  const row = 'w-full min-h-11 border border-retro-border bg-retro-card text-retro-text font-pixel text-[9px] rounded px-2'
  return (
    <BottomSheet onClose={onClose} ariaLabel="Your voice and video" className="bg-retro-card space-y-3">
      <h2 className="font-pixel text-xs text-retro-cta">YOU</h2>
      {state.cam === 'on' && (
        <button type="button" onClick={() => actions.setCamAll(!state.camAll)} aria-pressed={state.camAll} data-testid="self-cam-all" className={row}>
          {state.camAll ? 'VIDEO SHOWN TO EVERYONE · TAP FOR FRIENDS ONLY' : 'VIDEO SHOWN TO FRIENDS · TAP TO SHOW EVERYONE'}
        </button>
      )}
      <button type="button" onClick={() => actions.setHideAllVideo(!state.hideAllVideo)} aria-pressed={state.hideAllVideo} data-testid="hide-all-video" className={row}>
        {state.hideAllVideo ? 'VIDEO HIDDEN FOR ME · TAP TO SHOW' : 'HIDE ALL VIDEO (SAVES DATA)'}
      </button>
      {isHost && (
        <button type="button" onClick={toggleRoomCameras} disabled={busy} aria-pressed={camerasOff} data-testid="host-cameras-off" className={cn(row, 'border-retro-cta text-retro-cta disabled:opacity-50')}>
          {busy ? 'SAVING…' : camerasOff ? 'CAMERAS ARE OFF · TAP TO ALLOW' : 'TURN CAMERAS OFF FOR EVERYONE'}
        </button>
      )}
      {live && (
        <button
          type="button"
          onClick={() => { onClose(); actions.leave() }}
          data-testid="voice-leave"
          className="w-full min-h-11 border border-retro-danger/60 bg-retro-tint-danger text-retro-danger font-pixel text-[9px] rounded"
        >
          LEAVE VOICE
        </button>
      )}
    </BottomSheet>
  )
}
