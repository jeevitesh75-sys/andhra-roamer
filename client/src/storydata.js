// ANDHRA UNDERWORLD: BLOOD & BETRAYAL - the complete two-player script (all fictional). Pure data, no engine code.
// tests/story-sync-test.mjs checks that chapter/step ids and 'need' types here match server/story.js.
//
// Mission objective primitives (per role, a list is done in order):
//   goto  {at, r, veh:'any'|'in'|'out', text}       reach an anchor (optionally in a vehicle / on foot)
//   hack  {at, r, game:'seq'|'cipher'|'trace', len}  terminal mini-game next to an anchor
//   clear {at, n, boss, hp, waves, text}             shared gang fight (host simulates enemies) - done when all are down
//   escape{stars, text}                              start a police chase and lose it (arrest = custody, then it counts as done)
//   hold  {at, r, secs, text}                        stay inside the circle
// Cutscene shot: {cam, look, dur, who, text, actors:[{id,at}], props:[...]}. Every line is also READ OUT LOUD (client/src/tts.js).

export const ROLE_ORDER = ['arjun', 'karthik'];
export const ROLES = {
  arjun: { name: 'Arjun', short: 'Arjun', title: 'The Leader', emoji: '🧠', color: '#f6c744', shirt: '#7a1f2b', pants: '#1c2230', rig: 'casual', blurb: 'Intelligent and brave. A natural leader with a criminal past he never talks about. Makes the big decisions.' },
  karthik: { name: 'Karthik', short: 'Karthik', title: 'The Driver', emoji: '🏎️', color: '#8fa6ff', shirt: '#1f8a8a', pants: '#2a2a35', rig: 'man2', blurb: 'Arjun\'s best friend. Expert driver. Emotional, unpredictable... and hiding a connection to the police.' },
};
export const NPCS = {
  king: { name: 'THE KING - Raghav', emoji: '👑', color: '#d4af37', shirt: '#0c0c0f', pants: '#0c0c0f', hat: 'crown', hatModel: 'top', rig: 'man2', s: 1.08 },
  dasari: { name: 'Dasari (Raghav\'s man)', emoji: '🕴️', color: '#d4af37', shirt: '#4a1212', pants: '#1b1b1b', hat: 'bandana', hatModel: 'cowboy', rig: 'man2' },
  dev: { name: 'ACP Dev', emoji: '👮', color: '#6aa0ff', shirt: '#2c4a8c', pants: '#1b2a52', hat: 'cap', rig: 'man2', s: 1.05 },
  pasha: { name: 'Pasha (Kondapalli Crew)', emoji: '🔪', color: '#ff6b6b', shirt: '#6b1f1f', pants: '#1b1b1b', hat: 'bandana', hatModel: 'cowboy', rig: 'casual' },
  lakshmi: { name: 'Lakshmi', emoji: '👧', color: '#ff9ad5', shirt: '#b83a8a', pants: '#2c3e50', rig: 'womanA' },
  rani: { name: 'Rani (the King\'s wife)', emoji: '💎', color: '#e8a0c8', shirt: '#7a0f2e', pants: '#1b1b1b', rig: 'womanB' },
  sravani: { name: 'Sravani', emoji: '🌸', color: '#ff9ad5', shirt: '#d44a8a', pants: '#2c3e50', rig: 'womanA' },
  radio: { name: 'Police Radio', emoji: '📻', color: '#6aa0ff' },
  narrator: { name: '', emoji: '', color: '#ffffff' },
  anon: { name: 'Unknown number', emoji: '❓', color: '#bbbbbb' },
};
export const THUG_LOOK = { thug: { color: '#7a1f1f', pants: '#1b1b1b', hat: 'bandana' }, rival: { color: '#1f5f7a', pants: '#1b1b1b', hat: 'bandana' }, boss: { color: '#0c0c0f', pants: '#0c0c0f', hat: 'crown' } };

/** where things happen, relative to the start town (metres). dist/ang are tried in order until a road point is found. */
export const ANCHORS = {
  town:        { label: 'Home town', dist: 0, ang: 0 },
  tea:         { label: "Naidu's Tea Stall", dist: 140, ang: 0.5 },
  garage:      { label: "Karthik's Garage", dist: 330, ang: 2.2 },
  warehouse:   { label: 'Abandoned Warehouse', dist: 1500, ang: 0.9 },
  club:        { label: "Raghav's Velvet Club", dist: 1250, ang: 5.6 },
  meet:        { label: 'Port Godown (underworld meeting)', dist: 1800, ang: 4.6 },
  meetGate:    { label: 'Godown gate', near: 'meet', dist: 45, ang: 0.6 },
  den:         { label: 'Kondapalli Crew Den', dist: 2300, ang: 3.9 },
  denGate:     { label: 'Den gate', near: 'den', dist: 55, ang: 0.4 },
  yard:        { label: 'Secret smuggling yard', dist: 3000, ang: 2.6 },
  yardTerm:    { label: 'Yard office terminal', near: 'yard', dist: 24, ang: 1.8 },
  station:     { label: 'Police Station', station: true },
  checkpoint:  { label: 'Police checkpoint', fromStation: 420, ang: 0 },
  safehouse:   { label: 'Safehouse', dist: 1900, ang: 5.4 },
  bridge:      { label: 'Old Bridge', dist: 2700, ang: 1.9 },
  highway:     { label: 'Highway ambush', dist: 4200, ang: 1.4 },
  factory:     { label: 'Abandoned Factory', dist: 3700, ang: 3.6 },
  factoryGate: { label: 'Factory gate', near: 'factory', dist: 80, ang: 3.1 },
  port:        { label: "The King's escape port", dist: 5600, ang: 5.0 },
  portGate:    { label: 'Port gate', near: 'port', dist: 85, ang: 3.1 },
  hideout:     { label: 'Hideout', dist: 3500, ang: 5.9 },
};

