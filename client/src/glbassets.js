// Loads the real 3D models (glTF/GLB) and turns them into game-ready templates:
//  - vehicles: oriented (+z forward, +y up), scaled, grounded; wheels split out into pivot groups so they really spin / steer
//  - character: Quaternius rigged + animated person (Idle / Walk / Run / Death ...)
//  - pistol (held in the hand), tree (instanced geometry for the forest)
// Everything is optional: if three's GLTFLoader or a file is missing the game keeps using the built-in box models.
// Vehicle units: 1 = 1 metre. Local frame: +z forward, +y up, +x left (same as models.js).

import { PF_VEHICLES, PF_SITES, PF_HUMANS, PF_KIDS, PF_ANIMALS } from './pfpack.js';
const U = rel => new URL('../assets/models/' + rel, import.meta.url).href;

export const FILES = {
  lambo: 'lamborghini.glb', police: 'police_car.glb', truck: 'truck.glb', bus: 'school_bus.glb',
  bikeA: 'bike_cruiser.glb', bikeB: 'bike_sport.glb', char: 'character.glb', pistol: 'pistol.glb', tree: 'tree.glb',
  swat: 'swat.glb', rifle: 'rifle.glb', club: 'club.glb', garage: 'garage.glb', tavern: 'tavern.glb', gas: 'gas_station.glb',
  bridgeA: 'bridge_a.glb', bridgeB: 'bridge_b.glb', phone: 'phone.glb',
  man: 'man.glb', womanA: 'woman_a.glb', womanB: 'woman_b.glb', casual: 'casual.glb', man2: 'man2.glb', hatCowboy: 'hat_cowboy.glb', hatTop: 'hat_top.glb',
};

/** static story-site models. size = target length (m) of the chosen dimension (dim 'xz' = longest ground side, 'all' = longest side overall).
 *  anchor = story anchor (storydata ANCHORS) it stands at; side = metres to the side of the road point; vis = show within this many metres. */
export const SITES = [
  { key: 'club', file: 'club', size: 34, dim: 'xz', anchor: 'club', side: 26, vis: 600 },
  { key: 'garage', file: 'garage', size: 20, dim: 'xz', anchor: 'garage', side: 18, vis: 500 },
  { key: 'tavern', file: 'tavern', size: 9, dim: 'xz', anchor: 'tea', side: 9, vis: 400 },
  { key: 'gas', file: 'gas', size: 24, dim: 'xz', anchor: 'highway', side: 20, vis: 600 },
  { key: 'bridgeB', file: 'bridgeB', size: 30, dim: 'xz', anchor: 'checkpoint', side: 0, vis: 500, road: true, solid: false },
  { key: 'phone', file: 'phone', size: 1.7, dim: 'all', anchor: 'yardTerm', side: 2.5, vis: 300 },
];

/** how to turn each raw model into a game vehicle.
 *  rotX/rotY: put the model upright facing +z.  len: target length (m).  sx: extra width factor.
 *  wheelRe: names of ready-made wheel meshes.  cyl: wheels that are fused into the body mesh and must be cut out
 *  (axis = axle axis index 0/1/2, c = wheel centre in the two other raw coords, R = radius, a = axle range, front = steers).
 *  paintRe/tint: which material takes the player's colour (tint 1 = full colour, lower = mixed with the texture).
 *  headMat/tailMat: materials that glow as head/brake lights.  head/tail: where to put glow pads (probe x, probe heights). */
