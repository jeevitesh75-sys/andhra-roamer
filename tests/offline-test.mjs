// Offline test: serves client/, lets the service worker install, goes offline, reloads and checks the files still come from cache.
// (three.js comes from a CDN that the sandbox cannot reach, so this proves the shell/data/models cache, not a full game start.)
import http from 'http'; import fs from 'fs'; import path from 'path';
import { createRequire } from 'module'; const require = createRequire(import.meta.url); let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/usr/local/lib/node_modules/playwright')); }
const root = new URL('../client/', import.meta.url).pathname, types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(0);
const port = srv.address().port, base = `http://localhost:${port}/`;
const b = await chromium.launch(), ctx = await b.newContext(), page = await ctx.newPage();
await page.route(/cdn\.jsdelivr\.net|unpkg\.com/, r => r.abort());
await page.goto(base); await page.evaluate(() => navigator.serviceWorker.ready);
const L = JSON.parse(fs.readFileSync(root + 'precache.json')); const want = L.core.filter(u => !u.startsWith('http')).length + L.extra.length;
let n = 0; for (let i = 0; i < 40; i++) { n = await page.evaluate(async () => { const ks = await caches.keys(); let t = 0; for (const k of ks) t += (await (await caches.open(k)).keys()).length; return t; }); if (n >= want - 1) break; await page.waitForTimeout(500); }
console.log('cached entries', n, 'of', want); if (n < want - 1) throw new Error('precache incomplete');
await ctx.setOffline(true); await page.reload(); const title = await page.title(); if (!/Andhra Roamer/.test(title)) throw new Error('offline reload failed: ' + title);
const r = await page.evaluate(async () => { const a = await fetch('data/tirupati.json'); const g = await fetch('assets/models/swat.glb'); const m = await import('./src/story.js').then(() => 'module ok').catch(e => 'module fail ' + e.message); return [a.ok, (await g.arrayBuffer()).byteLength > 1000, m]; });
console.log('offline:', title, r); if (!r[0] || !r[1] || r[2] !== 'module ok') throw new Error('offline assets failed');
console.log('OFFLINE TEST PASSED'); await b.close(); srv.close();
