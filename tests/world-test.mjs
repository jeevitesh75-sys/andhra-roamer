import { createWorld, project, WORLD, SURF } from '../client/src/geo.js';
let t = performance.now();
const w = createWorld();
console.log('createWorld ms:', Math.round(performance.now() - t));
console.log('world size m:', Math.round(WORLD.w), 'x', Math.round(WORLD.h));
console.log('cities', w.cities.length, 'roads', w.roads.length, 'buildings', w.buildings.length);
let total = 0; for (const r of w.roads) { total += r.len; console.log(' ', r.ref.padEnd(14), r.kind.padEnd(5), 'len', Math.round(r.len), 'm', 'maxY', Math.max(...r.y).toFixed(1)); }
console.log('total road km (game):', (total / 1000).toFixed(1));
// every city should sit on land, not in sea
const bad = w.cities.filter(c => w.coastDx(c.x, c.z) < 100);
console.log('cities near/in sea (dx<100):', bad.map(c => c.name + ':' + Math.round(w.coastDx(c.x, c.z))));
// city overlaps
let overlaps = [];
for (let i = 0; i < w.cities.length; i++) for (let j = i + 1; j < w.cities.length; j++) {
  const a = w.cities[i], b = w.cities[j], d = Math.hypot(a.x - b.x, a.z - b.z);
  if (d < a.R + b.R) overlaps.push(`${a.name}/${b.name} d=${Math.round(d)} < ${a.R + b.R}`);
}
console.log('overlapping cities:', overlaps);
// roads must reach city centres and heights stay sane
let steepest = 0;
for (const r of w.roads) for (let i = 1; i < r.n; i++) steepest = Math.max(steepest, Math.abs(r.y[i] - r.y[i - 1]) / 8);
console.log('steepest road grade:', steepest.toFixed(3), '(limit incl. anchor blend ~0.16)');
// terrain sampling speed
t = performance.now(); let s = 0; for (let i = 0; i < 20000; i++) s += w.heightAt(5000 + i * 0.7, 9000 + (i % 977));
console.log('heightAt x20000 ms:', Math.round(performance.now() - t));
// terrain chunk worth of colours
const out = [0, 0, 0]; t = performance.now(); for (let i = 0; i < 1849; i++) w.groundColor(9000 + i, 9000, 3, 0.1, out);
console.log('groundColor x1849 ms:', Math.round(performance.now() - t));
// surface checks
const viz = w.cityByName.get('Vijayawada');
console.log('Vijayawada y', viz.y.toFixed(1), 'buildings', viz.buildings.length, 'dropPoints', viz.dropPoints.length);
const nel = w.cityByName.get('Nellore'); console.log('Nellore buildings', nel.buildings.length);
console.log('surface at Vijayawada centre:', w.surfaceAt(viz.x, viz.z), '(0 road,1 street)');
console.log('sea check Bay of Bengal east of Kakinada:', w.surfaceAt(...project(16.9, 83.5)), '(5 water)');
console.log('height in sea:', w.heightAt(...project(16.9, 83.5)).toFixed(1));
// Tirumala vs Tirupati heights
const tm = w.cityByName.get('Tirumala'), tp = w.cityByName.get('Tirupati');
console.log('Tirumala y', tm.y.toFixed(1), 'Tirupati y', tp.y.toFixed(1));
for (const c of w.cities) process.stdout.write(c.name + ':' + c.y.toFixed(0) + ' ');console.log();
const ghat = w.roads.find(r => r.ref === 'Tirumala Ghat'); console.log('Tirumala ghat len', Math.round(ghat.len), 'y start/end', ghat.y[0].toFixed(1), ghat.y[ghat.n - 1].toFixed(1));
// determinism: two worlds identical
const w2 = createWorld(); let same = true; for (let i = 0; i < 200; i++) { const x = 3000 + i * 111, z = 4000 + i * 97; if (w.heightAt(x, z) !== w2.heightAt(x, z)) same = false; }
console.log('deterministic:', same);
// every road node must meet its city's flat ground height
let mism = [];
for (const r of w.roads) for (const nd of r.nodes) {
  let k = 0; while (k < r.n - 1 && r.cum[k] < nd.s) k++;
  const d = Math.abs(r.y[k] - nd.city.y); if (d > 3) mism.push(`${r.ref}@${nd.city.name}: road ${r.y[k].toFixed(0)} vs city ${nd.city.y.toFixed(0)}`);
}
console.log('road/city height mismatches (>3m):', mism.length ? mism : 'none');
