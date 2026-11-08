// ANDHRA UNDERWORLD - THE FOUR: the complete script (all fictional). Pure data, no engine code.
// tests/story-sync-test.mjs checks that chapter/step ids and 'need' types here match server/story.js.
//
// Mission objective primitives (per role, a list is done in order):
//   goto  {at, r, veh:'any'|'in'|'out', text}       reach an anchor (optionally in a vehicle / on foot)
//   hack  {at, r, game:'seq'|'cipher'|'trace', len}  terminal mini-game next to an anchor
//   clear {at, n, boss, hp, waves, text}             shared gang fight (host simulates enemies) - done when all are down
//   escape{stars, text}                              start a police chase and lose it (arrest = custody, then it counts as done)
//   hold  {at, r, secs, text}                        stay inside the circle
//   ai    {text}                                     this task belongs to an AI teammate, finishes itself
// Cutscene shot: {cam:['orbit',radius,height,speed,startAngle] | ['fly',[x,y,z],[x,y,z]] | ['static',[x,y,z]], look:[x,y,z], dur, who, text, actors:[...], props:[...]}

export const ROLE_ORDER = ['mastermind', 'driver', 'hacker', 'insider'];
export const ROLES = {
  mastermind: { name: 'Vikram "Chanakya" Rao', short: 'Vikram', title: 'The Mastermind', emoji: '🧠', color: '#f6c744', shirt: '#26262b', pants: '#14141a', blurb: 'Plans every move. Leads the group. Knows people in the underground.' },
  driver: { name: 'Raju "Rocket" Naidu', short: 'Raju', title: 'The Driver', emoji: '🏎️', color: '#ff7a3d', shirt: '#d9482b', pants: '#2c3e50', blurb: 'Handles vehicle missions and escapes. Knows every road in Andhra.' },
  hacker: { name: 'Meghana "Ghost" Chowdary', short: 'Meghana', title: 'The Hacker', emoji: '💻', color: '#3be3c4', shirt: '#1e7a6d', pants: '#1b1b1b', blurb: 'Fictional digital missions. Finds secrets and reads police files.' },
  insider: { name: 'Karthik Reddy', short: 'Karthik', title: 'The Inside Man', emoji: '🕶️', color: '#8fa6ff', shirt: '#3b4a8f', pants: '#2c3e50', blurb: 'Knows important people. Mysterious past. Quietly tied to the police.' },
};
export const NPCS = {
  king: { name: 'THE KING', emoji: '👑', color: '#d4af37', shirt: '#0c0c0f', pants: '#0c0c0f', hat: 'crown', s: 1.08 },
  dasari: { name: 'Dasari', emoji: '🕴️', color: '#d4af37', shirt: '#4a1212', pants: '#1b1b1b', hat: 'bandana' },
  officer: { name: 'SP Ranadheer', emoji: '👮', color: '#6aa0ff', shirt: '#2c4a8c', pants: '#1b2a52', hat: 'cap', s: 1.05 },
  pasha: { name: 'Pasha (Kondapalli Crew)', emoji: '🔪', color: '#ff6b6b', shirt: '#6b1f1f', pants: '#1b1b1b', hat: 'bandana' },
  radio: { name: 'Police Radio', emoji: '📻', color: '#6aa0ff' },
  narrator: { name: '', emoji: '', color: '#ffffff' },
  anon: { name: 'Unknown number', emoji: '❓', color: '#bbbbbb' },
};
export const THUG_LOOK = { thug: { color: '#7a1f1f', pants: '#1b1b1b', hat: 'bandana' }, rival: { color: '#1f5f7a', pants: '#1b1b1b', hat: 'bandana' }, boss: { color: '#0c0c0f', pants: '#0c0c0f', hat: 'crown' } };

/** where things happen, relative to the start town (metres). dist/ang are tried in order until a road point is found. */
export const ANCHORS = {
  town:        { label: 'Home town', dist: 0, ang: 0 },
  tea:         { label: "Naidu's Tea Stall", dist: 140, ang: 0.5 },
  garage:      { label: 'Raju\'s Garage', dist: 330, ang: 2.2 },
  club:        { label: "Velvet Club (the King's)", dist: 1250, ang: 0.9 },
  clubTerm:    { label: 'CCTV room', near: 'club', dist: 26, ang: 2.0 },
  warehouse:   { label: 'Kondapalli Warehouse', dist: 2100, ang: 4.1 },
  warehouseGate: { label: 'Warehouse gate', near: 'warehouse', dist: 55, ang: 0.4 },
  docks:       { label: 'Old Docks', dist: 3000, ang: 2.6 },
  station:     { label: 'Police Station', station: true },
  checkpoint:  { label: 'Police checkpoint', fromStation: 420, ang: 0 },
  safehouse:   { label: 'Safehouse', dist: 1800, ang: 5.4 },
  highway:     { label: 'Highway ambush', dist: 4200, ang: 1.4 },
  hideout:     { label: 'Hideout', dist: 3600, ang: 3.6 },
  fort:        { label: "The King's Fort", dist: 5600, ang: 5.0 },
  fortGate:    { label: 'Fort gate', near: 'fort', dist: 90, ang: 3.1 },
};

