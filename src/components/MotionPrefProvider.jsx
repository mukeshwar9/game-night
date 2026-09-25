import { MotionConfig } from 'framer-motion'
import useMotionPref from '../hooks/useMotionPref'

// Routes the in-app motion setting into framer-motion. Without this every
// motion.* component follows only the OS query, so Settings → REDUCED did
// nothing for taps/springs and FULL couldn't override an OS "reduce".
//   setting 'reduced' → 'always' (skip transform/layout animation)
//   setting 'full'    → 'never'  (animate even if the OS asks to reduce)
//   no setting        → 'user'   (framer reads the OS query itself)
export default function MotionPrefProvider({ children }) {
  const { setting } = useMotionPref()
  const reducedMotion = setting === 'reduced' ? 'always' : setting === 'full' ? 'never' : 'user'
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
}
