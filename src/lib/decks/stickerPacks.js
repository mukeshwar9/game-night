// Bundled sticker packs — WhatsApp-style sticker trays shipped with the app.
// WhatsApp/iMessage packs live inside those apps' sandboxes and are NOT
// readable cross-app, so the game ships its own: SVG files under
// public/stickers/<packId>/ (transparent, chunky outlines, readable at 44px).
// Users extend this with their own images via the Create tile (file/paste),
// which travel as data: URLs through the same reaction channel.

export const STICKER_PACKS = [
  {
    id: 'party',
    name: 'PARTY',
    items: [
      '/stickers/party/hug.svg',
      '/stickers/party/gg.svg',
      '/stickers/party/lol.svg',
      '/stickers/party/heart.svg',
      '/stickers/party/star.svg',
      '/stickers/party/fire.svg',
      '/stickers/party/cat.svg',
      '/stickers/party/ghost.svg',
    ],
  },
]

export function packStickerSet() {
  return new Set(STICKER_PACKS.flatMap((pack) => pack.items))
}
