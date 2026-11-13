// Parked vehicles you can walk up to and get into: static cars/bikes/buses placed along city roads (same for every player,
// generated from the map) plus vehicles that players have left behind (shared through the server).
import { mulberry32, strHash } from './noise.js';
import { SPECS } from './physics.js';

const PAINT = ['#d9482b', '#f1c40f', '#2e86de', '#27ae60', '#ecf0f1', '#8e44ad', '#e67e22', '#2c3e50', '#c0392b', '#16a085', '#7f8c8d'];
export const ENTER_RANGE = 5.2;          // metres from the vehicle's body to the player
const SHOW_RANGE = 320;

export function insideBuilding(world, x, z, m = 0.6) {
  for (const b of world.buildingsNear(x, z)) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + m && Math.abs(lz) < b.hd + m) return true; }
  return false;
}
/** distance from (x,z) to the oriented footprint of a vehicle at (vx,vz,vh) with spec (0 when inside) */
export function distToVehicle(x, z, vx, vz, vh, spec) {
  const dx = x - vx, dz = z - vz, s = Math.sin(vh), c = Math.cos(vh), lz = dx * s + dz * c, lx = dx * c - dz * s;
  const ex = Math.max(0, Math.abs(lx) - spec.wid / 2), ez = Math.max(0, Math.abs(lz) - spec.len / 2); return Math.hypot(ex, ez);
}

export class ParkedLot {
  constructor(world) { this.w = world; this.statics = new Map(); this.taken = new Set(); this.dyn = new Map(); this.shown = new Set(); this._build(); }
  _build() {
    const w = this.w, rnd = mulberry32(strHash('parked' + w.meta.id)); let n = 0;
    const place = (road, s, side) => {
      const off = side * (road.halfW + 1.7), p = w.roadPoint(road, s, off, {}); if (insideBuilding(w, p.x, p.z, 1.2) || w.heightAt(p.x, p.z) < -0.2) return;
      const r = rnd(), type = r < 0.62 ? 'car' : r < 0.86 ? 'bike' : r < 0.94 ? 'bus' : 'lorry', spec = SPECS[type];
      const ok = !this._clash(p.x, p.z, spec); if (!ok) return;
      const id = 's' + n++; this.statics.set(id, { id, type, color: PAINT[Math.floor(rnd() * PAINT.length)], x: p.x, z: p.z, h: p.h + (side < 0 ? Math.PI : 0) + (rnd() - 0.5) * 0.06, static: true });
    };
    for (const c of w.cities) {
      const base = c.spawn ? w.snapToRoad(c.spawn.x, c.spawn.z, 60, 6) : null; const spots = [];
      if (base) spots.push(base);
      for (const d of c.dropPoints || []) { const sn = w.snapToRoad(d.x, d.z, 60, 6); if (sn) spots.push(sn); }
      let k = 0; for (const sn of spots) { if (k > 5) break; for (const ds of [14, -20]) { place(sn.road, sn.s + ds, rnd() < 0.5 ? -1 : 1); k++; } }
    }
  }
  /** put a handful of parked cars / bikes / a bus on the roads around a spot (story chapters drop you in places with no vehicles) */
  seed(x, z, count = 9) {
    const w = this.w, key = Math.round(x / 40) + '_' + Math.round(z / 40); this.seeded = this.seeded || new Set(); if (this.seeded.has(key)) return; this.seeded.add(key);
    const rnd = mulberry32(strHash('seed' + key)); let placed = 0;
    for (let t = 0; t < 60 && placed < count; t++) {
      const a = rnd() * 6.283, d = 14 + rnd() * 70, sn = w.snapToRoad(x + Math.cos(a) * d, z + Math.sin(a) * d, 40, 6); if (!sn) continue;
      const side = rnd() < 0.5 ? -1 : 1, off = side * (sn.road.halfW + 1.7), p = w.roadPoint(sn.road, sn.s, off, {}); if (insideBuilding(w, p.x, p.z, 1.2) || w.heightAt(p.x, p.z) < -0.2) continue;
      const r = rnd(), type = placed === 0 ? 'car' : placed === 1 ? 'bike' : r < 0.5 ? 'car' : r < 0.85 ? 'bike' : r < 0.93 ? 'bus' : 'lorry', spec = SPECS[type];
      if (this._clash(p.x, p.z, spec) || Math.hypot(p.x - x, p.z - z) < 4) continue;
      const id = 'k' + key + '_' + placed; this.statics.set(id, { id, type, color: PAINT[Math.floor(rnd() * PAINT.length)], x: p.x, z: p.z, h: p.h + (side < 0 ? Math.PI : 0), static: true }); placed++;
    }
  }
  _clash(x, z, spec) { for (const e of this.statics.values()) if (Math.hypot(e.x - x, e.z - z) < (SPECS[e.type].len + spec.len) * 0.5 + 0.6) return true; return false; }
  *all() { for (const e of this.statics.values()) if (!this.taken.has(e.id)) yield e; for (const e of this.dyn.values()) yield e; }
  get(id) { return this.dyn.get(id) || (this.taken.has(id) ? null : this.statics.get(id)) || null; }
  /** nearest enterable vehicle within range of a standing person */
  nearest(x, z, range = ENTER_RANGE, skipId = null) {
    let best = null, bd = range;
    for (const e of this.all()) { if (e.id === skipId) continue; if (Math.abs(e.x - x) > 25 || Math.abs(e.z - z) > 25) continue; const d = distToVehicle(x, z, e.x, e.z, e.h, SPECS[e.type]); if (d < bd) { bd = d; best = e; } }
    return best ? { e: best, d: bd } : null;
  }
  /** push a standing person out of every parked vehicle body (returns true if moved). pos = {x,z} is modified */
  pushOut(pos, radius = 0.4) {
    let moved = false;
    for (const e of this.all()) {
      if (Math.abs(e.x - pos.x) > 14 || Math.abs(e.z - pos.z) > 14) continue; const sp = SPECS[e.type];
      const dx = pos.x - e.x, dz = pos.z - e.z, s = Math.sin(e.h), c = Math.cos(e.h), lz = dx * s + dz * c, lx = dx * c - dz * s, ex = sp.wid / 2 + radius - Math.abs(lx), ez = sp.len / 2 + radius - Math.abs(lz);
      if (ex > 0 && ez > 0) { let px = 0, pz = 0; if (ex < ez) px = Math.sign(lx || 1) * ex; else pz = Math.sign(lz || 1) * ez; pos.x += px * c + pz * s; pos.z += -px * s + pz * c; moved = true; }
    }
    return moved;
  }
  blocks(x, z, margin = 0.5, ignoreId = null) { for (const e of this.all()) { if (e.id === ignoreId) continue; if (distToVehicle(x, z, e.x, e.z, e.h, SPECS[e.type]) < margin) return true; } return false; }
  /** draw nearby entries (scene model per entry) and drop the far ones */
  render(scene, fx, fz, hide = null) {
    const live = new Set();
    for (const e of this.all()) {
      if (e.id === hide) continue; if (Math.abs(e.x - fx) > SHOW_RANGE || Math.abs(e.z - fz) > SHOW_RANGE) continue;
      const key = 'pk_' + e.id, m = scene.model(key, e.type, e.color); live.add(key);
      scene.placeModel(m, { x: e.x, z: e.z, y: this.w.heightAt(e.x, e.z), h: e.h, pitch: 0, roll: 0, steer: 0, brake: e.lit || 0, lights: e.lit || 0 });
    }
    for (const k of [...this.shown]) if (!live.has(k)) scene.removeModel(k);
    this.shown = live;
  }
}
