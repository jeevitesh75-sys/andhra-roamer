// Smoke test of the renderer against a MOCK three (sandbox has no CDN). Verifies the code runs end-to-end: no typos, no bad data flow.
import assert from 'node:assert';
import { makeMockThree } from './mock-three.mjs';
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 };
const mkCanvasCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: mkCanvasCtx, style: {} }) };
const { THREE } = makeMockThree();
const { createWorld } = await import('../client/src/geo.js');
const { Scene3D } = await import('../client/src/scene.js');
const world = createWorld();
const canvas = { addEventListener() {}, style: {} };
const sc = new Scene3D(THREE, canvas, world, 'medium');
const vz = world.cityByName.get('Vijayawada');
let left = 1, n = 0; while (left > 0 && n++ < 400) left = sc.updateChunks(vz.x, vz.z, 12);
console.log('chunks built', sc.chunks.size, 'cities built', sc.cityObjs.size);
assert(sc.chunks.size > 50, 'initial chunk ring built');
const info = sc.update(0.016, { x: vz.x, y: vz.y, z: vz.z }, 0.5, 1234, false); console.log('noon info', info);
for (const tod of [0.0, 0.2, 0.25, 0.5, 0.74, 0.8, 0.95]) sc.update(0.016, { x: vz.x, y: vz.y, z: vz.z }, tod, 99, false);
const m = sc.model('me', 'car', '#d9482b'); sc.placeModel(m, { x: vz.x, y: vz.y, z: vz.z, h: 1, pitch: 0.05, roll: 0.02, steer: 0.2, brake: true, lights: true });
sc.model('me', 'bus', '#123456'); sc.model('r1', 'lorry', '#654321'); sc.removeModel('r1');
sc.setBeacon({ x: vz.x + 100, z: vz.z }, '#00ff00'); sc.setBeacon(null);
sc.setHeadlight(true, { x: vz.x, y: vz.y, z: vz.z, h: 0.3 }, { len: 4.2 });
sc.toScreen(vz.x, vz.y, vz.z); sc.resize(); sc.setQuality('low'); sc.render();
// drive across the state, streaming chunks
for (let i = 0; i < 60; i++) sc.updateChunks(vz.x + i * 300, vz.z - i * 100, 1);
console.log('after travel chunks', sc.chunks.size);
assert(sc.chunks.size < 200, 'old chunks are released');
console.log('SCENE SMOKE TEST PASSED (mock THREE: code paths only, not visuals)');
