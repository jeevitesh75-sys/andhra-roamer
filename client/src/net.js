// WebSocket client: join, send my state at 15 Hz, interpolate remote players, shared server clock.
const SEND_MS = 66;

export class Net {
  constructor(handlers = {}) {
    this.h = handlers; this.ws = null; this.status = 'offline'; this.id = 0; this.room = ''; this.profile = null;
    this.remotes = new Map(); this.offset = 0; this.rtt = 0; this.lastSend = 0; this.tries = 0; this.wanted = false; this.timer = null;
  }
  setStatus(s, detail = '') { this.status = s; this.h.onStatus && this.h.onStatus(s, detail); }
  /** server-synchronised wall clock (ms) */
  now() { return Date.now() + this.offset; }

  connect(url, profile) {
    this.url = url; this.profile = profile; this.wanted = true; this.tries = 0; this._open();
  }
  _open() {
    if (!this.wanted || !this.url) return;
    clearTimeout(this.timer);
    this.setStatus('connecting', this.tries > 1 ? 'Waking the free server... this can take up to a minute' : 'Connecting...');
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { return this._retry(); }
    this.ws = ws;
    const giveUp = setTimeout(() => { if (ws.readyState !== 1) { try { ws.close(); } catch (e) { /* ignore */ } } }, 20000);
    ws.onopen = () => { clearTimeout(giveUp); this.tries = 0; this.send({ t: 'join', ...this.profile }); this._ping(); };
    ws.onmessage = ev => { try { this._msg(JSON.parse(ev.data)); } catch (e) { /* ignore bad frame */ } };
    ws.onclose = () => { clearTimeout(giveUp); this.remotes.clear(); this.id = 0; if (this.status === 'online') this.h.onLeaveAll && this.h.onLeaveAll(); this._retry(); };
    ws.onerror = () => { /* onclose follows */ };
  }
  _retry() {
    if (!this.wanted) return;
    this.setStatus('offline', 'Playing offline. Retrying...');
    this.tries++;
    this.timer = setTimeout(() => this._open(), Math.min(15000, 2000 + this.tries * 2000));
  }
  disconnect() { this.wanted = false; clearTimeout(this.timer); if (this.ws) try { this.ws.close(); } catch (e) { /* ignore */ } this.remotes.clear(); this.setStatus('offline', ''); }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  _ping() { if (this.ws && this.ws.readyState === 1) { this.send({ t: 'ping', ts: Date.now() }); setTimeout(() => this._ping(), 4000); } }

  _addRemote(p) {
    const r = { id: p.id, name: p.name, veh: p.veh, color: p.color, money: p.money || 0, snaps: [], chat: '', chatAt: 0 };
    if (p.x !== undefined) r.snaps.push({ t: performance.now(), x: p.x, z: p.z, h: p.h || 0, v: p.v || 0, st: p.st || 0, f: p.f || 0 });
    this.remotes.set(p.id, r); return r;
  }
  _msg(m) {
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.room = m.room; this.offset = m.time - Date.now();
        this.remotes.clear(); for (const p of m.players) this._addRemote(p);
        this.setStatus('online', m.room); this.h.onWelcome && this.h.onWelcome(m); break;
      case 'join': { const r = this._addRemote(m.p); this.h.onJoin && this.h.onJoin(r); break; }
      case 'leave': { const r = this.remotes.get(m.id); this.remotes.delete(m.id); if (r) this.h.onLeave && this.h.onLeave(r); break; }
      case 'veh': { const r = this.remotes.get(m.id); if (r) { r.veh = m.veh; r.color = m.color; this.h.onVeh && this.h.onVeh(r); } break; }
      case 'snap': {
        const t = performance.now();
        for (const a of m.p) {
          if (a[0] === this.id) continue;
          const r = this.remotes.get(a[0]); if (!r) continue;
          r.snaps.push({ t, x: a[1], z: a[2], h: a[3], v: a[4], st: a[5], f: a[6] });
          if (r.snaps.length > 12) r.snaps.shift();
        }
        break;
      }
      case 'roster': for (const [id, money] of m.p) { const r = this.remotes.get(id); if (r) r.money = money; } this.h.onRoster && this.h.onRoster(m.p); break;
      case 'chat': this.h.onChat && this.h.onChat(m); { const r = this.remotes.get(m.id); if (r) { r.chat = m.text; r.chatAt = performance.now(); } } break;
      case 'foot': { const r = this.remotes.get(m.id); if (r) r.foot = { on: !!m.on, x: m.x, z: m.z, h: m.h, m: m.m, a: m.a, s: m.s, t: performance.now() }; break; }
      case 'rtc': this.h.onRtc && this.h.onRtc(m); break;
      case 'st': this.h.onStory && this.h.onStory(m); break;
      case 'pong': { const rtt = Date.now() - m.ts; this.rtt = this.rtt ? this.rtt * 0.6 + rtt * 0.4 : rtt; break; }
      case 'error': this.h.onError && this.h.onError(m.msg); break;
      default: break;
    }
  }

  /** call every frame with my vehicle; throttled to 15 Hz */
  sendState(veh, flags) {
    const t = performance.now();
    if (this.status !== 'online' || t - this.lastSend < SEND_MS) return;
    this.lastSend = t;
    if (veh.teleported) { this.send({ t: 'tp' }); veh.teleported = false; }
    this.send({ t: 's', x: veh.x, z: veh.z, h: veh.h, v: veh.u, st: veh.steerAngle / (veh.spec.maxSteer || 1), f: flags });
  }
  sendVehicle(veh, color) { this.send({ t: 'veh', veh, color }); }
  sendFoot(o) { this.send({ t: 'foot', ...o }); }
  sendChat(text) { this.send({ t: 'chat', text }); }
  sendMoney(m) { this.send({ t: 'm', m }); }

  /** interpolated pose of a remote player ~130 ms in the past (extrapolates briefly if packets are late) */
  sample(r, out = {}) {
    const s = r.snaps; if (!s.length) return null;
    const rt = performance.now() - 130;
    let i = s.length - 1; while (i > 0 && s[i - 1].t > rt) i--;
    const b = s[i], a = i > 0 ? s[i - 1] : null;
    if (a && rt >= a.t && rt <= b.t) {
      const f = (rt - a.t) / Math.max(1, b.t - a.t);
      let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.h = a.h + dh * f;
      out.v = a.v + (b.v - a.v) * f; out.st = a.st + (b.st - a.st) * f; out.f = b.f; return out;
    }
    const dt = Math.min(0.25, Math.max(0, (rt - b.t) / 1000));
    out.x = b.x + Math.sin(b.h) * b.v * dt; out.z = b.z + Math.cos(b.h) * b.v * dt; out.h = b.h; out.v = b.v; out.st = b.st; out.f = b.f;
    return out;
  }
}
export const FLAG = { BRAKE: 1, LIGHTS: 2, HORN: 4, REVERSE: 8 };
