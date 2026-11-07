import assert from 'node:assert';
import { makeMockThree } from './mock-three.mjs';
import { createModels } from '../client/src/models.js';
const { THREE, calls } = makeMockThree();
const models = createModels(THREE);
for (const t of ['car', 'bus', 'lorry']) {
  const m = models.create(t, '#d9482b');
  assert(m.group && m.wheels.length >= 4, t + ' has wheels');
  m.update({ steer: 0.3, brake: true, lights: true, reverse: false, dist: 1.2, ax: -3, ay: 2, pitchVis: 0.02 });
  m.setColor('#2255aa'); m.dispose();
  console.log(t, 'wheels', m.wheels.length, 'ok');
}
console.log('constructed:', Object.entries(calls).map(([k, v]) => k + 'x' + v).join(', '));
console.log('MODELS SMOKE TEST PASSED (mock THREE: checks code paths only, not visuals)');
