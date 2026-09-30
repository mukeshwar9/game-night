// WIRE CROSSED Handbook page: GLYPHS. Tier I/II is one page of columns. Tier
// III has PAGE A and PAGE B: the serial's last digit picks one (odd = A, even
// = B). Both pages are always shown, labelled, so the Handbook can check.
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { serialLastDigit } from '../../../lib/wireLogic'
import WireGlyph from '../WireGlyph'
import Section from './Section'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const WORDS = { 4: 'four', 5: 'five' }

function Columns({ columns, size }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((col, c) => (
        <div key={c} className="flex flex-col items-center gap-1 rounded border border-retro-border bg-retro-deep py-1.5">
          <span className="font-pixel text-[8px] text-retro-dim">{ROMAN[c]}</span>
          {col.map(g => <WireGlyph key={g} id={g} size={size} className="text-retro-text" />)}
        </div>
      ))}
    </div>
  )
}

export default function KeypadManual({ module, bomb }) {
  const { manual, solution } = module
  const keys = WORDS[solution?.length] ?? String(solution?.length ?? 4)
  const paged = !!manual.pages
  const [page, setPage] = useState(bomb && serialLastDigit(bomb.serial) % 2 === 0 ? 1 : 0)
  return (
    <Section
      title="GLYPHS"
      intro={paged
        ? `Look at the last digit of the serial. Odd: use PAGE A. Even: use PAGE B. On that page exactly one column holds all ${keys} glyphs on the keypad. The other page has a column with almost all of them: ignore it. Some glyphs on page B are mirror images (flipped left to right); a mirrored glyph is NOT the same as the plain one. Press the ${keys} in the order they appear in the column, top first.`
        : `Exactly one column below holds all ${keys} glyphs on the keypad. Press those ${keys} in the order they appear in that column, top first.`}
    >
      {paged ? (
        <>
          <div className="flex gap-2" role="tablist" aria-label="Glyph pages">
            {['A', 'B'].map((label, p) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={page === p}
                onClick={() => setPage(p)}
                className={cn(
                  'flex-1 min-h-11 rounded border-2 font-pixel text-[9px]',
                  page === p ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
                )}
              >PAGE {label} · SERIAL {p === 0 ? 'ODD' : 'EVEN'}</button>
            ))}
          </div>
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest" aria-live="polite">
            PAGE {page === 0 ? 'A' : 'B'} · USE WHEN THE SERIAL ENDS IN AN {page === 0 ? 'ODD' : 'EVEN'} DIGIT
          </p>
          <Columns columns={manual.pages[page]} size={24} />
        </>
      ) : (
        <Columns columns={manual.columns} size={manual.columns.length > 5 ? 26 : 30} />
      )}
    </Section>
  )
}
