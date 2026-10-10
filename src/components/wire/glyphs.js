// WIRE CROSSED: base glyph ids that have a mirrored twin (asymmetric left to
// right). The mirror of base glyph b is id 24 + MIRRORABLE.indexOf(b); WireGlyph
// draws it with scaleX(-1). Kept out of WireGlyph.jsx so that file only exports
// a component (fast refresh).
export const MIRRORABLE = [3, 4, 7, 13, 14, 19, 20, 23]
