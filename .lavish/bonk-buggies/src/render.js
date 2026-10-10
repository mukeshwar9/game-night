// BONK BUGGIES prototype renderer: canvas, colours read from the theme tokens.
var BonkRender = (function (S) {
  'use strict'
  var TAU = Math.PI * 2
  var SEATS = ['p1', 'p2', 'p3', 'p4']

  function readPalette(el) {
    var cs = getComputedStyle(el), out = {}
    ;['c-p1', 'c-p2', 'c-p3', 'c-p4', 'c-cta', 'c-win', 'c-danger', 'c-text', 'c-bg', 'c-card', 'c-structure', 'c-border',
      's-sky-1', 's-sky-2', 's-sun', 's-far', 's-rock-1', 's-rock-2', 's-moss', 's-water', 's-foam', 's-wood', 's-tyre', 's-steel', 's-lid']
      .forEach(function (k) { out[k.replace(/^[cs]-/, '').replace(/-/g, '')] = (cs.getPropertyValue('--' + k) || '128 128 128').trim().split(/\s+/).map(Number) })
    var lum = (0.299 * out.bg[0] + 0.587 * out.bg[1] + 0.114 * out.bg[2]) / 255
    out.night = lum < 0.45
    var host = el.closest('[data-theme]'), th = host ? host.dataset.theme : ''
    if (th.indexOf('glass') !== 0) derive(out)
    return out
  }
  // The scene (sky, rock, water) is derived from a theme's ordinary --c-* tokens, so every
  // Game Night theme gets an arena without new per-theme colours. GLASS and GLASS NIGHT keep
  // hand-tuned --s-* values.
  var SCENE = ['sky1', 'sky2', 'sun', 'far', 'rock1', 'rock2', 'moss', 'water', 'foam', 'wood', 'tyre', 'steel', 'lid']
  function derive(o) {
    var W_ = [255, 255, 255], K_ = [0, 0, 0]
    if (o.night) {
      o.sky1 = mix(o.bg, K_, 0.25); o.sky2 = mix(o.bg, o.p3, 0.34); o.sun = mix(o.text, o.cta, 0.15); o.far = mix(o.bg, o.structure, 0.5)
      o.rock1 = mix(o.structure, o.bg, 0.1); o.rock2 = mix(o.structure, o.bg, 0.62); o.moss = o.win; o.water = mix(o.p1, o.bg, 0.5)
      o.foam = mix(o.text, o.p1, 0.2); o.wood = mix(o.cta, o.bg, 0.5); o.tyre = mix(o.bg, K_, 0.4); o.steel = mix(o.structure, o.text, 0.35); o.lid = o.text
    } else {
      o.sky1 = mix(o.bg, o.p4, 0.34); o.sky2 = mix(o.bg, o.cta, 0.2); o.sun = mix(o.card, o.cta, 0.12); o.far = mix(o.bg, o.structure, 0.75)
      o.rock1 = mix(o.structure, o.text, 0.3); o.rock2 = mix(o.structure, o.text, 0.72); o.moss = o.win; o.water = mix(o.p4, o.text, 0.12)
      o.foam = o.card; o.wood = mix(o.cta, o.structure, 0.35); o.tyre = mix(o.text, K_, 0.3); o.steel = mix(o.structure, W_, 0.2); o.lid = o.card
    }
    o.derived = true
  }
  function sceneVars(o) { var out = {}; ['sky-1', 'sky-2', 'sun', 'far', 'rock-1', 'rock-2', 'moss', 'water', 'foam', 'wood', 'tyre', 'steel', 'lid'].forEach(function (k, i) { out['--s-' + k] = o[SCENE[i]].join(' ') }); return out }
  function rgb(t, a) { return 'rgb(' + t[0] + ' ' + t[1] + ' ' + t[2] + ' / ' + (a == null ? 1 : a) + ')' }
  function mix(a, b, k) { return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)] }
  var WHITE = [255, 255, 255], BLACK = [0, 0, 0]

  function path(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
  }

  function make(canvas) {
    var ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = 1, k = 1
    function resize() {
      var r = canvas.getBoundingClientRect()
      dpr = Math.min(3, window.devicePixelRatio || 1)
      W = Math.max(10, r.width); H = Math.max(10, r.height)
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      k = W / S.VIEW.w
    }
    function world(cam) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.translate(W / 2 + (cam.sx || 0), H / 2 + (cam.sy || 0))
      ctx.scale(k * cam.z, -k * cam.z)
      ctx.translate(-cam.x, -cam.y)
    }

    function sky(pal, cam, time) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      var g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, rgb(pal.sky1)); g.addColorStop(0.72, rgb(pal.sky2)); g.addColorStop(1, rgb(mix(pal.sky2, pal.water, 0.35)))
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      var px = -(cam.x) * k * 0.12, sx = W * 0.72 + px, sy = H * 0.3
      var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55)
      sg.addColorStop(0, rgb(pal.sun, pal.night ? 0.3 : 0.75)); sg.addColorStop(0.12, rgb(pal.sun, pal.night ? 0.16 : 0.4)); sg.addColorStop(1, rgb(pal.sun, 0))
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = rgb(pal.sun, 0.95); ctx.beginPath(); ctx.arc(sx, sy, H * 0.055, 0, TAU); ctx.fill()
      if (pal.night) {
        ctx.fillStyle = rgb(pal.sky1, 0.9); ctx.beginPath(); ctx.arc(sx + H * 0.025, sy - H * 0.012, H * 0.048, 0, TAU); ctx.fill()
        for (var i = 0; i < 46; i++) {
          var tw = 0.35 + 0.65 * Math.abs(Math.sin(time * (0.6 + (i % 5) * 0.23) + i * 1.7))
          ctx.fillStyle = rgb(pal.foam, 0.55 * tw)
          ctx.fillRect(((i * 97.3) % W + px * 0.3 + W) % W, (i * 53.9) % (H * 0.62), i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1)
        }
      }
      // clouds
      for (var c = 0; c < 4; c++) {
        var cx = ((c * 0.31 * W + time * (4 + c * 1.7) + px * 0.6) % (W + 160) + W + 160) % (W + 160) - 80, cy = H * (0.12 + 0.11 * c)
        ctx.fillStyle = rgb(pal.night ? pal.far : WHITE, pal.night ? 0.5 : 0.55 - c * 0.07)
        for (var b = 0; b < 4; b++) { ctx.beginPath(); ctx.ellipse(cx + (b - 1.5) * 18, cy + (b % 2) * 4, 22 - b * 2, 9 - (b % 2) * 2, 0, 0, TAU); ctx.fill() }
      }
      // distant sea stacks and a lighthouse, slow parallax
      var hz = H * 0.8 + cam.y * 0, far = pal.far
      ctx.fillStyle = rgb(far, 0.85)
      var stacks = [[0.08, 0.2, 0.09], [0.2, 0.11, 0.05], [0.47, 0.15, 0.07], [0.86, 0.24, 0.1], [0.97, 0.12, 0.06]]
      stacks.forEach(function (s) {
        var x = s[0] * W + px * 1.6, w = s[2] * W, h = s[1] * H
        ctx.beginPath(); ctx.moveTo(x - w, hz + 40); ctx.lineTo(x - w * 0.8, hz - h * 0.55)
        ctx.quadraticCurveTo(x - w * 0.3, hz - h * 1.05, x + w * 0.15, hz - h); ctx.quadraticCurveTo(x + w * 0.7, hz - h * 0.7, x + w, hz + 40); ctx.fill()
      })
      var lx = 0.47 * W + px * 1.6, lh = 0.15 * H
      ctx.fillStyle = rgb(mix(far, WHITE, 0.45), 0.9); ctx.fillRect(lx - 2.5, hz - lh - 15, 5, 15)
      ctx.fillStyle = rgb(pal.danger, 0.75); ctx.fillRect(lx - 2.5, hz - lh - 10, 5, 3)
      var beam = (Math.sin(time * 1.1) + 1) / 2
      ctx.fillStyle = rgb(pal.sun, 0.25 + 0.75 * beam); ctx.beginPath(); ctx.arc(lx, hz - lh - 17, 2.6, 0, TAU); ctx.fill()
      if (pal.night) {
        ctx.fillStyle = rgb(pal.sun, 0.1 * beam); ctx.beginPath(); ctx.moveTo(lx, hz - lh - 17)
        ctx.lineTo(lx - W * 0.6 * Math.cos(time * 0.55), hz - lh - 60); ctx.lineTo(lx - W * 0.6 * Math.cos(time * 0.55), hz - lh + 10); ctx.fill()
      }
      // gulls
      ctx.strokeStyle = rgb(pal.text, 0.5); ctx.lineWidth = 1.2; ctx.lineCap = 'round'
      for (var gI = 0; gI < 3; gI++) {
        var gx = ((time * (13 + gI * 4) + gI * 150) % (W + 60)) - 30, gy = H * (0.16 + 0.07 * gI) + Math.sin(time * 1.4 + gI) * 5, fl = Math.sin(time * 7 + gI * 2) * 2.4
        ctx.beginPath(); ctx.moveTo(gx - 5, gy - fl); ctx.quadraticCurveTo(gx - 2, gy - 2.5, gx, gy); ctx.quadraticCurveTo(gx + 2, gy - 2.5, gx + 5, gy - fl); ctx.stroke()
      }
    }

    function waveY(x, level, time, ph) {
      return level + 0.07 * Math.sin(x * 1.7 + time * 1.9 + ph) + 0.04 * Math.sin(x * 3.9 - time * 1.3 + ph * 2)
    }
    function water(pal, st, time, back) {
      var lv = st.water + (back ? 0.1 : 0), x0 = -19, x1 = 19, ph = back ? 2.1 : 0
      ctx.beginPath(); ctx.moveTo(x0, S.VIEW.y0 - 9)
      for (var x = x0; x <= x1 + 0.01; x += 0.25) ctx.lineTo(x, waveY(x, lv, time, ph))
      ctx.lineTo(x1, S.VIEW.y0 - 9); ctx.closePath()
      var g = ctx.createLinearGradient(0, lv, 0, lv - 4)
      if (back) { g.addColorStop(0, rgb(mix(pal.water, pal.sky2, 0.35), 0.9)); g.addColorStop(1, rgb(pal.water, 0.95)) }
      else { g.addColorStop(0, rgb(mix(pal.water, pal.foam, 0.25), 0.5)); g.addColorStop(0.2, rgb(pal.water, 0.62)); g.addColorStop(1, rgb(mix(pal.water, BLACK, 0.45), 0.9)) }
      ctx.fillStyle = g; ctx.fill()
      if (back) return
      ctx.beginPath()
      for (x = x0; x <= x1 + 0.01; x += 0.25) { var y = waveY(x, lv, time, ph); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
      ctx.strokeStyle = rgb(pal.foam, 0.9); ctx.lineWidth = 0.06; ctx.stroke()
      ctx.strokeStyle = rgb(pal.foam, 0.22); ctx.lineWidth = 0.035
      for (var i = 0; i < 14; i++) {
        var sx = ((i * 2.3 + time * (0.3 + (i % 3) * 0.12)) % 32) - 16, sy = lv - 0.25 - (i % 4) * 0.33
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 0.5 + (i % 3) * 0.2, sy); ctx.stroke()
      }
    }

    function terrain(pal, st) {
      var rockG = ctx.createLinearGradient(0, 5.2, 0, 0.2)
      rockG.addColorStop(0, rgb(pal.rock1)); rockG.addColorStop(1, rgb(pal.rock2))
      st.geo.solids.forEach(function (s, si) {
        if (s.cave) {
          ctx.beginPath(); ctx.rect(-22, -10, 44, 30)
          ctx.moveTo(s.pts[0][0], s.pts[0][1]); for (var i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]); ctx.closePath()
          var cg = ctx.createLinearGradient(0, 8.4, 0, -0.6); cg.addColorStop(0, rgb(mix(pal.rock1, pal.rock2, 0.3))); cg.addColorStop(1, rgb(pal.rock2))
          ctx.fillStyle = cg; ctx.fill('evenodd')
          ctx.save(); ctx.clip('evenodd'); strata(pal, 99); ctx.restore()
          path(ctx, s.pts); ctx.strokeStyle = rgb(mix(pal.rock2, BLACK, 0.45)); ctx.lineWidth = 0.09; ctx.lineJoin = 'round'; ctx.stroke()
          ctx.beginPath(); var on = false
          s.pts.forEach(function (p) { if (p[1] < 2.2) { if (!on) { ctx.moveTo(p[0], p[1] - 0.03); on = true } else ctx.lineTo(p[0], p[1] - 0.03) } })
          ctx.strokeStyle = rgb(pal.moss); ctx.lineWidth = 0.13; ctx.lineCap = 'round'; ctx.stroke()
          return
        }
        path(ctx, s.pts)
        if (s.post) { ctx.fillStyle = rgb(pal.steel); ctx.fill(); ctx.strokeStyle = rgb(mix(pal.steel, BLACK, 0.5)); ctx.lineWidth = 0.05; ctx.stroke(); return }
        ctx.fillStyle = rockG; ctx.fill()
        ctx.save(); ctx.clip(); strata(pal, si)
        // light from the upper left
        var hl = ctx.createLinearGradient(-6, 6, 4, 0); hl.addColorStop(0, rgb(WHITE, 0.16)); hl.addColorStop(0.5, rgb(WHITE, 0)); hl.addColorStop(1, rgb(BLACK, 0.2))
        ctx.fillStyle = hl; ctx.fillRect(-14, -4, 28, 14); ctx.restore()
        path(ctx, s.pts); ctx.strokeStyle = rgb(mix(pal.rock2, BLACK, 0.45)); ctx.lineWidth = 0.06; ctx.lineJoin = 'round'; ctx.stroke()
        var n = s.pts.top || 7
        ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1] - 0.04)
        for (var j = 1; j < n; j++) ctx.lineTo(s.pts[j][0], s.pts[j][1] - 0.04)
        ctx.strokeStyle = rgb(pal.moss); ctx.lineWidth = 0.16; ctx.lineCap = 'round'; ctx.stroke()
        ctx.strokeStyle = rgb(mix(pal.moss, WHITE, 0.35), 0.9); ctx.lineWidth = 0.035
        ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1] + 0.03); for (j = 1; j < n; j++) ctx.lineTo(s.pts[j][0], s.pts[j][1] + 0.03); ctx.stroke()
        // grass tufts
        ctx.strokeStyle = rgb(mix(pal.moss, BLACK, 0.15)); ctx.lineWidth = 0.03
        for (j = 2; j < n - 1; j += 3) { var p = s.pts[j]; ctx.beginPath(); ctx.moveTo(p[0] - 0.05, p[1]); ctx.lineTo(p[0] - 0.1, p[1] + 0.14); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 0.02, p[1] + 0.18); ctx.moveTo(p[0] + 0.05, p[1]); ctx.lineTo(p[0] + 0.12, p[1] + 0.13); ctx.stroke() }
      })
      st.planks.forEach(function (pk) {
        var p = pk.body.getPosition()
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(pk.body.getAngle())
        var g = ctx.createLinearGradient(0, pk.th / 2, 0, -pk.th / 2); g.addColorStop(0, rgb(mix(pal.wood, WHITE, 0.25))); g.addColorStop(1, rgb(mix(pal.wood, BLACK, 0.3)))
        ctx.fillStyle = g; ctx.strokeStyle = rgb(mix(pal.wood, BLACK, 0.6)); ctx.lineWidth = 0.04
        ctx.beginPath(); ctx.roundRect(-pk.len / 2, -pk.th / 2, pk.len, pk.th, 0.07); ctx.fill(); ctx.stroke()
        ctx.strokeStyle = rgb(mix(pal.wood, BLACK, 0.45), 0.6); ctx.lineWidth = 0.02
        for (var x = -pk.len / 2 + 0.7; x < pk.len / 2; x += 0.7) { ctx.beginPath(); ctx.moveTo(x, -pk.th / 2); ctx.lineTo(x, pk.th / 2); ctx.stroke() }
        ctx.restore()
        ctx.fillStyle = rgb(pal.steel); ctx.beginPath(); ctx.arc(pk.px, pk.py, 0.09, 0, TAU); ctx.fill()
      })
    }
    function strata(pal, seed) {
      ctx.strokeStyle = rgb(mix(pal.rock2, BLACK, 0.25), 0.55); ctx.lineWidth = 0.035
      for (var y = -2.1; y < 9; y += 0.42) {
        ctx.beginPath()
        for (var x = -13; x <= 13; x += 0.5) { var yy = y + 0.07 * Math.sin(x * 1.3 + y * 2 + seed) + 0.03 * Math.sin(x * 4.1 + seed); if (x === -13) ctx.moveTo(x, yy); else ctx.lineTo(x, yy) }
        ctx.stroke()
      }
      ctx.fillStyle = rgb(mix(pal.rock1, WHITE, 0.3), 0.35)
      for (var i = 0; i < 110; i++) ctx.fillRect(((i * 7.31 + seed) % 24) - 12, (i * 3.77) % 8, 0.07, 0.05)
    }

    function wheel(pal, w, seat, cam) {
      var p = w.getPosition(), r = S.WHEEL.r
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(w.getAngle())
      ctx.fillStyle = rgb(pal.tyre); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill()
      ctx.strokeStyle = rgb(mix(pal.tyre, WHITE, 0.28)); ctx.lineWidth = 0.035
      for (var i = 0; i < 12; i++) { var a = i * TAU / 12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); ctx.stroke() }
      var g = ctx.createRadialGradient(-0.04, 0.05, 0.01, 0, 0, r * 0.6); g.addColorStop(0, rgb(mix(pal.steel, WHITE, 0.6))); g.addColorStop(1, rgb(mix(pal.steel, BLACK, 0.25)))
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.58, 0, TAU); ctx.fill()
      ctx.strokeStyle = rgb(mix(pal.steel, BLACK, 0.55)); ctx.lineWidth = 0.035
      for (i = 0; i < 5; i++) { a = i * TAU / 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); ctx.stroke() }
      ctx.fillStyle = rgb(pal[seat]); ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill()
      ctx.restore()
    }

    function car(pal, c, st, time) {
      var seat = SEATS[c.i], base = pal[seat], ch = c.chassis, p = ch.getPosition(), ang = ch.getAngle(), d = c.dir
      var dead = !c.alive
      var w0 = ch.getLocalPoint(c.wheels[0].getPosition()), w1 = ch.getLocalPoint(c.wheels[1].getPosition())
      // suspension arms (under the hull)
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang)
      ctx.strokeStyle = rgb(mix(pal.steel, BLACK, 0.4)); ctx.lineWidth = 0.07; ctx.lineCap = 'round'
      ;[w0, w1].forEach(function (w) { ctx.beginPath(); ctx.moveTo(w.x * 0.72, -0.02); ctx.lineTo(w.x, w.y); ctx.stroke() })
      ctx.strokeStyle = rgb(pal.cta, 0.9); ctx.lineWidth = 0.035
      ;[w0, w1].forEach(function (w) { ctx.beginPath(); ctx.moveTo(w.x, 0.05); ctx.lineTo(w.x, w.y + 0.05); ctx.stroke() })
      ctx.restore()
      wheel(pal, c.wheels[0], seat); wheel(pal, c.wheels[1], seat)

      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.scale(d, 1)
      if (dead) ctx.globalAlpha = 0.82
      // hop flame
      if (c.hopFx > 0) {
        var f = c.hopFx / 0.28
        ctx.fillStyle = rgb(pal.cta, 0.9 * f); ctx.beginPath(); ctx.moveTo(-0.5, -0.12); ctx.lineTo(0, -0.12 - 1.1 * f); ctx.lineTo(0.5, -0.12); ctx.fill()
        ctx.fillStyle = rgb(WHITE, 0.85 * f); ctx.beginPath(); ctx.moveTo(-0.22, -0.12); ctx.lineTo(0, -0.12 - 0.6 * f); ctx.lineTo(0.22, -0.12); ctx.fill()
      }
      // antenna and pennant (shape is the seat's non-colour cue)
      var sway = Math.max(-0.5, Math.min(0.5, -ch.getAngularVelocity() * 0.05 - ch.getLinearVelocity().x * d * 0.035)) + Math.sin(time * 9 + c.i) * 0.03
      var ax = -0.72, ay = 0.22, tx = ax + Math.sin(sway) * 0.62, ty = ay + Math.cos(sway) * 0.62
      ctx.strokeStyle = rgb(pal.tyre); ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax, ay + 0.35, tx, ty); ctx.stroke()
      ctx.fillStyle = rgb(base); ctx.strokeStyle = rgb(mix(base, BLACK, 0.5)); ctx.lineWidth = 0.025
      ctx.beginPath()
      if (c.i === 0) { ctx.moveTo(tx, ty); ctx.lineTo(tx - 0.3, ty - 0.1); ctx.lineTo(tx, ty - 0.2); ctx.closePath() }
      else if (c.i === 1) ctx.arc(tx - 0.12, ty - 0.1, 0.11, 0, TAU)
      else if (c.i === 2) ctx.rect(tx - 0.24, ty - 0.2, 0.2, 0.2)
      else { ctx.moveTo(tx, ty - 0.1); ctx.lineTo(tx - 0.13, ty); ctx.lineTo(tx - 0.26, ty - 0.1); ctx.lineTo(tx - 0.13, ty - 0.2); ctx.closePath() }
      ctx.fill(); ctx.stroke()

      // driver torso
      ctx.fillStyle = rgb(mix(base, BLACK, 0.55)); ctx.beginPath(); ctx.roundRect(S.HEAD.x - 0.15, 0.16, 0.3, 0.24, 0.07); ctx.fill()
      // hull
      ctx.shadowColor = 'rgb(0 0 0 / .32)'; ctx.shadowBlur = 5 * dpr; ctx.shadowOffsetY = 2.5 * dpr
      var g = ctx.createLinearGradient(0, 0.26, 0, -0.14)
      g.addColorStop(0, rgb(mix(base, WHITE, dead ? 0.1 : 0.42))); g.addColorStop(0.45, rgb(dead ? mix(base, pal.tyre, 0.45) : base)); g.addColorStop(1, rgb(mix(base, BLACK, 0.42)))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.moveTo(-0.82, -0.12); ctx.lineTo(0.8, -0.12); ctx.quadraticCurveTo(0.97, -0.1, 0.94, 0.07); ctx.lineTo(0.44, 0.22)
      ctx.quadraticCurveTo(0.2, 0.26, 0.12, 0.2); ctx.lineTo(-0.42, 0.2); ctx.quadraticCurveTo(-0.5, 0.27, -0.8, 0.25); ctx.quadraticCurveTo(-0.93, 0.2, -0.9, 0); ctx.quadraticCurveTo(-0.9, -0.12, -0.82, -0.12); ctx.closePath()
      ctx.fill(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
      ctx.strokeStyle = rgb(mix(base, BLACK, 0.62)); ctx.lineWidth = 0.04; ctx.lineJoin = 'round'; ctx.stroke()
      // stripe, roundel, bumper, lights
      ctx.strokeStyle = rgb(WHITE, 0.78); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(-0.84, 0.03); ctx.lineTo(0.86, 0.03); ctx.stroke()
      ctx.fillStyle = rgb(WHITE, 0.92); ctx.beginPath(); ctx.arc(0.3, 0.05, 0.1, 0, TAU); ctx.fill()
      ctx.fillStyle = rgb(mix(base, BLACK, 0.5)); for (var q = 0; q <= c.i; q++) ctx.fillRect(0.3 - 0.018 - c.i * 0.022 + q * 0.044, 0.0, 0.03, 0.1)
      ctx.fillStyle = rgb(pal.steel); ctx.beginPath(); ctx.roundRect(0.86, -0.15, 0.12, 0.13, 0.04); ctx.fill()
      ctx.beginPath(); ctx.roundRect(-0.98, -0.13, 0.12, 0.1, 0.04); ctx.fill()
      var lit = c.d * d > 0
      if (lit && !dead) { var lg = ctx.createRadialGradient(0.93, 0.03, 0, 0.93, 0.03, 0.6); lg.addColorStop(0, rgb(pal.sun, 0.55)); lg.addColorStop(1, rgb(pal.sun, 0)); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0.93, 0.03, 0.6, 0, TAU); ctx.fill() }
      ctx.fillStyle = rgb(dead ? pal.steel : pal.sun); ctx.beginPath(); ctx.arc(0.88, 0.04, 0.055, 0, TAU); ctx.fill()
      ctx.fillStyle = rgb(pal.danger, c.d * d < 0 ? 1 : 0.6); ctx.fillRect(-0.92, 0.06, 0.05, 0.1)
      // windscreen
      ctx.strokeStyle = rgb(pal.foam, 0.85); ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(0.22, 0.23); ctx.lineTo(0.12, 0.5); ctx.stroke()
      ctx.fillStyle = rgb(pal.foam, 0.22); ctx.beginPath(); ctx.moveTo(0.22, 0.23); ctx.lineTo(0.12, 0.5); ctx.lineTo(0.06, 0.23); ctx.fill()
      // helmet (the head: the only thing that matters)
      var hr = c.headR, hx = S.HEAD.x, hy = S.HEAD.y + (hr - S.HEAD.r)
      if (!dead || c.out.reason === 'sunk') {
        var hg = ctx.createRadialGradient(hx - hr * 0.3, hy + hr * 0.4, hr * 0.1, hx, hy, hr)
        hg.addColorStop(0, rgb(WHITE)); hg.addColorStop(1, rgb(mix(pal.lid, BLACK, 0.18)))
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill()
        ctx.strokeStyle = rgb(mix(base, BLACK, 0.6)); ctx.lineWidth = 0.035; ctx.stroke()
        ctx.strokeStyle = rgb(base); ctx.lineWidth = hr * 0.34; ctx.beginPath(); ctx.arc(hx, hy, hr * 0.72, 0.9, 2.4); ctx.stroke()
        ctx.fillStyle = rgb(pal.tyre, 0.92); ctx.beginPath(); ctx.moveTo(hx + hr * 0.15, hy + hr * 0.25); ctx.arc(hx, hy, hr * 0.93, 0.28, -0.55, true); ctx.lineTo(hx + hr * 0.15, hy - hr * 0.3); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = rgb(pal.foam, 0.9); ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(hx + hr * 0.45, hy + hr * 0.12); ctx.lineTo(hx + hr * 0.75, hy + hr * 0.02); ctx.stroke()
        if (c.grace > 0) { ctx.strokeStyle = rgb(pal.cta, 0.5 + 0.5 * Math.sin(time * 40)); ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(hx, hy, hr * 1.5, 0, TAU); ctx.stroke() }
        if (c.shield > 0) {
          ctx.fillStyle = rgb(pal.cta); ctx.strokeStyle = rgb(mix(pal.cta, BLACK, 0.5)); ctx.lineWidth = 0.03
          ctx.beginPath(); ctx.arc(hx, hy + hr * 0.15, hr * 1.2, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke()
          ctx.beginPath(); ctx.roundRect(hx - hr * 1.5, hy + hr * 0.05, hr * 3.2, hr * 0.26, 0.03); ctx.fill(); ctx.stroke()
          ctx.fillStyle = rgb(WHITE, 0.55); ctx.beginPath(); ctx.ellipse(hx - hr * 0.4, hy + hr * 0.85, hr * 0.35, hr * 0.14, -0.4, 0, TAU); ctx.fill()
        }
      } else {
        // bonked: dizzy rings where the helmet was
        ctx.strokeStyle = rgb(pal.cta, 0.9); ctx.lineWidth = 0.03
        for (var s = 0; s < 3; s++) { var a = time * 5 + s * TAU / 3; ctx.beginPath(); ctx.arc(hx + Math.cos(a) * 0.22, hy + 0.12 + Math.sin(a) * 0.07, 0.05, 0, TAU); ctx.stroke() }
        ctx.fillStyle = rgb(mix(base, BLACK, 0.55)); ctx.beginPath(); ctx.arc(hx, hy - 0.06, hr * 0.8, 0, TAU); ctx.fill()
      }
      ctx.restore()
    }

    function particles(pal, fx) {
      for (var i = 0; i < fx.parts.length; i++) {
        var q = fx.parts[i], a = Math.max(0, q.life / q.max), col = pal[q.col] || pal.foam
        if (q.type === 'dust' || q.type === 'smoke') {
          ctx.fillStyle = rgb(q.type === 'smoke' ? mix(pal.tyre, pal.steel, 0.4) : mix(pal.rock1, WHITE, 0.45), 0.5 * a)
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.6 - a * 0.8), 0, TAU); ctx.fill()
        } else if (q.type === 'spark') {
          ctx.strokeStyle = rgb(mix(pal.cta, WHITE, 0.5), a); ctx.lineWidth = 0.04
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035); ctx.stroke()
        } else if (q.type === 'drop') {
          ctx.fillStyle = rgb(mix(pal.water, pal.foam, 0.6), 0.9 * a); ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill()
        } else if (q.type === 'ring') {
          ctx.strokeStyle = rgb(col, a); ctx.lineWidth = 0.07 * a + 0.01; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1 - a) + 0.1, 0, TAU); ctx.stroke()
        } else if (q.type === 'star') {
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = rgb(col, a)
          ctx.beginPath(); for (var s = 0; s < 8; s++) { var r = s % 2 ? q.size * 0.4 : q.size, an = s * TAU / 8; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r) } ctx.closePath(); ctx.fill(); ctx.restore()
        } else if (q.type === 'lid') {
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = rgb(col); ctx.strokeStyle = rgb(mix(col, BLACK, 0.5)); ctx.lineWidth = 0.03
          ctx.beginPath(); ctx.arc(0, 0, q.size, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore()
        }
      }
    }

    function draw(st, fx, cam, time, pal) {
      sky(pal, cam, time)
      world(cam)
      water(pal, st, time, true)
      terrain(pal, st)
      for (var i = st.cars.length - 1; i >= 0; i--) car(pal, st.cars[i], st, time)
      particles(pal, fx)
      water(pal, st, time, false)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (fx.flash > 0) { ctx.fillStyle = rgb(WHITE, Math.min(0.55, fx.flash)); ctx.fillRect(0, 0, W, H) }
      var v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75)
      v.addColorStop(0, 'rgb(0 0 0 / 0)'); v.addColorStop(1, 'rgb(0 0 0 / ' + (pal.night ? 0.42 : 0.16) + ')')
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    }

    // A small still of an arena for the pick cards.
    function thumb(cv, arena, pal) {
      var c = cv.getContext('2d'), w = cv.width, h = cv.height, geo = arena.build(), kk = w / (geo.half * 2 + 1.5)
      var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgb(pal.sky1)); g.addColorStop(1, rgb(pal.sky2)); c.fillStyle = g; c.fillRect(0, 0, w, h)
      c.save(); c.translate(w / 2, h); c.scale(kk, -kk); c.translate(0, 0.4)
      geo.solids.forEach(function (s) {
        c.beginPath()
        if (s.cave) c.rect(-12, -2, 24, 14)
        c.moveTo(s.pts[0][0], s.pts[0][1]); for (var i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i][0], s.pts[i][1]); c.closePath()
        c.fillStyle = rgb(pal.rock2); c.fill('evenodd')
      })
      ;(geo.planks || []).forEach(function (p) { c.fillStyle = rgb(pal.wood); c.fillRect(p.x - p.len / 2, p.y - 0.12, p.len, 0.24) })
      c.fillStyle = rgb(pal.water, 0.8); c.fillRect(-12, -2, 24, 2.45)
      c.restore()
    }

    resize()
    return { draw: draw, resize: resize, thumb: thumb }
  }
  return { make: make, readPalette: readPalette, rgb: rgb, sceneVars: sceneVars }
})(BonkSim)
