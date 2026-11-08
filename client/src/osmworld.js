// Real-map world built from OpenStreetMap data (see tools/osm2game.py). Same interface the physics/scene/main use.
// 1 game metre = 1 real metre. x = east, z = south, y = up. No terrain relief (OSM has none): flat, with water dips.
import { SURF } from './geo.js';
import { fbm, hash2, lerp, clamp, mulberry32 } from './noise.js';

export const CLS = { MOTORWAY: 0, TRUNK: 1, PRIMARY: 2, SECONDARY: 3, TERTIARY: 4, UNCLASSIFIED: 5, RESIDENTIAL: 6, SERVICE: 7, TRACK: 8 };
export const HALF_W = [8.5, 7.5, 6.5, 5.5, 4.6, 3.8, 3.5, 2.6, 2.2];
const CELL = 64;
const LAND_COL = [[0.56, 0.58, 0.34], [0.2, 0.33, 0.36], [0.6, 0.56, 0.5], [0.5, 0.58, 0.3], [0.2, 0.38, 0.2], [0.34, 0.56, 0.3], [0.55, 0.54, 0.52], [0.84, 0.77, 0.57], [0.6, 0.5, 0.38]];

async function fetchBuf(url) { const r = await fetch(url); if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`); return r.arrayBuffer(); }
export async function loadRegionData(id, base, onProgress = () => {}) {
  const meta = await (await fetch(`${base}/${id}.json`)).json(); onProgress(0.15);
  const [roads, bld, land, rail] = await Promise.all([fetchBuf(`${base}/${id}.roads.bin`), fetchBuf(`${base}/${id}.bld.bin`), fetchBuf(`${base}/${id}.land.bin`), fetchBuf(`${base}/${id}.rail.bin`).catch(() => null)]);
  onProgress(0.5);
  return { meta, roads, bld, land, rail };
}

/** data = {meta, roads:ArrayBuffer, bld:ArrayBuffer, land:ArrayBuffer} */
export function createOsmWorld(data) {
  const meta = data.meta, WORLD = { w: meta.w, h: meta.h };
  /* ---------------- land raster (RLE -> Uint8Array) ---------------- */
  const GW = meta.gw, GH = meta.gh, land = new Uint8Array(GW * GH);
  { const dv = new DataView(data.land), n = dv.getUint32(0, true), cls = new Uint8Array(data.land, 4, n), off = 4 + ((n + 3) & ~3), lens = new Uint16Array(data.land, off, n); let p = 0; for (let i = 0; i < n; i++) { land.fill(cls[i], p, p + lens[i]); p += lens[i]; } }
  const lc = (gx, gz) => land[(gz < 0 ? 0 : gz >= GH ? GH - 1 : gz) * GW + (gx < 0 ? 0 : gx >= GW ? GW - 1 : gx)];

  /* ---------------- roads ---------------- */
  const rd = new DataView(data.roads), nR = rd.getUint32(0, true), nPts = rd.getUint32(4, true);
  const rcls = new Uint8Array(data.roads, 8, nR); let o = 8 + ((nR + 3) & ~3);
  const rstart = new Uint32Array(data.roads, o, nR + 1); o += (nR + 1) * 4;
  const rpts = new Float32Array(data.roads, o, nPts * 2);
  const roads = [], segRoad = [], segIdx = [];
  const kindOf = c => (c <= 1 ? 'nh' : c <= 4 ? 'sh' : 'street');
  for (let i = 0; i < nR; i++) {
    const a = rstart[i], b = rstart[i + 1], n = b - a; if (n < 2) continue;
    const cls = rcls[i] & 0x7f, pts = rpts.subarray(a * 2, b * 2), cum = new Float32Array(n);
    for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1]);
    const r = { id: roads.length, ref: meta.roadNames[i] || ['Motorway', 'NH', 'Main road', 'Road', 'Road', 'Road', 'Street', 'Lane', 'Track'][cls], cls, kind: kindOf(cls), bridge: !!(rcls[i] & 0x80), halfW: HALF_W[cls], pts, y: new Float32Array(n), n, cum, len: cum[n - 1] };
    roads.push(r);
  }
  // spatial index (CSR) of road segments by 64 m cells, with a margin so a one-cell lookup finds everything within ~12 m
  const CW = Math.ceil(WORLD.w / CELL) + 1, CH = Math.ceil(WORLD.h / CELL) + 1, MARGIN = 12;
  const roadCount = new Uint32Array(CW * CH + 1);
  let nSeg = 0;
  for (const r of roads) nSeg += r.n - 1;
  const sRoad = new Uint32Array(nSeg), sIdx = new Uint32Array(nSeg); { let s = 0; for (const r of roads) for (let i = 0; i < r.n - 1; i++) { sRoad[s] = r.id; sIdx[s] = i; s++; } }
  const cellRange = (x0, z0, x1, z1, fn) => {
    const cx0 = Math.max(0, Math.floor((Math.min(x0, x1) - MARGIN) / CELL)), cx1 = Math.min(CW - 1, Math.floor((Math.max(x0, x1) + MARGIN) / CELL));
    const cz0 = Math.max(0, Math.floor((Math.min(z0, z1) - MARGIN) / CELL)), cz1 = Math.min(CH - 1, Math.floor((Math.max(z0, z1) + MARGIN) / CELL));
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cz * CW + cx);
  };
  for (let s = 0; s < nSeg; s++) { const r = roads[sRoad[s]], i = sIdx[s] * 2; cellRange(r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3], c => { roadCount[c + 1]++; }); }
  for (let c = 0; c < CW * CH; c++) roadCount[c + 1] += roadCount[c];
  const roadList = new Uint32Array(roadCount[CW * CH]), fill = roadCount.slice(0, CW * CH);
  for (let s = 0; s < nSeg; s++) { const r = roads[sRoad[s]], i = sIdx[s] * 2; cellRange(r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3], c => { roadList[fill[c]++] = s; }); }

  const NR = { d: 1e9, y: 0, road: null, i: 0, t: 0, halfW: 0 };
  function nearestRoad(x, z, maxCls = 8) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); if (cx < 0 || cz < 0 || cx >= CW || cz >= CH) return null;
    const c = cz * CW + cx; let bd = 1e18, bs = -1, bt = 0;
    for (let k = roadCount[c]; k < roadCount[c + 1]; k++) {
      const s = roadList[k], r = roads[sRoad[s]]; if (r.cls > maxCls) continue;
      const p = r.pts, i = sIdx[s] * 2, ax = p[i], az = p[i + 1], abx = p[i + 2] - ax, abz = p[i + 3] - az, l2 = abx * abx + abz * abz || 1e-9;
      let t = ((x - ax) * abx + (z - az) * abz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - (ax + abx * t), ez = z - (az + abz * t), d2 = ex * ex + ez * ez;
      if (d2 < bd) { bd = d2; bs = s; bt = t; }
    }
    if (bs < 0) return null;
    const r = roads[sRoad[bs]]; NR.d = Math.sqrt(bd); NR.road = r; NR.i = sIdx[bs]; NR.t = bt; NR.halfW = r.halfW; NR.y = 0; return NR;
  }
  /** nearest road point within rad metres (scans neighbouring cells); returns {x,z,road,s} or null */
  function snapToRoad(x, z, rad, maxCls = 6) {
    let best = null, bd = rad * rad; const rr = Math.ceil(rad / CELL);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      const gx = cx + dx, gz = cz + dz; if (gx < 0 || gz < 0 || gx >= CW || gz >= CH) continue; const c = gz * CW + gx;
      for (let k = roadCount[c]; k < roadCount[c + 1]; k++) {
        const s = roadList[k], r = roads[sRoad[s]]; if (r.cls > maxCls) continue;
        const p = r.pts, i = sIdx[s] * 2, ax = p[i], az = p[i + 1], abx = p[i + 2] - ax, abz = p[i + 3] - az, l2 = abx * abx + abz * abz || 1e-9;
        let t = ((x - ax) * abx + (z - az) * abz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + abx * t, pz = az + abz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
        if (d2 < bd) { bd = d2; best = { x: px, z: pz, road: r, s: r.cum[sIdx[s]] + t * Math.sqrt(l2) }; }
      }
    }
    return best;
  }
  function roadPoint(road, s, lane = 0, out = {}) {
    s = clamp(s, 0, road.len); let lo = 0, hi = road.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (road.cum[m] <= s) lo = m; else hi = m; }
    const p = road.pts, i = lo * 2, seg = road.cum[lo + 1] - road.cum[lo] || 1, t = (s - road.cum[lo]) / seg;
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz) || 1, fx = dx / L, fz = dz / L;
    out.x = p[i] + dx * t + fz * lane; out.z = p[i + 1] + dz * t - fx * lane;   // left of travel = (fz, -fx)
    out.y = 0; out.h = Math.atan2(fx, fz); return out;
  }
  /** (rect) segment lists for mesh building: calls fn(road, a, b) for each run of consecutive segments touching the rect */
  const stamp = new Uint32Array(nSeg); let stampN = 0;
  function roadsInRect(x0, z0, x1, z1, maxCls = 8) {
    stampN++; const segs = [];
    const cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.min(CW - 1, Math.floor(x1 / CELL)), cz0 = Math.max(0, Math.floor(z0 / CELL)), cz1 = Math.min(CH - 1, Math.floor(z1 / CELL));
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { const c = cz * CW + cx; for (let k = roadCount[c]; k < roadCount[c + 1]; k++) { const s = roadList[k]; if (stamp[s] === stampN) continue; stamp[s] = stampN; if (roads[sRoad[s]].cls <= maxCls) segs.push(s); } }
    segs.sort((a, b) => a - b); // consecutive segments of one road are consecutive ids
    const runs = []; let cur = null;
    for (const s of segs) {
      const r = roads[sRoad[s]], i = sIdx[s], mx = (r.pts[2 * i] + r.pts[2 * i + 2]) / 2, mz = (r.pts[2 * i + 1] + r.pts[2 * i + 3]) / 2;
      if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) { cur = null; continue; }   // each segment belongs to exactly one tile (by midpoint)
      if (cur && cur.road === r && cur.b === i) cur.b = i + 1; else { cur = { road: r, a: i, b: i + 1 }; runs.push(cur); }
    }
    for (const u of runs) { if (u.a > 0) u.a--; if (u.b < u.road.n - 1) u.b++; }  // overlap one segment so joins between tiles are covered
    return runs;
  }

  /* ---------------- railways ---------------- */
  const rails = [];
  if (data.rail && data.rail.byteLength > 8) {
    const dv = new DataView(data.rail), n = dv.getUint32(0, true), np = dv.getUint32(4, true), st = new Uint32Array(data.rail, 8, n + 1), pts = new Float32Array(data.rail, 8 + (n + 1) * 4, np * 2);
    for (let i = 0; i < n; i++) { const a = st[i], b = st[i + 1]; if (b - a >= 2) rails.push({ a, b, pts: pts.subarray(a * 2, b * 2), n: b - a }); }
  }
  /** rail runs whose segment midpoints lie in the rect (one tile owns each segment) */
  function railsInRect(x0, z0, x1, z1) {
    const runs = [];
    for (const r of rails) {
      let cur = null; const p = r.pts;
      for (let i = 0; i < r.n - 1; i++) {
        const mx = (p[2 * i] + p[2 * i + 2]) / 2, mz = (p[2 * i + 1] + p[2 * i + 3]) / 2;
        if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) { cur = null; continue; }
        if (cur && cur.b === i) cur.b = i + 1; else { cur = { r, a: i, b: i + 1 }; runs.push(cur); }
      }
    }
    for (const u of runs) { if (u.a > 0) u.a--; if (u.b < u.r.n - 1) u.b++; }
    return runs;
  }
  function railNearest(x, z, maxD = 400) {
    let best = null, bd = maxD * maxD;
    for (const r of rails) { const p = r.pts; for (let i = 0; i < r.n - 1; i++) {
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2] - ax, bz = p[2 * i + 3] - az, l2 = bx * bx + bz * bz || 1e-9; let t = ((x - ax) * bx + (z - az) * bz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + bx * t, pz = az + bz * t, d2 = (x - px) ** 2 + (z - pz) ** 2; if (d2 < bd) { bd = d2; best = { x: px, z: pz, h: Math.atan2(bx, bz), d: Math.sqrt(d2) }; } } }
    return best;
  }

  /* ---------------- buildings ---------------- */
  const bd = new DataView(data.bld), nB = bd.getUint32(0, true); let bo = 4;
  const bx = new Float32Array(data.bld, bo, nB); bo += nB * 4; const bz = new Float32Array(data.bld, bo, nB); bo += nB * 4;
  const bhw = new Uint16Array(data.bld, bo, nB); bo += (nB * 2 + 3) & ~3; const bhd = new Uint16Array(data.bld, bo, nB); bo += (nB * 2 + 3) & ~3;
  const bang = new Uint8Array(data.bld, bo, nB); bo += (nB + 3) & ~3; const bh = new Uint8Array(data.bld, bo, nB); bo += (nB + 3) & ~3; const bcls = new Uint8Array(data.bld, bo, nB);
  const bCount = new Uint32Array(CW * CH + 1);
  const bRange = (i, fn) => { const r = Math.hypot(bhw[i], bhd[i]) / 20; const x = bx[i], z = bz[i];
    const cx0 = Math.max(0, Math.floor((x - r) / CELL)), cx1 = Math.min(CW - 1, Math.floor((x + r) / CELL)), cz0 = Math.max(0, Math.floor((z - r) / CELL)), cz1 = Math.min(CH - 1, Math.floor((z + r) / CELL));
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cz * CW + cx); };
  for (let i = 0; i < nB; i++) bRange(i, c => { bCount[c + 1]++; });
  for (let c = 0; c < CW * CH; c++) bCount[c + 1] += bCount[c];
  const bList = new Uint32Array(bCount[CW * CH]), bFill = bCount.slice(0, CW * CH);
  for (let i = 0; i < nB; i++) bRange(i, c => { bList[bFill[c]++] = i; });
  const bObj = new Map(), EMPTY = [];
  const mkB = i => { const a = (bang[i] / 255) * Math.PI; return { i, x: bx[i], z: bz[i], hw: bhw[i] / 20, hd: bhd[i] / 20, c: Math.cos(a), s: Math.sin(a), h: bh[i] / 2, cls: bcls[i], y: 0 }; };
  function buildingsNear(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); if (cx < 0 || cz < 0 || cx >= CW || cz >= CH) return EMPTY;
    const c = cz * CW + cx; let arr = bObj.get(c); if (arr) return arr;
    arr = []; for (let k = bCount[c]; k < bCount[c + 1]; k++) arr.push(mkB(bList[k]));
    if (bObj.size > 6000) bObj.clear(); bObj.set(c, arr); return arr;
  }
  /** buildings whose centre lies in the rect (for mesh tiles) */
  function buildingsInRect(x0, z0, x1, z1) {
    const out = [], cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.min(CW - 1, Math.floor(x1 / CELL)), cz0 = Math.max(0, Math.floor(z0 / CELL)), cz1 = Math.min(CH - 1, Math.floor(z1 / CELL));
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { const c = cz * CW + cx; for (let k = bCount[c]; k < bCount[c + 1]; k++) { const i = bList[k]; if (bx[i] >= x0 && bx[i] < x1 && bz[i] >= z0 && bz[i] < z1) out.push(mkB(i)); } }
    return out;
  }

  /* ---------------- terrain ---------------- */
  const WATER_DEPTH = 1.6;
  function waterFrac(x, z) {
    const fx = x / meta.cell - 0.5, fz = z / meta.cell - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const w = (a, b) => (lc(a, b) === 1 ? 1 : 0);
    return lerp(lerp(w(ix, iz), w(ix + 1, iz), tx), lerp(w(ix, iz + 1), w(ix + 1, iz + 1), tx), tz);
  }
  const terrainHeight = (x, z) => -WATER_DEPTH * waterFrac(x, z);
  /** ground height for physics/camera: terrain dips under water, but a bridge deck over water is at road level */
  function heightAt(x, z) {
    const t = terrainHeight(x, z); if (t > -0.05) return t;
    const nr = nearestRoad(x, z, 8); return nr && nr.d < nr.halfW + 0.8 ? 0 : t;
  }
  const naturalHeight = heightAt;
  /** bridge parapets: keep a vehicle on the deck. returns true when it pushed the vehicle */
  function bridgeBarrier(v, r) {
    if (terrainHeight(v.x, v.z) > -0.8) return false;
    const nr = nearestRoad(v.x, v.z, 8); if (!nr || nr.d > nr.halfW + 3) return false;
    const lim = Math.max(1.2, nr.halfW - r); if (nr.d <= lim) return false;
    const p = nr.road.pts, i = nr.i * 2, px = p[i] + (p[i + 2] - p[i]) * nr.t, pz = p[i + 1] + (p[i + 3] - p[i + 1]) * nr.t, nx = (v.x - px) / nr.d, nz = (v.z - pz) / nr.d;
    v.x = px + nx * lim; v.z = pz + nz * lim; const vn = v.vx * nx + v.vz * nz; if (vn > 0) { v.vx -= 1.4 * vn * nx; v.vz -= 1.4 * vn * nz; v.impact = Math.max(v.impact || 0, vn); } return true;
  }
  function groundColor(x, z, h, slope, out) {
    const fx = x / meta.cell - 0.5, fz = z / meta.cell - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    let r = 0, g = 0, b = 0;
    const add = (gx, gz, w) => { const c = LAND_COL[lc(gx, gz)]; r += c[0] * w; g += c[1] * w; b += c[2] * w; };
    add(ix, iz, (1 - tx) * (1 - tz)); add(ix + 1, iz, tx * (1 - tz)); add(ix, iz + 1, (1 - tx) * tz); add(ix + 1, iz + 1, tx * tz);
    const n = fbm(x / 40, z / 40, 2, 7) - 0.5, k = 1 + n * 0.22 + (hash2(Math.floor(x / 6), Math.floor(z / 6), 5) - 0.5) * 0.06;
    out[0] = clamp(r * k, 0, 1); out[1] = clamp(g * k, 0, 1); out[2] = clamp(b * k, 0, 1);
  }
  function surfaceAt(x, z, h = heightAt(x, z)) {
    const nr = nearestRoad(x, z, 8);
    if (nr && nr.d < nr.halfW) return nr.road.cls <= 4 ? SURF.ROAD : nr.road.cls === 8 ? SURF.DIRT : SURF.STREET;
    if (h < -0.7) return SURF.WATER;
    const c = lc(Math.floor(x / meta.cell), Math.floor(z / meta.cell));
    return c === 7 ? SURF.SAND : c === 3 || c === 8 ? SURF.DIRT : c === 2 || c === 6 ? SURF.STREET : SURF.GRASS;
  }

  /* ---------------- hubs (towns/suburbs used as job destinations) ---------------- */
  const rnd = mulberry32(99);
  const cities = meta.hubs.map((h, id) => {
    const snap = snapToRoad(h.x, h.z, 500, 6) || { x: h.x, z: h.z, road: null, s: 0 };
    const drops = [{ x: snap.x, z: snap.z }];
    for (let k = 0; k < 6 && drops.length < 3; k++) { const a = rnd() * 6.283, d = 150 + rnd() * 350, sp = snapToRoad(h.x + Math.cos(a) * d, h.z + Math.sin(a) * d, 120, 5); if (sp && Math.hypot(sp.x - drops[0].x, sp.z - drops[0].z) > 60) drops.push({ x: sp.x, z: sp.z }); }
    let spawn = { x: snap.x, z: snap.z, h: 0 }; if (snap.road) { const p = roadPoint(snap.road, snap.s, 2.6, {}); spawn = { x: p.x, z: p.z, h: p.h }; }
    return { id, name: h.name, te: h.te || '', tier: h.tier, x: h.x, y: 0, z: h.z, R: h.tier === 2 ? 3500 : h.tier === 1 ? 1800 : 900, dropPoints: drops, spawn, heading: spawn.h, angle: 0, fuel: { x: -1e9, z: -1e9 }, plaza: { x: h.x, z: h.z } };
  });
  const cityByName = new Map(cities.map(c => [c.name, c]));
  const nearestCity = (x, z) => { let best = cities[0], bd = 1e18; for (const c of cities) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } } return { city: best, dist: Math.sqrt(bd) }; };
  const cityAt = (x, z, pad = 0) => { for (const c of cities) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.R * 0.5 + pad) ** 2) return c; return null; };
  const stations = meta.stations || [];
  const trafficRoads = roads.filter(r => r.cls <= 4 && r.len > 500);

  const railStations = (meta.rstations || []).map(s => ({ ...s, rail: railNearest(s.x, s.z, 600) }));
  return { meta, WORLD, roads, trafficRoads, terrainHeight, bridgeBarrier, rails, railsInRect, railNearest, railStations, cities, cityByName, stations, landClass: lc, landW: GW, landH: GH, land,
    heightAt, naturalHeight, baseHeight: heightAt, nearestRoad, snapToRoad, roadPoint, roadsInRect, buildingsNear, buildingsInRect, groundColor, surfaceAt,
    nearestCity, cityAt, isStreet: () => false, coastDx: () => 99999, hills: [], rivers: [], coast: [[0, 0], [0, 1]], landmarks: [], buildings: [], BLOCK: 64, STREET_HALF: 3.5 };
}
