// Reads dialogue out loud with the browser's built-in speech synthesis (works offline, no API key).
// Each character gets a different pitch/rate so you can hear who is talking. Preference saved in localStorage.
const VOICE_STYLE = {
  arjun: { pitch: 0.85, rate: 0.98, male: true }, karthik: { pitch: 1.12, rate: 1.04, male: true },
  king: { pitch: 0.55, rate: 0.84, male: true }, dasari: { pitch: 0.75, rate: 0.95, male: true },
  dev: { pitch: 0.7, rate: 0.92, male: true }, pasha: { pitch: 0.8, rate: 1.0, male: true },
  lakshmi: { pitch: 1.5, rate: 1.05, male: false }, radio: { pitch: 1.0, rate: 1.18, male: true, radio: true },
  anon: { pitch: 0.6, rate: 0.9, male: true }, narrator: { pitch: 0.95, rate: 0.93, male: false },
};
const KEY = 'andhra.voice';
export class Speech {
  constructor() { this.ok = typeof window !== 'undefined' && 'speechSynthesis' in window; this.on = this.ok && localStorage.getItem(KEY) !== 'off'; this.busy = false; this.voices = []; this.cache = {}; if (this.ok) { const load = () => { this.voices = speechSynthesis.getVoices() || []; this.cache = {}; }; load(); speechSynthesis.onvoiceschanged = load; } }
  pick(who) {
    if (this.cache[who]) return this.cache[who];
    const st = VOICE_STYLE[who] || VOICE_STYLE.narrator, en = this.voices.filter(v => /^en/i.test(v.lang)), pool = en.length ? en : this.voices;
    const ind = pool.filter(v => /en[-_]IN/i.test(v.lang)), base = ind.length ? ind : pool;
    const fem = /female|woman|zira|heera|veena|samantha|susan|aria|neerja|priya|swara|google uk english female/i, mal = /male|man|david|mark|ravi|prabhat|hemant|daniel|guy|google uk english male/i;
    let v = base.find(x => (st.male ? mal.test(x.name) && !fem.test(x.name) : fem.test(x.name))) || base.find(x => st.male ? !fem.test(x.name) : fem.test(x.name)) || base[0] || null;
    return (this.cache[who] = v);
  }
  /** speak one line. returns false when speech is unavailable/off (caller then falls back to timed subtitles) */
  say(text, who = 'narrator', onend) {
    this.stop(); if (!this.on || !this.ok || !text) return false;
    const st = VOICE_STYLE[who] || VOICE_STYLE.narrator, u = new SpeechSynthesisUtterance(String(text).replace(/\s+/g, ' ')), v = this.pick(who);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
    u.pitch = st.pitch; u.rate = st.rate; u.volume = 1; this.busy = true; this._id = (this._id || 0) + 1; const id = this._id;
    const fin = () => { if (this._id === id) { this.busy = false; onend && onend(); } };
    u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
    this._guard = setTimeout(fin, 3000 + text.length * 95);              // never hang if the browser drops the end event
    return true;
  }
  stop() { clearTimeout(this._guard); this._id = (this._id || 0) + 1; this.busy = false; if (this.ok) speechSynthesis.cancel(); }
  toggle() { this.on = !this.on; localStorage.setItem(KEY, this.on ? 'on' : 'off'); if (!this.on) this.stop(); return this.on; }
}
