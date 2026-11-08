// ANDHRA UNDERWORLD - THE FOUR. Pure story engine (no DOM / three.js); main.js renders state and supplies hooks.
export const ROLES = ['Mastermind', 'Driver', 'Hacker', 'Inside Man'];
export const BLURB = { Mastermind: 'You lead the crew and know the underworld.', Driver: 'You know every road in Andhra. Wheels and escapes are yours.', Hacker: 'You break into systems and find the secrets.', 'Inside Man': 'You have powerful friends - and a hidden link to the police.' };
const K = 'THE KING', R = 'Inspector Rao', N = 'Narrator';
export const CHAPTERS = [
  { title: 'CHAPTER 1 - THE BEGINNING', steps: [
    { t: 'talk', by: N, text: 'A small town in Andhra Pradesh. Four friends, ordinary lives: the Mastermind, the Driver, the Hacker and the Inside Man.' },
    { t: 'talk', by: N, text: 'Money is tight. A message arrives: "THE KING wants to meet you. Come alone... or come together."' },
    { t: 'goto', loc: 1, text: 'Drive or walk to the meeting place (blue pin on your map). Explore the town on the way.' },
    { t: 'talk', by: K, text: 'So these are the four everyone talks about. Do my work, stay quiet, and you will never be hungry again.' },
    { t: 'talk', by: N, text: 'They accept. It feels like a harmless job. It is not.' } ] },
  { title: 'CHAPTER 2 - THE UNDERWORLD', steps: [
    { t: 'talk', by: K, text: 'A rival gang is cutting into my cities. The Driver collects a shipment. The Hacker opens their ledger.' },
    { t: 'goto', loc: 2, who: 'Driver', text: 'DRIVER: bring a vehicle to the pickup point.' },
    { t: 'escape', stars: 2, text: 'Rival gang ambush and the police are alerted! Lose the cops (all four can help).' },
    { t: 'hack', loc: 3, who: 'Hacker', secs: 6, text: 'HACKER: stay near the rival hideout while the ledger downloads.' },
    { t: 'talk', by: N, text: 'The ledger holds names of people who vanished. The King is not just a smuggler.' } ] },
  { title: 'CHAPTER 3 - POLICE INVESTIGATION', steps: [
    { t: 'talk', by: R, text: 'Special Officer Rao. Four friends, suddenly rich. I am watching every one of you.' },
    { t: 'hack', loc: { police: 0 }, who: 'Hacker', secs: 6, text: 'INVESTIGATION: HACKER - slip near the police station (blue P on the map) and copy Rao\'s case file.' },
    { t: 'escape', stars: 3, text: 'Roadblocks everywhere! Escape the police net.' },
    { t: 'decide', key: 'question', q: 'Inspector Rao brings you in for questioning. What do you say?', opts: [['lie', 'Lie - we know nothing'], ['silent', 'Stay silent']] },
    { t: 'talk', by: R, text: 'Silence or lies, I will find the truth either way.', when: { key: 'question', v: 'lie' } },
    { t: 'talk', by: R, text: 'Say nothing then. Someone among you will talk.', when: { key: 'question', v: 'silent' } } ] },
  { title: 'CHAPTER 4 - BETRAYAL', steps: [
    { t: 'talk', by: N, text: 'Rao slides a photo across the table. It shows the Inside Man shaking hands with a police commissioner.' },
    { t: 'talk', by: 'Inside Man', text: 'I never wanted you to find out like this. I joined the police files years ago... to protect you.' },
    { t: 'decide', key: 'trust', q: 'The Inside Man hid the truth. What do you do?', opts: [['trust', 'Trust the Inside Man'], ['confront', 'Confront and cut him off']] },
    { t: 'talk', by: 'Mastermind', text: 'We stay together. All of us, or none.', when: { key: 'trust', v: 'trust' } },
    { t: 'talk', by: 'Mastermind', text: 'You lied to us. Get out of my sight.', when: { key: 'trust', v: 'confront' } } ] },
  { title: 'CHAPTER 5 - THE KING', steps: [
    { t: 'talk', by: N, text: 'The ledger names The King\'s fortress. Tonight the truth comes out.' },
    { t: 'goto', loc: 4, text: 'Reach The King\'s fortress. Everyone, together.' },
    { t: 'hack', loc: 4, who: 'Hacker', secs: 6, text: 'HACKER: crack the vault records while the others hold the gate.' },
    { t: 'defeat', stars: 4, n: 3, text: 'Police and gang reinforcements arrive. Wreck 3 units with the roof gun (G / FIRE) or by ramming.' },
    { t: 'talk', by: K, text: 'You four were never my friends. You were my hands. And hands can be cut off.' } ] },
  { title: 'CHAPTER 6 - FINAL DECISION', steps: [
    { t: 'decide', key: 'final', q: 'The King is beaten. What happens to Andhra\'s underworld?', opts: [['good', 'Help the police expose everything'], ['bad', 'Take over the organisation'], ['secret', 'Reveal the hidden betrayal', 'trust']] },
    { t: 'end', ending: 'good', title: 'GOOD ENDING - JUSTICE', text: 'The network falls. The four walk free, heroes to the town that never knew them. Inspector Rao salutes.', when: { key: 'final', v: 'good' } },
    { t: 'end', ending: 'bad', title: 'BAD ENDING - THE NEW KINGS', text: 'The throne is empty and the four sit on it. The cities have new rulers. The cycle begins again.', when: { key: 'final', v: 'bad' } },
    { t: 'end', ending: 'secret', title: 'SECRET ENDING - THE LAST TWIST', text: 'The Inside Man was never working for the police. He was The King\'s son. The betrayal changes everyone\'s fate.', when: { key: 'final', v: 'secret' } } ] },
];