export const VEHICLES = {
  car: [{ file: 'lambo', rotY: 0, len: 4.4, wheelRe: /wheel/i, paintRe: /Body/i, tint: 1, head: { x: 0.62, y: [0.3, 0.38, 0.46, 0.54] }, tail: { x: 0.64, y: [0.5, 0.6, 0.7, 0.8] } }],
  police: [{ file: 'police', rotY: 0, len: 4.3, wheelRe: /wheel/i, headMat: /^(Headlights|WhiteLights)$/, tailMat: /^TailLights$/ }],
  lorry: [{ file: 'truck', rotY: 0, len: 6.6, sx: 0.78, wheelRe: /wheel/i, headMat: /^Headlights$/, tailMat: /^BrakeLight$/ }],
  bus: [{ file: 'bus', rotX: -Math.PI / 2, len: 9.2, sx: 0.6, paintRe: /^color_16757560$/, tint: 1, tailMat: /^color_14093196$/, head: { x: 0.85, y: [0.55, 0.7, 0.85, 1.0] },
    cyl: [
      { axis: 0, c: [-38.5, 10], R: 10.3, a: [-27.4, -20.1], front: true }, { axis: 0, c: [-38.5, 10], R: 10.3, a: [23.6, 30.9], front: true },
      { axis: 0, c: [29.5, 10], R: 10.3, a: [-27.4, -20.1] }, { axis: 0, c: [29.5, 10], R: 10.3, a: [23.6, 30.9] }] }],
  bike: [
    { file: 'bikeA', rotY: -Math.PI / 2, len: 2.1, head: { x: 0, y: [0.8, 0.9, 1.0] }, tail: { x: 0, y: [0.6, 0.7, 0.8] },
      cyl: [{ axis: 2, c: [-4.77, 2.045], R: 2.28, a: [-0.55, 0.5] }, { axis: 2, c: [5.0, 2.045], R: 2.28, a: [-0.55, 0.5], front: true }] },
    { file: 'bikeB', rotY: Math.PI, len: 2.1, head: { x: 0, y: [0.75, 0.85, 0.95] }, tail: { x: 0, y: [0.7, 0.8, 0.9] },
      cyl: [{ axis: 0, c: [18.25, -46.43], R: 18.6, a: [-5.1, 5.1], front: true }, { axis: 0, c: [18.25, 44.27], R: 18.6, a: [-5.1, 5.1] }] },
  ],
};

export const CHAR_HEIGHT = 1.78;

