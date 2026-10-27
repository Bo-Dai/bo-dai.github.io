/* Cloudflare Worker behind the homepage visitor globe (js/globe.js).
 * Adapted from rushi-q.github.io (MIT), keeping only the visit counter.
 *
 *   POST /hit    count the current visitor (city-level geo from request.cf)
 *   GET  /stats  { points: [{ label, lat, lon, count }] }
 *
 * Stores only aggregated city-level counts in the VISITS KV namespace: no IPs, no cookies.
 */

const ORIGIN = 'https://bo-dai.github.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Content-Type': 'application/json',
    };
    const json = (obj, status = 200, extra = {}) =>
      new Response(JSON.stringify(obj), { status, headers: { ...headers, ...extra } });

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    if (url.pathname === '/hit' && request.method === 'POST') {
      const cf = request.cf || {};
      if (cf.latitude == null || cf.longitude == null) return json({ ok: false });
      const key = [cf.country || '??', cf.city || '', (+cf.latitude).toFixed(1), (+cf.longitude).toFixed(1)].join('|');
      const current = parseInt((await env.VISITS.get(key)) || '0', 10);
      await env.VISITS.put(key, String(current + 1));
      return json({ ok: true });
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      const list = await env.VISITS.list({ limit: 1000 });
      const points = await Promise.all(
        list.keys.map(async (k) => {
          const [country, city, lat, lon] = k.name.split('|');
          const count = parseInt((await env.VISITS.get(k.name)) || '0', 10);
          return { label: city ? city + ', ' + country : country, lat: +lat, lon: +lon, count };
        })
      );
      return json({ points }, 200, { 'Cache-Control': 'public, max-age=300' });
    }

    return json({ error: 'not found' }, 404);
  },
};
