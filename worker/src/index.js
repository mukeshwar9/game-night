// Free invite-push sender for Spark plan. Client writes invites/{uid} to RTDB
// as today, then POSTs here; Worker verifies Firebase ID token, reads
// recipient fcmTokens via RTDB REST, sends FCM HTTP v1, drops dead tokens.
// No Cloud Functions, no Blaze. Deploy: `npm run deploy:push-worker` (see README).
import { createRemoteJWKSet, jwtVerify } from 'jose'

const GOOGLE_CERTS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

let jwks = null
function remoteSet() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(GOOGLE_CERTS))
  }
  return jwks
}

async function verifyIdToken(idToken, projectId) {
  const { payload } = await jwtVerify(idToken, remoteSet(), {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  })
  if (!payload.sub) throw new Error('no-sub')
  return payload
}

// Service-account JWT → Google OAuth access token (no firebase-admin in Workers).
async function googleAccessToken(serviceAccount) {
  const { client_email, private_key } = serviceAccount
  const { SignJWT, importPKCS8 } = await import('jose')
  const key = await importPKCS8(private_key.replace(/\\n/g, '\n'), 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/firebase.database' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(client_email)
    .setSubject(client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`oauth: ${JSON.stringify(json).slice(0, 200)}`)
  return json.access_token
}

async function rtdbGet(dbUrl, path, token) {
  const res = await fetch(`${dbUrl}/${path}.json?access_token=${token}`)
  if (!res.ok) throw new Error(`rtdb-get ${res.status}`)
  return res.json()
}

async function rtdbUpdate(dbUrl, updates, token) {
  const res = await fetch(`${dbUrl}/.json?access_token=${token}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`rtdb-update ${res.status}`)
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      })
    }
    if (request.method !== 'POST' || !request.url.endsWith('/push-invite')) {
      return Response.json({ ok: false, error: 'not-found' }, { status: 404 })
    }
    try {
      const auth = request.headers.get('authorization') || ''
      const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!idToken) return Response.json({ ok: false, error: 'no-token' }, { status: 401 })
      const claims = await verifyIdToken(idToken, env.FIREBASE_PROJECT_ID)
      const { toUid, invite } = await request.json()
      if (!toUid || !invite?.gameId) return Response.json({ ok: false, error: 'bad-args' }, { status: 400 })
      if (invite.fromUid !== claims.sub) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })

      const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
      const access = await googleAccessToken(sa)
      const tokensObj = await rtdbGet(env.FIREBASE_DATABASE_URL, `users/${toUid}/fcmTokens`, access)
      const entries = Object.entries(tokensObj || {})
        .filter(([, v]) => typeof v?.token === 'string' && v.token.length >= 20)
        .map(([hash, v]) => ({ hash, token: v.token }))
      if (!entries.length) return Response.json({ ok: true, sent: 0, reason: 'no-tokens' })

      const from = String(invite.fromName || 'A friend').slice(0, 40)
      const message = {
        message: {
          notification: { title: 'Game Night', body: `${from} invited you to play!` },
          data: { url: `/g/${String(invite.gameId)}`, kind: 'invite' },
          token: '',
        },
      }
      let sent = 0
      const dead = []
      // FCM HTTP v1 sends one token per request; invites fan out small.
      for (const e of entries.slice(0, 20)) {
        message.message.token = e.token
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
          body: JSON.stringify(message),
        })
        if (res.ok) { sent++; continue }
        const err = await res.text()
        if (err.includes('NOT_FOUND') || err.includes('INVALID_ARGUMENT')) dead.push(e.hash)
      }
      if (dead.length) {
        const updates = {}
        for (const h of dead) updates[`users/${toUid}/fcmTokens/${h}`] = null
        await rtdbUpdate(env.FIREBASE_DATABASE_URL, updates, access)
      }
      const headers = { 'access-control-allow-origin': env.ALLOWED_ORIGIN || '*' }
      return Response.json({ ok: true, sent }, { headers })
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 })
    }
  },
}
