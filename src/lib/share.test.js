import { describe, it, expect, vi } from 'vitest'
import { createShare, isShareCancel, shareMethod } from './share'

describe('shareMethod', () => {
  it('prefers the native plugin in the shell, then Web Share, then nothing', () => {
    expect(shareMethod({ native: true, webShare: false })).toBe('native')
    expect(shareMethod({ native: true, webShare: true })).toBe('native')
    expect(shareMethod({ native: false, webShare: true })).toBe('web')
    expect(shareMethod({ native: false, webShare: false })).toBe('none')
  })
})

describe('isShareCancel', () => {
  it('treats a closed sheet as a cancel, not a failure', () => {
    expect(isShareCancel({ name: 'AbortError' })).toBe(true)
    expect(isShareCancel({ name: 'NotAllowedError' })).toBe(true)
    expect(isShareCancel(new Error('Share canceled'))).toBe(true)
    expect(isShareCancel(new Error('boom'))).toBe(false)
    expect(isShareCancel(null)).toBe(false)
  })
})

describe('shareLink', () => {
  it('uses the Capacitor plugin in the shell (the Android web view has no navigator.share)', async () => {
    const share = vi.fn().mockResolvedValue({})
    const s = createShare({ native: true, nav: {}, loadShare: async () => ({ Share: { share } }) })
    await expect(s.shareLink({ text: 'Join', url: 'https://x/game/A' })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: 'Join', url: 'https://x/game/A' }))
  })

  it('uses navigator.share on the web', async () => {
    const navShare = vi.fn().mockResolvedValue(undefined)
    const s = createShare({ native: false, nav: { share: navShare } })
    await expect(s.shareLink({ url: 'https://x' })).resolves.toBe('shared')
    expect(navShare).toHaveBeenCalledOnce()
  })

  it('reports unavailable when there is no sheet, so the caller copies', async () => {
    const s = createShare({ native: false, nav: {} })
    await expect(s.shareLink({ url: 'https://x' })).resolves.toBe('unavailable')
  })

  it('reports a dismissed sheet as cancelled and a broken one as unavailable', async () => {
    const cancel = createShare({ native: true, loadShare: async () => ({ Share: { share: () => Promise.reject(new Error('Share canceled')) } }) })
    await expect(cancel.shareLink({ url: 'https://x' })).resolves.toBe('cancelled')
    const broken = createShare({ native: true, loadShare: async () => { throw new Error('no plugin') } })
    await expect(broken.shareLink({ url: 'https://x' })).resolves.toBe('unavailable')
  })
})

describe('shareImage', () => {
  const blob = new Blob(['png'], { type: 'image/png' })

  it('writes the image to the cache folder and shares the file uri in the shell', async () => {
    const writeFile = vi.fn().mockResolvedValue({ uri: 'file:///cache/card.png' })
    const share = vi.fn().mockResolvedValue({})
    const s = createShare({
      native: true,
      loadFilesystem: async () => ({ Filesystem: { writeFile }, Directory: { Cache: 'CACHE' } }),
      loadShare: async () => ({ Share: { share } }),
    })
    await expect(s.shareImage({ blob, filename: 'card.png', text: 'GG' })).resolves.toBe('shared')
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'card.png', directory: 'CACHE' }))
    expect(writeFile.mock.calls[0][0].data).toBe(btoa('png'))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/card.png'], text: 'GG' }))
  })

  it('never reports success in the shell when the file could not be shared', async () => {
    const s = createShare({
      native: true,
      loadFilesystem: async () => ({ Filesystem: { writeFile: () => Promise.reject(new Error('disk full')) }, Directory: { Cache: 'CACHE' } }),
      loadShare: async () => ({ Share: { share: vi.fn() } }),
    })
    await expect(s.shareImage({ blob, filename: 'card.png' })).resolves.toBe('unavailable')
  })

  it('shares a file through navigator.share on the web when the browser can', async () => {
    const navShare = vi.fn().mockResolvedValue(undefined)
    const s = createShare({ native: false, nav: { share: navShare, canShare: () => true } })
    await expect(s.shareImage({ blob, filename: 'card.png' })).resolves.toBe('shared')
    const noFiles = createShare({ native: false, nav: { share: navShare, canShare: () => false } })
    await expect(noFiles.shareImage({ blob, filename: 'card.png' })).resolves.toBe('unavailable')
  })
})
