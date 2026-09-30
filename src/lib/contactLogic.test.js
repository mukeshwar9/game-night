import { describe, it, expect } from 'vitest'
import { cleanContactEmail, renderContactTokens, CONTACT_PENDING_TEXT, SECURITY_FALLBACK_URL } from './contactLogic'

describe('renderContactTokens', () => {
  const page = '<p>Write to %CONTACT% or %CONTACT%.</p>'
  it('shows the pending text while no address is set', () => {
    expect(renderContactTokens(page, '')).toBe(`<p>Write to ${CONTACT_PENDING_TEXT} or ${CONTACT_PENDING_TEXT}.</p>`)
    expect(renderContactTokens(page, undefined)).not.toContain('%CONTACT%')
    expect(renderContactTokens('Contact: %CONTACT_URL%', '')).toBe(`Contact: ${SECURITY_FALLBACK_URL}`)
  })
  it('renders a mailto link for a valid address', () => {
    expect(renderContactTokens(page, 'help@example.com'))
      .toBe('<p>Write to <a href="mailto:help@example.com">help@example.com</a> or <a href="mailto:help@example.com">help@example.com</a>.</p>')
    expect(renderContactTokens('Contact: %CONTACT_URL%', ' help@example.com ')).toBe('Contact: mailto:help@example.com')
  })
  it('rejects values that are not a plain address', () => {
    for (const bad of ['not an email', 'a@b', '"><script>@x.io', 'a b@c.io']) expect(cleanContactEmail(bad)).toBe('')
  })
})
