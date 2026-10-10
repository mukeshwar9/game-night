const fs = require('fs'), vm = require('vm'), path = require('path')
for (const f of ['det.js', 'planck-det.min.js', 'sim.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f })
const S = BonkSim; let seed = +(process.argv[3] || 3); const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
const st = S.createRound({ arena: process.argv[2] || 'halfpipe', n: 2 }); const bots = [S.makeBot('hard', rng), S.makeBot('hard', rng)]
for (let k = 0; k < 108; k++) S.step(st, null, 1 / 60); S.start(st)
for (let k = 1; k <= 1200 && st.phase === 'play'; k++) { const inp = st.cars.map((c, i) => bots[i](st, i, 1 / 60)); S.step(st, inp, 1 / 60); st.events.length = 0
  if (k % 30 === 0) console.log((k / 60).toFixed(1), st.cars.map((c, i) => { const p = c.chassis.getPosition(); return `x${p.x.toFixed(1)} y${p.y.toFixed(1)} a${S.norm(c.chassis.getAngle()).toFixed(1)} g${c.ground} d${inp[i].d}` }).join(' | '), 'w', st.water.toFixed(1)) }
console.log(JSON.stringify(st.outcome))
