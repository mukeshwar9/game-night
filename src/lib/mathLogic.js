// Pure deterministic Mental Math generation and scoring — no DOM/Firebase/React.
export const GAME_MS = 120_000
export const QUESTION_MS = 8_000
export const STREAK_FOR_DOUBLE = 3
export const MATH_CONFIG_VERSION = 1
export const MATH_OPERATIONS = Object.freeze(['add', 'subtract', 'multiply', 'divide'])
export const MATH_RANGES = Object.freeze([9, 99, 999])
export const DEFAULT_MATH_CONFIG = Object.freeze({
  version: MATH_CONFIG_VERSION,
  operations: Object.freeze({ add: true, subtract: true, multiply: true, divide: false }),
  durationSeconds: 120,
  difficulty: 'progressive',
  range: 99,
})

const QUESTION_MS_BY_LEVEL = { easy: 8_000, medium: 10_000, hard: 13_000 }
const DIFFICULTIES = ['easy', 'progressive', 'hard']
const DURATIONS = [60, 120, 180]

export function normalizeMathConfig(raw) {
  const selected = MATH_OPERATIONS.filter(op => raw?.operations?.[op] === true)
  const operations = Object.fromEntries(MATH_OPERATIONS.map(op => [op, selected.length ? selected.includes(op) : DEFAULT_MATH_CONFIG.operations[op]]))
  return {
    version: MATH_CONFIG_VERSION,
    operations,
    durationSeconds: DURATIONS.includes(Number(raw?.durationSeconds)) ? Number(raw.durationSeconds) : DEFAULT_MATH_CONFIG.durationSeconds,
    difficulty: DIFFICULTIES.includes(raw?.difficulty) ? raw.difficulty : DEFAULT_MATH_CONFIG.difficulty,
    range: MATH_RANGES.includes(Number(raw?.range)) ? Number(raw.range) : DEFAULT_MATH_CONFIG.range,
  }
}

export function isValidMathConfig(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && raw.version === MATH_CONFIG_VERSION
    && !!raw.operations && typeof raw.operations === 'object' && !Array.isArray(raw.operations)
    && MATH_OPERATIONS.every(op => typeof raw.operations[op] === 'boolean')
    && MATH_OPERATIONS.some(op => raw.operations[op])
    && Object.keys(raw.operations).every(op => MATH_OPERATIONS.includes(op))
    && DURATIONS.includes(raw.durationSeconds)
    && DIFFICULTIES.includes(raw.difficulty)
    && MATH_RANGES.includes(raw.range)
    && Object.keys(raw).every(key => ['version', 'operations', 'durationSeconds', 'difficulty', 'range'].includes(key))
}

export function generateSeed() {
  return Math.floor(Math.random() * 1_000_000_000)
}

