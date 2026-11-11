// Places the static glTF buildings/props (club, garage, tavern, gas station, bridges, phone) at their story anchors.
// They are only added to the scene while the player is within `vis` metres, and removed again afterwards. Visual only (no collision).
import { SITES } from './glbassets.js';
import { makeBuilder, BUILDINGS } from './buildings.js';

export class Sites {
  constructor(T, scene, assets) { this.T = T; this.scene = scene; this.assets = assets; this.live = new Map(); this.t = 0; this.B = null; }
  update(G, x, z) {
    if (!G.anchors || !G.world) return;
    if (!this.B) { try { this.B = makeBuilder(this.T); } catch (e) { console.warn('buildings failed', e); this.B = {}; } }
    for (const cfg of BUILDINGS) {
      const a = G.anchors[cfg.anchor], f = this.B[cfg.build]; if (!a || !f) continue;
      const d = Math.hypot(a.x - x, a.z - z), o = this.live.get(cfg.key);
      if (d < cfg.vis && !o) {
        const g = f(); g.position.set(a.x, G.world.heightAt(a.x, a.z), a.z); g.rotation.y = a.h || 0; this.scene.add(g); this.live.set(cfg.key, g);
      } else if (d > cfg.vis + 80 && o) { this.scene.remove(o); this.live.delete(cfg.key); }
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
      } else if (d > cfg.vis + 80 && o) { this.scene.remove(o); this.live.delete(cfg.key); }
    }
  }
  clear() { for (const g of this.live.values()) this.scene.remove(g); this.live.clear(); }
}
