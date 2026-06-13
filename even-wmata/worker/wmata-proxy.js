// Cloudflare Worker: CORS-enabled WMATA proxy for the DC Metro Board glasses app.
//
// Why this exists: the Even App WebView enforces full CORS, and api.wmata.com
// does not send CORS headers — so the packaged .ehpk cannot call WMATA directly.
// This Worker forwards requests, injects your API key (kept server-side), and
// adds the CORS headers the WebView requires.
//
// Deploy (free tier):
//   1. npm i -g wrangler && wrangler login
//   2. wrangler deploy worker/wmata-proxy.js --name wmata-proxy --compatibility-date 2024-01-01
//   3. wrangler secret put WMATA_API_KEY   (paste your key from developer.wmata.com)
//   4. Put the resulting https://wmata-proxy.<you>.workers.dev URL in:
//        - even-wmata/.env  ->  VITE_WMATA_BASE
//        - even-wmata/app.json -> permissions[].whitelist (the network entry)
//
// Only the two read-only endpoints the app needs are allowed through.

const ALLOWED = [/^\/Rail\.svc\/json\/jStations$/, /^\/StationPrediction\.svc\/json\/GetPrediction\//]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS })
    }

    const url = new URL(request.url)
    if (!ALLOWED.some((re) => re.test(url.pathname))) {
      return new Response('Not Found', { status: 404, headers: CORS })
    }

    const target = new URL('https://api.wmata.com' + url.pathname + url.search)
    const upstream = await fetch(target.toString(), {
      headers: { api_key: env.WMATA_API_KEY, Accept: 'application/json' },
    })

    const headers = new Headers(CORS)
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
    // Short edge cache to stay polite to WMATA without going stale.
    headers.set('Cache-Control', 'public, max-age=10')
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