const C = (who, text) => ({ who, text });
const orbit = (r, h, speed, a0 = 0) => ['orbit', r, h, speed, a0];

export const CHAPTERS = [
  /* =========================================================== 1 */
  { id: 1, name: 'THE BEGINNING', steps: [
    { id: 'c1_intro', need: 'cut', title: 'Chapter 1 - The Beginning', at: 'town', shots: [
      { cam: ['fly', [0, 90, -120], [0, 22, -60]], look: [0, 2, 0], dur: 7, who: 'narrator', text: 'Andhra Pradesh. A small town that wakes before the sun. Four friends. Four lives about to change.' },
      { cam: orbit(11, 3.5, 0.22, 0.6), look: [0, 1.5, 0], dur: 7, who: 'mastermind', text: 'Vikram Rao. They call me Chanakya because I plan, and everyone else just follows the plan.', actors: [{ id: 'mastermind', at: [0, 0] }] },
      { cam: orbit(10, 2.6, -0.25, 2.2), look: [0, 1.2, 0], dur: 7, who: 'driver', text: 'Raju Naidu. Give me any road in Andhra, in any rain, and I will get you there before the tea gets cold.', actors: [{ id: 'driver', at: [0, 0] }], props: [{ type: 'car', color: '#d9482b', at: [5, 3], h: 1.2 }] },
      { cam: orbit(9, 2.4, 0.3, 4.0), look: [0, 1.3, 0], dur: 7, who: 'hacker', text: 'Meghana Chowdary. Online I am Ghost. Locks, cameras, bank apps - everything has a back door.', actors: [{ id: 'hacker', at: [0, 0] }] },
      { cam: orbit(9, 2.2, -0.2, 5.4), look: [0, 1.3, 0], dur: 7, who: 'insider', text: 'Karthik Reddy. I know a lot of important people. I never say how. Some doors only open for a man like me.', actors: [{ id: 'insider', at: [0, 0] }] },
      { cam: ['fly', [-20, 4, -22], [-4, 2, -7]], look: [0, 1.6, 0], dur: 6, who: 'mastermind', text: 'Bills are due, the town has nothing for us. Then one phone call changes everything...', actors: [{ id: 'mastermind', at: [-1.6, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.6, 0.4] }, { id: 'insider', at: [1.7, 0] }] },
    ] },
    { id: 'c1_explore', need: 'all', title: 'Free Roam - The Tea Stall', intro: [C('mastermind', "Everyone - Naidu's Tea Stall, now. I have news. Take your time, see the town, but be there.")],
      obj: { default: { k: 'goto', at: 'tea', r: 24, veh: 'any', text: "Explore the Andhra map freely, then meet the others at Naidu's Tea Stall" } } },
    { id: 'c1_meet_king', need: 'cut', title: 'The King', at: 'tea', shots: [
      { cam: ['fly', [30, 14, 40], [14, 3, 16]], look: [0, 1.5, 0], dur: 6, who: 'narrator', text: 'Three black cars stop in front of the tea stall. Nobody in the street dares to look.', props: [{ type: 'car', color: '#0c0c0f', at: [10, 8], h: 2.6 }, { type: 'car', color: '#0c0c0f', at: [14, 3], h: 2.6 }, { type: 'car', color: '#0c0c0f', at: [10, -2], h: 2.6 }], actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.2, 0.12, 0.2), look: [4, 1.6, 4], dur: 8, who: 'king', text: 'So. These are the four my people keep talking about. The planner, the wheels, the ghost... and the quiet one.', actors: [{ id: 'king', at: [4, 4] }, { id: 'dasari', at: [6, 5.5] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(6, 1.8, -0.15, 3.0), look: [3, 1.6, 3], dur: 8, who: 'king', text: 'I am called THE KING. Seven cities answer to me. Work for me and your families never worry about money again.', actors: [{ id: 'king', at: [3.4, 3.4] }, { id: 'dasari', at: [5.5, 5] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(7, 2.0, 0.1, 5.0), look: [0, 1.6, 0], dur: 6, who: 'mastermind', text: "Money is good. But we do not take orders from a stranger. Give us a test. We will pass it.", actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }, { id: 'king', at: [3.6, 3.6] }] },
      { cam: ['fly', [4, 2, 10], [4, 1.6, 6]], look: [3.4, 1.7, 3.4], dur: 6, who: 'king', text: 'Good. Dasari will take you to my club. Come tonight. Bring your best.', actors: [{ id: 'king', at: [3.4, 3.4] }, { id: 'dasari', at: [5.5, 5] }] },
    ] },
    { id: 'c1_first_job', need: 'all', title: "The King's Test", intro: [C('dasari', "Velvet Club, front door. The King's guests do not like waiting. Each of you has a job tonight.")],
      obj: {
        mastermind: [{ k: 'goto', at: 'club', r: 18, veh: 'any', text: "Meet the King's manager at the Velvet Club and take the envelope" }],
        driver: [{ k: 'goto', at: 'garage', r: 16, veh: 'in', text: "Take a vehicle (E near a parked car) and bring it to the garage" }, { k: 'goto', at: 'club', r: 18, veh: 'in', text: 'Drive to the Velvet Club - arrive in a vehicle' }],
        hacker: [{ k: 'goto', at: 'clubTerm', r: 30, veh: 'any', text: 'Go to the Velvet Club CCTV room' }, { k: 'hack', at: 'clubTerm', r: 14, game: 'seq', len: 4, text: "Loop the CCTV so the King's visit is never recorded" }],
        insider: [{ k: 'goto', at: 'club', r: 18, veh: 'any', text: "Walk in as a friend of the family - the guards know your face" }],
      } },
  ] },
  /* =========================================================== 2 */
  { id: 2, name: 'THE UNDERWORLD', steps: [
    { id: 'c2_org', need: 'cut', title: 'Chapter 2 - The Underworld', at: 'club', shots: [
      { cam: ['fly', [0, 60, -80], [0, 14, -30]], look: [0, 3, 0], dur: 6, who: 'narrator', text: 'Behind the neon of the Velvet Club lies the real business: a network across seven Andhra cities.' },
      { cam: orbit(10, 2.4, 0.15, 1.0), look: [3, 1.6, 3], dur: 8, who: 'king', text: "My people run the ports, the lorries, the bus stands. Nobody sees. Nobody asks. That is why I never lose.", actors: [{ id: 'king', at: [3, 3] }, { id: 'dasari', at: [5, 4.5] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.0, -0.2, 3.5), look: [3, 1.6, 3], dur: 8, who: 'dasari', text: "The Kondapalli Crew, led by Pasha, are stealing our shipments. Their warehouse is the problem. Clean it out.", actors: [{ id: 'dasari', at: [3, 3] }, { id: 'king', at: [5.4, 5] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(7, 1.9, 0.2, 5.2), look: [0, 1.5, 0], dur: 6, who: 'insider', text: "Careful. Rival gangs, and soon the police. People in this business do not retire, they disappear.", actors: [{ id: 'insider', at: [1, 0] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }] },
    ] },
    { id: 'c2_rival', need: 'all', title: 'Rival Gang - Kondapalli Warehouse', heat: false, intro: [C('mastermind', "Pasha's men guard the warehouse. Everyone has a part. Stay sharp - they shoot first.")],
      obj: {
        mastermind: [{ k: 'goto', at: 'warehouseGate', r: 30, veh: 'any', text: 'Scout the Kondapalli warehouse gate' }, { k: 'clear', at: 'warehouse', n: 5, text: "Take down Pasha's men" }],
        driver: [{ k: 'goto', at: 'warehouseGate', r: 30, veh: 'in', text: 'Bring a vehicle to the warehouse gate - this is your getaway ride' }, { k: 'clear', at: 'warehouse', n: 5, text: "Take down Pasha's men" }],
        hacker: [{ k: 'goto', at: 'warehouseGate', r: 40, veh: 'any', text: 'Get near the warehouse gate' }, { k: 'hack', at: 'warehouseGate', r: 14, game: 'seq', len: 5, text: 'Unlock the gate controls' }, { k: 'clear', at: 'warehouse', n: 5, text: "Take down Pasha's men" }],
        insider: [{ k: 'goto', at: 'warehouseGate', r: 30, veh: 'any', text: 'Walk up to the guards like an old friend' }, { k: 'clear', at: 'warehouse', n: 5, text: "Take down Pasha's men" }],
      } },
    { id: 'c2_patrol', need: 'all', title: 'Police Patrols - Move the Cargo', radioChatter: true, intro: [C('radio', 'All units: reports of gunfire near the Kondapalli warehouse. Patrols, check every road out of there.')],
      obj: {
        mastermind: [{ k: 'goto', at: 'docks', r: 28, veh: 'any', text: 'Reach the Old Docks - police patrols are everywhere, keep your head down' }],
        driver: [{ k: 'goto', at: 'docks', r: 28, veh: 'in', text: 'Drive the cargo to the Old Docks - avoid patrol cars and bikes' }],
        hacker: [{ k: 'goto', at: 'docks', r: 40, veh: 'any', text: 'Get to the Old Docks' }, { k: 'hack', at: 'docks', r: 18, game: 'seq', len: 5, text: "Listen in on the police radio and delete the warehouse report" }],
        insider: [{ k: 'goto', at: 'docks', r: 28, veh: 'any', text: 'Reach the Old Docks. If stopped, talk your way out.' }],
      } },
    { id: 'c2_end', need: 'cut', title: 'A Warning', at: 'docks', shots: [
      { cam: ['fly', [-30, 10, -30], [-12, 3, -10]], look: [0, 1.8, 0], dur: 6, who: 'king', text: "Pasha's crew is finished. You four are better than I hoped. There will be more work. Much more.", actors: [{ id: 'king', at: [5, 5] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(9, 2.2, 0.12, 2.0), look: [0, 1.6, 0], dur: 8, who: 'hacker', text: "Vikram, I saw the crates. It is not only cargo. It is drugs. Entire towns of them. Who are we working for?", actors: [{ id: 'hacker', at: [0.5, 0.4] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.0, -0.12, 4.4), look: [0, 1.6, 0], dur: 7, who: 'narrator', text: 'Far away, on a police wall, a new file is pinned: THE FOUR - unknown. A special officer is assigned.', actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
    ] },
  ] },
  /* =========================================================== 3 */
  { id: 3, name: 'POLICE INVESTIGATION', steps: [
    { id: 'c3_officer', need: 'cut', title: 'Chapter 3 - Police Investigation', at: 'docks', shots: [
      { cam: ['fly', [24, 7, 24], [12, 2.6, 10]], look: [0, 1.8, 0], dur: 6, who: 'narrator', text: 'Blue lights wash over the Old Docks. The officer everyone fears has arrived.', props: [{ type: 'car', color: '#1d3a8a', at: [9, 7], h: 2.4, bar: true }, { type: 'car', color: '#1d3a8a', at: [12, 1], h: 2.2, bar: true }], actors: [{ id: 'officer', at: [6, 4] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(7, 1.9, 0.14, 0.4), look: [4, 1.7, 3], dur: 8, who: 'officer', text: "I am SP Ranadheer. Seven murders, forty trucks of poison, and one name nobody will give me. Somebody here talks. Sooner or later.", actors: [{ id: 'officer', at: [4, 3] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.1, -0.18, 3.0), look: [0, 1.6, 0], dur: 7, who: 'officer', text: "I have four faces on four CCTV tapes. Come to the station tomorrow, all of you. Just a few questions.", actors: [{ id: 'officer', at: [4, 3] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
    ] },
    { id: 'c3_questioned', need: 'all', title: 'Questioning', intro: [C('officer', "Station. On foot, no vehicles at my door. I want to look at you while you answer.")],
      obj: {
        mastermind: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Report to the police station for questioning', ask: 'q1' }],
        driver: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Report to the police station for questioning', ask: 'q2' }],
        hacker: [{ k: 'goto', at: 'station', r: 40, veh: 'any', text: 'Go to the police station' }, { k: 'hack', at: 'station', r: 30, game: 'trace', len: 5, text: "Copy the case file from the station Wi-Fi while you wait" }],
        insider: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Report to the police station. SP Ranadheer asked for you personally.', ask: 'q4' }],
      } },
    { id: 'c3_checkpoint', need: 'all', title: 'Police Checkpoint', checkpoints: true, intro: [C('hacker', "I read the file. They are setting a checkpoint to search every vehicle on the way to the safehouse. Do not get caught carrying anything.")],
      obj: {
        mastermind: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'any', text: 'Reach the safehouse - go through, or around, the police checkpoint' }],
        driver: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'in', text: 'Drive to the safehouse. Running the checkpoint will bring the police.' }],
        hacker: [{ k: 'hack', at: 'station', r: 40, game: 'cipher', len: 5, text: 'Jam the police cameras before leaving the station' }, { k: 'goto', at: 'safehouse', r: 24, veh: 'any', text: 'Reach the safehouse' }],
        insider: [{ k: 'goto', at: 'safehouse', r: 24, veh: 'any', text: 'Reach the safehouse. You know which officers to wave at.' }],
      } },
    { id: 'c3_wanted', need: 'all', title: 'Wanted!', heat: true, intro: [C('radio', 'All units! Suspects fled the checkpoint, four persons of interest. Stop them. Repeat: stop them.')],
      obj: {
        mastermind: [{ k: 'escape', stars: 3, text: 'WANTED: lose the police (3 stars) - or be arrested and questioned' }],
        driver: [{ k: 'escape', stars: 3, text: 'WANTED: lose the police (3 stars). Use your driving.' }],
        hacker: [{ k: 'hack', at: 'safehouse', r: 60, game: 'seq', len: 4, text: 'Jam the police radio (cuts your wanted level by one)', effect: 'stars-1' }, { k: 'escape', stars: 2, text: 'WANTED: lose the remaining police' }],
        insider: [{ k: 'escape', stars: 3, text: 'WANTED: lose the police (3 stars)' }],
      } },
    { id: 'c3_end', need: 'cut', title: 'The Net Tightens', at: 'safehouse', shots: [
      { cam: orbit(9, 2.2, 0.14, 1.2), look: [0, 1.6, 0], dur: 7, who: 'mastermind', text: "They know our faces now. The King will not forgive a mistake. And the officer will not forgive us at all.", actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.0, -0.15, 3.6), look: [0, 1.6, 0], dur: 7, who: 'driver', text: "Whatever is coming, I am driving. But somebody inside is feeding them. How else did they know the route?", actors: [{ id: 'driver', at: [-0.5, 0.4] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
    ] },
  ] },
  /* =========================================================== 4 */
  { id: 4, name: 'BETRAYAL', steps: [
    { id: 'c4_leak', need: 'cut', title: 'Chapter 4 - Betrayal', at: 'safehouse', shots: [
      { cam: ['fly', [0, 30, -40], [0, 6, -14]], look: [0, 1.6, 0], dur: 6, who: 'king', text: "A leak. Someone is whispering to the police. If I find the rat in your little circle, I will bury all four of you.", actors: [{ id: 'king', at: [0, 5] }, { id: 'dasari', at: [3, 6] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.0, 0.12, 4.0), look: [0, 1.6, 0], dur: 7, who: 'hacker', text: "Give me an hour with the safehouse terminal. Every call leaves a trace. I will find who is talking.", actors: [{ id: 'hacker', at: [0.5, 0.4] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
    ] },
    { id: 'c4_hack', need: 'all', title: 'Trace the Leak', intro: [C('hacker', 'Cover me. Everybody at the safehouse. I need quiet and ten minutes.')],
      obj: {
        mastermind: [{ k: 'goto', at: 'safehouse', r: 22, veh: 'any', text: 'Stand guard at the safehouse while Meghana traces the leak' }],
        driver: [{ k: 'goto', at: 'safehouse', r: 22, veh: 'any', text: 'Park up at the safehouse - engine running' }],
        hacker: [{ k: 'goto', at: 'safehouse', r: 12, veh: 'any', text: 'Get to the safehouse terminal' }, { k: 'hack', at: 'safehouse', r: 14, game: 'trace', len: 6, text: 'TRACE THE LEAK: find the secret police informant' }],
        insider: [{ k: 'goto', at: 'safehouse', r: 22, veh: 'any', text: 'Go to the safehouse. Act normal.' }],
      } },
    { id: 'c4_talk', need: 'cut', title: 'The Truth', at: 'safehouse', shots: [
      { cam: orbit(7, 1.8, 0.1, 0.5), look: [0, 1.5, 0], dur: 7, who: 'hacker', text: "The calls to SP Ranadheer's private number... They come from Karthik's phone. Karthik - how long?", actors: [{ id: 'hacker', at: [0.8, 0.6] }, { id: 'insider', at: [1.8, 0] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }] },
      { cam: orbit(6, 1.7, -0.12, 2.6), look: [1.6, 1.6, 0], dur: 9, who: 'insider', text: "Since before I met you. I was police. Undercover. When I saw what the King really does, I stopped being a cop and became your friend. But I did not stop reporting.", actors: [{ id: 'insider', at: [1.8, 0] }, { id: 'hacker', at: [0.4, 0.6] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }] },
      { cam: orbit(7, 1.9, 0.12, 4.2), look: [0, 1.5, 0], dur: 7, who: 'driver', text: "Four years I trusted you with my life, Karthik. My MOTHER's life. Say one reason I should not leave you in this road.", actors: [{ id: 'driver', at: [-0.5, 0.4] }, { id: 'insider', at: [1.8, 0] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'hacker', at: [0.5, 0.4] }] },
      { cam: orbit(6, 1.7, -0.1, 5.5), look: [0, 1.5, 0], dur: 8, who: 'insider', text: "Because this ends with the King in a cell or in the ground, and I am the only one who can make it the cell. Decide - together.", actors: [{ id: 'insider', at: [1.8, 0] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }] },
    ] },
    { id: 'c4_choice', need: 'vote', title: 'What do we do about Karthik?', text: "The King must never know. But the team must decide what to do with the Inside Man.", options: [
      { id: 'confront', label: 'Confront him', desc: 'Make Karthik swear loyalty to the four - in front of everyone. Honest, but the truth may spread.' },
      { id: 'protect', label: 'Protect his secret', desc: "Hide the truth from the King and from the police. It could save everyone - or doom everyone." },
    ] },
    { id: 'c4_run', need: 'all', title: "The King's Enforcers", heat: true, intro: [C('dasari', "The King knows something is wrong. His men are on the highway. They will not ask questions.")],
      obj: {
        mastermind: [{ k: 'goto', at: 'highway', r: 50, veh: 'any', text: 'Head to the highway - the King\'s enforcers are waiting' }, { k: 'clear', at: 'highway', n: 6, text: "Defeat the King's enforcers" }, { k: 'goto', at: 'hideout', r: 30, veh: 'any', text: 'Reach the hideout' }],
        driver: [{ k: 'goto', at: 'highway', r: 50, veh: 'in', text: 'Drive the team to the highway' }, { k: 'clear', at: 'highway', n: 6, text: "Defeat the King's enforcers" }, { k: 'goto', at: 'hideout', r: 30, veh: 'in', text: 'Drive to the hideout' }],
        hacker: [{ k: 'goto', at: 'highway', r: 50, veh: 'any', text: 'Head to the highway' }, { k: 'clear', at: 'highway', n: 6, text: "Defeat the King's enforcers" }, { k: 'goto', at: 'hideout', r: 30, veh: 'any', text: 'Reach the hideout' }],
        insider: [{ k: 'goto', at: 'highway', r: 50, veh: 'any', text: 'Head to the highway' }, { k: 'clear', at: 'highway', n: 6, text: "Defeat the King's enforcers" }, { k: 'goto', at: 'hideout', r: 30, veh: 'any', text: 'Reach the hideout' }],
      } },
    { id: 'c4_end', need: 'cut', title: 'The Plan', at: 'hideout', shots: [
      { cam: orbit(9, 2.2, 0.12, 1.5), look: [0, 1.6, 0], dur: 8, who: 'mastermind', text: "No more running. We know the King's fortress, his men, his routes. We either finish this - or we finish with him.", actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
    ] },
  ] },
  /* =========================================================== 5 */
  { id: 5, name: 'THE KING', steps: [
    { id: 'c5_truth', need: 'cut', title: 'Chapter 5 - The King', at: 'hideout', shots: [
      { cam: ['fly', [0, 8, -14], [0, 2.2, -6]], look: [0, 1.8, 0], dur: 8, who: 'hacker', text: "The King's private ledger. Every shipment, every payment, every name. Ten thousand kids hooked in seven cities. Whole villages emptied of their young. This is who we were working for.", actors: [{ id: 'hacker', at: [0.5, 0.4] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.0, -0.12, 2.8), look: [0, 1.6, 0], dur: 7, who: 'mastermind', text: "I told myself we were only moving cargo. I was wrong. Tonight at his fort, we end it.", actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(8, 2.0, 0.1, 4.6), look: [0, 1.6, 0], dur: 6, who: 'insider', text: "SP Ranadheer will bring the police the moment the gates break. And so will the Kondapalli remnants. It will be a war. Ready?", actors: [{ id: 'insider', at: [1.5, 0] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }] },
    ] },
    { id: 'c5_assault', need: 'all', title: "STORM THE KING'S FORT", heat: true, intro: [C('mastermind', 'This is it. Meghana opens the gate, Raju gets us inside, Karthik and I take the courtyard. Nobody dies tonight. Understood?')],
      obj: {
        mastermind: [{ k: 'goto', at: 'fortGate', r: 55, veh: 'any', text: "Reach the fort gate" }, { k: 'clear', at: 'fort', n: 10, boss: true, hp: 320, waves: [{ at: 0.55, n: 6, kind: 'rival', stars: 3 }], text: "Break into the courtyard and defeat THE KING" }],
        driver: [{ k: 'goto', at: 'fortGate', r: 55, veh: 'in', text: 'Drive everyone to the fort gate' }, { k: 'clear', at: 'fort', n: 10, boss: true, hp: 320, waves: [{ at: 0.55, n: 6, kind: 'rival', stars: 3 }], text: "Break into the courtyard and defeat THE KING" }],
        hacker: [{ k: 'goto', at: 'fortGate', r: 40, veh: 'any', text: 'Get to the fort gate terminal' }, { k: 'hack', at: 'fortGate', r: 15, game: 'cipher', len: 6, text: "Hack the fort gate and the alarm system" }, { k: 'clear', at: 'fort', n: 10, boss: true, hp: 320, waves: [{ at: 0.55, n: 6, kind: 'rival', stars: 3 }], text: "Break into the courtyard and defeat THE KING" }],
        insider: [{ k: 'goto', at: 'fortGate', r: 55, veh: 'any', text: 'Reach the fort gate' }, { k: 'clear', at: 'fort', n: 10, boss: true, hp: 320, waves: [{ at: 0.55, n: 6, kind: 'rival', stars: 3 }], text: "Break into the courtyard and defeat THE KING" }],
      } },
    { id: 'c5_end', need: 'cut', title: 'The Fallen King', at: 'fort', shots: [
      { cam: orbit(9, 2.2, 0.12, 0.8), look: [0, 1.6, 0], dur: 8, who: 'king', text: "You think this ends me? I am not a man. I am an idea. Every city, every road... I am already inside the police.", actors: [{ id: 'king', at: [3.4, 3.4] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: ['fly', [0, 14, -26], [0, 3, -10]], look: [0, 1.6, 0], dur: 6, who: 'narrator', text: 'Sirens. Flashlights. SP Ranadheer walks into the courtyard, gun drawn. Four friends. One wounded King. One choice.', actors: [{ id: 'king', at: [3.4, 3.4] }, { id: 'officer', at: [0, -8] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
    ] },
  ] },
  /* =========================================================== 6 */
  { id: 6, name: 'FINAL DECISION', steps: [
    { id: 'c6_dilemma', need: 'cut', title: 'Chapter 6 - Final Decision', at: 'fort', shots: [
      { cam: orbit(8, 2.0, 0.1, 2.0), look: [0, 1.6, 0], dur: 8, who: 'officer', text: "Hand over the ledger and the King, and I will forget your names. Or walk away with the empire and I will hunt you until my last breath. Choose.", actors: [{ id: 'officer', at: [3.4, 2.4] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      { cam: orbit(7, 1.9, -0.12, 4.0), look: [0, 1.6, 0], dur: 8, who: 'narrator', text: 'The King\'s empire is leaderless. The ledger is in Meghana\'s hands. Everything the four became is now one decision.', actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
    ] },
    { id: 'c6_final', need: 'vote', title: 'THE FINAL DECISION', text: 'Three paths. One vote each. (Ties are broken by the Mastermind.)', options: [
      { id: 'good', label: 'GOOD ENDING - Expose the network', desc: 'Give the ledger to SP Ranadheer. The four friends help the police expose the criminal organization.' },
      { id: 'bad', label: 'BAD ENDING - Take the throne', desc: 'Burn the evidence. The four friends become the new leaders of the underground organization.' },
      { id: 'secret', label: "SECRET ENDING - The truth about Karthik", desc: "(Unlocked because you protected his secret.) Reveal one character's betrayal and change everyone's fate.", secret: true },
    ] },
    { id: 'c6_ending', need: 'all', title: 'The Last Mission',
      variants: {
        good: { intro: [C('mastermind', "To the police station. We give them everything and we walk in through the front door.")], obj: {
          mastermind: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Deliver the ledger to the police station' }],
          driver: [{ k: 'goto', at: 'station', r: 14, veh: 'in', text: 'Drive the team to the police station' }],
          hacker: [{ k: 'goto', at: 'station', r: 30, veh: 'any', text: 'Go to the police station' }, { k: 'hack', at: 'station', r: 28, game: 'trace', len: 5, text: 'Upload the King\'s ledger to the police servers' }],
          insider: [{ k: 'goto', at: 'station', r: 14, veh: 'any', text: 'Walk in with SP Ranadheer - end the undercover mission' }] } },
        bad: { intro: [C('mastermind', "Burn everything. From tonight, Andhra answers to us.")], obj: {
          mastermind: [{ k: 'goto', at: 'club', r: 18, veh: 'any', text: "Take the throne at the Velvet Club" }],
          driver: [{ k: 'goto', at: 'club', r: 18, veh: 'in', text: "Drive up to the Velvet Club - arrive like a king" }],
          hacker: [{ k: 'goto', at: 'clubTerm', r: 30, veh: 'any', text: 'Go to the Velvet Club' }, { k: 'hack', at: 'clubTerm', r: 14, game: 'cipher', len: 5, text: 'Wipe the police evidence server' }],
          insider: [{ k: 'goto', at: 'club', r: 18, veh: 'any', text: 'Follow them. You still have a choice in your pocket.' }] } },
        secret: { intro: [C('insider', "I have one more call to make. And then none of you will ever look at me the same way again.")], obj: {
          mastermind: [{ k: 'goto', at: 'hideout', r: 25, veh: 'any', text: "Meet Karthik at the hideout" }],
          driver: [{ k: 'goto', at: 'hideout', r: 25, veh: 'in', text: 'Drive to the hideout' }],
          hacker: [{ k: 'goto', at: 'hideout', r: 40, veh: 'any', text: 'Go to the hideout' }, { k: 'hack', at: 'hideout', r: 15, game: 'trace', len: 5, text: "Open Karthik's sealed police file" }],
          insider: [{ k: 'goto', at: 'hideout', r: 25, veh: 'any', text: 'Go to the hideout - the moment of truth' }] } },
      } },
    { id: 'c6_epilogue', need: 'cut', title: 'Epilogue', at: 'ending', endings: {
      good: { at: 'station', shots: [
        { cam: ['fly', [0, 60, -90], [0, 12, -36]], look: [0, 3, 0], dur: 6, who: 'narrator', text: 'The ledger exposes every shipment, every payment, every corrupt name. Seven cities wake to arrests at dawn.' },
        { cam: orbit(9, 2.2, 0.12, 1.0), look: [0, 1.6, 0], dur: 8, who: 'officer', text: "Four people walked into my station and ended the biggest network in the state. You will answer for what you did. But you will do it as people who finished it.", actors: [{ id: 'officer', at: [3.6, 2.6] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
        { cam: ['fly', [0, 5, -18], [0, 28, -6]], look: [0, 1.6, 0], dur: 7, who: 'narrator', text: 'GOOD ENDING - Justice. The Four ended the empire, and a state breathed again.', actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      ] },
      bad: { at: 'club', shots: [
        { cam: ['fly', [0, 50, -70], [0, 10, -26]], look: [0, 3, 0], dur: 6, who: 'narrator', text: 'The ledger burns. The King\'s chair is empty. Not for long.' },
        { cam: orbit(9, 2.2, -0.12, 2.0), look: [0, 1.6, 0], dur: 8, who: 'mastermind', text: "From today there are no kings. There is only the Four. Ports, roads, lorries - everything answers to us now.", actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }, { id: 'dasari', at: [5, 5] }] },
        { cam: ['fly', [0, 5, -18], [0, 28, -6]], look: [0, 1.6, 0], dur: 7, who: 'narrator', text: 'BAD ENDING - The Four rule the underworld. And one day, somewhere, a special officer starts a new file.', actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      ] },
      secret: { at: 'hideout', shots: [
        { cam: orbit(8, 2.0, 0.1, 0.5), look: [0, 1.6, 0], dur: 8, who: 'insider', text: "My real name is Inspector Karthik Reddy, Special Task Force. I hid the truth from you because the King had police in his pocket. Ranadheer is one of them.", actors: [{ id: 'insider', at: [1.6, 0] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }] },
        { cam: orbit(8, 2.0, -0.1, 3.2), look: [0, 1.6, 0], dur: 8, who: 'hacker', text: "The sealed file proves it. SP Ranadheer took the King's money for three years. Karthik, your betrayal... saved us all.", actors: [{ id: 'hacker', at: [0.4, 0.5] }, { id: 'insider', at: [1.6, 0] }, { id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }] },
        { cam: ['fly', [0, 5, -18], [0, 30, -6]], look: [0, 1.6, 0], dur: 8, who: 'narrator', text: "SECRET ENDING - One betrayal revealed. The corrupt officer falls with the King, and the Four walk free with a new name: The Last Honest Ones.", actors: [{ id: 'mastermind', at: [-1.5, 0] }, { id: 'driver', at: [-0.5, 0.4] }, { id: 'hacker', at: [0.5, 0.4] }, { id: 'insider', at: [1.5, 0] }] },
      ] },
    } },
  ] },
];

/** a flat list of [chapter, stepIndex, step] */
export function allSteps() { const out = []; for (const c of CHAPTERS) c.steps.forEach((s, i) => out.push([c, i, s])); return out; }
export function stepById(id) { for (const c of CHAPTERS) { const i = c.steps.findIndex(s => s.id === id); if (i >= 0) return { chapter: c, index: i, step: c.steps[i] }; } return null; }

/** interrogation questions at the station (c3_questioned). trust is cosmetic flavour for the epilogue radio lines. */
export const QUESTIONS = {
  q1: { who: 'officer', text: "Vikram Rao. You were at the docks last night. Why?", opts: [{ label: 'Say nothing', trust: 1 }, { label: '"Looking for work, sir."', trust: 0 }, { label: '"I want a lawyer."', trust: 1 }] },
  q2: { who: 'officer', text: "Raju Naidu, fastest driver in Guntur. A taxi was seen leaving the warehouse. Yours?", opts: [{ label: '"Half of Andhra drives taxis."', trust: 0 }, { label: 'Smile and stay quiet', trust: 1 }, { label: '"Check the plate yourself."', trust: -1 }] },
  q4: { who: 'officer', text: "Karthik. Walk with me. In private, how deep are they?", opts: [{ label: '"Deeper than you think, sir."', trust: 1 }, { label: '"I know nothing."', trust: 0 }, { label: '"Not here."', trust: 1 }] },
};

export const RADIO_CHATTER = [
  'All units: robbery reported near the market. Suspects in a red hatchback.',
  'Control: roadblock authorised on the Guntur highway.',
  'Unit 6: nothing at the docks. Moving to the bus stand.',
  'Control: SP Ranadheer requests all CCTV from the Kondapalli area.',
  'Unit 11: suspicious lorry heading north. Following.',
  'All units: the Four are believed armed. Do not approach alone.',
];
