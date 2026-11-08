// v3c extras: fullscreen, voice chat (WebRTC mesh, signalling over the existing 'ev' relay),
// visible AI teammates (a convoy that follows you), off-screen teammate arrows and a "gather" button.
import { ROLES } from './storydata.js';

const ROLE_ORDER = ['mastermind', 'driver', 'hacker', 'insider'];
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

/* ------------------------------------------------------------ fullscreen */
export function toggleFullscreen() {
  const d = document, el = d.documentElement;
  const fs = d.fullscreenElement || d.webkitFullscreenElement;
  if (fs) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return true; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return false;                                   // iPhone Safari: use "Add to Home Screen" instead
  const p = req.call(el, { navigationUI: 'hide' });
  const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } };
  if (p && p.then) p.then(lock).catch(() => {}); else lock();
  return true;
}

/* ------------------------------------------------------------ voice chat */
export class Voice {
  constructor(G, toast) { this.G = G; this.toast = toast; this.on = false; this.muted = false; this.stream = null; this.peers = new Map(); this.audio = new Map(); this.level = 0; }
  get net() { return this.G.net; }
  async enable() {
    if (this.on) return true;
    if (!this.net || this.net.status !== 'online') { this.toast('Voice chat needs the online server', 2500); return false; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.toast('Microphone is not available (needs https)', 3000); return false; }
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { this.toast('Microphone blocked - allow it in the browser address bar', 3500); return false; }
    this.on = true; this.muted = false; this.net.sendEv('rtc', { k: 'hello' });
    this.toast('Voice chat ON - tap 🎤 again to mute', 2500); this._meter();
    for (const id of this.net.remotes.keys()) this._maybeOffer(id);
    return true;
  }
  disable() {
    this.on = false; if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null;
    for (const id of [...this.peers.keys()]) this._close(id);
    this.net && this.net.sendEv('rtc', { k: 'bye' });
  }
  toggle() { if (!this.on) return this.enable(); this.muted = !this.muted; this.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; }); this.toast(this.muted ? 'Mic muted' : 'Mic live', 1200); return Promise.resolve(true); }
  _pc(id) {
    let pc = this.peers.get(id); if (pc) return pc;
    pc = new RTCPeerConnection(ICE); this.peers.set(id, pc);
    if (this.stream) this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));
    pc.onicecandidate = e => { if (e.candidate) this.net.sendEv('rtc', { k: 'ice', c: e.candidate }, id); };
    pc.ontrack = e => {
      let a = this.audio.get(id); if (!a) { a = document.createElement('audio'); a.autoplay = true; a.playsInline = true; document.body.appendChild(a); this.audio.set(id, a); }
      a.srcObject = e.streams[0]; a.play && a.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._close(id); };
    return pc;
  }
  _close(id) { const pc = this.peers.get(id); if (pc) { try { pc.close(); } catch (e) { /* ignore */ } } this.peers.delete(id); const a = this.audio.get(id); if (a) { a.srcObject = null; a.remove(); } this.audio.delete(id); }
  async _maybeOffer(id) {
    if (!this.on || this.net.id > id) return;                     // the lower id makes the offer
    const pc = this._pc(id); try { const o = await pc.createOffer(); await pc.setLocalDescription(o); this.net.sendEv('rtc', { k: 'offer', s: pc.localDescription }, id); } catch (e) { /* retry on next hello */ }
  }
  async onSignal(d, from) {
    if (!d || !from) return;
    if (d.k === 'bye') { this._close(from); return; }
    if (!this.on) return;                                          // not listening: ignore
    try {
      if (d.k === 'hello') { this.net.sendEv('rtc', { k: 'hi' }, from); this._close(from); await this._maybeOffer(from); }
      else if (d.k === 'hi') { await this._maybeOffer(from); }
      else if (d.k === 'offer') { const pc = this._pc(from); await pc.setRemoteDescription(d.s); const a = await pc.createAnswer(); await pc.setLocalDescription(a); this.net.sendEv('rtc', { k: 'answer', s: pc.localDescription }, from); }
      else if (d.k === 'answer') { const pc = this.peers.get(from); if (pc && pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(d.s); }
      else if (d.k === 'ice') { const pc = this.peers.get(from); if (pc && d.c) await pc.addIceCandidate(d.c); }
    } catch (e) { console.warn('voice signal', e); }
  }
  onJoin(id) { if (this.on) this.net.sendEv('rtc', { k: 'hi' }, id); }
  onLeave(id) { this._close(id); }
  _meter() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC(), an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(this.stream).connect(an); const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => { if (!this.on) { ctx.close(); return; } an.getByteFrequencyData(buf); let s = 0; for (const v of buf) s += v; this.level = s / buf.length / 90; requestAnimationFrame(tick); };
      tick();
    } catch (e) { /* meter is cosmetic */ }
  }
  status() { return !this.on ? 'off' : this.muted ? 'muted' : 'live'; }
}

