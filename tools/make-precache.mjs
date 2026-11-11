// Writes client/precache.json: every file the game needs to run with NO internet. Run after adding/changing files:  node tools/make-precache.mjs
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const root = new URL('../client/', import.meta.url).pathname, list = [];
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else list.push(path.relative(root, p).split(path.sep).join('/')); } };
walk(root);
const skip = new Set(['precache.json', 'sw.js', 'vercel.json']), files = list.filter(f => !skip.has(f)).sort();
const isExtra = f => f.startsWith('data/') || f.startsWith('assets/');
const T = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const cdn = [T + 'build/three.module.js', T + 'examples/jsm/loaders/GLTFLoader.js', T + 'examples/jsm/utils/SkeletonUtils.js', T + 'examples/jsm/utils/BufferGeometryUtils.js'];
const core = ['./', ...files.filter(f => !isExtra(f)), ...cdn], extra = files.filter(isExtra);
const h = crypto.createHash('md5'); for (const f of files) h.update(f + fs.statSync(path.join(root, f)).size + fs.statSync(path.join(root, f)).mtimeMs);
const v = h.digest('hex').slice(0, 8);
fs.writeFileSync(path.join(root, 'precache.json'), JSON.stringify({ v, core, extra }));
console.log('precache.json:', core.length, 'core +', extra.length, 'extra files, version', v);
