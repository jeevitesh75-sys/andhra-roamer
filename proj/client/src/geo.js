// World generator: pure maths, no three.js. Every client builds the identical world from data.js.
import { CITIES, ROADS, RIVERS, COAST, HILLS, LANDMARKS } from './data.js';
import { fbm, mulberry32, smooth, lerp, clamp, strHash, hash2 } from './noise.js';

export const SCALE = 25;                         // real metres per game metre
const LAT_MAX = 19.95, LON_MIN = 76.6;
const KX = (111320 * Math.cos((16.2 * Math.PI) / 180)) / SCALE; // game units per degree of longitude
const KZ = 111190 / SCALE;                                       // game units per degree of latitude
export const project = (lat, lon) => [(lon - LON_MIN) * KX, (LAT_MAX - lat) * KZ]; // x east, z south
export const WORLD = { w: (85.0 - LON_MIN) * KX, h: (19.95 - 12.55) * KZ };

export const SURF = { ROAD: 0, STREET: 1, GRASS: 2, DIRT: 3, SAND: 4, WATER: 5 };
const ROAD_HALF = { nh: 7.5, sh: 6, ghat: 5.5 };
const STEP = 8;            // road sample spacing (m)
const CELL = 128;          // spatial grid cell (m)
const BLOCK = 72, STREET_HALF = 4.5;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cellKey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

/* ----------------------------- splines & resampling ----------------------------- */
function catmull(p0, p1, p2, p3, t) {
  const t1 = Math.max(Math.sqrt(dist(p0, p1)), 1e-3), t2 = t1 + Math.max(Math.sqrt(dist(p1, p2)), 1e-3);
  const t3 = t2 + Math.max(Math.sqrt(dist(p2, p3)), 1e-3);
  const tt = t1 + (t2 - t1) * t;
  const out = [0, 0];
  for (let k = 0; k < 2; k++) {
    const a1 = ((t1 - tt) / t1) * p0[k] + (tt / t1) * p1[k];
    const a2 = ((t2 - tt) / (t2 - t1)) * p1[k] + ((tt - t1) / (t2 - t1)) * p2[k];
    const a3 = ((t3 - tt) / (t3 - t2)) * p2[k] + ((tt - t2) / (t3 - t2)) * p3[k];
    const b1 = ((t2 - tt) / t2) * a1 + (tt / t2) * a2;
    const b2 = ((t3 - tt) / (t3 - t1)) * a2 + ((tt - t1) / (t3 - t1)) * a3;
    out[k] = ((t2 - tt) / (t2 - t1)) * b1 + ((tt - t1) / (t2 - t1)) * b2;
  }
  return out;
}

/** Smooth curve through pts, resampled every `step` metres. Returns {pts:[[x,z]], nodeS:[arc length at each input point]} */
function splineResample(pts, step) {
  const n = pts.length;
  const ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]]];
  const dense = [], nodeIdx = [0];
  for (let i = 0; i < n - 1; i++) {
    const m = Math.max(4, Math.ceil(dist(pts[i], pts[i + 1]) / 3));
    for (let k = 0; k < m; k++) dense.push(catmull(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], k / m));
    nodeIdx.push(dense.length);
  }
  dense.push(pts[n - 1].slice());
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dist(dense[i - 1], dense[i]));
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  const count = Math.max(2, Math.round(total / step));
  for (let k = 0; k <= count; k++) {
    const s = (k / count) * total;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push([lerp(dense[j][0], dense[j + 1][0], f), lerp(dense[j][1], dense[j + 1][1], f)]);
  }
  const nodeS = nodeIdx.map(i => cum[Math.min(i, cum.length - 1)]);
  return { pts: out, nodeS, total };
}

