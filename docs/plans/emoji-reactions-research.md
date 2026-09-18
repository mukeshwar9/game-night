# Emoji reactions research

## Current implementation

- Registry: `src/lib/emotes.js`
  - Primary quick bar: `EMOTES_PRIMARY`
  - Picker faces: `EMOTES_PICKER_FACES`
  - Picker gestures: `EMOTES_PICKER_GESTURES`
  - Search keywords: `EMOTE_KEYWORDS`
  - Quick chat chips: `QUICK_CHAT`
- Animated rendering: `src/components/AnimatedEmoji.jsx`
  - Uses Noto Emoji animated assets from `https://fonts.gstatic.com/s/e/notoemoji/latest/{codepoints}/512.gif`.
  - Uses `512.webp` when user prefers reduced motion.
  - Falls back to native emoji text if asset fails.
- Picker UI: `src/components/EmoteBar.jsx`
  - Current picker sections: `FACES`, `GESTURES`.
  - Search supports keyword prefix matching.
  - Frequent/recent user picks are promoted by `src/lib/emoteUsage.js`.
- Sound coverage: `src/lib/sounds.js`
  - `hasReactionCoverage(glyph)` requires each picker glyph to have either explicit `REACTION_SOUNDS` or a face archetype.
  - Current explicit non-face sounds cover: `🔥 😂 😭 😎 👏 💀 🤫 ❤️ 🎉 🤔 😱 👍 🙏 💪 😤 🎯 ⚡ 🥶 🍀`.
  - Most faces map through `GLYPH_ARCHETYPE`.
- Tests:
  - `src/lib/emotes.test.js` requires no duplicate picker glyphs and sound coverage for every picker glyph.

## Current catalog size

Measured from current code:

- Picker total: 122 glyphs.
- Faces: 111 glyphs.
- Gestures: 14 glyphs.
- Missing keyword entries: 0.

Interpretation: faces are strong already. Non-face reactions are thin.

## Noto animated asset coverage research

Checked candidate emoji against Noto animated `512.gif` URLs using HEAD requests.

### Good expansion candidates with animated GIF support

Gestures / social:

- `🙌` raised hands
- `🤝` handshake
- `🤞` crossed fingers
- `✌️` victory
- `🤟` love-you gesture
- `🤘` horns
- `👌` ok
- `👋` wave
- `🤌` pinched fingers
- `👀` eyes
- `🫶` heart hands
- `💅` nail polish
- `🫵` pointing at viewer

Game / win / status:

- `💯` hundred
- `🏆` trophy
- `🥇` gold medal
- `🎲` die
- `🏁` finish flag
- `🚩` flag
- `♟️` chess pawn

Idea / alert / state:

- `🧠` brain
- `💡` light bulb
- `⏰` alarm clock
- `⌛` hourglass
- `❓` question
- `❗` exclamation
- `✅` check
- `❌` cross
- `📣` megaphone
- `🔔` bell
- `🔒` lock

Impact / magic / effects:

- `💣` bomb
- `🚀` rocket
- `✨` sparkles
- `🌟` glowing star
- `⭐` star
- `🌈` rainbow
- `🌧️` rain cloud
- `💎` gem
- `🪄` magic wand

Food / celebration:

- `🍕` pizza
- `🍔` burger
- `🍩` donut
- `☕` coffee
- `🧃` juice
- `🍿` popcorn
- `🎁` gift
- `🥂` toast
- `🍻` beers

Sports:

- `⚽` soccer
- `🏀` basketball
- `⚾` baseball
- `🎾` tennis
- `🏓` ping pong
- `🏸` badminton
- `🎳` bowling
- `🎱` 8-ball

Hearts/colors:

- `🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖`

### Candidate emoji without Noto animated GIF support

Avoid for animated picker unless text fallback is acceptable:

- `🎮`, `🕹️`, `🃏`
- `🛡️`, `⚔️`, `🧨`
- `☔`, `🧊`, `🧲`
- `💤`, `🪦`, `🧯`, `🎵`, `🏅`
- `🏈`, `🏐`, `🥊`, `🥅`, `🥌`
- `🧩`, `📌`, `📝`, `🔍`, `🔓`, `🔑`

## Recommended additions

Add in phases, not all at once. Too many choices hurt picker speed.

