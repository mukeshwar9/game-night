import { describe, it, expect } from 'vitest'
import {
  NON_SPY_STATEMENT_TEMPLATES,
  SPY_STATEMENT_TEMPLATES,
  PROMPT_TEMPLATES,
  SPY_REPLY_STYLES,
} from './spyfairChat'
import { SPYFAIR_LOCATIONS } from './spyfair'

const STRING_TEMPLATE_ARRAYS = [
  NON_SPY_STATEMENT_TEMPLATES,
  SPY_STATEMENT_TEMPLATES,
  PROMPT_TEMPLATES,
]

describe('SPYFAIR chat deck', () => {
  it('NON_SPY_STATEMENT_TEMPLATES is non-empty and near the stated size (~10)', () => {
    expect(NON_SPY_STATEMENT_TEMPLATES.length).toBeGreaterThanOrEqual(8)
  })

  it('SPY_STATEMENT_TEMPLATES is non-empty and near the stated size (~7)', () => {
    expect(SPY_STATEMENT_TEMPLATES.length).toBeGreaterThanOrEqual(6)
  })

  it('PROMPT_TEMPLATES is non-empty and near the stated size (~6)', () => {
    expect(PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })

  it('every NON_SPY_STATEMENT_TEMPLATES entry contains {role}', () => {
    for (const t of NON_SPY_STATEMENT_TEMPLATES) {
      expect(typeof t).toBe('string')
      expect(t).toContain('{role}')
    }
  })

  it('every PROMPT_TEMPLATES entry contains {name}', () => {
    for (const t of PROMPT_TEMPLATES) {
      expect(typeof t).toBe('string')
      expect(t).toContain('{name}')
    }
  })

  it('SPY_STATEMENT_TEMPLATES entries contain neither {role} nor {name}', () => {
    for (const t of SPY_STATEMENT_TEMPLATES) {
      expect(t).not.toContain('{role}')
      expect(t).not.toContain('{name}')
    }
  })

  it('no template in any array contains a SPYFAIR_LOCATIONS name, case-insensitive', () => {
    for (const arr of STRING_TEMPLATE_ARRAYS) {
      for (const t of arr) {
        for (const loc of SPYFAIR_LOCATIONS) {
          expect(t.toLowerCase()).not.toContain(loc.name.toLowerCase())
        }
      }
    }
  })

  it('SPY_REPLY_STYLES has exactly the vague/deflect/gamble ids, each with a non-empty label and a callable render', () => {
    expect(SPY_REPLY_STYLES.map(s => s.id)).toEqual(['vague', 'deflect', 'gamble'])
    for (const style of SPY_REPLY_STYLES) {
      expect(typeof style.label).toBe('string')
      expect(style.label.length).toBeGreaterThan(0)
      expect(typeof style.render).toBe('function')
      const out = style.render({ askerName: 'RUBY', roleWord: 'Pilot' })
      expect(typeof out).toBe('string')
      expect(out.length).toBeGreaterThan(0)
    }
  })
})
