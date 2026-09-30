// Captures the HOW TO PLAY step-carousel stills from the running app.
//
//   npm run dev:emu -- --host 127.0.0.1               # in another shell
//   npm run rules:media [-- --only=connectfour,reversi]
//
// Per game and per look (light = MATCHA, dark = MIDNIGHT) it plays the
// /solo/:type bot demo and writes public/rule-media/{type}/{look}/step{1..3}.png,
// cropped to the board so the sheet stays short. It also updates
// src/lib/ruleMedia.json: for each step the caption as an *index* into
// src/lib/rules.js (never the text, so captions cannot drift) and a highlight
// box (percent of the still) read from the live DOM at capture time.
//
// Adapted from the scout's howtoplay-capture.mjs (clips and virtual time are
// gone — the carousel only needs stills). Math.random is seeded, so one commit
// gives the same game; if a seed loses, the scene is retried with the next.
import path from 'node:path'


const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const VIEW = { width: 390, height: 844 }
export const LOOKS = { light: 'matcha', dark: 'midnight' }
export const MAX_ATTEMPTS = 8

const { getWinner: tttWinner } = await import(path.resolve('src/lib/gameLogic.js'))
const { getTicTacToe4Winner } = await import(path.resolve('src/lib/tictactoe4Logic.js'))
const { getConnectFourWinner, getConnectFourDrop } = await import(path.resolve('src/lib/connectFourLogic.js'))
const { getGomokuWinner } = await import(path.resolve('src/lib/gomokuLogic.js'))
const { legalMoves, flippedBy } = await import(path.resolve('src/lib/reversiLogic.js'))

// ─── Page plumbing ──────────────────────────────────────────────────────────
function initScript({ seed, theme }) {
  let a = seed
  Math.random = () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  localStorage.setItem('playerName', 'Retro Panda')
  localStorage.setItem('onboarded', '1')
  localStorage.setItem('retro-theme', theme)
  // Music and its first-tap prompt have no place in a still.
  localStorage.setItem('music', 'off')
}

export async function openDemo(browser, route, theme, seed) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  await ctx.addInitScript(initScript, { seed, theme })
  const page = await ctx.newPage()
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  // a bot that blocks every line never loses; the stills need a win
  const easy = page.getByRole('button', { name: 'easy', exact: true })
  if (await easy.count()) await easy.click()
  const toasts = page.getByRole('button', { name: 'Close toast' })
  for (let i = 0; i < await toasts.count(); i++) await toasts.nth(i).click({ force: true }).catch(() => {})
  return { ctx, page }
}

// Padded union of bounding boxes, clamped to the viewport, even sizes.
async function unionRect(locators, pad) {
  const boxes = []
  for (const l of locators) { const b = await l.first().boundingBox(); if (b) boxes.push(b) }
  if (!boxes.length) throw new Error('crop target not found')
  const x0 = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad)
  const y0 = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad)
  const x1 = Math.min(VIEW.width, Math.max(...boxes.map(b => b.x + b.width)) + pad)
  const y1 = Math.min(VIEW.height, Math.max(...boxes.map(b => b.y + b.height)) + pad)
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round((x1 - x0) / 2) * 2, height: Math.round((y1 - y0) / 2) * 2 }
}

// Highlight box of everything a locator matches, relative to the crop, in %.
export async function highlight(target, crop) {
  const boxes = []
  const n = await target.count()
  for (let i = 0; i < n; i++) { const b = await target.nth(i).boundingBox(); if (b) boxes.push(b) }
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y))
  const x1 = Math.max(...boxes.map(b => b.x + b.width)), y1 = Math.max(...boxes.map(b => b.y + b.height))
  const pct = (v, total) => Math.round((v / total) * 1000) / 10
  return { x: pct(x0 - crop.x, crop.width), y: pct(y0 - crop.y, crop.height), w: pct(x1 - x0, crop.width), h: pct(y1 - y0, crop.height) }
}

const over = page => async () => (await page.getByText(/YOU WIN|CPU WINS|DRAW/).count()) > 0
async function waitFor(cond, ms = 8000) {
  for (let t = 0; t < ms; t += 100) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)) }
  return false
}
const readGrid = (page, sel) => page.locator(sel).evaluateAll(els => els.map(e => e.innerText.trim().replace(/[^XO]/g, '')))

