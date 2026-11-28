import { useNavigate } from 'react-router-dom'
import IntroCard from '../../components/IntroCard'
import useOwnSeat from '../../hooks/useOwnSeat'
import { introSeats } from '../../lib/introCardLogic'
import { PARTY_BLURB } from './partyBlurbs'

// ─── Party game card ──────────────────────────────────────────────────────────
// A party game with no solo bot: the shared intro card (picture, pitch, rules
// behind "?") whose one PLAY button goes to the room creator.

export default function PartyGameCard({ type }) {
  const navigate = useNavigate()
  const me = useOwnSeat()
  return (
    <IntroCard
      hideTitle
      gameType={type}
      pitch={PARTY_BLURB[type]}
      seats={introSeats(me)}
      playLabel="CREATE A ROOM"
      onPlay={() => navigate('/')}
    >
      <p className="font-pixel text-[10px] text-retro-dim leading-relaxed text-center">
        NEEDS 2+ PLAYERS. NO SOLO BOT FOR THIS ONE.
      </p>
    </IntroCard>
  )
}
