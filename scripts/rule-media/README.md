# Rule media capture

Run `npm run dev:emu`, then `npm run rules:media`. Use `-- --only=wordrace,wavelength` to regenerate selected scenes. The original five board scenes retain the scout's Playwright capture driver; expanded scenes use `chrome-devtools-axi` with a named session. Both capture actual demo controls rather than rendering a mock board or changing React state.

The expanded driver writes screenshots to a staging directory outside `public/`. This avoids Vite reloading the demo while a scene is being captured. It verifies the PNG signature when AXI saves a screenshot but returns a parsing error. It publishes a game's light and dark stills together, after all three steps succeed. Unsupported controls produce a reason in `ruleMedia.json`; a failed regeneration retains the previous complete capture.

Each step stores a caption index, dimensions and a highlight rectangle measured from the DOM. A dark variant can have its own geometry. Captions are resolved from `rules.js` at render time. Source hashes cover the demo, its board, imported logic and common theme CSS. They are deliberately conservative: a shared game helper change can require recapturing several scenes.

Scenes are not byte deterministic. Bot turns, random deals and real-time simulation timing can change the illustrative position. Verify the three states and their captions after regeneration. The tests enforce caption validity, registry membership, image dimensions, size limits and source freshness.
