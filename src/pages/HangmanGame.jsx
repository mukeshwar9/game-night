import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  applyGuess, isWordGuessed, countWrong,
  MAX_WRONG, verifyRoundConsistency,
} from '../lib/hangmanLogic'
import HangmanGallows from '../components/HangmanGallows'
import WordDisplay from '../components/WordDisplay'
import LetterKeyboard from '../components/LetterKeyboard'
import WordSetter from '../components/WordSetter'
import WinEffect from '../components/WinEffect'
import RoseFall from '../components/RoseFall'
import Gravestone from '../components/Gravestone'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

function normalizeGuess(val) {
  if (val === false || val === null || val === undefined) return false
  if (val === 'pending') return 'pending'
  if (Array.isArray(val)) return val
  return Object.values(val).map(Number)
}

function normalizeGuesses(raw) {
  if (!raw) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    out[k] = normalizeGuess(v)
  }
  return out
}

function CheatScreen({ evidence }) {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center space-y-3">
        <p
          className="font-pixel text-base text-retro-pink text-glow-pink"
          style={{ animation: 'blink-text 0.6s step-end infinite' }}
        >
          ⚠ CHEAT DETECTED ⚠
        </p>
        <p className="font-mono text-xs text-retro-dim">The word-keeper cheated.</p>
      </div>
      <div className="w-full max-w-sm bg-retro-card border border-retro-pink/40 rounded p-4 space-y-2 font-mono text-[10px] text-retro-dim break-all">
        <p><span className="text-retro-pink">COMMITMENT:</span> {evidence?.commitment?.slice(0, 16)}…</p>
        <p><span className="text-retro-pink">REVEALED:</span> {evidence?.revealed}</p>
        <p><span className="text-retro-pink">HASH OK:</span> {String(evidence?.commitOk)}</p>
        <p><span className="text-retro-pink">ANSWERS OK:</span> {String(evidence?.consistencyOk)}</p>
      </div>
      <Link
        to="/"
        className="font-pixel text-[9px] text-retro-cyan text-glow-cyan hover:opacity-80 transition-opacity"
      >
        ← BACK TO HOME
      </Link>
    </div>
  )
}

const MATCH_WINS = 3

