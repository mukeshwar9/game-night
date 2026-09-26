import { Suspense } from 'react'
import PixelDots from './loading/PixelDots'
import { lazyWithRetry } from '../lib/lazyWithRetry'

// The first-run flow (and its avatar picker) is only needed once per visitor,
// so it downloads on demand instead of riding in the first-load chunk with Home.
const Onboarding = lazyWithRetry(() => import('./Onboarding'))

function Fallback() {
  return (
    <div className="min-h-screen bg-retro-bg flex items-center justify-center">
      <PixelDots size="lg" glow />
    </div>
  )
}

export default function LazyOnboarding(props) {
  return (
    <Suspense fallback={<Fallback />}>
      <Onboarding {...props} />
    </Suspense>
  )
}
