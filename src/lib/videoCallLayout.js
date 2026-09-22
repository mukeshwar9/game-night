export const VIDEO_CALL_STORAGE_KEY = 'gn-video-call-layout'

export const VIDEO_CALL_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
export const VIDEO_CALL_SIZES = {
  small: { label: 'SMALL', width: 180, height: 140 },
  medium: { label: 'MEDIUM', width: 240, height: 180 },
  large: { label: 'LARGE', width: 320, height: 240 },
}

export const DEFAULT_VIDEO_CALL_LAYOUT = {
  enabled: false,
  corner: 'top-right',
  size: 'medium',
}

export function normalizeVideoCallLayout(value) {
  const input = value && typeof value === 'object' ? value : {}
  return {
    enabled: input.enabled === true,
    corner: VIDEO_CALL_CORNERS.includes(input.corner) ? input.corner : DEFAULT_VIDEO_CALL_LAYOUT.corner,
    size: Object.prototype.hasOwnProperty.call(VIDEO_CALL_SIZES, input.size) ? input.size : DEFAULT_VIDEO_CALL_LAYOUT.size,
  }
}

export function readVideoCallLayout(storage = globalThis.localStorage) {
  try {
    return normalizeVideoCallLayout(JSON.parse(storage?.getItem(VIDEO_CALL_STORAGE_KEY) || 'null'))
  } catch {
    return { ...DEFAULT_VIDEO_CALL_LAYOUT }
  }
}

export function writeVideoCallLayout(value, storage = globalThis.localStorage) {
  const next = normalizeVideoCallLayout(value)
  try { storage?.setItem(VIDEO_CALL_STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  return next
}

export function getVideoCallReserve(layout, viewport = {}) {
  const next = normalizeVideoCallLayout(layout)
  if (!next.enabled) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }
  const size = VIDEO_CALL_SIZES[next.size]
  const horizontal = next.corner.endsWith('right') ? 'right' : 'left'
  const vertical = next.corner.startsWith('top') ? 'top' : 'bottom'
  const width = Math.min(size.width, Math.max(0, (viewport.width || Infinity) - 32))
  const height = Math.min(size.height, Math.max(0, (viewport.height || Infinity) - 32))
  return {
    left: horizontal === 'left' ? width : 0,
    right: horizontal === 'right' ? width : 0,
    top: vertical === 'top' ? height : 0,
    bottom: vertical === 'bottom' ? height : 0,
    width,
    height,
  }
}

export function hasInsufficientVideoCallSpace(layout, viewport = {}) {
  if (!normalizeVideoCallLayout(layout).enabled) return false
  const reserve = getVideoCallReserve(layout, viewport)
  const availableWidth = (viewport.width || 0) - reserve.left - reserve.right
  const availableHeight = (viewport.height || 0) - reserve.top - reserve.bottom
  return availableWidth < 280 || availableHeight < 360
}
