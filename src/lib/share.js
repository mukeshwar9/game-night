// @ts-check
// One way to hand a link or an image to the system share sheet.
//
// Web: navigator.share where the browser has it. Native shell: the
// @capacitor/share plugin, because the Android web view has no Web Share API
// at all (every SHARE button there used to fall back to copying), and the
// plugin gives iOS the same sheet without depending on WebKit's version.
// Images are written to the app's cache folder first (@capacitor/filesystem),
// since the shell cannot "download" a blob. Plugins load with a dynamic import
// behind `isNative`, so the web bundle never carries them.

import { isNative } from './platform'

/** @typedef {'shared' | 'cancelled' | 'unavailable'} ShareOutcome */

/**
 * Which share path to take.
 * @param {{ native?: boolean, webShare?: boolean }} env
 * @returns {'native' | 'web' | 'none'}
 */
export function shareMethod({ native = false, webShare = false } = {}) {
  if (native) return 'native'
  if (webShare) return 'web'
  return 'none'
}

/**
 * True when a rejected share means the player closed the sheet, which is not
 * a failure. Browsers report AbortError (Safari sometimes NotAllowedError);
 * the Capacitor plugin rejects with "Share canceled".
 * @param {unknown} err
 */
export function isShareCancel(err) {
  const e = /** @type {{ name?: string, message?: string } | null} */ (err)
  if (e?.name === 'AbortError' || e?.name === 'NotAllowedError') return true
  return /cancel/i.test(String(e?.message || ''))
}

/** @param {Blob} blob */
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // Chunked: String.fromCharCode(...bytes) overflows the stack on a large PNG.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * The side-effecting part, with its environment injected so tests can drive it.
 * @param {{
 *   native?: boolean,
 *   nav?: any,
 *   loadShare?: () => Promise<any>,
 *   loadFilesystem?: () => Promise<any>,
 * }} [env]
 */
export function createShare({
  native = isNative,
  nav = typeof navigator === 'undefined' ? undefined : navigator,
  loadShare = () => import('@capacitor/share'),
  loadFilesystem = () => import('@capacitor/filesystem'),
} = {}) {
  /**
   * Opens the share sheet for a link. 'unavailable' means there is no sheet
   * here (or it failed) and the caller should copy the link instead.
   * @param {{ title?: string, text?: string, url: string }} data
   * @returns {Promise<ShareOutcome>}
   */
  async function shareLink({ title = 'Game Night', text, url }) {
    const method = shareMethod({ native, webShare: typeof nav?.share === 'function' })
    try {
      if (method === 'native') {
        const { Share } = await loadShare()
        await Share.share({ title, text, url, dialogTitle: title })
        return 'shared'
      }
      if (method === 'web') {
        await nav.share({ title, text, url })
        return 'shared'
      }
    } catch (err) {
      if (isShareCancel(err)) return 'cancelled'
      console.warn('[share] link share failed:', err)
    }
    return 'unavailable'
  }

  /**
   * Opens the share sheet for an image. 'unavailable' means no sheet could
   * take the file; on the web the caller may then download it, in the shell
   * it should report a failure (a download goes nowhere there).
   * @param {{ blob: Blob, filename: string, title?: string, text?: string }} data
   * @returns {Promise<ShareOutcome>}
   */
  async function shareImage({ blob, filename, title = 'Game Night', text }) {
    try {
      if (native) {
        const [{ Filesystem, Directory }, { Share }] = await Promise.all([loadFilesystem(), loadShare()])
        const data = await blobToBase64(blob)
        const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })
        await Share.share({ title, text, files: [uri], dialogTitle: title })
        return 'shared'
      }
      const file = new File([blob], filename, { type: blob.type || 'image/png' })
      if (typeof nav?.share === 'function' && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title, text })
        return 'shared'
      }
    } catch (err) {
      if (isShareCancel(err)) return 'cancelled'
      console.warn('[share] image share failed:', err)
    }
    return 'unavailable'
  }

  return {
    shareLink,
    shareImage,
    // Load the plugin ahead of the first tap so the sheet opens without a gap.
    preload: () => { if (native) loadShare().catch(() => {}) },
  }
}

const instance = createShare()

export const shareLink = instance.shareLink
export const shareImage = instance.shareImage
instance.preload()
