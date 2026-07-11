import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import PartyBotSetup from '../components/PartyBotSetup'
import { sounds } from '../lib/sounds'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { SPYFAIR_LOCATIONS } from '../lib/decks/spyfair'
import { SPY_REPLY_STYLES } from '../lib/decks/spyfairChat'
import {
  generateBotRoster,
  pickSpyfairLocation,
  assignSpyfairRoles,
  generateBotStatement,
  generateQuestionPrompt,
  pickBotSpyVote,
  renderSpyReply,
  tallySpyfairVotes,
} from '../lib/partyBots'
import { cn } from '@/lib/utils'

// Solo SPYFAIR: 1 human + N bots, fully local — no Firebase, no commit-reveal (the
// deck ships in the bundle either way, so there is no info-leak surface to defend
// here). Mirrors SpyfairGame.jsx's phase machine and round scoring but replaces
// every other-seat action (questioning chatter, votes) with partyBots.js decisions.

const HUMAN_ID = 'human'
const DEFAULT_BOT_COUNT = 3
// Kept in sync with SpyfairGame.jsx — first to this many round-points wins the match.
const MATCH_WINS = 3
const QUESTION_MS = 75 * 1000

function readOwnIdentity() {
  let name = 'YOU'
  let avatar
  try {
    name = localStorage.getItem('playerName') || 'YOU'
    avatar = localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  } catch {
    avatar = defaultAvatarForId(getPlayerId())
  }
  return { name, avatar }
}

