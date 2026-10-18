// Deploy-time switches that decide which secrets a function binds.
const fs = require('node:fs')
const path = require('node:path')

/**
 * The deploy-time switch `name`: the process env first, then functions/.env.
 * firebase-tools evaluates the functions code to decide which secrets to bind
 * with an environment that holds neither the .env file nor the shell's
 * variables, so `process.env.<NAME>` is never set at that moment and the file
 * has to be read here.
 */
function deployFlag(name, env = process.env, file = path.join(__dirname, '.env')) {
  if (env[name] !== undefined && env[name] !== '') return env[name]
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && m[1] === name) return m[2].replace(/^(["'])(.*)\1$/, '$2')
    }
  } catch { /* no .env: the switch is off */ }
  return ''
}

module.exports = { deployFlag }
