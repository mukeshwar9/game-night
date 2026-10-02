import DeadEnd, { deadEndPrimaryClass } from './DeadEnd'
import { isNative, nativePlatform } from '../lib/platform'
import { openStoreListing } from '../lib/native/versionGate'

// A room switched to a game this build doesn't have (a newer build made it).
// Never render it as another game: the web reloads into the latest build, the
// store apps go to their listing.
export default function UpdateNeeded() {
  const store = nativePlatform === 'ios' ? 'APP STORE' : 'GOOGLE PLAY'
  return (
    <DeadEnd
      title="UPDATE NEEDED"
      message={isNative
        ? 'This room is playing something your version of Game Night doesn’t have yet. Update the app to join in.'
        : 'This room is playing something this page doesn’t have yet. Reload to get the latest Game Night.'}
      primary={isNative ? (
        <button type="button" onClick={() => openStoreListing(nativePlatform)} className={deadEndPrimaryClass}>OPEN {store}</button>
      ) : (
        <button type="button" onClick={() => window.location.reload()} className={deadEndPrimaryClass}>RELOAD</button>
      )}
    />
  )
}
