// @ts-check
// Pure request builders and decision policy for the server-side chat
// moderation and report triage (functions/chatModeration.js), which ask
// TypeSafe's Jev model for typed judgments. No network, Firebase or React —
// unit-tested in chatModerationLogic.test.js and bundled into the functions
// through functions/src/core.mjs.
//
// Jev answers the questions; this file owns the policy. The wordlist mask
// (moderationLogic.moderateText) stays the instant client-side first pass;
// this is a context-aware second pass that catches what a list cannot
// (spaced-out slurs, insults with no bad words, contact fishing) and tells
// banter from abuse.

export const JEV_MODEL = 'jev-latest'
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

// Message categories. `fine` and `friendly_banter` never act.
export const MOD_CATEGORIES = {
  fine: 'Ordinary game chat: greetings, reactions, questions, talk about the game.',
  friendly_banter: 'Playful trash talk about the game or a move, with no insult aimed at who someone is.',
  targeted_insult: 'Insults, humiliation or harassment aimed at a person in the room.',
  hate_or_slur: 'Slurs or attacks on a group (race, religion, gender, sexuality, disability), including spaced out, misspelled or leetspeak versions.',
  sexual: 'Sexual content, sexual comments about someone, or sexual requests.',
  self_harm: 'Telling someone to hurt or kill themselves, or encouraging self-harm.',
  contact_or_personal_info: 'Asking for or sharing contact details or personal information: phone numbers, social handles, addresses, school, age, meeting up, moving to another app.',
  spam_or_ad: 'Advertising, links pushed repeatedly, scams or repeated junk.',
}

// Categories serious enough to hide the line when Jev is confident.
export const HIDE_CATEGORIES = ['targeted_insult', 'hate_or_slur', 'sexual', 'self_harm', 'contact_or_personal_info', 'spam_or_ad']

export const SEVERITY_LEVELS = [
  'Harmless: nothing anyone would object to.',
  'Mild: rude or crude, but not aimed to hurt anyone.',
  'Harmful: hurtful, harassing, sexual or privacy-seeking content aimed at a player.',
  'Severe: slurs, threats, self-harm encouragement, or targeting someone who may be a child.',
]

// Illustrative starting points (TypeSafe's moderation cookbook routes below a
// 0.60 top probability to people). Tune them on real Game Night chat before
// relying on them.
export const MOD_THRESHOLDS = {
  hideProbability: 0.75,
  reviewProbability: 0.45,
  hideSeverity: 1.6,
}

/**
 * The Jev request for one new chat line.
 * @param {{ message: { text: string, name?: string }, recent?: Array<{ name?: string, text?: string }>, room?: { gameType?: string, public?: boolean, spectator?: boolean } }} input
 */
export function buildModerationRequest({ message, recent = [], room = {} }) {
  return {
    model: JEV_MODEL,
    state: {
      message: { author: String(message?.name || 'PLAYER').slice(0, 40), text: String(message?.text || '').slice(0, 200) },
      recent: recent.slice(-6).map(m => ({ author: String(m?.name || 'PLAYER').slice(0, 40), text: String(m?.text || '').slice(0, 200) })),
      room: {
        game: String(room.gameType || 'unknown'),
        public: !!room.public,
        authorIsSpectator: !!room.spectator,
        audience: 'A casual multiplayer game app played by friends and strangers, including teenagers.',
      },
    },
    questions: {
      category: {
        type: 'choice',
        instructions: 'Which category best describes `message.text`, read in the context of `recent` (the lines just before it)?',
        criteria: MOD_CATEGORIES,
      },
      severity: {
        type: 'score',
        instructions: 'How harmful is `message.text` to the people in this room?',
        criteria: SEVERITY_LEVELS,
      },
      aimed_at_player: {
        type: 'noul',
        instructions: 'Is `message.text` aimed at a specific person in the room rather than at the game or nobody in particular?',
        criteria: { true: 'It addresses or targets a person in the room.', false: 'It is about the game, the speaker, or nobody in particular.' },
      },
    },
  }
}

/**
 * What to do with a chat line, from Jev's answers. Pure policy.
 * Returns { action: 'none' | 'hide' | 'review', category, probability }.
 *  - hide: a serious category with a confident top probability (or a high
 *    severity score) — the line is hidden for everyone and counted as a strike.
 *  - review: a serious category Jev is unsure about — left visible, queued
 *    for an admin.
 *  - none: fine, banter, or nothing serious.
 * @param {any} answers the `answers` object of a Jev response
 */
export function moderationDecision(answers, thresholds = MOD_THRESHOLDS) {
  const cat = answers?.category
  const category = typeof cat?.choice === 'string' ? cat.choice : null
  const probability = category && typeof cat?.probabilities?.[category] === 'number' ? cat.probabilities[category] : 0
  const severity = typeof answers?.severity?.score === 'number' ? answers.severity.score : 0
  if (!category || !HIDE_CATEGORIES.includes(category)) return { action: 'none', category, probability }
  if (probability >= thresholds.hideProbability || (probability >= thresholds.reviewProbability && severity >= thresholds.hideSeverity)) {
    return { action: 'hide', category, probability }
  }
  if (probability >= thresholds.reviewProbability || severity >= thresholds.hideSeverity) {
    return { action: 'review', category, probability }
  }
  return { action: 'none', category, probability }
}

export const TRIAGE_CATEGORIES = { ...MOD_CATEGORIES, not_a_violation: 'Nothing in the reported content breaks the rules.' }

/**
 * The Jev request for a player report (chat, profile or drawing).
 * @param {{ message?: string, text?: string, chatContext?: string, targetName?: string }} report
 */
export function buildTriageRequest(report) {
  return {
    model: JEV_MODEL,
    state: {
      reported: { player: String(report?.targetName || 'PLAYER').slice(0, 40), content: String(report?.text || '').slice(0, 200), summary: String(report?.message || '').slice(0, 300) },
      conversation: String(report?.chatContext || '').slice(0, 1000),
    },
    questions: {
      category: {
        type: 'choice',
        instructions: 'Which category best describes `reported.content`, read in the context of `conversation` if there is one?',
        criteria: TRIAGE_CATEGORIES,
      },
      severity: {
        type: 'score',
        instructions: 'How harmful is the reported content?',
        criteria: SEVERITY_LEVELS,
      },
      supported: {
        type: 'noul',
        instructions: 'Does the evidence support the report, rather than looking like a mistake, retaliation or a sore loser?',
        criteria: { true: 'The reported content itself breaks the rules.', false: 'The content looks harmless; the report is likely unfounded.' },
      },
    },
  }
}

/**
 * The triage record stored on the report for the admin inbox, and its sort
 * key: higher `priority` first. Probabilities are kept raw so the inbox can
 * be re-sorted without asking Jev again.
 * @param {any} answers
 */
export function triageSummary(answers, now = Date.now()) {
  const category = typeof answers?.category?.choice === 'string' ? answers.category.choice : 'unknown'
  const confidence = typeof answers?.category?.confidence === 'number' ? answers.category.confidence : 0
  const severity = typeof answers?.severity?.score === 'number' ? answers.severity.score : 0
  const supported = typeof answers?.supported?.noul === 'number' ? answers.supported.noul : 0
  const serious = category !== 'not_a_violation' && category !== 'fine' && category !== 'friendly_banter'
  const priority = Math.round(((serious ? 1 : 0.25) * (severity / 3) * 0.6 + supported * 0.4) * 100) / 100
  return { category, confidence, severity, supported, priority, at: now }
}
