import { Story, CHAPTERS, ROLES } from '../client/src/story.js';
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
function room(n) {   // n players wired through a fake relay
  const ids = Array.from({ length: n }, (_, i) => i + 1), st = [], log = { pol: [], stop: 0, reward: 0, steps: 0 };
  for (const id of ids) st.push(new Story({ me: () => id, ids: () => ids, send: o => { for (const s of st) if (s !== me(id)) queue.push([s, o, id]); }, say() {}, reward: n => { log.reward += n; }, police: s => log.pol.push([id, s]), stopPolice: () => { log.stop++; }, onStep: () => { log.steps++; } }));
  const queue = []; const me = id => st[id - 1]; const pump = () => { while (queue.length) { const [s, o, from] = queue.shift(); s.onMsg(o, from); } };
  return { st, pump, log };
}
const where = { x: 0, z: 0 }, loc = () => where;
function play(n, choices) {
  const { st, pump, log } = room(n); st[0].start(); pump(); let guard = 0;
  while (!st[0].done && guard++ < 500) {
    const s = st[0].step;
    if (s.t === 'talk') st[n - 1].tap();
    else if (s.t === 'goto') for (const x of st) x.update(0.1, where, loc);
    else if (s.t === 'hack') for (let k = 0; k < 80; k++) for (const x of st) x.update(0.1, where, loc);
    else if (s.t === 'escape') for (const x of st) x.policeResult('escaped');
    else if (s.t === 'defeat') for (const x of st) for (let k = 0; k < s.n; k++) x.kill();
    else if (s.t === 'decide') for (const x of st) x.vote(choices[s.key]);
    pump();
  }
  return { st, log };
}
for (const [n, ch, end] of [[1, { question: 'lie', trust: 'trust', final: 'good' }, 'good'], [4, { question: 'silent', trust: 'confront', final: 'bad' }, 'bad'], [3, { question: 'lie', trust: 'trust', final: 'secret' }, 'secret'], [2, { question: 'lie', trust: 'confront', final: 'secret' }, 'good']]) {
  const { st, log } = play(n, ch);
  ok(st.every(s => s.done), `${n} player(s): all finish`);
  ok(st.every(s => s.ending === st[0].ending), `${n} player(s): same ending everywhere (${st[0].ending})`);
  if (end) ok(st[0].ending === end, `${n} player(s): expected ending ${end}`);
  ok(log.steps > 10, 'steps advanced');
}
// roles
const r = room(4); ok(new Set(r.st.map(s => s.role())).size === 4 && ROLES.length === 4, 'four players get four different roles');
const solo = room(1).st[0]; ok(solo.mine({ who: 'Hacker' }), 'solo player may do any role mission');
const duo = room(2).st; ok(!duo[0].mine({ who: 'Hacker' }) && !duo[1].mine({ who: 'Hacker' }) ? false : true, 'unfilled role falls back to someone');
console.log('chapters', CHAPTERS.length); ok(CHAPTERS.length === 6, 'six chapters');
console.log(fails ? 'STORY TESTS FAILED' : 'STORY TESTS PASSED'); process.exit(fails ? 1 : 0);
