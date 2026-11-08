// SKETCH sharing at the end of a match (S4): the gallery with SHARE on each
// drawing and SHARE ALL in its header, the viewer sheet (REPLAY, SHARE, name
// toggle) and the share-all sheet (PICTURES as 3 × 3 collage images, or one
// PDF). Every file is made on this phone and goes to the system share sheet,
// where WhatsApp is; where files can't be shared they download and SEND ON
// WHATSAPP opens wa.me with the caption (the player attaches the files).
// Nothing is uploaded and nothing is written to the room.
//
// The painting and PDF code (src/lib/sketchShareCard.js) is a lazy chunk,
// warmed when the gallery shows. The app never stacks sheets: one is open at
// a time.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import BottomSheet from './BottomSheet'
import { ReplayLayers, DrawingLayers } from './SketchDrawing'
import { Gallery } from './SketchStage'
import useBusy from '@/hooks/useBusy'
import useMotionPref from '../hooks/useMotionPref'
import { shareUrl, isNative } from '../lib/platform'
import { PALETTE } from '../lib/sketchPalette'
import { replayPlan } from '../lib/sketchReplayLogic'
import {
  PLAY_PATH, allCaption, drawingCaption, needsSecondTap, onThisPhone, picturesLine, whatsAppLink,
} from '../lib/sketchShareLogic'
import { cn } from '@/lib/utils'

const FAIL = 'COULDN\'T SHARE — TRY AGAIN'

const loadCard = () => import('../lib/sketchShareCard')
const playLink = () => shareUrl(PLAY_PATH)
const now = () => performance.now()

function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-left font-pixel text-[8px] leading-relaxed text-retro-text">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[rgb(var(--c-cta))]"
      />
      {label}
    </label>
  )
}

