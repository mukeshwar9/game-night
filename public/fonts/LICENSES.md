# Font licences

Every font in this folder is licensed under the SIL Open Font License 1.1
(https://openfontlicense.org), which allows self-hosting, bundling and use in a
paid app as long as the fonts are not sold on their own. Each family's licence
field was checked against its METADATA.pb in https://github.com/google/fonts/tree/main/ofl.

Sources:

- Google Fonts families: Press Start 2P, Silkscreen, Pixelify Sans (static and variable), VT323,
  Share Tech Mono, Oxanium, Audiowide, Fredoka, Russo One, Patrick Hand, Jersey 10, Jersey 15,
  Tilt Neon (static and variable), Tilt Warp, Tiny5, Micro 5, Handjet, DotGothic16, Sixtyfour,
  Sixtyfour Convergence, Workbench, Bytesized, Doto, Nabla, Bungee, Bungee Spice, Bungee Shade,
  Monoton, Bitcount Prop Double, Jacquard 12, Coral Pixels, Big Shoulders Display, Chakra Petch,
  Orbitron, Atkinson Hyperlegible Mono and Next (Braille Institute), JetBrains Mono, IBM Plex Mono,
  Space Mono, Geist Mono, Martian Mono, Kode Mono, Lexend, Sometype Mono.
- Departure Mono by Helena Zhang, https://github.com/rektdeckard/departure-mono (font licence SIL OFL 1.1).

Files are Latin-subset woff2. The older TTF faces (Silkscreen, Pixelify Sans, VT323, Share Tech
Mono, Oxanium, Audiowide) were re-saved as Latin woff2 with fontTools, with no change to the
glyph outlines. They load on demand, only when a player picks the font; none is precached.

Colour fonts (Nabla, Bungee Spice, Sixtyfour Convergence) use COLRv1 and draw in one flat colour
in Safari and iOS browsers; the other browsers draw them in colour.
