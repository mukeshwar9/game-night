// Minigolf seat presentation shared by the local and online pages. Seats are
// never told apart by colour alone: each carries a shape glyph too.
export const SEAT_GLYPHS = ['●', '▲', '■', '◆']
export const SEAT_TOKENS = ['p1', 'p2', 'p3', 'p4']
export const MAX_GOLFERS = 4

/** CSS colour for a seat's token, with optional alpha. */
export const seatColor = (seat, alpha = 1) => `rgb(var(--c-${SEAT_TOKENS[seat % 4]}) / ${alpha})`
