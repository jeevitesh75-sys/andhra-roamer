// Places the static glTF buildings/props (club, garage, tavern, gas station, bridges, phone) at their story anchors.
// They are only added to the scene while the player is within `vis` metres, and removed again afterwards. Visual only (no collision).
import { SITES } from './glbassets.js';
import { makeBuilder, BUILDINGS } from './buildings.js';

// local footprints [width, depth, centreX, centreZ] of the code-built buildings
const FOOT = { factory: [[44, 26, 0, 0]], port: [[30, 14, 20, -10], [18, 40, -14, 5]], den: [[14, 10, 0, 0]], warehouse: [[34, 20, 0, 0]], yard: [[6, 4, 14, 6], [20, 28, 0, -1]] };
export class Sites {
  constructor(T, scene, assets) { this.T = T; this.scene = scene; this.assets = assets; this.live = new Map(); this.t = 0; this.B = null; this.cols = new Map(); this.hooked = false; }
  /** solid footprints (oriented boxes, same shape as OSM buildings) so you and vehicles cannot drive/walk through the club, garage, yard... */
  _hook(w) {
    if (this.hooked) return; this.hooked = true; const prev = w.buildingsNear;
    w.buildingsNear = (x, z) => { const base = prev(x, z); if (!this.cols.size) return base; let out = null; for (const arr of this.cols.values()) for (const b of arr) if (Math.abs(b.x - x) < 90 && Math.abs(b.z - z) < 90) (out || (out = base.slice())).push(b); return out || base; };
  }
  _boxes(key, boxes) { this.cols.set(key, boxes); }
  update(G, x, z) {
    if (!G.anchors || !G.world) return;
    this._hook(G.world);
    if (!this.B) { try { this.B = makeBuilder(this.T); } catch (e) { console.warn('buildings failed', e); this.B = {}; } }
    for (const cfg of BUILDINGS) {
      const a = G.anchors[cfg.anchor], f = this.B[cfg.build]; if (!a || !f) continue;
      const d = Math.hypot(a.x - x, a.z - z), o = this.live.get(cfg.key);
      if (d < cfg.vis && !o) {
        const g = f(); g.position.set(a.x, G.world.heightAt(a.x, a.z), a.z); g.rotation.y = a.h || 0; this.scene.add(g); this.live.set(cfg.key, g);
        const h = a.h || 0, ch = Math.cos(h), sh = Math.sin(h); this._boxes(cfg.key, (FOOT[cfg.build] || []).map(([w, d, cx, cz]) => ({ i: -2000, x: a.x + cx * ch + cz * sh, z: a.z - cx * sh + cz * ch, hw: w / 2, hd: d / 2, c: ch, s: -sh, h: 8, cls: 9, y: 0 })));
      } else if (d > cfg.vis + 80 && o) { this.scene.remove(o); this.live.delete(cfg.key); this.cols.delete(cfg.key); }
    }
    const A = this.assets && this.assets.sites; if (!A) return;
    for (const cfg of SITES) {
      const tpl = A[cfg.key], a = G.anchors[cfg.anchor]; if (!tpl || !a) continue;
      const d = Math.hypot(a.x - x, a.z - z), o = this.live.get(cfg.key);
      if (d < cfg.vis && !o) {
        const g = tpl.clone(true), h = a.h || 0;
        // step sideways off the road centre line (road heading h: forward = (sin h, cos h))
        const sx = a.x + Math.cos(h) * cfg.side, sz = a.z - Math.sin(h) * cfg.side;
        g.position.set(sx, G.world.heightAt(sx, sz), sz); g.rotation.y = cfg.road ? h : h + Math.PI / 2;
        this.scene.add(g); this.live.set(cfg.key, g);
        if (cfg.solid !== false) { g.updateMatrixWorld(true); const bb = new this.T.Box3().setFromObject(g), k = cfg.key === 'phone' ? 0.8 : 0.88; if (bb.max.x - bb.min.x > 1 && bb.max.x - bb.min.x < 80) this._boxes(cfg.key, [{ i: -2100, x: (bb.max.x + bb.min.x) / 2, z: (bb.max.z + bb.min.z) / 2, hw: (bb.max.x - bb.min.x) / 2 * k, hd: (bb.max.z - bb.min.z) / 2 * k, c: 1, s: 0, h: 8, cls: 9, y: 0 }]); }
      } else if (d > cfg.vis + 80 && o) { this.scene.remove(o); this.live.delete(cfg.key); this.cols.delete(cfg.key); }
    }
  }
  clear() { for (const g of this.live.values()) this.scene.remove(g); this.live.clear(); this.cols.clear(); }
}
