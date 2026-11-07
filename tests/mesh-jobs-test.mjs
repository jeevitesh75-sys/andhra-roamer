import assert from 'node:assert';
import { createWorld } from '../client/src/geo.js';
import { terrainChunk, roadPieces, cityStreets, cityBuildings, roundTreeGeometry, palmGeometry, treesForChunk, CHUNK } from '../client/src/meshbuild.js';
import { generateOffers, JobRunner, rankFor } from '../client/src/jobs.js';
const w = createWorld();
const finite = (a, name) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw new Error(name + ' has non-finite value at ' + i); };
const inRange = (idx, nv, name) => { for (let i = 0; i < idx.length; i++) if (idx[i] >= nv) throw new Error(name + ' index out of range'); };

// terrain chunk around Vijayawada
const vz = w.cityByName.get('Vijayawada');
let t = performance.now();
const tc = terrainChunk(w, Math.floor(vz.x / CHUNK), Math.floor(vz.z / CHUNK));
console.log('terrain chunk ms', Math.round(performance.now() - t), 'verts', tc.pos.length / 3, 'tris', tc.idx.length / 3);
['pos', 'nor', 'col', 'uv'].forEach(k => finite(tc[k], 'terrain.' + k)); inRange(tc.idx, tc.pos.length / 3, 'terrain');
// triangle winding: face normal of first triangle should point up (+y)
{ const [a, b, c] = [tc.idx[0], tc.idx[1], tc.idx[2]].map(i => [tc.pos[3*i], tc.pos[3*i+1], tc.pos[3*i+2]]);
  const u = b.map((v, i) => v - a[i]), v = c.map((x, i) => x - a[i]); const ny = u[2] * v[0] - u[0] * v[2];
  assert(ny > 0, 'terrain triangles face up (CCW from above), got ' + ny); }
// adjacent chunks share edge vertices exactly (seamless)
const tcR = terrainChunk(w, Math.floor(vz.x / CHUNK) + 1, Math.floor(vz.z / CHUNK));
const n = 49; let maxGap = 0; for (let j = 0; j < n; j++) maxGap = Math.max(maxGap, Math.abs(tc.pos[3 * (j * n + n - 1) + 1] - tcR.pos[3 * (j * n) + 1]));
console.log('chunk seam max height gap', maxGap);
assert(maxGap < 1e-4);

// roads
const r0 = w.roads[0]; const pieces = roadPieces(w, r0);
console.log('NH16 pieces', pieces.length);
pieces.forEach(p => { finite(p.geo.pos, 'road'); inRange(p.geo.idx, p.geo.pos.length / 3, 'road'); });
{ const g = pieces[1].geo; const a = [0,1,2].map(k=>g.pos[3*g.idx[0]+k]), b=[0,1,2].map(k=>g.pos[3*g.idx[1]+k]), c=[0,1,2].map(k=>g.pos[3*g.idx[2]+k]);
  const u=b.map((v,i)=>v-a[i]), v=c.map((x,i)=>x-a[i]); const ny=u[2]*v[0]-u[0]*v[2]; assert(ny>0,'road faces up: '+ny); }

// city
t = performance.now(); const st = cityStreets(w, vz); const bl = cityBuildings(vz);
console.log('city streets verts', st.pos.length / 3, 'buildings', vz.buildings.length, 'building verts', bl.pos.length / 3, 'ms', Math.round(performance.now() - t));
finite(bl.pos, 'bld'); finite(bl.uv, 'bld uv'); inRange(bl.idx, bl.pos.length / 3, 'bld'); inRange(st.idx, st.pos.length / 3, 'streets');
// building side faces point outward
{ const b = vz.buildings[0]; const i0 = 0; const p = k => [bl.pos[3*k], bl.pos[3*k+1], bl.pos[3*k+2]];
  const a = p(bl.idx[0]), bb = p(bl.idx[1]), c = p(bl.idx[2]);
  const u = bb.map((v, i) => v - a[i]), v = c.map((x, i) => x - a[i]);
  const cr = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const nrm = [bl.nor[3*bl.idx[0]], bl.nor[3*bl.idx[0]+1], bl.nor[3*bl.idx[0]+2]];
  const dot = cr[0]*nrm[0]+cr[1]*nrm[1]+cr[2]*nrm[2]; assert(dot > 0, 'wall winding matches stated normal (outward): ' + dot); }

// trees
for (const g of [roundTreeGeometry(), palmGeometry()]) { finite(g.pos, 'tree'); inRange(g.idx, g.pos.length / 3, 'tree'); }
let total = 0; for (let i = 0; i < 20; i++) total += treesForChunk(w, 22 + i, 14).length; console.log('trees in 20 sample chunks', total);

// jobs
const offers = ['car', 'bus', 'lorry'].map(v => generateOffers(w, v, vz, 1));
offers.forEach(o => { assert(o.length > 0, 'offers exist'); });
console.log('lorry offers:', offers[2].map(o => `${o.title} -> ${o.stops.at(-1).city.name} ${o.km}km Rs${o.pay} limit ${o.limit}s`));
console.log('bus offer stops:', offers[1][0].stops.map(s => s.city.name).join(' > '));
const job = offers[0][0]; const run = new JobRunner(job);
const veh = { x: job.stops[0].x, z: job.stops[0].z, speed: 0 };
let ev = null; for (let i = 0; i < 200 && !ev; i++) ev = run.update(0.1, veh); console.log('pickup event', ev);
const veh2 = { x: job.stops.at(-1).x, z: job.stops.at(-1).z, speed: 1 }; ev = null; for (let i = 0; i < 200 && !ev; i++) ev = run.update(0.1, veh2); console.log('done event', ev);
assert(ev && ev.type === 'done' && ev.pay >= job.pay);
console.log('ranks', rankFor(0), rankFor(30000), rankFor(1e6));
console.log('MESH+JOBS TESTS PASSED');
