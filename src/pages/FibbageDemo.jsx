import { useEffect, useReducer, useRef, useState } from 'react'
import PartyBotSetup from '../components/PartyBotSetup'
import Avatar from '../components/Avatar'
import { FIBBAGE_FACTS } from '../lib/decks/fibbage'
import {
  seatOrder, hashString, seededShuffle, buildOptions, attributeOptions, scoreRound,
  allLied, allVoted, POINTS_FOR_TRUTH, POINTS_PER_FOOL,
} from '../lib/fibbageLogic'
import { generateBotRoster, pickBotLie, pickBotVote } from '../lib/partyBots'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo FIBBAGE: human + 2-7 local bots, no Firebase, no commit-reveal — lies live as
// plaintext in local reducer state and authorship simply isn't rendered until the
// reveal phase (see PartyBotSetup task brief). Mounted by Demo.jsx as <FibbageDemo />.

const MIN_BOTS = 2
const MAX_BOTS = 7
const DEFAULT_BOT_COUNT = 3
// Kept in sync with FibbageGame.jsx
const MATCH_WIN_SCORE = 5000

const norm = (s) => String(s ?? '').trim().toLowerCase()

const allFactIndices = () => FIBBAGE_FACTS.map((_, i) => i)

// Seat-ordered scoreboard rows, richer than seatOrder() alone (adds avatar/score).
function rankPlayers(players, scores) {
  return seatOrder(players)
    .map(id => ({ id, name: players[id]?.name || id, avatar: players[id]?.avatar, score: scores[id] || 0 }))
    .sort((a, b) => b.score - a.score)
}

const initialState = {
  phase: 'setup', // setup -> lying -> voting -> reveal -> (lying...) -> matchover
  botCount: DEFAULT_BOT_COUNT,
  matchSeed: 0,
  round: 0,
  roster: [],       // bots only, [{id, name, avatar, persona}]
  players: {},       // synthetic seatOrder map: { human: {...}, 'bot-1': {...}, ... }
  promptQueue: [],   // shuffled FIBBAGE_FACTS indices
  queueGen: 0,       // reshuffle generation, used to derive the next queue's seed
  queuePos: 0,
  promptIndex: 0,
  lies: {},          // { [playerId]: text } — plaintext, local-only, no commit-reveal
  usedDecoys: [],     // decoy texts already picked by a bot this prompt
  myLieText: null,    // the human's own lie (own-lie ballot guard)
  options: null,       // anonymised ballot for the current prompt
  richOptions: null,   // options + `by` (author), populated once voting completes
  roundDeltas: null,   // { [playerId]: points } scored this round
  votes: {},           // { [playerId]: optionId }
  scores: {},          // { [playerId]: totalScore }
}

// Builds the ballot + flips to voting once every seat has a lie in.
function advanceIfAllLied(state) {
  const seatIds = seatOrder(state.players)
  if (!allLied(seatIds, state.lies)) return state
  const fact = FIBBAGE_FACTS[state.promptIndex % FIBBAGE_FACTS.length]
  const texts = seatIds.map(id => state.lies[id])
  const seed = hashString(`${state.matchSeed}:${state.promptIndex}:${state.round}`)
  const options = buildOptions(fact.answer, texts, seed)
  return { ...state, options, phase: 'voting' }
}

