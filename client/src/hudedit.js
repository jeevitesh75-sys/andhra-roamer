// Custom HUD: drag any control button / panel to where your thumbs like it and resize it. Saved on this device.
const KEY = 'ar_hud3';
const ITEMS = [['tl', '#touch .tl', 'Steering'], ['tr', '#touch .tr', 'Gas / Brake / Rev'], ['ta', '#touch .ta', 'Fire / Exit'], ['tm', '#touch .tm', 'Side menu'], ['shoot', '#shootBtn', 'Shoot'], ['jump', '#jumpBtn', 'Jump'], ['enter', '#enterBtn', 'Enter'], ['radar', '#radar', 'Radar'], ['dash', '#dash', 'Speedometer'], ['obj', '#objective', 'Objective'], ['money', '#moneyBox', 'Money'], ['sys', '#sysBar', 'Top buttons']];
export class HudEdit {
  constructor(G, toast) {
    this.G = G; this.toast = toast; this.cfg = {}; this.sel = null; this.on = false; this.drag = null; this.saved = {};
    try { this.cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { this.cfg = {}; }
    this.els = ITEMS.map(([id, q, name]) => ({ id, name, el: document.querySelector(q) })).filter(x => x.el);
    for (const x of this.els) x.el.dataset.hid = x.id;
    this.bar = document.getElementById('hudEdit'); this.scale = document.getElementById('hudScale'); this.lab = document.getElementById('hudSel');
    document.getElementById('hudDone').onclick = () => this.stop(); document.getElementById('hudReset').onclick = () => { this.cfg = {}; this.save(); this.apply(); this.sel = null; this.lab.textContent = 'Reset. Drag a button to move it.'; };
    this.scale.oninput = () => { if (!this.sel) return; const c = this.get(this.sel); c.s = Number(this.scale.value); this.save(); this.apply(); };
    const cap = fn => e => { if (!this.on) return; if (this.bar.contains(e.target)) return; fn(e); };
    const block = e => { e.preventDefault(); e.stopImmediatePropagation(); };
    for (const t of ['touchstart', 'touchend', 'touchmove', 'touchcancel', 'click', 'mousedown', 'mouseup', 'contextmenu']) addEventListener(t, cap(block), true);
    addEventListener('pointerdown', cap(e => { block(e); const x = this.els.find(q => q.el.contains(e.target)); if (!x) return; this.pick(x.id); const c = this.get(x.id); this.drag = { id: x.id, sx: e.clientX, sy: e.clientY, ox: c.x || 0, oy: c.y || 0, pid: e.pointerId }; }), true);
    addEventListener('pointermove', e => { if (!this.on || !this.drag || e.pointerId !== this.drag.pid) return; e.preventDefault(); const c = this.get(this.drag.id); c.x = this.drag.ox + e.clientX - this.drag.sx; c.y = this.drag.oy + e.clientY - this.drag.sy; this.apply(this.drag.id); }, true);
    const end = e => { if (!this.on || !this.drag || e.pointerId !== this.drag.pid) return; this.clamp(this.drag.id); this.drag = null; this.save(); };
    addEventListener('pointerup', end, true); addEventListener('pointercancel', end, true);
    this.apply();
  }
  get(id) { return this.cfg[id] || (this.cfg[id] = { x: 0, y: 0, s: 1 }); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch (e) { /* ignore */ } }
  apply(only) { for (const x of this.els) { if (only && x.id !== only) continue; const c = this.cfg[x.id]; x.el.style.translate = c && (c.x || c.y) ? `${Math.round(c.x)}px ${Math.round(c.y)}px` : ''; x.el.style.scale = c && c.s && c.s !== 1 ? String(c.s) : ''; } }
  clamp(id) { const x = this.els.find(q => q.id === id), c = this.cfg[id]; if (!x || !c) return; const r = x.el.getBoundingClientRect(), W = innerWidth, H = innerHeight; let dx = 0, dy = 0; const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 12) dx = 12 - cx; if (cx > W - 12) dx = W - 12 - cx; if (cy < 12) dy = 12 - cy; if (cy > H - 12) dy = H - 12 - cy; if (dx || dy) { c.x += dx; c.y += dy; this.apply(id); } }
  pick(id) { this.sel = id; const x = this.els.find(q => q.id === id), c = this.get(id); this.scale.value = String(c.s || 1); this.lab.textContent = `${x.name}: drag to move, slider to resize`; for (const q of this.els) q.el.classList.toggle('hsel', q.id === id); }
  start() {
    if (this.on) return; this.on = true; this.G.hudEditing = true; document.body.classList.add('hud-edit'); this.bar.hidden = false; this.lab.textContent = 'Drag any button to move it. Tap one to resize it.'; this.sel = null;
    for (const id of ['touch', 'footBtns', 'enterBtn', 'hud']) { const e = document.getElementById(id); if (e) { this.saved[id] = e.hidden; e.hidden = false; } }
  }
  stop() {
    if (!this.on) return; this.on = false; this.G.hudEditing = false; document.body.classList.remove('hud-edit'); this.bar.hidden = true; for (const q of this.els) q.el.classList.remove('hsel');
    for (const id in this.saved) { const e = document.getElementById(id); if (e && id !== 'hud') e.hidden = this.saved[id]; } this.saved = {}; this.save(); this.G.paused = false; this.toast('Layout saved on this device', 2000);
  }
}
