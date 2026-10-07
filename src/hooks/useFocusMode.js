import { useEffect, useRef, useState } from 'react'

// Focus mode on/off, plus the browser's real fullscreen where there is one.
//
// enter() must run inside the tap that asks for focus: requestFullscreen needs
// that user activation. Android Chrome, installed Android PWAs and iPad Safari
// go truly full screen (status and navigation bars hidden); iPhone Safari has
// no element fullscreen, so it — like any browser that refuses — just gets the
// CSS stage, which never depends on fullscreen for its layout.
//
// Leaving fullscreen from outside (Android back, Esc) also leaves focus mode.
export default function useFocusMode() {
  const [on, setOn] = useState(false)
  const native = useRef(false)

  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement || !native.current) return
      native.current = false
      setOn(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const enter = () => {
    setOn(true)
    const el = document.documentElement
    if (!document.fullscreenEnabled || !el.requestFullscreen || document.fullscreenElement) return
    try {
      native.current = true
      el.requestFullscreen({ navigationUI: 'hide' }).catch(() => { native.current = false })
    } catch {
      native.current = false
    }
  }

  const exit = () => {
    setOn(false)
    if (!native.current) return
    native.current = false
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  // Leaving the page (or the game) with focus on hands the screen back.
  useEffect(() => () => {
    if (native.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [])

  return { on, enter, exit }
}
