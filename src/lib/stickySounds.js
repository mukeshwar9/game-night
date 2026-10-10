import { sounds } from './sounds'

// One place that turns a Sticky Fingers sim event into sound and haptics, so
// the solo page, the one-phone page and the online room cue the same things.
// `mine(by)` says whether the event belongs to a player this device controls:
// your own grabs and slips are felt, everyone's scoring is heard.
export function playStickyEvent(event, mine = () => true) {
  switch (event.type) {
    case 'grab': if (mine(event.by)) sounds.stickyGrab(); break
    case 'cash': sounds.stickyCash(false); break
    case 'bigcash': sounds.stickyCash(true); break
    case 'rip': sounds.stickyRip(); break
    case 'slip': if (mine(event.by)) sounds.stickySlip(); break
    case 'dye': sounds.stickyDye(); break
    case 'tick': sounds.stickyTick(); break
    case 'go': sounds.go(); break
    case 'lastcall': sounds.stickyLast(); break
    default: break
  }
}
