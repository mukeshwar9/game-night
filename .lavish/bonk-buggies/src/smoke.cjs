// Headless smoke test: bot vs bot on every arena. Run: node src/smoke.cjs
const fs = require('fs'), vm = require('vm'), path = require('path')
for (const f of ['det.js', 'planck-det.min.js', 'sim.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f })
const S = BonkSim
let seed = 7; const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
const args = process.argv.slice(2)
const N = +(args[0] || 40), n = +(args[1] || 2), hop = args[2] === 'hop', mutator = args[3] || 'none', lv = (args[4] || 'hard,hard').split(',')
for (const A of S.ARENAS) {
  const reasons = {}, wins = Array(n).fill(0); let tot = 0, max = 0, min = 99, bad = 0, settleBad = 0, speed = 0
  for (let r = 0; r < N; r++) {
    const w0 = Date.now()
    const st = S.createRound({ arena: A.id, n, hop, mutator, flip: process.env.NOFLIP ? false : r % 2 === 1, swap: process.env.NOFLIP ? false : (r >> 1) % 2 === 1 })
    const bots = st.cars.map((c, i) => S.makeBot(lv[i % lv.length], rng))
    for (let k = 0; k < 108; k++) S.step(st, null, 1 / 60)
    if (st.cars.some(c => c.headTouch.length || Math.abs(S.norm(c.chassis.getAngle())) > 0.5)) settleBad++
    S.start(st)
    let k = 0
    while (st.phase === 'play' && k < 60 * 60) {
      S.step(st, st.cars.map((c, i) => bots[i](st, i, 1 / 60)), 1 / 60); st.events.length = 0; k++
      if (k === 60) speed += Math.abs(st.cars[0].chassis.getLinearVelocity().x)
    }
    if (Date.now() - w0 > 2500) console.log('SLOW round', A.id, r, (Date.now() - w0) + 'ms', 'steps', k)
    const p = st.cars[0].chassis.getPosition()
    if (!isFinite(p.x) || st.phase === 'play') bad++
    const o = st.outcome || { reason: 'none', winner: -1, t: 60 }
    reasons[o.reason + (o.double ? '(double)' : '')] = (reasons[o.reason + (o.double ? '(double)' : '')] || 0) + 1
    if (o.winner >= 0) wins[o.winner]++
    tot += o.t; max = Math.max(max, o.t); min = Math.min(min, o.t)
  }
  console.log(A.id.padEnd(9), 'avg', (tot / N).toFixed(1) + 's', 'min', min.toFixed(1), 'max', max.toFixed(1), 'wins', wins.join('/'), JSON.stringify(reasons), 'v@1s', (speed / N).toFixed(1), 'bad', bad, 'settleBad', settleBad)
}
