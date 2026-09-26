// Deterministic trig for the vendored planck build (planck-det.min.js has every
// Math.sin / Math.cos rewritten to __detSin / __detCos). Same Taylor + range
// reduction as src/lib/artilleryLogic.js, so the prototype honours the repo's
// existing determinism contract: only + - * / (and correctly-rounded sqrt).
(function () {
  var TWO_PI = 6.283185307179586
  var INV_TWO_PI = 1 / TWO_PI
  var HALF_PI = Math.PI / 2
  var RF = [1, 1 / 6, 1 / 120, 1 / 5040, 1 / 362880, 1 / 39916800, 1 / 6227020800,
    1 / 1307674368000, 1 / 355687428096000, 1 / 121645100408832000]
  function taylorSin(x) {
    var x2 = x * x
    var acc = RF[9]
    for (var k = 8; k >= 0; k--) acc = RF[k] - x2 * acc
    return x * acc
  }
  function detSin(x) {
    var r = x - Math.floor(x * INV_TWO_PI) * TWO_PI
    if (r < 0) r += TWO_PI
    if (r <= HALF_PI) return taylorSin(r)
    if (r <= Math.PI) return taylorSin(Math.PI - r)
    if (r <= 3 * HALF_PI) return -taylorSin(r - Math.PI)
    return -taylorSin(TWO_PI - r)
  }
  function detCos(x) { return detSin(x + HALF_PI) }
  window.__detSin = detSin
  window.__detCos = detCos
})()
