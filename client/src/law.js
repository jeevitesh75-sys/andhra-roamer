// Law & order: police stations on the map, patrol cars + motorcycles that roam, officers that walk / investigate / chase on foot,
// checkpoints, radio chatter and the arrest -> jail loop. Pure logic (no three.js): main.js draws what this produces.
// The car chase itself (wanted stars, pursuit cars, SWAT, roadblocks) stays in peds.js `Police`; this module adds everything else.
import { mulberry32, strHash, clamp } from './noise.js';
import { insideBuilding } from './parked.js';

export const STATION = { hw: 9, hd: 6.2 };
const NAMES = ['Sub-Inspector Ravi', 'Constable Lakshmi', 'Head Constable Naidu', 'Constable Prasad', 'Inspector Reddy', 'Constable Anand', 'Constable Sujata', 'Sub-Inspector Murthy'];
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Law {
  constructor(world) {
    this.w = world; this.stations = []; this.extra = new Map(); this.merged = new Map(); this.officers = []; this.roamers = []; this.checkpoints = []; this.t = 0; this.nid = 1;
    this.rnd = mulberry32(strHash('law' + world.meta.id)); this.radioLog = []; this.arrest = null; this.cool = { speed: 0, spot: 0, hit: 0 };
    this._place(); this._hook();
  }

  /* ---------------------------------------------------------------- stations */
  _boxFree(x, z, c, s, hw, hd, m = 2.5) {
    const w = this.w;
    for (const [ax, az] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = ax * (hw + m), lz = az * (hd + m), px = x + lx * c - lz * s, pz = z + lx * s + lz * c;
      if (insideBuilding(w, px, pz, 0.8) || w.heightAt(px, pz) < -0.2) return false;
    }
    for (const q of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) { const px = x + q[0] * hw * 2 * c - q[1] * hd * 2 * s, pz = z + q[0] * hw * 2 * s + q[1] * hd * 2 * c; if (insideBuilding(w, px, pz, 0.4)) return false; }
    return true;
  }
  _siteNear(cx, cz, radius = 300) {
    const w = this.w, sn = w.snapToRoad(cx, cz, radius, 5); if (!sn) return null;
    for (const ds of [0, 35, -35, 70, -70, 110, -110, 160, -160, 220, -220]) for (const side of [1, -1]) {
      const r = sn.road, s = clamp(sn.s + ds, 6, r.len - 6), dist = r.halfW + 11, p = w.roadPoint(r, s, side * dist, {}), q = w.roadPoint(r, s, 0, {});
      const th = Math.atan2(-side * Math.cos(p.h), side * Math.sin(p.h)), c = Math.cos(th), sI = -Math.sin(th);
      if (w.nearestRoad(p.x, p.z) && w.nearestRoad(p.x, p.z).d < r.halfW + 8) continue;
      if (!this._boxFree(p.x, p.z, c, sI, STATION.hw, STATION.hd)) continue;
      const doorX = p.x + Math.sin(th) * (STATION.hd + 3.2), doorZ = p.z + Math.cos(th) * (STATION.hd + 3.2);
      return { x: p.x, z: p.z, th, c, s: sI, door: { x: doorX, z: doorZ }, road: r, rs: s, side, ref: r.ref || '' , roadPt: { x: q.x, z: q.z, h: q.h } };
    }
    return null;
  }
  _place() {
    let id = 0; const cities = [...this.w.cities].sort((a, b) => b.tier - a.tier);
    for (const c of cities) {
      if (c.tier < 1 && this.stations.length >= 14) continue;
      const site = this._siteNear(c.x, c.z); if (!site) continue;
      if (this.stations.some(st => Math.hypot(st.x - site.x, st.z - site.z) < 500)) continue;
      this.stations.push({ id: id++, name: c.name + ' Police Station', city: c.name, ...site });
    }
    // a station beside every start spawn so each region has one near the beginning
    for (const c of this.w.cities) { if (!c.spawn || c.tier < 1) continue; if (this.stations.some(st => Math.hypot(st.x - c.spawn.x, st.z - c.spawn.z) < 900)) continue; const site = this._siteNear(c.spawn.x, c.spawn.z, 200); if (site) this.stations.push({ id: id++, name: c.name + ' Outpost', city: c.name, ...site }); }
  }
  _hook() {
    const w = this.w, orig = w.buildingsNear, G = 32; if (!orig || w.__lawHooked) return; w.__lawHooked = true;
    for (const st of this.stations) {
      st.box = { i: -1000 - st.id, x: st.x, z: st.z, hw: STATION.hw, hd: STATION.hd, c: st.c, s: st.s, h: 4, cls: 9, y: 0, station: true };
      const r = Math.hypot(STATION.hw, STATION.hd) + 2;
      for (let gx = Math.floor((st.x - r) / G); gx <= Math.floor((st.x + r) / G); gx++) for (let gz = Math.floor((st.z - r) / G); gz <= Math.floor((st.z + r) / G); gz++) { const k = gx + ',' + gz; (this.extra.get(k) || this.extra.set(k, []).get(k)).push(st.box); }
    }
    w.buildingsNear = (x, z) => {
      const base = orig(x, z); if (!this.extra.size) return base; const k = Math.floor(x / G) + ',' + Math.floor(z / G), ex = this.extra.get(k); if (!ex) return base;
      let m = this.merged.get(k); if (!m || m.base !== base) { m = { base, arr: base.concat(ex) }; this.merged.set(k, m); } return m.arr;
    };
  }
  nearestStation(x, z) { let best = null, bd = 1e18; for (const st of this.stations) { const d = (st.x - x) ** 2 + (st.z - z) ** 2; if (d < bd) { bd = d; best = st; } } return best ? { st: best, dist: Math.sqrt(bd) } : null; }
  stationNamed(city) { return this.stations.find(s => s.city === city) || this.stations[0] || null; }

  /* ---------------------------------------------------------------- radio */
  heading(from, to) { const a = Math.atan2(to.x - from.x, to.z - from.z), d = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']; return d[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
  radio(text) { const line = { t: this.t, text }; this.radioLog.push(line); if (this.radioLog.length > 30) this.radioLog.shift(); this.lastRadio = line; return text; }
  radioFor(kind, p = {}) {
    const w = this.w, near = p.x !== undefined ? w.nearestCity(p.x, p.z) : null, where = near ? (near.dist < near.city.R ? near.city.name : `${Math.round(near.dist / 100) / 10} km from ${near.city.name}`) : 'the area';
    const unit = 'Unit ' + (1 + Math.floor(this.rnd() * 18)), hd = p.from ? this.heading(p.from, p) : 'north';
    const L = {
      crime: [`All units, ${unit} responding. Reported shooting near ${where}.`, `Control to all units, disturbance at ${where}. Suspect armed.`],
      spotted: [`${unit}: suspect vehicle sighted, ${p.veh || 'vehicle'} heading ${hd} near ${where}. Pursuing!`, `${unit}: I have visual on the suspect, ${where}. Requesting backup.`],
      onfoot: [`${unit}: suspect on foot near ${where}. Cordon the area.`, `All units, suspect fled on foot ${hd} of ${where}.`],
      backup: [`Control: additional units dispatched to ${where}. Use caution, suspects are armed.`, `All units, ${p.stars} star alert. Roadblocks authorised around ${where}.`],
      swat: [`Control: SWAT team deployed, ${where}. Repeat, SWAT is rolling.`],
      down: [`Officer down! Officer down near ${where}! All units respond!`],
      lost: [`${unit}: suspect lost. Resume patrol.`, `Control: stand down, suspect no longer in sight.`],
      arrest: [`${unit}: suspect in custody. Transporting to ${p.station || 'the station'}.`],
      checkpoint: [`All units, checkpoint established at ${where}. Stop and search every vehicle.`],
      investigate: [`${unit}: investigating at ${where}. Witnesses report four suspects.`, `Control: SP Varma wants every unit on the Four. Check ${where}.`],
    }[kind] || ['Control: all units, stand by.'];
    return this.radio(L[Math.floor(this.rnd() * L.length)]);
  }

  /* ---------------------------------------------------------------- foot officers */
  _blocked(x, z) { for (const b of this.w.buildingsNear(x, z)) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + 0.5 && Math.abs(lz) < b.hd + 0.5) return true; } return this.w.heightAt(x, z) < -0.5; }
  addOfficer(x, z, o = {}) {
    const e = { id: this.nid++, x, z, h: o.h || 0, hp: o.hp || 60, state: o.state || 'patrol', phase: this.rnd() * 6, moving: 0, name: NAMES[Math.floor(this.rnd() * NAMES.length)], home: { x, z }, tgt: null, wait: this.rnd() * 3, swat: !!o.swat, kind: o.kind || 'foot', born: this.t,
      fireCd: 1 + this.rnd() * 1.5, dead: 0, st: o.st || null, stuck: 0, hit: 0 };
    this.officers.push(e); return e;
  }
  /** officers standing and walking around each nearby station (they "investigate" the area) */
  ensureStationStaff(fx, fz) {
    for (const st of this.stations) {
      const near = Math.hypot(st.x - fx, st.z - fz) < 260; st.staffed = st.staffed || false;
      if (near && !st.staffed) { st.staffed = true; for (let i = 0; i < 3; i++) { const a = this.rnd() * 6.283, d = 5 + this.rnd() * 9, x = st.door.x + Math.cos(a) * d, z = st.door.z + Math.sin(a) * d; if (!this._blocked(x, z)) this.addOfficer(x, z, { state: 'patrol', st: st.id }); } }
      else if (!near && st.staffed && Math.hypot(st.x - fx, st.z - fz) > 420) { st.staffed = false; this.officers = this.officers.filter(o => o.st !== st.id); }
    }
  }
  /** dispatch chasing officers from the nearest station door */
  dispatch(player, n, swat = false) {
    const ns = this.nearestStation(player.x, player.z); if (!ns || ns.dist > 1400) return 0; const st = ns.st; let made = 0;
    for (let i = 0; i < n; i++) { const a = this.rnd() * 6.283, d = 3 + this.rnd() * 4, x = st.door.x + Math.cos(a) * d, z = st.door.z + Math.sin(a) * d; if (this._blocked(x, z)) continue; this.addOfficer(x, z, { state: 'chase', swat, hp: swat ? 120 : 60 }); made++; }
    return made;
  }
  /** spawn chasers close to the player (wanted >= 2 while on foot) on nearby roads */
  nearSpawn(player, n, swat = false) {
    let made = 0; for (let k = 0; k < n * 4 && made < n; k++) { const a = this.rnd() * 6.283, d = 55 + this.rnd() * 40, sn = this.w.snapToRoad(player.x + Math.cos(a) * d, player.z + Math.sin(a) * d, 40, 7); if (!sn || this._blocked(sn.x, sn.z)) continue; this.addOfficer(sn.x, sn.z, { state: 'chase', swat, hp: swat ? 120 : 60 }); made++; }
    return made;
  }
  chasers() { return this.officers.filter(o => o.state === 'chase' && o.hp > 0).length; }
  clearChase() { this.officers = this.officers.filter(o => o.state !== 'chase' || o.hp <= 0 && o.dead < 5); for (const o of this.officers) if (o.state === 'chase' && o.hp > 0) o.state = 'patrol'; }
  damage(o, dmg) { if (o.hp <= 0) return false; o.hp -= dmg; o.hit = 0.25; if (o.hp <= 0) { o.hp = 0; o.dead = 0; return true; } return false; }

  /** advance everything. ctx = {x,z,h,speed,onFoot,stars,hurt(dmg),vx,vz} */
  update(dt, P, stars) {
    this.t += dt; for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);
    this.ensureStationStaff(P.x, P.z);
    let adjacent = 0, shooters = 0, nearest = 1e9;
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i], dx = P.x - o.x, dz = P.z - o.z, dist = Math.hypot(dx, dz);
      if (o.hp <= 0) { o.dead += dt; if (o.dead > 8) this.officers.splice(i, 1); continue; }
      if (dist > 700 && o.state === 'chase') { this.officers.splice(i, 1); continue; }
      o.hit = Math.max(0, o.hit - dt); let spd = 0, aim = null;
      if (o.state === 'chase') {
        nearest = Math.min(nearest, dist); aim = Math.atan2(dx, dz); spd = (o.swat ? 5.2 : 4.6) + stars * 0.25; if (dist < 2.2) spd = 0;
        if (P.onFoot && dist < 1.9) adjacent++;
        if (stars >= 3 && dist < 32 && dist > 3) { shooters++; if ((o.fireCd -= dt) <= 0) { o.fireCd = (o.swat ? 0.55 : 0.95) + this.rnd() * 0.4; o.firing = 0.12; if (this.rnd() < Math.max(0.15, 0.62 - dist * 0.014 - (P.moveSpeed || 0) * 0.035)) P.hurt && P.hurt(o.swat ? 9 : 6, o); } }
        if (stars < 3 || dist >= 32) o.fireCd = Math.max(o.fireCd, 0.4);
      } else { // patrol / investigate: wander around home, pause, turn to look at things
        if ((o.wait -= dt) > 0) spd = 0; else { if (!o.tgt || Math.hypot(o.tgt.x - o.x, o.tgt.z - o.z) < 1.2) { if (o.tgt) { o.wait = 1.5 + this.rnd() * 4; o.tgt = null; continue; } const a = this.rnd() * 6.283, d = 4 + this.rnd() * 12; o.tgt = { x: o.home.x + Math.cos(a) * d, z: o.home.z + Math.sin(a) * d }; if (this._blocked(o.tgt.x, o.tgt.z)) o.tgt = null; } if (o.tgt) { aim = Math.atan2(o.tgt.x - o.x, o.tgt.z - o.z); spd = 1.3; } }
      }
      o.firing = Math.max(0, (o.firing || 0) - dt);
      if (aim !== null && spd > 0) {
        let best = null; for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4]) { const a = aim + off, nx = o.x + Math.sin(a) * (spd * dt + 0.5), nz = o.z + Math.cos(a) * (spd * dt + 0.5); if (!this._blocked(nx, nz)) { best = a; break; } }
        if (best === null) { o.stuck += dt; if (o.stuck > 2.2 && o.state === 'chase') { const sn = this.w.snapToRoad(o.x + Math.sin(aim) * 15, o.z + Math.cos(aim) * 15, 30, 7); if (sn) { o.x = sn.x; o.z = sn.z; } o.stuck = 0; } spd = 0; }
        else { o.stuck = 0; o.x += Math.sin(best) * spd * dt; o.z += Math.cos(best) * spd * dt; o.h = o.h + wrap(best - o.h) * Math.min(1, dt * 9); }
      } else if (aim !== null) o.h = o.h + wrap(aim - o.h) * Math.min(1, dt * 9);
      o.moving += ((spd > 0 ? Math.min(1.3, spd / 4.6) : 0) - o.moving) * Math.min(1, dt * 8); o.phase += dt * (spd > 3 ? 12 : 7) * (spd > 0 ? 1 : 0);
    }
    if (P.onFoot && adjacent > 0) { this.cuff = (this.cuff || 0) + dt * Math.min(2, adjacent); } else this.cuff = Math.max(0, (this.cuff || 0) - dt * 2);
    const res = { arrested: this.cuff > 1.6, nearest, shooters };
    if (res.arrested) this.cuff = 0;
    this._roam(dt, P, stars);
    return res;
  }

  /* ---------------------------------------------------------------- roaming patrol cars / motorcycles */
  _roam(dt, P, stars) {
    const w = this.w;
    if (stars > 0) { this.roamers.length = 0; return; }
    for (let i = this.roamers.length - 1; i >= 0; i--) {
      const r = this.roamers[i], d = Math.hypot(r.x - P.x, r.z - P.z); if (d > 700) { this.roamers.splice(i, 1); continue; }
      if (r.pause > 0) { r.pause -= dt; r.u *= 0.9; } else r.u += (r.v - r.u) * Math.min(1, dt * 1.5);
      r.s += r.dir * r.u * dt; if (r.s < 3 || r.s > r.road.len - 3) { r.dir = -r.dir; r.s = clamp(r.s, 3, r.road.len - 3); }
      const p = w.roadPoint(r.road, r.s, -r.dir * (r.road.halfW * 0.45), {}); r.x = p.x; r.z = p.z; r.h = p.h + (r.dir > 0 ? 0 : Math.PI); r.y = w.heightAt(p.x, p.z);
    }
    for (const st of this.stations) {
      const d = Math.hypot(st.x - P.x, st.z - P.z); if (d > 650) continue;
      const have = this.roamers.filter(r => r.st === st.id).length;
      if (have < 2 && this.rnd() < dt * 0.5) { const sn = w.snapToRoad(st.x + (this.rnd() - 0.5) * 500, st.z + (this.rnd() - 0.5) * 500, 120, 5); if (sn && Math.hypot(sn.x - P.x, sn.z - P.z) > 60) { const bike = have === 1; this.roamers.push({ id: this.nid++, st: st.id, road: sn.road, s: sn.s, dir: this.rnd() < 0.5 ? 1 : -1, u: 0, v: bike ? 11 : 8.5, type: bike ? 'bike' : 'car', x: sn.x, z: sn.z, h: 0, y: 0, pause: 0 }); } }
    }
  }
  /** soft contact between a roaming patrol and the player's vehicle; returns the roamer that was hit (so main can add a star) */
  roamerHit(v) { for (const r of this.roamers) { const dx = v.x - r.x, dz = v.z - r.z, d = Math.hypot(dx, dz), rr = (r.type === 'bike' ? 1.4 : 2.4) + v.spec.wid * 0.5 + 0.6; if (d < rr && d > 0.01) { v.x += dx / d * (rr - d); v.z += dz / d * (rr - d); r.pause = 2.5; if (v.speed > 6) return r; } } return null; }
  roamerSees(P) { for (const r of this.roamers) if (Math.hypot(r.x - P.x, r.z - P.z) < 38) return r; return null; }

  /* ---------------------------------------------------------------- checkpoints (story / radio) */
  setCheckpoints(list) { this.checkpoints = list.map((c, i) => ({ id: 'cp' + i, ...c })); }
  checkpointCheck(P) { for (const c of this.checkpoints) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < 14 && P.speed > 9 && !P.onFoot) return c; } return null; }

  /* ---------------------------------------------------------------- arrest & jail */
  startArrest(P, stars, why) {
    const ns = this.nearestStation(P.x, P.z); const time = 8 + stars * 3;
    this.arrest = { t: 0, time, why, st: ns ? ns.st : null, fine: Math.min(P.money || 0, 500 * Math.max(1, stars)), stage: 'busted', stars };
    return this.arrest;
  }
}
