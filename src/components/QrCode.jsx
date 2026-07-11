import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Skeleton from './loading/Skeleton'
import { cn } from '@/lib/utils'

export default function QrCode({ value, size = 160, className = '' }) {
  const [status, setStatus] = useState('loading')
  const [src, setSrc] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: '#0a0a14', light: '#ffffff' } })
      .then(url => { if (active) { setSrc(url); setStatus('ready') } })
      .catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [value, size])

  if (status === 'loading') {
    return <Skeleton pulse className={className} style={{ width: size, height: size }} />
  }

  if (status === 'error') {
    // QR module's dark ink is a fixed hex (matches the `dark` color passed to
    // QRCode.toDataURL above) — this box sits on WaitingRoom's white wrapper
    // and can't theme through --c-* like everything else.
    return (
      <div
        className={cn('flex items-center justify-center text-center bg-white rounded', className)}
        style={{ width: size, height: size, color: '#0a0a14' }}
      >
        <span className="font-pixel text-[8px] leading-tight px-2">QR UNAVAILABLE — USE THE LINK</span>
      </div>
    )
  }

  return <img src={src} width={size} height={size} alt="Scan to join" className={className} />
}
