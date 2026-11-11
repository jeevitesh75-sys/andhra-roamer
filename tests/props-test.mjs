// Logic test for props.js placement + collision injection with a fake flat world (no THREE needed).
import { Props } from '../client/src/props.js';
const added = [], scene = { add: m => added.push(m), remove: m => added.splice(added.indexOf(m), 1) };
const mk = (w, d) => ({ w, d, h: 5, scene: { clone: () => ({ position: { set() {} }, rotation: {} }) } });
const world = { meta: { id: 'T' }, heightAt: () => 5, snapToRoad: (x, z) => ({ x, z, road: 1, s: 0 }), roadPoint: () => ({ h: 0.3 }), buildingsNear: () => [] };
const G = { world, assets: { props: { gas: mk(22, 14), garage: mk(16, 10), club: mk(24, 18), tavern: mk(14, 10) } }, townPos: { x: 0, z: 0 }, veh: { x: 0, z: 0 }, storyC: { anchor: k => ({ x: k === 'club' ? 900 : -900, z: 100, road: 1, s: 0 }) } };
const p = new Props(G); p.init();
if (p.items.length !== 4) throw new Error('expected 4 props, got ' + p.items.length);
for (const it of p.items) { const near = world.buildingsNear(it.x, it.z).some(b => b.prop); if (!near) throw new Error('no collision box at ' + it.key); const b = it.box; const edge = world.buildingsNear(it.x + b.hw * b.c * 0.9, it.z + b.hw * b.s * 0.9); if (!edge.length) throw new Error('no box near edge ' + it.key); }
p.render(scene, p.items[0].x, p.items[0].z); if (!added.length) throw new Error('nothing rendered near'); p.render(scene, 99999, 99999); if (added.length) throw new Error('not culled');
console.log('ok   4 props placed with collision, shown near, culled far'); console.log('PROPS TEST PASSED');
