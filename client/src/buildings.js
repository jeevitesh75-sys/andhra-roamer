// Code-built story buildings (no model files needed): factory, port, crew den, warehouse, smuggling yard.
// Local frame: origin = centre on the ground, +z = front (gate side). Footprints are listed in BUILDINGS for placement.
export function makeBuilder(T) {
  const mats = {}, M = (c, r = 0.85, m = 0) => mats[c + '/' + r + '/' + m] || (mats[c + '/' + r + '/' + m] = new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
  const box = (g, w, h, d, x, y, z, c, r, m) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), M(c, r, m)); o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const cyl = (g, rt, rb, h, x, y, z, c, m = 0.2) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, 14), M(c, 0.6, m)); o.position.set(x, y + h / 2, z); o.castShadow = true; g.add(o); return o; };
  const fence = (g, w, d, c = 0x5a5f66) => { for (const [sx, sz, lw, ld] of [[0, d / 2, w, 0.15], [0, -d / 2, w, 0.15], [w / 2, 0, 0.15, d], [-w / 2, 0, 0.15, d]]) box(g, lw, 2.2, ld, sx, 0, sz, c, 0.9, 0.3); };
  const door = (g, w, h, x, z, c) => box(g, w, h, 0.3, x, 0, z, c, 0.7, 0.2);
  const B = {};
  B.factory = () => {
    const g = new T.Group(); box(g, 44, 11, 26, 0, 0, 0, 0x8a8076, 0.95);
    for (let i = 0; i < 4; i++) { const r = box(g, 11, 0.5, 26.4, -16.5 + i * 11, 11, 0, 0x4a4f56, 0.7, 0.3); r.rotation.z = -0.35; r.position.y = 11.7; box(g, 0.4, 3, 26.4, -11 + i * 11 - 5.5, 11, 0, 0x6d7782, 0.5, 0.2); }
    for (let i = 0; i < 6; i++) box(g, 3, 1.6, 0.2, -17 + i * 6.8, 6.5, 13.1, 0x6f93a8, 0.2, 0.5);
    door(g, 7, 7, 0, 13.1, 0x2d4a63); box(g, 9, 0.5, 4, 0, 7, 14.8, 0x3a3f46, 0.8, 0.3);
    cyl(g, 1.3, 1.6, 26, 18, 0, -16, 0x7a3b2e); cyl(g, 1.1, 1.4, 20, 23, 0, -16, 0x7a3b2e);
    for (let i = 0; i < 3; i++) cyl(g, 3, 3, 7, -22 + i * 7.5, 0, 20, 0xaab2ba, 0.6);
    box(g, 6, 3, 6, -26, 0, 4, 0x555b63, 0.9); fence(g, 70, 56); return g;
  };
  B.port = () => {
    const g = new T.Group(); const cols = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0x566573];
    for (let x = 0; x < 5; x++) for (let z = 0; z < 3; z++) { const n = 1 + ((x * 3 + z * 5) % 3); for (let y = 0; y < n; y++) box(g, 2.5, 2.6, 12, -22 + x * 3.2, y * 2.6, -14 + z * 13, cols[(x + z * 2 + y) % 6], 0.7, 0.3); }
    box(g, 30, 7, 14, 20, 0, -10, 0x9a9087, 0.95); box(g, 30.6, 0.5, 14.6, 20, 7, -10, 0x4a4f56, 0.8, 0.3); door(g, 8, 5, 20, -2.9, 0x2d4a63);
    for (const x of [-4, 4]) { box(g, 0.8, 22, 0.8, x + 6, 0, 18, 0xd4a017, 0.6, 0.4); box(g, 0.8, 22, 0.8, x + 6, 0, 30, 0xd4a017, 0.6, 0.4); }
    box(g, 12, 1.2, 14, 6, 22, 24, 0xd4a017, 0.6, 0.4); box(g, 1, 1, 26, 6, 22.5, 22, 0xd4a017, 0.6, 0.4); box(g, 1.2, 8, 1.2, 6, 14, 36, 0x333, 0.8);
    for (let i = 0; i < 6; i++) cyl(g, 0.3, 0.35, 0.8, -26 + i * 10, 0, 40, 0x222222, 0.1);
    fence(g, 80, 60); return g;
  };
  B.den = () => {
    const g = new T.Group(); box(g, 14, 5.5, 10, 0, 0, 0, 0x7a4a3a, 0.95); box(g, 14.6, 0.4, 10.6, 0, 5.5, 0, 0x3a3f46, 0.8);
    box(g, 4, 3, 4, -3, 5.9, -1, 0x6b5a4a, 0.9); door(g, 1.6, 2.6, 0, 5.1, 0x1c1c1c);
    for (const x of [-4.5, 4.5]) box(g, 1.8, 1.4, 0.2, x, 2.4, 5.1, 0xe5c07b, 0.3);
    box(g, 12, 0.6, 0.3, 0, 4.3, 5.2, 0xb0171f, 0.5);
    for (let i = 0; i < 4; i++) box(g, 1.1, 1.1, 1.1, 8 + (i % 2) * 1.2, 0, -2 + Math.floor(i / 2) * 1.2, 0x9c7a3c, 0.9);
    cyl(g, 0.6, 0.6, 1.1, -8.5, 0, 3, 0x33498a); cyl(g, 0.6, 0.6, 1.1, -9.8, 0, 2.2, 0x8a2e2e);
    box(g, 22, 2.6, 0.4, 0, 0, 12, 0x6b6e73, 0.95); fence(g, 26, 22, 0x4a3b32); return g;
  };
  B.warehouse = () => {
    const g = new T.Group(); box(g, 34, 8, 20, 0, 0, 0, 0x8f959c, 0.8, 0.4);
    for (const s of [-1, 1]) { const r = box(g, 18, 0.4, 21, s * 8.2, 8.9, 0, 0x5b6169, 0.7, 0.4); r.rotation.z = s * 0.22; r.position.y = 8.9; }
    door(g, 8, 6, -6, 10.1, 0x41484f); door(g, 8, 6, 6, 10.1, 0x41484f); box(g, 3, 1, 0.2, 0, 7, 10.1, 0xd4a017, 0.5);
    for (let i = 0; i < 5; i++) box(g, 2, 2, 2, 20 + (i % 2) * 2.1, 0, -6 + i * 3, 0x9c7a3c, 0.9); return g;
  };
  B.yard = () => {
    const g = new T.Group(); const cols = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x566573];
    for (let x = 0; x < 6; x++) for (let z = 0; z < 2; z++) for (let y = 0; y < 1 + ((x + z) % 2); y++) box(g, 2.5, 2.6, 12, -9 + x * 3.2, y * 2.6, -8 + z * 14, cols[(x * 2 + z + y) % 5], 0.7, 0.3);
    box(g, 6, 3, 4, 14, 0, 6, 0xd9d2c3, 0.9); box(g, 6.4, 0.3, 4.4, 14, 3, 6, 0x555b63); fence(g, 44, 34); return g;
  };
  return B;
}
/** where each building stands: anchor key, local-frame facing offset, side offset (m) from the anchor, visibility range */
export const BUILDINGS = [
  { key: 'factory', build: 'factory', anchor: 'factory', side: 0, vis: 700 },
  { key: 'port', build: 'port', anchor: 'port', side: 0, vis: 800 },
  { key: 'meetGodown', build: 'warehouse', anchor: 'meet', side: 0, vis: 600 },
  { key: 'den', build: 'den', anchor: 'den', side: 0, vis: 500 },
  { key: 'warehouse', build: 'warehouse', anchor: 'warehouse', side: 0, vis: 600 },
  { key: 'yard', build: 'yard', anchor: 'yard', side: 0, vis: 600 },
];
