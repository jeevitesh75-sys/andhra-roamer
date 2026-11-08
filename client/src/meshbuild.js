// Geometry builders. They return plain typed arrays so they can be tested without three.js.
import { mulberry32, hash2, smooth, clamp } from './noise.js';
import { SURF } from './geo.js';

const lin = v => Math.pow(clamp(v, 0, 1), 2.2); // sRGB-ish authoring colours -> linear vertex colours

/* ------------------------------ terrain chunk ------------------------------ */
export const CHUNK = 480, CHUNK_SEG = 48;

export function terrainChunk(world, cx, cz, size = CHUNK, seg = CHUNK_SEG) {
  const x0 = cx * size, z0 = cz * size, cell = size / seg, n = seg + 1, g = seg + 3;
  const H = new Float32Array(g * g);
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) H[j * g + i] = world.heightAt(x0 + (i - 1) * cell, z0 + (j - 1) * cell);
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const c = [0, 0, 0];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, gi = (j + 1) * g + (i + 1);
    const x = x0 + i * cell, z = z0 + j * cell, h = H[gi];
    const dhx = (H[gi + 1] - H[gi - 1]) / (2 * cell), dhz = (H[gi + g] - H[gi - g]) / (2 * cell);
    const il = 1 / Math.hypot(dhx, 1, dhz);
    pos[3 * k] = x; pos[3 * k + 1] = h; pos[3 * k + 2] = z;
    nor[3 * k] = -dhx * il; nor[3 * k + 1] = il; nor[3 * k + 2] = -dhz * il;
    world.groundColor(x, z, h, Math.hypot(dhx, dhz), c);
    col[3 * k] = lin(c[0]); col[3 * k + 1] = lin(c[1]); col[3 * k + 2] = lin(c[2]);
    uv[2 * k] = x / 22; uv[2 * k + 1] = z / 22;
  }
  const idx = new Uint32Array(seg * seg * 6);
  let p = 0;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
    idx[p++] = a; idx[p++] = d; idx[p++] = b; idx[p++] = b; idx[p++] = d; idx[p++] = e; // counter-clockwise seen from above
  }
  return { pos, nor, col, uv, idx };
}

/* ------------------------------- road ribbons ------------------------------ */
/** xs/zs/ys: sample arrays (length m). Produces a strip with u across (0..1) and v along (metres / vPeriod). */
export function ribbon(xs, zs, ys, halfW, vPeriod = 12, yOff = 0.1) {
  const m = xs.length, pos = new Float32Array(m * 6), nor = new Float32Array(m * 6), uv = new Float32Array(m * 4);
  let s = 0;
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
    let tx = xs[b] - xs[a], tz = zs[b] - zs[a]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i > 0) s += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    const lx = tz, lz = -tx;                // left of travel direction (our convention)
    const k = i * 2;
    pos.set([xs[i] + lx * halfW, ys[i] + yOff, zs[i] + lz * halfW, xs[i] - lx * halfW, ys[i] + yOff, zs[i] - lz * halfW], k * 3);
    nor.set([0, 1, 0, 0, 1, 0], k * 3);
    uv.set([0, s / vPeriod, 1, s / vPeriod], k * 2);
  }
  const idx = new Uint32Array((m - 1) * 6);
  for (let i = 0; i < m - 1; i++) { const a = i * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
  return { pos, nor, uv, idx };
}

/** Highway pieces (so frustum culling works): returns [{geo, kind, cx, cz}] */
export function roadPieces(world, road, piece = 40) {
  const out = [];
  for (let a = 0; a < road.n - 1; a += piece) {
    const b = Math.min(road.n - 1, a + piece);
    const m = b - a + 1, xs = new Float64Array(m), zs = new Float64Array(m), ys = new Float64Array(m);
    for (let i = 0; i < m; i++) { xs[i] = road.pts[2 * (a + i)]; zs[i] = road.pts[2 * (a + i) + 1]; ys[i] = road.y[a + i]; }
    // v continues across pieces so dashes line up
    const g = ribbon(xs, zs, ys, road.halfW, 12, 0.12);
    const off = road.cum[a] / 12; for (let i = 0; i < m * 2; i++) g.uv[2 * i + 1] += off;
    out.push({ geo: g, kind: road.kind, cx: xs[m >> 1], cz: zs[m >> 1] });
  }
  return out;
}

