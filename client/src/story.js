// ANDHRA UNDERWORLD - THE FOUR: client story engine (lobby, objectives, cutscenes, votes, hack mini-game, gang fights).
// Works online (server decides when steps advance) and offline (LocalStory mirrors the server rules for solo play).
import { CHAPTERS, ROLES, NPCS, ROLE_ORDER, ANCHORS, QUESTIONS, RADIO_CHATTER, THUG_LOOK, stepById } from './storydata.js';
import { mulberry32, strHash } from './noise.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NEED = {}; for (const c of CHAPTERS) c.steps.forEach((s, i) => { NEED[s.id] = { ch: c.id, i, need: s.need, opts: s.options ? s.options.map(o => o.id) : null }; });

/** offline stand-in for server/story.js (same rules, one human, the other three roles are AI) */
class LocalStory {
  constructor(onPush) { this.push = onPush; this.s = { on: false, ended: false, ch: 0, step: 0, id: '', t: 0, rev: 0, host: 1, roles: {}, done: [], ready: [], votes: {}, choices: {}, ending: null, names: { 1: 'You' }, chapters: CHAPTERS.map(c => ({ id: c.id, name: c.name, n: c.steps.length })) }; }
  emit() { this.s.rev++; this.push(JSON.parse(JSON.stringify(this.s))); }
  role(r) { this.s.roles = r && r !== 'none' ? { 1: r } : {}; this.emit(); }
  start(ch = 1) { if (!this.s.roles[1]) this.s.roles[1] = 'mastermind'; this.s.choices = ch > 1 ? { c4_choice: 'protect' } : {}; this.s.on = true; this.s.ended = false; this.enter(ch, 0); }
  enter(ch, i) { const c = CHAPTERS[ch - 1], st = c && c.steps[i]; if (!st) { this.s.on = false; this.s.ended = true; return this.emit(); } Object.assign(this.s, { ch, step: i, id: st.id, t: Date.now(), done: [], ready: [], votes: {} }); this.emit(); }
  next() { const c = CHAPTERS[this.s.ch - 1]; if (this.s.step + 1 < c.steps.length) this.enter(this.s.ch, this.s.step + 1); else if (this.s.ch < CHAPTERS.length) this.enter(this.s.ch + 1, 0); else { this.s.on = false; this.s.ended = true; this.emit(); } }
  done(id) { if (id === this.s.id && NEED[id].need === 'all') this.next(); }
  ready(id) { if (id === this.s.id && NEED[id].need === 'cut') this.next(); }
  vote(id, v) { if (id !== this.s.id || NEED[id].need !== 'vote') return; if (v === 'secret' && this.s.choices.c4_choice !== 'protect') return; this.s.choices[id] = v; if (id === 'c6_final') this.s.ending = v; this.next(); }
  stop() { this.s.on = false; this.emit(); }
}

export class StoryClient {
  constructor(G, H) {
    this.G = G; this.H = H; this.s = null; this.curId = ''; this.list = []; this.idx = 0; this.cine = null; this.anch = {}; this.gang = []; this.gangFor = ''; this.sentDone = ''; this.sentReady = ''; this.localQ = {}; this.hack = null; this.chatterT = 12;
    this.local = new LocalStory(s => this.onState(s));
    $('storyBtn').onclick = () => H.startStory();
    $('lobbyLeave').onclick = () => { $('lobby').hidden = true; H.closeStoryLobby && H.closeStoryLobby(); };
    $('lobbyStart').onclick = () => { const ch = Number($('lobbyCh').value) || 1; if (this.net && this.net.status === 'online') this.net.sendStory('sstart', { ch }); else this.local.start(ch); $('lobby').hidden = true; };
    $('cineSkip').onclick = () => this.endCine(true);
    $('endClose').onclick = () => { $('storyEnd').hidden = true; };
    $('hackCancel').onclick = () => this.closeHack(false);
  }
  get net() { return this.G.net; }
  get online() { return this.net && this.net.status === 'online'; }
  get myId() { return this.online ? this.net.id : 1; }
  get state() { return this.online ? this.net.story : this.local.s; }
  get myRole() { const s = this.state; return s && s.roles ? s.roles[this.myId] : null; }
  get active() { const s = this.state; return !!(s && s.on); }
  get isHost() { return this.online ? this.net.hostId === this.net.id : true; }

