// Proximity-free group voice chat over WebRTC (mesh, audio only). Signalling goes through the game server ('rtc' messages).
// Needs HTTPS + microphone permission. Lower player id makes the offer; both sides rebuild peers whenever somebody switches the mic on.
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
export class Voice {
  constructor(net, toast) { this.net = net; this.toast = toast || (() => {}); this.on = false; this.stream = null; this.peers = new Map(); this.sent = new Set(); }
  get supported() { return typeof RTCPeerConnection !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia; }
  async toggle() {
    if (this.on) { this.off(); this.toast('Voice chat off'); return false; }
    if (!this.supported) { this.toast('Voice chat is not supported in this browser'); return false; }
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { this.toast('Microphone blocked - allow it in the browser to use voice chat', 3500); return false; }
    this.on = true; this.closeAll(); for (const id of this.net.remotes.keys()) this._hi(id); this.toast('Voice chat ON - everyone in the room with voice on can hear you'); return true;
  }
  off() { this.on = false; this.closeAll(); if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; } }
  closeAll() { for (const p of this.peers.values()) { try { p.pc.close(); } catch (_) {} if (p.el) p.el.remove(); } this.peers.clear(); }
  _send(to, d) { this.net.send({ t: 'rtc', to, d }); }
  _hi(id) { this._send(id, { k: 'hi' }); }
  onJoin(r) { if (this.on) this._hi(r.id); }
  onLeave(r) { const p = this.peers.get(r.id); if (p) { try { p.pc.close(); } catch (_) {} if (p.el) p.el.remove(); this.peers.delete(r.id); } }
  _peer(id) {
    let p = this.peers.get(id); if (p) return p;
    const pc = new RTCPeerConnection(ICE); p = { pc, el: null }; this.peers.set(id, p);
    if (this.stream) this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream)); else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = e => { if (e.candidate) this._send(id, { k: 'ice', c: e.candidate }); };
    pc.ontrack = e => { if (!p.el) { const a = document.createElement('audio'); a.autoplay = true; a.playsInline = true; a.style.display = 'none'; document.body.appendChild(a); p.el = a; } p.el.srcObject = e.streams[0]; const pl = p.el.play(); if (pl && pl.catch) pl.catch(() => {}); };
    return p;
  }
  async handle(m) {
    const from = m.from, d = m.d || {};
    try {
      if (d.k === 'hi') {
        const old = this.peers.get(from); if (old) { try { old.pc.close(); } catch (_) {} if (old.el) old.el.remove(); this.peers.delete(from); }
        const p = this._peer(from); if (!this.on) this._hi(from);   // reply so that the other side knows we exist
        if (this.net.id < from) { const o = await p.pc.createOffer(); await p.pc.setLocalDescription(o); this._send(from, { k: 'offer', s: p.pc.localDescription }); }
      } else if (d.k === 'offer') { const p = this._peer(from); await p.pc.setRemoteDescription(d.s); const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a); this._send(from, { k: 'answer', s: p.pc.localDescription }); }
      else if (d.k === 'answer') { const p = this.peers.get(from); if (p) await p.pc.setRemoteDescription(d.s); }
      else if (d.k === 'ice') { const p = this.peers.get(from); if (p && d.c) await p.pc.addIceCandidate(d.c); }
    } catch (e) { /* ignore a failed negotiation; toggling the mic rebuilds it */ }
  }
}
