'use strict';
/**
 * ANDHRA UNDERWORLD - THE FOUR: server-side story engine.
 *
 * The server does not know the map. It only tracks WHICH step the shared story is on and WHO has finished it:
 *   cut  : cutscene       - advances when every story player is "ready" (or after CUT_TIMEOUT)
 *   all  : mission        - advances when every story player reports "done" (each player's task depends on their role)
 *   vote : decision       - majority vote (ties go to the Mastermind, then the lowest player id); sets choices[key]
 * The client holds the full script (client/src/storydata.js); tests/story-sync-test.mjs checks both files agree.
 *
 * Roles (exactly four main characters): mastermind, driver, hacker, insider. A role nobody holds is played by an AI
 * teammate: its tasks complete themselves and it only speaks in cutscenes/radio.
 */
const ROLES = ['mastermind', 'driver', 'hacker', 'insider'];
const CUT_TIMEOUT = 75000, VOTE_TIMEOUT = 50000, MISSION_STALE = 0;

/** step lists per chapter: [id, need, extra] */
const CHAPTERS = [
  { id: 1, name: 'THE BEGINNING', steps: [['c1_intro', 'cut'], ['c1_explore', 'all'], ['c1_meet_king', 'cut'], ['c1_first_job', 'all']] },
  { id: 2, name: 'THE UNDERWORLD', steps: [['c2_org', 'cut'], ['c2_rival', 'all'], ['c2_patrol', 'all'], ['c2_end', 'cut']] },
  { id: 3, name: 'POLICE INVESTIGATION', steps: [['c3_officer', 'cut'], ['c3_questioned', 'all'], ['c3_checkpoint', 'all'], ['c3_wanted', 'all'], ['c3_end', 'cut']] },
  { id: 4, name: 'BETRAYAL', steps: [['c4_leak', 'cut'], ['c4_hack', 'all'], ['c4_talk', 'cut'], ['c4_choice', 'vote', ['confront', 'protect']], ['c4_run', 'all'], ['c4_end', 'cut']] },
  { id: 5, name: 'THE KING', steps: [['c5_truth', 'cut'], ['c5_assault', 'all'], ['c5_end', 'cut']] },
  { id: 6, name: 'FINAL DECISION', steps: [['c6_dilemma', 'cut'], ['c6_final', 'vote', ['good', 'bad', 'secret']], ['c6_ending', 'all'], ['c6_epilogue', 'cut']] },
];
const stepOf = (ch, i) => { const c = CHAPTERS[ch - 1]; const s = c && c.steps[i]; return s ? { id: s[0], need: s[1], opts: s[2] || null } : null; };

