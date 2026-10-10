import base64, pathlib
d = pathlib.Path(__file__).parent
s = (d / 'index.src.html').read_text()
font = base64.b64encode((d.parent / 'twoplayer-ideas' / 'press-start-2p-latin.woff2').read_bytes()).decode()
s = s.replace('/*FONT*/', font).replace('/*GAMEJS*/', (d / 'game.js').read_text().replace('/*SPRITES*/[]', (d / 'sprites.json').read_text()))
import re, json
css = (d.parent.parent / 'src' / 'index.css').read_text()
labels = dict(re.findall(r"\{ id: '([a-z0-9-]+)',\s*label: '([^']+)'", (d.parent.parent / 'src' / 'lib' / 'theme.js').read_text()))
want = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger', 'structure']
def tokens(block):
    out = {}
    for k in want:
        m = re.search(r'--c-' + k + r':\s*(\d+)\s+(\d+)\s+(\d+)', block)
        if m: out[k] = [int(x) for x in m.groups()]
    return out
root = tokens(css[:css.index('[data-theme="phosphor"] {')])  # MIDNIGHT's tokens are the cascade fallback, declared before the first theme block
themes = []
for tid, label in labels.items():
    if tid == 'midnight': t = dict(root)
    else:
        m = re.search(r'\[data-theme="' + re.escape(tid) + r'"\] \{(.*?)\n\}', css, re.S)
        if not m: continue
        t = {**root, **tokens(m.group(1))}
    themes.append({'id': tid, 'label': label, 't': t})
themes.sort(key=lambda x: x['id'] != 'matcha')
s = s.replace('/*THEMES*/[]', json.dumps(themes, separators=(',', ':')))
print('themes', len(themes))
(d / 'index.html').write_text(s)
print(len(s))