// After a tap: let the bot answer and the board settle, so the highlight box
// read from the DOM matches the pixels of the still.
const settle = async page => {
  await page.waitForTimeout(250)
  await waitFor(async () => (await over(page)()) || (await page.getByText('YOUR TURN').count()) > 0)
  await page.waitForTimeout(400)
}

// ─── Scenes ─────────────────────────────────────────────────────────────────
// play(page, snap, { attempt }) drives the bot demo and calls snap() once per
// carousel still: `cap` is an index into rules.howToPlay, 'objective' or 'win';
// `target` is the locator to highlight (null = none). It returns true when the
// game reached the state the stills need, false to retry with another seed.
// `sources` are hashed into the manifest so a changed game flags stale media.
const cellByLabel = (page, frag) => page.locator(`[aria-label*="${frag}"]`)

function tttScene({ type, winnerOf, dim, caps }) {
  const cells = page => page.locator('button[aria-label^="Row "]')
  return {
    route: `/solo/${type}`,
    sources: ['src/components/Board.jsx', 'src/components/Cell.jsx', dim === 4 ? 'src/lib/tictactoe4Logic.js' : 'src/lib/gameLogic.js'],
    crop: page => unionRect([cells(page).first(), cells(page).last()], 8),
    async play(page, snap) {
      const board = () => readGrid(page, 'button[aria-label^="Row "]')
      const pick = b => {
        const empty = b.map((v, i) => v ? -1 : i).filter(i => i >= 0)
        const tries = sym => empty.find(i => { const n = [...b]; n[i] = sym; return winnerOf(n)?.winner === sym })
        const pref = (dim === 3 ? [4, 0, 2, 6, 8] : [5, 6, 9, 10]).find(i => !b[i])
        return tries('X') ?? tries('O') ?? pref ?? empty[0]
      }
      let moves = 0
      while (!(await over(page)()) && moves < dim * dim) {
        if (!(await waitFor(async () => (await over(page)()) || (await page.getByText('YOUR TURN').count()) > 0))) return false
        if (await over(page)()) break
        const b = await board()
        const mine = cells(page).nth(pick(b))
        await mine.click({ force: true })
        moves++
        await settle(page)
        if (moves === 1) await snap({ cap: 0, target: mine })
        if (moves === 2) await snap({ cap: caps[1], target: cellByLabel(page, 'empty').first() })
      }
      await page.waitForTimeout(500)
      if (!(await page.getByText('YOU WIN').count()) || moves < 2) return false
      await snap({ cap: 'win', target: cellByLabel(page, 'winning line') })
      return true
    },
  }
}