/** Cut triangles that lie fully inside a wheel cylinder out of their mesh, as new meshes named 'wheel_split_*'. Geometry attributes are shared. */
function splitWheels(T, root, cyl) {
  const meshes = []; root.traverse(o => { if (o.isMesh && o.geometry && o.geometry.index) meshes.push(o); });
  for (const mesh of meshes) {
    const g = mesh.geometry, pos = g.attributes.position, idx = g.index.array, keep = [], per = cyl.map(() => []);
    const get = (i, c) => (c === 0 ? pos.getX(i) : c === 1 ? pos.getY(i) : pos.getZ(i));
    const pl = cyl.map(w => [0, 1, 2].filter(i => i !== w.axis));
    for (let t = 0; t < idx.length; t += 3) {
      let hit = -1;
      for (let k = 0; k < cyl.length && hit < 0; k++) {
        const w = cyl[k]; let ok = true;
        for (let v = 0; v < 3 && ok; v++) {
          const i = idx[t + v], a = get(i, w.axis);
          if (a < w.a[0] || a > w.a[1] || Math.hypot(get(i, pl[k][0]) - w.c[0], get(i, pl[k][1]) - w.c[1]) > w.R) ok = false;
        }
        if (ok) hit = k;
      }
      if (hit >= 0) per[hit].push(idx[t], idx[t + 1], idx[t + 2]); else keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (per.every(p => !p.length)) continue;
    const share = (ind) => { const ng = new T.BufferGeometry(); for (const n of Object.keys(g.attributes)) ng.setAttribute(n, g.attributes[n]); ng.setIndex(new T.BufferAttribute(Uint32Array.from(ind), 1)); return ng; };
    mesh.geometry = share(keep);
    per.forEach((ind, k) => {
      if (!ind.length) return;
      const ng = share(ind); const mn = new T.Vector3(1e9, 1e9, 1e9), mx = new T.Vector3(-1e9, -1e9, -1e9);
      for (const i of ind) for (let c = 0; c < 3; c++) { const v = get(i, c); if (v < mn.getComponent(c)) mn.setComponent(c, v); if (v > mx.getComponent(c)) mx.setComponent(c, v); }
      ng.boundingBox = new T.Box3(mn, mx); ng.boundingSphere = new T.Sphere(); ng.boundingBox.getBoundingSphere(ng.boundingSphere);
      const wm = new T.Mesh(ng, mesh.material); wm.name = 'wheel_split_' + (cyl[k].front ? 'front' : 'rear') + '_' + k; wm.position.copy(mesh.position); wm.quaternion.copy(mesh.quaternion); wm.scale.copy(mesh.scale);
      mesh.parent.add(wm);
    });
  }
}

function buildVehicleTemplate(T, gltf, cfg) {
  const root = gltf.scene;
  if (cfg.cyl) splitWheels(T, root, cfg.cyl);
  let autoRot = 0; if (cfg.auto) { root.updateMatrixWorld(true); const b0 = new T.Box3().setFromObject(root).getSize(new T.Vector3()); if (b0.x > b0.z * 1.15) autoRot = Math.PI / 2; }   // length axis -> +z (front assumed at +z / glTF default)
  const holder = new T.Group(); holder.add(root); holder.rotation.set(cfg.rotX || 0, (cfg.rotY || 0) + autoRot, 0); holder.updateMatrixWorld(true);
  const raw = new T.Box3().setFromObject(holder), size = raw.getSize(new T.Vector3()), s = cfg.len / size.z;
  holder.scale.set(s * (cfg.sx || 1), s, s); holder.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(holder), ctr = box.getCenter(new T.Vector3());
  holder.position.set(-ctr.x, -box.min.y, -ctr.z);
  const tpl = new T.Group(); tpl.add(holder); tpl.updateMatrixWorld(true);
  // wheels -> pivot/spin groups at the wheel centre
  const found = [];
  tpl.traverse(o => { if (o.name && /wheel/i.test(o.name) && !(o.parent && o.parent !== tpl && /wheel/i.test(o.parent.name))) found.push(o); });
  const wheels = found.filter(o => cfg.wheelRe ? cfg.wheelRe.test(o.name) : /^wheel_split_/.test(o.name));
  for (const o of wheels) {
    const wb = new T.Box3().setFromObject(o), c = wb.getCenter(new T.Vector3()), sz = wb.getSize(new T.Vector3());
    const front = /front|_F[LR]?$|_F[LR]_|Front/.test(o.name) || /Wheel_F[LR]/i.test(o.name);
    const pivot = new T.Group(), spin = new T.Group(); pivot.name = 'wpivot'; spin.name = 'wspin'; pivot.position.copy(c); pivot.add(spin); tpl.add(pivot); pivot.updateMatrixWorld(true);
    spin.attach(o); pivot.userData = { r: Math.max(sz.y, sz.z) / 2, front };
  }
  tpl.updateMatrixWorld(true);
  // glow pads (probed onto the real surface with rays so they sit on the bodywork)
  const spots = [], ray = new T.Raycaster(), final = new T.Box3().setFromObject(tpl), L = final.max.z - final.min.z;
  const probe = (kind, spec, dirZ) => {
    if (!spec) return; const xs = spec.x ? [-spec.x, spec.x] : [0];
    for (const x of xs) {
      let best = null;
      for (const y of spec.y) {
        ray.set(new T.Vector3(x, y, -dirZ * (L + 1)), new T.Vector3(0, 0, dirZ)); const h = ray.intersectObject(tpl, true)[0]; if (!h) continue;
        if (!best || (dirZ > 0 ? h.point.z < best.z : h.point.z > best.z)) best = { x, y, z: h.point.z };
      }
      if (best) spots.push({ kind, x: best.x, y: best.y, z: best.z - dirZ * 0.012, w: kind === 'head' ? 0.3 : 0.24, h: kind === 'head' ? 0.1 : 0.075 });
    }
  };
  probe('head', cfg.head, -1); probe('tail', cfg.tail, 1); // head: ray from the front (+z) travelling -z; tail from the rear
  tpl.userData = { len: cfg.len, halfLen: L / 2, top: final.max.y, cfg: null, spots };
  return tpl;
}

/** merge the tree's meshes into one vertex-coloured geometry (so the forest can stay instanced with one material) */
function buildTreeGeometry(T, gltf, height = 5.6) {
  const parts = []; gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if (o.isMesh) parts.push(o); });
  if (!parts.length) return null;
  const box = new T.Box3().setFromObject(gltf.scene), sc = height / (box.max.y - box.min.y), cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  let nv = 0, ni = 0; for (const m of parts) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), I = new Uint32Array(ni), v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
  let vo = 0, io = 0;
  for (const m of parts) {
    const g = m.geometry, pa = g.attributes.position, na = g.attributes.normal, col = m.material && m.material.color ? m.material.color : new T.Color(0.4, 0.4, 0.4);
    nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); P.set([(v.x - cx) * sc, (v.y - box.min.y) * sc, (v.z - cz) * sc], (vo + i) * 3);
      if (na) { n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.set([n.x, n.y, n.z], (vo + i) * 3); } else N.set([0, 1, 0], (vo + i) * 3);
      C.set([col.r, col.g, col.b], (vo + i) * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) I[io++] = g.index.array[i] + vo; else for (let i = 0; i < pa.count; i++) I[io++] = vo + i;
    vo += pa.count;
  }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(P, 3)); out.setAttribute('normal', new T.BufferAttribute(N, 3)); out.setAttribute('color', new T.BufferAttribute(C, 3));
  out.setIndex(new T.BufferAttribute(I, 1)); out.computeBoundingSphere(); return out;
}

