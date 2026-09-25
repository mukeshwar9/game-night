import { MotionConfig } from 'framer-motion'
import useMotionPref from '../hooks/useMotionPref'

// Routes the in-app motion setting into framer-motion. Without this every
// motion.* component follows only the OS query, so Settings → REDUCED did
// nothing for taps/springs and FULL couldn't override an OS "reduce".
//   setting 'reduced' → 'always' (skip transform/layout animation)
//   setting 'full'    → 'never'  (animate even if the OS asks to reduce)
//   no setting        → 'user'   (framer reads the OS query itself)
// Mounted inside the framer-motion components themselves (EmoteBar,
// AnimatedEmoji), which load lazily — not at the app root, where importing
// MotionConfig would pull framer-motion (~120 KB) into the entry chunk.
export default function MotionPrefProvider({ children }) {
  const { setting } = useMotionPref()
  const reducedMotion = setting === 'reduced' ? 'always' : setting === 'full' ? 'never' : 'user'
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
}
