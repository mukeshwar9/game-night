import { lookWith } from '../hooks/useOwnAvatar'
import Avatar from './Avatar'
import PetSprite from './PetSprite'

// A reward shown as the player wears it: pets as the pet itself, everything else
// as the player's avatar (bust) with that one field set.
export default function RewardPreview({ avatar, field, id, size = 48, petScale = 4 }) {
  if (field === 'pet') return <PetSprite id={id} scale={petScale} />
  return <Avatar id={lookWith(avatar, field, id)} size={size} view="bust" />
}
