import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'

const NOTO_EMOJI_URL = 'https://fonts.gstatic.com/s/e/notoemoji/latest'

function codepointPath(glyph) {
  return Array.from(glyph)
    .map(character => character.codePointAt(0).toString(16))
    .join('_')
}

export default function AnimatedEmoji({ glyph, className = '' }) {
  const [unavailable, setUnavailable] = useState(false)
  const reduceMotion = useReducedMotion()

  if (unavailable) {
    return <span className={`inline-flex items-center justify-center text-6xl ${className}`}>{glyph}</span>
  }

  return (
    <motion.img
      src={`${NOTO_EMOJI_URL}/${codepointPath(glyph)}/${reduceMotion ? '512.webp' : '512.gif'}`}
      alt={glyph}
      className={className}
      draggable={false}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
      animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [0.7, 1.12, 1] }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      onError={() => setUnavailable(true)}
    />
  )
}