function fmtClock(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function allParticipantIds(state) {
  return [...state.roster.map(b => b.id), HUMAN_ID]
}

// Round scoring — mirrors resolveRound() in SpyfairGame.jsx: spy caught (strict
// plurality landed on the spy, tie => NOT caught) means every non-spy scores;
// otherwise the spy alone scores.
function finalizeRound(state, spyWon) {
  const scores = { ...state.scores }
  if (spyWon) {
    scores[state.spyId] = (scores[state.spyId] || 0) + 1
  } else {
    for (const id of allParticipantIds(state)) {
      if (id !== state.spyId) scores[id] = (scores[id] || 0) + 1
    }
  }
  const matchWinnerId = allParticipantIds(state).find(id => (scores[id] || 0) >= MATCH_WINS) || null
  return { scores, matchWinnerId }
}

// Shared "deal a fresh round" fields — used by both the very first round (from
// setup) and every subsequent round (from a finished result).
function dealRoundFields({ locationIndex, spyId, roles }) {
  return {
    phase: 'reveal',
    locationIndex,
    spyId,
    roles,
    secretRevealed: false,
    feed: [],
    votes: {},
    timerEndsAt: null,
    paused: false,
    pendingAsk: null,
    lastRoleWordSeen: '',
    accusedId: null,
    resultOutcome: null,
    locationGuessOpen: false,
  }
}

function makeInitialState() {
  const botCount = DEFAULT_BOT_COUNT
  return {
    phase: 'setup',
    botCount,
    roster: generateBotRoster(botCount, Date.now()),
    round: 1,
    prevLocationIndex: -1,
    locationIndex: null,
    spyId: null,
    roles: {},
    scores: {},
    matchWinnerId: null,
    secretRevealed: false,
    feed: [],
    timerEndsAt: null,
    paused: false,
    pendingAsk: null,
    lastRoleWordSeen: '',
    votes: {},
    accusedId: null,
    resultOutcome: null,
    locationGuessOpen: false,
  }
}

// Every transition below is a pure merge — all randomness (dealing a round, bot
// chatter/votes) is rolled by effects/handlers *before* dispatch, so the action
// payload already carries whatever was decided.
function reducer(state, action) {
  switch (action.type) {
    case 'SET_BOT_COUNT_AND_ROSTER':
      return { ...state, botCount: action.botCount, roster: action.roster }

    case 'START_MATCH':
      return {
        ...state,
        ...dealRoundFields(action),
        round: 1,
        scores: {},
        matchWinnerId: null,
        prevLocationIndex: action.locationIndex,
      }

    case 'PEEK_SECRET':
      return state.phase === 'reveal' ? { ...state, secretRevealed: true } : state

    case 'BEGIN_QUESTIONING':
      return state.phase === 'reveal'
        ? { ...state, phase: 'questioning', timerEndsAt: action.timerEndsAt, feed: [] }
        : state

    case 'APPEND_ENTRIES':
      if (state.phase !== 'questioning') return state
      return {
        ...state,
        feed: [...state.feed, ...action.entries],
        ...(action.lastRoleWordSeen ? { lastRoleWordSeen: action.lastRoleWordSeen } : {}),
      }

    case 'ASK_HUMAN_SPY':
      if (state.phase !== 'questioning') return state
      return {
        ...state,
        feed: [...state.feed, ...action.entries],
        paused: true,
        pendingAsk: action.pendingAsk,
      }

    case 'HUMAN_SPY_REPLY':
      if (!state.pendingAsk) return state
      return {
        ...state,
        feed: [...state.feed, { speakerId: HUMAN_ID, text: action.text }],
        paused: false,
        pendingAsk: null,
      }

    case 'CALL_VOTE':
    case 'QUESTIONING_TIMEOUT':
      return state.phase === 'questioning'
        ? { ...state, phase: 'vote', votes: {}, paused: false, pendingAsk: null, locationGuessOpen: false }
        : state

    case 'OPEN_LOCATION_GUESS':
      return state.phase === 'questioning' ? { ...state, locationGuessOpen: true } : state

    case 'CLOSE_LOCATION_GUESS':
      return { ...state, locationGuessOpen: false }

    case 'LOCATION_GUESS_RESULT': {
      if (state.phase !== 'questioning') return state
      if (action.correct) {
        const { scores, matchWinnerId } = finalizeRound(state, true)
        return {
          ...state,
          phase: matchWinnerId ? 'matchover' : 'result',
          resultOutcome: 'guessed',
          accusedId: null,
          scores,
          matchWinnerId,
          locationGuessOpen: false,
        }
      }
      // Failed gamble: forfeits the rest of questioning, straight to vote.
      return { ...state, phase: 'vote', votes: {}, paused: false, pendingAsk: null, locationGuessOpen: false }
    }

    case 'CAST_VOTE': {
      if (state.phase !== 'vote' || state.votes[action.voterId]) return state
      const votes = { ...state.votes, [action.voterId]: action.accusedId }
      const total = state.roster.length + 1
      if (Object.keys(votes).length < total) return { ...state, votes }
      const { top, tied } = tallySpyfairVotes(votes)
      const spyCaught = !tied && top === state.spyId
      const spyWon = !spyCaught
      const { scores, matchWinnerId } = finalizeRound(state, spyWon)
      return {
        ...state,
        votes,
        phase: matchWinnerId ? 'matchover' : 'result',
        resultOutcome: spyWon ? 'escaped' : 'caught',
        accusedId: top,
        scores,
        matchWinnerId,
      }
    }

    case 'NEXT_ROUND':
      return state.phase === 'result'
        ? { ...state, ...dealRoundFields(action), round: state.round + 1, prevLocationIndex: action.locationIndex }
        : state

    case 'PLAY_AGAIN':
      // Same reset shape as dealRoundFields() + the setup-specific fields, spelled out
      // explicitly rather than reusing makeInitialState() — that helper calls
      // generateBotRoster()/Date.now() internally, and reducers must stay pure (the
      // fresh roster is rolled in the click handler and arrives via action.roster).
      return {
        ...state,
        phase: 'setup',
        roster: action.roster,
        round: 1,
        prevLocationIndex: -1,
        locationIndex: null,
        spyId: null,
        roles: {},
        scores: {},
        matchWinnerId: null,
        secretRevealed: false,
        feed: [],
        timerEndsAt: null,
        paused: false,
        pendingAsk: null,
        lastRoleWordSeen: '',
        votes: {},
        accusedId: null,
        resultOutcome: null,
        locationGuessOpen: false,
      }

    default:
      return state
  }
}

export default function SpyfairDemo() {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitialState)
  const [now, setNow] = useState(() => Date.now())
  const feedRef = useRef(null)
  const prevPhaseRef = useRef(state.phase)
  const humanIdentity = useMemo(() => readOwnIdentity(), [])
  const amSpy = state.spyId === HUMAN_ID

  const participants = useMemo(() => {
    const map = {}
    for (const bot of state.roster) map[bot.id] = { id: bot.id, name: bot.name, avatar: bot.avatar }
    map[HUMAN_ID] = { id: HUMAN_ID, name: humanIdentity.name, avatar: humanIdentity.avatar }
    return map
  }, [state.roster, humanIdentity])

  // --- Questioning ticker: bots chat/ask on a randomized 3-5s cadence while
  // unpaused. Re-scheduling itself off feed/paused/phase means every dispatch
  // that changes one of those naturally clears+reschedules the next tick, and
  // leaving questioning (any route) cancels whatever was pending. ---
  useEffect(() => {
    if (state.phase !== 'questioning' || state.paused || !state.roster.length) return
    const delay = 3000 + Math.random() * 2000
    const timer = setTimeout(() => {
      const speaker = state.roster[Math.floor(Math.random() * state.roster.length)]
      const speakerIsSpy = speaker.id === state.spyId
      const speakerRole = state.roles[speaker.id] || null

      // 2/3 of ticks: a statement. 1/3: a question aimed at a random other participant.
      if (Math.random() >= 1 / 3) {
        const text = generateBotStatement(speaker, { role: speakerRole, isSpy: speakerIsSpy })
        dispatch({
          type: 'APPEND_ENTRIES',
          entries: [{ speakerId: speaker.id, text }],
          lastRoleWordSeen: !speakerIsSpy ? speakerRole : undefined,
        })
        return
      }

      const others = allParticipantIds(state).filter(id => id !== speaker.id)
      const targetId = others[Math.floor(Math.random() * others.length)]
      const targetBot = state.roster.find(b => b.id === targetId)
      const targetName = targetBot ? targetBot.name : humanIdentity.name
      const question = generateQuestionPrompt(speaker, targetName)

      if (targetId === HUMAN_ID && amSpy) {
        // Human spy got put on the spot — pause the ticker for a reply choice.
        dispatch({
          type: 'ASK_HUMAN_SPY',
          entries: [{ speakerId: speaker.id, text: question }],
          pendingAsk: { askerName: speaker.name, roleWord: state.lastRoleWordSeen },
        })
        return
      }

      const entries = [{ speakerId: speaker.id, text: question }]
      let lastRoleWordSeen
      if (targetBot) {
        const targetIsSpy = targetBot.id === state.spyId
        const targetRole = state.roles[targetBot.id] || null
        entries.push({ speakerId: targetBot.id, text: generateBotStatement(targetBot, { role: targetRole, isSpy: targetIsSpy }) })
        if (!targetIsSpy) lastRoleWordSeen = targetRole
      } else {
        // Human, not the spy — their info is genuine, so auto-reply on their behalf.
        const humanRole = state.roles[HUMAN_ID] || null
        entries.push({ speakerId: HUMAN_ID, text: generateBotStatement({ id: HUMAN_ID }, { role: humanRole, isSpy: false }) })
        lastRoleWordSeen = humanRole
      }
      dispatch({ type: 'APPEND_ENTRIES', entries, lastRoleWordSeen })
    }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.paused, state.feed])

  // --- Questioning countdown ---
  useEffect(() => {
    if (state.phase !== 'questioning') return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [state.phase])

  useEffect(() => {
    if (state.phase !== 'questioning' || !state.timerEndsAt) return
    if (now >= state.timerEndsAt) dispatch({ type: 'QUESTIONING_TIMEOUT' })
  }, [now, state.phase, state.timerEndsAt])

  // --- Vote phase: bots vote on staggered timers; the human taps their own. ---
  useEffect(() => {
    if (state.phase !== 'vote') return
    const allIds = allParticipantIds(state)
    const timers = state.roster.map((bot, i) => setTimeout(() => {
      const accusedId = pickBotSpyVote(bot.id, allIds, state.spyId, bot.persona)
      dispatch({ type: 'CAST_VOTE', voterId: bot.id, accusedId })
    }, 600 + i * 450 + Math.random() * 300))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])

  // --- Auto-scroll the chat feed to the newest line ---
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [state.feed])

  // --- Result/matchover stingers ---
  useEffect(() => {
    if (state.phase === 'result' && prevPhaseRef.current !== 'result') {
      const spyWon = state.resultOutcome !== 'caught'
      if (amSpy) (spyWon ? sounds.win : sounds.lose)()
      else (spyWon ? sounds.lose : sounds.win)()
    }
    if (state.phase === 'matchover' && prevPhaseRef.current !== 'matchover') {
      (state.matchWinnerId === HUMAN_ID ? sounds.matchWin : sounds.lose)()
    }
    prevPhaseRef.current = state.phase
  }, [state.phase, state.resultOutcome, state.matchWinnerId, amSpy])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleBotCountChange = (nextCount) => {
    const clamped = Math.max(2, Math.min(7, nextCount))
    dispatch({ type: 'SET_BOT_COUNT_AND_ROSTER', botCount: clamped, roster: generateBotRoster(clamped, Date.now()) })
  }

  const handleStart = () => {
    const allIds = [...state.roster.map(b => b.id), HUMAN_ID]
    const locationIndex = pickSpyfairLocation(state.prevLocationIndex)
    const { spyId, roles } = assignSpyfairRoles(allIds, locationIndex)
    dispatch({ type: 'START_MATCH', locationIndex, spyId, roles })
  }

  const handlePeek = () => { dispatch({ type: 'PEEK_SECRET' }); sounds.hit() }

  const handleBeginQuestioning = () => {
    dispatch({ type: 'BEGIN_QUESTIONING', timerEndsAt: Date.now() + QUESTION_MS })
    sounds.go()
  }

  const handleCallVote = () => dispatch({ type: 'CALL_VOTE' })
  const handleOpenLocationGuess = () => dispatch({ type: 'OPEN_LOCATION_GUESS' })
  const handleCloseLocationGuess = () => dispatch({ type: 'CLOSE_LOCATION_GUESS' })

  const handleGuessLocation = (index) => {
    const correct = index === state.locationIndex
    dispatch({ type: 'LOCATION_GUESS_RESULT', correct })
    if (correct) sounds.hit()
    else sounds.miss()
  }

  const handleSpyReply = (styleId) => {
    const text = renderSpyReply(styleId, state.pendingAsk || { askerName: '', roleWord: '' })
    dispatch({ type: 'HUMAN_SPY_REPLY', text })
  }

  const handleCastVote = (accusedId) => {
    if (state.votes[HUMAN_ID]) return
    sounds.move(amSpy ? 'O' : 'X')
    dispatch({ type: 'CAST_VOTE', voterId: HUMAN_ID, accusedId })
  }

  const handleNextRound = () => {
    const allIds = [...state.roster.map(b => b.id), HUMAN_ID]
    const locationIndex = pickSpyfairLocation(state.locationIndex)
    const { spyId, roles } = assignSpyfairRoles(allIds, locationIndex)
    dispatch({ type: 'NEXT_ROUND', locationIndex, spyId, roles })
  }

  const handlePlayAgain = () => {
    dispatch({ type: 'PLAY_AGAIN', roster: generateBotRoster(state.botCount, Date.now()) })
  }

  const secsLeft = state.timerEndsAt ? Math.max(0, Math.ceil((state.timerEndsAt - now) / 1000)) : 0

  return (
    <div className="space-y-4">
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">SPYFAIR · SOLO</p>

      {state.phase === 'setup' && (
        <PartyBotSetup
          title="SPYFAIR"
          blurb="One of you is the SPY. Everyone else shares a secret location — ask questions, find the spy."
          botCount={state.botCount}
          onBotCount={handleBotCountChange}
          roster={state.roster}
          onStart={handleStart}
          minBots={2}
          maxBots={7}
        />
      )}

      {state.phase !== 'setup' && state.phase !== 'matchover' && (
        <div className="flex items-center justify-center gap-2 font-pixel text-[8px] tracking-widest">
          {['reveal', 'questioning', 'vote', 'result'].map(p => (
            <span key={p} className={cn(p === state.phase ? 'text-retro-cta text-glow-cta' : 'text-retro-dim/50')}>
              {p === 'questioning' ? 'ASK' : p.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {/* REVEAL: tap-to-peek secret flap */}
      {state.phase === 'reveal' && (
        <div className="space-y-4">
          <div className="bg-retro-card border-2 border-retro-border rounded p-5 text-center space-y-3 min-h-[140px] flex flex-col items-center justify-center">
            {!state.secretRevealed ? (
              <button
                onClick={handlePeek}
                className="px-5 py-3 border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
              >
                TAP TO SEE YOUR SECRET
              </button>
            ) : amSpy ? (
              <>
                <p className="font-pixel text-[9px] text-retro-p2 tracking-widest">YOU ARE THE</p>
                <p className="font-pixel text-xl text-retro-p2 text-glow-p2">SPY</p>
                <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
                  You don&apos;t know the location. Blend in, deflect, and listen for
                  a role to steal a guess — or just survive the vote.
                </p>
              </>
            ) : (
              <>
                <p className="font-pixel text-[9px] text-retro-dim tracking-widest">LOCATION</p>
                <p className="font-pixel text-lg text-retro-cta text-glow-cta">
                  {state.locationIndex != null ? SPYFAIR_LOCATIONS[state.locationIndex].name : '—'}
                </p>
                <p className="font-mono text-[11px] text-retro-p1 text-glow-p1">
                  Your role: {state.roles[HUMAN_ID] || '—'}
                </p>
                <p className="font-mono text-[9px] text-retro-dim">Don&apos;t say the location out loud!</p>
              </>
            )}
          </div>
          <div className="text-center">
            <button
              onClick={handleBeginQuestioning}
              disabled={!state.secretRevealed}
              className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
            >
              START QUESTIONING
            </button>
          </div>
        </div>
      )}

      {/* QUESTIONING: chat feed + timer + human spy tools */}
      {state.phase === 'questioning' && (
        <div className="space-y-3">
          <div className="bg-retro-card border border-retro-border rounded p-3 text-center space-y-1">
            <p className="font-pixel text-[8px] text-retro-dim tracking-widest">QUESTIONING</p>
            <p className={cn(
              'font-pixel text-xl tracking-widest',
              secsLeft <= 15 ? 'text-retro-p2 text-glow-p2 arcade-blink' : 'text-retro-cta text-glow-cta',
            )}>
              {fmtClock(secsLeft)}
            </p>
          </div>

          <div ref={feedRef} className="h-56 overflow-y-auto bg-retro-surface border border-retro-border/60 rounded p-2 space-y-2">
            {state.feed.length === 0 && (
              <p className="text-center font-mono text-[10px] text-retro-dim py-8">…QUIET SO FAR…</p>
            )}
            {state.feed.map((entry, i) => {
              const p = participants[entry.speakerId] || { name: '???', avatar: 'invader' }
              const isMe = entry.speakerId === HUMAN_ID
              return (
                <div key={i} className={cn('flex items-start gap-1.5', isMe && 'flex-row-reverse')}>
                  <Avatar id={p.avatar} size={20} />
                  <div className={cn(
                    'max-w-[78%] rounded px-2 py-1 font-mono text-[10px] leading-snug',
                    isMe ? 'bg-retro-tint-p1 text-retro-p1' : 'bg-retro-card text-retro-text',
                  )}>
                    <p className="font-pixel text-[6px] text-retro-dim mb-0.5 tracking-wider">{p.name}</p>
                    {entry.text}
                  </div>
                </div>
              )
            })}
          </div>

          {state.pendingAsk && (
            <div className="bg-retro-tint-p2 border border-retro-p2/50 rounded p-3 space-y-2 text-center">
              <p className="font-pixel text-[9px] text-retro-p2">
                {state.pendingAsk.askerName} IS WAITING ON AN ANSWER…
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SPY_REPLY_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => handleSpyReply(style.id)}
                    className="px-3 py-1.5 border-2 border-retro-p2 text-retro-p2 font-pixel text-[8px] rounded hover:shadow-neon-p2 hover:bg-retro-tint-p2 transition-all active:scale-95"
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {amSpy && (
            <div className="text-center">
              <button
                onClick={handleOpenLocationGuess}
                disabled={state.paused}
                className="px-4 py-2 border-2 border-retro-cta text-retro-cta font-pixel text-[9px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                GUESS THE LOCATION
              </button>
            </div>
          )}

          {state.locationGuessOpen && (
            <div className="bg-retro-card border-2 border-retro-cta rounded p-3 space-y-2">
              <p className="font-pixel text-[9px] text-retro-cta text-center">WHERE ARE THEY?</p>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                {SPYFAIR_LOCATIONS.map((loc, i) => (
                  <button
                    key={loc.name}
                    onClick={() => handleGuessLocation(i)}
                    className="px-2 py-1.5 border border-retro-border rounded font-mono text-[9px] text-retro-text hover:border-retro-cta hover:text-retro-cta transition-all active:scale-95"
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCloseLocationGuess}
                className="w-full px-3 py-1.5 font-pixel text-[9px] text-retro-dim hover:text-retro-text transition-all"
              >
                CANCEL
              </button>
            </div>
          )}

          <div className="text-center">
            <button
              onClick={handleCallVote}
              disabled={state.paused}
              className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-40"
            >
              CALL THE VOTE NOW
            </button>
          </div>
        </div>
      )}

      {/* VOTE: pick who you think the spy is */}
      {state.phase === 'vote' && (
        <div className="space-y-3">
          <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">WHO IS THE SPY?</p>
          <div className="space-y-2">
            {Object.values(participants).filter(p => p.id !== HUMAN_ID).map(p => {
              const picked = state.votes[HUMAN_ID] === p.id
              const hasVoted = !!state.votes[p.id]
              const myVoteCast = !!state.votes[HUMAN_ID]
              return (
                <button
                  key={p.id}
                  onClick={() => handleCastVote(p.id)}
                  disabled={myVoteCast}
                  className={cn(
                    'w-full min-h-11 flex items-center justify-between px-4 py-2.5 rounded border-2 font-mono text-[11px] transition-all active:scale-[0.98]',
                    picked
                      ? 'border-retro-p2 text-retro-p2 shadow-neon-p2 bg-retro-tint-p2'
                      : 'border-retro-border text-retro-text hover:border-retro-p2/60',
                    myVoteCast && !picked ? 'opacity-50' : '',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Avatar id={p.avatar} size={20} />
                    {p.name}
                  </span>
                  <span className={cn('font-pixel text-[8px]', hasVoted ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
                    {hasVoted ? 'VOTED' : '…'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-center font-pixel text-[9px] text-retro-dim">
            {Object.keys(state.votes).length}/{state.roster.length + 1} VOTED
          </p>
        </div>
      )}

      {/* RESULT: round outcome + NEXT ROUND */}
      {state.phase === 'result' && (
        <ResultPanel state={state} participants={participants} onNextRound={handleNextRound} />
      )}

      {/* MATCHOVER: winner banner + PLAY AGAIN */}
      {state.phase === 'matchover' && (
        <MatchOverPanel state={state} participants={participants} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  )
}

function ResultPanel({ state, participants, onNextRound }) {
  const spy = participants[state.spyId]
  const accused = state.accusedId ? participants[state.accusedId] : null
  const spyWon = state.resultOutcome !== 'caught'
  const outcomeLabel = state.resultOutcome === 'guessed'
    ? 'SPY GUESSED THE LOCATION'
    : spyWon ? 'SPY ESCAPES!' : 'SPY CAUGHT!'
  const locationName = state.locationIndex != null ? SPYFAIR_LOCATIONS[state.locationIndex].name : '???'
  const voteEntries = Object.entries(state.votes)

  return (
    <div className="space-y-4 text-center">
      <p className={cn('font-pixel text-base', spyWon ? 'text-retro-p2 text-glow-p2' : 'text-retro-win text-glow-win')}>
        {outcomeLabel}
      </p>
      <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
        <p className="font-mono text-[11px] text-retro-dim">
          The spy was <span className="text-retro-p2 text-glow-p2">{spy?.name || '???'}</span>
        </p>
        <p className="font-mono text-[11px] text-retro-dim">
          The location was <span className="text-retro-cta text-glow-cta">{locationName}</span>
        </p>
        {accused && (
          <p className="font-mono text-[10px] text-retro-dim">Most accused: {accused.name}</p>
        )}
        {state.spyId === HUMAN_ID && (
          <p className="font-pixel text-[9px] text-retro-p2">
            {spyWon ? 'YOU GOT AWAY WITH IT' : 'YOU WERE EXPOSED'}
          </p>
        )}
      </div>

      {voteEntries.length > 0 && (
        <div className="bg-retro-surface border border-retro-border/60 rounded p-3 space-y-1">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center mb-1">VOTES</p>
          {voteEntries.map(([voterId, accusedId]) => (
            <div key={voterId} className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-retro-text">{participants[voterId]?.name || '???'}</span>
              <span className="text-retro-dim">→ {participants[accusedId]?.name || '???'}</span>
            </div>
          ))}
        </div>
      )}

      <ScoreRow state={state} participants={participants} />

      <button
        onClick={onNextRound}
        className="px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
      >
        NEXT ROUND
      </button>
    </div>
  )
}

function MatchOverPanel({ state, participants, onPlayAgain }) {
  const iWon = state.matchWinnerId === HUMAN_ID
  const winner = participants[state.matchWinnerId]
  return (
    <div className="space-y-5 text-center">
      <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
      <p className={cn('font-pixel text-base', iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
        {iWon ? 'YOU WIN!' : `${winner?.name || 'PLAYER'} WINS`}
      </p>
      <ScoreRow state={state} participants={participants} />
      <button
        onClick={onPlayAgain}
        className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
      >
        PLAY AGAIN
      </button>
    </div>
  )
}

function ScoreRow({ state, participants }) {
  const sorted = Object.values(participants).sort((a, b) => (state.scores?.[b.id] || 0) - (state.scores?.[a.id] || 0))
  return (
    <div className="bg-retro-surface border border-retro-border/60 rounded p-3 space-y-1">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest">SCORES</p>
      {sorted.map(p => (
        <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
          <span className={cn(p.id === HUMAN_ID ? 'text-retro-p1 text-glow-p1' : 'text-retro-text')}>
            {p.name}{p.id === HUMAN_ID ? ' (YOU)' : ''}
            {p.id === state.spyId ? ' 🕵' : ''}
          </span>
          <span className="font-pixel text-[10px] text-retro-cta">{state.scores?.[p.id] || 0}</span>
        </div>
      ))}
    </div>
  )
}