/* ------------------------------- merge helper ------------------------------ */
export function mergeGeos(list, keys = ['pos', 'nor', 'uv', 'col']) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.pos.length / 3; ic += g.idx.length; }
  const out = { idx: new Uint32Array(ic) };
  for (const k of keys) if (list[0][k]) out[k] = new Float32Array(vc * (k === 'uv' ? 2 : 3));
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.pos.length / 3;
    for (const k of keys) if (out[k]) out[k].set(g[k], vo * (k === 'uv' ? 2 : 3));
    for (let i = 0; i < g.idx.length; i++) out.idx[io + i] = g.idx[i] + vo;
    vo += n; io += g.idx.length;
  }
  return out;
}

/* ------------------------------ city geometry ------------------------------ */
/** Street grid ribbons for one city (two layers so crossings never z-fight). */
export function cityStreets(world, c) {
  const pieces = [];
  const Rs = c.R * 0.97, K = c.K;
  for (let axis = 0; axis < 2; axis++) {
    for (let k = -K; k <= K; k++) {
      const off = k * world.BLOCK, chord = Math.sqrt(Math.max(0, Rs * Rs - off * off));
      if (chord < 20) continue;
      const half = k % 4 === 0 ? 6.5 : world.STREET_HALF;
      const m = Math.max(3, Math.floor((chord * 2) / 8));
      const xs = new Float64Array(m), zs = new Float64Array(m), ys = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const t = -chord + (2 * chord * i) / (m - 1);
        const [wx, wz] = axis === 0 ? c.toWorld(t, off) : c.toWorld(off, t);
        xs[i] = wx; zs[i] = wz; ys[i] = world.heightAt(wx, wz);
      }
      const g = ribbon(xs, zs, ys, half, 12, 0.07 + axis * 0.035);
      pieces.push(g);
    }
  }
  return mergeGeos(pieces, ['pos', 'nor', 'uv']);
}

export function pushBox(out, cx, cz, hw, hd, c, s, y0, y1, color, plainUV, vTop, uScale) {
  // 4 side faces + roof. Window texture tile = 6 m wide x 6.4 m tall.
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [cx + lx * c - lz * s, cz + lx * s + lz * c]);
  const base = out.pos.length / 3;
  const faceNormal = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let f = 0; f < 4; f++) {
    const a = corners[f], b = corners[(f + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nl = faceNormal[f], nx = nl[0] * c - nl[1] * s, nz = nl[0] * s + nl[1] * c;
    const u1 = plainUV ? 0.03 : len / 6 * uScale, v1 = plainUV ? 0.03 : vTop;
    const i0 = out.pos.length / 3;
    out.pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
    for (let k = 0; k < 4; k++) { out.nor.push(nx, 0, nz); out.col.push(color[0], color[1], color[2]); }
    out.uv.push(plainUV ? 0.03 : 0, plainUV ? 0.03 : 0, u1, plainUV ? 0.03 : 0, u1, v1, plainUV ? 0.03 : 0, v1);
    out.idx.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2); // outward-facing (CCW seen from outside)
  }
  const i0 = out.pos.length / 3;
  for (const q of corners) { out.pos.push(q[0], y1, q[1]); out.nor.push(0, 1, 0); out.col.push(color[0] * 0.8, color[1] * 0.8, color[2] * 0.8); out.uv.push(0.03, 0.03); }
  out.idx.push(i0, i0 + 3, i0 + 2, i0, i0 + 2, i0 + 1);
  return base;
}

/** All buildings of a city merged into one geometry (windows via texture, colours via vertex colours). */
export function cityBuildings(c) {
  const out = { pos: [], nor: [], uv: [], col: [], idx: [] };
  for (const b of c.buildings) {
    const tint = 0.92 + hash2(Math.round(b.x), Math.round(b.z), 3) * 0.16;
    const col = [lin(b.color[0] * tint), lin(b.color[1] * tint), lin(b.color[2] * tint)];
    const y0 = b.y - 2.6, y1 = b.y + b.h;
    pushBox(out, b.x, b.z, b.hw, b.hd, b.c, b.s, y0, y1, col, false, (y1 - y0) / 6.4, 1);
    if (b.tank) pushBox(out, b.x + b.c * 0.8, b.z + b.s * 0.8, 1.2, 1.2, b.c, b.s, y1, y1 + 1.7, [lin(0.3), lin(0.3), lin(0.32)], true, 1, 1);
  }
  return { pos: new Float32Array(out.pos), nor: new Float32Array(out.nor), uv: new Float32Array(out.uv), col: new Float32Array(out.col), idx: new Uint32Array(out.idx) };
}

