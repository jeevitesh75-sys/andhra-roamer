// Andhra Roamer service worker - the game works with NO internet after the first online visit.
// install: downloads everything listed in precache.json (code, three.js from the CDN, map data, 3D models) into one cache.
// fetch:   code = network first (3 s timeout, so git pushes show up) then cache; data/models/CDN = cache first. Multiplayer WebSocket is untouched.
let CACHE = 'ar-boot';
const getList = () => fetch('precache.json', { cache: 'no-store' }).then(r => r.json());
const put = async (c, url) => { try { const req = new Request(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' }); if (await c.match(req)) return; const r = await fetch(req); if (r.ok) await c.put(req, r); } catch (e) { /* offline / blocked: runtime cache will pick it up later */ } };
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    let L; try { L = await getList(); } catch (err) { L = { v: 'x', core: ['./', 'index.html'], extra: [] }; }
    CACHE = 'ar-' + L.v; const c = await caches.open(CACHE);
    await Promise.all(L.core.map(u => put(c, u)));
    for (let i = 0; i < L.extra.length; i += 6) await Promise.all(L.extra.slice(i, i + 6).map(u => put(c, u)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try { const L = await getList(); CACHE = 'ar-' + L.v; } catch (err) { const ks = await caches.keys(); CACHE = ks.filter(k => k.startsWith('ar-')).pop() || CACHE; }
    for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('ar-')) await caches.delete(k);
    await self.clients.claim();
  })());
});
const heavy = u => /\.(glb|bin|png|jpg|jpeg|woff2?)$/i.test(u.pathname) || u.pathname.includes('/data/') || u.hostname === 'cdn.jsdelivr.net';
const cached = async r => { const c = await caches.open(CACHE); return (await c.match(r, { ignoreSearch: true })) || (await caches.match(r, { ignoreSearch: true })); };
const store = (r, res) => { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)).catch(() => {}); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net') return;
  if (u.pathname.endsWith('/precache.json')) return;
  if (heavy(u)) { e.respondWith(cached(r).then(hit => hit || fetch(r).then(res => store(r, res)))); return; }
  e.respondWith((async () => {
    try { const res = await Promise.race([fetch(r), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]); return store(r, res); }
    catch (err) { return (await cached(r)) || (r.mode === 'navigate' ? await cached(new Request('index.html')) : Response.error()); }
  })());
});
