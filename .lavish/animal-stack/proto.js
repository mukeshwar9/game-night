// Animal Stack — playable PROTOTYPE on the design page (not app code).
// Pass-and-play 2-4P, vs BOT, and CLIMB. Drag to aim, ROTATE, DROP.
(function () {
  'use strict'
  var A = window.AnimalStack
  var GLYPHS = ['●', '▲', '■', '◆']
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ------------------------------------------------------------ audio (WebAudio synth, like src/lib/sounds.js)
  var actx = null, muted = false, hapticsOn = true
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { actx = null } }
    return actx
  }
  function note(f, start, dur, type, vol) {
    var c = ac(); if (!c || muted) return
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + (start || 0)
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02)
  }
  function thud(vol) {
    var c = ac(); if (!c || muted) return
    var len = Math.floor(c.sampleRate * 0.12), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0)
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = Math.min(0.5, vol)
    src.buffer = buf; src.connect(f).connect(g).connect(c.destination); src.start()
  }
  var sfx = {
    rotate: function () { note(880, 0, 0.03, 'square', 0.04) },
    drop: function () { note(520, 0, 0.05, 'square', 0.06); note(390, 0.04, 0.06, 'square', 0.05) },
    land: function (v) { thud(0.12 + v * 0.25); note(140 + v * 40, 0, 0.08, 'triangle', 0.08) },
    go: function () { note(660, 0, 0.06); note(990, 0.07, 0.08) },
    topple: function () { [440, 330, 247, 165].forEach(function (f, i) { note(f, i * 0.11, 0.14, 'square', 0.09) }) },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { note(f, i * 0.1, 0.16, 'square', 0.08) }) },
    tick: function () { note(1200, 0, 0.02, 'square', 0.03) },
  }
  function buzz(p) { if (hapticsOn && navigator.vibrate) { try { navigator.vibrate(p) } catch (e) {} } }

  // ------------------------------------------------------------ DOM
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }

  function mount(root) {
    root.innerHTML = ''
    var phone = el('div', 'as-screen as-live')
    var top = el('div', 'as-topbar')
    top.innerHTML = '<span class="pix t9 dim">← MODES</span><span class="pix t8 dim as-modelabel">ANIMAL STACK</span>' +
      '<span class="as-icons"><button class="as-ico" data-k="replay" title="Replay check: rebuild tower from seed + drops">⎘</button>' +
      '<button class="as-ico" data-k="snd" title="Sound">♪</button><button class="as-ico" data-k="hap" title="Haptics">≋</button></span>'
    var rail = el('div', 'as-rail')
    var arena = el('div', 'as-arena')
    var cv = el('canvas', 'as-cv'); cv.setAttribute('aria-label', 'Animal Stack tower. Drag to aim.')
    var banner = el('div', 'as-banner pix')
    var next = el('div', 'as-next'); var nextCv = el('canvas'); next.appendChild(nextCv); next.appendChild(el('span', 'pix t7 dim', 'NEXT'))
    var timer = el('div', 'as-timer'); var timerBar = el('i'); timer.appendChild(timerBar)
    var height = el('div', 'as-height pix t8')
    var toast = el('div', 'as-toast pix t8')
    var overlay = el('div', 'as-overlay')
    arena.append(cv, timer, banner, next, height, toast, overlay)
    var controls = el('div', 'as-controls')
    var rotBtn = el('button', 'as-btn-rot pix', '<span class="big">⟲</span><span class="t8">ROTATE</span>')
    var hint = el('div', 'as-hint pix t8 dim', '◀ DRAG TO AIM ▶')
    var dropBtn = el('button', 'as-btn-drop pix', 'DROP')
    controls.append(rotBtn, hint, dropBtn)
    phone.append(top, rail, arena, controls)
    root.appendChild(phone)

    // ---------------------------------------------------------- game state
    var G = null
    var live = null // current DropSim while settling
    var view = { bottom: -2.1, ppm: 40 }
    var particles = [], shake = 0, slow = 0, stamp = null
    var botThinking = false
    var best = 0
    try { best = parseFloat(localStorage.getItem('as-proto-best') || '0') || 0 } catch (e) {}

    function newGame(mode, count, level) {
      var players = []
      if (mode === 'climb') players = [{ name: 'YOU', hearts: 1 }]
      else if (mode === 'bot') players = [{ name: 'YOU', hearts: 3 }, { name: 'BOT·' + level.toUpperCase(), hearts: 3, bot: level }]
      else for (var i = 0; i < count; i++) players.push({ name: 'P' + (i + 1), hearts: count === 2 ? 3 : 2 })
      G = { mode: mode, level: level, players: players, round: 0, baseSeed: (Math.random() * 1e9) | 0, turn: 0 }
      newRound(0)
    }
    function newRound(first) {
      G.round++
      G.seed = G.baseSeed + G.round
      G.seq = A.pieceSequence(G.seed, 240)
      G.drops = []; G.state = []; G.turn = first
      G.maxH = 0
      overlay.className = 'as-overlay'; overlay.innerHTML = ''
      startAim(true)
    }
    function curPiece() { return G.seq[G.drops.length] }
    function startAim(first) {
      G.phase = 'aim'
      G.aim = { x: 0, r: 0 }
      G.top = A.stateTop(G.state)
      G.deadline = G.mode === 'climb' ? 0 : performance.now() + 15000
      var p = G.players[G.turn]
      if (G.players.length > 1) showBanner(GLYPHS[G.turn] + ' ' + p.name + (p.bot ? ' THINKING…' : ' · YOUR DROP'), G.turn)
      else if (first) showBanner('STACK HIGH!', 0)
      if (!first) sfx.go()
      renderRail(); drawNext()
      if (p.bot) botTurn()
    }
    function showBanner(text, pi) {
      banner.textContent = text
      banner.style.setProperty('--pc', 'var(--c-' + A.PLAYER_TOKENS[pi] + ')')
      banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show')
    }
    function flash(msg) { toast.textContent = msg; toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show') }

    function renderRail() {
      rail.innerHTML = ''
      if (G.mode === 'climb') {
        rail.innerHTML = '<div class="as-chip on" style="--pc:var(--c-p1)"><b class="pix t9">● YOU</b><span class="pix t8">CLIMB</span></div>' +
          '<div class="as-chip" style="--pc:var(--c-cta)"><b class="pix t9">BEST</b><span class="pix t8">' + best.toFixed(1) + 'M</span></div>'
        return
      }
      G.players.forEach(function (p, i) {
        var c = el('div', 'as-chip' + (i === G.turn && G.phase !== 'over' ? ' on' : '') + (p.hearts <= 0 ? ' out' : ''))
        c.style.setProperty('--pc', 'var(--c-' + A.PLAYER_TOKENS[i] + ')')
        var hearts = ''
        for (var h = 0; h < (G.players.length === 2 ? 3 : 2); h++) hearts += h < p.hearts ? '♥' : '·'
        c.innerHTML = '<b class="pix t9">' + GLYPHS[i] + ' ' + p.name + '</b><span class="pix t8 hearts">' + hearts + '</span>'
        rail.appendChild(c)
      })
    }
    function drawNext() {
      nextCv.style.width = '44px'; nextCv.style.height = '34px'
      A.thumb(nextCv, G.seq[G.drops.length + 1])
    }

    function doDrop() {
      if (!G || G.phase !== 'aim') return
      var d = { k: curPiece(), x: Math.round(G.aim.x * 100) / 100, r: G.aim.r }
      G.drops.push(d)
      live = A.startDrop(G.state, d)
      live.dropper = G.turn
      live.hitDone = false
      live.w.on('begin-contact', function (c) {
        if (live.hitDone) return
        var a = c.getFixtureA().getBody(), b = c.getFixtureB().getBody()
        if (a !== live.dropBody && b !== live.dropBody) return
        live.hitDone = true
        var v = live.dropBody.getLinearVelocity(), sp = Math.min(1, Math.abs(v.y) / 6)
        sfx.land(sp); buzz(8 + Math.round(sp * 14))
        var pt = live.dropBody.getPosition()
        if (!reduceMotion) for (var i = 0; i < 10; i++) particles.push({ x: pt.x + (Math.random() - .5) * 1.2, y: pt.y - .3, vx: (Math.random() - .5) * 2, vy: Math.random() * 2, life: 1, c: 'text' })
      })
      G.phase = 'settle'
      sfx.drop(); buzz(10)
    }
    function afterSettle() {
      var sim = live; live = null
      if (sim.fell) return toppled(sim)
      G.state = A.canon(sim.bodies)
      var h = A.stateTop(G.state)
      G.maxH = Math.max(G.maxH, h)
      if (G.mode === 'climb') { G.turn = 0; return startAim(false) }
      G.turn = nextAlive(G.turn)
      startAim(false)
    }
    function nextAlive(i) {
      for (var s = 1; s <= G.players.length; s++) { var j = (i + s) % G.players.length; if (G.players[j].hearts > 0) return j }
      return i
    }
    function toppled(sim) {
      G.phase = 'topple'
      sfx.topple(); buzz([0, 60, 40, 120])
      if (!reduceMotion) { shake = 1; slow = 50 }
      stamp = performance.now()
      // keep the doomed world alive for the fall animation (visual only)
      G.fallSim = sim
      var who = sim.dropper
      setTimeout(function () {
        G.fallSim = null
        if (G.mode === 'climb') {
          var hgt = G.maxH
          var isBest = hgt > best
          if (isBest) { best = hgt; try { localStorage.setItem('as-proto-best', String(best)) } catch (e) {} }
          return showOverlay('<p class="pix t9 dim">RUN OVER</p><h3 class="pix glow-cta">' + hgt.toFixed(1) + ' M</h3>' +
            '<p class="mono t11">' + (G.drops.length - 1) + ' animals stacked' + (isBest ? ' · NEW BEST!' : ' · best ' + best.toFixed(1) + ' m') + '</p>' +
            '<button class="as-cta pix" data-a="again">CLIMB AGAIN</button><button class="as-sec pix" data-a="menu">MODES</button>')
        }
        G.players[who].hearts--
        renderRail()
        var alive = G.players.filter(function (p) { return p.hearts > 0 })
        if (alive.length <= 1) {
          G.phase = 'over'
          var w = G.players.indexOf(alive[0])
          sfx.win()
          return showOverlay('<p class="pix t9 dim">MATCH OVER</p><h3 class="pix glow-cta" style="color:rgb(var(--c-' + A.PLAYER_TOKENS[w] + '))">' + GLYPHS[w] + ' ' + alive[0].name + ' WINS!</h3>' +
            '<p class="mono t11">last one standing after ' + G.round + ' tower' + (G.round > 1 ? 's' : '') + '</p>' +
            '<button class="as-cta pix" data-a="again">PLAY AGAIN</button><button class="as-sec pix" data-a="menu">SWITCH MODE</button>')
        }
        G.phase = 'roundover'
        var p = G.players[who]
        showOverlay('<p class="pix t9 dim">TOPPLE!</p><h3 class="pix" style="color:rgb(var(--c-' + A.PLAYER_TOKENS[who] + '))">' + GLYPHS[who] + ' ' + p.name + (p.hearts > 0 ? ' −♥' : ' IS OUT') + '</h3>' +
          '<p class="mono t11">tower of ' + (G.drops.length - 1) + ' · ' + G.maxH.toFixed(1) + ' m. ' + (p.hearts > 0 ? p.name + ' starts the next tower.' : '') + '</p>' +
          '<button class="as-cta pix" data-a="next">NEXT TOWER</button>')
      }, reduceMotion ? 700 : 1700)
    }
    function showOverlay(html) { overlay.innerHTML = '<div class="as-panel">' + html + '</div>'; overlay.className = 'as-overlay show' }

    function showMenu() {
      G = null; live = null
      overlay.className = 'as-overlay show'
      overlay.innerHTML = '<div class="as-panel as-menu">' +
        '<p class="pix t8 dim">PROTOTYPE · PICK A MODE</p>' +
        '<div class="as-menu-grid">' +
        '<button class="as-mode pix" data-m="local" data-n="2"><b>2P</b><span>PASS &amp; PLAY</span></button>' +
        '<button class="as-mode pix" data-m="local" data-n="3"><b>3P</b><span>PASS &amp; PLAY</span></button>' +
        '<button class="as-mode pix" data-m="local" data-n="4"><b>4P</b><span>PASS &amp; PLAY</span></button>' +
        '<button class="as-mode pix" data-m="climb"><b>CLIMB</b><span>SOLO HEIGHT</span></button>' +
        '<button class="as-mode pix" data-m="bot" data-l="easy"><b>BOT</b><span>EASY</span></button>' +
        '<button class="as-mode pix" data-m="bot" data-l="normal"><b>BOT</b><span>NORMAL</span></button>' +
        '</div><p class="mono t10 dim">Drag the arena to aim · ⟲ rotates 15° (hold to spin) · DROP lets go. Arrow keys / R / Space work too.</p></div>'
      rail.innerHTML = ''; banner.classList.remove('show')
    }
    overlay.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return
      ac()
      if (b.dataset.m) return newGame(b.dataset.m, +b.dataset.n || 0, b.dataset.l)
      if (b.dataset.a === 'again') return newGame(G.mode, G.players.length, G.level)
      if (b.dataset.a === 'menu') return showMenu()
      if (b.dataset.a === 'next') {
        return newRound(G.players[G.lastToppler] && G.players[G.lastToppler].hearts > 0 ? G.lastToppler : nextAlive(G.lastToppler))
      }
    })
    top.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return
      if (b.dataset.k === 'snd') { muted = !muted; b.classList.toggle('off', muted); flash(muted ? 'SOUND OFF' : 'SOUND ON') }
      if (b.dataset.k === 'hap') { hapticsOn = !hapticsOn; b.classList.toggle('off', !hapticsOn); flash(!navigator.vibrate ? 'NO VIBRATE API (iOS)' : hapticsOn ? 'HAPTICS ON' : 'HAPTICS OFF') }
      if (b.dataset.k === 'replay') {
        if (!G || G.phase !== 'aim') return flash('WAIT FOR THE TOWER TO SETTLE')
        var t0 = performance.now(), r = A.replay(G.drops)
        var ok = r.hash === A.hashState(G.state)
        flash((ok ? 'REPLAY ✓ ' : 'REPLAY ✗ ') + r.hash + ' · ' + G.drops.length + ' DROPS · ' + Math.round(performance.now() - t0) + 'MS')
      }
    })
    top.querySelector('.t9').addEventListener('click', showMenu)

    // ---------------------------------------------------------- input
    var drag = null
    arena.addEventListener('pointerdown', function (e) {
      if (!G || G.phase !== 'aim' || G.players[G.turn].bot) return
      if (e.target.closest('.as-overlay.show')) return
      ac(); drag = { id: e.pointerId, x: e.clientX }; arena.setPointerCapture(e.pointerId)
    })
    arena.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId || !G || G.phase !== 'aim') return
      var dx = (e.clientX - drag.x) / view.ppm; drag.x = e.clientX
      G.aim.x = Math.max(-A.AIM_LIMIT, Math.min(A.AIM_LIMIT, G.aim.x + dx))
    })
    function endDrag() { drag = null }
    arena.addEventListener('pointerup', endDrag); arena.addEventListener('pointercancel', endDrag)
    function rotate(dir) {
      if (!G || G.phase !== 'aim' || G.players[G.turn].bot) return
      G.aim.r = (G.aim.r + (dir || 1) + A.ROT_STEPS) % A.ROT_STEPS; sfx.rotate(); buzz(4)
    }
    var holdT = null
    rotBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault(); ac(); rotate(1)
      clearTimeout(holdT); holdT = setTimeout(function rep() { rotate(1); holdT = setTimeout(rep, 140) }, 380)
    })
    ;['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { rotBtn.addEventListener(ev, function () { clearTimeout(holdT) }) })
    dropBtn.addEventListener('click', function () { ac(); if (G && !G.players[G.turn].bot) doDrop() })
    root.tabIndex = 0
    root.addEventListener('keydown', function (e) {
      if (!G || G.phase !== 'aim' || G.players[G.turn].bot) return
      if (e.key === 'ArrowLeft' || e.key === 'a') G.aim.x = Math.max(-A.AIM_LIMIT, G.aim.x - 0.1)
      else if (e.key === 'ArrowRight' || e.key === 'd') G.aim.x = Math.min(A.AIM_LIMIT, G.aim.x + 0.1)
      else if (e.key === 'ArrowUp' || e.key === 'r') rotate(1)
      else if (e.key === 'ArrowDown') rotate(-1)
      else if (e.key === ' ' || e.key === 'Enter') doDrop()
      else return
      e.preventDefault()
    })

    // ---------------------------------------------------------- bot
    function botTurn() {
      if (botThinking) return
      botThinking = true
      var p = G.players[G.turn], L = A.BOT_LEVELS[p.bot], k = curPiece()
      var cands = A.botCandidates(p.bot, k), i = 0, bestC = null, bestS = -Infinity, state = G.state
      var myGame = G
      function chunk() {
        if (G !== myGame || G.phase !== 'aim') { botThinking = false; return }
        var t0 = performance.now()
        while (i < cands.length && performance.now() - t0 < 30) {
          var s = A.scoreCandidate(state, cands[i], L.cap) + Math.random() * 0.2
          if (s > bestS) { bestS = s; bestC = cands[i] }
          i++
        }
        if (i < cands.length) return setTimeout(chunk, 0)
        var tx = Math.max(-2.4, Math.min(2.4, bestC.x + (Math.random() * 2 - 1) * L.noise))
        var tr = bestC.r, t1 = performance.now()
        ;(function glide() {
          if (G !== myGame || G.phase !== 'aim') { botThinking = false; return }
          var u = Math.min(1, (performance.now() - t1) / 650)
          G.aim.x = G.aim.x + (tx - G.aim.x) * (u < 1 ? 0.18 : 1)
          if (G.aim.r !== tr && u > 0.3) { G.aim.r = tr; sfx.rotate() }
          if (u < 1) return requestAnimationFrame(glide)
          botThinking = false
          doDrop()
        })()
      }
      setTimeout(chunk, 350)
    }

    // ---------------------------------------------------------- loop
    var acc = 0, last = performance.now(), frame = 0, lastTickSec = -1
    function loop(now) {
      var dt = Math.min(0.1, (now - last) / 1000); last = now; frame++
      if (G && G.phase === 'settle' && live) {
        acc += dt
        while (acc >= A.DT && live && !live.done) { A.stepDrop(live); acc -= A.DT }
        if (live && live.done) { acc = 0; afterSettle() }
      }
      if (G && G.fallSim) {
        if (!(slow > 0 && frame % 2)) { G.fallSim.w.step(A.DT, 8, 3) }
        if (slow > 0) slow--
      }
      // aim timer (auto-drop on expiry)
      if (G && G.phase === 'aim' && G.deadline) {
        var left = Math.max(0, G.deadline - now)
        timer.style.display = 'block'
        timerBar.style.transform = 'scaleX(' + left / 15000 + ')'
        timer.classList.toggle('low', left < 5000)
        var sec = Math.ceil(left / 1000)
        if (left < 5000 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick() }
        if (left <= 0 && !G.players[G.turn].bot) { flash('TIME! AUTO-DROP'); doDrop() }
      } else timer.style.display = 'none'
      // camera
      var W = cv.clientWidth, H = cv.clientHeight
      if (G) {
        var k = curPiece(), top = G.top || 0
        var target = A.viewFor(W, H, top, A.PIECES[k] ? A.PIECES[k].radius : 0.8)
        view.ppm = target.ppm
        view.bottom += (target.bottom - view.bottom) * (reduceMotion ? 1 : 0.08)
        height.textContent = G.mode === 'climb' ? '▲ ' + Math.max(G.maxH, 0).toFixed(1) + ' M' : '▲ ' + top.toFixed(1) + ' M'
      } else { var t0v = A.viewFor(W, H, 0, 0.8); view.ppm = t0v.ppm; view.bottom = t0v.bottom; height.textContent = '' }
      particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 6 * dt; p.life -= dt * 1.6 })
      particles = particles.filter(function (p) { return p.life > 0 })
      var sh = [0, 0]
      if (shake > 0) { sh = [(Math.random() - .5) * 4 * shake, (Math.random() - .5) * 4 * shake]; shake = Math.max(0, shake - dt * 1.5) }
      var items = [], hover = null
      var bodies = G && G.fallSim ? G.fallSim.bodies : live ? live.bodies : null
      if (bodies) {
        bodies.forEach(function (b) {
          var p = b.getPosition()
          items.push({ k: b.getUserData().k, x: p.x, y: p.y, a: b.getAngle(), outline: live && b === live.dropBody ? A.PLAYER_TOKENS[live.dropper] : null })
        })
      } else if (G) {
        G.state.forEach(function (s, i) { items.push({ k: s.k, x: s.x, y: s.y, a: s.a }) })
      }
      if (G && G.phase === 'aim') {
        var kk = curPiece()
        hover = { k: kk, x: G.aim.x, y: (G.top || 0) + A.PIECES[kk].radius + 0.45, a: G.aim.r * A.ROT_STEP, player: G.turn }
      }
      A.drawScene(cv, { items: items, hover: hover, guide: true, view: view, t: now, shake: sh, particles: particles, best: G && G.mode === 'climb' ? best : 0 })
      requestAnimationFrame(loop)
    }
    // remember toppler for next round's first player
    var _toppled = toppled
    toppled = function (sim) { G.lastToppler = sim.dropper; _toppled(sim) }

    A.readTokens()
    showMenu()
    requestAnimationFrame(loop)
    return { retheme: function () { A.readTokens(); if (G) drawNext() } }
  }

  window.AnimalStackProto = { mount: mount }
})()
