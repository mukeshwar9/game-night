// Renders a shareable result card to a canvas in the active retro theme and
// shares it via the Web Share API (file share), falling back to a PNG download.
// No backend — the card is drawn client-side from live CSS theme vars.

import { toast } from 'sonner'
import { getFont, getStoredFont } from './font'

function themeColor(name, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return raw ? `rgb(${raw})` : fallback
  } catch {
    return fallback
  }
}

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image()
  i.onload = () => res(i)
  i.onerror = rej
  i.src = src
})

async function drawCard({ brand, gameLabel, headline, sub, accentVar, url }) {
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

  const fontFamily = getFont(getStoredFont()).family
  const font = (px) => `${px}px "${fontFamily}", monospace`
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
    ctx.fillText(sub, S / 2, 740)
  }

  await drawQrFooter(ctx, { url, S, dim, font, qs: 200 })

  return canvas
}

// Scannable QR footer — turns a shared screenshot into a joinable invite.
// Without a url (or if QR generation fails) it falls back to a text footer.
async function drawQrFooter(ctx, { url, S, dim, font, qs }) {
  if (url) {
    try {
      // qrcode (~23 KB) loads only when a card is actually shared.
      const { default: QRCode } = await import('qrcode')
      const qrUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: 240,
        color: { dark: '#000000', light: '#ffffff' },
      })
      const qr = await loadImage(qrUrl)
      const qx = (S - qs) / 2
      const qy = S - 36 - qs - 70
      // white rounded backing for scan contrast against the dark card
      ctx.fillStyle = '#ffffff'
      roundRect(ctx, qx - 14, qy - 14, qs + 28, qs + 28, 12)
      ctx.fill()
      ctx.drawImage(qr, qx, qy, qs, qs)
      // caption under the QR
      ctx.fillStyle = dim
      ctx.font = font(22)
      ctx.fillText('SCAN TO PLAY', S / 2, qy + qs + 44)
      return
    } catch {
      // QR optional — fall through to the text footer.
    }
  }
  ctx.fillStyle = dim
  ctx.font = font(26)
  ctx.fillText('PLAY AT GAME NIGHT', S / 2, S - 90)
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
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

// Draws the end-of-night recap (report 5.12): a title, a sub line, and up to
// four label/value rows (MVP, MOST WINS, CLOSEST GAME, …) above the same QR
// footer as the result card. Colors come from the live theme tokens.
async function drawRecapCard({ brand, title, sub, rows, url }) {
  const S = 1080
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')

  const bg     = themeColor('--c-bg', 'rgb(8,8,16)')
  const text   = themeColor('--c-text', 'rgb(224,224,255)')
  const dim    = themeColor('--c-dim', 'rgb(90,90,138)')
  const border = themeColor('--c-border', 'rgb(30,30,58)')
  const accent = themeColor('--c-cta', 'rgb(255,230,0)')
  const p1     = themeColor('--c-p1', 'rgb(0,255,255)')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = border
  ctx.lineWidth = 10
  ctx.strokeRect(36, 36, S - 72, S - 72)
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  for (let y = 0; y < S; y += 4) ctx.fillRect(0, y, S, 2)

  const fontFamily = getFont(getStoredFont()).family
  const font = (px) => `${px}px "${fontFamily}", monospace`
  ctx.textAlign = 'center'

  ctx.fillStyle = dim
  ctx.font = font(34)
  ctx.fillText(brand.toUpperCase(), S / 2, 140)

  ctx.save()
  ctx.shadowColor = accent
  ctx.shadowBlur = 28
  ctx.fillStyle = accent
  ctx.font = font(60)
  ctx.fillText(title.toUpperCase(), S / 2, 250)
  ctx.restore()

  if (sub) {
    ctx.fillStyle = dim
    ctx.font = font(30)
    ctx.fillText(sub.toUpperCase(), S / 2, 310)
  }

  const shown = (rows || []).slice(0, 4)
  shown.forEach((row, i) => {
    const y = 400 + i * 100
    ctx.fillStyle = p1
    ctx.font = font(26)
    ctx.fillText(row.label.toUpperCase(), S / 2, y)
    ctx.fillStyle = text
    ctx.font = font(40)
    fitText(ctx, row.value.toUpperCase(), S / 2, y + 48, S - 200, font, 40)
  })
  if (shown.length === 0) {
    ctx.fillStyle = text
    ctx.font = font(44)
    ctx.fillText('NO GAMES YET', S / 2, 520)
  }

  await drawQrFooter(ctx, { url, S, dim, font, qs: 160 })
  return canvas
}

// Single-line text shrunk until it fits `maxWidth` (long names / game labels).
function fitText(ctx, str, x, y, maxWidth, font, px) {
  let size = px
  ctx.font = font(size)
  while (size > 18 && ctx.measureText(str).width > maxWidth) {
    size -= 2
    ctx.font = font(size)
  }
  ctx.fillText(str, x, y)
}

// Hands a rendered card to the native share sheet (file share), falling back
// to a PNG download. Never rejects: true on success (or a user-cancelled share
// sheet), false on a real failure.
async function shareCanvas(canvas, text) {
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) {
    console.error('shareCard: canvas.toBlob returned null')
    return false
  }

  const file = new File([blob], 'game-night.png', { type: 'image/png' })

  // Prefer native share with the image (mobile share sheet → iMessage/WhatsApp/…)
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: 'Game Night', text })
      return true
    } catch (err) {
      // User-cancelled the native share sheet is not a failure — Safari sometimes
      // reports this as NotAllowedError instead of AbortError when dismissed.
      if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return true
      // Any other share failure — fall through to download
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
  toast.success('SAVED IMAGE — CHECK YOUR DOWNLOADS')
  return true
}

// Builds the share card and hands it to the native share sheet (falling back to a
// PNG download). Never rejects — callers can await it directly with no try/catch.
// Returns `true` on success (share completed, or user cancelled the share sheet —
// that's not a failure) or `false` on a real failure (card render/blob/share error),
// which callers should surface with an error toast.
export async function shareResult({ gameLabel, headline, sub, accentVar, url }) {
  try {
    try { await document.fonts?.ready } catch { /* font fallback is fine */ }

    const shareUrl = url || window.location.origin
    const canvas = await drawCard({ brand: 'Game Night', gameLabel, headline, sub, accentVar, url: shareUrl })
    const text = `${headline} — ${gameLabel} on Game Night. ${shareUrl}`
    return await shareCanvas(canvas, text)
  } catch (err) {
    console.error('shareResult failed:', err)
    return false
  }
}

// End-of-night recap card (game-night mode). Same contract as shareResult:
// never rejects; false means a real failure the caller should toast.
//   rows: [{ label, value }] — up to four are drawn.
export async function shareRecap({ title, sub, rows, url }) {
  try {
    try { await document.fonts?.ready } catch { /* font fallback is fine */ }

    const shareUrl = url || window.location.origin
    const canvas = await drawRecapCard({ brand: 'Game Night', title, sub, rows, url: shareUrl })
    const lines = (rows || []).map(r => `${r.label}: ${r.value}`).join(' · ')
    const text = `${title}${sub ? ` (${sub})` : ''} — ${lines} on Game Night. ${shareUrl}`
    return await shareCanvas(canvas, text)
  } catch (err) {
    console.error('shareRecap failed:', err)
    return false
  }
}
