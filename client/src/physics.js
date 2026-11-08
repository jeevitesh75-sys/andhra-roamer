// Arcade vehicle physics (fixed timestep). No rendering dependency.
// Conventions: heading h, forward f=(sin h, cos h), left l=(cos h, -sin h). Increasing h turns LEFT; steer>0 = right.
import { SURF } from './geo.js';
import { clamp } from './noise.js';

export const FIXED_DT = 1 / 60;
export const MAX_STEPS = 5;

export const SPECS = {
  car: { label: 'Hatchback', len: 4.2, wid: 1.76, wheelbase: 2.55, track: 1.5, maxSpeed: 44, accel: 5.6, brake: 9.5, reverseMax: 9,
    maxSteer: 0.66, steerSpeed: 26, tank: 45, fuelPerM: 0.00015, rate: 14, jobLabel: 'Taxi fares' },
  bus: { label: 'Bus', len: 11.4, wid: 2.55, wheelbase: 6.1, track: 2.0, maxSpeed: 27, accel: 2.7, brake: 6.2, reverseMax: 6,
    maxSteer: 0.55, steerSpeed: 19, tank: 200, fuelPerM: 0.0005, rate: 38, jobLabel: 'Passenger routes' },
  lorry: { label: 'Lorry', len: 9.2, wid: 2.5, wheelbase: 5.2, track: 1.9, maxSpeed: 24, accel: 2.1, brake: 5.6, reverseMax: 6,
    maxSteer: 0.56, steerSpeed: 19, tank: 300, fuelPerM: 0.00065, rate: 55, jobLabel: 'Cargo deliveries' },
};

const SURFACE = {
  [SURF.ROAD]: { grip: 1.0, drag: 1.0, maxMul: 1.0, accMul: 1.0 },
  [SURF.STREET]: { grip: 1.0, drag: 1.0, maxMul: 1.0, accMul: 1.0 },
  [SURF.GRASS]: { grip: 0.68, drag: 2.6, maxMul: 0.58, accMul: 0.7 },
  [SURF.DIRT]: { grip: 0.78, drag: 1.9, maxMul: 0.68, accMul: 0.75 },
  [SURF.SAND]: { grip: 0.5, drag: 3.4, maxMul: 0.42, accMul: 0.5 },
  [SURF.WATER]: { grip: 0.2, drag: 9, maxMul: 0.12, accMul: 0.1 },
};

export class Vehicle {
  constructor(type, world) {
    this.world = world;
    this.setType(type);
    this.reset(0, 0, 0);
  }
  setType(type) {
    this.type = type; this.spec = SPECS[type];
    this.fuel = this.spec.tank;
    this.load = 0; // 0..1 cargo/passenger weight factor
  }
  reset(x, z, h) {
    this.x = x; this.z = z; this.h = h;
    this.vx = 0; this.vz = 0;
    this.y = this.world.heightAt(x, z);
    this.pitch = 0; this.roll = 0;
    this.steerAngle = 0; this.u = 0; this.w = 0; this.speed = 0;
    this.ax = 0; this.ay = 0; this.impact = 0; this.surf = SURF.ROAD;
    this.inWater = 0; this.needsRespawn = false;
    this.brakeLit = false; this.reversing = false; this.rpm = 0.15; this.gear = 1; this.skid = 0;
    this.prev = { x, z, h, y: this.y, pitch: 0, roll: 0, steer: 0 };
    this.teleported = true; // tells the network layer to skip the speed check once
  }

