import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CUSTOM_SCHEME, isDuplicateOpen, linkOrigins, pathFromAppUrl } from './deepLinkLogic'

const ORIGINS = ['https://game-night-91464.web.app', 'https://game-night-91464.firebaseapp.com']

describe('pathFromAppUrl: web links', () => {
  it('returns pathname, search and hash for an allowed https origin', () => {
    expect(pathFromAppUrl('https://game-night-91464.web.app/game/abc123', ORIGINS)).toBe('/game/abc123')
    expect(pathFromAppUrl('https://game-night-91464.web.app/game/abc123?ref=invite#seat', ORIGINS)).toBe('/game/abc123?ref=invite#seat')
    expect(pathFromAppUrl('https://game-night-91464.web.app/solo/tictactoe', ORIGINS)).toBe('/solo/tictactoe')
    expect(pathFromAppUrl('https://game-night-91464.web.app/', ORIGINS)).toBe('/')
    expect(pathFromAppUrl('https://game-night-91464.web.app', ORIGINS)).toBe('/')
  })

  it('accepts every extra allowed origin (twin domain, custom domain)', () => {
    const origins = [...ORIGINS, 'https://play.example.com']
    expect(pathFromAppUrl('https://game-night-91464.firebaseapp.com/daily', origins)).toBe('/daily')
    expect(pathFromAppUrl('https://play.example.com/friends', origins)).toBe('/friends')
  })

  it('matches the origin case-insensitively and normalizes the default port', () => {
    expect(pathFromAppUrl('HTTPS://Game-Night-91464.WEB.APP:443/profile', ORIGINS)).toBe('/profile')
  })

  it('tolerates allowed origins with a trailing slash or path', () => {
    expect(pathFromAppUrl('https://game-night-91464.web.app/daily', ['https://game-night-91464.web.app/'])).toBe('/daily')
  })

  it('refuses other origins, lookalikes, and other schemes', () => {
    expect(pathFromAppUrl('https://evil.example/game/abc', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('https://game-night-91464.web.app.evil.example/game/abc', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('https://evil-game-night-91464.web.app/game/abc', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('https://game-night-91464.web.app:8443/game/abc', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('http://game-night-91464.web.app/game/abc', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('capacitor://localhost/game/abc', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('javascript:alert(1)', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('data:text/html,hi', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('ftp://game-night-91464.web.app/game/abc', ORIGINS)).toBeNull()
  })

  it('refuses userinfo tricks', () => {
    expect(pathFromAppUrl('https://game-night-91464.web.app@evil.example/game/abc', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('https://user:pw@game-night-91464.web.app/game/abc', ORIGINS)).toBeNull()
  })

  it('refuses everything when no origin is allowed', () => {
    expect(pathFromAppUrl('https://game-night-91464.web.app/game/abc')).toBeNull()
    expect(pathFromAppUrl('https://game-night-91464.web.app/game/abc', [])).toBeNull()
  })

  it('ignores junk and non-https entries in the allowed list', () => {
    expect(pathFromAppUrl('http://localhost/game/abc', ['http://localhost', 'not a url', ''])).toBeNull()
    expect(pathFromAppUrl('https://game-night-91464.web.app/game/abc', ['not a url', ORIGINS[0]])).toBe('/game/abc')
  })

  it('refuses a double-slash path even on an allowed origin', () => {
    expect(pathFromAppUrl('https://game-night-91464.web.app//evil.example/x', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('https://game-night-91464.web.app/game//abc', ORIGINS)).toBeNull()
  })
})

describe('pathFromAppUrl: custom scheme', () => {
  it('uses gamenight://', () => {
    expect(CUSTOM_SCHEME).toBe('gamenight')
  })

  it('maps the host-and-path form to an in-app path', () => {
    expect(pathFromAppUrl('gamenight://game/abc123')).toBe('/game/abc123')
    expect(pathFromAppUrl('gamenight://game/abc123?x=1#y')).toBe('/game/abc123?x=1#y')
    expect(pathFromAppUrl('gamenight://daily')).toBe('/daily')
    expect(pathFromAppUrl('gamenight://solo/tictactoe')).toBe('/solo/tictactoe')
  })

  it('maps the triple-slash and empty forms', () => {
    expect(pathFromAppUrl('gamenight:///game/abc123')).toBe('/game/abc123')
    expect(pathFromAppUrl('gamenight://')).toBe('/')
    expect(pathFromAppUrl('gamenight:///')).toBe('/')
  })

  it('is case-insensitive on the scheme', () => {
    expect(pathFromAppUrl('GameNight://game/abc')).toBe('/game/abc')
  })

  it('does not need an allowed origin', () => {
    expect(pathFromAppUrl('gamenight://friends', [])).toBe('/friends')
  })

  it('refuses other schemes that merely look similar', () => {
    expect(pathFromAppUrl('gamenightx://game/abc')).toBeNull()
    expect(pathFromAppUrl('app.gamenight://game/abc')).toBeNull()
    expect(pathFromAppUrl('gamenight:game/abc')).toBeNull()
  })

  it('refuses protocol-relative and external escapes', () => {
    expect(pathFromAppUrl('gamenight:////evil.example/x')).toBeNull()
    expect(pathFromAppUrl('gamenight://evil.example//x')).toBeNull()
    expect(pathFromAppUrl('gamenight://game/../../privacy')).toBeNull()
  })

  it('collapses dot segments like a router would', () => {
    expect(pathFromAppUrl('gamenight://game/../daily')).toBe('/daily')
  })
})

describe('pathFromAppUrl: pages that belong in the browser', () => {
  const web = (p) => pathFromAppUrl(`https://game-night-91464.web.app${p}`, ORIGINS)

  it('refuses /privacy, /terms and /support in every spelling', () => {
    for (const p of ['/privacy', '/privacy/', '/privacy.html', '/privacy?x=1', '/privacy#top', '/Privacy', '/terms', '/terms.html', '/TERMS/', '/privacy/extra', '/support', '/support.html', '/Support/']) {
      expect(web(p), p).toBeNull()
    }
  })

  it('refuses the Firebase handler and well-known files', () => {
    expect(web('/__/auth/handler?x=1')).toBeNull()
    expect(web('/__/firebase/init.json')).toBeNull()
    expect(web('/.well-known/security.txt')).toBeNull()
    expect(web('/.well-known/apple-app-site-association')).toBeNull()
  })

  it('refuses static files', () => {
    for (const p of ['/robots.txt', '/sitemap.xml', '/sw.js', '/favicon.ico', '/assets/index-abc.js']) {
      expect(web(p), p).toBeNull()
    }
  })

  it('refuses the same pages through the custom scheme', () => {
    expect(pathFromAppUrl('gamenight://privacy')).toBeNull()
    expect(pathFromAppUrl('gamenight://terms.html')).toBeNull()
    expect(pathFromAppUrl('gamenight://__/auth/handler')).toBeNull()
  })

  it('does not over-match names that only start with the same letters', () => {
    expect(web('/privacypolicy-game')).toBe('/privacypolicy-game')
    expect(web('/termsheet')).toBe('/termsheet')
  })
})

describe('pathFromAppUrl: hostile input', () => {
  it('returns null for non-strings and empty values', () => {
    for (const v of [undefined, null, 42, {}, [], '', '   ']) expect(pathFromAppUrl(v, ORIGINS)).toBeNull()
  })

  it('refuses backslashes and control characters', () => {
    expect(pathFromAppUrl('https://game-night-91464.web.app/\\evil.example', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('gamenight://\\evil.example', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('https://game-night-91464.web.app/game/a\nb', ORIGINS)).toBeNull()
    expect(pathFromAppUrl('gamenight://game/a\u0000b', ORIGINS)).toBeNull()
  })

  it('refuses absurdly long links', () => {
    expect(pathFromAppUrl(`https://game-night-91464.web.app/game/${'a'.repeat(3000)}`, ORIGINS)).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(pathFromAppUrl('  https://game-night-91464.web.app/daily \n'.trim(), ORIGINS)).toBe('/daily')
    expect(pathFromAppUrl(' gamenight://daily ', ORIGINS)).toBe('/daily')
  })

  it('keeps percent-encoding as sent', () => {
    expect(pathFromAppUrl('https://game-night-91464.web.app/game/a%20b', ORIGINS)).toBe('/game/a%20b')
    expect(pathFromAppUrl('https://game-night-91464.web.app/%2F%2Fevil', ORIGINS)).toBe('/%2F%2Fevil')
  })
})

describe('isDuplicateOpen', () => {
  it('flags the same path inside the window only', () => {
    const last = { path: '/game/a', at: 1000 }
    expect(isDuplicateOpen(last, '/game/a', 1500)).toBe(true)
    expect(isDuplicateOpen(last, '/game/a', 3000)).toBe(false)
    expect(isDuplicateOpen(last, '/game/b', 1500)).toBe(false)
  })

  it('never flags the first link, or a clock that went backwards', () => {
    expect(isDuplicateOpen(null, '/game/a', 1000)).toBe(false)
    expect(isDuplicateOpen({ path: '/game/a', at: 5000 }, '/game/a', 1000)).toBe(false)
  })

  it('honors a custom window', () => {
    expect(isDuplicateOpen({ path: '/x', at: 0 }, '/x', 400, 500)).toBe(true)
    expect(isDuplicateOpen({ path: '/x', at: 0 }, '/x', 600, 500)).toBe(false)
  })
})

describe('linkOrigins', () => {
  it('collects the public origin, the project twins and extras without duplicates', () => {
    expect(linkOrigins({
      publicOrigin: 'https://game-night-91464.web.app',
      authDomain: 'game-night-91464.firebaseapp.com',
      projectId: 'game-night-91464',
      extra: 'https://play.example.com, https://www.example.com/ https://play.example.com',
    })).toEqual([
      'https://game-night-91464.web.app',
      'https://game-night-91464.firebaseapp.com',
      'https://play.example.com',
      'https://www.example.com',
    ])
  })

  it('drops non-https and junk entries', () => {
    expect(linkOrigins({ publicOrigin: 'http://localhost:5173', extra: 'nope, ftp://x.example, https://ok.example' })).toEqual(['https://ok.example'])
  })

  it('returns an empty list with no sources', () => {
    expect(linkOrigins()).toEqual([])
    expect(linkOrigins({ extra: undefined })).toEqual([])
  })
})

// The well-known files are what makes the OS hand these links to the app; the
// Universal Link routes have to agree with what the app is willing to open.
describe('public/.well-known association files', () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../../public/.well-known/${name}`, import.meta.url), 'utf8'))
  const aasa = read('apple-app-site-association')
  const components = aasa.applinks.details[0].components

  it('declares one appID as TEAMID.bundleId', () => {
    expect(aasa.applinks.details).toHaveLength(1)
    expect(aasa.applinks.details[0].appIDs).toEqual([expect.stringMatching(/^[A-Z0-9_]+\.app\.gamenight$/)])
  })

  it('lists the excludes before the includes (first match wins)', () => {
    const firstInclude = components.findIndex(c => !c.exclude)
    expect(components.slice(firstInclude).some(c => c.exclude)).toBe(false)
    const excluded = components.filter(c => c.exclude).map(c => c['/'])
    expect(excluded).toEqual(['/privacy*', '/terms*', '/support*', '/__/*'])
  })

  it('routes exactly the paths the app opens in place', () => {
    const included = components.filter(c => !c.exclude).map(c => c['/'])
    expect(included).toEqual(['/game/*', '/daily', '/solo/*', '/play/*', '/friends', '/profile'])
    for (const p of ['/game/abc', '/daily', '/solo/chess', '/play/chess', '/friends', '/profile']) {
      expect(pathFromAppUrl(`https://game-night-91464.web.app${p}`, ORIGINS), p).toBe(p)
    }
  })

  it('points assetlinks.json at the same application id', () => {
    const links = read('assetlinks.json')
    expect(links).toHaveLength(1)
    expect(links[0].relation).toContain('delegate_permission/common.handle_all_urls')
    expect(links[0].target.namespace).toBe('android_app')
    expect(links[0].target.package_name).toBe('app.gamenight')
    expect(links[0].target.sha256_cert_fingerprints.length).toBeGreaterThan(0)
  })
})
