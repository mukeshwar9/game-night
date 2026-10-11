// CUT PAPER game art: a WebP still per game, drawn at build time with the
// animate cut-paper kit (scripts/cut-paper-art/). While the tile is on screen
// and motion is allowed, a second WebP holding a few drawings side by side
// plays over the still with steps() — the paper "boils" and the character
// acts. Off screen the strip is paused; under reduced motion (the in-app
// setting or the OS query) it is never fetched and the still stays.
import { useEffect, useRef, useState } from 'react'
import { CUT_PAPER, cutPaperLoopUrl, cutPaperStillUrl } from '../lib/gameArtLogic'
import { observeInView } from '../lib/inView'
import useMotionPref from '../hooks/useMotionPref'
import './gameArtCutPaper.css'

export default function GameArtCutPaper({ type, className }) {
  const ref = useRef(null)
  const { reduced } = useMotionPref()
  const [loopReady, setLoopReady] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (reduced || !el) return undefined
    let alive = true
    let started = false
    const stop = observeInView(el, (visible) => {
      el.dataset.live = visible ? '1' : '0'
      if (!visible || started) return
      started = true
      const img = new Image()
      img.src = cutPaperLoopUrl(type)
      img.decode().then(() => { if (alive) setLoopReady(true) }).catch(() => {})
    })
    return () => {
      alive = false
      stop()
    }
  }, [type, reduced])

  const playing = loopReady && !reduced
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-live="0"
      className={`${className || ''} cp-art block overflow-hidden`}
      style={{ '--cp-n': CUT_PAPER.loopFrames, '--cp-ms': `${CUT_PAPER.loopMs}ms` }}
    >
      <img
        src={cutPaperStillUrl(type)}
        alt=""
        draggable={false}
        loading="lazy"
        width={CUT_PAPER.still}
        height={CUT_PAPER.still}
        className="block w-full h-full"
      />
      {playing && (
        <img
          src={cutPaperLoopUrl(type)}
          alt=""
          draggable={false}
          className="cp-strip absolute top-0 left-0 h-full max-w-none"
        />
      )}
    </span>
  )
}
