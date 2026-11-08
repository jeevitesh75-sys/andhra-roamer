// 2D map drawing (minimap + full map) for the real OSM world. Plain canvas, no three.js.
const LAND = ['#e6e8cc', '#8cc0e0', '#ebe4d8', '#e0e7ba', '#bfdaa6', '#d0e7ba', '#dcd9d9', '#f1e7c3', '#e2d4b8'];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ROAD_COL = ['#e8903d', '#e8903d', '#f2b84b', '#f6d27a', '#ffffff', '#ffffff', '#ffffff', '#f4f4f4', '#d8c9a8'];
const ROAD_W = [10, 9, 8, 7, 6, 5, 4.5, 3, 3];   // approx metres wide on the map

export class MapView {
  constructor(world) { this.w = world; this.land = null; this.f = 4; this.fullRoads = null; }
  _landCanvas() {
    if (this.land) return this.land;
    const w = this.w, f = this.f, cw = Math.ceil(w.landW / f), ch = Math.ceil(w.landH / f);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d'), im = x.createImageData(cw, ch), pal = LAND.map(hex);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const k = w.landClass(Math.min(w.landW - 1, i * f + (f >> 1)), Math.min(w.landH - 1, j * f + (f >> 1))), p = pal[k] || pal[0], o = (j * cw + i) * 4; im.data[o] = p[0]; im.data[o + 1] = p[1]; im.data[o + 2] = p[2]; im.data[o + 3] = 255; }
    x.putImageData(im, 0, 0); return (this.land = c);
  }
  _drawRuns(ctx, runs, X, Z, sc, pass, full) {
    for (const u of runs) {
      const r = u.road, cls = r.cls;
      ctx.lineWidth = Math.max(full ? 1 : 1.4, ROAD_W[cls] * sc * (pass === 0 ? 1.5 : 1));
      ctx.strokeStyle = pass === 0 ? '#9aa0a6' : ROAD_COL[cls];
      ctx.beginPath();
      for (let i = u.a; i <= u.b; i++) { const x = X(r.pts[2 * i]), z = Z(r.pts[2 * i + 1]); i === u.a ? ctx.moveTo(x, z) : ctx.lineTo(x, z); }
      ctx.stroke();
    }
  }
  /** mode 'mini': centred on (cx,cz) with radius; 'full': whole region fitted in canvas */
  draw(ctx, W, H, opts) {
    const w = this.w, full = opts.full, WD = w.WORLD, cell = w.meta.cell;
    const view = full
      ? (() => { const z = opts.zoom || 1, sc = Math.min(W / WD.w, H / WD.h) * 0.97 * z, mx = opts.mcx ?? WD.w / 2, mz = opts.mcz ?? WD.h / 2; return { sc, ox: W / 2 - mx * sc, oz: H / 2 - mz * sc, z }; })()
      : (() => { const sc = Math.min(W, H) / (opts.radius * 2); return { sc, ox: W / 2 - opts.cx * sc, oz: H / 2 - opts.cz * sc }; })();
    this.view = view; const X = x => x * view.sc + view.ox, Z = z => z * view.sc + view.oz, sc = view.sc;
    ctx.save(); ctx.clearRect(0, 0, W, H);
    if (!full) { ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 1, 0, 7); ctx.clip(); }
    ctx.fillStyle = '#e6e8cc'; ctx.fillRect(0, 0, W, H);
    const land = this._landCanvas(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(land, X(0), Z(0), land.width * this.f * cell * sc, land.height * this.f * cell * sc);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (full && (opts.zoom || 1) > 1.001) { // zoomed: draw the visible part directly, with more road classes as you zoom in
      const x0 = -view.ox / sc, z0 = -view.oz / sc, x1 = x0 + W / sc, z1 = z0 + H / sc, maxCls = view.z > 12 ? 7 : view.z > 5 ? 5 : view.z > 2.5 ? 4 : 3;
      const runs = w.roadsInRect(Math.max(0, x0), Math.max(0, z0), Math.min(WD.w, x1), Math.min(WD.h, z1), maxCls);
      this._drawRuns(ctx, runs, X, Z, sc, 0, true); this._drawRuns(ctx, runs, X, Z, sc, 1, true);
    } else if (full) {
      if (!this.fullRoads || this.fullRoads.key !== W + 'x' + H) { // cache the road layer: only the bigger roads, drawn once
        const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.lineCap = 'round'; x.lineJoin = 'round';
        const runs = w.roadsInRect(0, 0, WD.w, WD.h, 4);
        this._drawRuns(x, runs, X, Z, sc, 0, true); this._drawRuns(x, runs, X, Z, sc, 1, true);
        this.fullRoads = { key: W + 'x' + H, canvas: c };
      }
      ctx.drawImage(this.fullRoads.canvas, 0, 0);
    } else {
      const R = opts.radius * 1.2, maxCls = opts.radius > 1500 ? 4 : 7, runs = w.roadsInRect(opts.cx - R, opts.cz - R, opts.cx + R, opts.cz + R, maxCls);
      this._drawRuns(ctx, runs, X, Z, sc, 0, false); this._drawRuns(ctx, runs, X, Z, sc, 1, false);
    }
    // hubs
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const city of w.cities) {
      const x = X(city.x), z = Z(city.z);
      if (x < -40 || z < -20 || x > W + 40 || z > H + 20) continue;
      if (!full && city.tier < 1) continue;
      const rad = full ? 2.5 + city.tier * 1.6 : 3 + city.tier * 1.2;
      ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.arc(x, z, rad, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, z, rad - 1.5, 0, 7); ctx.fill();
      if (full ? city.tier >= 1 || (opts.zoom || 1) > 3 : true) {
        ctx.font = `600 ${full ? 11 : 10}px system-ui, sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.strokeText(city.name, x, z - rad - 7); ctx.fillStyle = '#1b2a38'; ctx.fillText(city.name, x, z - rad - 7);
      }
    }
    // petrol stations
    ctx.fillStyle = '#d63031'; for (const s of w.stations) { const x = X(s.x), z = Z(s.z); if (x < 0 || z < 0 || x > W || z > H) continue; ctx.beginPath(); ctx.arc(x, z, full ? 1.8 : 3, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#1d4ed8'; for (const s of w.policeStations || []) { const x = X(s.x), z = Z(s.z); if (x < 0 || z < 0 || x > W || z > H) continue; const r = full ? 3 : 4; ctx.fillRect(x - r, z - r, r * 2, r * 2); ctx.fillStyle = '#fff'; ctx.font = `700 ${full ? 7 : 7}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('P', x, z + 2.5); ctx.fillStyle = '#1d4ed8'; }
    // job target
    if (opts.target) {
      const x = X(opts.target.x), z = Z(opts.target.z);
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, z, 8 + 2 * Math.sin(performance.now() / 250), 0, 7); ctx.stroke();
      ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(x, z, 3, 0, 7); ctx.fill();
    }
    if (opts.wp) {   // waypoint pin + dashed guide line
      const x = X(opts.wp.x), z = Z(opts.wp.z);
      if (opts.me) { ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(59,157,255,.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(opts.me.x), Z(opts.me.z)); ctx.lineTo(x, z); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = '#3b9dff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, z - 9, 8, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 5, z - 4); ctx.lineTo(x, z + 3); ctx.lineTo(x + 5, z - 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, z - 9, 3, 0, 7); ctx.fill();
    }
    // railway stations
    ctx.fillStyle = '#1b4f9c'; for (const s of w.railStations || []) { const x = X(s.x), z = Z(s.z); if (x < 0 || z < 0 || x > W || z > H) continue; ctx.fillRect(x - 4, z - 4, 8, 8); ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, z - 2, 4, 4); ctx.fillStyle = '#1b4f9c'; if (full ? (opts.zoom || 1) > 2.5 : true) { ctx.font = '600 9px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.strokeText(s.name, x, z - 9); ctx.fillText(s.name, x, z - 9); } }
    // other players
    for (const p of opts.players || []) {
      ctx.fillStyle = p.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 4, 0, 7); ctx.fill(); ctx.stroke();
      if (full) { ctx.font = '600 10px system-ui'; ctx.fillStyle = '#1b2a38'; ctx.fillText(p.name, X(p.x), Z(p.z) - 10); }
    }
    // me (arrow)
    if (opts.me) {
      ctx.save(); ctx.translate(X(opts.me.x), Z(opts.me.z)); ctx.rotate(-opts.me.h);
      ctx.rotate(opts.rotate || 0);
      ctx.fillStyle = '#1e90ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(0, 9); ctx.lineTo(-6, -7); ctx.lineTo(0, -3); ctx.lineTo(6, -7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
}
