import { describe, expect, it } from 'vitest'
import {
  CATEGORY_TRACK, DEFAULT_MUSIC_VOLUME, chordTones, hz, midi, normalizeMusicVolume, parseHits, parseLine,
  resolveMusicOn, roomMusicScene, trackForScene, volumeToGain,
} from './musicLogic'
import { GAME_CATEGORIES } from './games'
import TRACKS from './musicTracks'

describe('note parsing', () => {
  it('maps note names to MIDI and Hz', () => {
    expect(midi('A4')).toBe(69)
    expect(midi('C4')).toBe(60)
    expect(midi('F#5')).toBe(78)
    expect(midi('Bb3')).toBe(58)
    expect(midi('H2')).toBeNull()
    expect(hz(69)).toBe(440)
    expect(hz(81)).toBeCloseTo(880)
  })

  it('parses a line into one entry per step with held lengths', () => {
    expect(parseLine('C5 - - . E5 . G5 -')).toEqual([
      { m: 72, len: 3 }, null, null, null, { m: 76, len: 1 }, null, { m: 79, len: 2 }, null,
    ])
  })

  it('a hold after a rest holds nothing', () => {
    expect(parseLine('C5 . - D5')).toEqual([{ m: 72, len: 1 }, null, null, { m: 74, len: 1 }])
  })

  it('rejects a bad note', () => {
    expect(() => parseLine('C5 X9')).toThrow()
  })

  it('parses drum hits', () => {
    expect(parseHits('x.o. ..x.')).toEqual([1, 0, 0.55, 0, 0, 0, 1, 0])
  })

  it('builds chord tones', () => {
    expect(chordTones('C')).toEqual([48, 52, 55])
    expect(chordTones('Am7', 4)).toEqual([69, 72, 76, 79])
    expect(chordTones('G6')).toEqual([55, 59, 62, 64])
    expect(() => chordTones('Cdim')).toThrow()
  })
})

describe('trackForScene', () => {
  it('plays the lobby loop on menus, theme-flavoured for synthwave and the grid', () => {
    expect(trackForScene('lobby')).toBe('coin')
    expect(trackForScene(undefined, { theme: 'matcha' })).toBe('coin')
    expect(trackForScene('lobby', { theme: 'synthwave' })).toBe('neon')
    expect(trackForScene('lobby', { theme: 'grid' })).toBe('neon')
  })

  it('waiting rooms get the lounge loop', () => {
    expect(trackForScene('wait', { theme: 'synthwave' })).toBe('wait')
  })

  it('in game, picks by category, with a registry override winning', () => {
    expect(trackForScene('game', { category: 'board' })).toBe('think')
    expect(trackForScene('game', { category: 'word' })).toBe('think')
    expect(trackForScene('game', { category: 'reflex' })).toBe('turbo')
    expect(trackForScene('game', { category: 'party' })).toBe('party')
    expect(trackForScene('game', { category: 'reflex', music: 'neon' })).toBe('neon')
    expect(trackForScene('game', {})).toBe('think')
  })

  it('results play the high-score loop, then hand back to the lobby', () => {
    expect(trackForScene('results')).toBe('score')
    expect(trackForScene('results', { resultsDone: true })).toBe('coin')
    expect(trackForScene('results', { resultsDone: true, theme: 'synthwave' })).toBe('neon')
  })

  it('every registry category and every scene maps to a real track', () => {
    for (const { id } of GAME_CATEGORIES) {
      expect(CATEGORY_TRACK[id], id).toBeDefined()
      expect(TRACKS[trackForScene('game', { category: id })]).toBeDefined()
    }
    for (const scene of ['lobby', 'wait', 'results']) {
      expect(TRACKS[trackForScene(scene)]).toBeDefined()
      expect(TRACKS[trackForScene(scene, { theme: 'synthwave', resultsDone: true })]).toBeDefined()
    }
  })
})

describe('roomMusicScene', () => {
  it('follows the room status', () => {
    expect(roomMusicScene(null)).toBeNull()
    expect(roomMusicScene({ status: 'waiting' })).toBe('wait')
    expect(roomMusicScene({ status: 'playing' })).toBe('game')
    expect(roomMusicScene({ status: 'finished' })).toBe('results')
  })
})

describe('preferences', () => {
  it('music defaults on, unless turned off or game sounds are off', () => {
    expect(resolveMusicOn(null, false)).toBe(true)
    expect(resolveMusicOn(null, true)).toBe(false)
    expect(resolveMusicOn('off', false)).toBe(false)
    expect(resolveMusicOn('on', true)).toBe(true)
  })

  it('normalizes a stored volume', () => {
    expect(normalizeMusicVolume(null)).toBe(DEFAULT_MUSIC_VOLUME)
    expect(normalizeMusicVolume('')).toBe(DEFAULT_MUSIC_VOLUME)
    expect(normalizeMusicVolume('abc')).toBe(DEFAULT_MUSIC_VOLUME)
    expect(normalizeMusicVolume('0')).toBe(0)
    expect(normalizeMusicVolume('0.25')).toBe(0.25)
    expect(normalizeMusicVolume(7)).toBe(1)
    expect(normalizeMusicVolume(-1)).toBe(0)
  })

  it('maps volume to gain on a squared curve', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(0.5)).toBe(0.25)
    expect(volumeToGain(1)).toBe(1)
  })
})
