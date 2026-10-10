#!/bin/bash
# Captures the prototype's transient states. Usage: shots.sh <outdir> <width> <height>
export CHROME_DEVTOOLS_AXI_SESSION=crashit-s1
O="$1"; q(){ chrome-devtools-axi "$@" >/dev/null 2>&1; }
SC="() => { const y = document.getElementById('proto').getBoundingClientRect().top + scrollY - 6; scrollTo({ top: y, behavior: 'instant' }); return y }"
ev(){ chrome-devtools-axi eval "$1" 2>&1 | head -1; chrome-devtools-axi eval "$SC" >/dev/null 2>&1; }
waitp='(p, ms) => new Promise(r => { const t0 = performance.now(); const iv = setInterval(() => { if (window.__bonk.phase() === p || performance.now() - t0 > ms) { clearInterval(iv); r(window.__bonk.phase()) } }, 20) })'
q open http://127.0.0.1:8765/index.html; q resize "$2" "$3"
ev "() => 'menu'"; q wait 400; q screenshot "$O/1_menu.png"
ev "() => { const g = window.__bonk; g.hold('count', 0.7); document.querySelector('[data-act=start]').click(); return 'count' }"; q wait 1200; q screenshot "$O/2_count.png"
ev "() => { const g = window.__bonk; g.hold('play', 2.0); g.press(0, 0, 1); return 'play' }"; q wait 3200; q screenshot "$O/3_play.png"
ev "() => { const g = window.__bonk; g.hold('ko', 0.3); g.press(0, 0, 0); return ($waitp)('ko', 25000) }"; q wait 700; q screenshot "$O/4_ko.png"
ev "() => { const g = window.__bonk; g.hold(null); return ($waitp)('pick', 6000) }"; q wait 500; q screenshot "$O/5_pick.png"
ev "() => { const t = document.getElementById('theme'); t.value = 'synthwave'; t.dispatchEvent(new Event('change')); const g = window.__bonk; document.querySelector('[data-cfg=wild]').click(); document.querySelector('[data-act=mode][data-v=two]').click(); g.hold('play', 1.6); document.querySelector('[data-act=start]').click(); g.press(0, 0, 1); g.press(1, 1, 0); return 'two' }"; q wait 4600; q screenshot "$O/6_two_night.png"
ev "() => { const g = window.__bonk; g.press(0,0,0); g.press(1,0,0); document.querySelector('[data-act=mode][data-v=melee]').click(); g.hold('play', 2.2); document.querySelector('[data-act=start]').click(); return 'melee' }"; q wait 5200; q screenshot "$O/7_melee_night.png"
ev "() => { const t = document.getElementById('theme'); t.value = 'cartridge'; t.dispatchEvent(new Event('change')); const g = window.__bonk; g.hold('count', 0.5); document.querySelector('[data-act=mode][data-v=bot]').click(); document.querySelector('[data-act=start]').click(); return 'cart' }"; q wait 1500; q screenshot "$O/8_cartridge.png"
chrome-devtools-axi console --type error 2>&1 | head -6
