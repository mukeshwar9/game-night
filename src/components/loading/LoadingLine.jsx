import PixelDots from './PixelDots'

// Universal inline loading indicator: dots + one optional text line.
export default function LoadingLine({ label = 'NOW LOADING', tone = 'cta', className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <PixelDots tone={tone} size="md" glow />
      {label && (
        <p className="font-pixel text-[9px] text-retro-dim tracking-widest">{label}</p>
      )}
    </div>
  )
}
