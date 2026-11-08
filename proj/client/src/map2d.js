// 2D map drawing (minimap + full map) for the real OSM world. Plain canvas, no three.js.
// GTA III look: muted olive land, slate water, light roads with dark outlines, dark building blocks
const G3 = { land: ['#8d917a', '#5f86a8', '#8a8780', '#8a9876', '#7a9568', '#839b6e', '#85847f', '#979479', '#8a8570'], bg: '#8d917a', outline: '#1d1d1b',
  road: ['#f0e6a8', '#f0e6a8', '#e4dfc2', '#dcd9c8', '#c9c7b9', '#c9c7b9', '#bcbaad', '#b3b1a4', '#9d9a8c'], bld: '#6b6b66', bldEdge: '#4b4b47', grid: 'rgba(0,0,0,.08)' };
const LAND = ['#e6e8cc', '#8cc0e0', '#ebe4d8', '#e0e7ba', '#bfdaa6', '#d0e7ba', '#dcd9d9', '#f1e7c3', '#e2d4b8'];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ROAD_COL = ['#e8903d', '#e8903d', '#f2b84b', '#f6d27a', '#ffffff', '#ffffff', '#ffffff', '#f4f4f4', '#d8c9a8'];
const ROAD_W = [10, 9, 8, 7, 6, 5, 4.5, 3, 3];   // approx metres wide on the map

