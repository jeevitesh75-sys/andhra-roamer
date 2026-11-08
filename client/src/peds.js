// Pedestrians, street animals and the police chase. Pure logic (no three.js): the scene only draws what update() produces.
import { Vehicle } from './physics.js';
import { mulberry32, clamp } from './noise.js';

const SHIRTS = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#ecf0f1', '#8e44ad', '#e67e22', '#16a085', '#d35400', '#34495e', '#f5b7b1', '#aed6f1'];
const PANTS = ['#2c3e50', '#34495e', '#1b1b1b', '#5d4037', '#455a64', '#ecf0f1'];
const SKIN = ['#a9744f', '#8d5a3b', '#c68b59', '#6f4a31', '#b5835a'];
const COW = [['#f2efe8', '#d8d2c4'], ['#7a5a3c', '#5e4630'], ['#2b2b2b', '#1c1c1c'], ['#c9a27a', '#a8845f']];
const DOG = [['#b08850', '#8a6a3a'], ['#e8e0d0', '#c9bfa8'], ['#3b3b3b', '#2a2a2a']];
const GOAT = [['#e9e4da', '#cfc7b8'], ['#6b4f3a', '#4d392a']];
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Crowd {
  constructor(world, seed = 7) { this.w = world; this.rnd = mulberry32(seed); this.list = []; this.tmp = {}; this.clock = 0; }
  _pick(arr) { return arr[Math.floor(this.rnd() * arr.length) % arr.length]; }
  _insideBuilding(x, z) { for (const b of this.w.buildingsNear(x, z)) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + 0.4 && Math.abs(lz) < b.hd + 0.4) return true; } return false; }
  _spawn(veh) {
    const a = this.rnd() * Math.PI * 2, d = 40 + this.rnd() * 95, snap = this.w.snapToRoad(veh.x + Math.cos(a) * d, veh.z + Math.sin(a) * d, 45, 7);
    if (!snap) return false;
    const near = this.w.nearestCity(snap.x, snap.z).dist < 4500, r = this.rnd();
    const kind = r < (near ? 0.78 : 0.4) ? 'human' : r < (near ? 0.9 : 0.72) ? 'cow' : r < (near ? 0.96 : 0.86) ? 'dog' : 'goat';
    const road = snap.road, onRoad = kind === 'cow' ? this.rnd() < 0.45 : kind === 'dog' ? this.rnd() < 0.2 : false;
    const side = this.rnd() < 0.5 ? -1 : 1, off = onRoad ? (this.rnd() - 0.5) * road.halfW * 1.3 : side * (road.halfW + 1.5 + this.rnd() * 1.4);
    const p = this.w.roadPoint(road, snap.s, off, {}); if (Math.hypot(p.x - veh.x, p.z - veh.z) < 14 || this._insideBuilding(p.x, p.z)) return false;
    const e = { kind, x: p.x, z: p.z, h: p.h, road, s: snap.s, off, dir: this.rnd() < 0.5 ? -1 : 1, state: 'walk', t: 0, phase: this.rnd() * 6, lift: 0, lie: 0, vy: 0, hx: 0, hz: 0, sc: 0.92 + this.rnd() * 0.18, idle: this.rnd() * 4 };
    if (kind === 'human') { e.c1 = this._pick(SHIRTS); e.c2 = this._pick(PANTS); e.skin = this._pick(SKIN); e.speed = 1.0 + this.rnd() * 0.7; }
    else { const [c1, c2] = this._pick(kind === 'cow' ? COW : kind === 'dog' ? DOG : GOAT); e.c1 = c1; e.c2 = c2; e.speed = kind === 'cow' ? 0.35 : kind === 'dog' ? 1.7 : 0.8; }
    this.list.push(e); return true;
  }
  /** advance everything; returns events [{type:'hit', kind, speed}] */
  update(dt, veh) {
    this.clock += dt; const events = [], w = this.w, sp = Math.abs(veh.u || 0), sinH = Math.sin(veh.h), cosH = Math.cos(veh.h), L = veh.spec.len / 2 + 0.35, Wd = veh.spec.wid / 2 + 0.35;
    const near = w.nearestCity(veh.x, veh.z).dist < 4500, want = near ? 34 : 14; let alive = 0, spawned = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i], dx = e.x - veh.x, dz = e.z - veh.z, dist = Math.hypot(dx, dz);
      if (dist > 170 || e.t > 7 && e.state === 'hit') { this.list.splice(i, 1); continue; }
      if (e.state === 'hit') {
        e.t += dt; e.x += e.hx * dt; e.z += e.hz * dt; e.lift += e.vy * dt; e.vy -= 12 * dt; if (e.lift <= 0) { e.lift = 0; e.vy = 0; const k = Math.exp(-2.6 * dt); e.hx *= k; e.hz *= k; }
        e.lie = Math.min(1, e.lie + dt * 4); e.h += (e.spin || 0) * dt; e.spin = (e.spin || 0) * Math.exp(-1.5 * dt); continue;
      }
      alive++;
      // contact with the player's vehicle (oriented box in the vehicle frame)
      const lz = dx * sinH + dz * cosH, lx = dx * cosH - dz * sinH;
      if (Math.abs(lz) < L && Math.abs(lx) < Wd) {
        if (sp >= 2.5) {
          e.state = 'hit'; e.t = 0; e.vy = 2.5 + sp * 0.18; e.hx = veh.vx * 1.1 + (this.rnd() - 0.5) * 2; e.hz = veh.vz * 1.1 + (this.rnd() - 0.5) * 2; e.spin = (this.rnd() - 0.5) * 6;
          events.push({ type: 'hit', kind: e.kind, speed: sp, x: e.x, z: e.z }); continue;
        }
        const d2 = Math.hypot(dx, dz) || 1; e.x += (dx / d2) * 3 * dt; e.z += (dz / d2) * 3 * dt;     // slow nudge: they just step away
      }
      // people and dogs jump out of the way of a fast car
      let dodge = 0; if ((e.kind === 'human' || e.kind === 'dog') && sp > 5 && lz > 0 && lz < 22 && Math.abs(lx) < 4) dodge = lx >= 0 ? 1 : -1;
      e.t += dt; e.phase += dt * (e.kind === 'human' ? 7 : 9) * (e.idle > 0 ? 0 : 1);
      if (e.idle > 0) e.idle -= dt; else {
        if (this.rnd() < dt * (e.kind === 'cow' ? 0.25 : 0.04)) e.idle = (e.kind === 'cow' ? 5 : 1.5) + this.rnd() * 5;
        e.s += e.dir * e.speed * dt; if (e.s < 0 || e.s > e.road.len) { e.dir = -e.dir; e.s = clamp(e.s, 0, e.road.len); }
      }
      if (dodge && e.kind !== 'human') e.off += dodge * 3.6 * dt * Math.sign(e.off || 1) * (Math.abs(e.off) < e.road.halfW + 3 ? 1 : 0);
      if (e.kind === 'human') { const mn = e.road.halfW + 1.3, sg = Math.sign(e.off) || (e.side0 = e.side0 || 1); if (Math.abs(e.off) < mn) e.off = sg * Math.min(mn, Math.abs(e.off) + 6 * dt + 0.3); }   // people always stay on the footpath
      const p = w.roadPoint(e.road, e.s, e.off, this.tmp); e.x = p.x; e.z = p.z; e.h = p.h + (e.dir > 0 ? 0 : Math.PI);
    }
    for (let k = 0; k < 2 && this.list.length < want + 8 && alive < want && spawned < 2; k++) if (this._spawn(veh)) { spawned++; alive++; }
    return events;
  }
}

