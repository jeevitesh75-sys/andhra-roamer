// Custom HUD: drag any control to a new place and resize it. Saved per device in localStorage.
const KEY = 'andhra.hud.v1';
const ITEMS = { radar: '#radar', vitals: '#vitals', money: '#moneyBox', dash: '#dash', objective: '#objective', wanted: '#wanted', steer: '#touch .tl', pedals: '#touch .tr', actions: '#touch .ta', menu: '#touch .tm', shoot: '#shootBtn', jump: '#jumpBtn', enter: '#enterBtn' };
const LABEL = { radar: 'Map', vitals: 'Health', money: 'Money', dash: 'Speedometer', objective: 'Mission box', wanted: 'Wanted', steer: 'Steering', pedals: 'Pedals', actions: 'Fire / Exit', menu: 'Menu buttons', shoot: 'Shoot', jump: 'Jump', enter: 'Enter' };
export class HudEditor {
  constructor(G, toast) { this.G = G; this.toast = toast; this.cfg = {}; this.sel = null; this.on = false; try { this.cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { this.cfg = {}; } this.bar = null; addEventListener('resize', () => this.applyAll()); }
  els() { const o = {}; for (const [k, q] of Object.entries(ITEMS)) { const e = document.querySelector(q); if (e) o[k] = e; } return o; }
  apply(k, el) { const c = this.cfg[k]; if (!c) { el.style.translate = ''; el.style.scale = ''; return; } el.style.translate = `${c.dx || 0}px ${c.dy || 0}px`; el.style.scale = String(c.s || 1); }
  applyAll() { for (const [k, el] of Object.entries(this.els())) { this.apply(k, el); if (this.cfg[k]) this.keepOnScreen(k, el); } }
  keepOnScreen(k, el) {
    const r = el.getBoundingClientRect(); if (!r.width) return; const c = this.cfg[k]; let fx = 0, fy = 0;
    if (r.left < 4) fx = 4 - r.left; else if (r.right > innerWidth - 4) fx = innerWidth - 4 - r.right;
    if (r.top < 4) fy = 4 - r.top; else if (r.bottom > innerHeight - 4) fy = innerHeight - 4 - r.bottom;
    if (fx || fy) { c.dx = (c.dx || 0) + fx; c.dy = (c.dy || 0) + fy; this.apply(k, el); }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch (e) { /* private mode */ } }
  start() {
    if (this.on) return; this.on = true; this.G.hudEdit = true; document.body.classList.add('hud-edit');
    this.bar = document.createElement('div'); this.bar.id = 'hudBar';
    this.bar.innerHTML = '<b>Edit HUD</b><span id="hudHint">Drag a control to move it. Tap it to choose, then resize.</span><input id="hudSize" type="range" min="50" max="170" value="100" disabled><button id="hudReset">Reset this</button><button id="hudAll">Reset all</button><button id="hudDone">Done</button>';
    document.body.appendChild(this.bar);
    const size = this.bar.querySelector('#hudSize');
    size.oninput = () => { if (!this.sel) return; (this.cfg[this.sel] = this.cfg[this.sel] || {}).s = size.value / 100; this.applyAll(); this.save(); };
    this.bar.querySelector('#hudReset').onclick = () => { if (this.sel) { delete this.cfg[this.sel]; this.applyAll(); this.save(); size.value = 100; } };
    this.bar.querySelector('#hudAll').onclick = () => { this.cfg = {}; this.applyAll(); this.save(); size.value = 100; };
    this.bar.querySelector('#hudDone').onclick = () => this.stop();
    this._down = e => this.down(e); this._move = e => this.move(e); this._up = () => { this.drag = null; this.save(); };
    for (const t of ['pointerdown', 'touchstart', 'mousedown', 'click']) addEventListener(t, this._block = this._block || (e => { if (this.on && !e.target.closest('#hudBar')) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } }), true);
    addEventListener('pointerdown', this._down, true); addEventListener('pointermove', this._move, true); addEventListener('pointerup', this._up, true); addEventListener('pointercancel', this._up, true);
    for (const [k, el] of Object.entries(this.els())) { el.classList.add('hud-item'); el.dataset.hud = k; }
    this.select(null);
  }
  select(k) {
    this.sel = k; for (const el of document.querySelectorAll('.hud-item')) el.classList.toggle('hud-sel', el.dataset.hud === k);
    const size = this.bar.querySelector('#hudSize'); size.disabled = !k; if (k) size.value = Math.round(((this.cfg[k] && this.cfg[k].s) || 1) * 100);
    this.bar.querySelector('#hudHint').textContent = k ? `${LABEL[k]} selected - drag to move, slider to resize` : 'Drag a control to move it. Tap it to choose, then resize.';
  }
  down(e) {
    if (!this.on || e.target.closest('#hudBar')) return; const el = e.target.closest('.hud-item'); if (!el) { this.select(null); return; }
    const k = el.dataset.hud; this.select(k); const c = this.cfg[k] = this.cfg[k] || {}; this.drag = { k, el, x: e.clientX, y: e.clientY, dx: c.dx || 0, dy: c.dy || 0 };
  }
  move(e) { const d = this.drag; if (!d) return; const c = this.cfg[d.k]; c.dx = d.dx + e.clientX - d.x; c.dy = d.dy + e.clientY - d.y; this.apply(d.k, d.el); this.keepOnScreen(d.k, d.el); }
  stop() {
    if (!this.on) return; this.on = false; this.G.hudEdit = false; document.body.classList.remove('hud-edit'); this.save();
    for (const t of ['pointerdown', 'touchstart', 'mousedown', 'click']) removeEventListener(t, this._block, true);
    removeEventListener('pointerdown', this._down, true); removeEventListener('pointermove', this._move, true); removeEventListener('pointerup', this._up, true); removeEventListener('pointercancel', this._up, true);
    for (const el of document.querySelectorAll('.hud-item')) { el.classList.remove('hud-item', 'hud-sel'); }
    this.bar.remove(); this.bar = null; this.toast('HUD layout saved', 1800);
  }
}
