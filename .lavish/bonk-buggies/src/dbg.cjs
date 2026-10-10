const fs = require('fs'), vm = require('vm'), path = require('path')
for (const f of ['det.js', 'planck-det.min.js', 'sim.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f })
const S = BonkSim
const arena = process.argv[2] || 'seesaw'
const st = S.createRound({ arena, n: 2 })
for (let k = 0; k < 108; k++) S.step(st, null, 1 / 60)
const show = (tag) => console.log(tag, st.cars.map(c => { const p = c.chassis.getPosition(), v = c.chassis.getLinearVelocity(); return `x${p.x.toFixed(2)} y${p.y.toFixed(2)} a${S.norm(c.chassis.getAngle()).toFixed(2)} vx${v.x.toFixed(1)} g${c.ground} ht${c.headTouch}` }).join(' | '), st.planks[0] ? 'plank a ' + st.planks[0].body.getAngle().toFixed(2) : '', 'mass', (st.cars[0].chassis.getMass()+2*st.cars[0].wheels[0].getMass()).toFixed(2))
show('settled')
S.start(st)
for (let k = 1; k <= 180 && st.phase === 'play'; k++) { S.step(st, [{ d: 1 }, { d: 0 }], 1 / 60); if (k % 15 === 0) show('t' + (k / 60).toFixed(2)) }
console.log(st.outcome)
