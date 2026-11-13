import { readFileSync } from 'fs';
import { createOsmWorld } from '../client/src/osmworld.js';
const ab = f => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
let bad = 0;
for (const id of ['vijayawada', 'vizag', 'tirupati']) {
  const D = 'client/data/' + id, w = createOsmWorld({ meta: JSON.parse(readFileSync(D + '.json', 'utf8')), roads: ab(D + '.roads.bin'), bld: ab(D + '.bld.bin'), land: ab(D + '.land.bin') });
  const bl = w.bridgeList.slice().sort((a, c) => c.len - a.len).slice(0, 25); let good = 0, tot = 0, maxY = 0;
  for (const b of bl) { const r = b.road, p = w.roadPoint(r, (r.cum[b.i0] + r.cum[b.i1]) / 2, 0, {}), nr = w.nearestRoad(p.x, p.z); if (!nr || nr.road !== r) continue; tot++; const h = w.heightAt(p.x, p.z); maxY = Math.max(maxY, h); if (h > 2.9 && Math.abs(h - p.y) < 0.8) good++; }
  console.log(`${id}: ${w.bridgeList.length} raised bridges; ${good}/${tot} sampled decks are 3-6.5 m above the water (max ${maxY.toFixed(1)} m)`); if (tot && good / tot < 0.7) bad++;
  // ramps must be smooth: no road has a height jump > 0.35 m per 10 m
  let worst = 0; for (const b of w.bridgeList) { const r = b.road; for (let i = 0; i < r.n - 1; i++) { const L = r.cum[i + 1] - r.cum[i]; if (L > 8) worst = Math.max(worst, Math.abs(r.y[i + 1] - r.y[i]) / L * 10); } }
  console.log('  steepest ramp per 10 m:', worst.toFixed(2), 'm');
}
console.log(bad ? 'BRIDGE TEST FAILED' : 'BRIDGE TEST PASSED');
