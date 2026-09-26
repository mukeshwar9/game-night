import { Suspense } from 'react'
import { lazyWithRetry } from '../lib/lazyWithRetry'

// HOW TO PLAY text for every game (src/lib/rules.js) is ~40 KB, and Home and
// the game picker only need it once someone taps a rules button, so there it
// downloads on demand instead of riding in the first-load chunk. The sheet is
// small enough that showing nothing for the moment it loads reads as a tap
// delay, not a missing screen.
const RulesModal = lazyWithRetry(() => import('./RulesModal'))

export default function LazyRulesModal(props) {
  return (
    <Suspense fallback={null}>
      <RulesModal {...props} />
    </Suspense>
  )
}
