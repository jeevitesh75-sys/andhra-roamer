// Checks the shipped GLB files against the vehicle configuration (no three.js needed): files parse, wheel meshes are found by name,
// and for the models whose wheels are fused into the body the wheel cylinders really contain triangles.
import assert from 'node:assert';
import fs from 'node:fs';
import { FILES, VEHICLES, SITES } from '../client/src/glbassets.js';
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
// new story-site models: every SITES entry points at a shipped file with meshes
for (const c of SITES) { assert(FILES[c.file], 'site file key ' + c.key); const g = read(FILES[c.file]); assert(g.j.meshes && g.j.meshes.length, c.key + ' has meshes'); console.log('ok   site', c.key, '->', FILES[c.file]); }
// SWAT rig has the clips the character code needs, and the rifle is a plain mesh
{ const g = read(FILES.swat), names = (g.j.animations || []).map(a => a.name.split('|').pop()); for (const n of ['Idle', 'Walk', 'Run', 'Death', 'Idle_Gun_Pointing']) assert(names.includes(n), 'swat clip ' + n);
  const bones = g.j.nodes.map(n => n.name); assert(bones.includes('LowerArm.R'), 'swat LowerArm.R bone'); console.log('ok   swat rig, clips:', names.length); }
{ const g = read(FILES.man), n = g.j.nodes.map(x => x.name); for (const b of ['mixamorig:Head', 'mixamorig:HeadTop_End', 'mixamorig:RightHand', 'mixamorig:Hips']) assert(n.includes(b), 'man bone ' + b); assert(g.j.skins.length === 1 && g.j.animations.length === 1, 'man skin + walk clip'); console.log('ok   man rig (Mixamo)'); }
for (const f of ['hatCowboy', 'hatTop']) assert(read(FILES[f]).j.meshes.length > 0, f);
assert(read(FILES.rifle).j.meshes.length > 0); console.log('ok   rifle');
console.log('GLB ASSET TESTS PASSED');
