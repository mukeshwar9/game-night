import { useCallback, useState } from 'react'
import SecretReveal from '../components/SecretReveal'
import RoundEndPanel from '../components/RoundEndPanel'
import {
  CHAMELEON_MIN_PLAYERS, CHAMELEON_MAX_PLAYERS, CHAMELEON_MATCH_POINTS, getCard,
} from '../lib/chameleonLogic'
import {
  clampLocalCount, buildLocalPlayers, dealLocalRound, secretFor, secretWordOf,
  nextAfterVote, settleLocalRound, LOCAL_NAME_MAX,
} from '../lib/chameleonLocalLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// CHAMELEON on one phone (/local/chameleon). The deal lives in React state, so
// nothing is sent anywhere: <SecretReveal> hands the phone round the table for
// the private part, then clues, the vote and the Chameleon's guess are plain
// shared screens. Rules and scoring come from chameleonLogic.js via
// chameleonLocalLogic.js.

const OUTCOME_COPY = {
  escaped: ['THE CHAMELEON GOT AWAY', 'The table missed it.'],
  stolen: ['CAUGHT… BUT THEY STOLE IT', 'The Chameleon named the secret word.'],
  caught: ['CHAMELEON CAUGHT!', 'And they guessed the wrong word.'],
}

const Btn = ({ children, onClick, tone = 'cta', disabled, className }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'w-full min-h-12 rounded border-2 px-3 font-pixel text-[10px] tracking-wider press transition disabled:opacity-50',
      tone === 'cta' ? 'border-retro-cta bg-retro-tint-cta text-retro-cta hover:shadow-neon-cta' : 'border-retro-border bg-retro-card text-retro-text hover:border-retro-p1',
      className,
    )}
  >
    {children}
  </button>
)

function TopicCard({ card, highlight = -1, onPick, label }) {
  return (
    <div className="bg-retro-card border-2 border-retro-border rounded p-3 space-y-2">
      <p className="text-center font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">{card.topic}</p>
      <div className="grid grid-cols-4 gap-1.5" role={onPick ? 'group' : undefined} aria-label={onPick ? label : undefined}>
        {card.words.map((w, i) => {
          const hit = highlight === i
          const cls = cn(
            'min-h-12 px-1 py-1.5 rounded border font-mono text-[10px] leading-tight text-center break-words flex items-center justify-center',
            hit ? 'border-retro-cta text-retro-cta bg-retro-tint-cta font-bold' : 'border-retro-border text-retro-text',
          )
          return onPick ? (
            <button key={w} type="button" onClick={() => onPick(i)} className={cn(cls, 'hover:border-retro-p2 hover:text-retro-p2 press transition')}>{w}</button>
          ) : (
            <div key={w} className={cls} aria-current={hit ? 'true' : undefined}>{hit ? `★ ${w}` : w}</div>
          )
        })}
      </div>
    </div>
  )
}

function Setup({ onStart }) {
  const [count, setCount] = useState(4)
  const [names, setNames] = useState([])
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">HOW MANY ARE PLAYING?</p>
        <div className="flex items-center justify-center gap-3">
          <button type="button" aria-label="Fewer players" disabled={count <= CHAMELEON_MIN_PLAYERS} onClick={() => setCount(c => clampLocalCount(c - 1))}
            className="min-h-11 min-w-11 rounded border-2 border-retro-border font-pixel text-sm text-retro-text press disabled:opacity-40">−</button>
          <span className="font-pixel text-lg text-retro-cta w-10 text-center" aria-live="polite">{count}</span>
          <button type="button" aria-label="More players" disabled={count >= CHAMELEON_MAX_PLAYERS} onClick={() => setCount(c => clampLocalCount(c + 1))}
            className="min-h-11 min-w-11 rounded border-2 border-retro-border font-pixel text-sm text-retro-text press disabled:opacity-40">+</button>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">NAMES (OPTIONAL)</p>
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            value={names[i] ?? ''}
            onChange={(e) => setNames(prev => { const next = [...prev]; next[i] = e.target.value; return next })}
            maxLength={LOCAL_NAME_MAX}
            placeholder={`P${i + 1}`}
            aria-label={`Player ${i + 1} name`}
            autoComplete="off"
            className="w-full min-h-11 rounded border border-retro-border bg-retro-card px-3 font-mono text-sm text-retro-text placeholder:text-retro-dim"
          />
        ))}
      </div>
      <Btn onClick={() => onStart(buildLocalPlayers(names, count))}>START · DEAL THE SECRETS</Btn>
    </div>
  )
}

