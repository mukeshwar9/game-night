// Page globals the vendored kit expects (animate pieces define these in their head.html).
"use strict";
const FPS = 24, W = 540, H = 540;
const SAFE = { top: 0, bottom: 0 }, CX = W / 2;
const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const canvas = document.getElementById('c');
const SCENES = {};
