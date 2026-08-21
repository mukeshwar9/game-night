# Theming Rules

- All colors flow through CSS custom properties `--c-*` (space-separated RGB channel triplets), defined in `src/index.css`. `:root` holds the default "midnight" theme; `[data-theme="…"]` blocks override per theme (phosphor, amber, synthwave, grid, mono).
- **Never hardcode a hex color in `src/`.** SVG presentation attributes (`fill="#fff"` etc.) cannot hold `var()` — use a `style` prop (`style={{ fill: 'rgb(var(--c-…))' }}`) or a Tailwind `fill-*`/`stroke-*` class instead.
- Tailwind color tokens are semantic roles, not hues: `retro-p1` (X accent), `retro-p2` (O accent), `retro-cta` (primary action), `retro-win` (success), plus `retro-tint-p1`/`tint-p2`/`tint-cta`, `retro-structure`, `retro-deep`, and `bg`/`surface`/`card`/`border`/`text`/`dim`. Shadows: `shadow-neon-p1/p2/cta/win`, `shadow-glow-dot`. Text glows: `text-glow-p1/p2/cta/win`.
- To add a theme: one `[data-theme="id"]` block in `src/index.css` + one entry in `THEMES` (`src/lib/theme.js`). Nothing else needs to change.
- Mouse cursors are static white pixel-art SVG data URIs — they can't read CSS vars, so they don't theme. Their vars (`--cursor-arrow/hand/text/no`) live in `:root`.
- **`npm run dev` must be restarted after any `tailwind.config.js` change** — the ESM config is cached for the process lifetime; HMR will not pick it up.
