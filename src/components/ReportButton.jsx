import { toast } from 'sonner'
import { useAuth } from '../lib/AuthContext'
import { submitReport } from '../lib/feedback'
import useBusy from '../hooks/useBusy'

// REPORT for a player's profile (name, avatar) or drawing. It sends the same
// feedback/ item as a chat report, so it lands in the admin /notes inbox with
// the moderation commitment in the terms. `context` is 'profile' | 'drawing'.
export default function ReportButton({ context, gameId, targetUid, targetName, text, label = 'REPORT', className = '' }) {
  const { profile } = useAuth()
  const [reporting, runReport] = useBusy()

  const report = () => runReport(async () => {
    const res = await submitReport({ context, gameId, targetUid, targetName, text, profile })
    if (res.reason === 'cooldown') {
      toast.error(`WAIT ${Math.ceil(res.retryInMs / 1000)}S BEFORE SENDING ANOTHER REPORT.`)
      return
    }
    if (!res.ok) throw new Error('invalid')
    toast.success('REPORTED — THANKS. WE REVIEW REPORTS WITHIN 24 HOURS.')
  }, () => toast.error("COULDN'T SEND THAT REPORT — TRY AGAIN."))

  return (
    <button
      type="button"
      onClick={report}
      disabled={reporting}
      className={`min-h-11 px-3 border border-retro-border rounded font-pixel text-[9px] tracking-wider text-retro-dim
        hover:text-retro-p2 hover:border-retro-p2 transition-colors active:scale-95 disabled:opacity-50 ${className}`}
    >
      {reporting ? 'REPORTING…' : label}
    </button>
  )
}