export function ChameleonLocal() {
  const [players, setPlayers] = useState(null)
  const [scores, setScores] = useState({})
  const [roundNo, setRoundNo] = useState(0)
  const [deal, setDeal] = useState(null)
  const [seen, setSeen] = useState([])
  const [step, setStep] = useState('setup') // setup | reveal | clues | vote | guess | result
  const [result, setResult] = useState(null)

  const beginRound = useCallback((ps, n, prev, seenCards) => {
    const d = dealLocalRound({ players: ps, seen: seenCards, prevCardIndex: prev, roundNo: n })
    setDeal(d)
    setSeen(s => [...s, d.cardIndex])
    setResult(null)
    setStep('reveal')
  }, [])

  const start = (ps) => {
    setPlayers(ps)
    setScores({})
    setRoundNo(0)
    setSeen([])
    beginRound(ps, 0, null, [])
  }

  const nextRound = () => {
    const n = roundNo + 1
    setRoundNo(n)
    beginRound(players, n, deal.cardIndex, seen)
  }

  const newMatch = () => { setPlayers(null); setScores({}); setRoundNo(0); setDeal(null); setSeen([]); setResult(null); setStep('setup') }

  const settle = (accusedId, guessIndex = null) => {
    const r = settleLocalRound({ players, scores, deal, accusedId, guessIndex })
    setScores(r.scores)
    setResult({ ...r, accusedId, guessIndex })
    setStep('result')
    if (r.winners.length) sounds.matchWin?.(); else if (r.outcome === 'caught') sounds.win(); else sounds.lose()
  }

  const accuse = (id) => {
    if (nextAfterVote(id, deal) === 'guess') { setResult({ accusedId: id }); setStep('guess') } else settle(id)
  }

  const nameOf = (id) => players?.find(p => p.id === id)?.name ?? ''
  const card = deal ? getCard(deal.cardIndex) : null

  if (step === 'setup' || !players) return <Setup onStart={start} />

  if (step === 'reveal') {
    return (
      <SecretReveal
        key={roundNo}
        players={players}
        onDone={() => setStep('clues')}
        renderSecret={(p) => {
          const s = secretFor(p.id, deal)
          return (
            <div className="space-y-2 text-center">
              {s.chameleon ? (
                <>
                  <p className="font-pixel text-base text-retro-p2 text-glow-p2">YOU ARE THE CHAMELEON</p>
                  <p className="font-mono text-[11px] text-retro-dim">You don't know the word. Listen, then blend in.</p>
                </>
              ) : (
                <>
                  <p className="font-pixel text-[9px] text-retro-dim tracking-widest">THE SECRET WORD IS</p>
                  <p className="font-pixel text-base text-retro-cta text-glow-cta">{s.word}</p>
                </>
              )}
              <p className="font-pixel text-[8px] text-retro-dim tracking-widest pt-1">TOPIC · {card.topic}</p>
            </div>
          )
        }}
      />
    )
  }

  if (step === 'clues') {
    return (
      <div className="space-y-3">
        <TopicCard card={card} />
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">CLUE ORDER · ONE WORD OR PHRASE EACH, OUT LOUD</p>
          {deal.order.map((id, i) => (
            <p key={id} className="font-mono text-[11px] text-retro-text">{i + 1}. {nameOf(id)}</p>
          ))}
        </div>
        <Btn onClick={() => setStep('vote')}>EVERYONE'S GIVEN A CLUE · VOTE</Btn>
      </div>
    )
  }

  if (step === 'vote') {
    return (
      <div className="space-y-3">
        <p className="font-pixel text-[10px] text-retro-text tracking-wider text-center">WHO IS THE CHAMELEON?</p>
        <p className="font-mono text-[11px] text-retro-dim text-center">Talk it over, point on three, then tap who the table picked.</p>
        <div className="grid grid-cols-2 gap-2">
          {players.map(p => <Btn key={p.id} tone="plain" onClick={() => accuse(p.id)}>{p.name}</Btn>)}
        </div>
        <Btn tone="plain" onClick={() => accuse(null)}>NO MAJORITY · IT'S A TIE</Btn>
      </div>
    )
  }

  if (step === 'guess') {
    return (
      <div className="space-y-3">
        <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 tracking-wider text-center">{nameOf(result.accusedId)} WAS THE CHAMELEON</p>
        <p className="font-mono text-[11px] text-retro-dim text-center">One guess at the secret word steals the round. Only the Chameleon taps — everyone else, don't help.</p>
        <TopicCard card={card} label="Guess the secret word" onPick={(i) => settle(result.accusedId, i)} />
      </div>
    )
  }

  const [headline, line] = OUTCOME_COPY[result.outcome]
  const won = result.winners.length > 0
  const rows = players.map(p => ({
    id: p.id,
    name: p.name,
    score: result.scores[p.id] || 0,
    delta: result.delta[p.id],
    marker: p.id === deal.chameleonId ? '🦎' : undefined,
    win: result.winners.includes(p.id),
  }))
  return (
    <div className="space-y-3">
      <RoundEndPanel
        caption={won ? 'MATCH OVER' : `ROUND ${roundNo + 1}`}
        headline={won ? `${result.winners.map(nameOf).join(' & ')} WIN${result.winners.length > 1 ? '' : 'S'}!` : headline}
        sub={(
          <p className="font-mono text-[11px] text-retro-dim">
            {line} The Chameleon was {nameOf(deal.chameleonId)}; the word was {secretWordOf(deal)}.
          </p>
        )}
        scores={{ title: `SCORES · FIRST TO ${CHAMELEON_MATCH_POINTS}`, rows }}
        actions={[
          won
            ? { key: 'new', label: 'NEW MATCH', onClick: newMatch }
            : { key: 'next', label: 'NEXT ROUND', onClick: nextRound },
          !won && { key: 'quit', label: 'END MATCH', onClick: newMatch, variant: 'next' },
        ]}
      />
    </div>
  )
}

export default ChameleonLocal