export class MapView {
  constructor(world) { this.w = world; this.land = null; this.landG3 = null; this.f = 4; this.fullRoads = null; this.fullRoadsG3 = null; }
  _landCanvas(g3) {
    if (g3 ? this.landG3 : this.land) return g3 ? this.landG3 : this.land;
    const w = this.w, f = this.f, cw = Math.ceil(w.landW / f), ch = Math.ceil(w.landH / f);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d'), im = x.createImageData(cw, ch), pal = (g3 ? G3.land : LAND).map(hex);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const k = w.landClass(Math.min(w.landW - 1, i * f + (f >> 1)), Math.min(w.landH - 1, j * f + (f >> 1))), p = pal[k] || pal[0], o = (j * cw + i) * 4; im.data[o] = p[0]; im.data[o + 1] = p[1]; im.data[o + 2] = p[2]; im.data[o + 3] = 255; }
    x.putImageData(im, 0, 0); if (g3) this.landG3 = c; else this.land = c; return c;
  }
  _drawRuns(ctx, runs, X, Z, sc, pass, full, g3) {
    for (const u of runs) {
      const r = u.road, cls = r.cls;
      ctx.lineWidth = Math.max(full ? 1 : 1.4, ROAD_W[cls] * sc * (pass === 0 ? (g3 ? 1.7 : 1.5) : 1)) + (g3 && pass === 1 ? 0.4 : 0);
      ctx.strokeStyle = pass === 0 ? (g3 ? G3.outline : '#9aa0a6') : (g3 ? G3.road[cls] : ROAD_COL[cls]);
      ctx.beginPath();
      for (let i = u.a; i <= u.b; i++) { const x = X(r.pts[2 * i]), z = Z(r.pts[2 * i + 1]); i === u.a ? ctx.moveTo(x, z) : ctx.lineTo(x, z); }
      ctx.stroke();
    }
  }
  _buildings(ctx, X, Z, sc, x0, z0, x1, z1, cap) {
    if (!this.w.buildingsInRect) return; const list = this.w.buildingsInRect(x0, z0, x1, z1); ctx.fillStyle = G3.bld; ctx.strokeStyle = G3.bldEdge; ctx.lineWidth = 0.7;
    const n = Math.min(list.length, cap);
    for (let i = 0; i < n; i++) { const b = list[i], w2 = Math.max(1.5, b.hw * 2 * sc), h2 = Math.max(1.5, b.hd * 2 * sc); ctx.save(); ctx.translate(X(b.x), Z(b.z)); ctx.rotate(-Math.atan2(b.s, b.c)); ctx.fillRect(-w2 / 2, -h2 / 2, w2, h2); ctx.restore(); }
  }
  /** GTA III style blip: coloured disc with black outline; off-radar blips stick to the ring */
  _blip(ctx, bx, bz, b, W, H, full, rot, rotA) {
    let x = bx, z = bz, edge = false;
    if (!full) { const cx = W / 2, cy = H / 2, R = W / 2 - 9; let dx = x - cx, dy = z - cy; if (rot) { const c = Math.cos(rotA), s2 = Math.sin(rotA), rx = dx * c - dy * s2, ry = dx * s2 + dy * c; dx = rx; dy = ry; } const d = Math.hypot(dx, dy); if (d > R) { dx = dx / d * R; dy = dy / d * R; edge = true; } if (rot) { const c = Math.cos(-rotA), s2 = Math.sin(-rotA), rx = dx * c - dy * s2, ry = dx * s2 + dy * c; dx = rx; dy = ry; } x = cx + dx; z = cy + dy; }
    const r = (b.r || 5) * (edge ? 0.8 : 1), col = b.color || '#fff';
    ctx.save(); ctx.translate(x, z); if (rot) ctx.rotate(-rotA);
    if (b.shape === 'sq') { ctx.fillStyle = '#000'; ctx.fillRect(-r - 1.5, -r - 1.5, 2 * r + 3, 2 * r + 3); ctx.fillStyle = col; ctx.fillRect(-r, -r, 2 * r, 2 * r); }
    else if (b.shape === 'tri') { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -r - 2); ctx.lineTo(r + 2, r + 1.5); ctx.lineTo(-r - 2, r + 1.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, r + 1.6, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); }
    if (b.glyph) { ctx.fillStyle = b.gcolor || '#000'; ctx.font = `800 ${Math.round(r * 1.5)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.glyph, 0, 0.5); }
    if (full && b.label) { ctx.font = '700 10px system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = '#fff'; ctx.strokeText(b.label, 0, -r - 7); ctx.fillText(b.label, 0, -r - 7); }
    ctx.restore();
  }
  /** mode 'mini': centred on (cx,cz) with radius; 'full': whole region fitted in canvas */
  draw(ctx, W, H, opts) {
    const w = this.w, full = opts.full, WD = w.WORLD, cell = w.meta.cell, g3 = opts.theme === 'gta3', rot = !full && opts.rotateH !== undefined;
    const view = full
      ? (() => { const z = opts.zoom || 1, sc = Math.min(W / WD.w, H / WD.h) * 0.97 * z, mx = opts.mcx ?? WD.w / 2, mz = opts.mcz ?? WD.h / 2; return { sc, ox: W / 2 - mx * sc, oz: H / 2 - mz * sc, z }; })()
      : (() => { const sc = Math.min(W, H) / (opts.radius * 2); return { sc, ox: W / 2 - opts.cx * sc, oz: H / 2 - opts.cz * sc }; })();
    this.view = view; const X = x => x * view.sc + view.ox, Z = z => z * view.sc + view.oz, sc = view.sc;
    ctx.save(); ctx.clearRect(0, 0, W, H);
    if (!full) { ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 1, 0, 7); ctx.clip(); }
    ctx.fillStyle = g3 ? G3.bg : '#e6e8cc'; ctx.fillRect(0, 0, W, H);
    if (rot) { ctx.translate(W / 2, H / 2); ctx.rotate(opts.rotateH - Math.PI); ctx.translate(-W / 2, -H / 2); ctx.fillStyle = g3 ? G3.bg : '#e6e8cc'; ctx.fillRect(-W, -H, W * 3, H * 3); }
    const land = this._landCanvas(g3); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(land, X(0), Z(0), land.width * this.f * cell * sc, land.height * this.f * cell * sc);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (full && (opts.zoom || 1) > 1.001) { // zoomed: draw the visible part directly, with more road classes as you zoom in
      const x0 = -view.ox / sc, z0 = -view.oz / sc, x1 = x0 + W / sc, z1 = z0 + H / sc, maxCls = view.z > 12 ? 7 : view.z > 5 ? 5 : view.z > 2.5 ? 4 : 3;
      const runs = w.roadsInRect(Math.max(0, x0), Math.max(0, z0), Math.min(WD.w, x1), Math.min(WD.h, z1), maxCls);
      this._drawRuns(ctx, runs, X, Z, sc, 0, true, g3); this._drawRuns(ctx, runs, X, Z, sc, 1, true, g3);
      if (g3 && view.z > 6) this._buildings(ctx, X, Z, sc, Math.max(0, x0), Math.max(0, z0), Math.min(WD.w, x1), Math.min(WD.h, z1), 2500);
    } else if (full) {
      const cacheKey = g3 ? 'fullRoadsG3' : 'fullRoads';
      if (!this[cacheKey] || this[cacheKey].key !== W + 'x' + H) { // cache the road layer: only the bigger roads, drawn once
        const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.lineCap = 'round'; x.lineJoin = 'round';
        const runs = w.roadsInRect(0, 0, WD.w, WD.h, 4);
        this._drawRuns(x, runs, X, Z, sc, 0, true, g3); this._drawRuns(x, runs, X, Z, sc, 1, true, g3);
        this[cacheKey] = { key: W + 'x' + H, canvas: c };
      }
      ctx.drawImage(this[cacheKey].canvas, 0, 0);
    } else {
      const R = opts.radius * (rot ? 1.5 : 1.2), maxCls = opts.radius > 1500 ? 4 : 7, runs = w.roadsInRect(opts.cx - R, opts.cz - R, opts.cx + R, opts.cz + R, maxCls);
      if (g3 && opts.radius <= 900) this._buildings(ctx, X, Z, sc, opts.cx - R, opts.cz - R, opts.cx + R, opts.cz + R, 1800);
      this._drawRuns(ctx, runs, X, Z, sc, 0, false, g3); this._drawRuns(ctx, runs, X, Z, sc, 1, false, g3);
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
      if (full ? city.tier >= 1 || (opts.zoom || 1) > 3 : !rot) {
        ctx.font = `600 ${full ? 11 : 10}px system-ui, sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.strokeText(city.name, x, z - rad - 7); ctx.fillStyle = '#1b2a38'; ctx.fillText(city.name, x, z - rad - 7);
      }
    }
    // petrol stations
    ctx.fillStyle = '#d63031'; for (const s of w.stations) { const x = X(s.x), z = Z(s.z); if (x < 0 || z < 0 || x > W || z > H) continue; ctx.beginPath(); ctx.arc(x, z, full ? 1.8 : 3, 0, 7); ctx.fill(); }
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
    ctx.fillStyle = '#1b4f9c'; for (const s of w.railStations || []) { const x = X(s.x), z = Z(s.z); if (x < 0 || z < 0 || x > W || z > H) continue; ctx.fillRect(x - 4, z - 4, 8, 8); ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, z - 2, 4, 4); ctx.fillStyle = '#1b4f9c'; if (full ? (opts.zoom || 1) > 2.5 : !rot) { ctx.font = '600 9px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.strokeText(s.name, x, z - 9); ctx.fillText(s.name, x, z - 9); } }
    // other players
    for (const p of opts.players || []) {
      ctx.fillStyle = p.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 4, 0, 7); ctx.fill(); ctx.stroke();
      if (full) { ctx.font = '600 10px system-ui'; ctx.fillStyle = '#1b2a38'; ctx.fillText(p.name, X(p.x), Z(p.z) - 10); }
    }
    // GTA III blips (police stations, story objectives, enemies...) - drawn in screen space, off-radar ones clamp to the ring
    if (opts.blips && opts.blips.length) {
      ctx.save(); if (rot) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
      const rA = rot ? opts.rotateH - Math.PI : 0, cs = Math.cos(rA), sn = Math.sin(rA);
      for (const b of opts.blips) {
        let bx = X(b.x), bz = Z(b.z);
        if (rot) { const dx = bx - W / 2, dy = bz - H / 2; bx = W / 2 + dx * cs - dy * sn; bz = H / 2 + dx * sn + dy * cs; }
        if (full && (bx < -10 || bz < -10 || bx > W + 10 || bz > H + 10)) continue;
        this._blip(ctx, bx, bz, b, W, H, full, false, 0);
      }
      ctx.restore();
    }
    // me (arrow)
    if (opts.me && !rot) {
      ctx.save(); ctx.translate(X(opts.me.x), Z(opts.me.z)); ctx.rotate(-opts.me.h);
      ctx.rotate(opts.rotate || 0);
      ctx.fillStyle = '#1e90ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(0, 9); ctx.lineTo(-6, -7); ctx.lineTo(0, -3); ctx.lineTo(6, -7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (rot) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(-8, 9); ctx.lineTo(0, 4); ctx.lineTo(8, 9); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
      const na = -Math.PI / 2 + (opts.rotateH - Math.PI), R = W / 2 - 11; ctx.save(); ctx.translate(W / 2 + Math.cos(na) * R, H / 2 + Math.sin(na) * R); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '800 14px Impact, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, 1); ctx.restore();
    }
    ctx.restore();
  }
}
