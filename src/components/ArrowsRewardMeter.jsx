import RewardPreview from './ArrowsRewardPreview'
import useOwnAvatar from '../hooks/useOwnAvatar'
import { ARROWS_REWARD_LADDER, meterLine, meterPosition, nextArrowsStep } from '../lib/arrowsRewardsLogic'
import { optionInfo } from '../lib/avatarKit'

// The hub's star meter: a slim track with a tick for every reward step up to the
// goal, a scaleX fill (never a width animation), "38★ TO ARROW SNAKE" and the
// next reward as the player would wear it. Past the last step it reads
// "ALL ARROWS REWARDS EARNED". Rendered inside the CONTINUE card (a button), so
// spans only.
export default function ArrowsRewardMeter({ stars }) {
  const avatar = useOwnAvatar()
  const next = nextArrowsStep(stars)
  const item = next?.step.items[0]
  return (
    <span className="mt-1.5 flex w-full items-center gap-3">
      <span className="block min-w-0 flex-1">
        <span className="block font-pixel text-[8px] text-retro-text truncate">
          <span className={next ? 'text-retro-cta' : 'text-retro-win'}>★</span> {meterLine(stars)}
        </span>
        <span aria-hidden="true" className="relative mt-1.5 block h-1.5 w-full rounded-sm bg-retro-deep overflow-hidden">
          <span
            className={next ? 'absolute inset-0 origin-left bg-retro-cta transition-transform' : 'absolute inset-0 origin-left bg-retro-win transition-transform'}
            style={{ transform: `scaleX(${meterPosition(stars)})` }}
          />
          {ARROWS_REWARD_LADDER.map((s) => (
            <span key={s.stars} className="absolute top-0 bottom-0 w-px bg-retro-text/70" style={{ left: `calc(${meterPosition(s.stars) * 100}% - 1px)` }} />
          ))}
        </span>
      </span>
      {item && (
        <span className="shrink-0 flex w-10 items-center justify-center" title={optionInfo(item.field, item.id).label}>
          <RewardPreview avatar={avatar} field={item.field} id={item.id} size={36} petScale={3} />
        </span>
      )}
    </span>
  )
}
