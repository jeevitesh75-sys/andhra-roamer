// Checks the shipped GLB files against the vehicle configuration (no three.js needed): files parse, wheel meshes are found by name,
// and for the models whose wheels are fused into the body the wheel cylinders really contain triangles.
import assert from 'node:assert';
import fs from 'node:fs';
import { FILES, VEHICLES } from '../client/src/glbassets.js';
const dir = new URL('../client/assets/models/', import.meta.url);
const read = f => { const d = fs.readFileSync(new URL(f, dir)); assert.equal(d.toString('latin1', 0, 4), 'glTF', f + ' is a GLB'); const l = d.readUInt32LE(12); return { j: JSON.parse(d.toString('utf8', 20, 20 + l)), d, off: 20 + l }; };
const CT = { 5126: [Float32Array, 4], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4] }, NC = { SCALAR: 1, VEC3: 3 };
function acc(g, i) { const a = g.j.accessors[i], bv = g.j.bufferViews[a.bufferView], [C, sz] = CT[a.componentType], n = NC[a.type], start = g.off + 8 + (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * sz;
  const out = new (C)(a.count * n), dv = new DataView(g.d.buffer, g.d.byteOffset); for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = a.componentType === 5126 ? dv.getFloat32(start + k * stride + c * 4, true) : a.componentType === 5123 ? dv.getUint16(start + k * stride + c * 2, true) : dv.getUint32(start + k * stride + c * 4, true); return out; }
for (const [k, f] of Object.entries(FILES)) { const g = read(f); console.log('ok   file', f, 'nodes', g.j.nodes.length); }
for (const [type, list] of Object.entries(VEHICLES)) for (const cfg of list) {
  const g = read(FILES[cfg.file]);
  if (cfg.wheelRe) { const n = g.j.nodes.filter(x => cfg.wheelRe.test((x.name || '').replace(/\./g, ''))).length; assert(n >= 3, `${type}/${cfg.file}: wheel meshes found by name (${n})`); console.log('ok  ', type, cfg.file, 'named wheel meshes:', n); }
  if (cfg.cyl) {
    const pm = g.j.meshes[0], counts = cfg.cyl.map(() => 0);
    for (const m of g.j.meshes) for (const p of m.primitives) {
      const pos = acc(g, p.attributes.POSITION), idx = acc(g, p.indices);
      for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < cfg.cyl.length; k++) { const w = cfg.cyl[k], pl = [0, 1, 2].filter(i => i !== w.axis); let ok = true;
        for (let v = 0; v < 3 && ok; v++) { const i = idx[t + v], a = pos[i * 3 + w.axis]; if (a < w.a[0] || a > w.a[1] || Math.hypot(pos[i * 3 + pl[0]] - w.c[0], pos[i * 3 + pl[1]] - w.c[1]) > w.R) ok = false; }
        if (ok) { counts[k]++; break; } }
    }
    counts.forEach(c => assert(c > 150, `${cfg.file}: wheel cylinder holds triangles (${c})`)); console.log('ok  ', type, cfg.file, 'cut-out wheel triangles:', counts.join(','));
  }
}
console.log('GLB ASSET TESTS PASSED');
