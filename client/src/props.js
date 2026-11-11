// Landmark props from real GLB models: gas station, tavern (beside the start town) + garage, club (at their story anchors).
// Placed beside a road, collision boxes injected into world.buildingsNear (same trick as law.js), added/removed by distance.
// Every step is optional: no model / no anchor => nothing is placed and the game plays as before.
const GRID = 32, SHOW = 380;

export class Props {
  constructor(G) { this.G = G; this.items = []; this.extra = new Map(); this.merged = new Map(); this.worldId = null; this.hooked = null; }
  _free(w, x, z, hw, hd, c, s) {
    const pts = [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]];
    for (const [px, pz] of pts) {
      const X = x + px * c - pz * s, Z = z + px * s + pz * c; // local x axis = (c,s), local z axis = (-s,c)
      if (w.heightAt(X, Z) < -0.2) return false;
      for (const b of w.buildingsNear(X, Z)) { const dx = X - b.x, dz = Z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + 1 && Math.abs(lz) < b.hd + 1) return false; }
    }
    return true;
  }
  init() {
    const G = this.G, w = G.world, A = G.assets; if (!A || !A.props || !w || this.worldId === w.meta.id) return;
    this.worldId = w.meta.id; this.items = []; this.extra.clear(); this.merged.clear();
    const town = G.townPos || { x: G.veh.x, z: G.veh.z }, S = G.storyC;
    const spots = [['garage', S && S.anchor('garage')], ['club', S && S.anchor('club')], ['gas', null, 150, 0.9], ['tavern', null, 230, -1.3]];
    for (const [key, anc, dist, ang] of spots) {
      const P = A.props[key]; if (!P) continue;
      try {
        let sn = anc && anc.road != null ? anc : null;
        if (!sn) { const base = anc || town; for (let k = 0; k < 14 && !sn; k++) { const a = (ang || 0) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5, d = (dist || 0) + k * 25; sn = w.snapToRoad(base.x + Math.cos(a) * d, base.z + Math.sin(a) * d, 260, 5); } }
        if (!sn) continue;
        const rp = w.roadPoint(sn.road, sn.s, 0, {}), h = rp.h, half = Math.max(P.w, P.d) / 2;
        for (const side of [1, -1]) {
          const off = 9 + half, x = sn.x + Math.cos(h) * off * side, z = sn.z - Math.sin(h) * off * side, th = h + (side > 0 ? -Math.PI / 2 : Math.PI / 2), c = Math.cos(th), s = -Math.sin(th);
          if (!this._free(w, x, z, P.w / 2, P.d / 2, c, s)) continue;
          this.items.push({ key, x, z, th, P, mesh: null, box: { i: -5000 - this.items.length, x, z, hw: P.w / 2, hd: P.d / 2, c, s, h: Math.min(P.h, 12), cls: 9, y: w.heightAt(x, z), prop: true } });
          break;
        }
      } catch (e) { console.warn('prop place failed', key, e); }
    }
    for (const it of this.items) { const b = it.box, r = Math.hypot(b.hw, b.hd) + 2; for (let gx = Math.floor((b.x - r) / GRID); gx <= Math.floor((b.x + r) / GRID); gx++) for (let gz = Math.floor((b.z - r) / GRID); gz <= Math.floor((b.z + r) / GRID); gz++) { const k = gx + ',' + gz; (this.extra.get(k) || this.extra.set(k, []).get(k)).push(b); } }
    if (this.items.length && !w.__propsHooked) {
      w.__propsHooked = true; const orig = w.buildingsNear;
      w.buildingsNear = (x, z) => { const base = orig(x, z); if (!this.extra.size) return base; const k = Math.floor(x / GRID) + ',' + Math.floor(z / GRID), ex = this.extra.get(k); if (!ex) return base; let m = this.merged.get(k); if (!m || m.base !== base) { m = { base, arr: base.concat(ex) }; this.merged.set(k, m); } return m.arr; };
    }
  }
  render(scene, fx, fz) {
    const w = this.G.world; if (!w) return; if (this.worldId !== w.meta.id) this.init();
    for (const it of this.items) {
      const near = Math.hypot(it.x - fx, it.z - fz) < SHOW;
      if (near && !it.mesh) { const m = it.P.scene.clone(true); m.position.set(it.x, w.heightAt(it.x, it.z), it.z); m.rotation.y = it.th; scene.add(m); it.mesh = m; }
      else if (!near && it.mesh) { scene.remove(it.mesh); it.mesh = null; }
    }
  }
}
