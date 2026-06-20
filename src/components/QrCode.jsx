import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function QrCode({ value, size = 160, className = '' }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: '#0a0a14', light: '#ffffff' } })
      .then(url => { if (active) setSrc(url) })
      .catch(() => { if (active) setSrc('') })
    return () => { active = false }
  }, [value, size])
  if (!src) return null
  return <img src={src} width={size} height={size} alt="Scan to join" className={className} />
}
