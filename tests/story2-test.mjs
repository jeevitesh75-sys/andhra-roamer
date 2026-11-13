// Two-player story: every step is playable by BOTH characters, every anchor exists, all three endings are reachable by decisions.
import { createRequire } from 'module';
import { CHAPTERS, ROLES, ROLE_ORDER, ANCHORS, QUESTIONS, NPCS, variantKey, optionOpen } from '../client/src/storydata.js';
import { Speech } from '../client/src/tts.js';
const require = createRequire(import.meta.url); const S = require('../server/story.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(ROLE_ORDER.length === 2 && S.ROLES.length === 2, 'exactly two playable characters: ' + ROLE_ORDER.join(', '));
ok(!JSON.stringify(CHAPTERS).match(/Vikram|Raju|Meghana|Ranadheer|mastermind|hacker|insider|Pasha.*Kondapalli Warehouse/i), 'no trace of the old story (characters, names, roles)');
// ---- every mission step: both characters have objectives, all anchors/questions/speakers exist
let steps = 0, lines = 0, missions = 0;
const needObj = (o, where) => { for (const r of ROLE_ORDER) { const l = o[r] || o.default; ok(!!l, `${where}: objective for ${r}`); for (const t of (Array.isArray(l) ? l : [l])) { if (t.at) ok(!!ANCHORS[t.at], `${where}/${r}: anchor ${t.at}`); if (t.ask) ok(!!QUESTIONS[t.ask], `${where}: question ${t.ask}`); ok(['goto', 'hack', 'clear', 'escape', 'hold', 'talk', 'collect'].includes(t.k), `${where}/${r}: primitive ${t.k}`); } } };
for (const c of CHAPTERS) for (const s of c.steps) {
  steps++;
  if (s.need === 'all') { missions++; if (s.variants) for (const [k, v] of Object.entries(s.variants)) needObj(v.obj, s.id + '[' + k + ']'); else needObj(s.obj, s.id); for (const i of (s.intro || [])) ok(!!(NPCS[i.who] || ROLES[i.who]), s.id + ' intro speaker ' + i.who); }
  const shots = s.shots || (s.endings ? Object.values(s.endings).flatMap(e => e.shots) : []);
  for (const sh of shots) { lines++; ok(!!(NPCS[sh.who] || ROLES[sh.who]), `${s.id}: speaker ${sh.who}`); ok(sh.text && sh.dur >= 4, `${s.id}: line has text and time`); for (const a of sh.actors || []) ok(!!(NPCS[a.id] || ROLES[a.id]), `${s.id}: actor ${a.id}`); }
  if (s.at && s.at !== 'ending') ok(!!ANCHORS[s.at], `${s.id}: cutscene anchor ${s.at}`);
}
console.log(`   ${steps} steps, ${missions} missions, ${lines} spoken lines`);
ok(missions >= 20 && lines >= 60, 'long enough story (missions ' + missions + ', lines ' + lines + ')');
ok(CHAPTERS.length === 6, 'six chapters');
// ---- played end-to-end on the real server engine by two humans
function play(decisions) {
  const sent = []; const A = { id: 1, name: 'Arjun player' }, B = { id: 2, name: 'Karthik player' };
  const room = { players: new Map([[1, A], [2, B]]) }; const st = new S.Story(room, m => sent.push(m));
  ok(st.setRole(A, 'arjun') === '' && st.setRole(B, 'karthik') === '', 'roles picked'); ok(st.setRole({ id: 3 }, 'arjun') !== '', 'a third person cannot take Arjun');
  ok(st.start(A) === '', 'host starts story'); const seen = [];
  for (let guard = 0; guard < 80 && st.on; guard++) {
    const s = st.id; seen.push(s); const def = S.stepOf(st.ch, st.step);
    if (def.need === 'cut') { st.markReady(A, s); st.markReady(B, s); }
    else if (def.need === 'all') { st.markDone(A, s); ok(st.id === s, s + ': one player finishing is not enough (cooperation required)'); st.markDone(B, s); }
    else { const pick = decisions[s]; const opts = st._options(def); ok(opts.includes(pick), `${s}: option ${pick} available (${opts})`); st.vote(A, s, pick); st.vote(B, s, pick); }
  }
  return { st, seen };
}
const common = { c3_choice: 'lawyer', c4_choice: 'forgive', c5_choice: 'trustDev' };
let r = play({ ...common, c6_final: 'friendship' }); ok(r.st.ended && r.st.ending === 'friendship' && r.seen.length === steps, 'ENDING 1 friendship reached through all ' + steps + ' steps');
r = play({ ...common, c3_choice: 'escape', c6_final: 'underworld' }); ok(r.st.ending === 'underworld', 'ENDING 3 underworld reached (jail-escape route)');
r = play({ ...common, c4_choice: 'cold', c6_final: 'betrayal' }); ok(r.st.ending === 'betrayal', 'ENDING 2 betrayal reached (stayed cold with Karthik)');
r = play({ ...common, c5_choice: 'doubtDev', c6_final: 'betrayal' }); ok(r.st.ending === 'betrayal', 'ENDING 2 also reachable by doubting Dev');
ok(!optionOpen('betrayal', common) && optionOpen('betrayal', { c4_choice: 'cold' }), 'betrayal ending is locked unless earlier decisions unlock it');
{ // betrayal vote is refused when locked
  const A = { id: 1, name: 'a' }, room = { players: new Map([[1, A]]) }, st = new S.Story(room, () => {}); st.setRole(A, 'arjun'); st.start(A, 6); st.choices = { c4_choice: 'forgive', c5_choice: 'trustDev' };
  for (let i = 0; i < 5 && st.id !== 'c6_final'; i++) { const d = S.stepOf(st.ch, st.step); if (d.need === 'cut') st.markReady(A, st.id); else if (d.need === 'all') st.markDone(A, st.id); }
  const before = st.id; st.vote(A, 'c6_final', 'betrayal'); ok(st.id === before, 'locked ending cannot be voted'); }
{ // ties: Arjun decides
  const A = { id: 1, name: 'a' }, B = { id: 2, name: 'b' }, room = { players: new Map([[1, A], [2, B]]) }, st = new S.Story(room, () => {}); st.setRole(A, 'karthik'); st.setRole(B, 'arjun'); st.start(A, 4);
  for (let i = 0; i < 6 && st.id !== 'c4_choice'; i++) { const d = S.stepOf(st.ch, st.step); if (d.need === 'cut') { st.markReady(A, st.id); st.markReady(B, st.id); } else if (d.need === 'all') { st.markDone(A, st.id); st.markDone(B, st.id); } }
  st.vote(A, 'c4_choice', 'forgive'); st.vote(B, 'c4_choice', 'cold'); ok(st.choices.c4_choice === 'cold', 'on a tie Arjun (player 2 here) decides: ' + st.choices.c4_choice); }
{ // solo: one human + AI partner finishes alone
  const A = { id: 1, name: 'solo' }, room = { players: new Map([[1, A]]) }, st = new S.Story(room, () => {}); st.start(A);
  for (let g = 0; g < 80 && st.on; g++) { const d = S.stepOf(st.ch, st.step); if (d.need === 'cut') st.markReady(A, st.id); else if (d.need === 'all') st.markDone(A, st.id); else { st.vote(A, st.id, st._options(d)[0]); } }
  ok(st.ended, 'a single player can finish the whole story with an AI partner'); }
// ---- variant helper
ok(variantKey(CHAPTERS[2].steps.find(s => s.id === 'c3_out'), { choices: { c3_choice: 'escape' } }) === 'escape', 'c3_out picks the jail-escape variant');
// ---- dialogue is read aloud: fake speechSynthesis
const spoken = []; globalThis.window = {}; window.speechSynthesis = globalThis.speechSynthesis = { getVoices: () => [{ name: 'Microsoft Ravi', lang: 'en-IN' }, { name: 'Microsoft Heera', lang: 'en-IN' }], speak: u => { spoken.push(u); setTimeout(() => u.onend && u.onend(), 1); }, cancel() {} };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; } };
const tts = new Speech(); let ended = 0; ok(tts.say('Arjun, we promised.', 'arjun', () => ended++), 'say() starts speech');
await new Promise(r => setTimeout(r, 20)); ok(ended === 1, 'onend fires so the cutscene moves on'); ok(/Ravi/.test(tts.pick('king').name) && /Heera/.test(tts.pick('lakshmi').name), 'male/female voices chosen per character');
ok(spoken[0].pitch < 1 && tts.pick('king') && true, 'Arjun voice is lower pitched'); tts.say('x', 'king'); ok(spoken[1].pitch < spoken[0].pitch, 'The King sounds deeper than Arjun');
tts.toggle(); ok(tts.say('muted', 'arjun') === false, 'voice can be switched off (subtitles continue on a timer)');
console.log(fails ? fails + ' FAILURES' : 'story2-test OK'); process.exit(fails ? 1 : 0);