### Phase 1: high-value reaction pack

Add 24 glyphs:

```js
['🙌','🤝','🤞','✌️','👌','👋','👀','🫶','💯','🏆','🥇','🎲','🧠','💡','❓','❗','✅','❌','💣','🚀','✨','🌟','💎','🪄']
```

Why:

- All animated by Noto.
- Useful in games.
- Distinct meanings.
- Small enough for picker usability.

### Phase 2: sports / food / hearts packs

Add as collapsible picker sections later:

- `SPORTS`: `⚽ 🏀 ⚾ 🎾 🏓 🏸 🎳 🎱 🏁 🚩`
- `SNACKS`: `🍕 🍔 🍩 ☕ 🧃 🍿`
- `HEARTS`: `🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖`

Need UI sectioning before adding all; otherwise picker becomes long.

## Sound strategy

Adding non-face emoji requires sound coverage or tests fail.

Recommended sound archetypes instead of one bespoke synth per glyph:

- `cheer`: `🙌 🏆 🥇 💯`
- `hand`: `🤝 🤞 ✌️ 👌 👋 🫶`
- `attention`: `👀 ❓ ❗ 📣 🔔`
- `correct`: `✅`
- `wrong`: `❌`
- `idea`: `🧠 💡`
- `impact`: `💣`
- `launch`: `🚀`
- `magic`: `✨ 🌟 💎 🪄`
- `chance`: `🎲`
- `food`: `🍕 🍔 🍩 ☕ 🧃 🍿`
- `sport`: `⚽ 🏀 ⚾ 🎾 🏓 🏸 🎳 🎱`
- `heart`: all heart colors

Implementation options:

1. Add `NON_FACE_ARCHETYPE` map in `sounds.js`.
2. Add `REACTION_ARCHETYPE_AUDIO` + `REACTION_ARCHETYPE_HAPTIC`.
3. Make `hasReactionCoverage(glyph)` check explicit sound, face archetype, or non-face archetype.

This avoids 50 copy-pasted `REACTION_SOUNDS` entries.

## Picker UX recommendation

Current picker has only `FACES` and `GESTURES`. After expansion, use sections:

- `FACES`
- `HANDS`
- `HYPE`
- `GAME`
- `VIBES`

Search still searches all sections.

Quick bar should remain short. Do not add all new emoji to `EMOTES_PRIMARY`.

Recommended primary quick bar update:

```js
['🔥', '😂', '😭', '😎', '👏', '💀', '🤫', '🙌', '💯']
```

But keep max visible quick bar manageable. Since usage personalization already promotes frequent picks, default primary can stay 7 if layout feels cramped.

## Performance notes

- Noto GIFs load only when reaction floats or Emoji Lab previews use `AnimatedEmoji`; picker buttons render native emoji text, so large picker does not load dozens of GIFs.
- Reaction float size is `w-20 h-20`; each reaction loads one GIF. OK.
- Fallback already exists for unavailable assets.
- Reduced-motion users get `512.webp`, not GIF.

## Implementation checklist

1. Expand `src/lib/emotes.js`:
   - Add new arrays: `EMOTES_HANDS`, `EMOTES_HYPE`, `EMOTES_GAME`, `EMOTES_VIBES`.
   - Include them in `EMOTES_PICKER_ALL`.
   - Add keywords for every new glyph.
2. Update `src/components/EmoteBar.jsx`:
   - Render new sections when query empty.
3. Update `src/lib/sounds.js`:
   - Add non-face archetype maps for audio/haptics.
   - Update `hasReactionCoverage`.
4. Update tests:
   - `emotes.test.js` should assert larger non-face catalog.
5. Manual test in `/emoji-lab`:
   - Search by keyword.
   - Play sounds.
   - Verify animated asset fallback.
6. Manual test in game:
   - Send new reactions while rules/invite popup open.
   - Verify float appears above popup and sound plays.

## Recommended first implementation

Implement Phase 1 only:

```js
['🙌','🤝','🤞','✌️','👌','👋','👀','🫶','💯','🏆','🥇','🎲','🧠','💡','❓','❗','✅','❌','💣','🚀','✨','🌟','💎','🪄']
```

This gives more variety without bloating UI. Phase 2 can follow after players use Emoji Lab and confirm favorite categories.
