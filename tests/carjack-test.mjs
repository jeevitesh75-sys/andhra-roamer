import { readFileSync } from 'fs';
import { createOsmWorld } from '../client/src/osmworld.js';
import { ParkedLot } from '../client/src/parked.js';
const ab = f => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const D = 'client/data/vijayawada', w = createOsmWorld({ meta: JSON.parse(readFileSync(D + '.json', 'utf8')), roads: ab(D + '.roads.bin'), bld: ab(D + '.bld.bin'), land: ab(D + '.land.bin') });
const lot = new ParkedLot(w);
for (const c of [w.cities[0], w.cities[3]]) { const n0 = [...lot.all()].length; lot.seed(c.x + 900, c.z + 700, 10); console.log('  ids', [...lot.all()].slice(-3).map(e=>e.id)); const list = [...lot.all()].filter(e => Number(e.id.slice(1)) >= 100000), near = lot.nearest(0, 0);
  const types = new Set(list.filter(e => Math.hypot(e.x - (c.x + 900), e.z - (c.z + 700)) < 100).map(e => e.type)); console.log('  seeded', list.length, 'types', [...types].join(','));
  ok(list.length >= 4, 'seed puts several vehicles around the spot (' + list.length + ')'); ok(types.has('car') && types.has('bike'), 'cars and bikes are among them'); }
const before = [...lot.all()].length; lot.seed(w.cities[0].x + 905, w.cities[0].z + 705, 10); ok([...lot.all()].length === before, 'seeding the same spot twice does not duplicate');
console.log(bad ? 'CARJACK TEST FAILED' : 'CARJACK/SEED TEST PASSED');
