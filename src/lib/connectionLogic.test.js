import { describe, it, expect } from 'vitest'
import { CONNECTION_COPY, connectionBannerState } from './connectionLogic'

describe('connectionBannerState', () => {
  const base = { netOffline: false, everConnected: false, signalLost: false, initialExpired: false }

  it('stays hidden while the first connection is still inside its grace window', () => {
    expect(connectionBannerState(base)).toBe('hidden')
  })

  it('explains a first connection that never succeeded', () => {
    expect(connectionBannerState({ ...base, initialExpired: true })).toBe('unreachable')
  })

  it('is hidden once connected, even if the initial timer fired earlier', () => {
    expect(connectionBannerState({ ...base, everConnected: true, initialExpired: true })).toBe('hidden')
  })

  it('reports a lost connection only after one existed', () => {
    expect(connectionBannerState({ ...base, everConnected: true, signalLost: true })).toBe('lost')
    expect(connectionBannerState({ ...base, signalLost: true })).toBe('hidden')
  })

  it('lets the browser offline signal win', () => {
    expect(connectionBannerState({ ...base, netOffline: true, initialExpired: true })).toBe('offline')
    expect(connectionBannerState({ ...base, netOffline: true, everConnected: true })).toBe('offline')
  })

  it('has copy for every visible state', () => {
    for (const s of ['offline', 'lost', 'unreachable']) expect(CONNECTION_COPY[s]).toBeTruthy()
  })
})
