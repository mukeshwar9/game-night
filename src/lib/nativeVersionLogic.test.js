import { describe, it, expect } from 'vitest'
import {
  isMarketingVersion, readIosVersion, readAndroidVersion, nextVersion, applyIosVersion, applyAndroidVersion,
} from './nativeVersionLogic'

const PBX = `
  CURRENT_PROJECT_VERSION = 4;
  MARKETING_VERSION = 1.0;
  other = 1;
  CURRENT_PROJECT_VERSION = 4;
  MARKETING_VERSION = 1.0;
`
const GRADLE = `defaultConfig {
        versionCode 3
        versionName "1.0"
}`

describe('native version helpers', () => {
  it('reads the versions from both projects', () => {
    expect(readIosVersion(PBX)).toEqual({ build: 4, marketing: '1.0' })
    expect(readAndroidVersion(GRADLE)).toEqual({ build: 3, marketing: '1.0' })
    expect(readIosVersion('nothing')).toBeNull()
    expect(readAndroidVersion('nothing')).toBeNull()
  })

  it('bumps both builds past the higher one and keeps the marketing version', () => {
    expect(nextVersion({ build: 4, marketing: '1.0' }, { build: 3, marketing: '1.0' })).toEqual({ build: 5, marketing: '1.0' })
  })

  it('takes a new marketing version and refuses a malformed one', () => {
    expect(nextVersion({ build: 1, marketing: '1.0' }, { build: 1, marketing: '1.0' }, '1.1')).toEqual({ build: 2, marketing: '1.1' })
    for (const bad of ['', 'v1', '1', '1.2.3.4', 'x.y']) expect(() => nextVersion({ build: 1, marketing: '1.0' }, { build: 1, marketing: '1.0' }, bad)).toThrow()
    expect(isMarketingVersion('2.10.1')).toBe(true)
  })

  it('rewrites every occurrence in the pbxproj and the gradle file', () => {
    const v = { build: 5, marketing: '1.1' }
    const pbx = applyIosVersion(PBX, v)
    expect(pbx.match(/CURRENT_PROJECT_VERSION = 5;/g)).toHaveLength(2)
    expect(pbx.match(/MARKETING_VERSION = 1\.1;/g)).toHaveLength(2)
    expect(pbx).toContain('other = 1;')
    const gradle = applyAndroidVersion(GRADLE, v)
    expect(gradle).toContain('versionCode 5')
    expect(gradle).toContain('versionName "1.1"')
  })
})