// Scores the round + flips to reveal once every seat has voted.
function advanceIfAllVoted(state) {
  const seatIds = seatOrder(state.players)
  if (!allVoted(seatIds, state.votes)) return state
  const fact = FIBBAGE_FACTS[state.promptIndex % FIBBAGE_FACTS.length]
  // No commit-reveal in solo mode — `state.lies` IS the verified author->lie map.
  const richOptions = attributeOptions(state.options, fact.answer, state.lies)
  const roundDeltas = scoreRound(richOptions, state.votes)
  const scores = { ...state.scores }
  for (const [id, pts] of Object.entries(roundDeltas)) scores[id] = (scores[id] || 0) + pts
  return { ...state, richOptions, roundDeltas, scores, phase: 'reveal' }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_BOT_COUNT':
      return { ...state, botCount: Math.min(MAX_BOTS, Math.max(MIN_BOTS, action.botCount)) }

    case 'START': {
      const { botCount, seed, humanAvatar } = action
      const roster = generateBotRoster(botCount, seed)
      const players = { human: { playerId: 'human', joinedAt: 0, name: 'YOU', avatar: humanAvatar } }
      roster.forEach((bot, i) => {
        players[bot.id] = { playerId: bot.id, joinedAt: i + 1, name: bot.name, avatar: bot.avatar }
      })
      const promptQueue = seededShuffle(allFactIndices(), hashString(`${seed}-queue-0`))
      const scores = {}
      Object.keys(players).forEach(id => { scores[id] = 0 })
      return {
        ...initialState,
        phase: 'lying',
        botCount,
        matchSeed: seed,
        round: 1,
        roster,
        players,
        promptQueue,
        queuePos: 0,
        promptIndex: promptQueue[0],
        scores,
      }
    }

    case 'RESET_TO_SETUP':
      return { ...initialState, botCount: state.botCount }

    case 'HUMAN_LIE': {
      if (state.phase !== 'lying' || state.lies.human != null) return state
      return advanceIfAllLied({ ...state, lies: { ...state.lies, human: action.text }, myLieText: action.text })
    }

    case 'BOT_LIE': {
      if (state.phase !== 'lying' || state.lies[action.botId] != null) return state
      const usedDecoys = action.text ? [...state.usedDecoys, action.text] : state.usedDecoys
      return advanceIfAllLied({ ...state, lies: { ...state.lies, [action.botId]: action.text }, usedDecoys })
    }

    case 'HUMAN_VOTE': {
      if (state.phase !== 'voting' || state.votes.human != null) return state
      return advanceIfAllVoted({ ...state, votes: { ...state.votes, human: action.optionId } })
    }

    case 'BOT_VOTE': {
      if (state.phase !== 'voting' || state.votes[action.botId] != null) return state
      return advanceIfAllVoted({ ...state, votes: { ...state.votes, [action.botId]: action.optionId } })
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'reveal') return state
      const matchOver = Object.values(state.scores).some(s => s >= MATCH_WIN_SCORE)
      if (matchOver) return { ...state, phase: 'matchover' }
      let { promptQueue, queuePos, queueGen } = state
      let nextPos = queuePos + 1
      if (nextPos >= promptQueue.length) {
        queueGen += 1
        promptQueue = seededShuffle(allFactIndices(), hashString(`${state.matchSeed}-queue-${queueGen}`))
        nextPos = 0
      }
      return {
        ...state,
        phase: 'lying',
        round: state.round + 1,
        promptQueue,
        queuePos: nextPos,
        queueGen,
        promptIndex: promptQueue[nextPos],
        lies: {},
        usedDecoys: [],
        myLieText: null,
        options: null,
        richOptions: null,
        roundDeltas: null,
        votes: {},
      }
    }

    default:
      return state
  }
}

