// 2D map drawing (minimap + full map). Plain canvas, no three.js.
import { project } from './geo.js';

export class MapView {
  constructor(world) { this.w = world; this.cache = null; this.cacheKey = ''; }
  /** draw into ctx. mode 'mini': centred on (cx,cz) with radius rad; 'full': whole state fitted in canvas */
  draw(ctx, W, H, opts) {
    const w = this.w, full = opts.full;
    const view = full
      ? (() => { const sc = Math.min(W / w.WORLD.w, H / w.WORLD.h) * 0.96; return { sc, ox: W / 2 - (w.WORLD.w * sc) / 2 + 0, oz: H / 2 - (w.WORLD.h * sc) / 2 }; })()
      : (() => { const sc = Math.min(W, H) / (opts.radius * 2); return { sc, ox: W / 2 - opts.cx * sc, oz: H / 2 - opts.cz * sc }; })();
    const X = x => x * view.sc + view.ox, Z = z => z * view.sc + view.oz;
    ctx.save(); ctx.clearRect(0, 0, W, H);
    if (!full) { ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 1, 0, 7); ctx.clip(); }
    // sea
    ctx.fillStyle = '#7fb4d6'; ctx.fillRect(0, 0, W, H);
    // land polygon from the coastline (everything west of it)
    ctx.beginPath(); const c = w.coast;
    ctx.moveTo(X(-5000), Z(c[0][1] - 5000));
    ctx.lineTo(X(c[0][0]), Z(c[0][1] - 5000));
    for (const p of c) ctx.lineTo(X(p[0]), Z(p[1]));
    ctx.lineTo(X(c[c.length - 1][0]), Z(w.WORLD.h + 5000)); ctx.lineTo(X(-5000), Z(w.WORLD.h + 5000)); ctx.closePath();
    ctx.fillStyle = '#d9e3b8'; ctx.fill();
    // hills as soft shading
    for (const h of w.hills) {
      const r = Math.sqrt(h.r2) * view.sc * 1.2; if (r < 2) continue;
      const g = ctx.createRadialGradient(X(h.x), Z(h.z), 0, X(h.x), Z(h.z), r);
      g.addColorStop(0, 'rgba(120,104,70,0.55)'); g.addColorStop(1, 'rgba(120,104,70,0)'); ctx.fillStyle = g;
      ctx.fillRect(X(h.x) - r, Z(h.z) - r, r * 2, r * 2);
    }
    // rivers
    ctx.strokeStyle = '#7fb4d6'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of w.rivers) { ctx.lineWidth = Math.max(1.5, r.w * view.sc * 1.2); ctx.beginPath(); r.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1])))); ctx.stroke(); }
    // roads
    for (const pass of [0, 1]) {
      for (const r of w.roads) {
        const nh = r.kind === 'nh', ghat = r.kind === 'ghat';
        ctx.strokeStyle = pass === 0 ? '#ffffff' : ghat ? '#c0392b' : nh ? '#e8a33d' : '#8a8a8a';
        ctx.lineWidth = (pass === 0 ? 2.2 : 1.2) * (full ? 1 : 1.6) * (nh ? 1.2 : 1);
        ctx.beginPath();
        for (let i = 0; i < r.n; i += 4) { const x = X(r.pts[2 * i]), z = Z(r.pts[2 * i + 1]); i ? ctx.lineTo(x, z) : ctx.moveTo(x, z); }
        ctx.stroke();
      }
    }
    // cities
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const city of w.cities) {
      const x = X(city.x), z = Z(city.z);
      if (x < -40 || z < -20 || x > W + 40 || z > H + 20) continue;
      const rad = (full ? 3 + city.tier * 1.6 : 3 + city.tier * 1.2);
      ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.arc(x, z, rad, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, z, rad - 1.6, 0, 7); ctx.fill();
      if (full ? city.tier >= 1 || opts.zoomLabels : city.tier >= 1) {
        ctx.font = `600 ${full ? 11 : 10}px system-ui, sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.strokeText(city.name, x, z - rad - 7); ctx.fillStyle = '#1b2a38'; ctx.fillText(city.name, x, z - rad - 7);
      }
    }
    // job target
    if (opts.target) {
      const x = X(opts.target.x), z = Z(opts.target.z);
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, z, 8 + 2 * Math.sin(performance.now() / 250), 0, 7); ctx.stroke();
      ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(x, z, 3, 0, 7); ctx.fill();
    }
    // other players
    for (const p of opts.players || []) {
      ctx.fillStyle = p.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 4, 0, 7); ctx.fill(); ctx.stroke();
      if (full) { ctx.font = '600 10px system-ui'; ctx.fillStyle = '#1b2a38'; ctx.fillText(p.name, X(p.x), Z(p.z) - 10); }
    }
    // me (arrow)
    if (opts.me) {
      ctx.save(); ctx.translate(X(opts.me.x), Z(opts.me.z)); ctx.rotate(-opts.me.h); // forward = (sin h, cos h) on a map where z grows downward
      ctx.rotate(opts.rotate || 0);
      ctx.fillStyle = '#1e90ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(0, 9); ctx.lineTo(-6, -7); ctx.lineTo(0, -3); ctx.lineTo(6, -7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
}
export { project };
