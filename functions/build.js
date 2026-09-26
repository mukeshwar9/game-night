// Bundles src/core.mjs — and the app's pure src/lib/*Logic.js modules it
// imports — into lib/core.cjs, the one file results.js requires. The app code
// lives outside functions/, which is all `firebase deploy` uploads, so the
// bundle has to exist before deploy (firebase.json runs this as the functions
// predeploy step) and before the emulator loads the functions.
//
//   npm --prefix functions run build
const path = require('node:path')
const { buildSync } = require('esbuild')

buildSync({
  entryPoints: [path.join(__dirname, 'src/core.mjs')],
  outfile: path.join(__dirname, 'lib/core.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // Readable output: this is server code, and stack traces should point at
  // recognisable function names.
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
})