export default function FibbageDemo() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [lieInput, setLieInput] = useState('')
  const [inputError, setInputError] = useState('')
  // Stable across the whole setup session so the bot-count stepper doesn't reroll
  // the preview roster's faces/names on every render — only when botCount changes.
  const [previewSeed] = useState(() => Math.random())
  const [myAvatar] = useState(() => {
    try { return localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId()) }
    catch { return defaultAvatarForId(getPlayerId()) }
  })

  // Mirrors state.usedDecoys for the staggered bot-lie timers below — a ref (not
  // the reducer state) because a timer fired 450ms ago needs the LATEST used-decoy
  // set at the moment it actually runs, not the one captured when it was scheduled.
  const usedDecoysRef = useRef([])
  useEffect(() => { usedDecoysRef.current = state.usedDecoys }, [state.usedDecoys])

  // Phase-change sounds, mirroring FibbageGame.jsx's own prevPhase-ref pattern.
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (state.phase === prevPhaseRef.current) return
    prevPhaseRef.current = state.phase
    if (state.phase === 'voting') {
      sounds.go()
    } else if (state.phase === 'reveal') {
      const truthOpt = state.richOptions?.find(o => o.by === null)
      const humanFoundTruth = !!truthOpt && state.votes.human === truthOpt.id
      if (humanFoundTruth) sounds.win()
      else sounds.miss()
    } else if (state.phase === 'matchover') {
      const champ = rankPlayers(state.players, state.scores)[0]
      if (champ?.id === 'human') sounds.matchWin()
      else sounds.lose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reads current state on the render where phase actually changed; re-running on every state field would refire past sounds
  }, [state.phase])

  // Clear the lie input/error whenever a fresh prompt begins. Ref-compare-then-bail
  // (mirroring FibbageGame.jsx's own prevPromptIndex-ref reset effect) rather than an
  // unconditional setState, per the "adjusting state when a prop changes" pattern.
  const prevPromptKeyRef = useRef(`${state.round}-${state.promptIndex}`)
  useEffect(() => {
    const key = `${state.round}-${state.promptIndex}`
    if (key === prevPromptKeyRef.current) return
    prevPromptKeyRef.current = key
    setLieInput('')
    setInputError('')
  }, [state.round, state.promptIndex])

  // Bots submit staggered lies once the lying phase begins. Cleared on phase/round
  // change (covers unmount too, since that also tears down the effect).
  useEffect(() => {
    if (state.phase !== 'lying') return
    const fact = FIBBAGE_FACTS[state.promptIndex % FIBBAGE_FACTS.length]
    const timers = state.roster.map((bot, i) => setTimeout(() => {
      const text = pickBotLie(fact, usedDecoysRef.current, bot.persona) || fact.decoys?.[0] || 'SOMETHING ELSE'
      dispatch({ type: 'BOT_LIE', botId: bot.id, text })
    }, 600 + i * 450 + Math.floor(Math.random() * 300)))
    return () => timers.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roster/promptIndex are fixed for the lifetime of a given (phase, round) pair; re-running only on their change is intentional
  }, [state.phase, state.round])

  // Bots cast staggered votes once the voting phase begins.
  useEffect(() => {
    if (state.phase !== 'voting') return
    const fact = FIBBAGE_FACTS[state.promptIndex % FIBBAGE_FACTS.length]
    const options = state.options || []
    const lies = state.lies
    const timers = state.roster.map((bot, i) => setTimeout(() => {
      const optionId = pickBotVote(options, fact.answer, lies[bot.id], bot.persona)
      if (optionId) dispatch({ type: 'BOT_VOTE', botId: bot.id, optionId })
    }, 600 + i * 450 + Math.floor(Math.random() * 300)))
    return () => timers.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- options/lies are fixed for the lifetime of the voting phase; re-running only on (phase, round) is intentional
  }, [state.phase, state.round])

  const handleStart = () => {
    dispatch({ type: 'START', botCount: state.botCount, seed: Math.random(), humanAvatar: myAvatar })
  }

  const handleSubmitLie = () => {
    if (state.phase !== 'lying' || state.lies.human != null) return
    const fact = FIBBAGE_FACTS[state.promptIndex % FIBBAGE_FACTS.length]
    const text = lieInput.trim()
    if (!text) { setInputError('TYPE YOUR LIE'); return }
    if (norm(text) === norm(fact.answer)) { setInputError("THAT'S THE TRUTH — LIE HARDER"); return }
    setInputError('')
    sounds.move('X')
    dispatch({ type: 'HUMAN_LIE', text })
  }

  const handleVote = (optionId) => {
    if (state.phase !== 'voting' || state.votes.human != null) return
    const opt = (state.options || []).find(o => o.id === optionId)
    if (opt && state.myLieText && norm(opt.text) === norm(state.myLieText)) return
    sounds.move('O')
    dispatch({ type: 'HUMAN_VOTE', optionId })
  }

  const handleNextRound = () => dispatch({ type: 'NEXT_ROUND' })
  const handlePlayAgain = () => dispatch({ type: 'RESET_TO_SETUP' })

  // -------------------------------------------------------------------------
  // SETUP
  // -------------------------------------------------------------------------
  if (state.phase === 'setup') {
    const previewRoster = generateBotRoster(state.botCount, previewSeed)
    return (
      <PartyBotSetup
        title="FIBBAGE"
        blurb="Invent fake answers. Fool the bots. Find the truth for big points."
        botCount={state.botCount}
        onBotCount={(n) => dispatch({ type: 'SET_BOT_COUNT', botCount: n })}
        roster={previewRoster}
        onStart={handleStart}
        minBots={MIN_BOTS}
        maxBots={MAX_BOTS}
      />
    )
  }

  // -------------------------------------------------------------------------
  // MATCHOVER
  // -------------------------------------------------------------------------
  if (state.phase === 'matchover') {
    const ranked = rankPlayers(state.players, state.scores)
    const champ = ranked[0]
    const iWon = champ?.id === 'human'
    return (
      <div className="space-y-5 text-center py-2">
        <div className="space-y-1">
          <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
          <p className="font-pixel text-base text-retro-cta text-glow-cta">
            {iWon ? 'YOU WIN!' : `${champ?.name || 'BOT'} WINS`}
          </p>
        </div>

        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">FINAL SCORES</p>
          {ranked.map(p => (
            <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
              <span className={cn('flex items-center gap-1.5 truncate', p.id === 'human' ? 'text-retro-p1' : 'text-retro-text')}>
                <Avatar id={p.avatar} size={20} />
                {p.name}
              </span>
              <span className="text-retro-cta shrink-0 ml-2">{p.score}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handlePlayAgain}
          className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
        >
          PLAY AGAIN
        </button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // LYING / VOTING / REVEAL
  // -------------------------------------------------------------------------
  const fact = FIBBAGE_FACTS[state.promptIndex % FIBBAGE_FACTS.length]
  const promptDisplay = fact.prompt.replace('___', state.phase === 'reveal' ? `「${fact.answer}」` : '_____')
  const seatIds = seatOrder(state.players)
  const committedCount = Object.keys(state.lies).length
  const votedCount = Object.keys(state.votes).length
  const iCommitted = state.lies.human != null
  const iVoted = state.votes.human != null
  const myLieNorm = state.myLieText ? norm(state.myLieText) : null
  const matchWillEnd = Object.values(state.scores).some(s => s >= MATCH_WIN_SCORE)

  return (
    <div className="space-y-4">
      <p className="text-center font-pixel text-[8px] text-retro-dim">ROUND {state.round}</p>

      {/* Prompt */}
      <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">
          {state.phase === 'lying' ? 'INVENT A LIE' : state.phase === 'voting' ? 'WHICH IS TRUE?' : 'THE TRUTH'}
        </p>
        <p className="font-mono text-[13px] text-retro-text leading-relaxed text-center">
          {promptDisplay}
        </p>
      </div>

      {/* ---- LYING PHASE ---- */}
      {state.phase === 'lying' && (
        <div className="space-y-3">
          {!iCommitted ? (
            <div className="space-y-2">
              <input
                type="text"
                value={lieInput}
                maxLength={60}
                onChange={e => { setLieInput(e.target.value); setInputError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSubmitLie()}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="YOUR FAKE ANSWER"
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1"
              />
              {inputError && <p className="font-pixel text-[9px] text-retro-p2 text-center">{inputError}</p>}
              <button
                onClick={handleSubmitLie}
                className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
              >
                SUBMIT LIE
              </button>
            </div>
          ) : (
            <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center arcade-blink">
              LIE LOCKED ✓
            </p>
          )}
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {committedCount}/{seatIds.length} LIED…
          </p>
          <p className="font-pixel text-[7px] text-retro-dim text-center">
            TRUTH +{POINTS_FOR_TRUTH} · PER FOOL +{POINTS_PER_FOOL}
          </p>
        </div>
      )}

      {/* ---- VOTING PHASE ---- */}
      {state.phase === 'voting' && (
        <div className="space-y-2">
          {(state.options || []).map(opt => {
            const isMine = !!myLieNorm && norm(opt.text) === myLieNorm
            const picked = state.votes.human === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => handleVote(opt.id)}
                disabled={iVoted || isMine}
                className={cn(
                  'w-full min-h-11 px-3 py-2.5 font-mono text-[12px] text-left rounded border-2 transition-all active:scale-[0.98]',
                  picked
                    ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                    : 'border-retro-border text-retro-text hover:border-retro-p1/50',
                  (isMine || (iVoted && !picked)) && 'opacity-40',
                  isMine && 'cursor-not-allowed',
                )}
              >
                {opt.text}{isMine ? '  (YOUR LIE)' : ''}
              </button>
            )
          })}
          <p className="font-pixel text-[9px] text-retro-dim text-center pt-1">
            {iVoted ? `VOTED ✓ — ${votedCount}/${seatIds.length} IN` : 'PICK THE TRUTH'}
          </p>
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {state.phase === 'reveal' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {(state.richOptions || []).map(opt => {
              const isTruth = opt.by === null
              const authors = isTruth ? [] : (opt.by || [])
              const voters = Object.entries(state.votes)
                .filter(([, oid]) => oid === opt.id)
                .map(([vid]) => state.players[vid]?.name || vid)
              const authorNames = authors.map(a => state.players[a]?.name || a)
              return (
                <div
                  key={opt.id}
                  className={cn(
                    'px-3 py-2 rounded border-2',
                    isTruth ? 'border-retro-win text-retro-win shadow-neon-win' : 'border-retro-border text-retro-text',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px]">
                      {opt.text}{isTruth ? '  ✓ TRUTH' : ''}
                    </span>
                    <span className="font-pixel text-[8px] text-retro-dim shrink-0">
                      {voters.length} VOTE{voters.length === 1 ? '' : 'S'}
                    </span>
                  </div>
                  {!isTruth && authorNames.length > 0 && (
                    <p className="font-pixel text-[8px] text-retro-p2 mt-1">
                      LIE BY {authorNames.join(', ').toUpperCase()}
                    </p>
                  )}
                  {voters.length > 0 && (
                    <p className="font-pixel text-[8px] text-retro-dim mt-0.5">
                      {voters.join(', ').toUpperCase()}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Scoreboard */}
          <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
            <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">SCORES</p>
            {rankPlayers(state.players, state.scores).map(p => {
              const delta = state.roundDeltas?.[p.id]
              return (
                <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
                  <span className={cn('flex items-center gap-1.5 truncate', p.id === 'human' ? 'text-retro-p1' : 'text-retro-text')}>
                    <Avatar id={p.avatar} size={20} />
                    {p.name}
                  </span>
                  <span className="flex items-center gap-2 shrink-0 ml-2">
                    {delta > 0 && <span className="font-pixel text-[8px] text-retro-win">+{delta}</span>}
                    <span className="text-retro-cta">{p.score}</span>
                  </span>
                </div>
              )
            })}
          </div>

          <button
            onClick={handleNextRound}
            className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
          >
            {matchWillEnd ? 'SEE FINAL RESULTS' : 'NEXT ROUND'}
          </button>
        </div>
      )}
    </div>
  )
}
