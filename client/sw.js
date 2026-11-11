// Andhra Roamer service worker: makes the game installable and caches assets so it starts fast.
// Code (html/js/css/config) = network first (so every git push shows up), big files (models, map data, three.js CDN) = cache first.
const V = 'ar-v1', SHELL = ['./', 'index.html', 'style.css', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const heavy = u => /\.(glb|bin|png|jpg|jpeg|woff2?)$/i.test(u.pathname) || u.hostname === 'cdn.jsdelivr.net' || u.pathname.includes('/data/');
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url); if (u.protocol !== 'https:' && u.hostname !== 'localhost') return;
  const same = u.origin === location.origin; if (!same && u.hostname !== 'cdn.jsdelivr.net') return;
  if (heavy(u)) {
    e.respondWith(caches.open(V).then(async c => { const hit = await c.match(r); if (hit) return hit; const res = await fetch(r); if (res.ok || res.type === 'opaque') c.put(r, res.clone()).catch(() => {}); return res; }));
  } else {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; }).catch(() => caches.match(r).then(h => h || caches.match('index.html'))));
  }
});
