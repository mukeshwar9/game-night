  // ── Sound, haptics ───────────────────────────────────────────────────────
  let AC = null, eng = null, engGain = null, muted = false
  function audioOn() {
    if (AC) { AC.resume && AC.resume(); return }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)()
      eng = AC.createOscillator(); eng.type = 'sawtooth'; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420
      engGain = AC.createGain(); engGain.gain.value = 0; eng.connect(f); f.connect(engGain); engGain.connect(AC.destination); eng.start()
    } catch (e) { AC = null }
  }
  function tone(freq, dur, type, vol, to) {
    if (!AC || muted) return
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02)
  }
  function noise(dur, vol, freq) {
    if (!AC || muted) return
    const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol
    src.connect(f); f.connect(g); g.connect(AC.destination); src.start()
  }
  const buzz = (p) => { try { if (!muted && navigator.vibrate) navigator.vibrate(p) } catch (e) { /* no haptics here */ } }

  // ── Page wiring ──────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id)
  const cv = $('sk-canvas'), ctx = cv.getContext('2d')
  const el = { place: $('sk-place'), speed: $('sk-speed'), pips: $('sk-pips'), toast: $('sk-toast'), count: $('sk-count'), start: $('sk-start'), results: $('sk-results'), rail: $('sk-rail'), draft: $('sk-draft'), time: $('sk-time'), kl: $('sk-kl'), kr: $('sk-kr'), bo: $('sk-bo'), phone: $('sk-phone') }
  const ORD = ['1ST', '2ND', '3RD', '4TH']
  let shake = 0, hitStop = 0, toastT = 0, lastCount = 9, pixel = false, punch = 0, zoom = 1
  function setTheme(id) {
    P = PALS[id]; const t = P.t, v = (a) => a.map(Math.round).join(' '), st = el.phone.style
    for (const k of ['bg', 'card', 'text', 'dim', 'border', 'p1', 'cta', 'win', 'danger', 'deep']) st.setProperty('--' + k, v(t[k]))
    st.setProperty('--tint', P.dark ? v(mx(t.card, t.bg, 0.3)) : '255 255 255'); st.setProperty('--rim', P.dark ? v(mx(t.border, t.text, 0.4)) : '255 255 255'); st.setProperty('--rim-a', P.dark ? '.45' : '.9')
    st.setProperty('--on-accent', P.dark ? v(t.bg) : '255 255 255'); st.setProperty('--cta-deep', v(mx(t.cta, BLACK, 0.4))); st.setProperty('--bezel', P.dark ? v(mx(t.bg, t.border, 0.5)) : '31 38 25')
    for (let i = 0; i < 4; i++) el.rail.children[i + 1].style.background = P.seat[i].main
    for (const b of document.querySelectorAll('[data-theme-pick]')) b.setAttribute('aria-pressed', String(b.dataset.themePick === id))
    if (!el.results.hidden) showResults()
  }
  function toast(text, tone_) { el.toast.textContent = text; el.toast.dataset.tone = tone_ || ''; el.toast.classList.remove('show'); void el.toast.offsetWidth; el.toast.classList.add('show'); toastT = 1.3 }
  function burst(r, txt) {
    if (r._sx == null) return
    const x = r._sx, y = r._sy - 70 * (r._k || 1)
    parts.push({ k: 'pow', x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, txt, rot: (Math.random() - 0.5) * 0.5 })
    for (let i = 0; i < 9; i++) parts.push({ k: 'star', x, y, vx: (Math.random() - 0.5) * 320, vy: -80 - Math.random() * 220, life: 0.55, max: 0.55, alt: i % 2 })
  }
  function handle(ev) {
    const me = riders[0], live = phase !== 'attract'
    if (ev.t === 'go') { tone(880, 0.35, 'square', 0.07); buzz(40); el.count.textContent = 'GO!'; el.count.className = 'sk-count pop' }
    if (ev.t === 'swing' && ev.by === 0 && live) noise(0.12, 0.12, 1800)
    if (ev.t === 'hit') {
      burst(riders[ev.to], riders[ev.to].pips <= 0 ? 'OFF!' : 'POW')
      if (!live) return
      if (ev.by === 0) { hitStop = 0.07; shake = 5; punch = 0.035; tone(150, 0.14, 'square', 0.1, 60); noise(0.09, 0.16, 500); buzz(25); if (riders[ev.to].pips > 0) toast('KICKED ' + riders[ev.to].name) }
      else if (ev.to === 0) { shake = 9; punch = -0.03; tone(110, 0.2, 'sawtooth', 0.1, 50); buzz([40, 30, 40]); if (me.pips > 0) toast(riders[ev.by].name + ' KICKED YOU', 'bad') }
      else noise(0.06, 0.05, 600)
    }
    if (ev.t === 'miss' && ev.by === 0 && live) toast('WHIFF', 'dim')
    if (ev.t === 'boost' && ev.by === 0 && live) { noise(0.35, 0.14, 700); tone(180, 0.4, 'sawtooth', 0.06, 520); buzz(30) }
    if (ev.t === 'down' && live) {
      if (ev.to === 0) { shake = 14; noise(0.5, 0.22, 240); tone(220, 0.5, 'sawtooth', 0.08, 40); buzz([80, 40, 120]); toast(ev.why === 'car' ? 'WIPEOUT' : ev.why === 'over' ? 'TOO MANY KICKS · YOU FELL' : 'KNOCKED OFF BY ' + riders[ev.by].name, 'bad') }
      else if (ev.by === 0) { tone(523, 0.1, 'square', 0.07); setTimeout(() => tone(784, 0.16, 'square', 0.07), 90); toast(riders[ev.to].name + ' IS OFF THE BIKE', 'good') }
    }
    if (ev.t === 'oil' && ev.to === 0 && live) { noise(0.3, 0.1, 900); toast('OIL', 'dim'); buzz(20) }
    if (ev.t === 'up' && ev.to === 0 && live) { tone(330, 0.12, 'triangle', 0.07, 660); if (me.cu > 0) { toast('BACK ON · CATCH-UP', 'good'); setTimeout(() => tone(660, 0.14, 'square', 0.06, 990), 110) } }
    if (ev.t === 'finish' && ev.to === 0 && live) { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.07), i * 110)); buzz([30, 40, 30, 40, 90]) }
    if (ev.t === 'results' && live) showResults()
  }
  function fmt(t) { return Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0') }
  function showResults() {
    const order = standings()
    const rows = order.map((r, i) => '<li class="' + (r.i === 0 ? 'me' : '') + '"><b>' + ORD[i] + '</b>' + (hasAv(r.i) ? '<img alt="" style="background:' + P.seat[r.i].main + '" src="' + AVS[r.i].bust.lit.toDataURL() + '">' : '<i style="background:' + P.seat[r.i].main + '"></i>') + '<span>' + r.name + '</span><em>' + (r.done ? fmt(r.time) : 'STILL RIDING') + '</em><u>' + r.hits + ' KICKS · ' + r.offs + ' FALLS · +' + (3 - i) + ' PTS</u></li>').join('')
    const mine = order.indexOf(riders[0])
    el.results.innerHTML = '<div class="sk-sheet"><h4>' + (mine === 0 ? 'YOU WON THE ROAD' : 'YOU FINISHED ' + ORD[mine]) + '</h4><ol>' + rows + '</ol><button type="button" id="sk-again" class="sk-cta">RACE AGAIN</button></div>'
    el.results.hidden = false
    $('sk-again').addEventListener('click', startRace)
  }
  function startRace() { audioOn(); resetRace(false); parts.length = 0; wps.length = 0; skids.length = 0; el.start.hidden = true; el.results.hidden = true; lastCount = 9; el.count.className = 'sk-count' }
  $('sk-go').addEventListener('click', startRace)
  $('sk-mute').addEventListener('click', (e) => { muted = !muted; e.currentTarget.textContent = muted ? 'SOUND OFF' : 'SOUND ON'; e.currentTarget.setAttribute('aria-pressed', String(!muted)) })
  for (const b of document.querySelectorAll('[data-theme-pick]')) b.addEventListener('click', () => setTheme(b.dataset.themePick))
  function setTrack(id) {
    trackId = id; trackSeed = id === 'random' ? Math.floor(Math.random() * 1e9) : 20261010
    for (const o of document.querySelectorAll('[data-track-pick]')) o.setAttribute('aria-pressed', String(o.dataset.trackPick === id))
    const lab = $('sk-track'); if (lab) lab.textContent = TRACKS[id].name
    parts.length = 0; wps.length = 0; skids.length = 0
    if (phase === 'attract') resetRace(true); else startRace()
  }
  for (const b of document.querySelectorAll('[data-track-pick]')) b.addEventListener('click', () => setTrack(b.dataset.trackPick))
  for (const b of document.querySelectorAll('[data-av-pick]')) b.addEventListener('click', () => { avatarsOn = b.dataset.avPick === 'on'; for (const o of document.querySelectorAll('[data-av-pick]')) o.setAttribute('aria-pressed', String(o === b)); if (!el.results.hidden) showResults() })
  for (const b of document.querySelectorAll('[data-style-pick]')) b.addEventListener('click', () => { pixel = b.dataset.stylePick === 'pixel'; for (const o of document.querySelectorAll('[data-style-pick]')) o.setAttribute('aria-pressed', String(o === b)) })
  // Left thumb steers, right thumb kicks.
  const held = { l: false, r: false }
  const setSteer = () => { input.steer = (held.r ? 1 : 0) - (held.l ? 1 : 0) }
  function hold(id, key) {
    const b = $(id)
    const on = (e) => { e.preventDefault(); held[key] = true; setSteer(); b.classList.add('down') }
    const off = () => { held[key] = false; setSteer(); b.classList.remove('down') }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off)
    b.addEventListener('contextmenu', (e) => e.preventDefault())
  }
  hold('sk-sl', 'l'); hold('sk-sr', 'r')
  { const b = el.bo, on = (e) => { e.preventDefault(); input.boost = true; b.classList.add('down') }, off = () => { input.boost = false; b.classList.remove('down') }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); b.addEventListener('contextmenu', (e) => e.preventDefault()) }
  function kickBtn(b, side) { b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (phase === 'race') input.kick = side; b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120) }); b.addEventListener('contextmenu', (e) => e.preventDefault()) }
  kickBtn(el.kl, -1); kickBtn(el.kr, 1)
  window.addEventListener('keydown', (e) => {
    if (phase === 'attract' || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return
    if (e.key === 'ArrowLeft') { held.l = true; setSteer(); e.preventDefault() }
    else if (e.key === 'ArrowRight') { held.r = true; setSteer(); e.preventDefault() }
    else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { input.boost = true; e.preventDefault() }
    else if (!e.repeat && (e.key === 'a' || e.key === 'A' || e.key === 'z' || e.key === 'Z')) input.kick = -1
    else if (!e.repeat && (e.key === 'd' || e.key === 'D' || e.key === 'x' || e.key === 'X')) input.kick = 1
  })
  window.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.boost = false; if (e.key === 'ArrowLeft') { held.l = false; setSteer() } if (e.key === 'ArrowRight') { held.r = false; setSteer() } })

  // Small live views: the four seats, and the same race in each theme.
  const off = document.createElement('canvas'); off.width = W; off.height = H; const octx = off.getContext('2d')
  const lo = document.createElement('canvas'); lo.width = W / 2; lo.height = H / 2; const lctx = lo.getContext('2d')
  const minis = []
  for (let i = 0; i < 4; i++) { const c = $('sk-seat-' + i); if (c) minis.push({ c, view: i, pal: null }) }
  for (const c of document.querySelectorAll('[data-theme-thumb]')) minis.push({ c, view: 0, pal: c.dataset.themeThumb })
  let miniTurn = 0
  function drawMini(m, time) {
    const box = m.c.getBoundingClientRect(); if (box.bottom < -200 || box.top > (window.innerHeight || 800) + 200) return false
    const keep = P; if (m.pal) P = PALS[m.pal]
    render(octx, m.view, time, false); overlay(octx, -1)
    const c = m.c.getContext('2d'); c.drawImage(off, 0, 0, m.c.width, m.c.height)
    const r = riders[m.view]
    c.font = '9px "Press Start 2P",monospace'; c.textBaseline = 'middle'; c.textAlign = 'left'
    if (!m.pal) { rr(c, 6, 6, 56, 22, 8, css(P.dark ? P.t.card : [255, 255, 255], 0.85)); c.fillStyle = P.seat[r.i].main; c.fillText(ORD[placeOf(r) - 1], 12, 18) }
    P = keep
    return true
  }

  let acc = 0, last = performance.now(), clock = 0, frozen = false
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt
    if (frozen || document.hidden) acc = 0; else if (hitStop > 0) hitStop -= dt; else acc += dt
    let n = 0
    while (acc >= DT && n++ < 5) { step(); acc -= DT; for (const ev of events) handle(ev); events.length = 0 }
    if (n >= 5) acc = 0
    const me = riders[0], sp = me.speed / MAXSPD
    skyOff += segAt(me.z).curve * sp * dt * 42
    if (!frozen && !document.hidden && hitStop <= 0) stepEffects(dt)
    // Camera: trails the bike a little, rolls into corners, breathes with speed and punches on a hit.
    camSm = lerp(camSm, me.x, 1 - Math.exp(-9 * dt)); if (Math.abs(camSm - me.x) > 0.5) camSm = me.x
    punch *= Math.exp(-7 * dt); zoom = lerp(zoom, 1.045 + (me.boosting ? 0.06 : me.draft > 0.5 || me.cu > 0 ? 0.035 : 0) + sp * 0.015, 1 - Math.exp(-4 * dt))
    const roll = -(me.lean * 0.028 + me.rec * 0.05) * (reduced ? 0 : 1), zz = zoom + punch, jit = reduced ? 0 : Math.sin(clock * 47) * 0.5 * sp
    ctx.save()
    if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.exp(-9 * dt) }
    ctx.save(); ctx.translate(W / 2, H * 0.66 + jit); ctx.rotate(roll); ctx.scale(zz, zz); ctx.translate(-W / 2, -H * 0.66)
    if (pixel) { lctx.setTransform(0.5, 0, 0, 0.5, 0, 0); render(lctx, 0, clock, true); ctx.imageSmoothingEnabled = false; ctx.drawImage(lo, 0, 0, W, H) }
    else render(ctx, 0, clock, true)
    ctx.restore()
    for (const g of tags) { const dx0 = g.x - W / 2, dy0 = g.y - H * 0.66, cs = Math.cos(roll), sn = Math.sin(roll); g.x = W / 2 + (dx0 * cs - dy0 * sn) * zz; g.y = H * 0.66 + jit + (dx0 * sn + dy0 * cs) * zz }
    for (const r of riders) if (r._sx != null && !r._adj) { /* burst positions are approximate under the camera transform */ }
    overlay(ctx, 0)
    ctx.restore()
    // HUD
    const pl = placeOf(me)
    el.place.firstChild.textContent = ORD[pl - 1]
    el.speed.firstChild.textContent = String(Math.round(sp * 190)).padStart(3, '0')
    el.time.textContent = fmt(raceT)
    const pips = el.pips.children; for (let i = 0; i < PIPS; i++) pips[i].className = i < me.pips && me.state !== 'down' ? 'on' : ''
    el.pips.classList.toggle('hurt', me.pips < PIPS || me.state === 'down')
    const cu = me.cu > 0 && me.state === 'ride'
    el.draft.textContent = me.boosting ? 'BOOST +18%' : cu ? 'CATCH-UP +14%' : 'SLIPSTREAM +10%'; el.draft.classList.toggle('show', (me.boosting || cu || me.draft > 0.5) && phase === 'race')
    el.bo.style.setProperty('--fill', me.boost.toFixed(3)); el.bo.classList.toggle('ready', me.boost >= 0.15 && !me.boosting); el.bo.classList.toggle('burn', me.boosting)
    const st = Math.min(1, me.strain).toFixed(3); el.kl.style.setProperty('--strain', st); el.kr.style.setProperty('--strain', st); el.kl.classList.toggle('risk', me.strain > 0.6); el.kr.classList.toggle('risk', me.strain > 0.6)
    for (const r of riders) { const d = el.rail.children[r.i + 1]; d.style.transform = 'translateX(' + (clamp(r.z / FINISH, 0, 1) * (el.rail.clientWidth - 12)) + 'px)' }
    el.kl.classList.toggle('cool', me.cd > 0); el.kr.classList.toggle('cool', me.cd > 0)
    if (phase === 'count') { const k = Math.ceil(countT - 0.2); if (k !== lastCount && k >= 1 && k <= 3) { lastCount = k; el.count.textContent = String(k); el.count.className = 'sk-count'; void el.count.offsetWidth; el.count.className = 'sk-count pop'; tone(440, 0.14, 'square', 0.06) } }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('show') }
    if (AC && engGain) { const live = phase === 'race' || phase === 'finishing' || phase === 'count'; engGain.gain.value = muted || !live ? 0 : 0.018 + sp * 0.02; eng.frequency.value = 48 + sp * 115 + (me.boosting ? 30 : 0) + (me.stag > 0 ? Math.sin(clock * 40) * 12 : 0) }
    if (minis.length && Math.floor(clock * 20) !== Math.floor((clock - dt) * 20)) { for (let i = 0; i < minis.length; i++) { miniTurn = (miniTurn + 1) % minis.length; if (drawMini(minis[miniTurn], clock)) break } }
    requestAnimationFrame(loop)
  }
  resetRace(true); setTheme('glass')
  window.__sk = { get riders() { return riders }, get phase() { return phase }, input, start: startRace, setTheme, setTrack, get track() { return trackId + ' ' + segs.length + ' segs ' + cars.length + ' cars' }, get finish() { return FINISH }, set frozen(v) { frozen = v }, set pixel(v) { pixel = v }, set avatars(v) { avatarsOn = v }, get avatarCount() { return AVS.length } }
  requestAnimationFrame(loop)
})()