// Deterministic hash: mixes seed, question index, and a slot number.
function seededInt(seed, index, slot) {
  let h = ((seed | 0) + Math.imul(index, 1000003) + Math.imul(slot, 999983)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

function seededRange(min, max, seed, index, slot) {
  return min + (seededInt(seed, index, slot) % (max - min + 1))
}

function seededChoice(arr, seed, index, slot) {
  return arr[seededInt(seed, index, slot) % arr.length]
}

export function levelForIndex(index, difficulty = 'progressive') {
  const selected = typeof difficulty === 'object' ? normalizeMathConfig(difficulty).difficulty : difficulty
  if (selected === 'easy' || selected === 'hard') return selected
  return index < 20 ? 'easy' : index < 40 ? 'medium' : 'hard'
}

export function questionMsForIndex(index, configOrDifficulty = 'progressive') {
  return QUESTION_MS_BY_LEVEL[levelForIndex(index, configOrDifficulty)]
}

function rangeForQuestion(index, config, level) {
  if (config.difficulty === 'easy') return Math.min(9, config.range)
  if (config.difficulty === 'hard') return config.range
  if (level === 'easy') return Math.min(9, config.range)
  if (level === 'medium') return Math.min(99, config.range)
  return config.range
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b]
  return a
}

function question({ text, answer, family, operation, explanation, isPower, level, operands }) {
  return { text, answer, family, operation, explanation, isPower, level, operands }
}

/** Same seed + index + config yields the same integer question for every racer. */
export function generateQuestion(seed, index, rawConfig) {
  const config = normalizeMathConfig(rawConfig ?? DEFAULT_MATH_CONFIG)
  const level = levelForIndex(index, config.difficulty)
  const max = rangeForQuestion(index, config, level)
  const isPower = index % 8 === 5
  const operations = MATH_OPERATIONS.filter(op => config.operations[op])
  const operation = seededChoice(operations, seed, index, 0)
  const advanced = level !== 'easy'
  let families

  if (operation === 'add') families = advanced ? ['standard', 'double', 'missing'] : ['standard', 'double']
  else if (operation === 'subtract') families = advanced ? ['standard', 'missing'] : ['standard']
  else if (operation === 'multiply') {
    families = advanced ? ['standard', 'double', 'missing'] : ['standard', 'double']
    if (level === 'hard' && Math.floor(Math.sqrt(max)) >= 2) families.push('square')
    if (advanced) {
      const hasFriendlyPercent = [10, 20, 25, 50, 75].some(pct => Math.floor(max / (100 / gcd(100, pct))) >= 1)
      if (hasFriendlyPercent) families.push('percent')
    }
  } else families = advanced ? ['standard', 'missing'] : ['standard']

  const family = seededChoice(families, seed, index, 1)
  let text
  let answer
  let explanation
  let operands

  if (operation === 'add') {
    if (family === 'double') {
      const a = seededRange(1, max, seed, index, 2)
      text = `${a} + ${a}`; answer = a * 2
      explanation = `Double ${a} to get ${answer}.`
      operands = [a]
    } else if (family === 'missing') {
      const a = seededRange(1, max, seed, index, 2)
      const b = seededRange(1, max, seed, index, 3)
      text = `${a} + □ = ${a + b}`; answer = b
      explanation = `${a} needs ${b} more to make ${a + b}.`
      operands = [a, b]
    } else {
      const a = seededRange(1, max, seed, index, 2)
      const b = seededRange(1, max, seed, index, 3)
      text = `${a} + ${b}`; answer = a + b
      explanation = `${a} plus ${b} equals ${answer}.`
      operands = [a, b]
    }
  } else if (operation === 'subtract') {
    if (family === 'missing') {
      const result = seededRange(0, max - 1, seed, index, 2)
      const missing = seededRange(1, max - result, seed, index, 3)
      text = `${result + missing} − □ = ${result}`; answer = missing
      explanation = `${result + missing} minus ${missing} leaves ${result}.`
      operands = [result, missing]
    } else {
      const a = seededRange(1, max, seed, index, 2)
      const b = seededRange(0, a, seed, index, 3)
      text = `${a} − ${b}`; answer = a - b
      explanation = `${a} minus ${b} equals ${answer}.`
      operands = [a, b]
    }
  } else if (operation === 'multiply') {
    if (family === 'double') {
      const a = seededRange(1, max, seed, index, 2)
      text = `2 × ${a}`; answer = 2 * a
      explanation = `Two groups of ${a} make ${answer}.`
      operands = [2, a]
    } else if (family === 'missing') {
      const a = seededRange(1, max, seed, index, 2)
      const b = seededRange(1, max, seed, index, 3)
      text = `□ × ${b} = ${a * b}`; answer = a
      explanation = `${a} groups of ${b} make ${a * b}.`
      operands = [a, b]
    } else if (family === 'square') {
      const a = seededRange(2, Math.floor(Math.sqrt(max)), seed, index, 2)
      text = `${a}²`; answer = a * a
      explanation = `${a} squared is ${a} × ${a}, which equals ${answer}.`
      operands = [a]
    } else if (family === 'percent') {
      const percentages = [10, 20, 25, 50, 75]
        .filter(pct => Math.floor(max / (100 / gcd(100, pct))) >= 1)
      const pct = seededChoice(percentages, seed, index, 2)
      const step = 100 / gcd(100, pct)
      const base = seededRange(1, Math.floor(max / step), seed, index, 3) * step
      text = `${pct}% of ${base}`; answer = base * pct / 100
      explanation = `${pct}% of ${base} is ${answer}.`
      operands = [base]
    } else {
      const a = seededRange(1, max, seed, index, 2)
      const b = seededRange(1, max, seed, index, 3)
      text = `${a} × ${b}`; answer = a * b
      explanation = `${a} groups of ${b} make ${answer}.`
      operands = [a, b]
    }
  } else if (family === 'missing') {
    const divisor = seededRange(1, max, seed, index, 2)
    const maxQuotient = Math.max(1, Math.floor(max / divisor))
    const quotient = seededRange(1, maxQuotient, seed, index, 3)
    text = `${divisor * quotient} ÷ □ = ${quotient}`; answer = divisor
    explanation = `${divisor * quotient} divided by ${divisor} equals ${quotient}.`
    operands = [divisor, quotient]
  } else {
    const divisor = seededRange(1, max, seed, index, 2)
    const maxQuotient = Math.max(1, Math.floor(max / divisor))
    const quotient = seededRange(1, maxQuotient, seed, index, 3)
    text = `${divisor * quotient} ÷ ${divisor}`; answer = quotient
    explanation = `${divisor} × ${quotient} = ${divisor * quotient}, so the quotient is ${quotient}.`
    operands = [divisor, quotient]
  }

  return question({ text, answer, family, operation, explanation, isPower, level, operands })
}

/** Speed points: 5 for an instant answer down to a 1-point floor at the buzzer. */
export function speedPtsFor(elapsed, questionMs) {
  return Math.max(1, Math.ceil(5 * Math.max(0, (questionMs - elapsed) / questionMs)))
}

/**
 * Apply one submitted answer to `{ q, score, streak, correct, wrong }` stats.
 * Wrong answers reset streak and reveal the answer, but never remove points.
 */
export function scoreMathAnswer(stats, { seed, answer, elapsed, config }) {
  const s = normalizeMathStats(stats)
  const q = generateQuestion(seed, s.q, config)
  const submitted = typeof answer === 'number'
    ? answer
    : typeof answer === 'string' && /^\d+$/.test(answer) ? Number(answer) : NaN
  const correct = Number.isSafeInteger(submitted) && submitted === q.answer
  if (correct) {
    const speed = speedPtsFor(elapsed, questionMsForIndex(s.q, config))
    const powerMultiplier = q.isPower ? 2 : 1
    const streakMultiplier = s.streak >= STREAK_FOR_DOUBLE ? 2 : 1
    const powerBonus = speed * (powerMultiplier - 1) * streakMultiplier
    const streakBonus = speed * powerMultiplier * (streakMultiplier - 1)
    const pts = speed * powerMultiplier * streakMultiplier
    const streak = s.streak + 1
    return {
      correct, pts, speed, powerMultiplier, streakMultiplier, answer: q.answer,
      explanation: q.explanation, family: q.family,
      stats: {
        ...s,
        q: s.q + 1,
        score: s.score + pts,
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
        correct: s.correct + 1,
        speedPoints: s.speedPoints + speed,
        powerBonus: s.powerBonus + powerBonus,
        streakBonus: s.streakBonus + streakBonus,
      },
    }
  }
  return {
    correct: false, pts: 0, answer: q.answer, explanation: q.explanation, family: q.family,
    speed: null, powerMultiplier: q.isPower ? 2 : 1, streakMultiplier: 1,
    stats: { ...s, streak: 0, wrong: s.wrong + 1 },
  }
}

/** Record a missed question once; the caller advances after the reveal beat. */
export function timeoutMathQuestion(stats, fromIndex) {
  const s = normalizeMathStats(stats)
  return s.q === fromIndex ? { ...s, streak: 0, wrong: s.wrong + 1 } : s
}

/** Advance past question `fromIndex` (wrong-answer beat or timeout); no-op if already past. */
export function advanceMathQuestion(stats, fromIndex) {
  const s = normalizeMathStats(stats)
  return s.q === fromIndex ? { ...s, q: fromIndex + 1 } : s
}

export function normalizeMathStats(raw) {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0)
  return {
    q: n(raw?.q), score: n(raw?.score), streak: n(raw?.streak),
    correct: n(raw?.correct), wrong: n(raw?.wrong), bestStreak: n(raw?.bestStreak),
    speedPoints: n(raw?.speedPoints), powerBonus: n(raw?.powerBonus), streakBonus: n(raw?.streakBonus),
  }
}

// ── N-player race hooks (see raceLogic.js) ────────────────────────────────

export function mathRaceEntry(stats) {
  if (!stats) return { sortKey: null, score: null }
  const s = normalizeMathStats(stats)
  return { sortKey: [-s.score], score: s.score }
}

export function mathRow(stats) {
  const s = normalizeMathStats(stats)
  return {
    primary: `${s.score} PTS`,
    secondary: `${s.correct}✓ ${s.wrong}✗`,
    progress: null,
    status: stats ? 'racing' : 'idle',
    detail: `Q${s.q + 1}`,
  }
}
