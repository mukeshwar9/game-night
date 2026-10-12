// Renders one drawing of one scene: `frame` picks the boil (every drawing re-wobbles the torn
// edges and grain, motion advances on 2s like animate at 24 fps), `phase` (0..1) the point of the
// scene's loop.
function drawTile(type, frame, phase) {
  const draw = SCENES[type];
  if (!draw) throw new Error('no cut-paper scene for ' + type);
  ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  F = frame * 2; B = frame; TT = phase;
  ctx.save();
  draw(OWN_BEAT.has(type) ? phase : beat(phase));
  ctx.restore();
  STYLE.post();
}
// The still: the drawing of the loop that STILL_PHASE names (CUT_PAPER_STILL_AT, the key pose at 0 unless listed).
window.renderStill = (type, loopFrames, px, quality) => {
  const frame = Math.round((STILL_PHASE[type] ?? 0) * loopFrames) % loopFrames;
  const out = document.createElement('canvas');
  out.width = out.height = px;
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  drawTile(type, frame, frame / loopFrames);
  o.drawImage(canvas, 0, 0, px, px);
  return out.toDataURL('image/webp', quality).split(',')[1];
};
// `frames` drawings side by side at `px` each, as a base64 WebP.
window.renderStrip = (type, frames, px, quality) => {
  const out = document.createElement('canvas');
  out.width = px * frames; out.height = px;
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  for (let i = 0; i < frames; i++) {
    drawTile(type, i, i / frames);
    o.drawImage(canvas, i * px, 0, px, px);
  }
  return out.toDataURL('image/webp', quality).split(',')[1];
};
window.sceneTypes = () => Object.keys(SCENES);