export default function HangmanGame({ gameId, game, mySymbol, opponentOnline, onSwitchGame }) {
  const round = game.round || {}
  const guesses = normalizeGuesses(round.guesses)
  const wrongCount = round.wrongCount || 0
  const phase = round.phase || 'setting'
  const setter = round.setter || 'X'
  const guesser = setter === 'X' ? 'O' : 'X'

  const isSetter = mySymbol === setter
  const isGuesser = mySymbol !== null && mySymbol !== setter
  const isSpectator = mySymbol === null

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchWinner = scoreX >= MATCH_WINS ? 'X' : scoreO >= MATCH_WINS ? 'O' : null

  const [lockingWord, setLockingWord] = useState(false)
  const [flash, setFlash] = useState(false)
  const [cheatDetected, setCheatDetected] = useState(false)
  const [cheatEvidence, setCheatEvidence] = useState(null)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectFor, setWinEffectFor] = useState(null)

  const verifiedCommitment = useRef(null)
  const prevWrongCount = useRef(wrongCount)
  const prevWrongDrop = useRef(wrongCount)

  // --- Setter: process pending guesses ---
  useEffect(() => {
    if (!isSetter || phase !== 'guessing') return

    const stored = sessionStorage.getItem(`hangwoman-word-${gameId}`)
    if (!stored) return
    const { word, salt } = JSON.parse(stored)

    const guessesRef = ref(db, `games/${gameId}/round/guesses`)
    const unsub = onValue(guessesRef, (snap) => {
      const raw = snap.val()
      if (!raw) return

      const pending = Object.entries(raw).filter(([, v]) => v === 'pending')
      if (pending.length === 0) return

      const currentGuesses = normalizeGuesses(raw)
      const updates = {}
      const merged = { ...currentGuesses }

      for (const [letter] of pending) {
        const positions = applyGuess(word, letter)
        const guessVal = positions.length > 0 ? positions : false
        updates[`games/${gameId}/round/guesses/${letter}`] = guessVal
        merged[letter] = guessVal
      }

      const newWrongCount = countWrong(merged)
      updates[`games/${gameId}/round/wrongCount`] = newWrongCount

      const guessed = isWordGuessed(word, merged)
      const hanged = newWrongCount >= MAX_WRONG

      if (guessed || hanged) {
        const result = guessed ? 'guessed' : 'hanged'
        updates[`games/${gameId}/round/phase`] = 'reveal'
        updates[`games/${gameId}/round/result`] = result
        updates[`games/${gameId}/round/reveal`] = { word, salt }
      }

      update(ref(db), updates).catch(() => {})
    })

    return () => unsub()
  }, [isSetter, phase, gameId])

  // --- Guesser: verify reveal ---
  useEffect(() => {
    if (!isGuesser || phase !== 'reveal') return
    if (!round.reveal || !round.commitment) return
    if (verifiedCommitment.current === round.commitment) return

    verifiedCommitment.current = round.commitment
    const { word, salt } = round.reveal

    Promise.all([
      verifyReveal(round.commitment, word, salt),
      Promise.resolve(verifyRoundConsistency(word, guesses)),
    ]).then(([commitOk, consistencyOk]) => {
      if (!commitOk || !consistencyOk) {
        setCheatDetected(true)
        setCheatEvidence({
          commitment: round.commitment,
          revealed: word,
          salt,
          commitOk,
          consistencyOk,
        })
      } else if (round.result === 'guessed') {
        const roundWinner = guesser
        setWinEffectFor(roundWinner)
        setShowWinEffect(true)
        if (roundWinner === mySymbol) sounds.win()
        else if (mySymbol) sounds.lose()
      }
      // hanged: drop+bell already fired; roses render via roundResult state
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round.reveal, round.commitment, isGuesser])

  // --- Flash on new wrong guess ---
  useEffect(() => {
    if (wrongCount > prevWrongCount.current) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 120)
      prevWrongCount.current = wrongCount
      return () => clearTimeout(t)
    }
    prevWrongCount.current = wrongCount
  }, [wrongCount])

  // --- Setter: also play sounds on guess resolution ---
  // (Setter's onValue already runs; play sound based on wrongCount increase)
  const prevWrongRef = useRef(wrongCount)
  useEffect(() => {
    if (wrongCount > prevWrongRef.current && isSetter) {
      sounds.miss()
    } else if (wrongCount === prevWrongRef.current && phase === 'guessing' && isSetter) {
      // hit — move sound already played in onValue loop via the data
    }
    prevWrongRef.current = wrongCount
  }, [wrongCount, isSetter, phase])

  // --- Drop + bell sounds for all clients when wrongCount reaches MAX_WRONG ---
  useEffect(() => {
    if (prevWrongDrop.current < MAX_WRONG && wrongCount >= MAX_WRONG) {
      sounds.drop()
      const t = setTimeout(() => sounds.bell(), 600)
      prevWrongDrop.current = wrongCount
      return () => clearTimeout(t)
    }
    prevWrongDrop.current = wrongCount
  }, [wrongCount])

  const handleWordSet = useCallback(async (word) => {
    setLockingWord(true)
    try {
      const { hash, salt } = await commit(word)
      sessionStorage.setItem(`hangwoman-word-${gameId}`, JSON.stringify({ word, salt }))
      await update(ref(db, `games/${gameId}`), {
        'round/phase': 'guessing',
        'round/wordLength': word.length,
        'round/commitment': hash,
        'round/wrongCount': 0,
        'round/guesses': null,
        'round/reveal': null,
        'round/result': null,
      })
    } catch {
      /* ignore */
    } finally {
      setLockingWord(false)
    }
  }, [gameId])

  const handleGuess = useCallback(async (letter) => {
    if (phase !== 'guessing' || !isGuesser) return
    if (letter in guesses) return
    try {
      await update(ref(db), { [`games/${gameId}/round/guesses/${letter}`]: 'pending' })
    } catch { /* ignore */ }
  }, [phase, isGuesser, guesses, gameId])

  const handleNextRound = useCallback(async () => {
    if (isSpectator) return
    const roundResult = round.result
    const roundWinner = roundResult === 'guessed' ? guesser : setter
    const newScores = { X: scoreX, O: scoreO }
    newScores[roundWinner] = (newScores[roundWinner] || 0) + 1

    const newMatchWinner = newScores.X >= MATCH_WINS ? 'X' : newScores.O >= MATCH_WINS ? 'O' : null
    const newSetter = setter === 'X' ? 'O' : 'X'

    sessionStorage.removeItem(`hangwoman-word-${gameId}`)

    const updates = {
      'scores/X': newScores.X,
      'scores/O': newScores.O,
      'round/setter': newSetter,
      'round/phase': 'setting',
      'round/wrongCount': 0,
      'round/wordLength': null,
      'round/commitment': null,
      'round/guesses': null,
      'round/reveal': null,
      'round/result': null,
    }

    if (newMatchWinner) {
      updates.status = 'finished'
      updates.winner = newMatchWinner
    }

    try { await update(ref(db, `games/${gameId}`), updates) } catch { /* ignore */ }
  }, [round.result, setter, guesser, scoreX, scoreO, isSpectator, gameId])

  const handleForfeit = useCallback(async () => {
    const newScores = { X: scoreX, O: scoreO }
    newScores[guesser] = (newScores[guesser] || 0) + 1
    const newMatchWinner = newScores.X >= MATCH_WINS ? 'X' : newScores.O >= MATCH_WINS ? 'O' : null
    const newSetter = setter === 'X' ? 'O' : 'X'

    sessionStorage.removeItem(`hangwoman-word-${gameId}`)

    const updates = {
      'scores/X': newScores.X,
      'scores/O': newScores.O,
      'round/setter': newSetter,
      'round/phase': 'setting',
      'round/wrongCount': 0,
      'round/wordLength': null,
      'round/commitment': null,
      'round/guesses': null,
      'round/reveal': null,
      'round/result': null,
    }

    if (newMatchWinner) {
      updates.status = 'finished'
      updates.winner = newMatchWinner
    }

    try { await update(ref(db, `games/${gameId}`), updates) } catch { /* ignore */ }
  }, [setter, guesser, scoreX, scoreO, gameId])

  const handleNewMatch = useCallback(async () => {
    sessionStorage.removeItem(`hangwoman-word-${gameId}`)
    try {
      await update(ref(db, `games/${gameId}`), {
        status: 'playing',
        winner: null,
        'scores/X': 0,
        'scores/O': 0,
        'round/setter': 'X',
        'round/phase': 'setting',
        'round/wrongCount': 0,
        'round/wordLength': null,
        'round/commitment': null,
        'round/guesses': null,
        'round/reveal': null,
        'round/result': null,
      })
    } catch { /* ignore */ }
  }, [gameId])

  if (cheatDetected) return <CheatScreen evidence={cheatEvidence} />

  // --- Match over ---
  if (matchWinner) {
    const iWon = matchWinner === mySymbol
    const winnerName = game.players?.[matchWinner]?.name || matchWinner
    return (
      <div className="space-y-6 text-center">
        {showWinEffect && (
          <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
        )}
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
        <p className={cn(
          'font-pixel text-base',
          iWon ? 'text-retro-yellow text-glow-yellow' : 'text-retro-dim',
        )}>
          {iWon ? 'YOU WIN!' : `${winnerName} WINS`}
        </p>
        <p className="font-mono text-sm text-retro-dim">{scoreX} – {scoreO}</p>
        {!isSpectator && (
          <button
            onClick={handleNewMatch}
            className="px-6 py-2.5 bg-retro-yellow text-retro-bg font-pixel text-xs rounded hover:shadow-neon-yellow transition-all active:scale-95"
          >
            NEW MATCH
          </button>
        )}
        {!isSpectator && onSwitchGame && (
          <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  // --- Setting phase ---
  if (phase === 'setting') {
    return (
      <div className="space-y-4">
        {showWinEffect && (
          <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
        )}
        {isSetter ? (
          <WordSetter onWordSet={handleWordSet} loading={lockingWord} />
        ) : (
          <div className="text-center space-y-3 py-6">
            <div className="flex gap-2 justify-center">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-retro-pink animate-bounce shadow-neon-pink"
                  style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
            <p className="font-pixel text-[9px] text-retro-pink text-glow-pink leading-relaxed">
              WAITING FOR<br />WORD-KEEPER…
            </p>
            {!opponentOnline && (
              <p className="font-pixel text-[9px] text-retro-dim animate-pulse">
                (WORD-KEEPER IS OFFLINE)
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // --- Guessing / Reveal phases ---
  const isReveal = phase === 'reveal'
  const revealedWord = isReveal ? round.reveal?.word : null
  const roundResult = round.result

  // Setter lost their word (refreshed in new tab)
  const setterMissingWord = isSetter && phase === 'guessing' &&
    !sessionStorage.getItem(`hangwoman-word-${gameId}`)

  const canGuess = isGuesser && phase === 'guessing' && !setterMissingWord

  return (
    <div className="space-y-4">
      {showWinEffect && (
        <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
      )}
      {isReveal && roundResult === 'hanged' && <RoseFall />}

      {/* Gallows */}
      <HangmanGallows wrongCount={wrongCount} flash={flash} />

      {/* Word display */}
      {round.wordLength > 0 && (
        <WordDisplay
          wordLength={round.wordLength}
          guesses={guesses}
          revealedWord={revealedWord}
        />
      )}

      {/* Phase status */}
      <div className="text-center space-y-1">
        {!isReveal && (
          <p className={cn(
            'font-pixel text-[9px]',
            canGuess && wrongCount === MAX_WRONG - 1
              ? 'text-retro-pink text-glow-pink'
              : canGuess
                ? 'text-retro-yellow text-glow-yellow animate-pulse'
                : 'text-retro-dim',
          )}
          style={canGuess && wrongCount === MAX_WRONG - 1
            ? { animation: 'blink-text 0.6s step-end infinite' }
            : undefined}
          >
            {canGuess
              ? wrongCount === MAX_WRONG - 1
                ? 'DEAD WOMAN GUESSING'
                : 'YOUR TURN — GUESS A LETTER'
              : isSetter
                ? setterMissingWord
                  ? 'WORD LOST — YOU OPENED A NEW TAB'
                  : 'WAITING FOR GUESS…'
                : 'WAITING FOR WORD-KEEPER…'}
          </p>
        )}
        {isReveal && roundResult === 'hanged' && (
          <div className="space-y-2">
            <p className="font-pixel text-xs text-retro-pink text-glow-pink">
              RIP QUEEN
            </p>
            {isSetter && (
              <p className="font-pixel text-[9px] text-retro-pink/70">
                YOU HANGED HER
              </p>
            )}
            <div className="flex justify-center py-1">
              <Gravestone />
            </div>
            <p className="font-mono text-[10px] text-retro-dim">
              THE WORD THAT KILLED HER: <span className="text-retro-yellow">{revealedWord}</span>
            </p>
            {!isSpectator && (
              <div className="space-y-2">
                <button
                  onClick={handleNextRound}
                  className="mt-2 px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-cyan text-retro-cyan rounded hover:shadow-neon-cyan hover:bg-[#001a2e] transition-all active:scale-95"
                >
                  NEXT ROUND
                </button>
                {onSwitchGame && (
                  <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
                )}
              </div>
            )}
          </div>
        )}
        {isReveal && roundResult === 'guessed' && (
          <div className="space-y-2">
            <p className="font-pixel text-xs text-retro-cyan text-glow-cyan">
              WORD GUESSED!
            </p>
            <p className="font-mono text-[10px] text-retro-dim">
              The word was <span className="text-retro-yellow">{revealedWord}</span>
            </p>
            {!isSpectator && (
              <div className="space-y-2">
                <button
                  onClick={handleNextRound}
                  className="mt-2 px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-cyan text-retro-cyan rounded hover:shadow-neon-cyan hover:bg-[#001a2e] transition-all active:scale-95"
                >
                  NEXT ROUND
                </button>
                {onSwitchGame && (
                  <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
                )}
              </div>
            )}
          </div>
        )}
        <p className={cn(
          'font-mono text-[10px]',
          wrongCount >= MAX_WRONG - 1 ? 'text-retro-pink text-glow-pink' : 'text-retro-dim',
        )}
        style={wrongCount >= MAX_WRONG - 1
          ? { animation: 'blink-text 0.6s step-end infinite' }
          : undefined}
        >
          {wrongCount}/{MAX_WRONG} wrong
        </p>
      </div>

      {/* Setter missing word — forfeit option */}
      {setterMissingWord && (
        <div className="text-center space-y-2 border border-retro-pink/30 rounded p-3">
          <p className="font-pixel text-[9px] text-retro-dim leading-relaxed">
            Your word was stored in this browser tab only.<br />
            Concede the round to continue.
          </p>
          <button
            onClick={handleForfeit}
            className="px-5 py-2 font-pixel text-[9px] border border-retro-pink text-retro-pink rounded hover:shadow-neon-pink transition-all active:scale-95"
          >
            CONCEDE ROUND
          </button>
        </div>
      )}

      {/* Setter offline warning */}
      {!isSetter && !isReveal && !opponentOnline && (
        <p className="font-pixel text-[9px] text-retro-dim text-center animate-pulse">
          WORD-KEEPER IS OFFLINE — GUESSES WILL STALL
        </p>
      )}

      {/* Keyboard */}
      {!isReveal && (
        <LetterKeyboard
          guesses={guesses}
          onGuess={handleGuess}
          disabled={!canGuess}
        />
      )}

      {isSpectator && (
        <p className="text-center font-pixel text-[9px] text-retro-border">SPECTATING</p>
      )}
    </div>
  )
}
