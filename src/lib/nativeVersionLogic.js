// @ts-check
// Pure helpers for scripts/bump-native-version.mjs: read and rewrite the build
// number and marketing version in the two native projects (ios/.../project.pbxproj
// and android/app/build.gradle). Every TestFlight build needs a new
// CURRENT_PROJECT_VERSION and every Play upload a higher versionCode; the
// marketing version stays equal on both stores so one minNativeVersion value
// (versionGateLogic.js) covers them.

const IOS_BUILD = /(CURRENT_PROJECT_VERSION = )(\d+)(;)/g
const IOS_MARKETING = /(MARKETING_VERSION = )([^;\s]+)(;)/g
const ANDROID_CODE = /(versionCode\s+)(\d+)/
const ANDROID_NAME = /(versionName\s+")([^"]*)(")/

/** @param {string} v */
export function isMarketingVersion(v) {
  return /^\d+(\.\d+){1,2}$/.test(String(v))
}

/** @param {string} pbxproj @returns {{ build: number, marketing: string } | null} */
export function readIosVersion(pbxproj) {
  const builds = [...pbxproj.matchAll(IOS_BUILD)].map(m => Number(m[2]))
  const marketing = [...pbxproj.matchAll(IOS_MARKETING)].map(m => m[2])
  if (!builds.length || !marketing.length) return null
  return { build: Math.max(...builds), marketing: marketing[0] }
}

/** @param {string} gradle @returns {{ build: number, marketing: string } | null} */
export function readAndroidVersion(gradle) {
  const code = ANDROID_CODE.exec(gradle)
  const name = ANDROID_NAME.exec(gradle)
  if (!code || !name) return null
  return { build: Number(code[2]), marketing: name[2] }
}

/**
 * New build number and marketing version from the two projects' current values.
 * Both platforms take the higher of the two build numbers plus one, so they
 * stay in step. `marketing` (optional) replaces the marketing version.
 * @param {{ build: number, marketing: string }} ios
 * @param {{ build: number, marketing: string }} android
 * @param {string} [marketing]
 */
export function nextVersion(ios, android, marketing) {
  if (marketing !== undefined && !isMarketingVersion(marketing)) throw new Error(`Not a version like 1.2 or 1.2.3: ${marketing}`)
  return { build: Math.max(ios.build, android.build) + 1, marketing: marketing ?? ios.marketing }
}

/** @param {string} pbxproj @param {{ build: number, marketing: string }} v */
export function applyIosVersion(pbxproj, v) {
  return pbxproj.replace(IOS_BUILD, `$1${v.build}$3`).replace(IOS_MARKETING, `$1${v.marketing}$3`)
}

/** @param {string} gradle @param {{ build: number, marketing: string }} v */
export function applyAndroidVersion(gradle, v) {
  return gradle.replace(ANDROID_CODE, `$1${v.build}`).replace(ANDROID_NAME, `$1${v.marketing}$3`)
}
