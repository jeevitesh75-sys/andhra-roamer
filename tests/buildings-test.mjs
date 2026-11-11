import assert from 'node:assert';
import { makeMockThree } from './mock-three.mjs';
import { makeBuilder, BUILDINGS } from '../client/src/buildings.js';
import { Sites } from '../client/src/sites.js';
const { THREE } = makeMockThree(), B = makeBuilder(THREE);
for (const c of BUILDINGS) { assert(B[c.build], c.build); const g = B[c.build](); assert(g.children.length > 5, c.build + ' has parts'); console.log('ok  ', c.build, g.children.length, 'parts'); }
const added = [], scene = { add: o => added.push(o), remove: o => added.splice(added.indexOf(o), 1) };
const s = new Sites(THREE, scene, { sites: {} }), G = { world: { heightAt: () => 3 }, anchors: { factory: { x: 0, z: 0, h: 0 }, port: { x: 5000, z: 0 } } };
s.update(G, 10, 10); assert.equal(added.length, 1, 'factory shown when near'); s.update(G, 3000, 0); assert.equal(added.length, 0, 'removed when far');
console.log('BUILDINGS TEST PASSED');
