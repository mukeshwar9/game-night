import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/AuthContext'
import { subscribeFriends, subscribeRequests, sendFriendRequestToCoPlayer } from '@/lib/social'
import { friendOffer, parseSent, withSent } from '@/lib/addFriendLogic'
import { useMutedMap } from '@/lib/mute'
import useBusy from '@/hooks/useBusy'

const SENT_KEY = 'gn.friendReqSent'

function readSent() {
  try { return parseSent(localStorage.getItem(SENT_KEY), Date.now()) } catch { return {} }
}

function rememberSent(uid) {
  try { localStorage.setItem(SENT_KEY, JSON.stringify(withSent(readSent(), uid, Date.now()))) } catch { /* private mode: the button still shows REQUEST SENT for this visit */ }
}

// "+ ADD AS FRIEND" for the person you just played with, on the result screen.
// One tap sends a friend request by uid, carrying the room (the rules only
// allow it between two players seated in it); the other side still has to
// accept on /friends. Hidden for friends, for someone who already asked you,
// and for a muted or blocked player.
export default function AddFriendButton({ otherUid, gameId, className }) {
  const { uid: myUid } = useAuth()
  const [friendUids, setFriendUids] = useState(null)
  const [incomingUids, setIncomingUids] = useState(null)
  const [sentUids, setSentUids] = useState(() => Object.keys(readSent()))
  const [busy, run] = useBusy()
  const muted = !!useMutedMap()[otherUid]

  useEffect(() => subscribeFriends(list => setFriendUids(list.map(f => f.uid))), [])
  useEffect(() => subscribeRequests(list => setIncomingUids(list.map(r => r.uid))), [])

  const offer = gameId
    ? friendOffer({ myUid, otherUid, friendUids, incomingUids, sentUids, muted })
    : 'hidden'
  if (offer === 'hidden') return null

  if (offer === 'sent') {
    return (
      <p
        data-testid="friend-request-sent"
        role="status"
        className={cn('font-pixel text-[9px] tracking-widest text-retro-win', className)}
      >
        ✓ REQUEST SENT
      </p>
    )
  }

  const send = () => run(async () => {
    const res = await sendFriendRequestToCoPlayer(otherUid, gameId)
    if (res.ok) {
      rememberSent(otherUid)
      setSentUids(prev => (prev.includes(otherUid) ? prev : [...prev, otherUid]))
    } else if (res.error === 'invalid') {
      toast.error("COULDN'T SEND — TRY AGAIN")
    }
  }, () => toast.error("COULDN'T SEND — CHECK CONNECTION"))

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      className={cn(
        'min-h-11 px-4 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-[10px] tracking-wider',
        'rounded transition press disabled:opacity-50 hover:border-retro-win/60 hover:text-retro-win',
        className,
      )}
    >
      {busy ? 'SENDING…' : '+ ADD AS FRIEND'}
    </button>
  )
}
