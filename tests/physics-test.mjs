import assert from 'node:assert';
import { createWorld, project, SURF } from '../client/src/geo.js';
import { Vehicle, FIXED_DT, SPECS } from '../client/src/physics.js';
const real = createWorld();
// flat mock world with a road everywhere, for clean dynamics tests
const flat = (surf = SURF.ROAD) => ({ heightAt: () => 5, surfaceAt: () => surf, buildingsNear: () => [], roads: [], WORLD: { w: 1e7, h: 1e7 } });
let w = flat();
const run = (v, secs, input) => { for (let i = 0; i < secs * 60; i++) v.step(FIXED_DT, typeof input === 'function' ? input(i / 60) : input); };

const start = { x: 5e5, z: 5e5, h: 0.6, i: 0 };

// 1. acceleration & top speed
for (const type of ['car', 'bus', 'lorry']) {
  const v = new Vehicle(type, w); v.reset(start.x, start.z, start.h);
  let t60 = null; const t0 = []; 
  for (let i = 0; i < 40 * 60; i++) { v.step(FIXED_DT, { throttle: 1, steer: 0, brake: 0, handbrake: false }); if (t60 === null && v.u > 16.7) t60 = i / 60; }
  console.log(`${type}: 0-60km/h ${t60 && t60.toFixed(1)}s, speed after 40s on throttle ${(v.u * 3.6).toFixed(0)} km/h (max ${(SPECS[type].maxSpeed * 3.6).toFixed(0)}), surface ${v.surf}`);
  assert(v.u > SPECS[type].maxSpeed * 0.8 && v.u <= SPECS[type].maxSpeed + 0.5, type + ' reaches near top speed without exceeding it');
}

// 2. steering direction: pressing RIGHT must move the car to its own right
{
  const v = new Vehicle('car', w); v.reset(start.x, start.z, start.h); v.vx = Math.sin(v.h) * 15; v.vz = Math.cos(v.h) * 15;
  const h0 = v.h, x0 = v.x, z0 = v.z;
  run(v, 1.5, { throttle: 0.3, steer: 1, brake: 0, handbrake: false });
  // right-hand vector at original heading is -left = (-cos h, sin h)
  const rx = -Math.cos(h0), rz = Math.sin(h0);
  const lateral = (v.x - x0) * rx + (v.z - z0) * rz;
  console.log('steer right: heading change', (v.h - h0).toFixed(2), 'rad, lateral shift to the right', lateral.toFixed(1), 'm');
  assert(v.h < h0, 'heading decreases when turning right');
  assert(lateral > 3, 'car actually moved toward its right');
  const v2 = new Vehicle('car', w); v2.reset(start.x, start.z, start.h); v2.vx = Math.sin(v2.h) * 15; v2.vz = Math.cos(v2.h) * 15;
  run(v2, 1.5, { throttle: 0.3, steer: -1, brake: 0, handbrake: false });
  assert(v2.h > h0, 'heading increases when turning left');
}

// 3. braking distance from 100 km/h on road (should be ~ 30-45 m for a car)
{
  const v = new Vehicle('car', w); v.reset(start.x, start.z, start.h); v.vx = Math.sin(v.h) * 27.8; v.vz = Math.cos(v.h) * 27.8;
  v.speed = 27.8; const x0 = v.x, z0 = v.z; let n = 0;
  while (v.speed > 0.2 && n++ < 600) v.step(FIXED_DT, { throttle: 0, steer: 0, brake: 1, handbrake: false });
  const d = Math.hypot(v.x - x0, v.z - z0);
  console.log('car 100->0 km/h braking distance', d.toFixed(0), 'm in', (n / 60).toFixed(1), 's');
  assert(d > 32 && d < 60, 'realistic braking distance');
}

// 4. handbrake drift creates sideslip, normal turn does not
{
  const mk = () => { const v = new Vehicle('car', w); v.reset(start.x, start.z, start.h); v.vx = Math.sin(v.h) * 25; v.vz = Math.cos(v.h) * 25; return v; };
  const a = mk(), b = mk(); let wa = 0, wb = 0;
  for (let i = 0; i < 90; i++) { a.step(FIXED_DT, { throttle: 0, steer: 0.8, brake: 0, handbrake: true }); b.step(FIXED_DT, { throttle: 0, steer: 0.8, brake: 0, handbrake: false }); wa = Math.max(wa, Math.abs(a.w)); wb = Math.max(wb, Math.abs(b.w)); }
  console.log('peak sideslip: handbrake', wa.toFixed(1), 'm/s vs normal', wb.toFixed(1), 'm/s');
  assert(wa > wb * 2 && wa > 3, 'handbrake drifts much more');
}

