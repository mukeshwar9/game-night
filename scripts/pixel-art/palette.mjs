// Game Night pixel-art house palette. Every sprite draws only from these
// colours (src/lib/pixelArt.test.js enforces it). It extends the PIXEL STICKER
// colours in scripts/make-game-art.mjs (ink #232733, cream #F7E9C4, coral,
// teal…). Hex lives here, outside src/, like make-game-art.mjs: the PNGs are
// fixed-palette binaries, identical in every theme (theming-rules.md).
export const P = {
  // neutrals
  ink: '#232733', ink2: '#3a3f52', slate: '#5b6378', gray: '#9aa0b0', cloud: '#d9dde6', white: '#ffffff',
  stone: '#8f98a8', dstone: '#6a7386', lstone: '#c5ccd8', tile: '#e6e9ef', tiledk: '#aeb6c4', scan: '#171c2e',
  // warm
  cream: '#f7e9c4', lcream: '#fff7df', paper: '#ecdcb2', sand: '#e8c98f', lbrown: '#b8864f', brown: '#9a6a3c', dbrown: '#5e3d24',
  skin: '#f0cfae', dskin: '#d9a57f',
  coral: '#e2604d', lcoral: '#f09482', dcoral: '#b8473a', red: '#d8433a', dred: '#8e2a26',
  orange: '#f08a3c', dorange: '#c4661f', yellow: '#f2c230', lyellow: '#ffe38a', dyellow: '#c8901c',
  // greens
  lime: '#9ed35a', green: '#45a85a', lgreen: '#6cc27a', dgreen: '#2c6e46', ddgreen: '#1f4f33', felt: '#337a4f', moss: '#3f8a5c',
  // blues
  teal: '#3fa7a0', dteal: '#25706c', sea: '#2e8fb0', lsea: '#5bb3cf', dsea: '#1f6488', haze: '#a9d9f3',
  sky: '#7ac4ec', lblue: '#6f97e6', blue: '#3f6fd0', dblue: '#2a4ea0', navy: '#23407a', lnavy: '#3a5c9e',
  space: '#161a3a', lspace: '#2c3170', night: '#0f1128', mazeblue: '#4f6cf0', mazedark: '#1c2470',
  // purples / pinks
  lilac: '#dccbf8', lpurple: '#c3a2ef', purple: '#8b5cc8', dpurple: '#5e3d99', pink: '#ef8fb3', magenta: '#c2417f',
}

export const HOUSE_COLORS = new Set(Object.values(P))