  /** advance one fixed step. input = {throttle:-1..1, steer:-1..1 (right +), brake:0..1, handbrake:bool} */
  step(dt, input) {
    const s = this.spec, wd = this.world;
    const p = this.prev; p.x = this.x; p.z = this.z; p.h = this.h; p.y = this.y; p.pitch = this.pitch; p.roll = this.roll; p.steer = this.steerAngle;
    const sinH = Math.sin(this.h), cosH = Math.cos(this.h);
    let u = this.vx * sinH + this.vz * cosH;     // forward speed
    let w = this.vx * cosH - this.vz * sinH;     // leftward speed

    // ground contact (4 wheels) -> height, pitch, roll
    const hl = s.wheelbase / 2, tr = s.track / 2;
    const fx = sinH, fz = cosH, lx = cosH, lz = -sinH;
    const hFL = wd.heightAt(this.x + fx * hl + lx * tr, this.z + fz * hl + lz * tr);
    const hFR = wd.heightAt(this.x + fx * hl - lx * tr, this.z + fz * hl - lz * tr);
    const hRL = wd.heightAt(this.x - fx * hl + lx * tr, this.z - fz * hl + lz * tr);
    const hRR = wd.heightAt(this.x - fx * hl - lx * tr, this.z - fz * hl - lz * tr);
    const front = (hFL + hFR) / 2, rear = (hRL + hRR) / 2;
    const gy = (front + rear) / 2;
    const slope = (front - rear) / s.wheelbase;                 // + = nose up (climbing when moving forward)
    this.pitch = Math.atan(slope);
    this.roll = Math.atan((hFL + hRL - hFR - hRR) / 2 / s.track); // + = left side higher
    const surf = wd.surfaceAt(this.x, this.z, gy);
    this.surf = surf;
    const sp = SURFACE[surf];

    // ---- longitudinal ----
    const thr = clamp(input.throttle, -1, 1);
    const vmax = s.maxSpeed * sp.maxMul;
    const mass = 1 + this.load * (this.type === 'lorry' ? 0.9 : this.type === 'bus' ? 0.35 : 0.1);
    let a = 0;
    const hasFuel = this.fuel > 0;
    let brake = clamp(input.brake, 0, 1);
    let drive = thr;
    if (thr < 0 && u > 0.6) { brake = Math.max(brake, -thr); drive = 0; }   // S while moving forward = brake
    if (thr > 0 && u < -0.6) { brake = Math.max(brake, thr); drive = 0; }   // W while reversing = brake
    if (hasFuel) {
      if (drive > 0) a = ((s.accel * sp.accMul) / mass) * drive * Math.max(0, 1 - (Math.max(u, 0) / vmax) ** 2);
      else if (drive < 0) a = -((s.accel * sp.accMul * 0.6) / mass) * -drive * Math.max(0, 1 - Math.abs(Math.min(u, 0)) / s.reverseMax);
    }
    a -= 9.81 * 0.92 * slope * (u >= 0 ? 1 : -1) * (Math.abs(u) > 0.05 || Math.abs(slope) > 0.03 ? 1 : 0);
    const resist = (0.015 * 9.81 + 0.0009 * Math.abs(u) * Math.abs(u) / mass) * sp.drag;
    a -= Math.sign(u) * Math.min(resist, Math.abs(u) / dt);
    let u2 = u + a * dt;
    if (brake > 0.001) {
      const db = ((s.brake * sp.grip) / (0.7 + 0.3 * mass)) * brake * dt;
      if (Math.abs(u2) <= db) u2 = 0; else u2 -= Math.sign(u2) * db;
    }
    if (input.handbrake) { const dh = 7 * dt; if (Math.abs(u2) <= dh) u2 = 0; else u2 -= Math.sign(u2) * dh * 0.6; }
    // coasting to a stop on gentle slopes
    if (Math.abs(u2) < 0.08 && Math.abs(drive) < 0.01 && Math.abs(slope) < 0.04) u2 = 0;
    this.ax = (u2 - u) / dt;
    u = u2;

    // ---- steering (bicycle model, speed-sensitive, grip-limited) ----
    const target = clamp(input.steer, -1, 1) * s.maxSteer / (1 + (Math.abs(u) / s.steerSpeed) ** 2);
    const sr = 6.5 * dt;                                    // steering wheel rate limit
    this.steerAngle += clamp(target - this.steerAngle, -sr, sr);
    let yaw = -(u / s.wheelbase) * Math.tan(this.steerAngle);
    const hb = input.handbrake ? 1 : 0;
    const latMax = (14 * sp.grip) * (1 + hb * 0.9);
    const yawMax = latMax / Math.max(Math.abs(u), 2);
    yaw = clamp(yaw * (1 + hb * 0.45), -yawMax, yawMax);
    this.h += yaw * dt;
    this.ay = yaw * u;

    // world velocity is NOT rotated by yaw: rebuild it with the OLD axes, then decompose in the NEW axes.
    // The difference is slip angle, which the tyres then remove (slowly with the handbrake = drift).
    this.vx = sinH * u + cosH * w; this.vz = cosH * u - sinH * w;
    const sinN = Math.sin(this.h), cosN = Math.cos(this.h);
    let u3 = this.vx * sinN + this.vz * cosN, w3 = this.vx * cosN - this.vz * sinN;
    const gripRate = 10 * sp.grip * (hb ? 0.13 : 1);
    w3 *= Math.exp(-gripRate * dt);
    this.skid = clamp(Math.abs(w3) / 4 + (hb && Math.abs(u3) > 6 ? 0.6 : 0), 0, 1);
    this.vx = sinN * u3 + cosN * w3; this.vz = cosN * u3 - sinN * w3;

    // water slows you down hard; after a few seconds you are towed back to the road
    if (surf === SURF.WATER) {
      const k = Math.exp(-1.6 * dt); this.vx *= k; this.vz *= k;
      this.inWater += dt; if (this.inWater > 2.5) this.needsRespawn = true;
    } else this.inWater = Math.max(0, this.inWater - dt);

    this.x += this.vx * dt; this.z += this.vz * dt;
    this.collide();

    const W = wd.WORLD;
    this.x = clamp(this.x, 30, W.w - 30); this.z = clamp(this.z, 30, W.h - 30);
    this.y = gy;
    u3 = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
    this.u = u3; this.w = this.vx * Math.cos(this.h) - this.vz * Math.sin(this.h);
    this.speed = Math.hypot(this.vx, this.vz);
    this.brakeLit = brake > 0.05 || (input.handbrake && this.speed > 1);
    this.reversing = this.u < -0.3 && drive < 0;

    // fuel (burns with throttle and distance, a little at idle)
    if (hasFuel) this.fuel = Math.max(0, this.fuel - (Math.abs(u3) * dt * s.fuelPerM * (0.35 + 0.65 * Math.abs(drive)) * (1 + this.load * 0.3) + 0.00025 * dt * s.tank / 45));

    // simple 5-gear engine model for sound
    const frac = clamp(Math.abs(u3) / s.maxSpeed, 0, 1);
    const g = Math.min(5, 1 + Math.floor(frac * 5.4));
    const within = clamp(frac * 5.4 - (g - 1), 0, 1);
    const targetRpm = 0.18 + 0.62 * within + 0.12 * Math.abs(drive);
    this.rpm += (targetRpm - this.rpm) * Math.min(1, 9 * dt); this.gear = g;
  }

