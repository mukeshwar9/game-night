/* eslint-disable react-refresh/only-export-components -- provider, hook, and shell share one context seam. */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import BottomSheet from './BottomSheet'
import SwitchRow from './SwitchRow'
import {
  DEFAULT_VIDEO_CALL_LAYOUT,
  VIDEO_CALL_CORNERS,
  VIDEO_CALL_SIZES,
  getVideoCallReserve,
  hasInsufficientVideoCallSpace,
  readVideoCallLayout,
  writeVideoCallLayout,
} from '../lib/videoCallLayout'

const VideoCallContext = createContext(null)

export function VideoCallLayoutProvider({ children }) {
  const [layout, setLayout] = useState(readVideoCallLayout)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const updateLayout = (patch) => setLayout(current => writeVideoCallLayout({ ...current, ...patch }))
  const reserve = useMemo(() => getVideoCallReserve(layout, viewport), [layout, viewport])
  const cramped = hasInsufficientVideoCallSpace(layout, viewport)
  const value = useMemo(() => ({ layout, updateLayout, reserve, cramped }), [layout, reserve, cramped])
  return <VideoCallContext.Provider value={value}>{children}</VideoCallContext.Provider>
}

export function useVideoCallLayout() {
  return useContext(VideoCallContext) || {
    layout: DEFAULT_VIDEO_CALL_LAYOUT,
    updateLayout: () => {},
    reserve: { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
    cramped: false,
  }
}

export function VideoCallShell({ children, className = '' }) {
  return <div className={`video-call-shell ${className}`}>{children}</div>
}

export function VideoCallReactionDock({ children }) {
  const { layout, reserve } = useVideoCallLayout()
  if (!layout.enabled) return children
  return <div
    className="video-call-reaction-dock"
    style={{ '--video-call-preview-width': `${reserve.width}px`, '--video-call-preview-height': `${reserve.height}px` }}
  >
    <div className={`video-call-reactions video-call-reactions-${layout.corner.endsWith('right') ? 'right' : 'left'}`}>{children}</div>
    {layout.showOutline && (
      <div
        className={`video-call-preview video-call-preview-${layout.corner.endsWith('right') ? 'right' : 'left'}`}
        aria-label="Reserved 9 by 16 video call space"
      >
        MOVE VIDEO WINDOW HERE
      </div>
    )}
  </div>
}

function CornerButton({ corner, selected, onClick }) {
  return <button
    type="button"
    onClick={() => onClick(corner)}
    aria-label={`Use ${corner.replace('-', ' ')} corner`}
    aria-pressed={selected}
    className={`video-call-corner video-call-corner-${corner} ${selected ? 'video-call-corner-selected' : ''}`}
  ><span /></button>
}

function LayoutPreview({ corner, size }) {
  return <div className="video-call-layout-preview" aria-label={`Preview: reactions with video window in the ${corner.replace('-', ' ')} corner`}>
    <span className="video-call-layout-preview-reactions">REACTIONS</span>
    <span className={`video-call-layout-preview-video video-call-layout-preview-video-${corner} video-call-layout-preview-video-${size}`} />
  </div>
}

export function VideoCallSettingsPanel({ onClose, embedded = false }) {
  const { layout, updateLayout, cramped } = useVideoCallLayout()
  return <div className={embedded ? 'space-y-4' : undefined}>
    {!embedded && <div className="flex items-center justify-between">
      <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">VIDEO CALL LAYOUT</p>
      <button type="button" onClick={onClose} className="font-pixel text-[10px] text-retro-dim p-2 -m-2">CLOSE</button>
    </div>}
    <div className={embedded ? 'space-y-4' : 'space-y-4 pt-4'}>
      {embedded && <p className="font-mono text-[11px] text-retro-dim leading-relaxed">Keep part of the screen clear for a floating call window.</p>}
      <SwitchRow label="PLAYING ON A VIDEO CALL" checked={layout.enabled} onChange={enabled => updateLayout({ enabled })} />
      {/* The alignment/size controls only matter once the layout is on. */}
      {layout.enabled && <>
      <SwitchRow label="SHOW LAYOUT OUTLINE" checked={layout.showOutline} onChange={showOutline => updateLayout({ showOutline })} ariaLabel="Show video call layout outline" />
      <div className="flex items-center justify-between gap-4">
        <div><p className="font-pixel text-[9px] text-retro-text tracking-widest">WINDOW ALIGNMENT</p><p className="font-mono text-[10px] text-retro-dim mt-1">Align the portrait call space beside reactions.</p></div>
        <div className="video-call-corner-picker" aria-label="Video window corner">
          {VIDEO_CALL_CORNERS.map(corner => <CornerButton key={corner} corner={corner} selected={layout.corner === corner} onClick={value => updateLayout({ corner: value })} />)}
        </div>
      </div>
      <div>
        <p className="font-pixel text-[9px] text-retro-text tracking-widest mb-2">PREVIEW</p>
        <LayoutPreview corner={layout.corner} size={layout.size} />
      </div>
      <div>
        <p className="font-pixel text-[9px] text-retro-text tracking-widest mb-2">RESERVED SPACE</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(VIDEO_CALL_SIZES).map(([size, config]) => <button key={size} type="button" onClick={() => updateLayout({ size })} className={`border px-2 py-2 rounded font-pixel text-[9px] ${layout.size === size ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim'}`}>{config.label}</button>)}
        </div>
      </div>
      {cramped && <p className="border border-retro-danger/60 bg-retro-tint-danger text-retro-danger p-2 font-mono text-[10px] leading-relaxed">SPACE IS TIGHT. CHOOSE A SMALLER WINDOW OR ANOTHER CORNER.</p>}
      <p className="font-mono text-[10px] text-retro-dim leading-relaxed">Move WhatsApp or another floating call window to match the preview. Game cannot move or detect that window.</p>
      </>}
    </div>
  </div>
}

export default function VideoCallSettingsButton() {
  const { layout } = useVideoCallLayout()
  const [open, setOpen] = useState(false)
  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="Video-call layout"
      aria-label="Video-call layout"
      className={`text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded ${layout.enabled ? 'text-retro-p1' : ''}`}
    >▣</button>
    {open && <BottomSheet onClose={() => setOpen(false)} ariaLabel="Video-call layout settings">
      <VideoCallSettingsPanel onClose={() => setOpen(false)} />
    </BottomSheet>}
  </>
}
