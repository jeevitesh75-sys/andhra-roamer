// signalling logic test with fake WebRTC: no hello loops, lower id offers once, both sides end up connected
let sent = 0;
class PC { constructor() { this.connectionState = 'new'; this.signalingState = 'stable'; this.remoteDescription = null; } addTrack() {} async createOffer() { return { type: 'offer' }; } async createAnswer() { return { type: 'answer' }; } async setLocalDescription() {} async setRemoteDescription(d) { this.remoteDescription = d; this.connectionState = 'connected'; if (d.type === 'answer') this.connectionState = 'connected'; } addIceCandidate() { return Promise.resolve(); } close() {} get localDescription() { return { type: 'x' }; } }
globalThis.RTCPeerConnection = PC; globalThis.window = globalThis; globalThis.document = { createElement: () => ({ style: {}, remove() {}, appendChild() {} }), body: { appendChild() {} } };
Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{}], getAudioTracks: () => [{ enabled: true }] }) } }, configurable: true });
const { Voice } = await import('../client/src/voice.js');
const nets = {}; const mk = id => ({ id, sendEv(k, d, to) { sent++; if (sent > 200) throw new Error('signalling loop'); const tgt = to ? [to] : Object.keys(nets).map(Number).filter(x => x !== id); for (const t of tgt) setTimeout(() => vs[t].onSignal(d, id), 0); } });
const vs = {}; for (const id of [3, 7]) { nets[id] = mk(id); vs[id] = new Voice(nets[id], () => {}); }
await vs[7].toggle(); await new Promise(r => setTimeout(r, 20)); await vs[3].toggle(); await new Promise(r => setTimeout(r, 50));
console.log('msgs', sent, 'peers', vs[3].peers.size, vs[7].peers.size, 'connected', vs[3].count(), vs[7].count());
if (sent > 20 || vs[3].count() !== 1 || vs[7].count() !== 1) { console.log('FAIL'); process.exit(1); } console.log('VOICE LOGIC OK');
