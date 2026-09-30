import { describe, it, expect } from 'vitest'
import { buildIdFromEntryFile, buildIdFromFiles, parseStackFrames } from './sourcemapLogic'
import { buildIdFromUrl } from './telemetry'

describe('build ids', () => {
  it('matches the id telemetry stamps on error reports', () => {
    for (const file of ['assets/index-AbC12_-9.js', 'assets/index-Zx9_kQ1a.js']) {
      expect(buildIdFromEntryFile(file)).toBe(buildIdFromUrl(`https://x.web.app/${file}`))
    }
  })
  it('finds the id among chunks and maps, and ignores non-entry chunks', () => {
    expect(buildIdFromFiles(['assets/Games-12345678.js.map', 'assets/index-AbC12_-9.js.map'])).toBe('AbC12_-9')
    expect(buildIdFromFiles(['assets/Games-12345678.js'])).toBeNull()
    expect(buildIdFromFiles([])).toBeNull()
    expect(buildIdFromEntryFile('assets/firebase-AbC12_-9.js')).toBeNull()
  })
})

describe('parseStackFrames', () => {
  it('reads V8 frames', () => {
    const [head, frame, anon] = parseStackFrames([
      'TypeError: x is undefined',
      '    at Ne (https://game-night-91464.web.app/assets/Game-AbCd1234.js:1:20345)',
      '    at https://game-night-91464.web.app/assets/index-AbC12_-9.js:2:77',
    ].join('\n'))
    expect(head.file).toBeNull()
    expect(frame).toMatchObject({ file: 'assets/Game-AbCd1234.js', line: 1, col: 20345 })
    expect(anon).toMatchObject({ file: 'assets/index-AbC12_-9.js', line: 2, col: 77 })
  })
  it('reads Safari and Firefox frames', () => {
    const [frame] = parseStackFrames('Ne@https://game-night-91464.web.app/assets/Game-AbCd1234.js:1:20345')
    expect(frame).toMatchObject({ file: 'assets/Game-AbCd1234.js', line: 1, col: 20345 })
  })
  it('keeps unparseable lines in order and tolerates empty input', () => {
    expect(parseStackFrames('plain text')).toEqual([{ raw: 'plain text', file: null, line: 0, col: 0 }])
    expect(parseStackFrames(undefined)).toHaveLength(1)
  })
})
