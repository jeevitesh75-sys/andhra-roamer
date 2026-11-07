import { readFileSync } from 'fs';
import { createOsmWorld } from '../client/src/osmworld.js';
import { osmBuildings, osmRoads, terrainChunk } from '../client/src/meshbuild.js';
const ab = f => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
for (const id of ['vijayawada', 'vizag', 'tirupati']) {
  const D = 'client/data/' + id, t0 = performance.now();
  const w = createOsmWorld({ meta: JSON.parse(readFileSync(D + '.json', 'utf8')), roads: ab(D + '.roads.bin'), bld: ab(D + '.bld.bin'), land: ab(D + '.land.bin') });
  console.log(id, 'built in', Math.round(performance.now() - t0), 'ms; roads', w.roads.length, 'hubs', w.cities.length, 'traffic', w.trafficRoads.length);
  const c = w.cities[0], d = c.dropPoints[0];
  const nr = w.nearestRoad(d.x, d.z); ok(nr && nr.d < 1, `${id}: hub ${c.name} drop point is on a road (d=${nr && nr.d.toFixed(2)})`);
  ok(w.surfaceAt(d.x, d.z) <= 1, id + ': surface at drop is road/street');
  let nb = 0; for (let x = d.x - 300; x < d.x + 300; x += 64) for (let z = d.z - 300; z < d.z + 300; z += 64) nb += w.buildingsNear(x, z).length;
  console.log('  buildings near hub (cells):', nb, ' in 480m rect:', w.buildingsInRect(d.x - 240, d.z - 240, d.x + 240, d.z + 240).length, ' road runs:', w.roadsInRect(d.x - 240, d.z - 240, d.x + 240, d.z + 240).length);
  { const x0 = Math.floor(d.x / 480) * 480, z0 = Math.floor(d.z / 480) * 480, bg = osmBuildings(w.buildingsInRect(x0, z0, x0 + 480, z0 + 480), x0, z0), rg = osmRoads(w.roadsInRect(x0, z0, x0 + 480, z0 + 480), x0, z0), tc = terrainChunk(w, Math.floor(d.x / 480), Math.floor(d.z / 480));
    const okGeo = g => !g || (Array.from(g.pos).every(Number.isFinite) && Math.max(...g.idx) < g.pos.length / 3 && g.idx.length % 3 === 0);
    ok(okGeo(bg) && okGeo(rg.hi) && okGeo(rg.lo) && okGeo(tc), id + ': tile meshes finite & indexed (bld verts ' + (bg ? bg.pos.length / 3 : 0) + ', road verts ' + ((rg.hi ? rg.hi.pos.length : 0) + (rg.lo ? rg.lo.pos.length : 0)) / 3 + ')');
    if (rg.lo) { const g = rg.lo; let up = 0, dn = 0; for (let i = 0; i < g.idx.length; i += 3) { const a = g.idx[i] * 3, b = g.idx[i + 1] * 3, c = g.idx[i + 2] * 3; const ux = g.pos[b] - g.pos[a], uz = g.pos[b + 2] - g.pos[a + 2], vx = g.pos[c] - g.pos[a], vz = g.pos[c + 2] - g.pos[a + 2]; const ny = uz * vx - ux * vz; if (ny > 0) up++; else if (ny < 0) dn++; } ok(up > dn * 20, id + ': road triangles face up (' + up + ' up / ' + dn + ' down)'); } }
  const tr = w.trafficRoads[0], p = w.roadPoint(tr, tr.len / 2, 2.6, {}); ok(isFinite(p.x) && isFinite(p.h), id + ': roadPoint finite');
  let water = 0, n = 0; for (let x = 0; x < w.WORLD.w; x += 400) for (let z = 0; z < w.WORLD.h; z += 400) { n++; if (w.heightAt(x, z) < -0.4) water++; }
  console.log('  water share', (100 * water / n).toFixed(1) + '%');
  const col = [0, 0, 0]; w.groundColor(d.x, d.z, 0, 0, col); ok(col.every(v => v >= 0 && v <= 1), id + ': ground colour valid');
  // building inside test: pick a building, its centre must be 'inside' physically
  const b = w.buildingsInRect(d.x - 240, d.z - 240, d.x + 240, d.z + 240)[0]; if (b) ok(w.buildingsNear(b.x, b.z).some(q => q.i === b.i), id + ': building indexed in its own cell');
  let blocked = 0, tot = 0; for (const r of w.trafficRoads.slice(0, 40)) for (let s = 0; s < r.len; s += 30) { const q = w.roadPoint(r, s, 0, {}); tot++; for (const bb of w.buildingsNear(q.x, q.z)) { const dx = q.x - bb.x, dz = q.z - bb.z, lx = dx * bb.c + dz * bb.s, lz = -dx * bb.s + dz * bb.c; if (Math.abs(lx) < bb.hw && Math.abs(lz) < bb.hd) { blocked++; break; } } }
  console.log('  main-road samples inside a building footprint:', blocked, '/', tot);
}
console.log(fails ? 'OSM TESTS FAILED' : 'OSM WORLD TESTS PASSED'); process.exit(fails ? 1 : 0);
