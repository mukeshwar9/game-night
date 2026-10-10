// Bumps the native build number in ios/App/App.xcodeproj/project.pbxproj and
// android/app/build.gradle. Run it before every TestFlight or Play upload.
//
//   npm run native:bump            build number + 1 on both platforms
//   npm run native:bump -- 1.1     also set the marketing version (1.1 or 1.1.2)
//   npm run native:bump -- --check print the current versions and exit
//
// Both platforms share one build number and one marketing version, so a single
// minNativeVersion value (src/lib/versionGateLogic.js) covers both stores.
import { readFileSync, writeFileSync } from 'node:fs'
import {
  readIosVersion, readAndroidVersion, nextVersion, applyIosVersion, applyAndroidVersion,
} from '../src/lib/nativeVersionLogic.js'

const PBX = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url)
const GRADLE = new URL('../android/app/build.gradle', import.meta.url)

const args = process.argv.slice(2)
const check = args.includes('--check')
const marketing = args.find(a => !a.startsWith('--'))

const pbxproj = readFileSync(PBX, 'utf8')
const gradle = readFileSync(GRADLE, 'utf8')
const ios = readIosVersion(pbxproj)
const android = readAndroidVersion(gradle)
if (!ios || !android) {
  console.error('Could not read the current version from the iOS or Android project.')
  process.exit(1)
}

console.log(`now   iOS ${ios.marketing} (${ios.build})   Android ${android.marketing} (${android.build})`)
if (check) process.exit(0)

let next
try {
  next = nextVersion(ios, android, marketing)
} catch (e) {
  console.error(e.message)
  process.exit(2)
}
writeFileSync(PBX, applyIosVersion(pbxproj, next))
writeFileSync(GRADLE, applyAndroidVersion(gradle, next))
console.log(`next  ${next.marketing} (${next.build}) on both platforms`)
