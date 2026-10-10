import { Suspense } from 'react'
import { lazyWithRetry } from '../lib/lazyWithRetry'

// The shared overlay primitive (sheet / dialog). Its gesture and spring code
// lives in BottomSheetPanel.jsx, outside the entry bundle: overlays only ever
// render once opened, and the chunk is warmed as soon as the app is idle, so
// the first sheet opens without waiting on a fetch. Props and behaviour are
// documented in BottomSheetPanel.jsx.
const Panel = lazyWithRetry(() => import('./BottomSheetPanel'))

if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1500))
  idle(() => Panel.preload())
}

export default function BottomSheet(props) {
  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  )
}
