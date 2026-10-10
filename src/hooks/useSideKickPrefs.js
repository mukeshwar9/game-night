import { useEffect, useSyncExternalStore } from 'react'
import { getPrefs, setPrefs, subscribePrefs } from '../lib/sideKickPrefs'
import { getTiltStatus, requestTilt, startTilt, stopTilt, subscribeTilt, tiltSupported } from '../lib/tiltSensor'

/** The rider's saved camera and steering choice, shared by every SIDE KICK surface on the page. */
export function useSideKickPrefs() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
  return [prefs, setPrefs]
}

/**
 * The tilt sensor's state. With `listen` the sensor is switched on while the caller is mounted
 * (on iOS it still waits for `request`, which must be called from a tap).
 */
export function useTilt(listen = true) {
  const status = useSyncExternalStore(subscribeTilt, getTiltStatus, getTiltStatus)
  useEffect(() => {
    if (!listen) return undefined
    startTilt()
    return stopTilt
  }, [listen])
  return { status, supported: tiltSupported(), request: requestTilt }
}
