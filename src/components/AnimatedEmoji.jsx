import { motion } from 'framer-motion'
import { useState } from 'react'

const NOTO_EMOJI_URL = 'https://fonts.gstatic.com/s/e/notoemoji/latest'

function codepointPath(glyph) {
  return Array.from(glyph)
    .map(character => character.codePointAt(0).toString(16))
    .join('_')
}

export default function AnimatedEmoji({ glyph, className = '' }) {
  const [unavailable, setUnavailable] = useState(false)

  if (unavailable) {
    return <span className={`inline-flex items-center justify-center text-6xl ${className}`}>{glyph}</span>
  }

  return (
    <motion.img
      src={`${NOTO_EMOJI_URL}/${codepointPath(glyph)}/512.gif`}
      alt={glyph}
      className={className}
      draggable={false}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: [0.7, 1.12, 1] }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      onError={() => setUnavailable(true)}
    />
  )
}
