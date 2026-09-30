// WIRE CROSSED Handbook: the titled block every module page is built from.
export default function Section({ title, intro, children }) {
  return (
    <section className="space-y-3">
      <h3 className="font-pixel text-[11px] text-retro-cta tracking-widest">{title}</h3>
      {intro && <p className="font-mono text-[11px] leading-relaxed text-retro-text">{intro}</p>}
      {children}
    </section>
  )
}
