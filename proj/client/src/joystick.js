// Floating analog joystick (Free Fire / BGMI style): touch anywhere in the left zone, the stick appears under your thumb.
// Exposes x (right +), y (up/forward +), mag 0..1 after a dead zone. Also works with a mouse for desktop testing.
export class Joystick {
  constructor(zone, base, knob, opts = {}) {
    this.zone = zone; this.base = base; this.knob = knob; this.R = opts.radius || 58; this.dead = opts.dead ?? 0.12;
    this.x = 0; this.y = 0; this.mag = 0; this.active = false; this.id = null; this.cx = 0; this.cy = 0; this.home = { x: 100, y: 0 };
    zone.addEventListener('pointerdown', e => this._down(e)); zone.addEventListener('pointermove', e => this._move(e));
    zone.addEventListener('pointerup', e => this._up(e)); zone.addEventListener('pointercancel', e => this._up(e)); zone.addEventListener('contextmenu', e => e.preventDefault());
    this.layout();
  }
  /** idle resting position of the ghost stick (bottom-left) */
  layout() { const h = window.innerHeight; this.home = { x: Math.min(110, window.innerWidth * 0.14), y: h - Math.min(120, h * 0.26) }; if (!this.active) this._place(this.home.x, this.home.y); }
  _place(x, y) { this.cx = x; this.cy = y; this.base.style.left = x + 'px'; this.base.style.top = y + 'px'; }
  _down(e) {
    if (this.active) return; e.preventDefault(); this.active = true; this.id = e.pointerId; try { this.zone.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const m = 80; this._place(Math.max(m, Math.min(window.innerWidth * 0.5, e.clientX)), Math.max(m, Math.min(window.innerHeight - 20, e.clientY)));
    this.base.classList.remove('idle'); this._set(e.clientX, e.clientY);
  }
  _move(e) { if (!this.active || e.pointerId !== this.id) return; e.preventDefault(); this._set(e.clientX, e.clientY); }
  _up(e) { if (e.pointerId !== this.id) return; this.release(); }
  release() { this.active = false; this.id = null; this.x = this.y = this.mag = 0; this.knob.style.transform = ''; this.base.classList.add('idle'); this._place(this.home.x, this.home.y); }
  _set(px, py) {
    let dx = px - this.cx, dy = py - this.cy; const d = Math.hypot(dx, dy), R = this.R;
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    let m = Math.min(1, Math.hypot(dx, dy) / R); if (m < this.dead) { this.x = this.y = this.mag = 0; return; }
    m = (m - this.dead) / (1 - this.dead); const a = Math.atan2(dy, dx);
    this.x = Math.cos(a) * m; this.y = -Math.sin(a) * m; this.mag = m;
  }
  /** test hook / keyboard fallback: set the stick directly */
  setVec(x, y) { const m = Math.min(1, Math.hypot(x, y)); this.x = x; this.y = y; this.mag = m; }
}