/** pistol: origin at the grip, barrel pointing +z, about 0.26 m long */
/** assault rifle: raw muzzle points -z, so turn it round (+z forward like the pistol); pivot near the pistol grip, ~0.95 m long */
function buildRifle(T, gltf) {
  const inner = gltf.scene; inner.position.set(0, 0.5, -0.5);
  const w = new T.Group(); w.add(inner); w.rotation.y = Math.PI; w.scale.setScalar(0.95 / 4.63);
  const out = new T.Group(); out.add(w); out.traverse(o => { if (o.isMesh) o.castShadow = true; }); return out;
}
/** static building/prop: size by bounding box (works whatever the file's own units are), centred on x/z, standing on y=0 */
function buildSite(T, gltf, cfg) {
  const sc = gltf.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc), sz = b.getSize(new T.Vector3());
  const len = cfg.dim === 'all' ? Math.max(sz.x, sz.y, sz.z) : Math.max(sz.x, sz.z); if (!(len > 0)) throw new Error('empty model');
  const k = cfg.size / len, c = b.getCenter(new T.Vector3()), inner = new T.Group(), out = new T.Group();
  inner.add(sc); inner.position.set(-c.x * k, -b.min.y * k, -c.z * k); inner.scale.setScalar(k);
  // the position above is in parent units, scale applies to children only, so keep the offset unscaled
  out.add(inner); out.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
  out.userData.size = { x: sz.x * k, y: sz.y * k, z: sz.z * k }; return out;
}

/** hat normalised to width 1 (longest ground side), centred, brim-base at y=0 - the rig scales it to the head */
function buildHat(T, gltf) {
  const sc = gltf.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc), sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()), w = Math.max(sz.x, sz.z); if (!(w > 0)) throw new Error('empty hat');
  const k = 1 / w, inner = new T.Group(), out = new T.Group(); inner.add(sc); inner.scale.setScalar(k); inner.position.set(-c.x * k, -b.min.y * k, -c.z * k); out.add(inner);
  out.traverse(o => { if (o.isMesh) o.castShadow = true; }); out.userData.h = sz.y * k; return out;
}
/** find a node by name whatever way three sanitised it (it strips . : [ ] / from glTF node names) */
export function findNode(root, ...names) { for (const n of names) { const o = root.getObjectByName(n) || root.getObjectByName(n.replace(/[.:\[\]/]/g, '')); if (o) return o; } return null; }

function buildPistol(T, gltf) {
  const inner = gltf.scene; inner.position.set(0, 1.1, -1.4);
  const w = new T.Group(); w.add(inner); w.rotation.y = Math.PI; w.scale.setScalar(0.26 / 4.1);
  const out = new T.Group(); out.add(w); out.traverse(o => { if (o.isMesh) o.castShadow = true; }); return out;
}

