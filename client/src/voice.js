// Push-free voice chat for the room: WebRTC audio mesh (fine for 4 friends), signalling goes through the game server's event relay.
// Tap the mic once to join voice (browser asks permission), tap again to mute / unmute. Everyone in the room who joined voice can talk.
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }] };
export class Voice {
  constructor(net, onState) { this.net = net; this.onState = onState || (() => {}); this.stream = null; this.peers = new Map(); this.on = false; this.muted = false; this.box = null; }
  get supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }
  async toggle() {
    if (!this.supported) { this.onState('nosupport'); return; }
    if (!this.on) { try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); } catch (e) { this.onState('denied'); return; }
      this.on = true; this.muted = false; this.box = document.createElement('div'); this.box.style.display = 'none'; document.body.appendChild(this.box); this.onState('on'); this.hello(); return; }
    this.muted = !this.muted; for (const t of this.stream.getAudioTracks()) t.enabled = !this.muted; this.onState(this.muted ? 'muted' : 'on');
  }
  stop() { for (const id of [...this.peers.keys()]) this.drop(id); if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.on = false; if (this.box) this.box.remove(); this.box = null; this.onState('off'); }
  hello(to, t = 'hello') { this.net.sendEv('rtc', { t }, to); }
  setVolume(v) { this.vol = v; for (const p of this.peers.values()) if (p.el) p.el.volume = v; }
  count() { let n = 0; for (const p of this.peers.values()) if (p.pc.connectionState === 'connected') n++; return n; }
  resume() { for (const p of this.peers.values()) if (p.el && p.el.paused) p.el.play().catch(() => {}); }
  speaking(id) { const p = this.peers.get(id); return !!(p && p.level > 0.02); }
  drop(id) { const p = this.peers.get(id); if (!p) return; try { p.pc.close(); } catch (e) { /* ignore */ } if (p.el) p.el.remove(); this.peers.delete(id); }
  _peer(id) {
    let p = this.peers.get(id); if (p) return p; const pc = new RTCPeerConnection(ICE); p = { pc, el: null, level: 0, pend: [] }; this.peers.set(id, p);
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    pc.onicecandidate = e => { if (e.candidate) this.net.sendEv('rtc', { t: 'ice', c: e.candidate }, id); };
    pc.ontrack = e => { const el = document.createElement('audio'); el.autoplay = true; el.playsInline = true; el.srcObject = e.streams[0]; el.volume = this.vol ?? 1; this.box.appendChild(el); p.el = el; el.play && el.play().catch(() => {}); this._meter(p, e.streams[0]); };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) this.drop(id); this.onState(this.muted ? 'muted' : 'on'); };
    return p;
  }
  _meter(p, stream) { try { const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(), src = ac.createMediaStreamSource(stream), buf = new Uint8Array(an.fftSize); an.fftSize = 256; src.connect(an); setInterval(() => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); p.level = m / 128; }, 150); } catch (e) { /* ignore */ } }
  async onSignal(d, from) {
    if (!this.on) return;
    if (d.t === 'hello' || d.t === 'hi') { if (d.t === 'hello') this.hello(from, 'hi'); const q = this.peers.get(from); if (this.net.id < from && !(q && q.pc.connectionState === 'connected')) await this._offer(from); return; }   // lower id makes the offer; 'hi' never triggers a reply
    const p = this._peer(from);
    if (d.t === 'offer') { await p.pc.setRemoteDescription(d.sdp); const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a); this.net.sendEv('rtc', { t: 'answer', sdp: p.pc.localDescription }, from); for (const c of p.pend.splice(0)) p.pc.addIceCandidate(c).catch(() => {}); }
    else if (d.t === 'answer') { await p.pc.setRemoteDescription(d.sdp); for (const c of p.pend.splice(0)) p.pc.addIceCandidate(c).catch(() => {}); }
    else if (d.t === 'ice') { if (p.pc.remoteDescription) p.pc.addIceCandidate(d.c).catch(() => {}); else p.pend.push(d.c); }
  }
  async _offer(to) { if (this.peers.has(to)) this.drop(to); const p = this._peer(to), o = await p.pc.createOffer(); await p.pc.setLocalDescription(o); this.net.sendEv('rtc', { t: 'offer', sdp: p.pc.localDescription }, to); }
  peerLeft(id) { this.drop(id); }
}