  /* ------------------------------------------------ anchors */
  buildAnchors() {
    const G = this.G, w = G.world, rnd = mulberry32(strHash('anch' + w.meta.id)), town = G.townPos || (G.townPos = { x: G.veh.x, z: G.veh.z }), A = {};
    const road = (x, z) => w.snapToRoad(x, z, 260, 5);
    const place = (k, d) => {
      let base = d.near ? A[d.near] : town, p = null;
      if (d.station) { const st = G.law.nearestStation(town.x, town.z); if (st) { const s = st.st; p = { x: s.door.x, z: s.door.z, h: 0 }; } }
      else if (d.fromStation) { const st = G.law.nearestStation(town.x, town.z); const b = st ? st.st : { x: town.x, z: town.z }; for (let k2 = 0; k2 < 14 && !p; k2++) { const a = k2 * 0.9, sn = road(b.x + Math.cos(a) * d.fromStation, b.z + Math.sin(a) * d.fromStation); if (sn) p = sn; } }
      else for (let k2 = 0; k2 < 16 && !p; k2++) { const a = d.ang + (k2 % 2 ? 1 : -1) * Math.ceil(k2 / 2) * 0.55, dd = d.dist + k2 * 40, sn = road(base.x + Math.cos(a) * dd, base.z + Math.sin(a) * dd); if (sn && w.heightAt(sn.x, sn.z) > -0.2 && !Object.values(A).some(o => o !== base && Math.hypot(o.x - sn.x, o.z - sn.z) < 60 && !d.near)) p = sn; }
      if (!p) p = { x: base.x + (rnd() - 0.5) * 80, z: base.z + (rnd() - 0.5) * 80 };
      A[k] = { x: p.x, z: p.z, h: p.road ? w.roadPoint(p.road, p.s, 0, {}).h : 0, label: d.label, key: k, road: p.road, s: p.s };
    };
    for (const [k, d] of Object.entries(ANCHORS)) place(k, d);
    A.ending = A.station; this.anch = A; this.anchFor = w.meta.id; G.anchors = A;
  }
  anchor(k) { if (this.anchFor !== this.G.world.meta.id) this.buildAnchors(); return this.anch[k] || this.anch.town; }