export class Story {
  /** h: { me(), ids() sorted ids incl. me, send(msg), onStep(step, mine, story), police(stars), stopPolice(), reward(n), say(text) } */
  constructor(h) { this.h = h; this.active = false; this.ch = 0; this.i = 0; this.flags = {}; this.votes = {}; this.prog = 0; this.kills = 0; this.t = 0; this.ending = null; this.done = false; }
  get step() { return CHAPTERS[this.ch].steps[this.i]; }
  role(id) { const ids = this.h.ids(), k = ids.indexOf(id === undefined ? this.h.me() : id); return ROLES[(k < 0 ? 0 : k) % 4]; }
  roleFilled(r) { return this.h.ids().some(id => this.role(id) === r); }
  mine(s = this.step) { return !s.who || this.role() === s.who || !this.roleFilled(s.who); }
  isLeader() { return this.h.me() === Math.min(...this.h.ids()); }
  start(broadcast = true) { this.active = true; this.done = false; this.ch = 0; this.i = 0; this.flags = {}; this.ending = null; if (broadcast) this.h.send({ k: 'start' }); this._enter(); }
  stop() { this.active = false; this.h.stopPolice(); }
  _enter() {
    for (;;) { const s = this.step; if (s.when && this.flags[s.when.key] !== s.when.v) { if (!this._next()) return; continue; } break; }
    this.prog = 0; this.kills = 0; this.t = 0; this.votes = {}; const s = this.step, mine = this.mine(s);
    if ((s.t === 'escape' || s.t === 'defeat') && mine) this.h.police(s.stars); else this.h.stopPolice();
    if (s.t === 'end') { this.ending = s.ending; this.done = true; this.h.reward(s.ending === 'bad' ? 80000 : 50000); }
    this.h.onStep(s, mine, this);
  }
  _next() { this.i++; if (this.i >= CHAPTERS[this.ch].steps.length) { this.ch++; this.i = 0; } if (this.ch >= CHAPTERS.length) { this.ch = CHAPTERS.length - 1; this.i = CHAPTERS[this.ch].steps.length - 1; return false; } return true; }
  _at(ch, i) { if (!this.active) return; if (ch * 100 + i <= this.ch * 100 + this.i) return; this.ch = ch; this.i = i; this._enter(); }
  advance() {
    if (!this.active || this.done) return; let ch = this.ch, i = this.i + 1; if (i >= CHAPTERS[ch].steps.length) { ch++; i = 0; } if (ch >= CHAPTERS.length) return;
    this.h.send({ k: 'adv', ch, i }); this._at(ch, i);
  }
  tap() { if (this.active && this.step.t === 'talk') this.advance(); }
  vote(v) { const s = this.step; if (!this.active || s.t !== 'decide') return; this.h.send({ k: 'vote', ch: this.ch, i: this.i, v }); this.votes[this.h.me()] = v; this._tally(); }
  _tally() { if (this.isLeader() && this.step.t === 'decide' && Object.keys(this.votes).length >= this.h.ids().length) this._resolve(); }
  _resolve() {
    const s = this.step, cnt = {}; for (const v of Object.values(this.votes)) cnt[v] = (cnt[v] || 0) + 1;
    let best = s.opts[0][0], n = -1; for (const o of s.opts) { if ((cnt[o[0]] || 0) > n && this._allowed(o)) { n = cnt[o[0]] || 0; best = o[0]; } }
    this.h.send({ k: 'res', ch: this.ch, i: this.i, v: best }); this._apply(best);
  }
  _allowed(o) { return !o[2] || this.flags.trust === o[2]; }
  _apply(v) { const s = this.step; this.flags[s.key] = v; const o = s.opts.find(x => x[0] === v); this.h.say('Team decided: ' + (o ? o[1] : v)); if (this.isLeader()) this.advance(); }
  onMsg(m, from) {
    if (m.k === 'start') { if (!this.active) this.start(false); }
    else if (m.k === 'adv') { if (!this.active) { this.active = true; } this._at(m.ch, m.i); }
    else if (m.k === 'vote') { if (m.ch === this.ch && m.i === this.i) { this.votes[from] = m.v; this._tally(); } }
    else if (m.k === 'res') { if (m.ch === this.ch && m.i === this.i && this.step.t === 'decide') this._apply(m.v); }
    else if (m.k === 'flag') this.flags[m.key] = m.v;
  }
  kill() { if (this.active && this.step.t === 'defeat' && this.mine()) { this.kills++; if (this.kills >= this.step.n) { this.h.stopPolice(); this.advance(); } } }
  /** result of the local police chase: 'escaped' | 'cleared' | 'caught' */
  policeResult(res) { if (!this.active) return; const s = this.step; if (!this.mine(s)) return; if (s.t === 'escape' && (res === 'escaped' || res === 'cleared')) this.advance(); else if ((s.t === 'escape' || s.t === 'defeat') && res === 'caught') { this.h.say('Arrested! Bailed out by the team - the chase restarts.'); this.h.police(s.stars); } else if (s.t === 'defeat' && res === 'escaped') this.h.police(s.stars); }
  update(dt, me, loc) {
    if (!this.active || this.done) return; const s = this.step; this.t += dt;
    if (s.t === 'talk' && this.t > 14 && this.isLeader()) this.advance();
    else if (s.t === 'goto' && this.mine(s) && loc(s.loc) && Math.hypot(loc(s.loc).x - me.x, loc(s.loc).z - me.z) < 35) this.advance();
    else if (s.t === 'hack' && this.mine(s)) { const p = loc(s.loc); if (p && Math.hypot(p.x - me.x, p.z - me.z) < 30) { this.prog += dt; if (this.prog >= s.secs) this.advance(); } else this.prog = Math.max(0, this.prog - dt * 0.5); }
    else if (s.t === 'decide' && this.t > 25 && this.isLeader()) this._resolve();
  }
}