const C = (who, text) => ({ who, text });
/** Build a cutscene from a cast and a list of [speaker, text] lines. Camera moves rotate through presets so every shot looks different. */
function scene(cast, lines, opt = {}) {
  const pos = { arjun: [-1.4, 0], karthik: [1.4, 0.4], king: [4, 4], dasari: [6, 5], dev: [4, 3.4], pasha: [4, 4], lakshmi: [0, 2.4], rani: [3.2, 3.3], sravani: [0.4, 0.4] };
  const actors = cast.map(id => ({ id, at: (opt.at && opt.at[id]) || pos[id] || [0, 0] }));
  const presets = [(r, h) => ['orbit', r, h, 0.2, 0.6], (r, h) => ['orbit', r - 1, h - 0.3, -0.24, 2.4], (r, h) => ['fly', [-r * 2, h + 3, -r * 2], [-r * 0.5, h, -r * 0.6]], (r, h) => ['orbit', r - 2, h - 0.5, 0.3, 4.4], (r, h) => ['fly', [r * 2, h + 1, r], [r * 0.6, h - 0.4, r * 0.5]]];
  return lines.map(([who, text, extra], i) => {
    const words = text.split(/\s+/).length, dur = Math.max(4.5, Math.round((words * 0.42 + 1.6) * 10) / 10);
    return { cam: presets[(i + (opt.k || 0)) % presets.length](opt.r || 9, opt.h || 2.6), look: opt.look || [1, 1.5, 1], dur, who, text, actors, ...(extra || {}), ...(i === 0 && opt.props ? { props: opt.props } : {}) };
  });
}
const CAR = (color, at, h = 0, bar = false) => ({ type: 'car', color, at, h, bar });