class Story {
  constructor(room, notify) { this.room = room; this.notify = notify; this.reset(); }
  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.on = false; this.ended = false; this.ch = 0; this.step = 0; this.id = ''; this.t = 0; this.roles = {}; this.done = new Set(); this.ready = new Set();
    this.votes = new Map(); this.choices = {}; this.ending = null; this.timer = null; this.rev = (this.rev || 0) + 1;
  }
  players() { return [...this.room.players.values()]; }
  /** players that take part in the story = role holders (at most four) */
  actors() { return this.players().filter(p => this.roles[p.id]); }
  hostId() { let best = 0; for (const p of this.room.players.values()) if (!best || p.id < best) best = p.id; return best; }
  pub() {
    return { on: this.on, ended: this.ended, ch: this.ch, step: this.step, id: this.id, t: this.t, rev: this.rev, host: this.hostId(), roles: this.roles,
      done: [...this.done], ready: [...this.ready], votes: Object.fromEntries(this.votes), choices: this.choices, ending: this.ending, names: Object.fromEntries(this.players().map(p => [p.id, p.name])),
      chapters: CHAPTERS.map(c => ({ id: c.id, name: c.name, n: c.steps.length })) };
  }
  push() { this.rev++; this.notify({ t: 'story', s: this.pub() }); }

  /** lobby: choose a role (unique among humans). Returns an error string or ''. */
  setRole(p, role) {
    if (this.on) return 'The story has already started';
    if (role === 'none' || role === null) { delete this.roles[p.id]; this.push(); return ''; }
    if (!ROLES.includes(role)) return 'Unknown role';
    for (const [id, r] of Object.entries(this.roles)) if (r === role && Number(id) !== p.id) return 'That character is taken';
    this.roles[p.id] = role; this.push(); return '';
  }
  start(p, ch = 1) {
    if (this.on) return 'Already running';
    if (p.id !== this.hostId()) return 'Only the host can start the story';
    ch = Math.max(1, Math.min(CHAPTERS.length, ch | 0 || 1));
    const taken = new Set(Object.values(this.roles));
    for (const q of this.players()) {                      // everybody without a character gets a free one, in join order
      if (this.roles[q.id]) continue;
      const free = ROLES.find(r => !taken.has(r)); if (!free) break;
      this.roles[q.id] = free; taken.add(free);
    }
    this.choices = {}; if (ch > 1) this.choices = { c4_choice: 'protect' };
    this.on = true; this.ended = false; this.ending = null; this._enter(ch, 0); return '';
  }
  stop() { const roles = this.roles; this.reset(); this.roles = roles; this.push(); }
  _enter(ch, step) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const s = stepOf(ch, step); if (!s) { this._finish(); return; }
    this.ch = ch; this.step = step; this.id = s.id; this.t = Date.now(); this.done = new Set(); this.ready = new Set(); this.votes = new Map();
    const ms = s.need === 'cut' ? CUT_TIMEOUT : s.need === 'vote' ? VOTE_TIMEOUT : 0;
    if (ms) { const id = s.id; this.timer = setTimeout(() => { if (this.on && this.id === id) this._resolve(true); }, ms); if (this.timer.unref) this.timer.unref(); }
    this.push();
  }
  _finish() { this.on = false; this.ended = true; this.push(); }
  advance() {
    const c = CHAPTERS[this.ch - 1];
    if (this.step + 1 < c.steps.length) this._enter(this.ch, this.step + 1);
    else if (this.ch < CHAPTERS.length) this._enter(this.ch + 1, 0);
    else this._finish();
  }
  _humans() { return this.actors(); }
  /** is the current step complete? force = timeout elapsed */
  _resolve(force = false) {
    if (!this.on) return;
    const s = stepOf(this.ch, this.step); if (!s) return;
    const hs = this._humans();
    if (s.need === 'cut') { if (force || hs.every(p => this.ready.has(p.id))) this.advance(); }
    else if (s.need === 'all') { if (hs.length === 0 || hs.every(p => this.done.has(p.id))) this.advance(); }
    else if (s.need === 'vote') {
      if (!force && !hs.every(p => this.votes.has(p.id))) return;
      const tally = {}; for (const [pid, v] of this.votes) tally[v] = (tally[v] || 0) + 1;
      const opts = this._options(s); let best = null, bn = -1, tie = false;
      for (const o of opts) { const n = tally[o] || 0; if (n > bn) { best = o; bn = n; tie = false; } else if (n === bn) tie = true; }
      if (tie || bn <= 0) {                                   // ties: the Mastermind's vote, else the lowest-id voter, else the first option
        const m = hs.find(p => this.roles[p.id] === 'mastermind'), mv = m && this.votes.get(m.id);
        const ids = [...this.votes.keys()].sort((a, b) => a - b);
        best = (mv && opts.includes(mv) && mv) || (ids.length && opts.includes(this.votes.get(ids[0])) && this.votes.get(ids[0])) || opts[0];
      }
      this.choices[s.id] = best;
      if (s.id === 'c6_final') this.ending = best;
      this.advance();
    }
  }
  _options(s) { return s.opts.filter(o => o !== 'secret' || this.choices.c4_choice === 'protect'); }
  markDone(p, id) { if (!this.on || id !== this.id || !this.roles[p.id]) return; const s = stepOf(this.ch, this.step); if (!s || s.need !== 'all') return; this.done.add(p.id); this.push(); this._resolve(); }
  markReady(p, id) { if (!this.on || id !== this.id || !this.roles[p.id]) return; const s = stepOf(this.ch, this.step); if (!s || s.need !== 'cut') return; this.ready.add(p.id); this.push(); this._resolve(); }
  vote(p, id, val) {
    if (!this.on || id !== this.id || !this.roles[p.id]) return; const s = stepOf(this.ch, this.step); if (!s || s.need !== 'vote') return;
    if (!this._options(s).includes(val)) return; this.votes.set(p.id, val); this.push(); this._resolve();
  }
  /** host safety valve: skip the current step (stuck player, leaver, testing) */
  skip(p) { if (!this.on || p.id !== this.hostId()) return; const s = stepOf(this.ch, this.step); if (!s) return; if (s.need === 'vote') this._resolve(true); else this.advance(); }
  /** a player left: free their character and re-check the step */
  leave(p) { const had = !!this.roles[p.id]; delete this.roles[p.id]; this.done.delete(p.id); this.ready.delete(p.id); this.votes.delete(p.id); if (this.on) { this._resolve(); if (this.on && this.actors().length === 0) { /* nobody left: stay on this step, wait for someone to join */ } } if (had || this.on) this.push(); }
  /** a player joined mid-story: give them a free character if one exists */
  join(p) {
    if (this.on) { const taken = new Set(Object.values(this.roles)), free = ROLES.find(r => !taken.has(r)); if (free) this.roles[p.id] = free; }
    this.push();
  }
}
module.exports = { Story, ROLES, CHAPTERS, stepOf, CUT_TIMEOUT, VOTE_TIMEOUT, MISSION_STALE };
