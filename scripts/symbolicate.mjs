// Turns a minified stack from an error report back into source positions.
//
//   node scripts/symbolicate.mjs <build id> [stack file]     (stack on stdin if no file)
//   npm run symbolicate -- AbC12_-9 < stack.txt
//
// The build id is the `build` field of the report (errors/{day}/... in the
// admin view or the daily digest). Maps come from sourcemaps/<build id>/, which
// `npm run build` fills; keep that folder for every release you deploy.

import fs from 'node:fs'
import path from 'node:path'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { parseStackFrames } from '../src/lib/sourcemapLogic.js'

const [buildId, stackFile] = process.argv.slice(2)
if (!buildId || !/^[\w-]{1,20}$/.test(buildId)) {
  console.error('usage: node scripts/symbolicate.mjs <build id> [stack file]')
  process.exit(2)
}
const dir = path.resolve('sourcemaps', buildId)
if (!fs.existsSync(dir)) {
  console.error(`no maps for build ${buildId}: ${dir} does not exist (was it built on this machine?)`)
  process.exit(1)
}

const stack = fs.readFileSync(stackFile || 0, 'utf8')
const traces = new Map()
const trace = (file) => {
  if (!traces.has(file)) {
    const mapPath = path.join(dir, `${file}.map`)
    traces.set(file, fs.existsSync(mapPath) ? new TraceMap(fs.readFileSync(mapPath, 'utf8')) : null)
  }
  return traces.get(file)
}

for (const frame of parseStackFrames(stack)) {
  const map = frame.file ? trace(frame.file) : null
  // Stack columns are 1-based, trace-mapping's are 0-based.
  const pos = map ? originalPositionFor(map, { line: frame.line, column: frame.col - 1 }) : null
  if (pos && pos.source) {
    console.log(`    at ${pos.name || '<anonymous>'} (${pos.source}:${pos.line}:${(pos.column ?? 0) + 1})`)
  } else {
    console.log(frame.raw)
  }
}
