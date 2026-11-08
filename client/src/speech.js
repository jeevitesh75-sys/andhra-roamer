// Reads story dialogue aloud with the browser's built-in text-to-speech (no downloads). Each speaker gets a different pitch/rate.
const LS = 'ar_speech';
const PROFILES = { king: [0.55, 0.85, 'm'], dasari: [0.75, 0.92, 'm'], mastermind: [0.8, 0.95, 'm'], driver: [1.05, 1.12, 'm'], hacker: [1.35, 1.05, 'f'], insider: [0.95, 1.0, 'm'], rao: [0.7, 0.95, 'm'], narrator: [1, 0.98, 'f'] };
export const Speech = {
  on: (() => { try { return localStorage.getItem(LS) !== '0'; } catch (e) { return true; } })(),
  supported: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined',
  set(v) { this.on = !!v; try { localStorage.setItem(LS, v ? '1' : '0'); } catch (e) { /* ignore */ } if (!v) this.stop(); },
  stop() { if (this.supported) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  _voice(gender) {
    const vs = speechSynthesis.getVoices ? speechSynthesis.getVoices() : []; if (!vs.length) return null;
    const pick = re => vs.find(v => re.test(v.lang)), fem = /female|zira|heera|neerja|samantha|swara|aditi|priya|veena|google (hindi|us english)/i;
    const inVs = vs.filter(v => /^en[-_]IN/i.test(v.lang)), pool = inVs.length ? inVs : vs.filter(v => /^en/i.test(v.lang));
    if (!pool.length) return pick(/./);
    const g = pool.find(v => (gender === 'f') === fem.test(v.name)); return g || pool[0];
  },
  /** estimated seconds the line takes (used to hold a cutscene shot long enough) */
  estimate(text, who) { const p = PROFILES[who] || [1, 1, 'm']; return Math.max(1.5, String(text || '').length / (14 * p[1]) + 0.6); },
  speak(text, who) { this.stop(); this.queue(text, who); },
  queue(text, who) {
    if (!this.on || !this.supported || !text) return;
    try {
      const p = PROFILES[who] || [1, 1, 'm'], u = new SpeechSynthesisUtterance(String(text).replace(/[*_#]/g, '')); u.pitch = p[0]; u.rate = p[1]; u.volume = 1; u.lang = 'en-IN';
      const v = this._voice(p[2]); if (v) { u.voice = v; u.lang = v.lang; } speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  },
};
if (Speech.supported && speechSynthesis.getVoices) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); } catch (e) { /* ignore */ } }