export async function loadAssets(T, onProgress = () => {}) {
  const A = { ok: false, veh: {}, notes: [] };
  let GLTFLoader, SkeletonUtils;
  try {
    ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
    SkeletonUtils = await import('three/addons/utils/SkeletonUtils.js');
  } catch (e) { console.warn('GLTFLoader unavailable - using built-in vehicle/character models', e); A.notes.push('no GLTFLoader'); return A; }
  const loader = new GLTFLoader(), gl = {}; let done = 0; const names = Object.keys(FILES);
  await Promise.all(names.map(k => new Promise(res => loader.load(U(FILES[k]), g => { gl[k] = g; onProgress(++done / names.length); res(); }, undefined, e => { console.warn('model failed:', FILES[k], e); A.notes.push('failed ' + k); onProgress(++done / names.length); res(); }))));
  A.SkeletonUtils = SkeletonUtils;
  for (const [type, cfgs] of Object.entries(VEHICLES)) {
    const list = [];
    for (const cfg of cfgs) { const g = gl[cfg.file]; if (!g) continue; try { const tpl = buildVehicleTemplate(T, g, cfg); tpl.userData.cfg = null; list.push({ tpl, cfg }); } catch (e) { console.warn('vehicle template failed', type, cfg.file, e); } }
    if (list.length) A.veh[type] = list;
  }
  if (gl.char) {
    try {
      const sc = gl.char.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc); const h = b.max.y - b.min.y;
      A.char = { scene: sc, anims: gl.char.animations, scale: CHAR_HEIGHT / h, footY: -b.min.y * CHAR_HEIGHT / h };
    } catch (e) { console.warn('character setup failed', e); }
  }
  if (gl.pistol) { try { A.pistol = buildPistol(T, gl.pistol); } catch (e) { console.warn('pistol setup failed', e); } }
  if (gl.tree) { try { A.treeGeo = buildTreeGeometry(T, gl.tree); } catch (e) { console.warn('tree setup failed', e); } }
  if (gl.swat) {
    try { const sc = gl.swat.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc), h = b.max.y - b.min.y; A.swat = { scene: sc, anims: gl.swat.animations, scale: CHAR_HEIGHT * 1.04 / h, footY: -b.min.y * CHAR_HEIGHT * 1.04 / h }; }
    catch (e) { console.warn('swat setup failed', e); }
  }
  if (gl.rifle) { try { A.rifle = buildRifle(T, gl.rifle); } catch (e) { console.warn('rifle setup failed', e); } }
  if (gl.man) {
    try {
      const sc = gl.man.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc), h = b.max.y - b.min.y; if (!(h > 0)) throw new Error('bad height');
      // the Mixamo clip is a walk cycle that travels forward: drop the hips position track so he walks on the spot
      const anims = gl.man.animations.map(c => { const n = c.clone(); n.tracks = n.tracks.filter(t => !/Hips\.position$/.test(t.name)); return n; });
      A.man = { scene: sc, anims, scale: CHAR_HEIGHT * 1.02 / h, footY: -b.min.y * CHAR_HEIGHT * 1.02 / h };
    } catch (e) { console.warn('man setup failed', e); }
  }
  A.rigs = {};   // new Quaternius characters: casual (Arjun, some gang), man2 (Karthik, the King, gang), womanA/womanB
  for (const k of ['casual', 'man2', 'womanA', 'womanB']) {
    const g = gl[k]; if (!g) continue;
    try { const sc = g.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc), h = b.max.y - b.min.y; if (!(h > 0)) throw new Error('bad height');
      A.rigs[k] = { scene: sc, anims: g.animations, scale: CHAR_HEIGHT * 1.02 / h, footY: -b.min.y * CHAR_HEIGHT * 1.02 / h }; }
    catch (e) { console.warn('rig setup failed', k, e); }
  }
  A.hats = {};
  for (const [k, f] of [['cowboy', 'hatCowboy'], ['top', 'hatTop']]) if (gl[f]) { try { A.hats[k] = buildHat(T, gl[f]); } catch (e) { console.warn('hat setup failed', k, e); } }
  A.sites = {};
  for (const cfg of SITES) { const g = gl[cfg.file]; if (!g) continue; try { A.sites[cfg.key] = buildSite(T, g, cfg); } catch (e) { console.warn('site setup failed', cfg.key, e); A.notes.push('site ' + cfg.key); } }
  try { await loadPF(T, loader, A); } catch (e) { console.warn('polyfork pack failed', e); A.notes.push('pf failed'); }
  A.ok = !!(Object.keys(A.veh).length || A.char || A.treeGeo);
  return A;
}