/** Police (GTA-style): stars 1-5 set unit count, speed, aggression and roadblocks. Each unit is a real Vehicle, so they respect buildings, water and bridges. */
const LEVELS = [null,
  { n: 1, spd: 0.72, acc: 0.8, lead: 0.2, swat: 0, block: false, far: 420, spawn: 300, name: 'Patrol' },
  { n: 2, spd: 0.85, acc: 0.95, lead: 0.5, swat: 0, block: false, far: 480, spawn: 260, name: 'Pursuit' },
  { n: 3, spd: 0.95, acc: 1.1, lead: 0.8, swat: 0, block: true, far: 560, spawn: 230, name: 'Roadblocks' },
  { n: 4, spd: 1.05, acc: 1.25, lead: 1.0, swat: 1, block: true, far: 650, spawn: 200, name: 'SWAT' },
  { n: 5, spd: 1.15, acc: 1.45, lead: 1.3, swat: 2, block: true, far: 760, spawn: 180, name: 'Army of cops' }];
export class Police {
  constructor(world) { this.w = world; this.active = false; this.cars = []; this.stars = 0; this.far = 0; this.close = 0; this.blockT = 0; }
  get lv() { return LEVELS[clamp(this.stars, 1, 5)]; }
  get units() { return this.cars.filter(c => !c.block && c.hp > 0); }
  get car() { const u = this.units; return u.length ? u[0].car : (this.cars[0] && this.cars[0].car); }
  _make(x, z, h, swat, block) {
    const L = this.lv, car = new Vehicle(swat ? 'bus' : 'car', this.w); car.spec = { ...car.spec, maxSpeed: car.spec.maxSpeed * L.spd, accel: car.spec.accel * L.acc, brake: car.spec.brake * 1.2 };
    car.reset(x, z, h); const P = { car, hp: swat ? 160 : 100, stuck: 0, rev: 0, dead: 0, swat, block: !!block, id: 'pol' + (this.nid = (this.nid || 0) + 1) }; this.cars.push(P); return P;
  }
  _spawn(player, swat) {
    const w = this.w, L = this.lv; let spot = null;
    for (let k = 0; k < 10 && !spot; k++) { const a = Math.random() * Math.PI * 2, d = L.spawn * (0.8 + Math.random() * 0.5); spot = w.snapToRoad(player.x + Math.cos(a) * d, player.z + Math.sin(a) * d, 160, 5); }
    if (!spot) spot = w.snapToRoad(player.x, player.z, 500, 6); if (!spot) return false;
    this._make(spot.x, spot.z, Math.atan2(player.x - spot.x, player.z - spot.z), swat); return true;
  }
  _fill(player) { const L = this.lv, u = this.units; let live = u.length, swats = u.filter(c => c.swat).length; while (live < L.n) { const sw = swats < L.swat; if (!this._spawn(player, sw)) break; live++; if (sw) swats++; } }
  _roadblock(player) {
    const L = this.lv, sp = Math.hypot(player.vx || 0, player.vz || 0); if (sp < 6) return false;
    const ux = player.vx / sp, uz = player.vz / sp, d = 170 + sp * 3, snap = this.w.snapToRoad(player.x + ux * d, player.z + uz * d, 60, 5); if (!snap) return false;
    const r = snap.road, p = this.w.roadPoint(r, snap.s, 0, {}), hw = r.halfW, perp = p.h + Math.PI / 2;
    if (Math.hypot(p.x - player.x, p.z - player.z) < 90) return false;
    for (const off of [-hw * 0.55, hw * 0.55]) { const q = this.w.roadPoint(r, snap.s, off, {}); this._make(q.x, q.z, perp, false, true).car.fuel = 0; }
    this.cars = this.cars.filter(c => !c.block || c.age === undefined || c.age < 40); this.cars.filter(c => c.block).forEach(c => { if (c.age === undefined) c.age = 0; }); return true;
  }
  start(player, stars = 1) { this.stars = Math.max(this.stars, clamp(stars, 1, 5)); if (!this.active) { this.cars = []; this.far = this.close = 0; this.blockT = 8; } this.active = true; this._fill(player); return this.cars.length > 0; }
  raise(player, n = 1) { if (!this.active) return this.start(player, n); this.stars = Math.min(5, this.stars + n); this._fill(player); return true; }
  stop() { this.active = false; this.stars = 0; this.cars = []; }
  damage(i, dmg) { const c = this.cars[i]; if (!c || c.hp <= 0) return false; c.hp -= dmg; if (c.hp <= 0) { c.hp = 0; c.dead = 0; return true; } return false; }
  /** returns 'escaped' | 'caught' | 'cleared' | null */
  update(dt, player) {
    if (!this.active) return null; const L = this.lv; let minD = 1e9, live = 0;
    this._fill(player);   // wrecked units are replaced from a distance
    if (L.block && (this.blockT -= dt) < 0) { this.blockT = 22; this._roadblock(player); }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const P = this.cars[i], c = P.car, dx = player.x - c.x, dz = player.z - c.z, dist = Math.hypot(dx, dz);
      if (P.block) { c.fuel = 0; c.step(dt, { throttle: 0, steer: 0, brake: 1, handbrake: true }); P.age = (P.age || 0) + dt; if (P.age > 45 || dist > 700) this.cars.splice(i, 1); continue; }
      c.fuel = c.spec.tank;
      if (P.hp <= 0) { P.dead += dt; c.step(dt, { throttle: 0, steer: 0, brake: 1, handbrake: true }); if (P.dead > 7) this.cars.splice(i, 1); continue; }
      live++; minD = Math.min(minD, dist);
      if (P.best === undefined || dist < P.best - 3) { P.best = dist; P.np = 0; } else if (dist > 40 && (P.np = (P.np || 0) + dt) > 7) {   // making no progress: re-place it on a road closer to the player
        P.np = 0; P.best = undefined; const a = Math.random() * 6.283, d = Math.max(90, Math.min(dist * 0.6, L.spawn * 0.7)), sn = this.w.snapToRoad(player.x + Math.cos(a) * d, player.z + Math.sin(a) * d, 120, 5);
        if (sn) { c.reset(sn.x, sn.z, Math.atan2(player.x - sn.x, player.z - sn.z)); continue; } }
      const bear = Math.atan2(dx + (player.vx || 0) * L.lead, dz + (player.vz || 0) * L.lead); let aim = bear;
      if (dist > 25) { let bestS = 1e9; for (const o of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) { const a = c.h + o, px = c.x + Math.sin(a) * 24, pz = c.z + Math.cos(a) * 24, nr = this.w.nearestRoad(px, pz, 6); if (!nr || nr.d > nr.halfW + 1.5) continue; const sc = Math.abs(wrap(a - bear)) + Math.abs(o) * 0.15; if (sc < bestS) { bestS = sc; aim = a; } } }
      const diff = wrap(aim - c.h), sp = Math.abs(c.u || 0), inp = { throttle: 1, brake: 0, steer: clamp(-diff * 1.8, -1, 1), handbrake: false };
      if (dist < 14 && player.speed < 3) { inp.throttle = 0; inp.brake = 0.8; } else if (Math.abs(diff) > 1.2 && sp > 12) { inp.throttle = 0; inp.brake = 0.6; }
      if (P.rev > 0) { P.rev -= dt; inp.throttle = -1; inp.steer = -inp.steer; } else if (sp < 1.2 && dist > 16) { P.stuck += dt; if (P.stuck > 1.6) { P.rev = 1.6; P.stuck = 0; } } else P.stuck = 0;
      c.step(dt, inp);
    }
    if (!live) { this.stop(); return 'cleared'; }
    if (minD > L.far) { this.far += dt; if (this.far > 10) { this.stop(); return 'escaped'; } } else this.far = 0;
    if (minD < 11 && player.speed < 3) { this.close += dt; if (this.close > Math.max(1.0, 2.6 - this.stars * 0.3)) { this.stop(); return 'caught'; } } else this.close = Math.max(0, this.close - dt);
    return null;
  }
}
