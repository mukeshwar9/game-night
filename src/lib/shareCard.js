// Renders a shareable result card to a canvas in the active retro theme and
// shares it via the Web Share API (file share), falling back to a PNG download.
// No backend — the card is drawn client-side from live CSS theme vars.

function themeColor(name, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return raw ? `rgb(${raw})` : fallback
  } catch {
    return fallback
  }
}

function drawCard({ brand, gameLabel, headline, sub, accentVar }) {
  const S = 1080
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')

  const bg     = themeColor('--c-bg', 'rgb(8,8,16)')
  const text   = themeColor('--c-text', 'rgb(224,224,255)')
  const dim    = themeColor('--c-dim', 'rgb(90,90,138)')
  const border = themeColor('--c-border', 'rgb(30,30,58)')
  const accent = themeColor(accentVar || '--c-cta', 'rgb(255,230,0)')

  // background + frame
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = border
  ctx.lineWidth = 10
  ctx.strokeRect(36, 36, S - 72, S - 72)

  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  for (let y = 0; y < S; y += 4) ctx.fillRect(0, y, S, 2)

  const font = (px) => `${px}px "Press Start 2P", monospace`
  ctx.textAlign = 'center'

  // brand
  ctx.fillStyle = dim
  ctx.font = font(34)
  ctx.fillText(brand.toUpperCase(), S / 2, 150)

  // game label
  ctx.fillStyle = accent
  ctx.font = font(52)
  ctx.fillText(gameLabel.toUpperCase(), S / 2, 300)

  // headline (the result) — glow
  ctx.save()
  ctx.shadowColor = accent
  ctx.shadowBlur = 28
  ctx.fillStyle = text
  ctx.font = font(72)
  wrapText(ctx, headline.toUpperCase(), S / 2, 560, S - 200, 92)
  ctx.restore()

  // sub (score)
  if (sub) {
    ctx.fillStyle = dim
    ctx.font = font(60)
    ctx.fillText(sub, S / 2, 760)
  }

  // footer
  ctx.fillStyle = dim
  ctx.font = font(26)
  ctx.fillText('PLAY AT GAME NIGHT', S / 2, S - 90)

  return canvas
}

function wrapText(ctx, str, x, y, maxWidth, lineHeight) {
  const words = str.split(' ')
  let line = ''
  const lines = []
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const startY = y - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight))
}

export async function shareResult({ gameLabel, headline, sub, accentVar, url }) {
  try { await document.fonts?.ready } catch { /* font fallback is fine */ }

  const canvas = drawCard({ brand: 'Game Night', gameLabel, headline, sub, accentVar })
  const shareUrl = url || window.location.origin
  const text = `${headline} — ${gameLabel} on Game Night. ${shareUrl}`

  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) return

  const file = new File([blob], 'game-night.png', { type: 'image/png' })

  // Prefer native share with the image (mobile share sheet → iMessage/WhatsApp/…)
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: 'Game Night', text })
      return
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }

  // Fallback: download the PNG
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = 'game-night.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000)
}
