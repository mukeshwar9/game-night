// SKETCH sharing at the end of a match (S4): the gallery with a SHARE on each
// drawing and SHARE ALL, the viewer sheet (REPLAY, SHARE, name toggle) and
// the share-all sheet (PICTURES as collage images, or a PDF). Images are made
// on this phone and go to the system share sheet, where WhatsApp is; where
// files can't be shared they download and SEND ON WHATSAPP opens wa.me with
// the caption (the player attaches the files). Nothing is uploaded.
//
// The painting and PDF code (src/lib/sketchShareCard.js) loads on the first
// tap. The app never stacks sheets: one sheet is open at a time.
import { useMemo, useRef, useState } from 'react'
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
  collagePages, drawingCaption, allCaption, whatsAppLink, sketchFilename, onThisPhone,
} from '../lib/sketchShareLogic'
import { cn } from '@/lib/utils'

const FAIL = 'COULDN\'T SHARE — TRY AGAIN'
// Past this long making files, the browser's tap permission for the share
// sheet may have run out, so the sheet asks for one more tap (SHARE NOW).
const ACTIVATION_MS = 1500

const loadCard = () => import('../lib/sketchShareCard')
const playLink = () => shareUrl('/play/sketch')

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-left font-pixel text-[8px] leading-relaxed text-retro-text">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[rgb(var(--c-cta))]" />
      {label}
    </label>
  )
}

// Shown after files were downloaded instead of shared.
function SavedFallback({ text, many }) {
  return (
    <div className="space-y-2 rounded border border-retro-border p-2 text-center" data-testid="sketch-share-saved">
      <p className="font-pixel text-[8px] text-retro-win">SAVED {many ? 'FILES' : 'IMAGE'} — CHECK YOUR DOWNLOADS</p>
      <a
        href={whatsAppLink(text)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center justify-center rounded bg-retro-win px-4 font-pixel text-[9px] text-retro-bg transition press"
      >
        SEND ON WHATSAPP
      </a>
      <p className="font-pixel text-[8px] leading-relaxed text-retro-dim">ATTACH THE SAVED {many ? 'FILES' : 'IMAGE'} IN WHATSAPP</p>
    </div>
  )
}

function Viewer({ entry, hearts, showName, setShowName, onShare, sharing, saved, onClose }) {
  const { reduced } = useMotionPref()
  const [replayAt, setReplayAt] = useState(null)
  const plan = useMemo(() => replayPlan(entry.strokes, entry.fills), [entry])
  const name = String(entry.artistName || '???').toUpperCase()
  return (
    <BottomSheet centered onClose={onClose} ariaLabel={`${name}'s drawing`}>
      <div className="space-y-3 p-4 text-center" data-testid="sketch-viewer">
        <p className="font-pixel text-[10px] tracking-widest text-retro-dim">{name}&apos;S DRAWING</p>
        <svg
          viewBox="0 0 256 256"
          shapeRendering="crispEdges"
          role="img"
          aria-label={`${entry.word}, drawn by ${entry.artistName}`}
          style={{ backgroundColor: PALETTE[1], width: '100%', aspectRatio: '1 / 1' }}
          className="mx-auto block max-w-[320px] rounded border-2 border-retro-border"
        >
          {replayAt != null
            ? <ReplayLayers key={replayAt} plan={plan} elapsed={() => performance.now() - replayAt} />
            : <DrawingLayers strokes={entry.strokes} fills={entry.fills} />}
        </svg>
        <p className="font-pixel text-[11px] text-retro-text">
          {String(entry.word).toUpperCase()}
          {hearts > 0 && <span className="text-retro-p3"> · ♥ {hearts}</span>}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {!reduced && (
            <button
              type="button"
              onClick={() => setReplayAt(performance.now())}
              className="min-h-11 rounded border border-retro-border font-pixel text-[9px] text-retro-text transition press"
            >
              ▶ REPLAY
            </button>
          )}
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            className={cn('min-h-11 rounded bg-retro-cta font-pixel text-[9px] text-retro-bg transition press disabled:opacity-50', reduced && 'col-span-2')}
          >
            {sharing ? 'SHARING…' : 'SHARE'}
          </button>
        </div>
        <Toggle checked={showName} onChange={setShowName} label={`PUT ${name}'S NAME ON THE IMAGE`} />
        {saved && <SavedFallback text={saved} />}
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded border border-retro-border font-pixel text-[9px] text-retro-dim transition press">
          CLOSE
        </button>
      </div>
    </BottomSheet>
  )
}

function ShareAllSheet({ count, format, setFormat, showNames, setShowNames, onShare, busy, ready, saved, onClose }) {
  const images = collagePages(Array.from({ length: count })).length
  const pictures = images === 1 ? `ALL ${count} DRAWINGS ON ONE IMAGE` : `${count} DRAWINGS ON ${images} IMAGES`
  const label = busy
    ? (format === 'pdf' ? 'MAKING PDF…' : 'MAKING IMAGES…')
    : ready ? 'SHARE NOW' : 'SHARE'
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
      <span className="mt-0.5 block font-pixel text-[8px] leading-relaxed text-retro-dim">{sub}</span>
    </button>
  )
  return (
    <BottomSheet onClose={onClose} ariaLabel="Share all drawings">
      <div className="space-y-3 p-4" data-testid="sketch-share-all">
        <div className="text-center">
          <p className="font-pixel text-[10px] tracking-widest text-retro-text">SHARE ALL {count}</p>
          <p className="mt-1 font-pixel text-[8px] text-retro-dim">{onThisPhone(count)}</p>
        </div>
        {option('pictures', 'PICTURES', pictures)}
        {option('pdf', 'PDF', 'ONE PAGE PER DRAWING, FOR KEEPING OR PRINTING')}
        <Toggle checked={showNames} onChange={setShowNames} label="PUT EVERYONE'S NAMES ON IT" />
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="min-h-11 w-full rounded bg-retro-cta font-pixel text-[10px] text-retro-bg transition press disabled:opacity-50"
        >
          {label}
        </button>
        {saved && <SavedFallback text={saved} many />}
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded border border-retro-border font-pixel text-[9px] text-retro-dim transition press">
          CLOSE
        </button>
      </div>
    </BottomSheet>
  )
}