/* ------------------------------------------------------------ AI teammates + teammate arrows */
export class Team {
  constructor(G) { this.G = G; this.trail = []; this.ai = []; this.arrows = new Map(); }
  /** roles nobody is playing (only while the story runs) */
  aiRoles() {
    const S = this.G.storyC, st = S && S.state; if (!S || !S.active || !st) return [];
    const held = new Set(Object.values(st.roles || {})); return ROLE_ORDER.filter(r => !held.has(r));
  }
  record(x, z, h, foot, t) {
    const L = this.trail, last = L[L.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) > 120) L.length = 0;           // teleport / respawn: restart the trail
    if (!last || t - last.t > 0.05) L.push({ x, z, h, foot, t });
    while (L.length > 1 && t - L[0].t > 14) L.shift();
  }
  sample(t, delay, out) {
    const L = this.trail; if (!L.length) return null; const tt = t - delay;
    if (tt <= L[0].t) { Object.assign(out, L[0]); return out; }
    for (let i = L.length - 1; i > 0; i--) if (L[i - 1].t <= tt) { const a = L[i - 1], b = L[i], k = (tt - a.t) / Math.max(1e-3, b.t - a.t), dh = Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h)); out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; out.h = a.h + dh * k; out.foot = b.foot; out.moving = Math.hypot(b.x - a.x, b.z - a.z) / Math.max(1e-3, b.t - a.t); return out; }
    Object.assign(out, L[L.length - 1]); return out;
  }
  /** called every frame after the player pose is known */
  update(dt, t, pose, foot) {
    const G = this.G, sc = G.scene, C = G.chars, w = G.world;
    this.record(pose.x, pose.z, pose.h, !!foot, t);
    const roles = this.aiRoles(); this.ai = [];
    const tmp = this._tmp || (this._tmp = {});
    roles.forEach((role, i) => {
      const R = ROLES[role], key = 'ai_' + role, delay = 1.4 + i * 1.15 + (foot ? 0 : 0.8);
      const s = this.sample(t, delay, tmp); if (!s) return;
      const lat = foot ? (i - 1) * 1.7 : (i % 2 ? 2.2 : -2.2) * 0.0, cs = Math.cos(s.h), sn = Math.sin(s.h);
      const x = s.x + cs * lat, z = s.z - sn * lat, y = w.groundAt ? w.groundAt(x, z) : w.heightAt(x, z);
      this.ai.push({ role, x, z, y, color: R.color, name: R.short });
      if (foot) {
        if (sc.models.has(key)) sc.removeModel(key);
        C.set(key, { x, y, z, h: s.h, phase: t * 7 + i, moving: (s.moving || 0) > 0.4 ? Math.min(1, s.moving / 3) : 0, color: R.shirt, pants: R.pants });
      } else {
        C.remove && C.remove(key);
        const m = sc.model(key, 'car', R.color); sc.placeModel(m, { x, z, y, h: s.h, pitch: 0, roll: 0, steer: 0, lights: G.lightsOn, signed: 1 });
      }
      G.updateTag(key, { name: '🤖 ' + R.short, chat: '', chatAt: 0 }, { x, z }, y + (foot ? 2.3 : 2.6), Math.hypot(x - pose.x, z - pose.z));
    });
    C.sweep && C.sweep('ai_');
    for (const r of ROLE_ORDER) if (!roles.includes(r)) { const k = 'ai_' + r; if (sc.models.has(k)) sc.removeModel(k); G.dropTag && G.dropTag(k); }
    this.updateArrows(pose);
  }
  /** everyone on my team: humans in the room + AI teammates */
  mates() {
    const G = this.G, out = [];
    if (G.net) for (const r of G.net.remotes.values()) { const s = r.snaps[r.snaps.length - 1]; if (s) out.push({ id: 'h' + r.id, name: r.name, x: s.x, z: s.z, y: 1.8, color: r.color || '#7dffb0', human: true }); }
    for (const a of this.ai) out.push({ id: 'a' + a.role, name: '🤖 ' + a.name, x: a.x, z: a.z, y: a.y + 2, color: a.color });
    return out;
  }
  blips() { return this.mates().map(m => ({ x: m.x, z: m.z, color: m.color, r: 4.5 })); }
  updateArrows(pose) {
    const G = this.G, host = document.getElementById('mates'); if (!host) return;
    const W = innerWidth, Hh = innerHeight, live = new Set(), out = {};
    for (const m of this.mates()) {
      const d = Math.hypot(m.x - pose.x, m.z - pose.z); live.add(m.id);
      let el = this.arrows.get(m.id); if (!el) { el = document.createElement('div'); el.className = 'mate'; host.appendChild(el); this.arrows.set(m.id, el); }
      const p = G.scene.toScreen(m.x, m.y, m.z, out), onScreen = p.visible && p.x > 30 && p.x < W - 30 && p.y > 50 && p.y < Hh - 50;
      if (onScreen && d < 220) { el.style.display = 'none'; continue; }
      const cx = W / 2, cy = Hh / 2; let dx = p.x - cx, dy = p.y - cy; if (!p.visible) { dx = -dx; dy = -dy; }
      const k = Math.min((W / 2 - 46) / Math.max(1, Math.abs(dx)), (Hh / 2 - 70) / Math.max(1, Math.abs(dy)));
      const ex = cx + dx * k, ey = cy + dy * k;
      el.style.display = 'block'; el.style.left = ex + 'px'; el.style.top = ey + 'px'; el.style.borderColor = m.color;
      el.innerHTML = `<b>${m.name.replace(/[<>&]/g, '')}</b><span>${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}</span>`;
    }
    for (const [id, el] of this.arrows) if (!live.has(id)) { el.remove(); this.arrows.delete(id); }
  }
  /** nearest human friend (for the Gather button) */
  nearestFriend(pose) {
    const G = this.G; let best = null, bd = 1e18;
    if (G.net) for (const r of G.net.remotes.values()) { const s = r.snaps[r.snaps.length - 1]; if (!s) continue; const d = (s.x - pose.x) ** 2 + (s.z - pose.z) ** 2; if (d < bd) { bd = d; best = { x: s.x, z: s.z, name: r.name, d: Math.sqrt(d) }; } }
    return best;
  }
}