export const CHAPTERS = [
  /* =========================================================== 1 */
  { id: 1, name: 'TWO FRIENDS', steps: [
    { id: 'c1_intro', need: 'cut', title: 'Chapter 1 - Two Friends', at: 'town', shots: [
      { cam: ['fly', [0, 90, -120], [0, 22, -60]], look: [0, 2, 0], dur: 8, who: 'narrator', text: 'Andhra Pradesh, midnight. A small town where the streetlights flicker and the rent is always late.' },
      ...scene(['arjun', 'karthik'], [
        ['arjun', 'Karthik, we have not eaten properly in three days. Mother is selling her bangles tomorrow. I cannot let that happen.'],
        ['karthik', 'Arjun, I drive a rented auto for eleven hours and I still cannot pay for her medicine. This town is eating us alive.'],
        ['arjun', 'We were kids on the same street. We promised we would never be poor again. I intend to keep that promise.'],
        ['narrator', 'Then, at the tea stall across the road, a phone starts to ring.'],
      ], { r: 8, look: [0, 1.5, 0] }),
    ] },
    { id: 'c1_explore', need: 'all', title: 'Free Roam - The Tea Stall', intro: [C('karthik', "Arjun, my phone is ringing at Naidu's Tea Stall. Unknown number. Come with me, but look around the town first if you want.")],
      obj: { default: { k: 'goto', at: 'tea', r: 24, veh: 'any', text: "Explore the Andhra map freely, then meet at Naidu's Tea Stall" } } },
    { id: 'c1_call', need: 'cut', title: 'The Mysterious Call', at: 'tea', shots: scene(['arjun', 'karthik'], [
      ['anon', 'Karthik Reddy. Best driver in the district. And your friend Arjun, the one with the past. I have a job that pays one lakh for one night.'],
      ['karthik', 'Who is this? How do you know my name?'],
      ['anon', 'I know everything about you. Come to the abandoned warehouse on the old road. Bring Arjun. Do not bring the police.'],
      ['arjun', 'One lakh. Karthik, this is either a miracle or a grave. Either way, we are going.'],
      ['karthik', 'Then I drive. Get the garage open. If this is a trap, at least we will arrive in style.'],
    ], { r: 7, look: [0, 1.5, 0] }) },
    { id: 'c1_drive', need: 'all', title: 'Driving Mission - To the Warehouse', intro: [C('karthik', "Take a car from my garage. Whoever drives, follow the old road. Do not scratch anything, it is borrowed.")],
      obj: {
        arjun: [{ k: 'goto', at: 'garage', r: 20, veh: 'any', text: "Meet Karthik at his garage" }, { k: 'goto', at: 'warehouse', r: 40, veh: 'any', text: 'Travel to the abandoned warehouse on the old road' }],
        karthik: [{ k: 'goto', at: 'garage', r: 18, veh: 'in', text: "Take a vehicle (E near a parked car) and bring it to the garage" }, { k: 'goto', at: 'warehouse', r: 40, veh: 'in', text: 'Drive to the abandoned warehouse - arrive in a vehicle' }],
      } },
    { id: 'c1_king', need: 'cut', title: 'The King', at: 'warehouse', shots: [
      { cam: ['fly', [30, 14, 40], [14, 3, 16]], look: [0, 1.5, 0], dur: 6, who: 'narrator', text: 'Inside the dark warehouse, a single lamp burns above a long table. A man in a black coat is waiting.', props: [CAR('#0c0c0f', [10, 8], 2.6), CAR('#0c0c0f', [13, 3], 3.4)] },
      ...scene(['arjun', 'karthik', 'king', 'dasari'], [
        ['king', 'Arjun. Karthik. Sit. They call me The King. My name is Raghav, but only my enemies use it, and they do not live long.'],
        ['king', 'I run the ports, the lorries and the bus stands of Andhra Pradesh. What I need is two friends who trust each other completely.'],
        ['arjun', 'Nobody pays a lakh for trust. What is the real job?'],
        ['king', 'Clever. A delivery. Karthik drives, Arjun watches. Do it well and you will never be hungry again. Do it badly... and you will not be hungry at all.'],
        ['karthik', 'Arjun, I do not like this man. But I do like the money.'],
        ['arjun', 'We take the job. Once. Then we walk away.'],
        ['king', 'Everyone says once, Arjun. Dasari will show you the road.'],
      ], { r: 9, k: 1, at: { arjun: [-1.4, 0], karthik: [-0.2, 0.8], king: [3.4, 3.4], dasari: [5.5, 5] } }),
    ] },
    { id: 'c1_first_job', need: 'all', title: "The First Delivery", intro: [C('dasari', "Velvet Club, front door. Karthik drives the package, Arjun walks in with the envelope. Do not open the boxes.")],
      obj: {
        arjun: [{ k: 'goto', at: 'club', r: 18, veh: 'any', text: "Take the envelope to Raghav's Velvet Club" }],
        karthik: [{ k: 'goto', at: 'club', r: 18, veh: 'in', text: "Drive the delivery to the Velvet Club - arrive in a vehicle" }],
      } },
  ] },
  /* =========================================================== 2 */
  { id: 2, name: 'THE KINGDOM', steps: [
    { id: 'c2_org', need: 'cut', title: 'Chapter 2 - The Kingdom', at: 'club', shots: [
      { cam: ['fly', [0, 60, -80], [0, 14, -30]], look: [0, 3, 0], dur: 6, who: 'narrator', text: 'Months pass. Arjun and Karthik move from poverty to power. Behind the neon of the Velvet Club lies a kingdom.' },
      ...scene(['arjun', 'karthik', 'king', 'dasari'], [
        ['king', 'Seven districts answer to me. Customs, police stations, even a few ministers. Nobody sees me. Nobody asks. That is why I never lose.'],
        ['dasari', 'The Kondapalli Crew, led by Pasha, are stealing our shipments. They also want to meet in secret with a buyer. We must hear what is said.'],
        ['arjun', 'Then we go together. I listen at the meeting, Karthik keeps the engine running.'],
        ['karthik', 'And if it goes wrong, I drive us out. I always do.'],
      ], { r: 9, at: { arjun: [-1.4, 0], karthik: [-0.2, 0.8], king: [3.4, 3.4], dasari: [5.5, 5] } }),
    ] },
    { id: 'c2_queen', need: 'cut', title: 'The King\'s Queen', at: 'club', shots: scene(['king', 'rani'], [
      ['rani', 'Raghav, the Kondapalli men were seen near the port again. Pasha is not afraid of you anymore.', { lovers: ['king', 'rani'], pose: 'hug' }],
      ['king', 'Fear is a habit, Rani. I will teach it to him again. Tonight, the club is ours.', { lovers: ['king', 'rani'], pose: 'hug' }],
      ['rani', 'Then come home alive. That is all I ask of this kingdom.', { lovers: ['king', 'rani'], pose: 'kiss' }],
      ['narrator', 'Even a king has one weakness. Pasha is about to learn what it is.', { lovers: ['king', 'rani'], pose: 'kiss' }],
    ], { r: 4.2, h: 1.7, look: [0, 1.5, 0] }) },
    { id: 'c2_meeting', need: 'all', title: 'Underworld Meeting', intro: [C('arjun', "Karthik, park near the godown gate. I will go in and listen. If I raise a hand, you drive like never before.")],
      obj: {
        arjun: [{ k: 'goto', at: 'meetGate', r: 30, veh: 'any', text: 'Go to the Port Godown gate for the underworld meeting' }, { k: 'hold', at: 'meetGate', r: 14, secs: 12, text: 'Stay close and listen to the meeting' }],
        karthik: [{ k: 'goto', at: 'meetGate', r: 30, veh: 'in', text: 'Drive Arjun to the godown gate - arrive in a vehicle' }, { k: 'hold', at: 'meetGate', r: 20, secs: 12, text: 'Keep the engine running and watch the road' }],
      } },
    { id: 'c2_rival', need: 'all', title: 'Rival Gang - The Kondapalli Den', heat: false, intro: [C('arjun', "Pasha knows we were listening. His men are waiting at the den. Karthik, cover my back. They shoot first.")],
      obj: {
        arjun: [{ k: 'goto', at: 'denGate', r: 30, veh: 'any', text: 'Reach the Kondapalli den gate' }, { k: 'clear', at: 'den', n: 5, text: "Take down Pasha's men together" }],
        karthik: [{ k: 'goto', at: 'denGate', r: 30, veh: 'in', text: 'Bring a vehicle to the den gate - this is your getaway ride' }, { k: 'clear', at: 'den', n: 5, text: "Take down Pasha's men together" }],
      } },
    { id: 'c2_escape', need: 'all', title: 'Escaping the Police Patrols', radioChatter: true, heat: true, intro: [C('radio', 'All units: gunfire reported near the Kondapalli den. Patrol cars and bikes, check every road out of there.')],
      obj: {
        arjun: [{ k: 'escape', stars: 2, text: 'POLICE! Lose the patrols (2 stars) - or be arrested and questioned' }],
        karthik: [{ k: 'escape', stars: 2, text: 'POLICE! Lose the patrols (2 stars). Use your driving, Karthik.' }],
      } },
    { id: 'c2_secret', need: 'all', title: 'Secret Location - The Smuggling Yard', intro: [C('dasari', "There is a yard the King never shows anyone. Find it. Arjun reads the office terminal, Karthik watches the road.")],
      obj: {
        arjun: [{ k: 'goto', at: 'yardTerm', r: 30, veh: 'any', text: 'Find the secret smuggling yard' }, { k: 'hack', at: 'yardTerm', r: 14, game: 'seq', len: 5, text: 'Open the yard office terminal and read the shipment records' }],
        karthik: [{ k: 'goto', at: 'yard', r: 30, veh: 'in', text: 'Drive to the secret yard and keep watch' }, { k: 'hold', at: 'yard', r: 30, secs: 14, text: 'Keep watch while Arjun reads the records' }],
      } },
    { id: 'c2_protect', need: 'all', title: 'Protect the Accountant', intro: [C('dasari', "Meena the accountant is carrying the King's books. Pasha's survivors want her dead. Protect her at the godown. Both of you.")],
      obj: {
        arjun: [{ k: 'goto', at: 'meet', r: 30, veh: 'any', text: 'Reach the Port Godown where Meena is hiding' }, { k: 'clear', at: 'meet', n: 4, text: 'Protect Meena - stop the assassins' }],
        karthik: [{ k: 'goto', at: 'meet', r: 30, veh: 'in', text: 'Drive to the godown - Meena must leave safely' }, { k: 'clear', at: 'meet', n: 4, text: 'Protect Meena - stop the assassins' }],
      } },
    { id: 'c2_end', need: 'cut', title: 'A Warning', at: 'meet', shots: [
      ...scene(['arjun', 'karthik', 'king'], [
        ['king', 'Pasha is finished. You two are better than I hoped. There will be more work. Much more.'],
        ['arjun', 'Karthik, I saw the crates in that yard. It is not only cargo. It is poison. Entire towns of it.'],
        ['karthik', 'I know. I have known for weeks. Arjun... whatever happens, remember we started this to save our families.'],
        ['narrator', 'Far away, on a police wall, two photographs are pinned side by side. A special officer has just been assigned.'],
      ], { r: 8, at: { arjun: [-1.5, 0], karthik: [0.2, 0.4], king: [4, 4] } }),
    ] },
  ] },
  /* =========================================================== 3 */
  { id: 3, name: 'THE POLICE', steps: [
    { id: 'c3_dev', need: 'cut', title: 'Chapter 3 - The Police', at: 'yard', shots: [
      { cam: ['fly', [24, 7, 24], [12, 2.6, 10]], look: [0, 1.8, 0], dur: 6, who: 'narrator', text: 'Blue lights wash over the smuggling yard. A white police SUV stops. The officer everyone fears steps out.', props: [CAR('#1d3a8a', [9, 7], 2.4, true), CAR('#1d3a8a', [13, 2], 3.1, true)] },
      ...scene(['arjun', 'karthik', 'dev'], [
        ['dev', 'I am ACP Dev. Seven murders, forty trucks of poison, and one name nobody will give me. For six years I have chased The King.'],
        ['dev', 'Today I found two faces on a CCTV tape. Arjun and Karthik. Come to the station tomorrow. Just a few questions.'],
        ['arjun', 'And if we do not come?'],
        ['dev', 'Then I come to you. With a warrant. And a lot of friends.'],
      ], { r: 8, at: { arjun: [-1.4, 0], karthik: [-0.2, 0.8], dev: [4, 3] } }),
    ] },
    { id: 'c3_station', need: 'all', title: 'Questioning at the Station', intro: [C('dev', "Station. On foot, no vehicles at my door. I want to look at you while you answer.")],
      obj: {
        arjun: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Report to the police station for questioning', ask: 'q1' }],
        karthik: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Report to the police station. ACP Dev asked for you personally.', ask: 'q2' }],
      } },
    { id: 'c3_checkpoint', need: 'all', title: 'Police Checkpoint', checkpoints: true, intro: [C('karthik', "Dev let us go too easily. There will be a checkpoint on the way to the safehouse. Arjun, what do we do?")],
      obj: {
        arjun: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'any', text: 'Reach the safehouse - go through, or around, the police checkpoint' }],
        karthik: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'in', text: 'Drive to the safehouse. Running the checkpoint will bring the police.' }],
      } },
    { id: 'c3_wanted', need: 'all', title: 'Wanted!', heat: true, intro: [C('radio', 'All units! Suspects fled the checkpoint. Two persons of interest, one in a stolen vehicle. SUVs and bikes, stop them. Repeat: stop them.')],
      obj: {
        arjun: [{ k: 'escape', stars: 3, text: 'WANTED: lose the police (3 stars) - or be arrested and questioned' }],
        karthik: [{ k: 'escape', stars: 3, text: 'WANTED: lose the police (3 stars). Drive!' }],
      } },
    { id: 'c3_arrest', need: 'cut', title: 'Arrested', at: 'station', shots: [
      { cam: ['fly', [20, 6, 20], [8, 2.4, 8]], look: [0, 1.6, 0], dur: 6, who: 'narrator', text: 'Handcuffs. Flashing lights. A cold interrogation room that smells of old tea and fear.', props: [CAR('#1d3a8a', [8, 6], 2.4, true)] },
      ...scene(['arjun', 'karthik', 'dev'], [
        ['dev', 'Two friends. One lakh for one night, was it? I know about the warehouse, Arjun. I know about the delivery.'],
        ['arjun', 'I want a lawyer. And I want to know why you are looking at Karthik like that.'],
        ['dev', 'Like what? Like a man who owes me an answer? Karthik will speak when he is ready. You have a decision to make.'],
        ['dev', 'I can arrange a legal release if you promise to cooperate. Or you can try your luck with the lock on cell number three.'],
      ], { r: 7, at: { arjun: [-1.2, 0], karthik: [0.4, 0.6], dev: [3.2, 2.4] } }),
    ] },
    { id: 'c3_choice', need: 'vote', title: 'How do we get out?', text: 'Dev offers a deal. Or you break out. The choice changes how Dev treats you later.', options: [
      { id: 'lawyer', label: 'Legal release', desc: "Accept Dev's deal. Walk out clean - but Dev now expects answers." },
      { id: 'escape', label: 'Jail escape', desc: 'Break out of the cell. Faster, louder, and Dev will not forget it.' },
    ] },
    { id: 'c3_out', need: 'all', title: 'Out of Custody', variantOn: 'c3_choice',
      variants: {
        lawyer: { intro: [C('dev', "You are free to go. Do not leave the district. I will be watching, Arjun.")], obj: {
          arjun: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'any', text: 'Walk out of the station and reach the safehouse' }],
          karthik: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'in', text: 'Collect a vehicle and drive to the safehouse' }] } },
        escape: { intro: [C('karthik', "Cell door is open. Arjun, the guards change in a minute. Go, go, go!")], heat: true, obj: {
          arjun: [{ k: 'escape', stars: 2, text: 'JAIL BREAK: get away from the station (2 stars)' }, { k: 'goto', at: 'safehouse', r: 24, veh: 'any', text: 'Reach the safehouse' }],
          karthik: [{ k: 'escape', stars: 2, text: 'JAIL BREAK: get Arjun out and lose the police (2 stars)' }, { k: 'goto', at: 'safehouse', r: 24, veh: 'in', text: 'Drive to the safehouse' }] } },
      } },
    { id: 'c3_end', need: 'cut', title: 'The Net Tightens', at: 'safehouse', shots: scene(['arjun', 'karthik'], [
      ['arjun', 'Dev knew the exact time we were at the yard. Somebody is feeding him.'],
      ['karthik', 'Or Dev is just good at his job. Let us not panic, Arjun.'],
      ['arjun', 'You never panic, Karthik. You are always so calm. Strange, is it not?'],
      ['narrator', 'The first crack appears between two friends. Neither of them says it aloud.'],
    ], { r: 7, look: [0, 1.5, 0] }) },
    { id: 'c3_sravani', need: 'cut', title: 'A Quiet Moment', at: 'town', shots: scene(['karthik', 'sravani'], [
      ['sravani', 'Karthik, you came home. You look like you have not slept in days.', { lovers: ['karthik', 'sravani'], pose: 'hug' }],
      ['karthik', 'Arjun is starting to doubt me, Sravani. And I cannot tell him why I talk to Dev.', { lovers: ['karthik', 'sravani'], pose: 'hug' }],
      ['sravani', 'Then tell him the truth before someone else does. I will stand beside you, whatever happens.', { lovers: ['karthik', 'sravani'], pose: 'kiss' }],
      ['narrator', 'For one night, Karthik forgets the lies. The truth, however, is already on its way.', { lovers: ['karthik', 'sravani'], pose: 'kiss' }],
    ], { r: 4.2, h: 1.7, look: [0, 1.5, 0] }) },
  ] },
  /* =========================================================== 4 */
  { id: 4, name: 'THE SECRET', steps: [
    { id: 'c4_leak', need: 'cut', title: 'Chapter 4 - The Secret', at: 'safehouse', shots: scene(['arjun', 'karthik'], [
      ['narrator', 'At night, Karthik leaves his phone on the safehouse table. It buzzes. The screen lights up: ACP DEV.'],
      ['arjun', 'Karthik. Why is a police officer messaging you at two in the morning?'],
      ['karthik', 'Arjun, give me the phone. Please. I can explain.'],
      ['arjun', 'Read it out. Every word. "The King moves on Friday. Keep Arjun safe." Keep me safe? From whom?'],
    ], { r: 7, look: [0, 1.5, 0] }) },
    { id: 'c4_fight', need: 'cut', title: 'The Truth', at: 'safehouse', shots: scene(['arjun', 'karthik'], [
      ['karthik', 'Two years ago, my sister Lakshmi was almost killed by The King\'s drugs. I went to Dev. I have been working with the police ever since.'],
      ['arjun', 'You lied to me every single day. We ate together. We bled together. You sold me to a policeman.'],
      ['karthik', 'I did not sell you. I tried to save you! Dev promised that you would walk free. That is the only reason I stayed.'],
      ['arjun', 'Brothers do not make deals behind each other\'s backs. Get out. Get out before I do something I regret.'],
      ['karthik', 'Arjun, please. We will burn together if we do not stand together.'],
      ['arjun', 'Then I will burn alone.'],
    ], { r: 6, look: [0, 1.5, 0], at: { arjun: [-1.2, 0], karthik: [1.2, 0] } }) },
    { id: 'c4_split', need: 'all', title: 'Separate Ways', intro: [C('narrator', 'For a while, the two friends walk different roads. But the night is not finished with either of them.')],
      obj: {
        arjun: [{ k: 'goto', at: 'bridge', r: 30, veh: 'any', text: 'Alone. Go to the Old Bridge and think about what Karthik did' }, { k: 'hack', at: 'bridge', r: 18, game: 'trace', len: 5, text: "Read Raghav's message on your phone: he wants a meeting about Karthik" }],
        karthik: [{ k: 'goto', at: 'station', r: 16, veh: 'in', text: 'Drive to the police station and tell ACP Dev what has happened' }, { k: 'goto', at: 'bridge', r: 30, veh: 'in', text: 'Dev says Arjun is in danger. Drive to the Old Bridge' }],
      } },
    { id: 'c4_reunite', need: 'all', title: 'Reunion at the Bridge', intro: [C('karthik', "Arjun, Raghav's men are coming for you. I do not care if you hate me. Stay alive.")],
      obj: {
        arjun: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'any', text: "Raghav's men are close. Get to the safehouse" }, { k: 'clear', at: 'bridge', n: 4, text: "Defend yourself against Raghav's men with Karthik" }],
        karthik: [{ k: 'clear', at: 'bridge', n: 4, text: "Defend Arjun against Raghav's men" }, { k: 'goto', at: 'safehouse', r: 24, veh: 'in', text: 'Drive Arjun to the safehouse' }],
      } },
    { id: 'c4_choice', need: 'vote', title: 'Can Arjun forgive Karthik?', text: 'Arjun knows the truth. What now between the two friends? (If you disagree, Arjun decides.)', options: [
      { id: 'forgive', label: 'Forgive him', desc: 'We start this war together. Honest, painful - and friends again.' },
      { id: 'cold', label: 'Stay cold', desc: 'Work together because we must. But trust is gone. This path leaves a door open to betrayal.' },
    ] },
  ] },
  /* =========================================================== 5 */
  { id: 5, name: 'BLOOD AND BETRAYAL', steps: [
    { id: 'c5_kidnap', need: 'cut', title: 'Chapter 5 - Blood and Betrayal', at: 'safehouse', shots: scene(['arjun', 'karthik', 'king'], [
      ['narrator', 'Raghav has been watching. Every phone call. Every meeting. He knows about Karthik and Dev.'],
      ['king', 'A police informer in my house. And a leader who trusted him. I am deeply disappointed, Arjun. So I have taken something of yours.'],
      ['karthik', 'Lakshmi! Where is my sister? Raghav, if you touch her...'],
      ['king', 'The old factory, Karthik. Come alone. Or come together. Either way, bring the ledger. And bring no policemen.'],
      ['arjun', 'Karthik, forget what I said at the safehouse. She is our sister. We get her back. Tonight.'],
    ], { r: 8, at: { arjun: [-1.4, 0], karthik: [-0.2, 0.8], king: [3.5, 3.5] } }) },
    { id: 'c5_chase', need: 'all', title: 'Race to the Factory', heat: true, intro: [C('karthik', "The factory is on the far side of the district. Arjun, hold on. I am going to drive like never before.")],
      obj: {
        arjun: [{ k: 'goto', at: 'highway', r: 50, veh: 'any', text: "Head to the highway - Raghav's gang is waiting" }, { k: 'clear', at: 'highway', n: 5, text: "Fight off Raghav's ambush" }, { k: 'goto', at: 'factoryGate', r: 40, veh: 'any', text: 'Get to the factory gate' }],
        karthik: [{ k: 'goto', at: 'highway', r: 50, veh: 'in', text: 'Drive Arjun to the highway ambush' }, { k: 'clear', at: 'highway', n: 5, text: "Fight off Raghav's ambush" }, { k: 'goto', at: 'factoryGate', r: 40, veh: 'in', text: 'Drive to the factory gate' }],
      } },
    { id: 'c5_factory', need: 'all', title: 'The Abandoned Factory', heat: false, intro: [C('arjun', "Gate first. Then the gunmen. Karthik, do not shoot unless you must - Lakshmi is somewhere in there.")],
      obj: {
        arjun: [{ k: 'goto', at: 'factoryGate', r: 40, veh: 'any', text: 'Reach the factory gate' }, { k: 'hack', at: 'factoryGate', r: 15, game: 'cipher', len: 5, text: 'Break the gate lock' }, { k: 'clear', at: 'factory', n: 8, waves: [{ at: 0.5, n: 4, kind: 'rival', stars: 1 }], text: "Clear the factory of Raghav's gunmen" }],
        karthik: [{ k: 'goto', at: 'factoryGate', r: 40, veh: 'any', text: 'Reach the factory gate' }, { k: 'hold', at: 'factoryGate', r: 30, secs: 8, text: 'Cover Arjun while he breaks the lock' }, { k: 'clear', at: 'factory', n: 8, waves: [{ at: 0.5, n: 4, kind: 'rival', stars: 1 }], text: "Clear the factory of Raghav's gunmen" }],
      } },
    { id: 'c5_confront', need: 'cut', title: 'The Confrontation', at: 'factory', shots: scene(['arjun', 'karthik', 'king', 'lakshmi', 'dev'], [
      ['king', 'Impressive. Two boys from a tea stall. Look at me. I will tell you something your friend ACP Dev will never tell you.'],
      ['king', 'Dev was my first partner. We built this empire together. Eight years ago, he put me in front of the world and stepped out of the picture.'],
      ['dev', 'Raghav, enough. Arjun, Karthik, whatever he says, get the girl and run. That is an order.'],
      ['arjun', 'Karthik, is it true? Did you know about this?'],
      ['karthik', 'I swear on Lakshmi, I did not. Dev told me he wanted justice, not revenge...'],
      ['dev', 'I wanted both. I am sorry. Raghav, you and I settle this tonight.'],
      ['narrator', 'Police sirens echo across the factory. A door slams. Raghav smiles and slips through the smoke.'],
    ], { r: 10, at: { arjun: [-1.4, 0], karthik: [0, 0.8], king: [4, 4], lakshmi: [-0.2, 5], dev: [7, 2] } }) },
    { id: 'c5_escape', need: 'all', title: 'Dramatic Escape', heat: true, intro: [C('arjun', "Lakshmi is with us. Now we get out before Dev's men or Raghav's men find us.")],
      obj: {
        arjun: [{ k: 'escape', stars: 3, text: 'ESCAPE: lose the police (3 stars) with Lakshmi' }],
        karthik: [{ k: 'escape', stars: 3, text: 'ESCAPE: get everyone out - lose the police (3 stars)' }],
      } },
    { id: 'c5_choice', need: 'vote', title: 'Dev\'s secret - Whom do we trust?', text: 'Dev built the empire with Raghav, then betrayed him. He now wants the ledger. Do we trust him?', options: [
      { id: 'trustDev', label: 'Trust Dev', desc: 'He saved us at the factory. Give him the ledger and hope he is finally honest.' },
      { id: 'doubtDev', label: 'Doubt Dev', desc: "He has lied for eight years. Keep the ledger yourself. This path hides a final secret." },
    ] },
  ] },
  /* =========================================================== 6 */
  { id: 6, name: 'THE FINAL NIGHT', steps: [
    { id: 'c6_plan', need: 'cut', title: 'Chapter 6 - The Final Night', at: 'hideout', shots: scene(['arjun', 'karthik'], [
      ['radio', 'All units: intelligence says Raghav is leaving Andhra Pradesh tonight. A private boat at the port. Intercept at all costs.'],
      ['karthik', 'He is running, Arjun. If he leaves, he comes back in five years with a new name and a bigger kingdom.'],
      ['arjun', 'Then we stop him. You drive, I finish it. Together. Whatever happens, I am glad you were my brother.'],
      ['karthik', 'I am glad you called me one, even after everything. Let us go.'],
    ], { r: 7, look: [0, 1.5, 0] }) },
    { id: 'c6_chase', need: 'all', title: 'Cinematic Car Chase', heat: true, intro: [C('karthik', "That black SUV is Raghav's convoy. Hang on, Arjun. Shoot out their tyres when I get you alongside.")],
      obj: {
        arjun: [{ k: 'goto', at: 'highway', r: 55, veh: 'any', text: "Chase Raghav's convoy to the highway" }, { k: 'clear', at: 'highway', n: 6, text: 'Take out the convoy bodyguards' }, { k: 'escape', stars: 3, text: 'POLICE PURSUIT: lose the police (3 stars) and keep chasing' }],
        karthik: [{ k: 'goto', at: 'highway', r: 55, veh: 'in', text: "Drive Arjun after Raghav's convoy - arrive in a vehicle" }, { k: 'clear', at: 'highway', n: 6, text: 'Take out the convoy bodyguards' }, { k: 'escape', stars: 3, text: 'POLICE PURSUIT: lose the police (3 stars) and keep chasing' }],
      } },
    { id: 'c6_port', need: 'all', title: "STORM THE KING'S PORT", heat: true, intro: [C('arjun', "This is it. Karthik, get us through the gate. I will break the lock. Raghav does not leave this coast.")],
      obj: {
        arjun: [{ k: 'goto', at: 'portGate', r: 55, veh: 'any', text: 'Reach the port gate' }, { k: 'hack', at: 'portGate', r: 15, game: 'cipher', len: 6, text: 'Hack the port gate and the cranes' }, { k: 'clear', at: 'port', n: 10, boss: true, hp: 320, waves: [{ at: 0.55, n: 6, kind: 'rival', stars: 3 }], text: 'Defeat Raghav and his guards' }],
        karthik: [{ k: 'goto', at: 'portGate', r: 55, veh: 'in', text: 'Drive to the port gate - arrive in a vehicle' }, { k: 'hold', at: 'portGate', r: 30, secs: 10, text: 'Hold the gate while Arjun hacks the cranes' }, { k: 'clear', at: 'port', n: 10, boss: true, hp: 320, waves: [{ at: 0.55, n: 6, kind: 'rival', stars: 3 }], text: 'Defeat Raghav and his guards' }],
      } },
    { id: 'c6_dialogue', need: 'cut', title: 'The Fallen King', at: 'port', shots: scene(['arjun', 'karthik', 'king', 'dev'], [
      ['king', 'You think you have won? Dev has been on my payroll for years, boys. Ask him what is in the ledger.'],
      ['dev', 'Quiet, Raghav. Arjun, Karthik, hand me the ledger and this ends cleanly. Trust me one more time.'],
      ['arjun', 'Karthik, what do we do? You know him better than I do.'],
      ['karthik', 'The ledger is our only proof, Arjun. The decision is yours. I will stand beside you, whichever road you choose.'],
      ['narrator', 'Dawn breaks over the port. The king lies defeated on the concrete. And two friends hold the fate of all Andhra in their hands.'],
    ], { r: 9, at: { arjun: [-1.4, 0], karthik: [0, 0.8], king: [4, 4], dev: [6, 2] } }) },
    { id: 'c6_final', need: 'vote', title: 'THE FINAL DECISION', text: 'Three paths. One vote each. (If you disagree, Arjun decides.)', options: [
      { id: 'friendship', label: 'ENDING 1 - FRIENDSHIP', desc: 'Expose Raghav and the whole organization to the public. Both friends survive and start a new life.' },
      { id: 'underworld', label: 'ENDING 3 - UNDERWORLD', desc: 'Burn the evidence. Arjun and Karthik take control of the criminal organization and become Andhra\'s most powerful underground figures.' },
      { id: 'betrayal', label: 'ENDING 2 - BETRAYAL', desc: "(Unlocked by staying cold with Karthik, or by doubting Dev.) Arjun discovers Karthik's final secret. A friendship ends.", secret: true },
    ] },
    { id: 'c6_ending', need: 'all', title: 'The Last Mission',
      variants: {
        friendship: { intro: [C('arjun', "Press, police, everyone. We give them the ledger and we walk in through the front door.")], obj: {
          arjun: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Deliver the ledger to the police station' }],
          karthik: [{ k: 'goto', at: 'station', r: 14, veh: 'in', text: 'Drive Arjun to the police station' }] } },
        underworld: { intro: [C('arjun', "Burn everything. From tonight, Andhra answers to us.")], obj: {
          arjun: [{ k: 'goto', at: 'club', r: 18, veh: 'any', text: "Take the throne at the Velvet Club" }],
          karthik: [{ k: 'goto', at: 'club', r: 18, veh: 'in', text: "Drive up to the Velvet Club - arrive like a king" }] } },
        betrayal: { intro: [C('karthik', "Arjun, I have one more secret. And after tonight you will never look at me the same way again.")], obj: {
          arjun: [{ k: 'goto', at: 'hideout', r: 25, veh: 'any', text: 'Meet Karthik at the hideout' }, { k: 'hack', at: 'hideout', r: 15, game: 'trace', len: 5, text: "Open Karthik's sealed police file" }],
          karthik: [{ k: 'goto', at: 'hideout', r: 25, veh: 'in', text: 'Go to the hideout - the moment of truth' }] } },
      } },
    { id: 'c6_epilogue', need: 'cut', title: 'Epilogue', at: 'ending', endings: {
      friendship: { at: 'station', shots: scene(['arjun', 'karthik', 'dev', 'lakshmi'], [
        ['narrator', 'The ledger reaches every newspaper in Andhra Pradesh. Raghav and his officials are arrested within a week.'],
        ['dev', 'You gave me the proof I could not find in eight years. I will make sure the court remembers that.'],
        ['karthik', 'A new life, Arjun. A garage of our own. No more midnight phone calls.'],
        ['arjun', 'No more midnight phone calls, brother. Just two friends, and a road that goes home.'],
        ['narrator', 'ENDING ONE. FRIENDSHIP. The King is gone. The friends are free.'],
      ], { r: 8, at: { arjun: [-1.4, 0], karthik: [0, 0.8], dev: [4, 3], lakshmi: [-0.6, 2.8] } }) },
      underworld: { at: 'club', shots: scene(['arjun', 'karthik', 'dasari'], [
        ['narrator', 'The ledger burns in a steel drum behind the Velvet Club. By morning, the whole organization has a new name.'],
        ['dasari', 'The districts are waiting for your orders, bosses. Every port, every lorry, every police station.'],
        ['karthik', 'Arjun, is this really who we wanted to become?'],
        ['arjun', 'We wanted to never be poor again. Nobody said anything about staying good.'],
        ['narrator', 'ENDING THREE. UNDERWORLD. Two kings sit on one throne, and Andhra does not sleep.'],
      ], { r: 8, at: { arjun: [-1.4, 0], karthik: [0, 0.8], dasari: [4, 3] } }) },
      betrayal: { at: 'hideout', shots: scene(['arjun', 'karthik', 'dev'], [
        ['arjun', 'Dev\'s file says you were reporting on me for three years. Before Raghav even called. Before the warehouse.'],
        ['karthik', 'Arjun, I tried to tell you. Dev asked me to bring you into the gang so that he could catch the King.'],
        ['arjun', 'You were never a friend. You were bait. Every meal. Every promise. Every night on that street.'],
        ['karthik', 'It started as a mission. It ended as a family. Arjun, please...'],
        ['arjun', 'Goodbye, Karthik. If I ever see you again, I will not remember your name.'],
        ['narrator', 'ENDING TWO. BETRAYAL. The King is gone, and so is the friendship that started everything.'],
      ], { r: 7, look: [0, 1.5, 0], at: { arjun: [-1.2, 0], karthik: [1.2, 0], dev: [4, 3] } }) },
    } },
  ] },
];

