// BONK BUGGIES prototype: match flow, input, effects, sound. Page code only.
var BonkGame = (function (S, R) {
  'use strict'
  var DT = 1 / 60, TARGET = 5
  var NAMES = ['YOU', 'BOT', 'BOT 2', 'BOT 3']
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function mount(root) {
    var $ = function (s) { return root.querySelector(s) }, $$ = function (s) { return [].slice.call(root.querySelectorAll(s)) }
    var canvas = $('canvas.arena'), view = R.make(canvas), pal = R.readPalette(root)
    var cfg = { mode: 'bot', level: 'normal', hop: true, lid: true, pick: true, wild: false, arena: 'auto' }
    var st = null, phase = 'menu', score = [0, 0], round = 0, bots = [], humans = [0], nextArena = null, lastArena = null
    var keys = [{ l: 0, r: 0 }, { l: 0, r: 0 }], timer = 0, acc = 0, scale = 1, stop = 0, last = 0, time = 0, firstOut = -1, mutator = 'none'
    var fx = { parts: [], flash: 0, shake: 0 }, cam = { x: 0, y: 6.6, z: 0.66, sx: 0, sy: 0 }, focus = null
    var visible = true, muted = false, ac = null, pickTimer = 0, holdAt = null, lastTide = '', lastHop = [1, 1]

    // ── sound ──
    function tone(f0, f1, dur, type, vol) {
      if (muted || !ac) return
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
      g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02)
    }
    function noise(dur, vol, freq) {
      if (muted || !ac) return
      var n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0)
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain()
      f.type = 'lowpass'; f.frequency.value = freq || 900; g.gain.value = vol || 0.12
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(ac.destination); s.start()
    }
    function wake() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { ac = null } } if (ac && ac.state === 'suspended') ac.resume() }

    // ── particles ──
    function emit(type, x, y, n, o) {
      o = o || {}
      for (var i = 0; i < n && fx.parts.length < 260; i++) {
        var a = (o.a0 != null ? o.a0 : 0) + Math.random() * (o.spread != null ? o.spread : Math.PI * 2), sp = (o.speed || 2) * (0.4 + Math.random() * 0.8)
        fx.parts.push({ type: type, x: x + (Math.random() - 0.5) * (o.jit || 0.1), y: y + (Math.random() - 0.5) * (o.jit || 0.1), vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0),
          life: o.life || 0.5, max: o.life || 0.5, size: (o.size || 0.1) * (0.6 + Math.random() * 0.8), col: o.col, rot: Math.random() * 6, g: o.g != null ? o.g : 0, spin: (Math.random() - 0.5) * 12 })
      }
    }
    function stepParts(dt) {
      for (var i = fx.parts.length - 1; i >= 0; i--) {
        var q = fx.parts[i]; q.life -= dt
        if (q.life <= 0) { fx.parts.splice(i, 1); continue }
        q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.spin * dt
        if (q.type === 'dust' || q.type === 'smoke') { q.vx *= 0.94; q.vy *= 0.94 }
      }
    }

    // ── round flow ──
    function seats() { return cfg.mode === 'melee' ? 4 : 2 }
    function pickArena() {
      var id = nextArena || (cfg.arena !== 'auto' ? cfg.arena : null)
      if (!id) { var pool = S.ARENAS.filter(function (a) { return a.id !== lastArena }); id = pool[Math.floor(Math.random() * pool.length)].id }
      nextArena = null; lastArena = id; return id
    }
    function newMatch() {
      wake()
      var n = seats(); score = []; for (var i = 0; i < n; i++) score.push(0)
      humans = cfg.mode === 'two' ? [0, 1] : [0]
      round = 0; lastArena = null; nextArena = null
      root.dataset.mode = cfg.mode
      buildCards(); newRound()
    }
    function newRound() {
      round++
      var n = seats(), top = Math.max.apply(null, score)
      mutator = (cfg.wild && round > 1 && Math.random() < 0.65) ? ['moon', 'ice', 'bighead', 'turbo'][Math.floor(Math.random() * 4)] : 'none'
      st = S.createRound({ arena: pickArena(), n: n, hop: cfg.hop, mutator: mutator, flip: round % 2 === 0, swap: round % 2 === 0, shields: score.map(function (s) { return cfg.lid && top - s >= 2 }) })
      bots = st.cars.map(function (c, i) { return humans.indexOf(i) >= 0 ? null : S.makeBot(cfg.mode === 'melee' ? 'normal' : cfg.level) })
      phase = 'count'; timer = 0; acc = 0; scale = 1; stop = 0; firstOut = -1; focus = null; fx.parts.length = 0
      sheet(null); banner('3', st.arena.name + (mutator !== 'none' ? ' · ' + S.MUTATORS[mutator].label : ''), 'count'); tone(440, 440, 0.09, 'square', 0.05)
      $('.chip-arena').textContent = st.arena.name
      var mc = $('.chip-mut'); mc.hidden = mutator === 'none'; mc.textContent = S.MUTATORS[mutator].label
      $$('.pad').forEach(function (p) { p.classList.toggle('has-hop', cfg.hop) })
      hud()
    }
    function label(i) { return cfg.mode === 'two' ? 'P' + (i + 1) : NAMES[i] }
    function endRound() {
      var o = st.outcome, w = o.winner
      phase = 'ko'; timer = 0
      if (w >= 0) score[w]++
      var head = o.double ? 'DOUBLE BONK' : o.reason === 'bonk' ? 'BONK!' : o.reason === 'self' ? 'OWN LID!' : 'SPLASH!'
      var sub = w < 0 ? 'NO POINT · REPLAY' : label(w) + (label(w) === 'YOU' ? ' SCORE' : ' SCORES')
      banner(head, sub, 'ko'); hud(true, w)
      if (!reduced) { scale = 0.2; stop = 0.09; fx.shake = 0.5 } else scale = 0.6
      fx.flash = 0.5
      focus = { x: o.x != null ? o.x : 0, y: o.y != null ? o.y : 3.5 }
    }
    function afterKo() {
      var w = st.outcome.winner
      if (w >= 0 && score[w] >= TARGET) {
        phase = 'end'; banner(null)
        tone(523, 523, 0.12, 'square', 0.06); setTimeout(function () { tone(659, 659, 0.12, 'square', 0.06) }, 130); setTimeout(function () { tone(784, 784, 0.25, 'square', 0.06) }, 260)
        sheet('end', { title: label(w) + (label(w) === 'YOU' ? ' WIN' : ' WINS'), sub: score.join(' · ') })
        return
      }
      var loser = cfg.mode === 'melee' ? firstOut : st.outcome.loser
      if (cfg.pick && w >= 0 && loser >= 0) {
        phase = 'pick'; banner(null)
        var pool = S.ARENAS.filter(function (a) { return a.id !== st.arena.id }).sort(function () { return Math.random() - 0.5 }).slice(0, 2)
        var human = humans.indexOf(loser) >= 0
        sheet('pick', { title: label(loser) + (label(loser) === 'YOU' ? ' PICK' : ' PICKS') + ' THE NEXT ARENA', sub: human ? 'Losing the round earns the choice.' : 'The bot is choosing.', arenas: pool, human: human })
        if (!human) pickTimer = setTimeout(function () { choose(pool[Math.floor(Math.random() * 2)].id) }, 1100)
        return
      }
      newRound()
    }
    function choose(id) { clearTimeout(pickTimer); if (phase !== 'pick') return; nextArena = id; tone(660, 880, 0.08, 'square', 0.05); newRound() }

    // ── DOM ──
    function banner(big, small, kind) {
      var b = $('.banner')
      if (big == null) { b.hidden = true; return }
      b.hidden = false; b.dataset.kind = kind || ''
      $('.banner b').textContent = big; $('.banner span').textContent = small || ''
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop')
    }
    function sheet(kind, d) {
      $$('.sheet').forEach(function (s) { s.hidden = s.dataset.sheet !== kind })
      if (kind === 'pick') {
        $('.sheet[data-sheet=pick] h3').textContent = d.title; $('.sheet[data-sheet=pick] p').textContent = d.sub
        $$('.pick-card').forEach(function (btn, i) {
          var a = d.arenas[i]; btn.disabled = !d.human; btn.dataset.id = a.id
          btn.querySelector('b').textContent = a.name; btn.querySelector('span').textContent = a.blurb
          view.thumb(btn.querySelector('canvas'), a, pal)
        })
      }
      if (kind === 'end') { $('.sheet[data-sheet=end] h3').textContent = d.title; $('.sheet[data-sheet=end] p').textContent = 'FINAL ' + d.sub }
    }
    function buildCards() {
      var rail = $('.rail'); rail.innerHTML = ''
      score.forEach(function (s, i) {
        var el = document.createElement('div'); el.className = 'card seat' + (i + 1)
        var pips = ''; for (var k = 0; k < TARGET; k++) pips += '<i></i>'
        el.innerHTML = '<span class="flag f' + (i + 1) + '"></span><b>' + label(i) + '</b><span class="pips" aria-hidden="true">' + pips + '</span><span class="lid" hidden>SPARE LID</span><span class="sr"></span>'
        rail.appendChild(el)
      })
    }
    function hud(pop, who) {
      $$('.rail .card').forEach(function (el, i) {
        el.querySelectorAll('.pips i').forEach(function (p, k) { p.classList.toggle('on', k < score[i]); if (pop && i === who && k === score[i] - 1) { p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop') } })
        el.querySelector('.sr').textContent = score[i] + ' of ' + TARGET
        el.querySelector('.lid').hidden = !(st && st.cars[i] && st.cars[i].shield > 0)
      })
    }

    // ── input ──
    $$('.pad button').forEach(function (b) {
      var seat = +b.closest('.pad').dataset.seat, side = b.dataset.dir
      var set = function (v) { return function (e) { e.preventDefault(); wake(); keys[seat][side] = v; b.classList.toggle('down', !!v); if (v && b.setPointerCapture && e.pointerId != null) { try { b.setPointerCapture(e.pointerId) } catch (x) {} } } }
      b.addEventListener('pointerdown', set(1)); b.addEventListener('pointerup', set(0)); b.addEventListener('pointercancel', set(0)); b.addEventListener('lostpointercapture', set(0))
      b.addEventListener('contextmenu', function (e) { e.preventDefault() })
    })
    var KEYMAP = { KeyA: [0, 'l'], KeyD: [0, 'r'], ArrowLeft: [1, 'l'], ArrowRight: [1, 'r'] }
    function key(v) {
      return function (e) {
        var m = KEYMAP[e.code]; if (!m || phase === 'menu' || e.target.matches('input,textarea,select')) return
        if (!root.matches(':hover') && document.activeElement !== root && !root.contains(document.activeElement)) return
        e.preventDefault(); keys[cfg.mode === 'two' ? m[0] : 0][m[1]] = v
      }
    }
    window.addEventListener('keydown', key(1)); window.addEventListener('keyup', key(0))
    window.addEventListener('blur', function () { keys.forEach(function (k) { k.l = k.r = 0 }) })
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return
      var a = t.dataset.act
      if (a === 'start' || a === 'rematch') newMatch()
      if (a === 'menu') { phase = 'menu'; banner(null); sheet('menu') }
      if (a === 'pick') choose(t.dataset.id)
      if (a === 'mute') { muted = !muted; t.setAttribute('aria-pressed', muted); t.classList.toggle('off', muted) }
      if (a === 'mode') { cfg.mode = t.dataset.v; $$('[data-act=mode]').forEach(function (b) { b.setAttribute('aria-pressed', b === t) }); $('.levels').hidden = cfg.mode !== 'bot' }
      if (a === 'level') { cfg.level = t.dataset.v; $$('[data-act=level]').forEach(function (b) { b.setAttribute('aria-pressed', b === t) }) }
    })
    function input(i) {
      var hI = humans.indexOf(i)
      if (hI < 0) return bots[i] ? bots[i](st, i, DT) : null
      var k = keys[cfg.mode === 'two' ? i : 0], both = k.l && k.r
      return { d: both ? 0 : (k.r ? 1 : k.l ? -1 : 0), hop: !!both }
    }

    // ── events from the sim ──
    function drain() {
      for (var i = 0; i < st.events.length; i++) {
        var e = st.events[i]
        if (e.type === 'hit') {
          if (e.cars) { emit('spark', e.x, e.y, Math.min(10, 2 + e.power * 2), { speed: 5, life: 0.3, g: 9 }); if (e.power > 1.6) { tone(190, 90, 0.07, 'square', 0.05); fx.shake = Math.max(fx.shake, reduced ? 0 : 0.12) } }
          else if (e.power > 1.4) { emit('dust', e.x, e.y, 3, { speed: 1.2, life: 0.45, size: 0.14, a0: 0.3, spread: 2.5 }); if (e.power > 3) noise(0.06, 0.05, 500) }
        } else if (e.type === 'splash') {
          emit('drop', e.x, e.y, 6 + e.power * 2, { speed: 2 + e.power * 0.6, a0: 0.5, spread: 2.1, life: 0.8, g: 11, size: 0.06 }); emit('ring', e.x, e.y, 1, { speed: 0, life: 0.6, size: 1.1, col: 'foam' }); noise(0.25, 0.1, 1400)
        } else if (e.type === 'hop') {
          emit('dust', e.x - e.ux * 0.5, e.y - e.uy * 0.5, 7, { speed: 2.2, life: 0.4, size: 0.13 }); tone(220, 660, 0.14, 'sawtooth', 0.05)
        } else if (e.type === 'shield') {
          emit('lid', e.x, e.y, 1, { speed: 4, a0: 1.1, spread: 0.9, life: 1.3, g: 12, size: 0.3, col: 'cta' }); emit('ring', e.x, e.y, 1, { speed: 0, life: 0.45, size: 1.3, col: 'cta' })
          emit('star', e.x, e.y, 5, { speed: 3, life: 0.5, size: 0.12, col: 'cta' }); tone(880, 440, 0.16, 'triangle', 0.09); fx.shake = Math.max(fx.shake, reduced ? 0 : 0.2); hud()
        } else if (e.type === 'bonk' || e.type === 'self') {
          emit('star', e.x, e.y, 12, { speed: 4.5, life: 0.9, size: 0.17, col: 'cta', g: 3 }); emit('lid', e.x, e.y, 1, { speed: 5, a0: 1, spread: 1.1, life: 1.6, g: 12, size: 0.21, col: 'lid' })
          emit('ring', e.x, e.y, 1, { speed: 0, life: 0.5, size: 1.6, col: 'foam' }); emit('smoke', e.x, e.y, 5, { speed: 0.8, life: 1.1, size: 0.16, vy: 0.9 })
          tone(170, 45, 0.28, 'sine', 0.25); noise(0.12, 0.16, 700); if (firstOut < 0) firstOut = e.car
          if (navigator.vibrate) { try { navigator.vibrate(40) } catch (x) {} }
        } else if (e.type === 'sunk') {
          var c = st.cars[e.car].chassis.getPosition()
          emit('drop', c.x, st.water, 22, { speed: 5, a0: 0.6, spread: 1.9, life: 1, g: 11, size: 0.08 }); emit('ring', c.x, st.water, 2, { speed: 0, life: 0.8, size: 1.8, col: 'foam' }); noise(0.4, 0.16, 1100); if (firstOut < 0) firstOut = e.car
        }
      }
      st.events.length = 0
    }

    // ── frame ──
    function frame(now) {
      requestAnimationFrame(frame)
      var real = Math.min(0.05, (now - last) / 1000 || 0); last = now
      if (!visible || !st) return
      if (holdAt && phase === holdAt.p && timer >= holdAt.t) return
      time += real
      if (phase === 'count') {
        var before = Math.floor(timer / 0.6); timer += real
        var n = Math.floor(timer / 0.6)
        if (n !== before && n < 3) { banner(String(3 - n), $('.banner span').textContent, 'count'); tone(440, 440, 0.09, 'square', 0.05) }
        if (timer >= 1.8) { S.start(st); phase = 'play'; banner('GO', '', 'go'); tone(880, 880, 0.2, 'square', 0.06); timer = 0 }
      } else if (phase === 'play') {
        timer += real; if (timer > 0.55 && !$('.banner').hidden && $('.banner').dataset.kind === 'go') banner(null)
      } else if (phase === 'ko') {
        timer += real; if (timer > 0.75) scale = Math.min(1, scale + real * 2.2)
        if (timer > 2.1) afterKo()
      }
      if (stop > 0) stop -= real
      else if (phase !== 'menu') {
        acc += real * scale
        var guard = 0
        while (acc >= DT && guard++ < 5) {
          acc -= DT
          var inputs = st.phase === 'play' ? st.cars.map(function (c, i) { return input(i) }) : null
          S.step(st, inputs, DT); drain()
          if (phase === 'play' && st.outcome) { endRound(); break }
          // wheel dust
          for (var i = 0; i < st.cars.length; i++) {
            var c = st.cars[i]
            if (c.ground && c.d && c.alive && Math.random() < 0.3) { var w = c.wheels[c.d > 0 ? 0 : 1].getPosition(); emit('dust', w.x, w.y - 0.26, 1, { speed: 0.8, a0: c.d > 0 ? 2.4 : 0.2, spread: 0.6, life: 0.4, size: 0.1 }) }
            if (!c.alive && c.out.reason !== 'sunk' && Math.random() < 0.12) { var p = c.chassis.getPosition(); emit('smoke', p.x, p.y + 0.3, 1, { speed: 0.3, life: 1, size: 0.14, vy: 1 }) }
          }
        }
        stepParts(real * scale)
      }
      // camera
      // The camera frames both buggies: wide while they are apart, close when they meet.
      var half = st.geo.half, zMin = S.VIEW.w / (half * 2 + 2.4), lo = 1e9, hi = -1e9
      st.cars.forEach(function (c) { if (c.alive || st.n === 2) { var x = c.chassis.getPosition().x; lo = Math.min(lo, x); hi = Math.max(hi, x) } })
      var tz = zMin, tx = 0
      if (phase === 'play' || phase === 'ko') {
        tz = Math.max(zMin, Math.min(1.12, S.VIEW.w / (hi - lo + 6.5)))
        var room = Math.max(0, half + 1.2 - S.VIEW.w / 2 / tz)
        tx = Math.max(-room, Math.min(room, (lo + hi) / 2))
      }
      if (focus && phase === 'ko' && !reduced) { tz = Math.min(1.5, tz * 1.3); tx = tx + (focus.x - tx) * 0.6 }
      var ty = S.VIEW.y0 + 4.5 / tz
      if (focus && phase === 'ko' && !reduced) ty = Math.max(ty, focus.y - 1.2 / tz)
      var kk = Math.min(1, real * (phase === 'ko' ? 7 : 2.6))
      cam.x += (tx - cam.x) * kk; cam.y += (ty - cam.y) * kk; cam.z += (tz - cam.z) * kk
      fx.shake = Math.max(0, fx.shake - real * 1.6); fx.flash = Math.max(0, fx.flash - real * 2.5)
      cam.sx = (Math.random() - 0.5) * fx.shake * 26; cam.sy = (Math.random() - 0.5) * fx.shake * 26
      view.draw(st, fx, cam, time, pal)
      // tide chip and hop meters
      if (phase === 'menu') return
      var chip = $('.chip-tide'), left = S.T.tideStart - st.t
      var txt = st.phase === 'ready' ? 'TIDE IN ' + S.T.tideStart : left > 0 ? 'TIDE IN ' + Math.ceil(left) : 'TIDE RISING'
      if (txt !== lastTide) {   // write the DOM only when something changed
        lastTide = txt; chip.textContent = txt
        chip.classList.toggle('hot', left <= 0 && st.phase !== 'ready'); chip.classList.toggle('warn', left > 0 && left <= 3 && st.phase === 'play')
      }
      $$('.pad').forEach(function (p, pi) {
        var c = st.cars[+p.dataset.seat], v = c ? Math.round((1 - c.hopCd / S.T.hopCooldown) * 50) / 50 : 1
        if (v !== lastHop[pi]) { lastHop[pi] = v; p.querySelector('.hop i').style.transform = 'scaleX(' + v + ')' }
      })
    }

    function refresh() { pal = R.readPalette(root); view.resize() }
    window.addEventListener('resize', function () { view.resize() })
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting && !document.hidden }, { threshold: 0.05 }).observe(root)
    document.addEventListener('visibilitychange', function () { if (document.hidden) visible = false; else visible = true })

    // an attract scene behind the menu
    st = S.createRound({ arena: 'halfpipe', n: 2 }); for (var s0 = 0; s0 < 90; s0++) S.step(st, null, DT)
    buildCards(); sheet('menu'); banner(null)
    requestAnimationFrame(frame)

    return {
      set: function (k, v) { cfg[k] = v },
      get: function (k) { return cfg[k] },
      refresh: refresh,
      hold: function (p, t) { holdAt = p ? { p: p, t: t || 0 } : null },
      press: function (seat, l, r) { keys[seat].l = l; keys[seat].r = r },
      phase: function () { return phase },
      debug: function () { return { phase: phase, score: score.slice(), t: st && st.t, arena: st && st.arena.id, parts: fx.parts.length } },
    }
  }
  return { mount: mount }
})(BonkSim, BonkRender)
