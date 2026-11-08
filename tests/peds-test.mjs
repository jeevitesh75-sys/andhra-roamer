import { readFileSync } from 'fs';
import { createOsmWorld } from '../client/src/osmworld.js';
import { Vehicle } from '../client/src/physics.js';
import { Crowd, Police } from '../client/src/peds.js';
const ab = f => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const D = 'client/data/vijayawada';
const w = createOsmWorld({ meta: JSON.parse(readFileSync(D + '.json', 'utf8')), roads: ab(D + '.roads.bin'), bld: ab(D + '.bld.bin'), land: ab(D + '.land.bin'), rail: ab(D + '.rail.bin') });
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
ok(w.rails.length > 100 && w.railStations.length >= 20, `rails ${w.rails.length} ways, stations ${w.railStations.length}`);
ok(w.railStations.filter(s => s.rail && s.rail.d < 200).length >= 15, 'most stations have a track within 200 m');
const sp = w.cities[0].spawn, v = new Vehicle('car', w); v.reset(sp.x, sp.z, sp.h);
const crowd = new Crowd(w, 3); const kinds = {}; let hits = [];
for (let i = 0; i < 60 * 20; i++) { v.step(1 / 60, { throttle: 0, steer: 0, brake: 1, handbrake: false }); hits.push(...crowd.update(1 / 60, v)); }
for (const e of crowd.list) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
console.log('after 20 s standing still:', crowd.list.length, JSON.stringify(kinds));
ok(crowd.list.length >= 10, 'crowd spawned near the player');
ok(crowd.list.every(e => Number.isFinite(e.x) && Number.isFinite(e.z)), 'all positions finite');
// force a collision: put a human right in front of a moving car
v.reset(sp.x, sp.z, sp.h); v.u = 14; v.speed = 14; v.vx = Math.sin(v.h) * 14; v.vz = Math.cos(v.h) * 14;
crowd.list.push({ kind: 'human', x: v.x + Math.sin(v.h) * 2, z: v.z + Math.cos(v.h) * 2, h: 0, road: crowd.list[0].road, s: 0, off: 0, dir: 1, state: 'walk', t: 0, phase: 0, lift: 0, lie: 0, vy: 0, hx: 0, hz: 0, sc: 1, idle: 99, speed: 1, c1: '#fff', c2: '#000' });
const ev = crowd.update(1 / 60, v); ok(ev.some(e => e.type === 'hit' && e.kind === 'human'), 'fast car hits a pedestrian -> hit event');
const hit = crowd.list.find(e => e.state === 'hit'); for (let i = 0; i < 90; i++) crowd.update(1 / 60, v);
ok(hit && hit.lie > 0.9 && hit.lift === 0, 'victim ends up lying on the ground');
// police chase
const pol = new Police(w); ok(pol.start(v), 'police spawned on a road'); const c0 = Math.hypot(pol.car.x - v.x, pol.car.z - v.z);
v.reset(sp.x, sp.z, sp.h); let res = null, minD = 1e9;
for (let i = 0; i < 60 * 70 && !res; i++) { v.step(1 / 60, { throttle: 0, steer: 0, brake: 1, handbrake: false }); res = pol.update(1 / 60, { x: v.x, z: v.z, speed: 0 }); minD = Math.min(minD, Math.hypot(pol.car.x - v.x, pol.car.z - v.z)); }
console.log('police start distance', c0.toFixed(0), 'closest', minD.toFixed(0), 'result', res);
ok(res === 'caught' || minD < c0 * 0.5, 'police close in on a stationary player (result ' + res + ')');
console.log(fails ? 'PEDS TESTS FAILED' : 'PEDS TESTS PASSED'); process.exit(fails ? 1 : 0);