/* ---------------------------------- trees ---------------------------------- */
function cyl(out, x, y, z, r0, r1, h, seg, color, tilt = 0) {
  const base = out.pos.length / 3;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    out.pos.push(x + ca * r0, y, z + sa * r0, x + ca * r1 + tilt, y + h, z + sa * r1);
    out.nor.push(ca, 0.2, sa, ca, 0.2, sa);
    out.col.push(...color, ...color);
  }
  for (let i = 0; i < seg; i++) { const a = base + i * 2, b = base + ((i + 1) % seg) * 2; out.idx.push(a, b, a + 1, b, b + 1, a + 1); }
}
function blob(out, x, y, z, rx, ry, rz, color, sg = 6, rg = 4) {
  const base = out.pos.length / 3;
  for (let j = 0; j <= rg; j++) {
    const v = (j / rg) * Math.PI;
    for (let i = 0; i <= sg; i++) {
      const u = (i / sg) * Math.PI * 2, nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u);
      const sh = 0.88 + 0.24 * hash2(i, j, 9);
      out.pos.push(x + nx * rx * sh, y + ny * ry, z + nz * rz * sh); out.nor.push(nx, ny, nz);
      const k = 0.8 + 0.3 * (ny * 0.5 + 0.5); out.col.push(color[0] * k, color[1] * k, color[2] * k);
    }
  }
  for (let j = 0; j < rg; j++) for (let i = 0; i < sg; i++) {
    const a = base + j * (sg + 1) + i, b = a + 1, d = a + sg + 1, e = d + 1;
    out.idx.push(a, d, b, b, d, e);
  }
}
function frond(out, x, y, z, ang, len, color) {
  const base = out.pos.length / 3, ca = Math.cos(ang), sa = Math.sin(ang);
  const pts = [[0, 0, 0.0], [len * 0.5, 0.5, 0.35], [len, -0.9, 0], [len * 0.5, 0.5, -0.35]];
  for (const [fl, up, side] of pts) { out.pos.push(x + ca * fl - sa * side, y + up, z + sa * fl + ca * side); out.nor.push(0, 1, 0); out.col.push(...color); }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const toArrays = o => ({ pos: new Float32Array(o.pos), nor: new Float32Array(o.nor), col: new Float32Array(o.col), idx: new Uint32Array(o.idx) });

export function roundTreeGeometry() {
  const o = { pos: [], nor: [], col: [], idx: [] };
  cyl(o, 0, 0, 0, 0.22, 0.14, 2.6, 6, [lin(0.38), lin(0.27), lin(0.17)]);
  blob(o, 0, 3.7, 0, 1.9, 1.6, 1.9, [lin(0.30), lin(0.55), lin(0.22)], 7, 5);
  blob(o, 0.8, 3.0, 0.3, 1.2, 1.0, 1.2, [lin(0.26), lin(0.50), lin(0.20)], 6, 4);
  return toArrays(o);
}
export function palmGeometry() {
  const o = { pos: [], nor: [], col: [], idx: [] };
  cyl(o, 0, 0, 0, 0.26, 0.16, 7.2, 6, [lin(0.52), lin(0.42), lin(0.30)], 0.7);
  for (let i = 0; i < 8; i++) frond(o, 0.7, 7.2, 0, (i / 8) * Math.PI * 2, 3.4, [lin(0.22), lin(0.46), lin(0.16)]);
  blob(o, 0.7, 7.0, 0, 0.35, 0.3, 0.35, [lin(0.35), lin(0.28), lin(0.12)], 5, 3);
  return toArrays(o);
}

/** deterministic tree placement for a terrain chunk */
export function treesForChunk(world, cx, cz, size = CHUNK) {
  const rnd = mulberry32(((cx * 73856093) ^ (cz * 19349663)) >>> 0);
  const x0 = cx * size, z0 = cz * size, out = [];
  const mx = x0 + size / 2, mz = z0 + size / 2;
  const h0 = world.heightAt(mx, mz), dx = world.coastDx(mx, mz);
  if (h0 < -1.5) return out;
  const forest = clamp((h0 - 25) / 40, 0, 1);
  const attempts = Math.round(26 + forest * 110 + (dx < 7000 ? 30 : 0));
  for (let i = 0; i < attempts; i++) {
    const x = x0 + rnd() * size, z = z0 + rnd() * size;
    const h = world.heightAt(x, z);
    if (h < 1.2) continue;
    const e = 3, slope = Math.hypot(world.heightAt(x + e, z) - world.heightAt(x - e, z), world.heightAt(x, z + e) - world.heightAt(x, z - e)) / (2 * e);
    if (slope > 0.5) continue;
    const nr = world.nearestRoad(x, z);
    if (nr && nr.d < nr.halfW + 7) continue;
    if (world.cityAt(x, z, 50)) continue;
    const here = world.coastDx(x, z);
    const palm = here < 6500 && rnd() < 0.62 && forest < 0.4;
    out.push({ x, y: h - 0.15, z, rot: rnd() * 6.283, s: (palm ? 0.9 : 0.7) + rnd() * 0.7, palm, tint: 0.85 + rnd() * 0.3 });
  }
  return out;
}

/* ---------------------------- procedural road texture ---------------------------- */
export const FACADE_TILE = { w: 6, h: 6.4 };

/* ------------------------------ OSM tiles (real map) ------------------------------ */
const BPAL = [
  [[0.93, 0.89, 0.78], [0.86, 0.72, 0.55], [0.78, 0.82, 0.86], [0.9, 0.78, 0.78], [0.75, 0.85, 0.7], [0.95, 0.93, 0.88], [0.84, 0.62, 0.46], [0.9, 0.84, 0.6]],
  [[0.88, 0.86, 0.82], [0.8, 0.78, 0.72], [0.92, 0.85, 0.7], [0.7, 0.78, 0.85], [0.85, 0.7, 0.65], [0.9, 0.9, 0.86]],
  [[0.75, 0.8, 0.85], [0.9, 0.9, 0.88], [0.7, 0.72, 0.75], [0.85, 0.75, 0.55], [0.8, 0.85, 0.8]],
  [[0.62, 0.64, 0.66], [0.7, 0.68, 0.62], [0.55, 0.6, 0.68], [0.75, 0.74, 0.72]],
  [[0.97, 0.93, 0.85], [0.9, 0.55, 0.3], [0.95, 0.8, 0.5], [0.98, 0.98, 0.95]],
  [[0.9, 0.88, 0.8], [0.85, 0.78, 0.6], [0.8, 0.85, 0.9], [0.92, 0.7, 0.55]],
];
/** list = world.buildingsInRect(...) objects; geometry is built relative to (ox,oz) so far-from-origin precision is not an issue */
function pushFace(out, pts, col, ref) {
  const [a, b, c] = pts; let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  let mx = 0, my = 0, mz = 0; for (const p of pts) { mx += p[0]; my += p[1]; mz += p[2]; } mx /= pts.length; my /= pts.length; mz /= pts.length;
  if (nx * (mx - ref[0]) + ny * (my - ref[1]) + nz * (mz - ref[2]) < 0) { pts = pts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
  const i0 = out.pos.length / 3;
  for (const p of pts) { out.pos.push(p[0], p[1], p[2]); out.nor.push(nx, ny, nz); out.uv.push(0.04, 0.04); out.col.push(col[0], col[1], col[2]); }
  for (let i = 1; i < pts.length - 1; i++) out.idx.push(i0, i0 + i, i0 + i + 1);
}
const ROOFS = [[0.62, 0.3, 0.2], [0.46, 0.46, 0.48], [0.52, 0.22, 0.18], [0.58, 0.4, 0.28]];
/** gabled roof on a rectangular house (local frame -> world with c,s) */
function pushGable(out, cx, cz, hw, hd, c, s, y1, rh, col) {
  const O = 0.35, W = hw + O, D = hd + O, wx = (lx, lz) => cx + lx * c - lz * s, wz = (lx, lz) => cz + lx * s + lz * c, P = (lx, y, lz) => [wx(lx, lz), y, wz(lx, lz)], ref = [cx, y1 - 1, cz], top = y1 + rh;
  if (hw >= hd) { // ridge along local x
    pushFace(out, [P(-W, y1, -D), P(W, y1, -D), P(W, top, 0), P(-W, top, 0)], col, ref); pushFace(out, [P(-W, y1, D), P(W, y1, D), P(W, top, 0), P(-W, top, 0)], col, ref);
    pushFace(out, [P(W, y1, -hd), P(W, y1, hd), P(W, top - 0.01, 0)], [0.85, 0.82, 0.76].map(lin), ref); pushFace(out, [P(-W, y1, -hd), P(-W, y1, hd), P(-W, top - 0.01, 0)], [0.85, 0.82, 0.76].map(lin), ref);
  } else {
    pushFace(out, [P(-W, y1, -D), P(-W, y1, D), P(0, top, D), P(0, top, -D)], col, ref); pushFace(out, [P(W, y1, -D), P(W, y1, D), P(0, top, D), P(0, top, -D)], col, ref);
    pushFace(out, [P(-hw, y1, D), P(hw, y1, D), P(0, top - 0.01, D)], [0.85, 0.82, 0.76].map(lin), ref); pushFace(out, [P(-hw, y1, -D), P(hw, y1, -D), P(0, top - 0.01, -D)], [0.85, 0.82, 0.76].map(lin), ref);
  }
}
/** list = world.buildingsInRect(...) objects; geometry is built relative to (ox,oz) so far-from-origin precision is not an issue */
export function osmBuildings(list, ox, oz) {
  const out = { pos: [], nor: [], uv: [], col: [], idx: [] };
  for (const b of list) {
    const pal = BPAL[b.cls] || BPAL[0], hs = hash2(Math.round(b.x), Math.round(b.z), 11), c0 = pal[Math.floor(hs * pal.length) % pal.length], tint = 0.93 + hash2(Math.round(b.x), Math.round(b.z), 3) * 0.14;
    const col = [lin(c0[0] * tint), lin(c0[1] * tint), lin(c0[2] * tint)];
    const y0 = -2, y1 = b.h, bx = b.x - ox, bz = b.z - oz, area = 4 * b.hw * b.hd, dark = [lin(0.3), lin(0.3), lin(0.32)];
    pushBox(out, bx, bz, b.hw, b.hd, b.c, b.s, y0, y1, col, false, (y1 - y0) / 6.4, 1);
    const house = (b.cls === 0 || b.cls === 4) && area < 260 && y1 < 9 && b.hw > 1.6 && b.hd > 1.6;
    if (house && hs > 0.28) { const rc = ROOFS[Math.floor(hs * 977) % ROOFS.length]; pushGable(out, bx, bz, b.hw, b.hd, b.c, b.s, y1, Math.min(b.hw, b.hd) * 0.55 + 0.6, rc.map(lin)); continue; }
    const wx = (lx, lz) => bx + lx * b.c - lz * b.s, wz = (lx, lz) => bz + lx * b.s + lz * b.c;
    if (area > 70 && y1 > 3.5) { const pc = [lin(c0[0] * 0.78), lin(c0[1] * 0.78), lin(c0[2] * 0.78)], t = 0.22, hh = 0.9;   // roof parapet
      pushBox(out, wx(0, b.hd - t), wz(0, b.hd - t), b.hw, t, b.c, b.s, y1, y1 + hh, pc, true, 1, 1); pushBox(out, wx(0, -b.hd + t), wz(0, -b.hd + t), b.hw, t, b.c, b.s, y1, y1 + hh, pc, true, 1, 1);
      pushBox(out, wx(b.hw - t, 0), wz(b.hw - t, 0), t, b.hd - 2 * t, b.c, b.s, y1, y1 + hh, pc, true, 1, 1); pushBox(out, wx(-b.hw + t, 0), wz(-b.hw + t, 0), t, b.hd - 2 * t, b.c, b.s, y1, y1 + hh, pc, true, 1, 1); }
    if (b.h > 13 && b.hw > 4 && b.hd > 4) pushBox(out, bx, bz, b.hw * 0.5, b.hd * 0.5, b.c, b.s, y1, y1 + 2.8, [lin(c0[0] * 0.9), lin(c0[1] * 0.9), lin(c0[2] * 0.9)], false, 0.5, 1);      // penthouse
    else if (b.h > 4 && area > 30 && hs > 0.45) pushBox(out, wx(b.hw * 0.4, 0), wz(b.hw * 0.4, 0), 0.7, 0.7, b.c, b.s, y1, y1 + 1.5, dark, true, 1, 1);  // water tank
  }
  if (!out.pos.length) return null;
  return { pos: new Float32Array(out.pos), nor: new Float32Array(out.nor), uv: new Float32Array(out.uv), col: new Float32Array(out.col), idx: new Uint32Array(out.idx) };
}
/** road runs from world.roadsInRect -> {hi, lo} merged geometries (highways with lane dashes, streets plain) */
export function osmRoads(runs, ox, oz) {
  const hi = [], lo = [];
  for (const u of runs) {
    const r = u.road, m = u.b - u.a + 1; if (m < 2) continue;
    const xs = new Float64Array(m), zs = new Float64Array(m), ys = new Float64Array(m);
    for (let i = 0; i < m; i++) { xs[i] = r.pts[2 * (u.a + i)] - ox; zs[i] = r.pts[2 * (u.a + i) + 1] - oz; }
    const g = ribbon(xs, zs, ys, r.halfW, 12, 0.05 + (8 - r.cls) * 0.012);
    const off = r.cum[u.a] / 12; for (let i = 0; i < m * 2; i++) g.uv[2 * i + 1] += off;
    (r.cls <= 4 ? hi : lo).push(g);
  }
  return { hi: hi.length ? mergeGeos(hi, ['pos', 'nor', 'uv']) : null, lo: lo.length ? mergeGeos(lo, ['pos', 'nor', 'uv']) : null };
}

/** bridge decks, parapets and piers: roads flagged bridge in OSM, plus any road segment that crosses water */
export function osmBridges(world, runs, ox, oz) {
  const out = { pos: [], nor: [], uv: [], col: [], idx: [] }, conc = [lin(0.66), lin(0.65), lin(0.62)], rail = [lin(0.8), lin(0.8), lin(0.78)];
  for (const u of runs) {
    const r = u.road, p = r.pts;
    for (let i = u.a; i < u.b; i++) {
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3], mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5 || !(r.bridge || world.heightAt(mx, mz) < -0.8)) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, c = dz, s = -dx, hw = r.halfW, X = mx - ox, Z = mz - oz, nx = c, nz = s; // local x axis = (c,s)
      pushBox(out, X, Z, hw + 0.35, L / 2 + 0.05, c, s, -0.9, 0.0, conc, true, 1, 1);                       // deck
      for (const sd of [-1, 1]) pushBox(out, X + nx * (hw + 0.2) * sd, Z + nz * (hw + 0.2) * sd, 0.18, L / 2 + 0.05, c, s, 0, 1.0, rail, true, 1, 1);   // parapet
      if (Math.floor((r.cum[i] + 0.1) / 14) !== Math.floor((r.cum[i + 1] + 0.1) / 14) || L > 14) for (const sd of [-0.5, 0.5]) pushBox(out, X + nx * hw * sd, Z + nz * hw * sd, 0.55, 0.55, c, s, -2.3, -0.9, conc, true, 1, 1);   // piers
    }
  }
  if (!out.pos.length) return null;
  return { pos: new Float32Array(out.pos), nor: new Float32Array(out.nor), uv: new Float32Array(out.uv), col: new Float32Array(out.col), idx: new Uint32Array(out.idx) };
}
/** railway track: gravel bed + two steel rails. returns {bed, steel} geometries (local to ox,oz) */
export function osmRails(runs, ox, oz) {
  const bed = [], steel = [];
  for (const u of runs) {
    const r = u.r, m = u.b - u.a + 1; if (m < 2) continue;
    const xs = new Float64Array(m), zs = new Float64Array(m), ys = new Float64Array(m);
    for (let i = 0; i < m; i++) { xs[i] = r.pts[2 * (u.a + i)] - ox; zs[i] = r.pts[2 * (u.a + i) + 1] - oz; }
    bed.push(ribbon(xs, zs, ys, 1.9, 6, 0.03));
    for (const off of [-0.72, 0.72]) {
      const ox2 = new Float64Array(m), oz2 = new Float64Array(m);
      for (let i = 0; i < m; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1); let tx = xs[i1] - xs[i0], tz = zs[i1] - zs[i0]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; ox2[i] = xs[i] + tz * off; oz2[i] = zs[i] - tx * off; }
      steel.push(ribbon(ox2, oz2, ys, 0.07, 6, 0.1));
    }
  }
  return { bed: bed.length ? mergeGeos(bed, ['pos', 'nor', 'uv']) : null, steel: steel.length ? mergeGeos(steel, ['pos', 'nor', 'uv']) : null };
}
