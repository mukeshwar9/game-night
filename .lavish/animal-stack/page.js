// Design-page glue: theme toggle, clickable mockup flows, scene canvases, piece grid, decisions.
(function () {
  'use strict'
  var A = window.AnimalStack, S = window.AS_SCENES
  var G = ['●', '▲', '■', '◆'], PT = ['p1', 'p2', 'p3', 'p4']
  var NAMES = ['ALEX', 'MAYA', 'BEN', 'KIM']
  var proto = null

  // ---------------------------------------------------------------- theme
  function setTheme(t) {
    if (t === 'matcha') document.documentElement.setAttribute('data-theme', 'matcha')
    else document.documentElement.removeAttribute('data-theme')
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t)) })
    try { localStorage.setItem('as-design-theme', t) } catch (e) {}
    A.readTokens(); drawAllScenes(); drawPieces(); if (proto) proto.retheme()
  }

  // ---------------------------------------------------------------- building blocks
  function hdr(line) {
    return '<div class="hdr"><span class="pix t10 dim">← HOME</span><span class="ic"><span title="settings">⚙</span><span title="rules">?</span><span title="switch game">▦</span><span title="FILL: arena fills the screen">⛶</span></span></div>' +
      (line ? '<div class="roomline">' + line + '</div>' : '')
  }
  function pcard(i, o) {
    o = o || {}
    var hearts = ''
    var max = o.max || 3
    for (var h = 0; h < max; h++) hearts += h < (o.hearts == null ? max : o.hearts) ? '♥' : '·'
    return '<div class="pcard' + (o.on ? ' on' : '') + (o.out ? ' out' : '') + '" style="--pc:var(--c-' + PT[i] + ')">' +
      '<div class="av">' + G[i] + '</div><div style="min-width:0"><div class="pname mono">' + (o.name || NAMES[i]) + (o.you ? ' <span class="t10 dim">YOU</span>' : '') + '</div>' +
      '<div class="hearts">' + hearts + (o.dot ? ' <span class="win" style="font-size:8px">●</span>' : '') + '</div></div></div>'
  }
  function rail(n, active, o) {
    o = o || {}
    var s = '<div class="rail n' + n + '">'
    for (var i = 0; i < n; i++) s += pcard(i, { on: i === active, hearts: o.hearts ? o.hearts[i] : null, max: n === 2 ? 3 : 2, out: o.out && o.out[i], you: o.you === i, name: o.names && o.names[i] })
    return s + '</div>'
  }
  function arena(scene, extra) {
    return '<div class="arena"><canvas data-scene=\'' + JSON.stringify(scene) + '\'></canvas>' +
      (scene.noTimer ? '' : '<div class="ov tbar"><i style="width:' + (scene.timer || 62) + '%' + (scene.timer < 30 ? ';background:rgb(var(--c-danger))' : '') + '"></i></div>') +
      '<div class="ov hgt">▲ ' + (scene.h || '2.9') + ' M</div>' +
      (scene.next != null ? '<div class="ov nextbox"><canvas data-thumb="' + scene.next + '"></canvas><span class="pix t7 dim">NEXT</span></div>' : '') +
      (extra || '') + '</div>'
  }
  function ctrls(on, hint) {
    return '<div class="ctrls"><button class="rot" ' + (on ? '' : 'disabled') + '><b>⟲</b>ROTATE</button><div class="hint">' + (hint || '◀ DRAG<br>TO AIM ▶') + '</div>' +
      '<button class="drop" data-go="' + (on || '') + '" ' + (on ? '' : 'disabled') + '>DROP</button></div>'
  }
  function pill(i, text) { return '<div class="ov pill" style="--pc:var(--c-' + PT[i] + ')">' + text + '</div>' }
  function go(target, label, cls) { return '<button class="' + (cls || 'btn-cta') + '" data-go="' + target + '">' + label + '</button>' }

  var hoverA = function (p, x, r) { return { k: S.nextA, x: x == null ? 0.35 : x, r: r || 0, player: p } }

  // ---------------------------------------------------------------- flows
  var FLOWS = {
    local: {
      title: 'SAME DEVICE · 2-4P',
      steps: [
        { id: 'L1', label: 'PICK MODE', html: function () {
          return hdr() + '<div class="pix t12 glow-cta" style="text-align:center;margin-top:6px">GAMES</div>' +
            '<div class="gcard"><span class="pix t9 dim" style="width:40px;text-align:center">✦</span><div><div class="pix t9">ARTILLERY</div><div class="mono t10 dim"><span class="p2">2P</span> · ~8 min</div></div></div>' +
            '<div class="gcard sel"><canvas data-thumb="0" style="width:40px;height:32px"></canvas><div><div class="pix t9">ANIMAL STACK</div><div class="mono t10 dim"><span class="p2">1-4P</span> · ~6 min · NEW</div></div></div>' +
            '<div class="sheet"><div class="grab"></div><div class="pix t10" style="margin-bottom:10px">ANIMAL STACK</div>' +
            '<div class="optrow" data-go="O1"><span style="font-size:18px">⌂</span><div><div class="pix t9">ONLINE ROOM</div><div class="mono t10 dim">invite friends · 2-4 phones</div></div><span class="badge">2-4P</span></div>' +
            '<div class="optrow tapzone" data-go="L2"><span style="font-size:18px">⇆</span><div><div class="pix t9">SAME DEVICE</div><div class="mono t10 dim">pass the phone between drops</div></div><span class="badge">2-4P</span></div>' +
            '<div class="optrow" data-go="S1"><span style="font-size:18px">⚙</span><div><div class="pix t9">VS BOT</div><div class="mono t10 dim">easy · normal · hard</div></div><span class="badge">1P</span></div>' +
            '<div class="optrow" data-go="S2"><span style="font-size:18px">▲</span><div><div class="pix t9">CLIMB</div><div class="mono t10 dim">solo height chase · best 7.4 m</div></div><span class="badge">1P</span></div></div>'
        }, note: ['GameOptionsSheet rows, one per mode. SAME DEVICE badge becomes 2-4P (today it is 2P-only, GameOptionsSheet.jsx:146).', 'Catalogue meta line reads 1-4P because solo exists; getPlayerTag() needs a 1-4P case.'] },
        { id: 'L2', label: 'SETUP', html: function (st) {
          var n = st.n || 3, rows = ''
          for (var i = 0; i < n; i++) rows += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><div class="av" style="--pc:var(--c-' + PT[i] + ');width:40px;height:40px;font-size:16px">' + G[i] + '</div><div class="field mono">' + NAMES[i] + '</div><span class="pix t8 dim">P' + (i + 1) + '</span></div>'
          return hdr('ANIMAL STACK · SAME DEVICE') +
            '<div class="lbl">PLAYERS</div><div class="segm" data-seg>' + [2, 3, 4].map(function (k) { return '<span data-n="' + k + '" class="' + (k === n ? 'on' : '') + '">' + k + 'P</span>' }).join('') + '</div>' +
            '<div class="lbl" style="margin-top:6px">WHO\'S PLAYING</div>' + rows +
            '<div class="lbl" style="margin-top:4px">HOUSE RULES</div>' +
            '<div class="swrow"><span>Hearts each</span><span class="pix t9 cta">' + (n === 2 ? '♥♥♥' : '♥♥') + '</span></div>' +
            '<div class="swrow"><span>Turn timer 15 s</span><span class="sw"></span></div>' +
            '<div class="swrow"><span>Hand-off screen between turns</span><span class="sw"></span></div>' +
            '<div style="margin-top:auto;display:flex;justify-content:center">' + go('L3', 'START') + '</div>'
        }, note: ['Player count 2 / 3 / 4 (tap to change). Colours and glyphs are fixed per seat (● ▲ ■ ◆) so they never depend on colour alone.', 'Names are optional (default P1..P4); avatar sprites from AvatarPicker can come later. Hearts: 3 each for 2P, 2 each for 3-4P (≈ 6-9 min).', 'Timer and hand-off gate default OFF on one device: there is no hidden information to protect.'] },
        { id: 'L3', label: 'YOUR DROP', html: function () {
          return hdr('ANIMAL STACK · SAME DEVICE') + rail(3, 0) +
            arena({ tower: 'A', hover: hoverA(0), next: S.afterA, thumbs: 1 }, pill(0, '● ALEX · YOUR DROP')) + ctrls('L4')
        }, note: ['Arena ≈ 70% of the screen; the piece hovers above the tower with a dashed drop guide in the player\'s colour.', 'Drag anywhere on the arena to move the piece (relative drag, so your thumb never covers it). ⟲ rotates 15°, hold to spin. DROP lets go.', 'Tap DROP to see the hand-off.'], thumbs: true },
        { id: 'L4', label: 'HAND-OFF', html: function () {
          return hdr('ANIMAL STACK · SAME DEVICE') + rail(3, 1) +
            arena({ tower: 'A', hover: hoverA(1, -0.4, 6), next: S.afterA, timer: 96 }, pill(1, '▲ MAYA · YOUR DROP')) + ctrls('L5') +
            '<div style="text-align:center"><button class="btn-p1" data-go="L4b">SHOW HAND-OFF GATE VARIANT</button></div>'
        }, note: ['Default hand-off is a 1.8 s banner in the next player\'s colour + glyph, the rail highlight moves, and a two-note "go" chirp plays. The tower keeps its camera position so nobody loses context.', 'Optional gate (house rule) for tabletop groups who want a deliberate pass.'] },
        { id: 'L4b', label: 'GATE (OPT.)', html: function () {
          return hdr('ANIMAL STACK · SAME DEVICE') + rail(3, 1) + arena({ tower: 'A', next: S.afterA, noTimer: true }) + ctrls(false) +
            '<div class="gate" style="--pc:var(--c-p2)"><div class="bigglyph">▲</div><div class="pix t12" style="color:rgb(var(--pc))">PASS TO MAYA</div>' +
            '<div class="mono t11 dim">tower 2.9 m · 7 animals · next: ' + A.PIECES[S.nextA].name.toLowerCase() + '</div>' + go('L5', 'I\'M READY') + '</div>'
        }, note: ['Only when "Hand-off screen" is on. Stops accidental drags by the previous player while the phone changes hands.'] },
        { id: 'L5', label: 'TOPPLE!', html: function () {
          return hdr('ANIMAL STACK · SAME DEVICE') + rail(3, 1) + arena({ tower: 'topple', noTimer: true, h: '2.9' }, '<div class="ov stamp">TOPPLE!</div>') + ctrls(false, 'TOWER<br>FELL') +
            '<div style="text-align:center">' + go('L6', 'CONTINUE', 'btn-p1') + '</div>'
        }, note: ['Any animal leaving the island ends the tower. Slow-mo 0.5× for ~0.8 s, screen shake, TOPPLE! stamp, descending 4-note sting, vibrate [0,60,40,120] where supported.', 'Reduced motion: no slow-mo or shake; stamp fades in.'] },
        { id: 'L6', label: 'ROUND OVER', html: function () {
          return hdr('ANIMAL STACK · SAME DEVICE') + rail(3, 2, { hearts: [2, 1, 2] }) + arena({ tower: 'A', noTimer: true },
            '<div class="ov" style="inset:0;display:flex;align-items:center;justify-content:center;background:rgb(var(--c-bg)/.7);padding:18px"><div class="panel" style="width:100%"><div class="pix t9 dim">TOWER 2 · TOPPLED BY</div>' +
            '<div class="pix t14" style="font-size:14px;color:rgb(var(--c-p2))">▲ MAYA −♥</div><div class="mono t11">8 animals · 2.9 m · Maya starts the next tower</div>' + go('L7', 'NEXT TOWER') + '</div></div>') + ctrls(false)
        }, note: ['The toppler loses a heart and starts the next tower (catch-up: first drop on an empty island is the easiest).', 'Players on 0 hearts are skipped and shown greyed.'] },
        { id: 'L7', label: 'MATCH OVER', html: function () {
          return hdr('ANIMAL STACK · SAME DEVICE') + rail(3, -1, { hearts: [1, 0, 0], out: [0, 1, 1] }) +
            '<div class="panel" style="margin-top:6px"><div class="pix t10 dim" style="letter-spacing:.14em">MATCH OVER</div><div class="pix glow-cta" style="font-size:16px;color:rgb(var(--c-p1))">● ALEX WINS!</div>' +
            '<div class="scorelist mono"><div><span class="p1">●</span> ALEX<span class="r">♥ · 14 drops · 0 topples</span></div><div><span class="p2">▲</span> MAYA<span class="r">out · 12 drops</span></div><div><span class="p3">■</span> BEN<span class="r">out · 13 drops</span></div>' +
            '<div class="dim" style="border-top:1px solid rgb(var(--c-border));padding-top:6px">TALLEST TOWER 4.1 m · 11 animals</div></div>' +
            '<div class="lbl" style="margin-top:6px">PLAY SOMETHING ELSE</div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center"><span class="btn-sec t9" style="min-height:40px;padding:8px 10px">▦ ARTILLERY</span><span class="btn-sec t9" style="min-height:40px;padding:8px 10px">▦ SUMO</span><button class="btn-p1">SWITCH GAME</button></div></div>' +
            '<div class="sticky">' + go('L3', 'PLAY AGAIN') + '<button class="btn-sec" data-go="L2">PLAYERS</button></div>'
        }, note: ['Same shape as GameStatus.jsx MATCH OVER: headline, score list, PLAY SOMETHING ELSE chips + SWITCH GAME, sticky action bar with PLAY AGAIN (locked 450 ms after finish).', 'Pass-and-play keeps names/seats for PLAY AGAIN; PLAYERS returns to setup.'] },
      ],
    },
    online: {
      title: 'ONLINE ROOM · 2-4P',
      steps: [
        { id: 'O1', label: 'LOBBY', html: function () {
          return hdr('ANIMAL STACK · ROOM K7QX') +
            '<div class="lbl">SEATS · 3 / 4</div>' +
            '<div class="seat full">' + '<div class="av" style="--pc:var(--c-p1)">●</div><div class="mono t12">ALEX <span class="t10 dim">YOU · HOST</span></div><span class="win" style="margin-left:auto">●</span></div>' +
            '<div class="seat full"><div class="av" style="--pc:var(--c-p2)">▲</div><div class="mono t12">MAYA</div><span class="win" style="margin-left:auto">●</span></div>' +
            '<div class="seat full"><div class="av" style="--pc:var(--c-p3)">■</div><div class="mono t12">BEN</div><span class="win" style="margin-left:auto">●</span></div>' +
            '<div class="seat"><div class="av" style="--pc:var(--c-border)">◆</div><div><div class="pix t8 dim">OPEN SEAT</div><div class="mono t10 dim">share to fill</div></div></div>' +
            '<div style="display:flex;gap:8px;justify-content:center"><button class="btn-sec">⎘ COPY LINK</button><button class="btn-sec">▦ QR</button><button class="btn-sec">☺ FRIENDS</button></div>' +
            '<div class="mono t11 dim" style="text-align:center">Hearts: ♥♥ each (3-4P) · turn timer 15 s</div>' +
            '<div style="margin-top:auto;text-align:center">' + go('O2', 'START · 3 PLAYERS') + '<div class="mono t10 dim" style="margin-top:6px">host starts once 2+ are seated</div></div>' +
            '<div class="chatbar"><span>😂</span><span>👏</span><span>😱</span><span>🐘</span><span>🔥</span><span>💬</span></div>'
        }, note: ['Reuses the nPlayer party lobby: seats keyed by uid (players/{uid}), joinPartySeat transaction, QR + invite + friends modal, ghost-seat sweep.', 'START is coordinator-gated (roomCoordinator): the first online seat in join order, or TRANSFER HOST.', 'Latecomers after START spectate (partyJoinPlan) and are seated at the next NEW MATCH.'] },
        { id: 'O2', label: 'YOUR TURN', html: function () {
          return hdr('ANIMAL STACK · ROOM K7QX') + rail(3, 0, { you: 0 }) +
            arena({ tower: 'A', hover: hoverA(0, 0.2, 18), next: S.afterA, timer: 70 }, pill(0, '● YOUR DROP · 0:11')) + ctrls('O3') +
            '<div class="chatbar"><span>😂</span><span>👏</span><span>😱</span><span>🐘</span><span>🔥</span><span>💬</span></div>'
        }, note: ['While aiming, the active client writes a throttled ghost (stack/aim {x,r}, ≤6 Hz) so everyone sees the piece move. Only DROP is authoritative.', 'DROP = one runTransaction: CAS on turn + drop count, append {x, r} (piece index is derived from the seed, never sent).', 'Emote bar stays; chat collapses to 💬 and FILL (⛶) hides both.'] },
        { id: 'O3', label: 'WATCHING', html: function () {
          return hdr('ANIMAL STACK · ROOM K7QX') + rail(3, 1, { you: 0 }) +
            arena({ tower: 'A', hover: hoverA(1, -0.9, 6), next: S.afterA, timer: 45 }, pill(1, '▲ MAYA IS AIMING… 0:07') + '<div class="ov watch" style="bottom:8px;left:8px">👁 2 WATCHING</div>') + ctrls(false, 'NOT YOUR<br>TURN') +
            '<div style="text-align:center"><button class="btn-p1" data-go="O4">SIMULATE: MAYA DROPS</button></div>'
        }, note: ['Other players and spectators see the live ghost and the timer; controls are disabled, not hidden, so the layout never jumps.', 'Spectators (spectators/{uid}) get the same view with a WATCHING chip.'] },
        { id: 'O4', label: 'SETTLING', html: function () {
          return hdr('ANIMAL STACK · ROOM K7QX') + rail(3, 1, { you: 0 }) +
            arena({ tower: 'A', next: S.afterA, noTimer: true }, pill(1, '▲ SETTLING · · ·')) + ctrls(false, 'WAIT…') +
            '<div class="note cta" style="margin:0;font-size:11px">Every client simulates the drop locally from the last checkpoint → identical tower. First to finish writes the checkpoint (hash + poses, CAS on drop #). Others compare hashes.</div>' +
            '<div style="text-align:center"><button class="btn-p1" data-go="O5">SIMULATE: BEN GOES OFFLINE</button></div>'
        }, note: ['No WebRTC: this is turn-based, so RTDB alone carries it (Artillery precedent).', 'If a client\'s hash disagrees (should never happen with deterministic trig), it snaps to the checkpoint poses and logs stack_desync to analytics.'] },
        { id: 'O5', label: 'AWAY', html: function () {
          return hdr('ANIMAL STACK · ROOM K7QX') + rail(3, 2, { you: 0 }) +
            '<div class="banner-away"><span style="font-size:18px">⚠</span><div><div class="pix t8 danger">BEN IS AWAY</div><div class="mono">auto-drop at centre in 0:08 · 2nd miss = out</div></div></div>' +
            arena({ tower: 'A', hover: hoverA(2, 0, 0), next: S.afterA, timer: 22 }, pill(2, '■ BEN · OFFLINE')) + ctrls(false, 'WAITING<br>FOR BEN') +
            '<div style="text-align:center"><button class="btn-p1" data-go="O6">SKIP TO RESULTS</button></div>'
        }, note: ['Server-clock deadline (useServerClock). On expiry the room coordinator writes the drop for the absent player at their last ghost aim (or centre, 0°).', 'Two consecutive auto-drops while offline = eliminated (CR4 skipAwayTurn pattern). Leaving mid-match = out; last player standing wins.'] },
        { id: 'O6', label: 'RESULTS', html: function () {
          return hdr('ANIMAL STACK · ROOM K7QX') + rail(3, -1, { you: 0, hearts: [0, 1, 0], out: [1, 0, 1] }) +
            '<div class="panel"><div class="pix t10 dim" style="letter-spacing:.14em">MATCH OVER</div><div class="pix" style="font-size:15px;color:rgb(var(--c-p2))">▲ MAYA WINS!</div>' +
            '<div class="mono t11">you toppled tower 3 · 2nd place</div><div class="scorelist mono"><div><span class="p2">▲</span> MAYA<span class="r">winner · 0 topples</span></div><div><span class="p1">●</span> ALEX<span class="r">2 topples</span></div><div><span class="p3">■</span> BEN<span class="r">2 topples</span></div></div></div>' +
            '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap"><button class="btn-p1">SWITCH GAME</button></div>' +
            '<div class="sticky">' + go('O1', 'NEW MATCH') + '<button class="btn-sec">SHARE</button></div>'
        }, note: ['nPlayer rooms have no proposal handshake: the coordinator\'s NEW MATCH (applyNNewMatch) returns everyone to the lobby with seats kept; SWITCH GAME via GameSwitcher.', 'Leaderboard: creditMatchResults credits X/O seats only (functions/results.js:36), so party-seat wins are not credited today — same as Chain Reaction 4P.'] },
      ],
    },
    solo: {
      title: 'SOLO · BOT + CLIMB',
      steps: [
        { id: 'S1', label: 'VS BOT', html: function () {
          return hdr('ANIMAL STACK · SOLO') + '<div class="pix t12 glow-cta" style="text-align:center;margin:8px 0">VS BOT</div>' +
            ['EASY', 'NORMAL', 'HARD'].map(function (l, i) {
              return '<div class="optrow' + (i === 1 ? ' tapzone' : '') + '" data-go="S1b"><span class="pix t12" style="width:36px;text-align:center;color:rgb(var(--c-' + ['win', 'cta', 'danger'][i] + '))">' + ['·', '··', '···'][i] + '</span><div><div class="pix t9">' + l + '</div><div class="mono t10 dim">' + ['tries 8 spots, shaky aim', 'tries 22 spots, steady hand', 'tries 44 spots, no mistakes'][i] + '</div></div></div>'
            }).join('') + '<div class="mono t11 dim" style="text-align:center">3 hearts each · you drop first · win to unlock HARD streaks</div>'
        }, note: ['Bot = Monte-Carlo placement search: simulate N candidate (x, rotation) drops on a copy of the tower, keep the one that disturbs it least; aim noise by level. Implemented in the prototype below.', 'Runs in chunks (≤30 ms per frame) behind a THINKING pill; a Web Worker is optional.'] },
        { id: 'S1b', label: 'BOT TURN', html: function () {
          return hdr('ANIMAL STACK · SOLO') + rail(2, 1, { names: ['YOU', 'BOT·NORMAL'], you: 0 }) +
            arena({ tower: 'A', hover: hoverA(1, 0.9, 12), next: S.afterA, noTimer: true }, pill(1, '▲ BOT THINKING · · ·')) + ctrls(false, 'BOT\'S<br>TURN')
        }, note: ['The bot glides its piece to the chosen spot (~650 ms) so the player can read the move, then drops. PixelDots-style "thinking" per src/components/loading.'] },
        { id: 'S2', label: 'CLIMB', html: function () {
          return hdr('ANIMAL STACK · CLIMB') + '<div class="rail n2">' + pcard(0, { name: 'YOU', on: true, max: 0 }) + '<div class="pcard" style="--pc:var(--c-cta)"><div class="av">★</div><div><div class="pix t8 dim">BEST</div><div class="pix t10 cta">7.4 M</div></div></div></div>' +
            arena({ tower: 'B', hover: { k: S.nextB, x: 0, r: 0, player: 0 }, next: 3, noTimer: true, h: '5.7', best: 7.4 }) + ctrls('S3')
        }, note: ['Height chase: one tower, no timer, a dashed BEST line on the ruler. Score = tallest settled height (metres, 1 decimal).', 'Best per device via soloBest.js (readSoloBest/recordSoloBest), like the memory solos.', 'Optional later: DAILY TOWER — same seed for everyone that day (daily.js).'] },
        { id: 'S3', label: 'RUN OVER', html: function () {
          return hdr('ANIMAL STACK · CLIMB') + arena({ tower: 'B', noTimer: true, h: '5.7', best: 7.4 },
            '<div class="ov" style="inset:0;display:flex;align-items:center;justify-content:center;background:rgb(var(--c-bg)/.7);padding:18px"><div class="panel" style="width:100%"><div class="pix t9 dim">RUN OVER</div><div class="pix glow-cta" style="font-size:18px">8.1 M</div><div class="pix t9 win">NEW BEST!</div><div class="mono t11">16 animals stacked · best was 7.4 m</div>' + go('S2', 'CLIMB AGAIN') + '<button class="btn-sec">SHARE</button></div></div>')
        }, note: ['Win-effect burst on a new best (WinEffect, 30 particles); SHARE uses the existing navigator.share busy pattern.'] },
      ],
    },
  }

  function mountFlow(key) {
    var F = FLOWS[key], host = document.getElementById('flow-' + key)
    var stepsEl = host.querySelector('.steps'), wrap = host.querySelector('.phone-wrap'), noteEl = host.querySelector('.stepnote')
    var st = { n: 3 }
    stepsEl.innerHTML = F.steps.map(function (s) { return '<button data-step="' + s.id + '">' + s.label + '</button>' }).join('')
    var phone = document.createElement('div'); phone.className = 'phone'; wrap.appendChild(phone)
    var thumbs = false
    function show(id) {
      var s = F.steps.filter(function (x) { return x.id === id })[0]
      if (!s) { // cross-flow jump
        for (var k in FLOWS) if (FLOWS[k].steps.some(function (x) { return x.id === id })) { document.getElementById('flow-' + k).scrollIntoView({ behavior: 'smooth', block: 'start' }); flowShow[k](id); return }
        return
      }
      phone.innerHTML = '<div class="scr">' + s.html(st) + '</div>'
      stepsEl.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-current', String(b.dataset.step === id)) })
      noteEl.innerHTML = '<h3>' + s.id + ' · ' + s.label + '</h3><ul class="tight">' + s.note.map(function (n) { return '<li>' + n + '</li>' }).join('') + '</ul>' +
        (s.thumbs ? '<label class="mono t11" style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" data-thumbs ' + (thumbs ? 'checked' : '') + '> show thumb-reach zones</label>' : '')
      if (s.thumbs && thumbs) addThumbs(phone)
      drawScenes(phone)
      st.cur = id
    }
    phone.addEventListener('click', function (e) {
      var seg = e.target.closest('[data-n]'); if (seg) { st.n = +seg.dataset.n; return show(st.cur) }
      var g = e.target.closest('[data-go]'); if (g && g.dataset.go) show(g.dataset.go)
    })
    stepsEl.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.step) })
    noteEl.addEventListener('change', function (e) { if (e.target.matches('[data-thumbs]')) { thumbs = e.target.checked; show(st.cur) } })
    flowShow[key] = show
    show(F.steps[0].id)
  }
  var flowShow = {}
  function addThumbs(phone) {
    var z = '<div class="thumbzone" style="left:-40px;width:240px;height:300px;background:rgb(var(--c-win)/.18);border:2px dashed rgb(var(--c-win))"></div>' +
      '<div class="thumbzone" style="right:-40px;width:240px;height:300px;background:rgb(var(--c-win)/.18);border:2px dashed rgb(var(--c-win))"></div>' +
      '<div style="position:absolute;bottom:310px;left:0;right:0;text-align:center;z-index:3" class="pix t8 win">EASY THUMB REACH</div>'
    phone.insertAdjacentHTML('beforeend', z)
  }

  // ---------------------------------------------------------------- scenes
  var TOPS = {}
  function towerFor(name) {
    if (name === 'A') return S.towerA
    if (name === 'B') return S.towerB
    if (name === 'topple') return S.topple
    return []
  }
  function topOf(name) {
    if (TOPS[name] == null) TOPS[name] = name === 'topple' ? A.stateTop(S.towerA) : A.stateTop(towerFor(name))
    return TOPS[name]
  }
  function drawScene(cv) {
    var sc = JSON.parse(cv.dataset.scene)
    var items = towerFor(sc.tower).map(function (s, i) {
      return { k: s.k, x: s.x, y: s.y, a: s.a, outline: sc.tower === 'topple' && i === S.toppleDrop ? 'p2' : null }
    })
    var top = topOf(sc.tower)
    var W = cv.clientWidth, H = cv.clientHeight
    var r = sc.hover ? A.PIECES[sc.hover.k].radius : 0.8
    var view = A.viewFor(W, H, top, r)
    var hover = sc.hover ? { k: sc.hover.k, x: sc.hover.x, y: top + A.PIECES[sc.hover.k].radius + 0.45, a: sc.hover.r * A.ROT_STEP, player: sc.hover.player } : null
    A.drawScene(cv, { items: items, hover: hover, guide: !!hover, view: view, t: 0, best: sc.best || 0 })
  }
  function drawScenes(root) {
    root.querySelectorAll('canvas[data-scene]').forEach(drawScene)
    root.querySelectorAll('canvas[data-thumb]').forEach(function (c) { A.thumb(c, +c.dataset.thumb) })
  }
  function drawAllScenes() { drawScenes(document) }

  function drawPieces() {
    var host = document.getElementById('pieces'); if (!host) return
    if (!host.children.length) {
      host.innerHTML = A.PIECES.map(function (p, i) {
        return '<div class="piece"><canvas data-thumb="' + i + '"></canvas><div class="pix t8">' + p.name + '</div>' +
          '<div class="mono t10 dim">' + p.parts.length + ' part' + (p.parts.length > 1 ? 's' : '') + ' · ρ ' + p.density + ' · ' + p.mass.toFixed(2) + ' kg</div><span class="tag ' + (p.weight === 'HEAVY' ? 'danger' : p.weight === 'LIGHT' ? 'win' : 'dim') + '">' + p.weight + '</span></div>'
      }).join('')
    }
    host.querySelectorAll('canvas[data-thumb]').forEach(function (c) { A.thumb(c, +c.dataset.thumb) })
  }

  // ---------------------------------------------------------------- scaling
  function fitPhones() {
    document.querySelectorAll('.phone-wrap').forEach(function (w) {
      var ph = w.querySelector('.phone'); if (!ph) return
      var land = ph.classList.contains('land')
      var baseW = land ? 844 : 390, baseH = land ? 390 : 844
      var avail = w.parentElement.clientWidth
      var target = land ? Math.min(avail, 760) : Math.min(avail, 340)
      var s = target / baseW
      w.style.width = target + 'px'; w.style.height = baseH * s + 'px'
      ph.style.transform = 'scale(' + s + ')'
    })
  }

  // ---------------------------------------------------------------- decisions
  function wireDecisions() {
    document.querySelectorAll('form[data-lavish-question]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault()
        var q = f.getAttribute('data-lavish-question'), fd = new FormData(f)
        var choice = fd.get('c'), why = (fd.get('why') || '').trim()
        if (!choice) return
        var title = f.querySelector('h3').textContent
        var msg = 'Animal Stack decision ' + q + ' (' + title + '): ' + choice + (why ? ' — note: ' + why : '')
        var st = f.querySelector('.qstat')
        if (window.lavish && window.lavish.queuePrompt) {
          window.lavish.queuePrompt(msg, { tag: 'choice', text: q + ': ' + choice, element: f, queueKey: q, data: { question: q, answer: choice, note: why } })
          st.textContent = 'queued ✓ (press Send to Agent)'
        } else st.textContent = 'selected (open in Lavish to send)'
      })
    })
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    var t = 'matcha'
    try { t = localStorage.getItem('as-design-theme') || 'matcha' } catch (e) {}
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) { b.addEventListener('click', function () { setTheme(b.dataset.themeBtn) }) })
    if (t === 'matcha') document.documentElement.setAttribute('data-theme', 'matcha'); else document.documentElement.removeAttribute('data-theme')
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t)) })
    A.readTokens()
    ;['local', 'online', 'solo'].forEach(mountFlow)
    // landscape frame
    var lw = document.getElementById('land-wrap')
    var lp = document.createElement('div'); lp.className = 'phone land'
    lp.innerHTML = '<div class="scr" style="flex-direction:row;padding:14px 20px 14px 46px;gap:12px">' +
      '<div style="width:170px;display:flex;flex-direction:column;gap:8px">' + hdr() + '<div class="rail" style="grid-template-columns:1fr">' + pcard(0, { on: true, max: 2 }) + pcard(1, { max: 2 }) + pcard(2, { max: 2, hearts: 1 }) + '</div>' +
      '<button class="rot" style="margin-top:auto;min-height:70px;border:2px solid rgb(var(--c-border));background:rgb(var(--c-card));color:rgb(var(--c-text));border-radius:6px;font-family:\'Press Start 2P\';font-size:8px"><b style="font-size:20px;display:block">⟲</b>ROTATE</button></div>' +
      '<div style="flex:1;display:flex;flex-direction:column;min-width:0">' + arena({ tower: 'A', hover: hoverA(0), next: S.afterA }, pill(0, '● ALEX · YOUR DROP')) + '</div>' +
      '<div style="width:130px;display:flex;flex-direction:column;justify-content:flex-end"><button class="drop" style="min-height:120px;background:rgb(var(--c-cta));color:rgb(var(--c-bg));border:0;border-radius:6px;font-family:\'Press Start 2P\';font-size:14px">DROP</button></div></div>'
    lw.appendChild(lp)
    fitPhones()
    drawAllScenes(); drawPieces()
    window.addEventListener('resize', function () { fitPhones(); drawAllScenes() })
    proto = window.AnimalStackProto.mount(document.getElementById('proto'))
    wireDecisions()
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAllScenes)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot()
})()
