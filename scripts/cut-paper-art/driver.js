// Renders one drawing of one scene: `frame` picks the boil (every drawing re-wobbles the torn
// edges and grain), `phase` (0..1) the point of the scene's loop; phase 0 is the key pose.
function drawTile(type, frame, phase) {
  const draw = SCENES[type];
  if (!draw) throw new Error('no cut-paper scene for ' + type);
  ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  F = frame; B = frame; TT = phase;
  ctx.save();
  draw(phase);
  ctx.restore();
  STYLE.post();
}
// `frames` drawings side by side at `px` each, as a base64 WebP.
window.renderStrip = (type, frames, px, quality) => {
  const out = document.createElement('canvas');
  out.width = px * frames; out.height = px;
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  for (let i = 0; i < frames; i++) {
    drawTile(type, i, frames === 1 ? 0 : i / frames);
    o.drawImage(canvas, i * px, 0, px, px);
  }
  return out.toDataURL('image/webp', quality).split(',')[1];
};
window.sceneTypes = () => Object.keys(SCENES);
