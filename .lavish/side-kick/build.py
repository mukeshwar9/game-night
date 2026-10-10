import pathlib, base64
d = pathlib.Path(__file__).parent
src = (d / 'index.src.html').read_text()
font = base64.b64encode((d / 'press-start-2p-latin.woff2').read_bytes()).decode()
src = src.replace("url('press-start-2p-latin.woff2')", "url('data:font/woff2;base64," + font + "')")
game = ''.join((d / f).read_text() for f in ('a_sim.js', 'b_render.js', 'c_wire.js'))
game = game.replace('/*SPRITES*/[]', (d / 'sprites.json').read_text())
(d / 'game.js').write_text(game)
(d / 'index.html').write_text(src.replace('/*GAME*/', game))
