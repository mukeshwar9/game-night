// The seven background-music loops, original compositions for Game Night.
// Pure data in the pattern language parsed by musicLogic.js, loaded lazily
// with the engine (musicEngine.js) the first time music starts.
//
// Per track: bpm, swing (0..1 of a 16th), lead pulse duty (or `wave` for a
// non-pulse lead), `chords` one per bar, `bass`/`arp` style names the engine
// knows, optional `pad`, `melody` lines (16 steps per bar, see parseLine),
// `drums` (16-step hit strings) and `delay` (echo time in seconds).

import { parseHits, parseLine } from './musicLogic'

const TRACKS = {
  coin: {
    name: 'INSERT COIN', mood: 'Home & game picker', bpm: 118, swing: 0, lead: 0.25,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    bass: 'oct8', arp: 'up16soft',
    melody: [
      'E5 - G5 - C6 - B5 A5 G5 - - - E5 - D5 -',
      'C5 - E5 - A5 - G5 E5 - - - - . . . .',
      'F5 - A5 - C6 - A5 - G5 - F5 - E5 - D5 -',
      'D5 - - - G5 - - - B4 - D5 - G5 - - -',
      'E5 - G5 - C6 - B5 A5 G5 - - - E5 - G5 -',
      'A5 - - - C6 - B5 A5 E5 - - - . . . .',
      'F5 - E5 - D5 - C5 - A4 - C5 - F5 - A5 -',
      'G5 - - - - - . . D6 - C6 - B5 - G5 -',
    ],
    drums: { kick: 'x... .... x... ....', snare: '.... o... .... o...', hat: '..o. ..o. ..o. ..o.' },
  },
  wait: {
    name: 'LOBBY LOUNGE', mood: 'Waiting room — waiting for a friend', bpm: 92, swing: 0.12, lead: 0.5,
    chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
    bass: 'half', arp: 'bell8', pad: true,
    melody: [
      '. . . . A5 - - - G5 - E5 - - - . .',
      '. . . . G5 - - - D5 - - - . . . .',
      '. . . . F5 - - - E5 - C5 - - - . .',
      'E5 - - - - - - - . . . . . . . .',
    ],
    drums: { hat: '..o. ..o. ..o. ..o.', kick: 'x... .... .... ....' },
    delay: 0.28,
  },
  think: {
    name: 'THINK TANK', mood: 'Board, word & memory games — calm, low-attention', bpm: 78, swing: 0, lead: 0.5, wave: 'triangle',
    chords: ['Am7', 'Fmaj7', 'Cmaj7', 'G6'],
    bass: 'whole', arp: 'slow8', pad: true,
    melody: [
      'E5 - - - - - . . C5 - D5 - E5 - - -',
      'A4 - - - - - - - . . . . . . . .',
      'G5 - - - E5 - - - D5 - - - C5 - - -',
      'D5 - - - - - - - - - - - . . . .',
    ],
    drums: {},
    delay: 0.34,
  },
  turbo: {
    name: 'TURBO', mood: 'Reflex & real-time (Pong, Tron, Snake…)', bpm: 150, swing: 0, lead: 0.5,
    chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B'],
    bass: 'drive16', arp: 'none',
    melody: [
      'E5 . E5 . G5 . E5 . B5 - A5 - G5 - F#5 -',
      'E5 - - - . . B4 . E5 . F#5 . G5 . A5 .',
      'G5 . G5 . E5 . G5 . C6 - B5 - G5 - E5 -',
      'F#5 - - - A5 - - - D6 - C6 - A5 - F#5 -',
      'E5 . E5 . G5 . E5 . B5 - A5 - G5 - F#5 -',
      'E5 - - - . . B4 . E5 . G5 . B5 . E6 .',
      'C6 - B5 - G5 - E5 - C6 - B5 - G5 - E5 -',
      'D#6 - - - B5 - - - F#5 - - - D#5 - - -',
    ],
    drums: { kick: 'x... x... x... x...', snare: '.... x... .... x..o', hat: 'o.o. o.o. o.o. o.oo' },
  },
  neon: {
    name: 'NEON DRIVE', mood: 'Synthwave — pairs with SYNTHWAVE / THE GRID themes', bpm: 100, swing: 0, lead: 0.5, wave: 'sawtooth',
    chords: ['Am', 'F', 'C', 'G'],
    bass: 'pulse8', arp: 'saw16', pad: true,
    melody: [
      'E5 - - - - - - - A5 - - - G5 - E5 -',
      'F5 - - - - - - - C5 - - - . . . .',
      'G5 - - - - - E5 - G5 - - - C6 - - -',
      'B5 - - - - - - - - - - - . . . .',
    ],
    drums: { kick: 'x... x... x... x...', snare: '.... x... .... x...', hat: '..x. ..x. ..x. ..x.' },
    delay: 0.3,
  },
  party: {
    name: 'PARTY NIGHT', mood: 'Party games (3–8 players) & game-night mode', bpm: 124, swing: 0.2, lead: 0.125,
    chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'C', 'D'],
    bass: 'bounce', arp: 'stab',
    melody: [
      'B5 . D6 . B5 . G5 . A5 . B5 . . . D5 .',
      'G5 . . . E5 . G5 . B5 - - - . . . .',
      'C6 . B5 . A5 . G5 . E5 . G5 . A5 . . .',
      'F#5 . G5 . A5 . D6 . . . C6 . B5 . A5 .',
      'B5 . D6 . B5 . G5 . A5 . B5 . . . D5 .',
      'G5 . . . E5 . G5 . B5 . E6 . D6 . B5 .',
      'C6 . . . E6 . . . D6 . C6 . B5 . A5 .',
      'G5 - - - D5 - - - G5 . . . . . . .',
    ],
    drums: { kick: 'x... ..x. x... ..x.', snare: '.... x... .... x...', hat: 'x.x. x.x. x.x. x.x.' },
  },
  score: {
    name: 'HIGH SCORE', mood: 'Results / round-end panel', bpm: 104, swing: 0, lead: 0.25,
    chords: ['C', 'F', 'G', 'C'],
    bass: 'oct8', arp: 'up16soft',
    melody: [
      'C5 . E5 . G5 . C6 - - - B5 . C6 . D6 .',
      'C6 - - - A5 - - - F5 - A5 - C6 - - -',
      'D6 - - - B5 - - - G5 - B5 - D6 - F6 -',
      'E6 - - - - - - - G5 . . . C6 . . .',
    ],
    drums: { kick: 'x... .... x... ....', snare: '.... x... .... x.x.', hat: '..o. ..o. ..o. ..o.' },
  },
}

// Parsed once: melody lines, drum hit lists, loop length.
for (const t of Object.values(TRACKS)) {
  t.lines = t.melody.map(parseLine)
  t.hits = Object.fromEntries(Object.entries(t.drums).map(([k, v]) => [k, parseHits(v)]))
  t.bars = Math.max(t.chords.length, t.melody.length)
  t.seconds = t.bars * 16 * (60 / t.bpm / 4)
}

export default TRACKS
