import { describe, expect, it } from 'vitest'
import TRACKS from './musicTracks'
import { chordTones } from './musicLogic'

// Styles the engine's playStep switch knows (musicEngine.js).
const BASS = ['oct8', 'half', 'whole', 'drive16', 'pulse8', 'bounce']
const ARP = ['up16soft', 'bell8', 'slow8', 'saw16', 'stab', 'none']
const DRUMS = ['kick', 'snare', 'hat']

describe('music tracks', () => {
  it('ships the seven loops', () => {
    expect(Object.keys(TRACKS).sort()).toEqual(['coin', 'neon', 'party', 'score', 'think', 'turbo', 'wait'])
  })

  for (const [id, t] of Object.entries(TRACKS)) {
    describe(id, () => {
      it('has sane tempo, swing and styles', () => {
        expect(t.bpm).toBeGreaterThanOrEqual(60)
        expect(t.bpm).toBeLessThanOrEqual(180)
        expect(t.swing).toBeGreaterThanOrEqual(0)
        expect(t.swing).toBeLessThan(0.5)
        expect(BASS).toContain(t.bass)
        expect(ARP).toContain(t.arp)
        if (!t.wave) expect([0.125, 0.25, 0.5]).toContain(t.lead)
      })

      it('every melody bar is 16 steps of playable notes', () => {
        expect(t.lines.length).toBeGreaterThan(0)
        for (const [bar, line] of t.lines.entries()) {
          expect(line, `bar ${bar}`).toHaveLength(16)
          for (const n of line) {
            if (!n) continue
            expect(n.m).toBeGreaterThanOrEqual(48)
            expect(n.m).toBeLessThanOrEqual(96)
            expect(n.len).toBeGreaterThanOrEqual(1)
          }
        }
      })

      it('melody and chords divide the loop evenly', () => {
        expect(t.bars % t.chords.length).toBe(0)
        expect(t.bars % t.lines.length).toBe(0)
        for (const c of t.chords) expect(() => chordTones(c)).not.toThrow()
      })

      it('drum patterns are 16 steps', () => {
        for (const [kind, hits] of Object.entries(t.hits)) {
          expect(DRUMS).toContain(kind)
          expect(hits).toHaveLength(16)
        }
      })

      it('loops in a reasonable time', () => {
        expect(t.seconds).toBeGreaterThan(5)
        expect(t.seconds).toBeLessThan(40)
      })
    })
  }
})
