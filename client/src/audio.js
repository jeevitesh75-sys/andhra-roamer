// Small WebAudio engine: engine drone, tyre squeal, horn, crash thump, chime. No audio files needed.
export class AudioFX {
  constructor() { this.ctx = null; this.vol = 0.5; this.horns = new Map(); }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 600; this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.o1.connect(this.lp); this.o2.connect(this.lp); this.lp.connect(this.engGain); this.engGain.connect(this.master); this.o1.start(); this.o2.start();
    const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.skidSrc = c.createBufferSource(); this.skidSrc.buffer = this.noiseBuf; this.skidSrc.loop = true;
    this.skidF = c.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.frequency.value = 1700; this.skidF.Q.value = 3; this.skidG = c.createGain(); this.skidG.gain.value = 0;
    this.skidSrc.connect(this.skidF); this.skidF.connect(this.skidG); this.skidG.connect(this.master); this.skidSrc.start();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  update(rpm, throttle, skid, kind) {
    if (!this.ctx) return; const t = this.ctx.currentTime, base = kind === 'car' ? 38 : kind === 'bus' ? 30 : 26;
    const f = base + rpm * (kind === 'car' ? 150 : 110);
    this.o1.frequency.setTargetAtTime(f, t, 0.05); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.lp.frequency.setTargetAtTime(350 + rpm * 900 + throttle * 300, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.10 + 0.12 * throttle + 0.05 * rpm, t, 0.08);
    this.skidG.gain.setTargetAtTime(Math.min(0.25, skid * 0.3), t, 0.05);
  }
  horn(kind = 'car', gain = 0.25) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, g = c.createGain(); g.gain.value = 0; g.connect(this.master);
    const fr = kind === 'car' ? [420, 535] : kind === 'bus' ? [330, 420] : [260, 330];
    for (const f of fr) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.55); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.setValueAtTime(gain, t + 0.45); g.gain.linearRampToValueAtTime(0, t + 0.55);
  }
  crash(power = 1) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; const g = c.createGain(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    g.gain.setValueAtTime(Math.min(0.8, 0.2 + power * 0.06), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + 0.65);
  }
  shot() {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; const g = c.createGain(), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.35, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12); s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + 0.14);
  }
  chime() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [660, 880, 1320].forEach((fr, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = fr; g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5); o.connect(g); g.connect(this.master); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.55); });
  }
}