  /** push the vehicle out of buildings (three circles along its length) */
  collide() {
    const s = this.spec, r = s.wid / 2 + 0.15;
    const sinH = Math.sin(this.h), cosH = Math.cos(this.h);
    const off = Math.max(0, s.len / 2 - r);
    for (let pass = 0; pass < 2; pass++) {
      for (let ci = -1; ci <= 1; ci++) {
        const cx = this.x + sinH * off * ci, cz = this.z + cosH * off * ci;
        const list = this.world.buildingsNear(cx, cz);
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          const dx = cx - b.x, dz = cz - b.z;
          const lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c;
          const qx = clamp(lx, -b.hw, b.hw), qz = clamp(lz, -b.hd, b.hd);
          let nx = lx - qx, nz = lz - qz, d = Math.hypot(nx, nz), pen;
          if (d > 1e-6) { if (d >= r) continue; pen = r - d; nx /= d; nz /= d; }
          else { // centre inside the rectangle: exit through the nearest face
            const ex = b.hw - Math.abs(lx), ez = b.hd - Math.abs(lz);
            if (ex < ez) { nx = Math.sign(lx) || 1; nz = 0; pen = ex + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = ez + r; }
          }
          const wnx = nx * b.c - nz * b.s, wnz = nx * b.s + nz * b.c;
          this.x += wnx * pen; this.z += wnz * pen;
          const vn = this.vx * wnx + this.vz * wnz;
          if (vn < 0) {
            this.vx -= 1.12 * vn * wnx; this.vz -= 1.12 * vn * wnz;
            this.vx *= 0.97; this.vz *= 0.97;
            this.impact = Math.max(this.impact, -vn);
          }
        }
      }
    }
  }

  /** place the vehicle on the nearest road, heading along it (closest to current heading) */
  respawnOnRoad() {
    const wd = this.world;
    let best = null, bd = 1e18;
    for (const r of wd.roads) {
      // coarse search over samples
      for (let i = 0; i < r.n; i += 3) {
        const d = (r.pts[2 * i] - this.x) ** 2 + (r.pts[2 * i + 1] - this.z) ** 2;
        if (d < bd) { bd = d; best = { r, s: r.cum[i] }; }
      }
    }
    if (!best) return;
    const a = wd.roadPoint(best.r, best.s, 2.5);       // left lane (India drives on the left)
    const b = wd.roadPoint(best.r, Math.min(best.r.len, best.s + 5), 2.5);
    let hd = Math.atan2(b.x - a.x, b.z - a.z);
    const diff = Math.atan2(Math.sin(hd - this.h), Math.cos(hd - this.h));
    if (Math.abs(diff) > Math.PI / 2) { // face the other way, use the right-hand-travel lane
      const a2 = wd.roadPoint(best.r, best.s, -2.5);
      hd += Math.PI; this.reset(a2.x, a2.z, hd); return;
    }
    this.reset(a.x, a.z, hd);
  }
}