/* ------------------------------------------------------------------ instances ------------------------------------------------------------------ */
/** build one vehicle from a template; returns the same handle shape as models.js (group, body, wheels, ctx, update, setColor, dispose) */
export function instantiateVehicle(T, entry, type, colorHex, paintMats, envMats) {
  const { tpl, cfg } = entry, g = new T.Group(), body = new T.Group(); g.add(body);
  const inst = tpl.clone(true), wheels = [], pivots = [];
  inst.traverse(o => { if (o.name === 'wpivot') pivots.push(o); });
  for (const p of pivots) { p.parent.remove(p); g.add(p); wheels.push({ pivot: p, spin: p.children[0], r: p.userData.r || 0.35, front: !!p.userData.front }); }
  body.add(inst);
  const own = []; // per-instance materials to dispose
  const cache = new Map(), cloneMat = (m, setup) => { let c = cache.get(m); if (!c) { c = m.clone(); cache.set(m, c); own.push(c); if (setup) setup(c); } return c; };
  const paints = [], heads = [], tails = [];
  body.traverse(o => {
    if (!o.isMesh) return; o.castShadow = !(o.material && o.material.transparent); o.receiveShadow = false;
    const mat = o.material; if (!mat || !mat.name) return;
    if (cfg.paintRe && cfg.paintRe.test(mat.name)) o.material = cloneMat(mat, c => paints.push(c));
    else if (cfg.headMat && cfg.headMat.test(mat.name)) o.material = cloneMat(mat, c => { c.emissive.set(0xfff0c8); heads.push(c); });
    else if (cfg.tailMat && cfg.tailMat.test(mat.name)) o.material = cloneMat(mat, c => { c.emissive.set(0xff1a1a); tails.push(c); });
  });
  // glow pads
  const padGeo = new T.BoxGeometry(1, 1, 0.04), spots = (tpl.userData.spots || []);
  const hm = new T.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffeebb, emissiveIntensity: 0.1, roughness: 0.2 }), tm = new T.MeshStandardMaterial({ color: 0x9b0d0d, emissive: 0xff1010, emissiveIntensity: 0.15, roughness: 0.3 });
  own.push(hm, tm); if (spots.some(s => s.kind === 'head')) heads.push(hm); if (spots.some(s => s.kind === 'tail')) tails.push(tm);
  for (const s of spots) { const p = new T.Mesh(padGeo, s.kind === 'head' ? hm : tm); p.scale.set(s.w, s.h, 1); p.position.set(s.x, s.y, s.z); body.add(p); }
  for (const p of paints) paintMats.push(p);
  const white = new T.Color(1, 1, 1), tmpC = new T.Color();
  const m = { group: g, body, wheels, ctx: { paint: paints[0] || null }, type, lightOff: tpl.userData.halfLen, mount: [0, tpl.userData.top + 0.12, -0.2], glb: true, color: colorHex };
  m.setColor = hex => { if (!paints.length) { m.color = hex; return; } tmpC.set(hex); const k = cfg.tint === undefined ? 1 : cfg.tint; for (const p of paints) p.color.copy(white).lerp(tmpC, k); m.color = hex; };
  m.update = s => {
    for (const w of m.wheels) { if (w.front) w.pivot.rotation.y = -s.steer; w.spin.rotation.x += s.dist / w.r; }
    const te = s.reverse ? 1.2 : s.brake ? 2.6 : s.lights ? 0.9 : 0.12, he = s.lights ? 2.4 : 0.1;
    for (const t of tails) t.emissiveIntensity = te; for (const h of heads) h.emissiveIntensity = he;
    m.body.rotation.x = -(s.pitchVis || 0) - (s.ax || 0) * 0.0035; m.body.rotation.z = (s.ay || 0) * 0.006;
  };
  m.dispose = () => { for (const p of paints) { const i = paintMats.indexOf(p); if (i >= 0) paintMats.splice(i, 1); } for (const o of own) o.dispose(); padGeo.dispose(); };
  m.setColor(colorHex);
  return m;
}