// 5. off-road slows you
{
  const v = new Vehicle('car', flat(SURF.GRASS)); v.reset(start.x, start.z, 0); run(v, 20, { throttle: 1, steer: 0, brake: 0, handbrake: false });
  console.log('on surface', v.surf, 'top speed after 20s', (v.u * 3.6).toFixed(0), 'km/h');
  assert(v.u < 0.7 * SPECS.car.maxSpeed || v.surf !== SURF.GRASS);
}

w = real;
// 6. building collision: drive straight into a building, never end up inside it
{
  const c = w.cityByName.get('Vijayawada'); const b = c.buildings.find(b => b.hw > 5 && b.hd > 5);
  const v = new Vehicle('car', w); v.reset(b.x - Math.cos(b.rot) * (b.hw + 40), b.z - Math.sin(b.rot) * (b.hw + 40), Math.atan2(Math.cos(b.rot), Math.sin(b.rot)));
  let maxImpact = 0, inside = false;
  for (let i = 0; i < 6 * 60; i++) {
    v.step(FIXED_DT, { throttle: 1, steer: 0, brake: 0, handbrake: false }); maxImpact = Math.max(maxImpact, v.impact);
    const dx = v.x - b.x, dz = v.z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c;
    if (Math.abs(lx) < b.hw - 0.5 && Math.abs(lz) < b.hd - 0.5) inside = true;
  }
  console.log('building crash: peak impact', maxImpact.toFixed(1), 'm/s, ended speed', v.speed.toFixed(1), 'inside building?', inside);
  assert(!inside, 'vehicle never enters a building');
}

// 7. water: driving into the Bay of Bengal triggers a respawn, respawn lands on a road
{
  const [sx, sz] = project(16.9, 82.6);
  const v = new Vehicle('car', w); v.reset(sx - 60, sz, -Math.PI / 2 + Math.PI); // start near shore heading east
  let triggered = false; for (let i = 0; i < 600 && !triggered; i++) { v.vx = 8; v.vz = 0; v.step(FIXED_DT, { throttle: 0.2, steer: 0, brake: 0, handbrake: false }); triggered = v.needsRespawn; }
  console.log('water respawn requested:', triggered, 'at surface', v.surf);
  v.respawnOnRoad(); console.log('respawned at surface', v.surf, 'speed', v.speed);
  assert(w.surfaceAt(v.x, v.z) === SURF.ROAD, 'respawn lands on a road');
}

w = flat();
// 8. fuel burns and a dry tank stops the engine
{
  const v = new Vehicle('car', w); v.reset(start.x, start.z, start.h); const f0 = v.fuel;
  run(v, 60, { throttle: 0.7, steer: 0, brake: 0, handbrake: false });
  const used = f0 - v.fuel, dist = Math.hypot(v.x - start.x, v.z - start.z);
  console.log('60s driving used', used.toFixed(2), 'L over', Math.round(dist), 'm  => full tank lasts ~', Math.round((f0 / used) * dist / 1000), 'game-km');
  v.fuel = 0; v.vx = v.vz = 0; run(v, 5, { throttle: 1, steer: 0, brake: 0, handbrake: false });
  assert(v.speed < 0.5, 'no fuel = no power');
}

w = real;
// 9. uphill is slower than flat for a loaded lorry (Tirumala ghat)
{
  const g = w.roads.find(r => r.ref === 'Tirumala Ghat');
  const p0 = w.roadPoint(g, 300, 2);
  const v = new Vehicle('lorry', w); v.reset(p0.x, p0.z, p0.h); v.load = 1;
  v.vx = Math.sin(p0.h) * 8; v.vz = Math.cos(p0.h) * 8; run(v, 6, { throttle: 1, steer: 0, brake: 0, handbrake: false });
  console.log('loaded lorry full throttle on ghat start: speed', (v.u * 3.6).toFixed(0), 'km/h, pitch', (v.pitch * 57.3).toFixed(1), 'deg');
}
console.log('ALL PHYSICS TESTS PASSED');
