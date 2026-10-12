// Page globals the vendored kit expects (animate pieces define these in their head.html).
"use strict";
const FPS = 24, W = 540, H = 540;
const SAFE = { top: 0, bottom: 0 }, CX = W / 2;
const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const canvas = document.getElementById('c');
const SCENES = {};
// Scenes that lay their own story beats on the loop (the sample games) get the raw phase; every other
// scene is written as plain whole-cycle motion and is run through beat() so it moves on the same beat.
const OWN_BEAT = new Set();
// The shared beat of a 1 s loop: rest, then one eased stretch of action centred on 0.46 (anticipation,
// impact, settle), then rest — the shape of the approved tiles' motion. Monotone, 0 at 0 and 1 at 1.
const beat = (p) => {
  const u = Math.min(1, Math.max(0, (p - 0.14) / 0.64));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