export const SCENES = {
  tictactoe: tttScene({ type: 'tictactoe', winnerOf: tttWinner, dim: 3, caps: [0, 1] }),
  tictactoe4: tttScene({ type: 'tictactoe4', winnerOf: getTicTacToe4Winner, dim: 4, caps: [0, 2] }),

  connectfour: {
    route: '/solo/connectfour',
    sources: ['src/components/ConnectFourBoard.jsx', 'src/lib/connectFourLogic.js'],
    crop: page => unionRect([page.getByRole('group', { name: /^Board,/ })], 3),
    async play(page, snap) {
      const cell = (r, c) => page.getByTestId(`c4-cell-${r}-${c - 1}`)
      const column = c => page.locator(`[data-testid^="c4-cell-"][data-testid$="-${c - 1}"]`)
      const readBoard = () => page.evaluate(() => Array.from({ length: 42 }, (_, i) =>
        document.querySelector(`[data-testid="c4-cell-${Math.floor(i / 7)}-${i % 7}"]`)?.innerText.trim() || ''))
      const pick = board => {
        const wins = sym => [1, 2, 3, 4, 5, 6, 7].find(c => {
          const i = getConnectFourDrop(board, c - 1)
          if (i < 0) return false
          const next = [...board]; next[i] = sym
          return getConnectFourWinner(next)?.winner === sym
        })
        return wins('X') || wins('O') || [4, 3, 5, 2, 6, 1, 7].find(c => getConnectFourDrop(board, c - 1) >= 0)
      }
      await snap({ cap: 0, target: column(4) })
      for (let move = 1; move < 16 && !(await over(page)()); move++) {
        if (!(await waitFor(async () => (await over(page)()) || page.getByRole('button', { name: /^Column 1,/ }).isEnabled()))) return false
        if (await over(page)()) break
        const c = pick(await readBoard())
        await cell(0, c).click({ force: true })
        await settle(page)
        if (move === 3) await snap({ cap: 1, target: column(c) })
      }
      await page.waitForTimeout(800)
      if (!(await page.getByText('YOU WIN').count())) return false
      await snap({ cap: 'win', target: cellByLabel(page, 'winning line') })
      return true
    },
  },

  gomoku: {
    route: '/solo/gomoku',
    sources: ['src/components/GomokuBoard.jsx', 'src/lib/gomokuLogic.js'],
    crop: page => unionRect([page.getByTestId('gomoku-cell-0-0'), page.getByTestId('gomoku-cell-14-14')], 6),
    async play(page, snap) {
      const DIM = 15
      const cell = i => page.getByTestId(`gomoku-cell-${Math.floor(i / DIM)}-${i % DIM}`)
      // Extend my longest run; take the win or the block when one is open.
      const pick = b => {
        const empty = b.map((v, i) => v ? -1 : i).filter(i => i >= 0)
        const wins = sym => empty.find(i => { const n = [...b]; n[i] = sym; return getGomokuWinner(n)?.winner === sym })
        const run = i => [[0, 1], [1, 0], [1, 1], [1, -1]].reduce((best, [dr, dc]) => {
          let n = 0
          for (const s of [1, -1]) for (let k = 1; k < 5; k++) {
            const r = Math.floor(i / DIM) + dr * s * k, c = i % DIM + dc * s * k
            if (r < 0 || c < 0 || r >= DIM || c >= DIM || b[r * DIM + c] !== 'X') break
            n++
          }
          return Math.max(best, n)
        }, 0)
        const dist = i => Math.abs(Math.floor(i / DIM) - 7) + Math.abs(i % DIM - 7)
        return wins('X') ?? wins('O') ?? empty.sort((p, q) => run(q) - run(p) || dist(p) - dist(q))[0]
      }
      let moves = 0
      while (!(await over(page)()) && moves < 40) {
        if (!(await waitFor(async () => (await over(page)()) || (await page.getByText('YOUR TURN').count()) > 0))) return false
        if (await over(page)()) break
        const b = await readGrid(page, '[data-testid^="gomoku-cell-"]')
        const mine = cell(pick(b))
        await mine.click({ force: true })
        moves++
        await settle(page)
        if (moves === 3) await snap({ cap: 0, target: mine })
        if (moves === 4) await snap({ cap: 'objective', target: cellByLabel(page, ' X') })
      }
      await page.waitForTimeout(500)
      if (!(await page.getByText('YOU WIN').count()) || moves < 5) return false
      await snap({ cap: 'win', target: cellByLabel(page, 'winning line') })
      return true
    },
  },

  reversi: {
    route: '/solo/reversi',
    sources: ['src/components/ReversiBoard.jsx', 'src/lib/reversiLogic.js'],
    crop: page => unionRect([page.getByTestId('reversi-cell-0-0'), page.getByTestId('reversi-cell-7-7')], 6),
    async play(page, snap) {
      const cell = i => page.getByTestId(`reversi-cell-${Math.floor(i / 8)}-${i % 8}`)
      const readBoard = () => readGrid(page, '[data-testid^="reversi-cell-"]')
      const turn = async () => (await over(page)()) || (await page.getByText('YOUR TURN').count()) > 0
      const play = async () => {
        if (!(await waitFor(turn))) return false
        const b = await readBoard()
        const best = legalMoves(b, 'X').sort((p, q) => flippedBy(b, q, 'X').length - flippedBy(b, p, 'X').length)[0]
        await cell(best).click({ force: true })
        await settle(page)
        return cell(best)
      }
      if (!(await waitFor(turn))) return false
      await snap({ cap: 0, target: cellByLabel(page, 'legal move') })
      const mine = await play()
      if (!mine) return false
      await snap({ cap: 1, target: mine })
      if (!(await play())) return false
      await waitFor(turn)
      await snap({ cap: 2, target: cellByLabel(page, 'legal move') })
      return true
    },
  },
}

