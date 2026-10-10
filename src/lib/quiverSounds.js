import { sounds } from './sounds'

// One place that turns a QUIVER sim event into sound and haptics, so the solo
// page, the one-phone page and the online room cue the same things. `mine(by)`
// says whether the event belongs to a seat this device controls: your own throw
// is felt, everyone's impacts and scoring are heard.
export function playQuiverEvent(event, mine = () => true) {
  switch (event.type) {
    case 'throw': if (mine(event.by)) sounds.quiverThrow(); break
    case 'stick': sounds.quiverStick(); break
    case 'star': sounds.quiverStick(); sounds.quiverStar(false); break
    case 'shave': sounds.quiverStick(); sounds.quiverStar(false); break
    case 'gold': sounds.quiverStick(); sounds.quiverStar(true); break
    case 'clink': sounds.quiverClink(); break
    case 'bomb': sounds.quiverBomb(); break
    case 'flip': sounds.quiverStick(); sounds.quiverFlip(); break
    case 'wheel': case 'sudden': sounds.quiverWheel(); break
    case 'tick': sounds.quiverTick(); break
    case 'go': sounds.go(); break
    default: break
  }
}
