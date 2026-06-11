export const GAME_MS     = 120_000
export const QUESTION_MS =   8_000

export function generateSeed() {
  return Math.floor(Math.random() * 1_000_000_000)
}

// Deterministic hash: mixes seed, question index, and a slot number
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

export function generateQuestion(seed, index) {
  const isPower = index % 8 === 5
  const level   = index < 20 ? 'easy' : index < 40 ? 'medium' : 'hard'

  let text, answer

  if (level === 'easy') {
    const type = seededChoice(['add', 'sub', 'mul'], seed, index, 0)
    if (type === 'add') {
      const a = seededRange(1, 9, seed, index, 1)
      const b = seededRange(1, 9, seed, index, 2)
      text = `${a} + ${b}`; answer = a + b
    } else if (type === 'sub') {
      const a = seededRange(3, 12, seed, index, 1)
      const b = seededRange(1, a - 1, seed, index, 2)
      text = `${a} − ${b}`; answer = a - b
    } else {
      const a = seededRange(2, 9, seed, index, 1)
      const b = seededRange(2, 9, seed, index, 2)
      text = `${a} × ${b}`; answer = a * b
    }
  } else if (level === 'medium') {
    const type = seededChoice(['add2', 'sub2', 'mul2', 'pct'], seed, index, 0)
    if (type === 'add2') {
      const a = seededRange(11, 79, seed, index, 1)
      const b = seededRange(11, 79, seed, index, 2)
      text = `${a} + ${b}`; answer = a + b
    } else if (type === 'sub2') {
      const a = seededRange(30, 99, seed, index, 1)
      const b = seededRange(11, 25, seed, index, 2)
      text = `${a} − ${b}`; answer = a - b
    } else if (type === 'mul2') {
      const a = seededRange(3, 12, seed, index, 1)
      const b = seededRange(11, 25, seed, index, 2)
      text = `${a} × ${b}`; answer = a * b
    } else {
      const pctVariants = [[25, 4], [50, 2], [75, 4]]
      const [pct, mult] = seededChoice(pctVariants, seed, index, 1)
      const k    = seededRange(2, 20, seed, index, 2)
      const base = k * mult
      text = `${pct}% of ${base}`; answer = Math.round(base * pct / 100)
    }
  } else {
    const type = seededChoice(['mul3', 'sq', 'oop'], seed, index, 0)
    if (type === 'mul3') {
      const a = seededRange(13, 25, seed, index, 1)
      const b = seededRange(3,  9, seed, index, 2)
      text = `${a} × ${b}`; answer = a * b
    } else if (type === 'sq') {
      const a = seededRange(6, 15, seed, index, 1)
      text = `${a}²`; answer = a * a
    } else {
      const a = seededRange(2, 9, seed, index, 1)
      const b = seededRange(2, 9, seed, index, 2)
      const c = seededRange(2, 9, seed, index, 3)
      text = `${a} + ${b} × ${c}`; answer = a + b * c
    }
  }

  return { text, answer, isPower }
}
