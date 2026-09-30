import { CONTACT_URL, PRIVACY_URL, TERMS_URL } from '../lib/legal'

// Privacy · Terms · Contact. Plain links to the static legal pages (a full page
// load on purpose: they are not part of the app bundle).
export default function LegalLinks({ lead = null, contact = true, className = '' }) {
  const link = 'underline decoration-dotted underline-offset-2 hover:text-retro-text'
  return (
    <p className={`font-mono text-[11px] leading-relaxed text-retro-dim text-center ${className}`}>
      {lead ? <>{lead}{' '}</> : null}
      <a href={TERMS_URL} target="_blank" rel="noopener" className={link}>Terms</a>
      {' · '}
      <a href={PRIVACY_URL} target="_blank" rel="noopener" className={link}>Privacy</a>
      {contact ? <>{' · '}<a href={CONTACT_URL} className={link}>Contact</a></> : null}
    </p>
  )
}
