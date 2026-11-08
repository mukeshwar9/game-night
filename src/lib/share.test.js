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

describe('shareFiles', () => {
  const png = (s) => new Blob([s], { type: 'image/png' })
  const files = [
    { blob: png('one'), filename: 'sketch-collage-1.png' },
    { blob: png('two'), filename: 'sketch-collage-2.png' },
  ]

  it('writes every file to the cache folder and shares all the uris in one sheet in the shell', async () => {
    const writeFile = vi.fn(async ({ path }) => ({ uri: `file:///cache/${path}` }))
    const share = vi.fn().mockResolvedValue({})
    const s = createShare({
      native: true,
      loadFilesystem: async () => ({ Filesystem: { writeFile }, Directory: { Cache: 'CACHE' } }),
      loadShare: async () => ({ Share: { share } }),
    })
    await expect(s.shareFiles({ files, text: 'ALL' })).resolves.toBe('shared')
    expect(writeFile).toHaveBeenCalledTimes(2)
    expect(writeFile.mock.calls.map(([a]) => [a.path, a.data, a.directory])).toEqual([
      ['sketch-collage-1.png', btoa('one'), 'CACHE'],
      ['sketch-collage-2.png', btoa('two'), 'CACHE'],
    ])
    expect(share).toHaveBeenCalledOnce()
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      files: ['file:///cache/sketch-collage-1.png', 'file:///cache/sketch-collage-2.png'],
      text: 'ALL',
    }))
  })

  it('hands every file to navigator.share on the web, with each file\'s name and type', async () => {
    const navShare = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn(() => true)
    const s = createShare({ native: false, nav: { share: navShare, canShare } })
    const pdf = { blob: new Blob(['%PDF'], { type: 'application/pdf' }), filename: 'sketch-drawings.pdf' }
    await expect(s.shareFiles({ files: [...files, pdf], text: 'ALL' })).resolves.toBe('shared')
    const shared = navShare.mock.calls[0][0]
    expect(shared.text).toBe('ALL')
    expect(shared.files.map(f => [f.name, f.type])).toEqual([
      ['sketch-collage-1.png', 'image/png'],
      ['sketch-collage-2.png', 'image/png'],
      ['sketch-drawings.pdf', 'application/pdf'],
    ])
    // canShare is asked about the very same files.
    expect(canShare.mock.calls[0][0].files).toBe(shared.files)
  })

  it('reports unavailable when the browser cannot share these files, or there are none', async () => {
    const navShare = vi.fn()
    const s = createShare({ native: false, nav: { share: navShare, canShare: () => false } })
    await expect(s.shareFiles({ files })).resolves.toBe('unavailable')
    await expect(createShare({ native: false, nav: {} }).shareFiles({ files })).resolves.toBe('unavailable')
    await expect(s.shareFiles({ files: [] })).resolves.toBe('unavailable')
    expect(navShare).not.toHaveBeenCalled()
  })

  it('reports a closed sheet as cancelled, and a failed file write in the shell as unavailable', async () => {
    const cancel = createShare({ native: false, nav: { share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })), canShare: () => true } })
    await expect(cancel.shareFiles({ files })).resolves.toBe('cancelled')
    const broken = createShare({
      native: true,
      loadFilesystem: async () => ({ Filesystem: { writeFile: () => Promise.reject(new Error('disk full')) }, Directory: { Cache: 'CACHE' } }),
      loadShare: async () => ({ Share: { share: vi.fn() } }),
    })
    await expect(broken.shareFiles({ files })).resolves.toBe('unavailable')
  })
})