/* ----------------------------------- world ----------------------------------- */
export function createWorld() {
  const coast = COAST.map(([la, lo]) => project(la, lo));
  const coastX = z => {
    if (z <= coast[0][1]) return coast[0][0];
    for (let i = 0; i < coast.length - 1; i++) {
      if (z <= coast[i + 1][1]) return lerp(coast[i][0], coast[i + 1][0], (z - coast[i][1]) / (coast[i + 1][1] - coast[i][1]));
    }
    return coast[coast.length - 1][0];
  };
  /** metres inland of the coast (negative = at sea) */
  const coastDx = (x, z) => coastX(z) - x;

  const hills = HILLS.map(h => { const [x, z] = project(h.lat, h.lon); return { x, z, r2: h.r * h.r, lim: 9 * h.r * h.r, h: h.h, coastal: !!h.coastal }; });

  const cities = CITIES.map((c, id) => {
    const [x, z] = project(c.lat, c.lon);
    return { id, name: c.name, te: c.te, tier: c.tier, R: c.R, x, z, y: 0, angle: 0, S: BLOCK, buildings: [], dropPoints: [],
      plaza: { x, z }, fuel: { x, z }, flat: c.R * 0.85, edge: c.R * 1.5 };
  });
  const cityByName = new Map(cities.map(c => [c.name, c]));

  /* ----- terrain ----- */
  function naturalHeight(x, z) {
    const dx = coastDx(x, z);
    let h;
    if (dx < 0) h = Math.max(-40, dx * 0.06) - 0.3;
    else {
      const inland = smooth(3000, 14000, dx);
      const amp = 2.5 + 11 * inland;
      const n1 = fbm(x / 1400, z / 1400, 4, 11) - 0.5;
      const n2 = fbm(x / 210, z / 210, 3, 23) - 0.5;
      h = 0.6 + Math.min(dx, 60) * 0.018 + 46 * inland + n1 * 2 * amp + n2 * 2.2;
      h = lerp(0.35 + dx * 0.004, h, smooth(0, 120, dx));
    }
    const land = smooth(-150, 150, dx), inlandHill = smooth(300, 2500, dx);
    for (let i = 0; i < hills.length; i++) {
      const hl = hills[i];
      const ex = x - hl.x, ez = z - hl.z, d2 = ex * ex + ez * ez;
      if (d2 < hl.lim) h += hl.h * Math.exp(-d2 / hl.r2) * (hl.coastal ? land : inlandHill);
    }
    return h;
  }
  for (const c of cities) c.y = Math.max(naturalHeight(c.x, c.z), 2.2);

  // rivers (built later, referenced by baseHeight through closure)
  const rivers = [];
  const riverCells = new Map();

  function cityFlatten(x, z, h, dx) {
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      const ex = x - c.x, ez = z - c.z, d2 = ex * ex + ez * ez;
      if (d2 < c.edge * c.edge) {
        const t = 1 - smooth(c.flat, c.edge, Math.sqrt(d2));
        h = lerp(h, c.y, t * smooth(-120, 60, dx));
      }
    }
    return h;
  }

  function riverCarve(x, z, h) {
    const arr = riverCells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return h;
    let bd = 1e18, bw = 0;
    for (let k = 0; k < arr.length; k++) {
      const s = arr[k];
      const abx = s.bx - s.ax, abz = s.bz - s.az;
      let t = ((x - s.ax) * abx + (z - s.az) * abz) / (abx * abx + abz * abz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (s.ax + abx * t), dz = z - (s.az + abz * t), d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; bw = s.w; }
    }
    const d = Math.sqrt(bd);
    if (d > bw * 1.7) return h;
    const t = 1 - smooth(bw * 0.55, bw * 1.7, d);
    const bed = -2.2;
    return h > bed ? lerp(h, bed, t) : h;
  }

  function baseHeight(x, z, withRiver = true) {
    const dx = coastDx(x, z);
    let h = cityFlatten(x, z, naturalHeight(x, z), dx);
    if (withRiver && dx > -50) h = riverCarve(x, z, h);
    return h;
  }

  /* ----- roads ----- */
  const roads = [];
  const roadCells = new Map();
  const segRoad = [], segIdx = [];
  const NR = { d: 1e9, y: 0, road: null, i: 0, t: 0, halfW: 0 };

  function nearestRoad(x, z) {
    const arr = roadCells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return null;
    let bd = 1e18, bs = -1, bt = 0;
    for (let k = 0; k < arr.length; k++) {
      const sid = arr[k], p = segRoad[sid].pts, i = segIdx[sid] * 2;
      const ax = p[i], az = p[i + 1], abx = p[i + 2] - ax, abz = p[i + 3] - az;
      let t = ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - (ax + abx * t), ez = z - (az + abz * t), d2 = ex * ex + ez * ez;
      if (d2 < bd) { bd = d2; bs = sid; bt = t; }
    }
    if (bs < 0) return null;
    const r = segRoad[bs], i = segIdx[bs];
    NR.d = Math.sqrt(bd); NR.road = r; NR.i = i; NR.t = bt; NR.halfW = r.halfW;
    NR.y = lerp(r.y[i], r.y[i + 1], bt);
    return NR;
  }

  function buildRoad(def, id) {
    const wp = def.via.map(v => {
      if (typeof v === 'string') { const c = cityByName.get(v); if (!c) throw new Error('Unknown city ' + v); return [c.x, c.z]; }
      return project(v[0], v[1]);
    });
    const { pts, nodeS, total } = splineResample(wp, STEP);
    const rnd = strHash(def.ref + id);
    const ghat = def.kind === 'ghat';
    const nodeCityS = def.via.map((v, i) => (typeof v === 'string' ? nodeS[i] : null)).filter(v => v !== null);
    const taperAt = s => {
      let f = smooth(0, 450, s) * smooth(0, 450, total - s);
      for (const ns of nodeCityS) f *= smooth(0, 450, Math.abs(s - ns));
      return f;
    };
    // lateral meander (highway curvature) or serpentine hairpins (ghat)
    const n = pts.length, P = new Float64Array(n * 2);
    let sAcc = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (i > 0) sAcc += dist(pts[i - 1], pts[i]);
      let off;
      if (ghat) off = 38 * Math.sin((2 * Math.PI * sAcc) / 210);
      else off = (fbm(sAcc / 1300, rnd % 997, 3, rnd) - 0.5) * 2 * (def.kind === 'nh' ? 75 : 55) + (fbm(sAcc / 260, rnd % 331, 2, rnd + 5) - 0.5) * 26;
      off *= taperAt(sAcc);
      P[2 * i] = pts[i][0] - tz * off; P[2 * i + 1] = pts[i][1] + tx * off;
    }
    // heights: smoothed natural terrain (without river), capped grade, never below sea level
    const y = new Float64Array(n), raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = baseHeight(P[2 * i], P[2 * i + 1], false);
    const W = ghat ? 4 : 10;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { s += raw[k]; c++; }
      y[i] = Math.max(1.2, s / c);
    }
    const g = (ghat ? 0.10 : 0.07) * STEP;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - g, y[i - 1] + g);
      for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - g, y[i + 1] + g);
    }
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
    // anchor the road to the flat ground of every city it passes through (smooth tent blend)
    def.via.forEach((v, vi) => {
      if (typeof v !== 'string') return;
      const city = cityByName.get(v);
      let k = 0; while (k < n - 1 && cum[k] < nodeS[vi]) k++;
      const delta = city.y - y[k];
      if (Math.abs(delta) < 0.2) return;
      const kk = Math.ceil(Math.max(60, Math.abs(delta) / 0.05) / STEP);
      for (let i = Math.max(0, k - kk); i <= Math.min(n - 1, k + kk); i++) { const f = 1 - Math.abs(i - k) / kk; y[i] += delta * f * f * (3 - 2 * f); }
    });
    const road = { id, ref: def.ref, kind: def.kind, halfW: ROAD_HALF[def.kind], pts: P, y, n, cum, len: cum[n - 1],
      nodes: def.via.map((v, i) => (typeof v === 'string' ? { city: cityByName.get(v), s: nodeS[i] } : null)).filter(Boolean) };
    roads.push(road);
    const margin = road.halfW + 24;
    for (let i = 0; i < n - 1; i++) {
      const sid = segRoad.length; segRoad.push(road); segIdx.push(i);
      const x0 = Math.min(P[2 * i], P[2 * i + 2]) - margin, x1 = Math.max(P[2 * i], P[2 * i + 2]) + margin;
      const z0 = Math.min(P[2 * i + 1], P[2 * i + 3]) - margin, z1 = Math.max(P[2 * i + 1], P[2 * i + 3]) + margin;
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          const k = cellKey(cx, cz); let a = roadCells.get(k); if (!a) roadCells.set(k, (a = [])); a.push(sid);
        }
      }
    }
  }

  // rivers first (carve is part of baseHeight; roads sample baseHeight WITHOUT the river)
  RIVERS.forEach((rv, id) => {
    const { pts } = splineResample(rv.via.map(v => project(v[0], v[1])), 20);
    const r = { id, name: rv.name, w: rv.w, pts };
    rivers.push(r);
    for (let i = 0; i < pts.length - 1; i++) {
      const taper = Math.min(1, 0.35 + 0.65 * Math.min(i, pts.length - 2 - i) / 6);
      const seg = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], w: rv.w * (i === 0 ? 0.5 : 1) * Math.max(taper, 0.5) };
      const m = seg.w * 1.7 + 20;
      for (let cx = Math.floor((Math.min(seg.ax, seg.bx) - m) / CELL); cx <= Math.floor((Math.max(seg.ax, seg.bx) + m) / CELL); cx++) {
        for (let cz = Math.floor((Math.min(seg.az, seg.bz) - m) / CELL); cz <= Math.floor((Math.max(seg.az, seg.bz) + m) / CELL); cz++) {
          const k = cellKey(cx, cz); let a = riverCells.get(k); if (!a) riverCells.set(k, (a = [])); a.push(seg);
        }
      }
    }
  });
  ROADS.forEach((def, i) => buildRoad(def, i));

  function heightAt(x, z) {
    let h = baseHeight(x, z, true);
    const r = nearestRoad(x, z);
    if (r && r.d < r.halfW + 18) h = lerp(h, r.y, 1 - smooth(r.halfW + 2, r.halfW + 18, r.d));
    return h;
  }

  /* ----- cities: grid streets aligned with the first highway, buildings, fuel station ----- */
  const buildingCells = new Map();
  const allBuildings = [];
  const PALETTE = [[0.93, 0.90, 0.82], [0.95, 0.83, 0.52], [0.90, 0.62, 0.55], [0.62, 0.78, 0.86], [0.76, 0.86, 0.66],
    [0.88, 0.75, 0.62], [0.82, 0.82, 0.84], [0.96, 0.92, 0.70], [0.78, 0.60, 0.50], [0.70, 0.72, 0.88]];

  for (const c of cities) {
    // align the street grid with the first road that touches this city
    for (const r of roads) {
      const nd = r.nodes.find(n => n.city === c);
      if (!nd) continue;
      let k = 0; while (k < r.n - 1 && r.cum[k] < nd.s) k++;
      const a = Math.max(0, k - 6), b = Math.min(r.n - 1, k + 6);
      c.angle = Math.atan2(r.pts[2 * b + 1] - r.pts[2 * a + 1], r.pts[2 * b] - r.pts[2 * a]);
      break;
    }
    const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
    c.toWorld = (lx, lz) => [c.x + lx * ca - lz * sa, c.z + lx * sa + lz * ca];
    c.toLocal = (x, z) => { const dx = x - c.x, dz = z - c.z; return [dx * ca + dz * sa, -dx * sa + dz * ca]; };
    const rnd = mulberry32(strHash(c.name));
    const K = Math.floor(c.R / BLOCK);
    c.K = K;
    c.plaza = (() => { const [x, z] = c.toWorld(BLOCK / 2, BLOCK / 2); return { x, z }; })();
    c.fuel = { x: c.plaza.x, z: c.plaza.z };
    for (let i = -K; i < K; i++) {
      for (let j = -K; j < K; j++) {
        const lcx = i * BLOCK + BLOCK / 2, lcz = j * BLOCK + BLOCK / 2;
        const distC = Math.hypot(lcx, lcz);
        if (distC > c.R * 0.98) continue;
        if (i === 0 && j === 0) continue; // plaza block
        const inner = BLOCK - STREET_HALF * 2 - 4;
        const t = 1 - distC / c.R;
        const split = rnd() < (c.tier >= 2 ? 0.55 : 0.8) ? 2 : 1;
        const lot = inner / split;
        for (let a = 0; a < split; a++) {
          for (let b = 0; b < split; b++) {
            if (rnd() < 0.10) continue; // empty plot
            const lx = lcx - inner / 2 + lot * (a + 0.5), lz = lcz - inner / 2 + lot * (b + 0.5);
            const inset = 1 + rnd() * 3;
            const hw = lot / 2 - inset, hd = lot / 2 - inset - rnd() * 2;
            const [wx, wz] = c.toWorld(lx, lz);
            const nr = nearestRoad(wx, wz);
            if (nr && nr.d < nr.halfW + 5 + Math.max(hw, hd) * 1.42) continue;
            const dxc = coastDx(wx, wz);
            if (dxc < 60) continue;
            if (riverCarve(wx, wz, 5) < 4.9) continue;
            if (Math.abs(baseHeight(wx, wz, false) - c.y) > 2.5) continue; // only build on flat ground
            let floors;
            if (c.tier >= 3 && t > 0.62 && rnd() < 0.5) floors = 11 + rnd() * 20;
            else if (c.tier >= 2 && t > 0.55 && rnd() < 0.35) floors = 8 + rnd() * 8;
            else if (t > 0.45) floors = 4 + rnd() * 6;
            else floors = 2 + rnd() * 4;
            if (c.tier === 0) floors = Math.min(floors, 5);
            const bld = { x: wx, z: wz, hw, hd, rot: c.angle, c: Math.cos(c.angle), s: Math.sin(c.angle), h: Math.round(floors) * 3.2 + 0.4, y: c.y,
              color: PALETTE[Math.floor(rnd() * PALETTE.length)], tank: rnd() < 0.35, city: c.id };
            c.buildings.push(bld);
            allBuildings.push(bld);
            const rad = Math.hypot(hw, hd) + 2;
            for (let cx = Math.floor((wx - rad) / 64); cx <= Math.floor((wx + rad) / 64); cx++) {
              for (let cz = Math.floor((wz - rad) / 64); cz <= Math.floor((wz + rad) / 64); cz++) {
                const k = cellKey(cx, cz); let arr = buildingCells.get(k); if (!arr) buildingCells.set(k, (arr = [])); arr.push(bld);
              }
            }
          }
        }
      }
    }
    // drop points = street intersections not too far from the centre
    for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) {
      if (Math.hypot(i, j) * BLOCK > c.R * 0.62 || (i === 0 && j === 0)) continue;
      const [wx, wz] = c.toWorld(i * BLOCK, j * BLOCK);
      if (coastDx(wx, wz) < 80) continue;
      c.dropPoints.push({ x: wx, z: wz });
    }
    if (!c.dropPoints.length) c.dropPoints.push({ x: c.x, z: c.z });
  }

  const landmarks = LANDMARKS.map(l => {
    if (l.city) { const c = cityByName.get(l.city); const [x, z] = c.toWorld(BLOCK / 2 + l.dx, BLOCK / 2 + l.dz); return { ...l, x, z }; }
    const [x, z] = project(l.lat, l.lon); return { ...l, x, z };
  });

  function buildingsNear(x, z) { return buildingCells.get(cellKey(Math.floor(x / 64), Math.floor(z / 64))) || EMPTY; }
  const EMPTY = [];

  function cityAt(x, z, pad = 0) {
    let best = null, bd = 1e18;
    for (const c of cities) {
      const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
      if (d2 < (c.R + pad) ** 2 && d2 < bd) { bd = d2; best = c; }
    }
    return best;
  }
  function nearestCity(x, z) {
    let best = null, bd = 1e18;
    for (const c of cities) { const d2 = (x - c.x) ** 2 + (z - c.z) ** 2; if (d2 < bd) { bd = d2; best = c; } }
    return { city: best, dist: Math.sqrt(bd) };
  }
  function isStreet(c, x, z) {
    const [lx, lz] = c.toLocal(x, z);
    if (lx * lx + lz * lz > c.R * c.R * 0.96) return false;
    const mx = Math.abs(((lx + BLOCK / 2) % BLOCK + BLOCK) % BLOCK - BLOCK / 2);
    const mz = Math.abs(((lz + BLOCK / 2) % BLOCK + BLOCK) % BLOCK - BLOCK / 2);
    return mx < STREET_HALF || mz < STREET_HALF;
  }

  /** ground type under (x,z) for the physics model */
  function surfaceAt(x, z, h = heightAt(x, z)) {
    if (h < -0.4) return SURF.WATER;
    const nr = nearestRoad(x, z);
    if (nr && nr.d < nr.halfW) return SURF.ROAD;
    const c = cityAt(x, z);
    if (c && isStreet(c, x, z)) return SURF.STREET;
    const dx = coastDx(x, z);
    if (dx < 70 && h < 2.6) return SURF.SAND;
    return fbm(x / 500, z / 500, 2, 91) + 0.35 * smooth(4000, 9000, dx) > 0.75 ? SURF.DIRT : SURF.GRASS;
  }

  /** colour of the ground for terrain vertices */
  function groundColor(x, z, h, slope, out) {
    const dx = coastDx(x, z);
    const dry = smooth(3500, 9500, dx) * 0.75 + (fbm(x / 2200, z / 2200, 2, 7) - 0.5) * 0.5;
    const forest = clamp((h - 22) / 40, 0, 1) * (z < 7600 || (x > 9000 && x < 14500 && z > 8200 && z < 13500) ? 1 : 0.55);
    // field patchwork
    const fx = Math.floor((x * 0.9 + z * 0.4) / 95), fz = Math.floor((z * 0.9 - x * 0.4) / 80);
    const fv = hash2(fx, fz, 5);
    let r, g, b;
    if (dry > 0.42) { // Rayalaseema: dry scrub, red soil, rocky
      r = 0.66 + fv * 0.08; g = 0.56 + fv * 0.06; b = 0.34;
      if (fv > 0.7) { r = 0.62; g = 0.36; b = 0.24; }
    } else { // delta / coastal plains: paddy and crops
      r = 0.32 + fv * 0.26; g = 0.55 + fv * 0.16; b = 0.20 + fv * 0.06;
      if (fv < 0.18) { r = 0.55; g = 0.65; b = 0.28; }
    }
    r = lerp(r, 0.14, forest); g = lerp(g, 0.34, forest); b = lerp(b, 0.15, forest);
    const rock = smooth(0.30, 0.6, slope);
    r = lerp(r, 0.47, rock); g = lerp(g, 0.42, rock); b = lerp(b, 0.37, rock);
    const sand = 1 - smooth(10, 110, dx);
    r = lerp(r, 0.88, sand); g = lerp(g, 0.80, sand); b = lerp(b, 0.60, sand);
    if (h < 0) { const w = clamp(-h / 3, 0, 1); r = lerp(r, 0.55, w); g = lerp(g, 0.52, w); b = lerp(b, 0.40, w); }
    const nr = nearestRoad(x, z);
    if (nr) { const t = 1 - smooth(nr.halfW, nr.halfW + 5, nr.d); r = lerp(r, 0.55, t); g = lerp(g, 0.50, t); b = lerp(b, 0.42, t); }
    const c = cityAt(x, z, 60);
    if (c) { const t = 1 - smooth(c.R * 0.8, c.R + 60, Math.hypot(x - c.x, z - c.z)); r = lerp(r, 0.58, t * 0.9); g = lerp(g, 0.55, t * 0.9); b = lerp(b, 0.50, t * 0.9); }
    const n = (fbm(x / 9, z / 9, 2, 3) - 0.5) * 0.08;
    out[0] = clamp(r + n, 0, 1); out[1] = clamp(g + n, 0, 1); out[2] = clamp(b + n, 0, 1);
  }

  /** point on road at arc length s, with unit heading; lane offset >0 = left side of travel direction */
  function roadPoint(road, s, lane = 0, out = {}) {
    const L = road.len; s = clamp(s, 0, L);
    let lo = 0, hi = road.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (road.cum[m] <= s) lo = m; else hi = m; }
    const f = (s - road.cum[lo]) / Math.max(1e-6, road.cum[hi] - road.cum[lo]);
    const p = road.pts;
    let tx = p[2 * hi] - p[2 * lo], tz = p[2 * hi + 1] - p[2 * lo + 1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // left of heading (tx,tz) in our convention left = (cosθ,-sinθ) with f=(sinθ,cosθ) => left = (tz, -tx)
    out.x = lerp(p[2 * lo], p[2 * hi], f) + tz * lane; out.z = lerp(p[2 * lo + 1], p[2 * hi + 1], f) - tx * lane;
    out.y = lerp(road.y[lo], road.y[hi], f); out.h = Math.atan2(tx, tz);
    return out;
  }

  return { cities, cityByName, roads, rivers, hills, landmarks, buildings: allBuildings, coastDx, coast, naturalHeight, baseHeight, heightAt,
    nearestRoad, surfaceAt, groundColor, buildingsNear, cityAt, nearestCity, isStreet, roadPoint, BLOCK, STREET_HALF, WORLD };
}
