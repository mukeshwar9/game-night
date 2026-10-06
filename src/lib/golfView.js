// Which Minigolf renderer to use: the 3D view when the device can do WebGL and
// the player has not switched it off, the 2D SVG otherwise. The preference is a
// per-device convenience (localStorage), so every read and write is guarded.

const KEY = 'golf-view'

let webgl
/** Whether this browser can create a WebGL context. Probed once. */
export function webglAvailable() {
  if (webgl !== undefined) return webgl
  try {
    const canvas = document.createElement('canvas')
    webgl = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    webgl = false
  }
  return webgl
}

/** @returns {'3d' | '2d'} the stored choice; 3D unless the player chose 2D. */
export function readGolfView() {
  try { return localStorage.getItem(KEY) === '2d' ? '2d' : '3d' } catch { return '3d' }
}

/** @param {'3d' | '2d'} view */
export function writeGolfView(view) {
  try { localStorage.setItem(KEY, view) } catch { /* storage unavailable */ }
}
