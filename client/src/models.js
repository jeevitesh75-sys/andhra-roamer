// Procedural vehicle models. THREE is injected (loaded from CDN at runtime). Local frame: +z forward, +y up, +x LEFT.
import { instantiateVehicle, collectSharedMaterials } from './glbassets.js';
export function createModels(T, assets = null) {
  const M = {
    glass: new T.MeshStandardMaterial({ color: 0x0d141b, metalness: 0.85, roughness: 0.06 }),
    tire: new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
    rim: new T.MeshStandardMaterial({ color: 0xc4c9d0, metalness: 0.9, roughness: 0.28 }),
    plastic: new T.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7 }),
    chassis: new T.MeshStandardMaterial({ color: 0x25272b, roughness: 0.8, metalness: 0.3 }),
    white: new T.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
    wood: new T.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 }),
  };
  const envMats = [M.glass, M.rim, M.chassis, M.white];
  const cache = {};
  const paintMats = [];
  const paintMat = hex => { const m = new T.MeshPhysicalMaterial({ color: hex, metalness: 0.55, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.15 }); paintMats.push(m); return m; };

  function extrude(prof, depth, bevel = 0.05) {
    const shape = new T.Shape();
    prof.forEach(([f, y], i) => (i ? shape.lineTo(f, y) : shape.moveTo(f, y)));
    shape.closePath();
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1, steps: 1 });
    g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); return g; // shape x -> forward z, extrusion -> width x
  }
  const geo = (key, make) => cache[key] || (cache[key] = make());
  const add = (parent, g, m, x, y, z, shadow = true) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o; };
  const box = (parent, w, h, l, m, x, y, z, shadow = true) => add(parent, geo(`b${w},${h},${l}`, () => new T.BoxGeometry(w, h, l)), m, x, y, z, shadow);

  function wheel(parent, list, r, w, x, y, z, front) {
    const pivot = new T.Group(); pivot.position.set(x, y, z); parent.add(pivot);
    const spin = new T.Group(); pivot.add(spin);
    const tg = geo(`tire${r},${w}`, () => { const g = new T.CylinderGeometry(r, r, w, 20); g.rotateZ(Math.PI / 2); return g; });
    const rg = geo(`rim${r},${w}`, () => { const g = new T.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 10); g.rotateZ(Math.PI / 2); return g; });
    const bar = geo(`bar${r}`, () => new T.BoxGeometry(w + 0.03, r * 0.16, r * 1.1));
    add(spin, tg, M.tire, 0, 0, 0); add(spin, rg, M.rim, 0, 0, 0, false); add(spin, bar, M.chassis, 0, 0, 0, false);
    list.push({ pivot, spin, r, front });
  }
  function lights(parent, ctx, hx, hy, hz, tx, ty, tz, wHead, wTail) {
    for (const s of [-1, 1]) {
      box(parent, wHead, 0.14, 0.06, ctx.head, s * hx, hy, hz, false);
      box(parent, wTail, 0.12, 0.06, ctx.tail, s * tx, ty, tz, false);
    }
  }
  function newCtx(paint) {
    return { paint, head: new T.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffeebb, emissiveIntensity: 0.1, roughness: 0.2 }),
      tail: new T.MeshStandardMaterial({ color: 0x9b0d0d, emissive: 0xff1010, emissiveIntensity: 0.15, roughness: 0.3 }) };
  }

  function buildCar(color) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const ctx = newCtx(paintMat(color)), wheels = [];
    add(body, geo('carBody', () => extrude([[-2.05, 0.38], [-2.1, 0.6], [-2.07, 0.98], [-1.55, 1.03], [-0.95, 1.45], [0.35, 1.45], [0.98, 1.02], [1.6, 0.9], [2.08, 0.72], [2.1, 0.48], [1.92, 0.36]], 1.7)), ctx.paint, 0, 0, 0);
    add(body, geo('carGlass', () => extrude([[-1.5, 1.06], [-0.95, 1.41], [0.33, 1.41], [0.9, 1.05]], 1.9, 0.01)), M.glass, 0, 0, 0, false);
    const ws = box(body, 1.55, 0.03, 0.74, M.glass, 0, 1.22, 0.66, false); ws.rotation.x = 0.0; ws.rotation.set(-0.62, 0, 0); ws.position.set(0, 1.235, 0.67);
    const rw = box(body, 1.55, 0.03, 0.74, M.glass, 0, 1.22, -1.26, false); rw.rotation.set(0.62, 0, 0); rw.position.set(0, 1.235, -1.27);
    box(body, 0.2, 0.12, 0.28, ctx.paint, 0.97, 1.03, 0.62, false); box(body, 0.2, 0.12, 0.28, ctx.paint, -0.97, 1.03, 0.62, false); // mirrors
    box(body, 1.62, 0.2, 0.14, M.plastic, 0, 0.42, 2.12, false); box(body, 1.62, 0.2, 0.14, M.plastic, 0, 0.42, -2.12, false);
    lights(body, ctx, 0.6, 0.66, 2.1, 0.62, 0.78, -2.1, 0.3, 0.3);
    for (const s of [-1, 1]) { wheel(g, wheels, 0.33, 0.24, s * 0.8, 0.33, 1.3, true); wheel(g, wheels, 0.33, 0.24, s * 0.8, 0.33, -1.25, false); }
    return { group: g, body, wheels, ctx, type: 'car', lightOff: 2.1 };
  }

  function buildBus(color) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const ctx = newCtx(paintMat(color)), wheels = [];
    add(body, geo('busBody', () => extrude([[-5.7, 0.5], [-5.7, 3.15], [4.9, 3.15], [5.7, 2.75], [5.7, 0.62], [5.4, 0.5]], 2.46, 0.06)), ctx.paint, 0, 0, 0);
    add(body, geo('busGlass', () => extrude([[-5.2, 1.45], [-5.2, 2.55], [4.7, 2.55], [5.25, 2.55], [5.25, 1.45]], 2.6, 0.01)), M.glass, 0, 0, 0, false);
    box(body, 2.2, 1.25, 0.05, M.glass, 0, 1.92, 5.7, false);                         // windscreen
    box(body, 2.5, 0.3, 11.2, M.white, 0, 1.05, -0.0, false).scale.set(1.0, 1, 1);    // white band
    box(body, 1.4, 0.26, 0.05, new T.MeshStandardMaterial({ color: 0x331800, emissive: 0xffb000, emissiveIntensity: 0.9 }), 0, 2.92, 5.72, false); // destination sign
    box(body, 0.2, 0.1, 0.45, ctx.paint, 1.35, 1.9, 5.5, false); box(body, 0.2, 0.1, 0.45, ctx.paint, -1.35, 1.9, 5.5, false);
    box(body, 2.5, 0.25, 0.14, M.plastic, 0, 0.55, 5.78, false); box(body, 2.5, 0.25, 0.14, M.plastic, 0, 0.55, -5.78, false);
    lights(body, ctx, 0.9, 0.82, 5.72, 1.0, 1.0, -5.72, 0.4, 0.34);
    for (const s of [-1, 1]) { wheel(g, wheels, 0.52, 0.32, s * 1.05, 0.52, 3.7, true); wheel(g, wheels, 0.52, 0.34, s * 1.05, 0.52, -2.4, false); }
    return { group: g, body, wheels, ctx, type: 'bus', lightOff: 5.7 };
  }

  function rearBoard() {
    const t = geo('lorryTex', () => {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#c0392b'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#f1c40f'; x.lineWidth = 6; x.strokeRect(5, 5, 502, 118);
      x.fillStyle = '#f9e79f'; x.font = 'bold 54px Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('HORN OK PLEASE', 256, 66);
      const tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; return tx;
    });
    return t;
  }
  function buildLorry(color) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const ctx = newCtx(paintMat(color)), wheels = [];
    const bed = paintMat(new T.Color(color).offsetHSL(0.08, -0.1, 0.1).getHex());
    box(body, 1.3, 0.34, 8.8, M.chassis, 0, 0.88, -0.4, false);
    box(body, 2.4, 2.2, 2.3, ctx.paint, 0, 1.95, 3.5);                      // cab
    box(body, 2.3, 0.2, 0.7, M.plastic, 0, 0.95, 4.8, false);               // bumper
    const wsh = box(body, 2.1, 0.9, 0.05, M.glass, 0, 2.55, 4.66, false);
    box(body, 2.45, 0.5, 0.6, ctx.paint, 0, 3.2, 3.9, false);               // roof visor
    box(body, 2.5, 0.12, 6.4, M.wood, 0, 1.15, -1.45);                      // deck
    box(body, 2.5, 1.9, 6.4, bed, 0, 2.15, -1.45);                          // cargo box
    box(body, 2.56, 0.3, 6.4, new T.MeshStandardMaterial({ color: 0xf4d03f, roughness: 0.6 }), 0, 1.55, -1.45, false); // stripe
    const tex = rearBoard();
    if (tex) { const p = new T.Mesh(new T.PlaneGeometry(2.2, 0.55), new T.MeshStandardMaterial({ map: tex, roughness: 0.7 })); p.rotation.y = Math.PI; p.position.set(0, 2.2, -4.66); body.add(p); }
    for (const s of [-1, 1]) box(body, 0.18, 0.09, 0.4, ctx.paint, s * 1.3, 2.8, 4.45, false);
    lights(body, ctx, 0.85, 1.1, 4.68, 1.0, 1.35, -4.66, 0.4, 0.3);
    for (const s of [-1, 1]) { wheel(g, wheels, 0.52, 0.34, s * 1.05, 0.52, 3.4, true); wheel(g, wheels, 0.52, 0.34, s * 1.05, 0.52, -1.8, false); wheel(g, wheels, 0.52, 0.34, s * 1.05, 0.52, -3.2, false); }
    return { group: g, body, wheels, ctx, type: 'lorry', lightOff: 4.7 };
  }

  function buildBike(color) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const ctx = newCtx(paintMat(color)), wheels = [];
    box(body, 0.2, 0.28, 0.9, M.chassis, 0, 0.62, 0.0);                              // frame / engine
    box(body, 0.3, 0.3, 0.7, ctx.paint, 0, 0.92, 0.28);                              // tank
    box(body, 0.26, 0.1, 0.62, M.plastic, 0, 0.92, -0.42);                           // seat
    box(body, 0.06, 0.62, 0.06, M.chassis, 0, 0.72, 0.78).rotation.x = 0.35;          // fork
    box(body, 0.78, 0.05, 0.05, M.chassis, 0, 1.12, 0.66);                           // handlebar
    box(body, 0.22, 0.16, 0.12, ctx.head, 0, 1.08, 0.82, false);                     // headlight
    box(body, 0.2, 0.08, 0.1, ctx.tail, 0, 0.82, -0.84, false);                      // tail light
    box(body, 0.1, 0.1, 0.5, M.chassis, 0.16, 0.38, -0.5);                            // exhaust
    wheel(g, wheels, 0.33, 0.14, 0, 0.33, 0.7, true); wheel(g, wheels, 0.33, 0.16, 0, 0.33, -0.68, false);
    return { group: g, body, wheels, ctx, type: 'bike', lightOff: 0.9 };
  }

  const BUILD = { car: buildCar, bus: buildBus, lorry: buildLorry, bike: buildBike, police: buildCar };
  if (assets && assets.veh) { try { collectSharedMaterials(assets, envMats); } catch (e) { console.warn(e); } }
  const hashStr = str => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  /** real glTF model for this vehicle type if it loaded (bikes: two models, picked by colour); null -> use the built-in box model */
  function createGlb(type, colorHex) {
    const list = assets && assets.veh && assets.veh[type]; if (!list || !list.length) return null;
    try { return instantiateVehicle(T, list[hashStr(colorHex) % list.length], type, colorHex, paintMats, envMats); }
    catch (e) { console.warn('glb vehicle failed, using built-in model', type, e); return null; }
  }
  /** returns a vehicle model handle */
  function create(type, colorHex) {
    const glb = createGlb(type, colorHex); if (glb) return glb;
    const m = BUILD[type](new T.Color(colorHex).getHex());
    m.type = type;
    m.group.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    m.color = colorHex;
    m.setColor = hex => { m.ctx.paint.color.set(hex); m.color = hex; };
    /** s = {steer (right+), brake, lights, reverse, dist (metres rolled since last call), ax, ay} */
    m.update = s => {
      for (const w of m.wheels) { if (w.front) w.pivot.rotation.y = -s.steer; w.spin.rotation.x += s.dist / w.r; }
      m.ctx.tail.emissiveIntensity = s.reverse ? 1.2 : s.brake ? 2.6 : s.lights ? 0.9 : 0.12;
      m.ctx.head.emissiveIntensity = s.lights ? 2.4 : 0.1;
      m.body.rotation.x = -(s.pitchVis || 0) - (s.ax || 0) * 0.0035; // braking dips the nose, accelerating squats
      m.body.rotation.z = (s.ay || 0) * 0.006;
    };
    m.dispose = () => { const i = paintMats.indexOf(m.ctx.paint); if (i >= 0) paintMats.splice(i, 1); m.ctx.paint.dispose(); m.ctx.head.dispose(); m.ctx.tail.dispose(); };
    return m;
  }
  return { create, envMats, paintMats };
}