  /* ------------------------------------------------ state */
  openLobby() {
    const G = this.G; if (!G.townPos) G.townPos = { x: G.veh.x, z: G.veh.z };
    $('lobby').hidden = false; const sel = $('lobbyCh'); if (!sel.options.length) CHAPTERS.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.id}. ${c.name}`; sel.appendChild(o); });
    if (!this.online) this.local.emit(); else this.renderLobby();
  }
  renderLobby() {
    const s = this.state; if (!s) return; const grid = $('roleGrid'); grid.innerHTML = '';
    for (const r of ROLE_ORDER) {
      const R = ROLES[r], holder = Object.entries(s.roles || {}).find(([, v]) => v === r), mine = holder && Number(holder[0]) === this.myId, b = document.createElement('button');
      b.className = 'roleCard' + (mine ? ' mine' : holder ? ' taken' : ''); const who = holder ? (mine ? 'YOU' : (s.names && s.names[holder[0]]) || 'Player') : 'AI teammate (free - tap to play)';
      b.innerHTML = `<span class="em">${R.emoji}</span><b style="color:${R.color}">${esc(R.name)}</b><small>${esc(R.title)} - ${esc(R.blurb)}</small><div class="who">${esc(who)}</div>`;
      b.onclick = () => { if (holder && !mine) return; const nr = mine ? 'none' : r; if (this.online) this.net.send({ t: 'role', role: nr }); else this.local.role(nr); };
      grid.appendChild(b);
    }
    const n = Object.keys(s.roles || {}).length;
    $('lobbyInfo').textContent = `${n}/4 characters played by humans. ${n < 4 ? 'Empty roles are played by AI teammates.' : 'Full team!'}`;
    $('lobbyStart').disabled = !this.isHost; $('lobbyStart').textContent = this.isHost ? 'START STORY' : 'WAITING FOR HOST';
  }
  onState(s) {
    const G = this.G; if (!this.online) this.local.s = s;
    if (!$('lobby').hidden) this.renderLobby();
    if (s.ended && !this.endShown) { this.endShown = true; this.showEnd(s); }
    if (!s.on) { if (this.curId) { this.curId = ''; this.clear(); } return; }
    this.endShown = false; $('lobby').hidden = true;
    if (s.id !== this.curId) this.beginStep(s);
    this.updatePanel();
  }
  clear() { if (this.G.wpStory) { this.G.wp = null; this.G.wpStory = false; this.G.scene && this.G.scene.setWaypoint(null); } this.wpKey = ''; this.list = []; this.cine && this.endCine(false); $('objective').hidden = true; $('choice').hidden = true; this.closeHack(false); this.G.scene && this.G.scene.setBeacon(null); this.gang = []; this.gangKey = ''; this.gangFor = ''; this.G.setStars && this.G.setStars(0); }
  beginStep(s) {
    const G = this.G, H = this.H, def = stepById(s.id); if (!def) return; this.clear(); this.curId = s.id; this.def = def.step; this.idx = 0; this.sentDone = this.sentReady = ''; this.hackDone = false;
    G.heat = !!def.step.heat; if (G.law) G.law.setCheckpoints(def.step.checkpoints ? [{ ...this.anchor('checkpoint') }] : []);
    G.checkpointRun = false;
    if (def.step.need === 'cut') return this.startCine(s, def.step);
    if (def.step.need === 'vote') return this.showVote(s, def.step);
    const step = def.step.variants ? def.step.variants[s.ending || 'good'] : def.step, role = this.myRole || 'mastermind', o = (step.obj || def.step.obj)[role] || (step.obj || def.step.obj).default;
    this.list = (Array.isArray(o) ? o : [o]).map(x => ({ ...x })); this.title = def.step.title; this.chap = def.chapter;
    for (const c of step.intro || []) H.call(c.who, c.text);
    H.toast(`${def.chapter.name}: ${def.step.title}`, 3000);
    this.gangFor = ''; this.chatterT = 8;
  }
  cur() { return this.list[this.idx] || null; }
  playerPos() { const G = this.G; return G.foot ? G.foot : G.veh; }
  advanceObj() { this.idx++; this.G.scene.setBeacon(null); if (this.idx >= this.list.length) this.finishStep(); else this.H.toast(this.list[this.idx].text, 3000); }
  finishStep() {
    if (this.sentDone === this.curId) return; this.waitSince = Date.now(); this.sentDone = this.curId; this.H.toast('Your part is done. Waiting for the team...', 2500);
    if (this.online) this.net.sendStory('sdone', { id: this.curId }); else this.local.done(this.curId);
  }

  /* ------------------------------------------------ per-frame */
  update(dt) {
    const G = this.G; if (!this.active) return; if (this.cine) return this.updateCine(dt); this.updateGang(dt);   // runs even when your own part is finished: the host keeps simulating + syncing the fight for teammates
    const o = this.cur(), P = this.playerPos(); if (!o && this.def && this.def.need === 'all' && ((this.wt = (this.wt || 0) + dt) > 1)) { this.wt = 0; this.updatePanel(); } if (o && o.k !== 'clear' && this.gang.length && this.gangKey && this.gangKey.startsWith(this.curId + ':') && this.gang.every(g => g.hp <= 0)) { const ci = this.list.findIndex((x, i) => i >= this.idx && x.k === 'clear'); if (ci >= 0) { this.idx = ci + 1; this.G.scene.setBeacon(null); this.finishStep(); this.H.toast('The fight is already won - your part is done', 3000); return; } }
    if (!o || !P || !this.def) return;
    // the shared fight is already won (e.g. by the host): nothing before it matters any more, so finish this part right away
    const ci = this.list.findIndex((x, i) => i >= this.idx && x.k === 'clear');
    if (ci >= 0 && o.k !== 'clear') { const L = this.list[ci], key = this.curId + ':' + L.at + ':' + L.n; if (this.gangKey === key && this.gang.length && !this.gang.some(g => g.hp > 0)) { this.wonT = (this.wonT || 0) + dt; if (this.wonT > 1.5) { this.wonT = 0; this.H.toast('Your team already won the fight!', 2500); this.idx = this.list.length; this.G.scene.setBeacon(null); this.finishStep(); return; } } else this.wonT = 0; }
    const A = o.at ? this.anchor(o.at) : null, d = A ? Math.hypot(A.x - P.x, A.z - P.z) : 0, inVeh = !G.foot;
    if (A && o.k !== 'clear') G.scene.setBeacon(A, '#ffd24a');
    if (A) { const key = this.curId + this.idx; if (this.wpKey !== key) { this.wpKey = key; G.wp = { x: A.x, z: A.z, label: A.label }; G.wpStory = true; G.scene.setWaypoint(G.wp); } }
    if (o.k === 'goto') { const okV = o.veh === 'in' ? inVeh : o.veh === 'out' ? !inVeh : true; if (d <= o.r && okV) { if (o.ask && !this.localQ[o.ask]) { this.localQ[o.ask] = 1; this.ask(o.ask); } this.advanceObj(); } else if (d <= o.r && !okV && (this.warnT = (this.warnT || 0) - dt) < 0) { this.warnT = 4; this.H.toast(o.veh === 'in' ? 'You need to be in a vehicle (press E near a parked one)' : 'Get out of the vehicle first (E)', 2000); } }
    else if (o.k === 'hack') { if (this.hackCool > 0) this.hackCool -= dt; if (d <= o.r && !this.hack && !(this.hackCool > 0)) this.openHack(o); }
    else if (o.k === 'escape') { if (!o.started) { o.started = true; G.setStars(o.stars, 'story'); } else if (!G.police.active && !G.lawChase() && !G.arrestBusy()) this.advanceObj(); }
    else if (o.k === 'hold') { o.t = (o.t || 0) + (d <= o.r ? dt : 0); if (o.t >= o.secs) this.advanceObj(); }
    else if (o.k === 'ai') { o.t = (o.t || 0) + dt; if (o.t > 2) this.advanceObj(); }
    else if (o.k === 'clear') { G.scene.setBeacon(A, '#ff4040'); this.updateGangObj(o, d, P); }
    if (this.def.radioChatter && (this.chatterT -= dt) < 0) { this.chatterT = 18; this.H.radio(RADIO_CHATTER[Math.floor(Math.random() * RADIO_CHATTER.length)]); }
    if (G.heat && G.law && !G.arrestBusy()) { const cp = G.law.checkpointCheck({ x: P.x, z: P.z, speed: G.veh.speed, onFoot: !!G.foot }); if (cp && !G.checkpointRun) { G.checkpointRun = true; G.setStars(2, 'checkpoint'); } }
  }
  updatePanel() {
    const s = this.state, box = $('objective'); if (!s || !s.on || this.cine || !this.def || this.def.need !== 'all') { box.hidden = true; return; }
    box.hidden = false; const o = this.cur(); $('objChap').textContent = `CHAPTER ${s.ch} - ${(CHAPTERS[s.ch - 1] || {}).name}`; $('objTitle').textContent = this.def.title;
    let txt = o ? o.text : 'Your part is done!';
    if (!o) {
      const role0 = this.myRole || 'mastermind', obj = (this.def.variants ? this.def.variants[s.ending || 'good'] : this.def).obj || this.def.obj, pend = Object.entries(s.roles || {}).filter(([id]) => !s.done.includes(Number(id)));
      if (pend.length) { txt = 'Your part is done. Waiting for: ' + pend.map(([id, r]) => { const L = obj[r] || obj.default, last = Array.isArray(L) ? L[L.length - 1] : L; return `${ROLES[r].emoji} ${(s.names && s.names[id]) || ROLES[r].short} (${ROLES[r].short}) - ${last ? last.text : 'finishing up'}`; }).join(' | ') + '. Go and help them!'; }
      else txt = 'Your part is done. Waiting for the next scene...';
      let b = $('objSkip'); if (!b) { b = document.createElement('button'); b.id = 'objSkip'; b.textContent = 'CONTINUE WITHOUT THEM'; b.onclick = () => { if (this.online) this.net.sendStory('sskip', {}); else this.local.done(this.curId); b.hidden = true; }; $('objective').appendChild(b); }
      b.hidden = !(this.waitSince && Date.now() - this.waitSince > 20000);
    } else { const b = $('objSkip'); if (b) b.hidden = true; }
    $('objText').textContent = txt;
    const names = Object.entries(s.roles || {}).map(([id, r]) => `${ROLES[r].emoji} ${ROLES[r].short} ${s.done.includes(Number(id)) ? '<span class="done">done</span>' : '...'}`);
    $('objTeam').innerHTML = names.join(' &nbsp; ') + (Object.keys(s.roles || {}).length < 4 ? ' &nbsp; (AI teammates cover the rest)' : '');
  }
  hud() {
    const o = this.cur(), P = this.playerPos(), mk = $('objMark'); if (!o || !o.at || !P || this.cine || !this.active) { $('objDist').textContent = ''; mk.hidden = true; return; }
    const A = this.anchor(o.at), d = Math.hypot(A.x - P.x, A.z - P.z), txt = d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'; $('objDist').textContent = txt;
    const sp = this.G.scene.toScreen(A.x, this.G.world.heightAt(A.x, A.z) + 9, A.z, this._sp || (this._sp = {})), W = window.innerWidth, Hh = window.innerHeight; let x = sp.x, y = sp.y; const ok = sp.visible && x > 30 && x < W - 30 && y > 60 && y < Hh - 60;
    if (!ok) { const hd = this.G.foot ? this.G.camYaw + this.G.orbit : this.G.veh.h, a = Math.atan2(A.x - P.x, A.z - P.z) - hd, cx = W / 2, cy = Hh / 2; x = cx - Math.sin(a) * Math.min(W * 0.4, 360); y = Math.max(80, Math.min(Hh - 90, cy - Math.cos(a) * Math.min(Hh * 0.35, 200))); }
    mk.hidden = false; mk.style.left = x + 'px'; mk.style.top = y + 'px'; mk.innerHTML = `<i>${ok ? '▼' : '◉'}</i>${esc(A.label)}<br>${txt}`;
  }
  blips() { const o = this.cur(), out = []; if (this.active && o && o.at) { const A = this.anchor(o.at); out.push({ x: A.x, z: A.z, color: o.k === 'clear' ? '#ff4040' : '#ffd24a', r: 6, glyph: '!', label: A.label }); } for (const g of this.gang) if (g.hp > 0) out.push({ x: g.x, z: g.z, color: '#ff4040', r: 3 }); return out; }

  /* ------------------------------------------------ questions & votes */
  ask(key) {
    const q = QUESTIONS[key]; if (!q) return; $('choice').hidden = false; $('choiceTitle').textContent = NPCS[q.who].name; $('choiceText').textContent = q.text; const box = $('choiceBtns'); box.innerHTML = '';
    q.opts.forEach(op => { const b = document.createElement('button'); b.textContent = op.label; b.onclick = () => { $('choice').hidden = true; this.H.toast('Answer noted.', 1500); }; box.appendChild(b); }); $('choiceNote').textContent = '';
  }
  showVote(s, step) {
    $('choice').hidden = false; $('choiceTitle').textContent = step.title; $('choiceText').textContent = step.text; const box = $('choiceBtns'); box.innerHTML = '';
    for (const op of step.options) { if (op.secret && !(s.choices && s.choices.c4_choice === 'protect')) continue; const b = document.createElement('button'); b.innerHTML = `${esc(op.label)}<small>${esc(op.desc)}</small>`; b.onclick = () => { [...box.children].forEach(k => k.classList.remove('sel')); b.classList.add('sel'); $('choiceNote').textContent = 'Vote sent. Waiting for the team...'; if (this.online) this.net.sendStory('svote', { id: s.id, val: op.id }); else this.local.vote(s.id, op.id); }; box.appendChild(b); }
    $('choiceNote').textContent = 'Everyone votes. Majority wins; ties go to the Mastermind.';
  }
  showEnd(s) {
    const E = { good: ['GOOD ENDING - JUSTICE', 'The four friends helped the police expose the criminal organization.'], bad: ['BAD ENDING - THE NEW KINGS', 'The four friends became the new leaders of the underground.'], secret: ['SECRET ENDING - THE TRUTH', "One betrayal was revealed, and everyone's fate changed."] }[s.ending || 'good'];
    $('storyEnd').hidden = false; $('endTitle').textContent = 'THE END - ' + E[0]; $('endText').textContent = E[1];
  }

  /* ------------------------------------------------ cutscenes */
  startCine(s, step) {
    const G = this.G, spec = step.endings ? step.endings[s.ending || 'good'] : step, A = this.anchor(spec.at || step.at), shots = spec.shots;
    this.cine = { t: 0, shot: 0, shots, A, T: 0, step, shotT: 0 }; this.H.stageTeam(A); $('cine').hidden = false; requestAnimationFrame(() => $('cine').classList.add('on'));
    const ch = step.title.startsWith('Chapter') ? step.title : ''; $('cineTitle').innerHTML = ch ? `<small>${esc(ch.split(' - ')[0])}</small>${esc(ch.split(' - ')[1] || '')}` : ''; $('cineTitle').classList.toggle('on', !!ch); setTimeout(() => $('cineTitle').classList.remove('on'), 4200);
    this.setShot(0);
  }
  setShot(i) {
    const c = this.cine, sh = c.shots[i]; c.shot = i; c.shotT = 0; const who = NPCS[sh.who] || ROLES[sh.who] || { name: '', color: '#fff' }; $('cineWho').textContent = (who.emoji || '') + ' ' + (who.name || ''); $('cineWho').style.color = who.color || '#fff'; $('cineText').textContent = sh.text || '';
  }
  updateCine(dt) {
    const c = this.cine, sh = c.shots[c.shot], cam = this.G.scene.camera, A = c.A; c.shotT += dt; c.T += dt;
    const y = this.G.world.heightAt(A.x, A.z), k = Math.min(1, c.shotT / sh.dur), L = sh.look || [0, 1.6, 0]; let px, py, pz;
    if (sh.cam[0] === 'orbit') { const a = sh.cam[4] + c.shotT * sh.cam[3]; px = A.x + Math.cos(a) * sh.cam[1]; pz = A.z + Math.sin(a) * sh.cam[1]; py = y + sh.cam[2]; }
    else if (sh.cam[0] === 'fly') { const f = sh.cam[1], t = sh.cam[2], e = k * k * (3 - 2 * k); px = A.x + f[0] + (t[0] - f[0]) * e; py = y + f[1] + (t[1] - f[1]) * e; pz = A.z + f[2] + (t[2] - f[2]) * e; }
    else { px = A.x + sh.cam[1][0]; py = y + sh.cam[1][1]; pz = A.z + sh.cam[1][2]; }
    cam.position.set(px, py, pz); cam.lookAt(A.x + L[0], y + L[1], A.z + L[2]); this.cine.shotActors = sh;
    if (c.shotT >= sh.dur) { if (c.shot + 1 < c.shots.length) this.setShot(c.shot + 1); else this.endCine(false); }
  }
  endCine() {
    if (!this.cine) return; this.cine = null; $('cine').classList.remove('on'); setTimeout(() => { if (!this.cine) $('cine').hidden = true; }, 800); $('cineTitle').classList.remove('on');
    if (this.sentReady !== this.curId) { this.sentReady = this.curId; if (this.online) this.net.sendStory('sready', { id: this.curId }); else this.local.ready(this.curId); }
    $('cineReady').textContent = this.online ? 'Waiting for the team...' : '';
  }

  /* ------------------------------------------------ hacking mini-game (memory sequence on a 4x4 pad) */
  openHack(o) {
    const len = Math.min(8, o.len || 4), rnd = Math.random; this.hack = { o, len, seq: Array.from({ length: len }, () => Math.floor(rnd() * 16)), pos: 0, show: true, lock: true, tries: 3, t: 0 };
    $('hack').hidden = false; $('hackTitle').textContent = { seq: 'TERMINAL ACCESS', cipher: 'CIPHER BREAKER', trace: 'TRACE ROUTE' }[o.game] || 'TERMINAL'; $('hackText').textContent = o.text + ' - watch the pattern, then repeat it.';
    const g = $('hackGrid'); g.innerHTML = ''; for (let i = 0; i < 16; i++) { const b = document.createElement('button'); b.textContent = (i + 1).toString(16).toUpperCase(); b.onclick = () => this.hackTap(i); g.appendChild(b); }
    this.playSeq();
  }
  playSeq() {
    const h = this.hack; if (!h) return; h.lock = true; h.pos = 0; $('hackNote').textContent = `Memorise... (${h.tries} tries left)`; const btn = i => $('hackGrid').children[i];
    h.seq.forEach((n, k) => { setTimeout(() => { if (!this.hack) return; btn(n).classList.add('lit'); setTimeout(() => btn(n).classList.remove('lit'), 380); }, 700 + k * 650); });
    setTimeout(() => { if (this.hack) { h.lock = false; $('hackNote').textContent = 'Your turn'; } }, 700 + h.len * 650);
  }
  hackTap(i) {
    const h = this.hack; if (!h || h.lock) return; const b = $('hackGrid').children[i];
    if (i === h.seq[h.pos]) { b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 200); h.pos++; if (h.pos >= h.len) this.closeHack(true); }
    else { b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 300); h.tries--; if (h.tries <= 0) { $('hackNote').textContent = 'Locked out - resetting...'; h.tries = 3; h.seq = Array.from({ length: h.len }, () => Math.floor(Math.random() * 16)); } setTimeout(() => this.playSeq(), 600); }
  }
  closeHack(ok) {
    const h = this.hack; if (!h) return; this.hack = null; $('hack').hidden = true;
    if (ok) { this.H.toast('ACCESS GRANTED', 2000); if (h.o.effect === 'stars-1') this.G.setStars(Math.max(0, (this.G.police.stars || 1) - 1), 'hack'); this.advanceObj(); }
    else { this.hackCool = 6; }
  }

  /* ------------------------------------------------ gang fights (the host simulates, everyone sees and shoots) */
  updateGangObj(o, d, P) {
    const G = this.G, A = this.anchor(o.at);
    const key = this.curId + ':' + o.at + ':' + o.n; this.myGangKey = key;
    if (this.gangFor !== key) { this.gangFor = key; this.gangStart = performance.now(); if (this.isHost || !this.online) this.ensureGang(o, A, key); }
    const since = performance.now() - this.gangStart;
    if (this.online && !this.isHost && this.gangKey !== key && (this.reqT = (this.reqT || 0) - 0.016) < 0) { this.reqT = 3; this.net.sendEv('gangreq', { s: this.curId, k: key, at: o.at, n: o.n, boss: !!o.boss, hp: o.hp || 0, waves: o.waves || [] }, this.net.hostId); }
    if (this.gangKey !== key) return;
    const alive = this.gang.filter(g => g.hp > 0).length;
    if (this.gang.length && alive === 0 && since > 1500) this.advanceObj();
  }
  ensureGang(o, A, key) { if (this.gangKey === key) return; this.gangKey = key; this.spawnGang(o, A); }
  spawnGang(o, A) {
    const w = this.G.world, rnd = mulberry32(strHash(this.curId)), list = []; let id = 1;
    const put = (kind, hp) => { for (let k = 0; k < 14; k++) { const a = rnd() * 6.283, d = 8 + rnd() * 22, x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d; if (!this.G.law._blocked(x, z)) { list.push({ id: id++, x, z, h: 0, hp, max: hp, kind, st: 'idle', cd: 1 + rnd(), phase: 0, mv: 0 }); return; } } list.push({ id: id++, x: A.x + rnd() * 6, z: A.z + rnd() * 6, h: 0, hp, max: hp, kind, st: 'idle', cd: 1, phase: 0, mv: 0 }); };
    for (let i = 0; i < o.n; i++) put('thug', 60); if (o.boss) put('boss', o.hp || 300);
    this.gang = list; this.wavesLeft = (o.waves || []).map(w2 => ({ ...w2 })); this.bossMax = o.hp || 0; this.gangAnchor = A;
  }
  /** shots from the local player; returns true when a gang member was hit */
  hitGang(id, dmg) { if (this.isHost || !this.online) { const g = this.gang.find(x => x.id === id); if (g && g.hp > 0) { g.hp -= dmg; g.st = 'chase'; if (g.hp <= 0) { g.hp = 0; this.H.toast(g.kind === 'boss' ? 'THE KING IS DOWN!' : 'Enemy down', 1200); } } } else this.net.sendEv('hit', { id, dmg }, this.net.hostId); }
  onEv(k, d, from) {
    if (k === 'gangreq' && this.isHost) { if (d.s === this.curId && this.gangKey !== d.k) this.ensureGang({ at: d.at, n: d.n, boss: d.boss, hp: d.hp, waves: d.waves }, this.anchor(d.at), d.k); }
    else if (k === 'npc' && !this.isHost) { this.gangKey = d.k; this.gang = d.g.map(a => ({ id: a[0], x: a[1], z: a[2], h: a[3], hp: a[4], kind: a[5] === 1 ? 'boss' : a[5] === 2 ? 'rival' : 'thug', max: a[6], st: 'x', mv: a[7] || 0, phase: performance.now() / 90 })); this.gangDone = d.g.length === 0; }
    else if (k === 'hit' && this.isHost) this.hitGang(d.id, d.dmg);
    else if (k === 'dmg') this.G.hurt(d.n, 'gang');
    else if (k === 'boss') { this.G.setStars(d.stars, 'wave'); this.H.toast('Police and the rival gang storm the fort!', 3000); }
  }
  updateGang(dt) {
    if (!this.gang.length) return; const G = this.G, host = this.isHost || !this.online;
    if (!host) { return; }
    const targets = [{ id: this.myId, x: this.playerPos().x, z: this.playerPos().z, me: true }]; if (this.online) for (const [id, r] of this.net.remotes) { const s = this.net.sample(r, {}); if (s) targets.push({ id, x: s.x, z: s.z }); }
    for (const g of this.gang) {
      if (g.hp <= 0) { g.dead = (g.dead || 0) + dt; continue; }
      let t = null, bd = 1e9; for (const q of targets) { const d = Math.hypot(q.x - g.x, q.z - g.z); if (d < bd) { bd = d; t = q; } }
      if (!t) continue; if (g.st === 'idle' && bd < 48) g.st = 'chase'; if (g.st === 'idle') { g.mv = 0; continue; }
      const aim = Math.atan2(t.x - g.x, t.z - g.z); g.h = aim; let sp = bd > 11 ? (g.kind === 'boss' ? 2.4 : 3.4) : 0; g.mv = sp > 0 ? 1 : 0; g.phase += dt * 9 * g.mv;
      if (sp > 0) for (const off of [0, 0.6, -0.6, 1.2, -1.2]) { const a = aim + off, nx = g.x + Math.sin(a) * (sp * dt + 0.4), nz = g.z + Math.cos(a) * (sp * dt + 0.4); if (!G.law._blocked(nx, nz)) { g.x += Math.sin(a) * sp * dt; g.z += Math.cos(a) * sp * dt; break; } }
      if (bd < 38 && (g.cd -= dt) <= 0) { g.cd = (g.kind === 'boss' ? 0.7 : 1.15) + Math.random() * 0.5; g.fire = 0.1; if (Math.random() < Math.max(0.12, 0.55 - bd * 0.012)) { const dmg = g.kind === 'boss' ? 12 : 7; if (t.me) G.hurt(dmg, 'gang'); else this.net.sendEv('dmg', { n: dmg }, t.id); } }
    }
    if (this.bossMax) { const b = this.gang.find(g => g.kind === 'boss'); if (b && this.wavesLeft && this.wavesLeft.length && b.hp / b.max <= this.wavesLeft[0].at) { const w = this.wavesLeft.shift(); const A = this.gangAnchor, rnd = Math.random; for (let i = 0; i < w.n; i++) { const a = rnd() * 6.283; this.gang.push({ id: 100 + this.gang.length, x: A.x + Math.cos(a) * 26, z: A.z + Math.sin(a) * 26, h: 0, hp: 60, max: 60, kind: 'rival', st: 'chase', cd: 1, phase: 0, mv: 0 }); } G.setStars(w.stars, 'wave'); if (this.online) this.net.sendEv('boss', { stars: w.stars }); this.H.toast('Police and the rival gang storm the fort!', 3000); } }
    this.gang = this.gang.filter(g => g.hp > 0 || (g.dead || 0) < 6);
    this.syncT = (this.syncT || 0) + dt; if (this.online && this.syncT > 0.1) { this.syncT = 0; this.net.sendEv('npc', { k: this.gangKey, g: this.gang.map(g => [g.id, Math.round(g.x * 10) / 10, Math.round(g.z * 10) / 10, Math.round(g.h * 100) / 100, g.hp, g.kind === 'boss' ? 1 : g.kind === 'rival' ? 2 : 0, g.max, g.mv]) }); }
  }
  look(g) { return THUG_LOOK[g.kind] || THUG_LOOK.thug; }
}
