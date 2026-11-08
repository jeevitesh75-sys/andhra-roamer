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
    const side = this.rnd() < 0.5 ? -1 : 1, off = onRoad ? (this.rnd() - 0.5) * road.halfW * 1.3 : side * (road.halfW + 1.0 + this.rnd() * 1.2);
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
      if (dodge) e.off += dodge * 3.6 * dt * Math.sign(e.off || 1) * (Math.abs(e.off) < e.road.halfW + 3 ? 1 : 0);
      const p = w.roadPoint(e.road, e.s, e.off, this.tmp); e.x = p.x; e.z = p.z; e.h = p.h + (e.dir > 0 ? 0 : Math.PI);
    }
    for (let k = 0; k < 2 && this.list.length < want + 8 && alive < want && spawned < 2; k++) if (this._spawn(veh)) { spawned++; alive++; }
    return events;
  }
}

/** Police: up to 3 pursuit cars (a real Vehicle each, so they respect buildings, water and bridges). Stars 1-5 set how many and what comes. */
export class Police {
  constructor(world) { this.w = world; this.active = false; this.cars = []; this.stars = 0; this.far = 0; this.close = 0; }
  get car() { return this.cars.find(c => c.hp > 0) ? this.cars.find(c => c.hp > 0).car : (this.cars[0] && this.cars[0].car); }
  _target() { return this.stars >= 4 ? 3 : this.stars >= 2 ? 2 : 1; }
  _spawn(player, swat) {
    const w = this.w; let spot = null;
    for (let k = 0; k < 10 && !spot; k++) { const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * 120; spot = w.snapToRoad(player.x + Math.cos(a) * d, player.z + Math.sin(a) * d, 160, 5); }
    if (!spot) spot = w.snapToRoad(player.x, player.z, 500, 6); if (!spot) return false;
    const car = new Vehicle(swat ? 'bus' : 'car', w); car.reset(spot.x, spot.z, Math.atan2(player.x - spot.x, player.z - spot.z));
    this.cars.push({ car, hp: 100, stuck: 0, rev: 0, dead: 0, swat, id: 'pol' + (this.nid = (this.nid || 0) + 1) }); return true;
  }
  _fill(player) { let live = this.cars.filter(c => c.hp > 0).length; while (live < this._target()) { if (!this._spawn(player, this.stars >= 4 && live === 2)) break; live++; } }
  start(player, stars = 1) { this.stars = Math.max(this.stars, stars); if (!this.active) { this.cars = []; this.far = this.close = 0; } this.active = true; this._fill(player); return this.cars.length > 0; }
  raise(player, n = 1) { if (!this.active) return this.start(player, n); this.stars = Math.min(5, this.stars + n); this._fill(player); return true; }
  stop() { this.active = false; this.stars = 0; this.cars = []; }
  damage(i, dmg) { const c = this.cars[i]; if (!c || c.hp <= 0) return false; c.hp -= dmg; if (c.hp <= 0) { c.hp = 0; c.dead = 0; return true; } return false; }
  /** returns 'escaped' | 'caught' | 'cleared' | null */
  update(dt, player) {
    if (!this.active) return null; let minD = 1e9, live = 0;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const P = this.cars[i], c = P.car, dx = player.x - c.x, dz = player.z - c.z, dist = Math.hypot(dx, dz); c.fuel = c.spec.tank;
      if (P.hp <= 0) { P.dead += dt; c.step(dt, { throttle: 0, steer: 0, brake: 1, handbrake: true }); if (P.dead > 7) this.cars.splice(i, 1); continue; }
      live++; minD = Math.min(minD, dist);
      const bear = Math.atan2(dx + (player.vx || 0) * 0.5, dz + (player.vz || 0) * 0.5); let aim = bear;
      if (dist > 25) { let bestS = 1e9; for (const o of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) { const a = c.h + o, px = c.x + Math.sin(a) * 24, pz = c.z + Math.cos(a) * 24, nr = this.w.nearestRoad(px, pz, 6); if (!nr || nr.d > nr.halfW + 1.5) continue; const sc = Math.abs(wrap(a - bear)) + Math.abs(o) * 0.15; if (sc < bestS) { bestS = sc; aim = a; } } }
      const diff = wrap(aim - c.h), sp = Math.abs(c.u || 0), inp = { throttle: 1, brake: 0, steer: clamp(-diff * 1.8, -1, 1), handbrake: false };
      if (dist < 14 && player.speed < 3) { inp.throttle = 0; inp.brake = 0.8; } else if (Math.abs(diff) > 1.2 && sp > 12) { inp.throttle = 0; inp.brake = 0.6; }
      if (P.rev > 0) { P.rev -= dt; inp.throttle = -1; inp.steer = -inp.steer; } else if (sp < 1.2 && dist > 16) { P.stuck += dt; if (P.stuck > 1.6) { P.rev = 1.6; P.stuck = 0; } } else P.stuck = 0;
      c.step(dt, inp);
    }
    if (!live) { this.stop(); return 'cleared'; }
    if (minD > 520) { this.far += dt; if (this.far > 10) { this.stop(); return 'escaped'; } } else this.far = 0;
    if (minD < 11 && player.speed < 3) { this.close += dt; if (this.close > 2.2) { this.stop(); return 'caught'; } } else this.close = Math.max(0, this.close - dt);
    return null;
  }
}
