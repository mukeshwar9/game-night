"""Rebuild scene-themes-board.html from template.html.

The board inlines its fonts as base64 so it opens standalone (and inside
sandboxed viewers with an opaque origin). Bungee is already in the app's
public/fonts/. The other four are SIL OFL 1.1 Google Fonts and are not
committed here: download the latin .woff2 files listed in font-sources.css
into designs/fonts/ under the names below, then run `python3 build.py`.
"""
import base64
import pathlib

S = pathlib.Path(__file__).resolve().parent
APP_FONTS = S.parents[2] / 'public' / 'fonts'
FONTS = {
    '__GRIFFY__': S / 'fonts' / 'griffy.woff2',
    '__MOC__': S / 'fonts' / 'moc.woff2',  # Mountains of Christmas Bold
    '__BUNGEE__': APP_FONTS / 'bungee.woff2',
    '__YATRA__': S / 'fonts' / 'yatra.woff2',  # Yatra One
    '__BALOO__': S / 'fonts' / 'baloo.woff2',  # Baloo 2 (variable)
}

t = (S / 'template.html').read_text()
for key, path in FONTS.items():
    t = t.replace(key, base64.b64encode(path.read_bytes()).decode())
assert '__GRIFFY__' not in t
(S / 'scene-themes-board.html').write_text(t)
print(len(t))