/**
 * @param {{ entries: any[], hearts: Record<string, number>, podiumRows: { rank: number, name: string, score: number }[], favourite: { title: string, lines: string[] } | null }} props
 */
export default function SketchGalleryShare({ entries, hearts = {}, podiumRows = [], favourite = null }) {
  const [sheet, setSheet] = useState(null)        // { kind: 'viewer', entry } | { kind: 'all' }
  const [showName, setShowName] = useState(true)  // viewer: the artist's name on the image
  const [showNames, setShowNames] = useState(true) // share all: everyone's names
  const [format, setFormat] = useState('pictures')
  const [saved, setSaved] = useState(null)        // caption for the WhatsApp fallback, after a download
  const [sharingId, setSharingId] = useState(null)
  const [sharing, runShare] = useBusy()
  const [sharingAll, runShareAll] = useBusy()
  const prepared = useRef(null)                   // { key, files, text } made but not yet shared
  const [ready, setReady] = useState(false)

  const close = () => { setSheet(null); setSaved(null); setReady(false); prepared.current = null }

  // One drawing: card SHARE or the viewer's SHARE.
  const shareOne = (entry, nameOn = true) => runShare(async () => {
    setSharingId(entry.id)
    try {
      const card = await loadCard()
      const blob = await card.sketchCardBlob({ entry, showName: nameOn, hearts: hearts[entry.id] || 0, url: playLink() })
      const text = drawingCaption({ word: entry.word, name: entry.artistName, showName: nameOn, link: playLink() })
      const outcome = await card.shareSketchFiles({ files: [{ blob, filename: sketchFilename(entry.word) }], text })
      if (outcome === 'failed') toast.error(FAIL)
      if (outcome === 'saved') {
        toast.success('SAVED IMAGE — CHECK YOUR DOWNLOADS')
        setSheet({ kind: 'viewer', entry })
        setSaved(text)
      }
    } finally {
      setSharingId(null)
    }
  }, () => toast.error(FAIL))

  // All drawings: collage PNGs or one PDF. Made first (MAKING …), then shared;
  // a slow make asks for one more tap so the share sheet may open.
  const shareAll = () => runShareAll(async () => {
    const key = `${format}:${showNames}`
    let job = prepared.current?.key === key ? prepared.current : null
    if (!job) {
      const started = performance.now()
      const card = await loadCard()
      const link = playLink()
      const files = format === 'pdf'
        ? [{
          blob: await card.sketchPdfBlob({ entries, showName: showNames, hearts, podiumRows, favourite, url: link }),
          filename: sketchFilename('drawings', 'pdf'),
        }]
        : await card.sketchCollageBlobs({ entries, showName: showNames, hearts, url: link })
      job = { key, files, text: allCaption({ count: entries.length, link }) }
      if (!isNative && performance.now() - started > ACTIVATION_MS) {
        prepared.current = job
        setReady(true)
        return
      }
    }
    prepared.current = null
    setReady(false)
    const card = await loadCard()
    const outcome = await card.shareSketchFiles({ files: job.files, text: job.text })
    if (outcome === 'failed') toast.error(FAIL)
    if (outcome === 'saved') {
      toast.success(`SAVED ${job.files.length > 1 ? 'FILES' : format === 'pdf' ? 'PDF' : 'IMAGE'} — CHECK YOUR DOWNLOADS`)
      setSaved(job.text)
    }
  }, () => toast.error(FAIL))

  const viewerEntry = sheet?.kind === 'viewer' ? sheet.entry : null
  return (
    <>
      <Gallery
        entries={entries}
        hearts={hearts}
        onOpen={entry => { setSaved(null); setSheet({ kind: 'viewer', entry }) }}
        onShare={entry => shareOne(entry, true)}
        sharingId={sharing && !viewerEntry ? sharingId : null}
        onShareAll={() => { setSaved(null); setReady(false); prepared.current = null; setSheet({ kind: 'all' }) }}
        shareAllBusy={sharingAll}
      />
      {viewerEntry && (
        <Viewer
          entry={viewerEntry}
          hearts={hearts[viewerEntry.id] || 0}
          showName={showName}
          setShowName={setShowName}
          onShare={() => shareOne(viewerEntry, showName)}
          sharing={sharing}
          saved={saved}
          onClose={close}
        />
      )}
      {sheet?.kind === 'all' && (
        <ShareAllSheet
          count={entries.length}
          format={format}
          setFormat={f => { setFormat(f); setReady(false); prepared.current = null }}
          showNames={showNames}
          setShowNames={v => { setShowNames(v); setReady(false); prepared.current = null }}
          onShare={shareAll}
          busy={sharingAll}
          ready={ready}
          saved={saved}
          onClose={close}
        />
      )}
    </>
  )
}