/** register the materials shared by every instance so day/night env-map intensity applies to them */
export function collectSharedMaterials(assets, out) {
  const seen = new Set();
  for (const list of Object.values(assets.veh || {})) for (const e of list) e.tpl.traverse(o => { if (o.isMesh && o.material && !seen.has(o.material)) { seen.add(o.material); out.push(o.material); } });
  return out;
}

/** optional Polyfork pack (see tools/get-polyfork.sh): extra cars/bikes/buses/lorries, civic buildings, street people and animals */
async function loadPF(T, loader, A) {
  let man = null; try { const r = await fetch(U('pf/manifest.json'), { cache: 'no-cache' }); if (r.ok) man = await r.json(); } catch (e) { }
  if (!man || !Array.isArray(man.ids) || !man.ids.length) return;
  const gl = {}; await Promise.all(man.ids.map(id => new Promise(res => loader.load(U('pf/' + id + '.glb'), g => { gl[id] = g; res(); }, undefined, e => { A.notes.push('pf ' + id); res(); }))));
  let nv = 0, ns = 0;
  for (const v of PF_VEHICLES) {
    const g = gl[v.id]; if (!g) continue;
    const cfg = { file: 'pf', auto: true, rotY: 0, len: v.len, wheelRe: /wheel|tyre|tire/i, paintRe: /body|paint|primary|livery|main/i, tint: 0.85 };
    try { const tpl = buildVehicleTemplate(T, g, cfg); (A.veh[v.type] || (A.veh[v.type] = [])).push({ tpl, cfg }); nv++; } catch (e) { console.warn('pf vehicle', v.id, e); }
  }
  for (const s of PF_SITES) {
    const g = gl[s.id]; if (!g) continue; const cfg = { key: s.key, size: s.size, dim: 'xz', anchor: s.anchor, side: s.side, vis: 700, rot: Math.PI };
    try { A.sites[cfg.key] = buildSite(T, g, cfg); if (!SITES.some(x => x.key === cfg.key)) SITES.push(cfg); ns++; } catch (e) { console.warn('pf site', s.id, e); }
  }
  const norm = (g, H) => { const sc = g.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc), sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()); if (!(sz.y > 0)) return null; const k = H / sz.y; return { scene: sc, scale: k, footY: -b.min.y * k, cx: c.x * k, cz: c.z * k, yaw: 0 }; };
  const normLen = (g, L) => { const sc = g.scene; sc.updateMatrixWorld(true); const b = new T.Box3().setFromObject(sc), sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()), len = Math.max(sz.x, sz.z); if (!(len > 0)) return null; const k = L / len; return { scene: sc, scale: k, footY: -b.min.y * k, cx: c.x * k, cz: c.z * k, yaw: sz.x > sz.z * 1.15 ? Math.PI / 2 : 0 }; };
  A.pf = { humans: [], kids: [], animals: { cow: [], dog: [], goat: [] } };
  for (const id of PF_HUMANS) if (gl[id]) { const n = norm(gl[id], 1.76); if (n) A.pf.humans.push(n); }
  for (const id of PF_KIDS) if (gl[id]) { const n = norm(gl[id], 1.15); if (n) A.pf.kids.push(n); }
  for (const [kind, L] of [['cow', 2.1], ['dog', 0.95], ['goat', 1.1]]) for (const id of PF_ANIMALS[kind] || []) if (gl[id]) { const n = normLen(gl[id], L); if (n) A.pf.animals[kind].push(n); }
  A.notes.push(`polyfork: ${nv} vehicles, ${ns} buildings, ${A.pf.humans.length + A.pf.kids.length} people, ${Object.values(A.pf.animals).reduce((a, l) => a + l.length, 0)} animals`);
  console.log(A.notes[A.notes.length - 1]);
}