export function allSteps() { const out = []; for (const c of CHAPTERS) c.steps.forEach((s, i) => out.push([c, i, s])); return out; }
export function stepById(id) { for (const c of CHAPTERS) { const i = c.steps.findIndex(s => s.id === id); if (i >= 0) return { chapter: c, index: i, step: c.steps[i] }; } return null; }

/** which variant of a step applies: by the decision named in `variantOn`, else by the ending */
export function variantKey(step, s) { return step.variantOn ? ((s.choices || {})[step.variantOn] || Object.keys(step.variants)[0]) : (s.ending || Object.keys(step.variants || step.endings || {})[0]); }

/** voting rules shared by the client and server: which options are unlocked by earlier decisions */
export function optionOpen(optId, choices) { if (optId !== 'betrayal') return true; return choices.c4_choice === 'cold' || choices.c5_choice === 'doubtDev'; }

/** interrogation questions at the station (c3_station). */
export const QUESTIONS = {
  q1: { who: 'dev', text: "Arjun. You were at the smuggling yard last night. Why?", opts: [{ label: 'Say nothing', trust: 1 }, { label: '"Looking for work, sir."', trust: 0 }, { label: '"I want a lawyer."', trust: 0 }] },
  q2: { who: 'dev', text: "Karthik. Walk with me. In private, how deep are they?", opts: [{ label: '"Deeper than you think, sir."', trust: 1 }, { label: '"I know nothing."', trust: 0 }, { label: '"Ask Arjun."', trust: 0 }] },
};

export const RADIO_CHATTER = [
  'All units: robbery reported near the market. Suspects in a red hatchback.',
  'Control: roadblock authorised on the highway.',
  'Unit 6: nothing at the docks. Moving to the bus stand.',
  'Control: ACP Dev requests all CCTV from the Kondapalli area.',
  'Unit 11: suspicious lorry heading north. Following.',
  'All units: the two suspects are believed armed. Do not approach alone.',
];
