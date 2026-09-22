import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIDEO_CALL_LAYOUT,
  getVideoCallReserve,
  hasInsufficientVideoCallSpace,
  normalizeVideoCallLayout,
  readVideoCallLayout,
  writeVideoCallLayout,
} from './videoCallLayout'

describe('video call layout', () => {
  it('normalizes invalid preferences', () => {
    expect(normalizeVideoCallLayout({ enabled: 'yes', corner: 'middle', size: 'huge' })).toEqual(DEFAULT_VIDEO_CALL_LAYOUT)
  })

  it('reads and writes local preferences', () => {
    const data = new Map()
    const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) }
    const saved = writeVideoCallLayout({ enabled: true, corner: 'bottom-left', size: 'small' }, storage)
    expect(readVideoCallLayout(storage)).toEqual(saved)
  })

  it('reserves the selected side and vertical anchor', () => {
    expect(getVideoCallReserve({ enabled: true, corner: 'bottom-left', size: 'small' }, { width: 900, height: 700 }))
      .toEqual({ left: 96, right: 0, top: 0, bottom: 171, width: 96, height: 171 })
  })

  it('flags cramped viewports', () => {
    expect(hasInsufficientVideoCallSpace({ enabled: true, corner: 'bottom-right', size: 'large' }, { width: 500, height: 600 })).toBe(true)
    expect(hasInsufficientVideoCallSpace({ enabled: true, corner: 'bottom-right', size: 'small' }, { width: 900, height: 700 })).toBe(false)
  })
})