// After the files were downloaded instead of shared: the wa.me link.
function SavedFallback({ text, what }) {
  return (
    <div className="space-y-2 rounded border border-retro-border p-2 text-center" data-testid="sketch-share-saved">
      <p className="font-pixel text-[8px] text-retro-win">SAVED {what} — CHECK YOUR DOWNLOADS</p>
      <a
        href={whatsAppLink(text)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center justify-center rounded bg-retro-win px-4 font-pixel text-[9px] text-retro-bg transition press"
      >
        SEND ON WHATSAPP
      </a>
      <p className="font-pixel text-[8px] leading-relaxed text-retro-dim">ATTACH THE SAVED {what} IN WHATSAPP</p>
    </div>
  )
}

const CLOSE_CLS = 'min-h-11 w-full rounded border border-retro-border font-pixel text-[9px] text-retro-dim transition press'

function Viewer({ entry, hearts, showName, setShowName, onShare, shareLabel, sharing, saved, onClose }) {
  const { reduced } = useMotionPref()
  const [replayAt, setReplayAt] = useState(null)
  const plan = useMemo(() => replayPlan(entry.strokes, entry.fills), [entry])
  const name = String(entry.artistName || '???').toUpperCase()
  const label = `${entry.word}, drawn by ${entry.artistName}`
  return (
    <BottomSheet centered onClose={onClose} ariaLabel={`${entry.artistName}'s drawing`}>
      <div className="space-y-3 p-4 text-center" data-testid="sketch-viewer">
        <p className="font-pixel text-[10px] tracking-widest text-retro-dim">{name}&apos;S DRAWING</p>
        <svg
          viewBox="0 0 256 256"
          shapeRendering="crispEdges"
          role="img"
          aria-label={label}
          style={{ backgroundColor: PALETTE[1], width: '100%', aspectRatio: '1 / 1' }}
          className="mx-auto block max-w-[320px] rounded border-2 border-retro-border"
        >
          {replayAt != null
            ? <ReplayLayers key={replayAt} plan={plan} elapsed={() => now() - replayAt} onDone={() => setReplayAt(null)} />
            : <DrawingLayers strokes={entry.strokes} fills={entry.fills} />}
        </svg>
        <p className="font-pixel text-[11px] text-retro-text">
          {String(entry.word).toUpperCase()}
          {hearts > 0 && <span className="text-retro-p3"> · ♥ {hearts}</span>}
        </p>
        <div className={cn('grid gap-2', reduced ? 'grid-cols-1' : 'grid-cols-2')}>
          {/* Reduced motion: no time-lapse (motion-rules.md); the still picture stands. */}
          {!reduced && (
            <button
              type="button"
              onClick={() => setReplayAt(now())}
              disabled={replayAt != null}
              className="min-h-11 rounded border border-retro-border font-pixel text-[9px] text-retro-text transition press disabled:opacity-50"
            >
              ▶ REPLAY
            </button>
          )}
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            className="min-h-11 rounded bg-retro-cta font-pixel text-[9px] text-retro-bg transition press disabled:opacity-50"
          >
            {shareLabel}
          </button>
        </div>
        <Toggle checked={showName} onChange={setShowName} disabled={sharing} label={`PUT ${name}'S NAME ON THE IMAGE`} />
        {saved && <SavedFallback text={saved.text} what={saved.what} />}
        <button type="button" onClick={onClose} className={CLOSE_CLS}>CLOSE</button>
      </div>
    </BottomSheet>
  )
}

function ShareAllSheet({ count, format, setFormat, showNames, setShowNames, onShare, shareLabel, busy, saved, onClose }) {
  const option = (id, title, sub) => (
    <button
      type="button"
      onClick={() => setFormat(id)}
      aria-pressed={format === id}
      disabled={busy}
      className={cn(
        'w-full min-h-11 rounded border-2 px-3 py-2 text-left transition press-card disabled:opacity-60',
        format === id ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border',
      )}
    >
      <span className="block font-pixel text-[10px] text-retro-text">{title}</span>
      <span className="mt-1 block font-pixel text-[8px] leading-relaxed text-retro-dim">{sub}</span>
    </button>
  )
  return (
    <BottomSheet onClose={onClose} ariaLabel="Share all drawings">
      <div className="space-y-3 p-4" data-testid="sketch-share-all">
        <div className="text-center">
          <p className="font-pixel text-[10px] tracking-widest text-retro-text">SHARE ALL {count}</p>
          <p className="mt-1 font-pixel text-[8px] text-retro-dim">{onThisPhone(count)}</p>
        </div>
        {option('pictures', 'PICTURES', picturesLine(count))}
        {option('pdf', 'PDF', 'ONE PAGE PER DRAWING, FOR KEEPING OR PRINTING')}
        <Toggle checked={showNames} onChange={setShowNames} disabled={busy} label="PUT EVERYONE'S NAMES ON IT" />
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="min-h-11 w-full rounded bg-retro-cta font-pixel text-[10px] text-retro-bg transition press disabled:opacity-50"
        >
          {shareLabel}
        </button>
        {saved && <SavedFallback text={saved.text} what={saved.what} />}
        <button type="button" onClick={onClose} className={CLOSE_CLS}>CLOSE</button>
      </div>
    </BottomSheet>
  )
}

/**
 * The end-of-match gallery with sharing.
 * @param {{
 *   entries: any[],
 *   hearts?: Record<string, number>,
 *   podium?: { rank: number, name: string, score: number }[],
 *   favourite?: { hearts: number, items: { word?: string, name?: string }[] } | null,
 * }} props
 */
export default function SketchGalleryShare({ entries, hearts = {}, podium = [], favourite = null }) {
  const [sheet, setSheet] = useState(null)         // { kind: 'viewer', entry } | { kind: 'all' } | null
  const [showName, setShowName] = useState(true)   // viewer: the artist's name on the image
  const [showNames, setShowNames] = useState(true) // share all: everyone's names
  const [format, setFormat] = useState('pictures') // share all: 'pictures' | 'pdf'
  const [saved, setSaved] = useState(null)         // { text, what } after a download, for SEND ON WHATSAPP
  const [phase, setPhase] = useState(null)         // 'making' | 'sharing' while busy
  const [sharingId, setSharingId] = useState(null) // the gallery card being shared
  const [busy, runBusy] = useBusy()
  // Files made too slowly to open the share sheet in the same tap: kept until
  // the SHARE NOW tap, keyed by what they were made from.
  const [ready, setReady] = useState(null)         // { key, files, text, what }
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  // Warm the painter (and its QR library) so the first tap opens the sheet in time.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? (cb => setTimeout(cb, 300))
    idle(() => { loadCard().then(m => m.warm()).catch(() => {}) })
  }, [])

  const close = () => { setSheet(null); setSaved(null); setReady(null) }

  // Shares made files; a download fallback shows SEND ON WHATSAPP.
  const deliver = async ({ files, text, what }) => {
    setPhase('sharing')
    const card = await loadCard()
    const outcome = await card.shareSketchFiles({ files, text })
    if (outcome === 'failed') toast.error(FAIL)
    if (outcome === 'saved') {
      toast.success(`SAVED ${what} — CHECK YOUR DOWNLOADS`)
      if (mounted.current) setSaved({ text, what })
    }
    return outcome
  }

  // Makes the files, then shares them in the same tap — unless that took too
  // long for the browser to allow the sheet, then SHARE NOW asks for one more.
  // A sheet that closed without sharing (or that the browser refused, which
  // looks the same) keeps the files, so SHARE NOW reopens it at once.
  const makeAndShare = async (key, make, onSlow) => {
    let job = ready?.key === key ? ready : null
    setReady(null)
    if (!job) {
      setPhase('making')
      const started = now()
      job = { key, ...(await make()) }
      if (needsSecondTap(now() - started, { native: isNative })) {
        if (mounted.current) { setReady(job); onSlow?.() }
        return 'waiting'
      }
    }
    const outcome = await deliver(job)
    if (outcome === 'cancelled' && mounted.current) setReady(job)
    return outcome
  }

  const oneJob = (entry, nameOn) => async () => {
    const card = await loadCard()
    const link = playLink()
    const file = await card.sketchCardFile({ entry, showName: nameOn, hearts: hearts[entry.id] || 0, url: link })
    return {
      files: [file],
      text: drawingCaption({ word: entry.word, name: entry.artistName, showName: nameOn, link }),
      what: 'IMAGE',
    }
  }

  // A gallery card's SHARE: the name is on (the viewer can take it off).
  const shareCard = entry => runBusy(async () => {
    setSharingId(entry.id)
    setSaved(null)
    try {
      const openViewer = () => { setShowName(true); setSheet({ kind: 'viewer', entry }) }
      const outcome = await makeAndShare(`one:${entry.id}:true`, oneJob(entry, true), openViewer)
      // A download fallback continues in the viewer, where SEND ON WHATSAPP is.
      if (outcome === 'saved' && mounted.current) openViewer()
    } finally {
      setSharingId(null)
      setPhase(null)
    }
  }, () => toast.error(FAIL))

  const shareViewer = entry => runBusy(async () => {
    setSaved(null)
    try {
      await makeAndShare(`one:${entry.id}:${showName}`, oneJob(entry, showName))
    } finally {
      setPhase(null)
    }
  }, () => toast.error(FAIL))

  const shareAll = () => runBusy(async () => {
    setSaved(null)
    try {
      await makeAndShare(`all:${format}:${showNames}`, async () => {
        const card = await loadCard()
        const link = playLink()
        const date = new Date()
        if (format === 'pdf') {
          const file = await card.sketchPdfFile({ entries, showName: showNames, hearts, podium, favourite, url: link, date })
          return { files: [file], text: allCaption({ count: entries.length, link }), what: 'PDF' }
        }
        const files = await card.sketchCollageFiles({ entries, showName: showNames, hearts, url: link, date })
        return { files, text: allCaption({ count: entries.length, link }), what: files.length > 1 ? 'IMAGES' : 'IMAGE' }
      })
    } finally {
      setPhase(null)
    }
  }, () => toast.error(FAIL))

  const viewerEntry = sheet?.kind === 'viewer' ? sheet.entry : null
  const viewerReady = viewerEntry && ready?.key === `one:${viewerEntry.id}:${showName}`
  const allReady = ready?.key === `all:${format}:${showNames}`
  const making = format === 'pdf' ? 'MAKING PDF…' : 'MAKING IMAGES…'

  return (
    <>
      <Gallery
        entries={entries}
        hearts={hearts}
        onOpen={entry => { setSaved(null); setReady(null); setShowName(true); setSheet({ kind: 'viewer', entry }) }}
        onShare={shareCard}
        sharingId={busy && !sheet ? sharingId : null}
        shareBusy={busy}
        onShareAll={() => { setSaved(null); setReady(null); setSheet({ kind: 'all' }) }}
      />
      {viewerEntry && (
        <Viewer
          entry={viewerEntry}
          hearts={hearts[viewerEntry.id] || 0}
          showName={showName}
          setShowName={setShowName}
          onShare={() => shareViewer(viewerEntry)}
          shareLabel={busy ? 'SHARING…' : viewerReady ? 'SHARE NOW' : 'SHARE'}
          sharing={busy}
          saved={saved}
          onClose={close}
        />
      )}
      {sheet?.kind === 'all' && (
        <ShareAllSheet
          count={entries.length}
          format={format}
          setFormat={setFormat}
          showNames={showNames}
          setShowNames={setShowNames}
          onShare={shareAll}
          shareLabel={busy ? (phase === 'sharing' ? 'SHARING…' : making) : allReady ? 'SHARE NOW' : 'SHARE'}
          busy={busy}
          saved={saved}
          onClose={close}
        />
      )}
    </>
  )
}
