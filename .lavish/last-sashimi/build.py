import base64,sys
hold=sys.argv[1]
t=open('index.src.html').read()
t=t.replace('__FONT__',base64.b64encode(open('press-start-2p-latin.woff2','rb').read()).decode())
t=t.replace('__THEMES__',open('themes.embed.json').read())
t=t.replace('__GAME__',open('game.js').read()).replace('__HOLD__',hold)
open('index.html','w').write(t)
print(len(t))
