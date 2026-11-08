// Andhra Roamer - game bootstrap, loop, input, camera, HUD, jobs, chat.
import { SURF } from './geo.js';
import { loadRegionData, createOsmWorld } from './osmworld.js';
import { Crowd, Police } from './peds.js';
import { Vehicle, SPECS, FIXED_DT, MAX_STEPS } from './physics.js';
import { Scene3D } from './scene.js';
import { Net, FLAG } from './net.js';
import { MapView } from './map2d.js';
import { generateOffers, JobRunner, FUEL_PRICE, rankFor } from './jobs.js';
import { AudioFX } from './audio.js';
import { Characters } from './characters.js';
import { ParkedLot, distToVehicle } from './parked.js';
import { Law } from './law.js';
import { Joystick } from './joystick.js';
import { Voice } from './voice.js';
import { StoryClient } from './story.js';
import { ROLES, NPCS } from './storydata.js';

const $ = id => document.getElementById(id);
const COLORS = ['#d9482b', '#f1c40f', '#2e86de', '#27ae60', '#ecf0f1', '#8e44ad', '#e67e22', '#2c3e50'];
const SAVE_KEY = 'andhraRoamer.v1';
const CYCLE_SEC = 2400; // one in-game day = 40 real minutes: 32 min of daylight, 8 min of night
const REGIONS = [{ id: 'vijayawada', name: 'Vijayawada - Guntur' }, { id: 'vizag', name: 'Visakhapatnam' }, { id: 'tirupati', name: 'Tirupati' }];
const TIME_MODE = new URLSearchParams(location.search).get('time');
function todOf(sec) { if (TIME_MODE === 'day') return 0.5; if (TIME_MODE === 'night') return 0.95; const t = (sec / CYCLE_SEC) % 1; return t < 0.8 ? 0.27 + (t / 0.8) * 0.46 : (0.73 + ((t - 0.8) / 0.2) * 0.54) % 1; }
const CAM = { car: { dist: 8.2, h: 3.0, look: 5, lookH: 1.2, eye: [-0.4, 1.28, 0.25] }, bus: { dist: 15, h: 5.6, look: 9, lookH: 2.4, eye: [-0.8, 2.55, 4.3] },
  lorry: { dist: 13.5, h: 5.0, look: 8, lookH: 2.3, eye: [-0.6, 2.85, 3.5] } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const rs = n => 'Rs ' + Math.round(n).toLocaleString('en-IN');
const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } };
const store = d => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { /* storage may be blocked */ } };

const G = window.__game = { keys: {}, touch: {}, steer: 0, camMode: 0, camYaw: 0, orbit: 0, orbitY: 0, zoom: 1, shake: 0, lights: 'auto', running: false, paused: false, offerSeed: 1,
  runner: null, offers: [], tags: new Map(), acc: 0, lastT: 0, hudT: 0, minimapT: 0, fps: 60, fpsAcc: 0, fpsN: 0, saveT: 0, moneyT: 0, tmp: {}, started: false };

/* ------------------------------------------------------------ loading */
async function loadThree() {
  const urls = [new URL('../vendor/three.module.js', import.meta.url).href, 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', 'https://unpkg.com/three@0.160.0/build/three.module.js'];
  for (const u of urls) { try { return await import(u); } catch (e) { console.warn('three.js failed from', u, e); } }
  throw new Error('Could not load three.js. Check your internet connection (or put three.module.js in client/vendor/).');
}
const progress = (t, f) => { $('ldText').textContent = t; $('ldBar').style.width = Math.round(f * 100) + '%'; };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

async function boot() {
  try {
    progress('Loading engine...', 0.1);
    const [T] = await Promise.all([loadThree(), nextFrame()]);
    G.T = T; progress('Building Andhra Pradesh...', 0.35); await nextFrame();
    G.meta = {};
    G.audio = new AudioFX(); G.save = loadSave();
    buildMenu(); $('loading').hidden = true; $('menu').hidden = false;
  } catch (e) { $('ldErr').textContent = String(e.message || e); console.error(e); }
}

/* ------------------------------------------------------------ menu */
function buildMenu() {
  const s = G.save, prof = G.profile = { name: s.name || '', veh: s.veh || 'car', color: s.color || COLORS[0], region: new URLSearchParams(location.search).get('region') || s.region || 'vijayawada', city: s.city || '', room: s.room || new URLSearchParams(location.search).get('room') || '' };
  $('name').value = prof.name; $('room').value = prof.room;
  const rg = $('region'); rg.innerHTML = ''; for (const r of REGIONS) { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; rg.appendChild(o); }
  rg.value = prof.region; rg.onchange = () => fillCities(rg.value); fillCities(prof.region);
  const swatches = (host, onPick) => { host.innerHTML = ''; COLORS.forEach(c => { const i = document.createElement('i'); i.style.background = c; i.dataset.c = c; if (c === G.profile.color) i.className = 'sel'; i.onclick = () => { onPick(c); [...host.children].forEach(k => k.classList.toggle('sel', k.dataset.c === c)); }; host.appendChild(i); }); };
  swatches($('colors'), c => { G.profile.color = c; });
  const vehBtns = (host, onPick) => { [...host.querySelectorAll('button')].forEach(b => { b.classList.toggle('sel', b.dataset.veh === G.profile.veh); b.onclick = () => { onPick(b.dataset.veh); [...host.querySelectorAll('button')].forEach(k => k.classList.toggle('sel', k === b)); }; }); };
  vehBtns($('vehPick'), v => { G.profile.veh = v; });
  $('startBtn').onclick = startGame;
  $('storyBtn').onclick = () => { try { sessionStorage.setItem('wantStory', '1'); } catch (e) { /* ignore */ } startGame(); };
  try { if (sessionStorage.getItem('wantStory') === '1') setTimeout(startGame, 400); } catch (e) { /* ignore */ }
  $('name').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });
  G.swatches = swatches; G.vehBtns = vehBtns;
}

async function fillCities(id) {
  const sel = $('startCity'); sel.innerHTML = '<option>Loading...</option>';
  try {
    const meta = G.meta[id] || (G.meta[id] = await (await fetch(`data/${id}.json`)).json());
    sel.innerHTML = ''; for (const c of meta.hubs.filter(c => c.tier >= 1).slice(0, 30)) { const o = document.createElement('option'); o.value = c.name; o.textContent = c.name; sel.appendChild(o); }
    if ([...sel.options].some(o => o.value === G.profile.city)) sel.value = G.profile.city;
  } catch (e) { sel.innerHTML = '<option value="">(map data missing)</option>'; }
}

async function startGame() {
  const prof = G.profile; prof.name = ($('name').value || '').trim() || 'Driver' + Math.floor(Math.random() * 900 + 100);
  prof.region = $('region').value; prof.city = $('startCity').value;
  if (G.world && G.world.meta.id !== prof.region) { store({ ...G.save, region: prof.region, city: prof.city, name: prof.name, veh: prof.veh, color: prof.color }); location.reload(); return; }
  prof.room = ($('room').value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 12);
  G.audio.start(); $('menu').hidden = true; $('loading').hidden = false; progress('Loading the map...', 0.05);
  if (!G.world) {
    try { const d = await loadRegionData(prof.region, 'data', f => progress('Loading the map...', 0.05 + f * 0.3)); progress('Building the city...', 0.4); await nextFrame(); G.world = createOsmWorld(d); G.map = new MapView(G.world); }
    catch (e) { $('ldErr').textContent = 'Map data failed to load: ' + e.message; console.error(e); return; }
  }
  progress('Rendering the world...', 0.5);
  const first = !G.scene;
  if (first) {
    const q = G.save.quality || (matchMedia('(max-width: 800px)').matches ? 'low' : 'medium');
    try { G.scene = new Scene3D(G.T, $('game'), G.world, q); } catch (e) { $('ldErr').textContent = 'Graphics failed to start: ' + e.message; console.error(e); return; }
    G.veh = new Vehicle(prof.veh, G.world); G.crowd = new Crowd(G.world); G.police = new Police(G.world); G.wp = null;
    G.law = new Law(G.world); G.lot = new ParkedLot(G.world); G.chars = new Characters(G.T, G.scene.scene); G.vcolor = prof.color; G.hp = 100; G.storyC = new StoryClient(G, H);
    G.money = G.save.money || 0; G.earned = G.save.earned || 0;
    initInput(); initHud();
  } else { G.veh.setType(prof.veh); G.scene.removeModel('me'); }
  const c = G.world.cityByName.get(prof.city) || G.world.cities.find(h => h.tier === 2) || G.world.cities[0];
  const sp = c.spawn || c.dropPoints[0] || { x: c.x, z: c.z, h: 0 }, dp = sp;
  G.veh.setType(prof.veh); G.veh.reset(sp.x, sp.z, sp.h);
  G.camYaw = G.veh.h; G.orbit = 0; G.runner = null; G.scene.setBeacon(null);
  // initial terrain ring, a few chunks per frame so the progress bar moves
  let left = 1; while (left > 0) { left = G.scene.updateChunks(dp.x, dp.z, 4); progress('Rendering the world...', 0.5 + 0.5 * (1 - Math.min(1, left / 60))); await nextFrame(); }
  G.vcolor = prof.color; G.scene.model('me', prof.veh, G.vcolor);
  $('loading').hidden = true; $('hud').hidden = false;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { $('touch').hidden = false; G.touch.enabled = true; $('hud').classList.add('is-touch'); document.body.classList.add('is-touch'); }
  setFootMode(!!G.foot); if (!G.joy) G.joy = new Joystick($('joyZone'), $('joyBase'), $('joyKnob'));
  G.swatches($('garColors'), c2 => { G.profile.color = c2; applyVehicleChange(); });
  G.vehBtns($('garVeh'), v => { G.profile.veh = v; applyVehicleChange(); });
  persist();
  // network
  if (!G.net) G.net = new Net({ onStatus: onNetStatus, onChat: m => addChat(m.name, m.text), onJoin: r => { toast(r.name + ' joined'); if (G.voice && G.voice.on) G.voice.hello(r.id); }, onLeave: r => { toast(r.name + ' left'); G.scene.removeModel('r' + r.id); G.chars.remove('r' + r.id); dropTag(r.id); G.voice && G.voice.peerLeft(r.id); },
    onLeaveAll: () => { for (const k of [...G.scene.models.keys()]) if (k.startsWith('r')) G.scene.removeModel(k); clearTags(); }, onError: m => toast(m, 3500),
    onWelcome: m => { G.lot.dyn.clear(); G.lot.taken = new Set(m.taken || []); for (const v of m.parked || []) G.lot.dyn.set(v.id, v); G.storyC.onState(m.story); },
    onParkAdd: (v, by) => { if (by === G.net.id && G.myPark && G.myPark.startsWith('me~')) { const e = G.lot.dyn.get(G.myPark); G.lot.dyn.delete(G.myPark); G.lot.dyn.set(v.id, { ...(e || {}), ...v, mine: true }); G.myPark = v.id; } else G.lot.dyn.set(v.id, v); },
    onParkDel: (id, by) => { G.lot.dyn.delete(id); if (/^s\d+$/.test(id)) G.lot.taken.add(id); if (id === G.myPark && by !== G.net.id) { G.myPark = null; toast('Someone took your vehicle!', 2500); } },
    onEnter: onEnterReply, onStory: s => G.storyC.onState(s), onHost: () => {}, onEv: (k, d, from) => onEv(k, d, from) });
  const url = new URLSearchParams(location.search).get('server') || (window.GAME_CONFIG && window.GAME_CONFIG.SERVER_URL) || '';
  if (!G.voice) G.voice = new Voice(G.net, voiceState);
  G.net.disconnect();
  if (url) G.net.connect(url, { name: prof.name, veh: prof.veh, color: prof.color, room: prof.region + '-' + (prof.room || 'open') });
  else onNetStatus('offline', 'Offline mode (no server URL set)');
  if (G.dayShift === undefined) G.dayShift = 0.07 * CYCLE_SEC - (G.net ? G.net.now() : Date.now()) / 1000; // every player starts in the morning
  G.running = true; G.paused = false; G.lastT = performance.now(); G.acc = 0;
  if (!G.started) { G.started = true; requestAnimationFrame(frame); }
  toast(`Welcome to ${c.name}! Press J for jobs, M for the map`, 3500);
  try { if (sessionStorage.getItem('wantStory') === '1') { sessionStorage.removeItem('wantStory'); setTimeout(() => G.storyC.openLobby(), 700); } } catch (e) { /* ignore */ }
}

function applyVehicleChange() {
  const p = G.profile; if (p.veh !== G.veh.type) { G.veh.setType(p.veh); G.runner = null; G.scene.setBeacon(null); toast('Switched to ' + SPECS[p.veh].label + ' (refuelled)'); }
  G.vcolor = p.color; G.scene.model('me', p.veh, G.vcolor); G.net && G.net.sendVehicle(p.veh, G.vcolor); persist();
}
function persist() { const p = G.profile; store({ ...G.save, name: p.name, veh: p.veh, color: p.color, region: p.region, city: p.city, room: p.room, money: G.money, earned: G.earned, quality: G.scene ? G.scene.qName : G.save.quality }); }

/* ------------------------------------------------------------ input */
function typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT'); }
function modalOpen() { return ['board', 'garage', 'bigmap', 'pause'].some(id => !$(id).hidden); }
function initInput() {
  addEventListener('keydown', e => {
    if (typing()) { if (e.key === 'Enter' && document.activeElement === $('chatinput')) { const t = $('chatinput').value.trim(); if (t) G.net && G.net.sendChat(t); $('chatinput').value = ''; $('chatinput').hidden = true; $('chatinput').blur(); } else if (e.key === 'Escape') { $('chatinput').hidden = true; $('chatinput').blur(); } return; }
    if (!G.running) return;
    const k = e.code; G.keys[k] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
    if (k === 'Escape') { if (modalOpen()) closeModals(); else togglePause(true); return; }
    if (modalOpen()) { if (k === 'KeyJ') toggleBoard(); if (k === 'KeyM') toggleMap(); if (k === 'KeyV') toggleGarage(); return; }
    if (k === 'Enter') { $('chatinput').hidden = false; $('chatinput').focus(); }
    else if (k === 'KeyC') { G.camMode = (G.camMode + 1) % 3; toast(['Chase camera', 'Far camera', 'Driver view'][G.camMode], 900); }
    else if (k === 'KeyL') { G.lights = G.lights === 'auto' ? 'on' : G.lights === 'on' ? 'off' : 'auto'; toast('Headlights: ' + G.lights, 900); }
    else if (k === 'KeyJ') toggleBoard();
    else if (k === 'KeyM') toggleMap();
    else if (k === 'KeyV') toggleGarage();
    else if (k === 'KeyR') resetToRoad(false);
    else if (k === 'KeyX') cancelJob();
    else if (k === 'Tab') { $('players').hidden = false; renderPlayers(); }
    else if (k === 'KeyH') { G.audio.horn(G.veh.type); }
    else if (k === 'KeyG') e.preventDefault();
    else if (k === 'KeyE') toggleFoot();
    else if (k === 'KeyT') G.storyC.openLobby();
    else if (k === 'KeyY') teamJump();
    else if (k === 'KeyB') toggleMic();
  });
  addEventListener('keyup', e => { G.keys[e.code] = false; if (e.code === 'Tab') $('players').hidden = true; });
  addEventListener('blur', () => { G.keys = {}; });
  { const look = new Map(); let pinch = 0;
    const cvs = $('game');
    cvs.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return; look.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { cvs.setPointerCapture(e.pointerId); } catch (_) {} G.looking = true; });
    const up = e => { look.delete(e.pointerId); if (!look.size) { G.looking = false; G.lastDrag = performance.now(); } };
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('contextmenu', e => e.preventDefault());
    cvs.addEventListener('pointermove', e => { const p = look.get(e.pointerId); if (!p) return; const k = e.pointerType === 'mouse' ? 0.006 : G.foot ? 0.0055 : 0.008; G.orbit -= (e.clientX - p.x) * k; G.orbitY = clamp(G.orbitY + (e.clientY - p.y) * 0.03, -2.5, 9); p.x = e.clientX; p.y = e.clientY; G.lastDrag = performance.now(); G.freeLook = true; });
  }
  $('game').addEventListener('wheel', e => { G.zoom = clamp(G.zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.6, 1.9); }, { passive: true });
  addEventListener('resize', () => G.scene && G.scene.resize());
  // minimap zoom: tap / wheel / + -
  const MINI = [250, 450, 650, 1000, 1600, 2800], mini = d => { let i = MINI.indexOf(G.miniR || 650); if (i < 0) i = 2; G.miniR = MINI[clamp(i + d, 0, MINI.length - 1)]; toast('Minimap ' + (G.miniR >= 1000 ? (G.miniR / 500).toFixed(1) + ' km' : G.miniR * 2 + ' m') + ' wide', 900); };
  $('minimap').addEventListener('click', () => { const i = MINI.indexOf(G.miniR || 650); if (i >= MINI.length - 1) G.miniR = MINI[0]; else mini(1); });
  $('minimap').addEventListener('wheel', e => { e.preventDefault(); mini(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  addEventListener('keydown', e => { if (typing() || !G.running) return; if (e.code === 'Equal' || e.code === 'NumpadAdd') { if (modalOpen()) bigZoom(1.4); else mini(-1); } if (e.code === 'Minus' || e.code === 'NumpadSubtract') { if (modalOpen()) bigZoom(1 / 1.4); else mini(1); } });
  // big map: buttons, wheel, drag to pan, pinch to zoom
  const cv = $('bigcanvas'), ptr = new Map(); let pinch = 0;
  const M = () => G.mapV || (G.mapV = { zoom: 1, cx: null, cz: null });
  const bigZoom = f => { const m = M(); if (m.cx === null) { m.cx = G.veh.x; m.cz = G.veh.z; } m.zoom = clamp(m.zoom * f, 1, 60); if (m.zoom < 1.01) { m.zoom = 1; m.cx = m.cz = null; } drawBigMap(); };
  window.__bigZoom = bigZoom;
  $('mapZin').onclick = () => bigZoom(1.6); $('mapZout').onclick = () => bigZoom(1 / 1.6); $('mapZreset').onclick = () => { G.mapV = { zoom: 1, cx: null, cz: null }; drawBigMap(); };
  cv.addEventListener('wheel', e => { e.preventDefault(); bigZoom(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
  let down = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; down = ptr.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  cv.addEventListener('pointerup', e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7 && performance.now() - down.t < 600 && G.map.view) { const r = cv.getBoundingClientRect(), k = cv.width / r.width, V = G.map.view; setWaypoint({ x: ((e.clientX - r.left) * k - V.ox) / V.sc, z: ((e.clientY - r.top) * k - V.oz) / V.sc }); drawBigMap(); }
    down = null; ptr.delete(e.pointerId); pinch = 0; }); cv.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); pinch = 0; });
  cv.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return; const m = M(), k = cv.width / cv.clientWidth;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [c2, d2] = [...ptr.values()], dist = Math.hypot(c2.x - d2.x, c2.y - d2.y); if (pinch) bigZoom(dist / pinch); pinch = dist; return; }
    if (m.zoom <= 1) return; const base = Math.min(cv.width / G.world.WORLD.w, cv.height / G.world.WORLD.h) * 0.97 * m.zoom;
    m.cx = clamp(m.cx - (e.clientX - p.x) * k / base, 0, G.world.WORLD.w); m.cz = clamp(m.cz - (e.clientY - p.y) * k / base, 0, G.world.WORLD.h); p.x = e.clientX; p.y = e.clientY; drawBigMap();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.keys = {}; });
  for (const b of document.querySelectorAll('#footBtns button')) {
    const k = b.dataset.k, on = v => e => { e.preventDefault(); G.touch[k] = v; if (v && k === 'act') toggleFoot(); };
    b.addEventListener('touchstart', on(true), { passive: false }); b.addEventListener('touchend', on(false), { passive: false }); b.addEventListener('touchcancel', on(false), { passive: false });
    b.addEventListener('mousedown', on(true)); b.addEventListener('mouseup', on(false));
  }
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.k, on = v => e => { e.preventDefault(); G.touch[k] = v; if (v && k === 'horn') G.audio.horn(G.veh.type); if (v && k === 'jobs') toggleBoard(); if (v && k === 'map') toggleMap(); if (v && k === 'act') toggleFoot(); if (v && k === 'story') G.storyC.openLobby(); if (v && k === 'team') teamJump(); if (v && k === 'mic') toggleMic(); };
    b.addEventListener('touchstart', on(true), { passive: false }); b.addEventListener('touchend', on(false), { passive: false }); b.addEventListener('touchcancel', on(false), { passive: false });
  }
}
function readInput(dt) {
  const K = G.keys, T = G.touch;
  const up = K.KeyW || K.ArrowUp || T.gas, down = K.KeyS || K.ArrowDown || T.rev, left = K.KeyA || K.ArrowLeft || T.left, right = K.KeyD || K.ArrowRight || T.right;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  G.steer += (target - G.steer) * Math.min(1, dt * (target === 0 ? 9 : 5.5));
  if (G.paused || modalOpen()) return { throttle: 0, steer: 0, brake: 0.6, handbrake: false };
  return { throttle: (up ? 1 : 0) - (down ? 1 : 0), steer: G.steer, brake: T.brake ? 1 : 0, handbrake: !!K.Space };
}

/* ------------------------------------------------------------ HUD / UI */
function initHud() {
  $('jobCancel').onclick = cancelJob; $('boardClose').onclick = toggleBoard; $('garClose').onclick = toggleGarage; $('mapClose').onclick = toggleMap;
  $('wpClear').onclick = () => setWaypoint(null);
  $('boardRefresh').onclick = () => { G.offerSeed++; renderBoard(); };
  $('pauseResume').onclick = () => togglePause(false);
  $('gearBtn').onclick = () => togglePause($('pause').hidden);
  $('setMic').onclick = () => toggleMic(); $('setFs').onclick = () => toggleFs(); $('setTeam').onclick = () => { togglePause(false); teamJump(); }; $('setStory').onclick = () => { togglePause(false); G.storyC.openLobby(); };
  $('voiceVol').oninput = e => { G.voiceVol = +e.target.value; if (G.voice) G.voice.setVolume(G.voiceVol); };
  $('pauseLeave').onclick = () => { closeModals(); G.running = false; G.net.disconnect(); clearTags(); $('hud').hidden = true; $('menu').hidden = false; G.audio.update(0, 0, 0, 'car'); persist(); };
  $('quality').value = G.scene.qName; $('quality').onchange = e => { G.scene.setQuality(e.target.value); persist(); };
  $('volume').oninput = e => G.audio.setVolume(Number(e.target.value));
  addEventListener('beforeunload', persist);
}
let toastTimer = 0;
function toast(msg, ms = 2200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
function addChat(name, text) {
  const d = document.createElement('div'), b = document.createElement('b'); b.textContent = name + ': '; d.appendChild(b); d.appendChild(document.createTextNode(text));
  const log = $('chatlog'); log.appendChild(d); while (log.children.length > 7) log.removeChild(log.firstChild); setTimeout(() => d.remove(), 14000);
}
function onNetStatus(s, detail) {
  const el = $('status'); el.className = 'pill ' + (s === 'online' ? 'on' : 'warn');
  el.textContent = s === 'online' ? `Online · room ${detail}` : detail || s; $('menuStatus').textContent = el.textContent;
}
function closeModals() { for (const id of ['board', 'garage', 'bigmap', 'pause']) $(id).hidden = true; G.paused = false; }
function togglePause(v) { closeModals(); $('pause').hidden = !v; G.paused = v; $('pauseInfo').textContent = G.net && G.net.status === 'online' ? `Room "${G.net.room}" - share the room code with friends. Ping ${Math.round(G.net.rtt)} ms.` : 'Offline.'; if (v) G.audio.update(0, 0, 0, G.veh.type); }
function toggleMap() { const open = $('bigmap').hidden; closeModals(); $('bigmap').hidden = !open; if (open) { sizeBigMap(); drawBigMap(); } }
function sizeBigMap() { const c = $('bigcanvas'), p = c.parentElement, r = p.getBoundingClientRect(); const hh = Math.max(200, window.innerHeight - 120), w = Math.max(240, r.width - 16), k = Math.min(1.5, window.devicePixelRatio || 1); c.style.height = hh + 'px'; c.style.width = w + 'px'; c.width = Math.round(w * k); c.height = Math.round(hh * k); G.map.fullRoads = G.map.fullRoadsG3 = null; }
function toggleGarage() { const open = $('garage').hidden; closeModals(); $('garage').hidden = !open; }
function toggleBoard() { const open = $('board').hidden; closeModals(); if (!open) return; $('board').hidden = false; renderBoard(); }
function drawBigMap() { const c = $('bigcanvas'), M = G.mapV || (G.mapV = { zoom: 1, cx: null, cz: null }); G.map.draw(c.getContext('2d'), c.width, c.height, { full: true, theme: 'gta3', zoom: M.zoom, mcx: M.cx, mcz: M.cz, me: G.foot || G.veh, wp: G.wp, target: G.runner && G.runner.target, players: remotePins(), blips: allBlips(true) }); }
function remotePins() { const out = []; if (!G.net) return out; for (const r of G.net.remotes.values()) { const s = r.snaps[r.snaps.length - 1]; if (s) out.push({ x: s.x, z: s.z, color: r.color, name: r.name }); } return out; }
function renderPlayers() {
  const rows = [{ name: G.profile.name + ' (you)', veh: G.veh.type, money: G.money }, ...(G.net ? [...G.net.remotes.values()].map(r => ({ name: r.name, veh: r.veh, money: r.money })) : [])];
  rows.sort((a, b) => b.money - a.money);
  $('players').innerHTML = '<table><tr><th>Driver</th><th>Vehicle</th><th>Money</th></tr>' + rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.veh}</td><td>${rs(r.money)}</td></tr>`).join('') + '</table>' + (G.net ? `<div class="note">${G.net.status === 'online' ? 'Ping ' + Math.round(G.net.rtt) + ' ms' : 'Offline'}</div>` : '');
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------ jobs / fuel */
function nearestCityInfo() { return G.world.nearestCity(G.veh.x, G.veh.z); }
function renderBoard() {
  const { city, dist } = nearestCityInfo(), v = G.veh, spec = SPECS[v.type];
  $('boardTitle').textContent = `${spec.jobLabel} from ${city.name}`;
  const list = $('boardList'); list.innerHTML = '';
  if (G.runner) { list.innerHTML = '<p class="sub">You already have an active job. Finish or cancel it (X) first.</p>'; return; }
  if (dist > city.R + 400) { list.innerHTML = `<p class="sub">Drive into a city to pick up work. Nearest: ${esc(city.name)}.</p>`; return; }
  G.offers = generateOffers(G.world, v.type, city, G.offerSeed);
  for (const o of G.offers) {
    const d = document.createElement('div'); d.className = 'jobCard';
    d.innerHTML = `<div><b>${esc(o.title)}</b><small>${o.stops.map(s => esc(s.city.name)).join(' → ')} · ${o.km} km real · ${Math.round(o.limit / 60)} min${o.ghat ? ' · ghat road bonus' : ''}</small></div><div><div class="pay">${rs(o.pay)}</div><button>Accept</button></div>`;
    d.querySelector('button').onclick = () => acceptJob(o); list.appendChild(d);
  }
}
function acceptJob(o) {
  G.runner = new JobRunner(o); closeModals(); G.scene.setBeacon(G.runner.target, '#ffb347');
  G.veh.load = 0; toast(`Job accepted: ${o.title}. Head to ${o.stops[0].city.name}`, 3000);
}
function cancelJob() { if (!G.runner) return; G.runner = null; G.veh.load = 0; G.scene.setBeacon(null); toast('Job cancelled'); }
function updateJob(dt) {
  const r = G.runner; if (!r) return;
  const ev = r.update(dt, G.veh); if (!ev) return;
  if (ev.type === 'stop') {
    const lorry = G.veh.type === 'lorry', first = ev.index === 0;
    if (first) G.veh.load = lorry ? 1 : 0.5;
    toast(first ? (lorry ? 'Cargo loaded!' : 'Passengers on board!') : 'Stop complete'); G.audio.chime();
    G.scene.setBeacon(r.target, ev.index + 1 >= r.job.stops.length - 1 ? '#3ddc84' : '#ffb347');
  } else if (ev.type === 'done') {
    G.money += ev.pay; G.earned += ev.pay; G.veh.load = 0; G.runner = null; G.scene.setBeacon(null); G.audio.chime();
    toast(`Delivered! +${rs(ev.pay)}${ev.onTime ? ' (on-time bonus)' : ''}`, 3500); persist(); if (G.net) G.net.sendMoney(G.earned);
  }
}
function stationNear() {
  const v = G.veh; for (const s of G.world.stations || []) { if (Math.abs(v.x - s.x) < 30 && Math.abs(v.z - s.z) < 30 && Math.hypot(v.x - s.x, v.z - s.z) < 24) return s; } return null;
}
function resetToRoad(free) {
  const v = G.veh; v.respawnOnRoad();
  if (v.fuel <= 0.5) { v.fuel = 8; toast('Villagers helped out with 8 litres of fuel'); } else if (!free) toast('Back on the road');
  G.camYaw = v.h;
}

/* ------------------------------------------------------------ simulation */
function onHit(ev) {
  G.audio.crash(); G.veh.impact = Math.max(G.veh.impact || 0, 4);
  if (ev.kind === 'human') { toast('You hit a pedestrian! The police are after you - escape!', 4500); if (!G.police.active) { if (G.police.start(G.veh, 1)) G.sirenT = 0; } else G.police.raise(G.veh, 1); }
  else { const fine = ev.kind === 'cow' ? 150 : ev.kind === 'goat' ? 80 : 50, paid = Math.min(G.money, fine); G.money -= paid; toast(`You hit a ${ev.kind}! Fine ${rs(paid)}`, 3000); }
}
function policeResult(res) {
  const ls = G.lastStars; 
  for (const k of [...G.scene.models.keys()]) if (k.startsWith('pol')) G.scene.removeModel(k);
  if (res === 'escaped') toast('You escaped the police!', 3500);
  else if (res === 'cleared') toast('All police units wrecked. You are clear!', 3500);
  else { G.veh.vx = G.veh.vz = 0; startArrest('Caught by the police'); }
}
function setWaypoint(p) { G.wp = p; G.scene.setWaypoint(p); if (p) toast('Pin set - follow the blue arrow', 2000); }


function gunFrame(dt, me, pose, v) {
  const gun = G.scene.attachGun(me, v.type), yaw = G.aimYaw ?? pose.h, pit = G.aimPitch || 0;
  G.scene.aimGun(me, yaw, pit, pose.h); G.scene.tickFx(dt); G.gunCd = Math.max(0, (G.gunCd || 0) - dt);
  if (G.foot || !(G.keys.KeyG || G.touch.fire) || G.gunCd > 0 || G.paused) return;
  G.gunCd = 0.11; G.audio.shot(); G.scene.gunFlash(me);
  const ox = pose.x + Math.sin(pose.h) * gun.z * 1 + 0, oy = pose.y + gun.muzzleH, oz = pose.z + Math.cos(pose.h) * gun.z;
  const dx = Math.sin(yaw) * Math.cos(pit), dy = Math.sin(pit), dz = Math.cos(yaw) * Math.cos(pit), RANGE = 160;
  let best = RANGE, hit = null;
  const test = (x, y, z, r, fn) => { const rx = x - ox, ry = y - oy, rz = z - oz, t = rx * dx + ry * dy + rz * dz; if (t < 1 || t > best) return; const cx = ox + dx * t - x, cy = oy + dy * t - y, cz = oz + dz * t - z; if (cx * cx + cy * cy + cz * cz < r * r) { best = t; hit = fn; } };
  G.police.cars.forEach((P, i) => { if (P.hp > 0) test(P.car.x, (P.car.y || 0) + 1, P.car.z, 2.4, () => { if (G.police.damage(i, 25)) { toast('Police unit destroyed! Wanted level up', 1800); G.audio.crash(3); G.police.raise(G.veh, 1); } }); });
  for (const e of G.crowd.list) if (e.state !== 'hit') test(e.x, (e.lift || 0) + 0.9, e.z, e.kind === 'human' ? 0.6 : 0.7, () => {
    e.state = 'hit'; e.t = 0; e.vy = 3; e.hx = dx * 4; e.hz = dz * 4; e.spin = 3;
    if (e.kind === 'human') { toast('You shot a pedestrian! Wanted level up', 2500); if (!G.police.active) G.police.start(G.veh, 2); else if (!G.wantedCd || performance.now() > G.wantedCd) { G.police.raise(G.veh, 1); G.wantedCd = performance.now() + 4000; } } });
  const ex = ox + dx * best, ey = oy + dy * best, ez = oz + dz * best;
  G.scene.tracer(ox + dx * 1.5, oy + dy * 1.5, oz + dz * 1.5, ex, ey, ez); if (hit) hit();
}

/* ------------------------------------------------ on foot: exit / enter vehicle, joystick, pistol, health, arrest */
const PARK = { throttle: 0, steer: 0, brake: 1, handbrake: true };
function inBuilding(x, z, m = 0.45) { for (const b of G.world.buildingsNear(x, z)) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + m && Math.abs(lz) < b.hd + m) return true; } return false; }
function nearVehicle(x, z, skipOwn) {
  const v = G.veh; if (!skipOwn && !G.myPark) { if (distToVehicle(x, z, v.x, v.z, v.h, v.spec) < 0.5) return true; }
  if (G.lot.blocks(x, z, 0.7)) return true;
  for (const n of G.scene.npcPos) if ((n.x - x) ** 2 + (n.z - z) ** 2 < 6.5) return true;
  if (G.police.active) for (const P of G.police.cars) if ((P.car.x - x) ** 2 + (P.car.z - z) ** 2 < 8) return true;
  return false;
}
function goodSpot(x, z) { return !inBuilding(x, z) && G.world.heightAt(x, z) > -0.4 && !nearVehicle(x, z, true); }
function findExitSpot() {
  const v = G.veh, s = Math.sin(v.h), c = Math.cos(v.h), hw = v.spec.wid / 2 + 1.0, hl = v.spec.len / 2 + 1.3;
  const cand = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1.6, 0], [1.6, 0], [-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8], [0, -1.8], [0, 1.8]];
  for (const [a, b] of cand) { const lx = a * hw, lz = b * hl, x = v.x + lx * c + lz * s, z = v.z - lx * s + lz * c; if (goodSpot(x, z)) return { x, z }; }
  const sn = G.world.snapToRoad(v.x, v.z, 40, 7); if (sn) { for (const off of [-4, 4, -7, 7]) { const p = G.world.roadPoint(sn.road, sn.s, off, {}); if (goodSpot(p.x, p.z)) return { x: p.x, z: p.z }; } }
  return null;
}
function newFoot(x, z, h, anim) { return { x, z, y: G.world.heightAt(x, z), h, vy: 0, lift: 0, phase: 0, moving: 0, s: 1, crouch: 0, anim: anim || null, shotT: 0 }; }
function setFootMode(on) { const hud = $('hud'); hud.classList.toggle('is-foot', on); hud.classList.toggle('is-drive', !on); if (G.touch.enabled) { for (const id of ['joyZone', 'joyBase', 'footBtns']) $(id).hidden = !on; if (!on && G.joy) G.joy.release(); } }
function exitVehicle(silent) {
  const v = G.veh; if (G.foot || G.dead) return;
  if (!silent && v.speed > 4) { toast('Stop the vehicle first to get out', 1800); return; }
  const sp = silent ? { x: v.x + 3, z: v.z } : findExitSpot(); if (!sp) { toast('No safe place to get out here', 2000); return; }
  const id = 'me~' + Date.now(); G.myPark = id; G.lot.dyn.set(id, { id, type: v.type, color: G.vcolor, x: v.x, z: v.z, h: v.h, fuel: v.fuel, mine: true });
  if (G.net && G.net.status === 'online') G.net.sendExit(v.type, G.vcolor, v.x, v.z, v.h);
  v.vx = v.vz = 0; G.foot = newFoot(v.x, v.z, v.h, { type: 'exit', t: 0, fx: v.x, fz: v.z, tx: sp.x, tz: sp.z }); G.foot.s = 0.5; G.scene.removeModel('me'); setFootMode(true);
  if (!silent) toast('Out of the vehicle. Use the joystick / WASD, Shift runs, E near a vehicle to get in', 3500);
}
function tryEnter() {
  const f = G.foot; if (!f || f.anim || G.dead) return; if (G.ride) { endRide(); return; } const n = G.lot.nearest(f.x, f.z); if (!n) { const rc = rideCandidate(); if (rc) { startRide(rc); return; } toast('No vehicle close enough', 1500); return; }
  const e = n.e; if (e.id.startsWith('me~') || !G.net || G.net.status !== 'online') return onEnterReply({ ok: true, id: e.id, v: e });
  G.net.sendEnter(e.id, e.static ? { type: e.type, color: e.color, x: e.x, z: e.z, h: e.h } : undefined);
}
function onEnterReply(m) {
  const f = G.foot; if (!f || f.anim) return; if (!m.ok) { toast('Someone else got in first', 1800); return; }
  const e = G.lot.get(m.id) || m.v; if (!e) return; f.anim = { type: 'enter', t: 0, fx: f.x, fz: f.z, tx: e.x, tz: e.z, entry: { ...e } };
}
function finishEnter(e) {
  const v = G.veh; G.lot.dyn.delete(e.id); if (e.static) G.lot.taken.add(e.id);
  if (e.id === G.myPark || e.mine) { G.myPark = null; if (v.type !== e.type) v.setType(e.type); } else { if (v.type !== e.type) v.setType(e.type); v.fuel = v.spec.tank; if (G.myPark) { /* my old vehicle stays parked */ } G.myPark = null; v.reset(e.x, e.z, e.h); }
  G.vcolor = e.color; G.profile.veh = e.type; G.foot = null; G.scene.setFoot(null); G.chars.remove('me'); G.camYaw = v.h; G.orbit = 0; setFootMode(false); toast('Got in', 1200);
}
function toggleFoot() { if (G.ride) { endRide(); return; } if (G.paused || modalOpen() || typing() || G.dead || G.arrest || (G.story && G.story.cine) || (G.foot && G.foot.anim)) return; if (!G.foot) exitVehicle(); else tryEnter(); }
const footProxy = { x: 0, z: 0, h: 0, u: 0, vx: 0, vz: 0, speed: 0, spec: { len: 0.6, wid: 0.6 } };
function footInput() {
  const K = G.keys, T = G.touch, j = G.joy; let ax = 0, ay = 0, mag = 0, run = false;
  if (j && j.mag > 0) { ax = j.x; ay = j.y; mag = j.mag; run = mag > 0.85; }
  else { ay = ((K.KeyW || K.ArrowUp) ? 1 : 0) - ((K.KeyS || K.ArrowDown) ? 1 : 0); ax = ((K.KeyD || K.ArrowRight) ? 1 : 0) - ((K.KeyA || K.ArrowLeft) ? 1 : 0); mag = Math.min(1, Math.hypot(ax, ay)); run = !!(K.ShiftLeft || K.ShiftRight); }
  return { ax, ay, mag, run, jump: !!(K.Space || T.jump), shoot: !!(K.KeyG || T.shoot) };
}
function footStep(dt) {
  const f = G.foot, w = G.world, v = G.veh; if (!f) return;
  if (f.anim) { const a = f.anim; a.t += dt / 0.55; const k = Math.min(1, a.t), e = k * k * (3 - 2 * k); f.x = a.fx + (a.tx - a.fx) * e; f.z = a.fz + (a.tz - a.fz) * e; f.y = w.heightAt(f.x, f.z);
    if (a.type === 'exit') { f.s = 0.5 + 0.5 * e; f.crouch = 1 - e; } else { f.s = 1 - 0.7 * e; f.crouch = e; } f.moving = 0.3; f.phase += dt * 6;
    if (k >= 1) { if (a.type === 'enter') { finishEnter(a.entry); return; } f.anim = null; f.s = 1; f.crouch = 0; } }
  else if (G.ride) { rideStep(dt); }
  else if (G.arrest || G.dead || (G.story && G.story.cine)) { f.moving = 0; }
  else {
    const I = footInput(), yaw = G.camYaw + G.orbit, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let mx = fx * I.ay + rx * I.ax, mz = fz * I.ay + rz * I.ax; const ml = Math.hypot(mx, mz);
    let spd = 0; if (ml > 0) { const m = Math.min(1, I.mag || 1); spd = G.joy && G.joy.mag > 0 ? (m < 0.35 ? 0.9 + m * 3 : m < 0.8 ? 2.0 + (m - 0.35) * 5 : 4.3 + (m - 0.8) * 10) : (I.run ? 6.2 : 3.6); mx /= ml; mz /= ml; }
    if (ml > 0 && !f.aiming) f.h = lerpAngle(f.h, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    let nx = f.x + mx * spd * dt, nz = f.z + mz * spd * dt;
    if (w.heightAt(nx, nz) < -0.4) { nx = f.x; nz = f.z; }
    for (const b of w.buildingsNear(nx, nz)) { const dx = nx - b.x, dz = nz - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c, ex = b.hw + 0.4 - Math.abs(lx), ez = b.hd + 0.4 - Math.abs(lz); if (ex > 0 && ez > 0) { let px = 0, pz = 0; if (ex < ez) px = Math.sign(lx || 1) * ex; else pz = Math.sign(lz || 1) * ez; nx += px * b.c - pz * b.s; nz += px * b.s + pz * b.c; } }
    const pp = { x: nx, z: nz }; G.lot.pushOut(pp); nx = pp.x; nz = pp.z;
    f.speed = spd; f.x = nx; f.z = nz; f.moving += ((spd > 0 ? Math.min(1.3, spd / 4.8) : 0) - f.moving) * Math.min(1, dt * 10); f.phase += dt * (spd > 4 ? 12 : 8) * (spd > 0 ? 1 : 0);
    const gy = w.heightAt(f.x, f.z); if (f.lift <= 0.001 && f.vy <= 0 && I.jump && !G.jumpHeld) { f.vy = 5.2; G.jumpHeld = true; } if (!I.jump) G.jumpHeld = false;
    f.vy -= 14 * dt; f.lift += f.vy * dt; if (f.lift < 0) { f.lift = 0; f.vy = 0; } f.y = gy + f.lift;
    footShoot(dt, I);
  }
  footProxy.x = f.x; footProxy.z = f.z; footProxy.h = f.h; footProxy.speed = f.speed || 0; footProxy.vx = Math.sin(f.h) * (f.speed || 0); footProxy.vz = Math.cos(f.h) * (f.speed || 0);
}
/* pistol: hold SHOOT. On touch it auto-aims at the nearest hostile in front (Free Fire style). */
function hostiles() {
  const out = []; if (G.police.active) G.police.cars.forEach((P, i) => { if (P.hp > 0 && !P.block) out.push({ x: P.car.x, y: 1, z: P.car.z, r: 2.2, hit: d => { if (G.police.damage(i, d * 0.6)) { toast('Police unit destroyed! Wanted level up', 1800); G.police.raise(G.veh, 1); } } }); });
  for (const o of G.law.officers) if (o.hp > 0 && (o.state === 'chase' || G.shotAtCops)) out.push({ x: o.x, y: 1, z: o.z, r: 0.7, hit: d => { if (G.law.damage(o, d)) { H.radio(G.law.radioFor('down', o)); setStars(Math.min(5, (G.police.stars || 0) + 1), 'copkill'); } else if (!G.police.active) setStars(2, 'shot cop'); } });
  if (G.storyC) for (const g of G.storyC.gang) if (g.hp > 0) out.push({ x: g.x, y: 1, z: g.z, r: g.kind === 'boss' ? 0.9 : 0.7, hit: d => G.storyC.hitGang(g.id, d) });
  return out;
}
function footShoot(dt, I) {
  const f = G.foot; G.gunCd = Math.max(0, (G.gunCd || 0) - dt); f.shotT = Math.max(0, f.shotT - dt); f.aiming = f.shotT > 0;
  if (!I.shoot || G.gunCd > 0) return; G.gunCd = 0.28; G.audio.shot();
  const cam = G.camYaw + G.orbit; let yaw = cam, pit = clamp(-G.orbitY * 0.03, -0.3, 0.4);
  if (G.touch.enabled || G.joy) { let best = null, bs = 1e9; for (const t of hostiles()) { const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz), da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - cam), Math.cos(Math.atan2(dx, dz) - cam))); if (d < 40 && da < 0.9 && d + da * 20 < bs) { bs = d + da * 20; best = { yaw: Math.atan2(dx, dz), pit: Math.atan2(t.y - 1.4, d) }; } } if (best) { yaw = best.yaw; pit = best.pit; } }
  f.h = yaw; f.shotT = 0.35; G.shotFlash = 0.06;
  const ox = f.x, oy = f.y + 1.4, oz = f.z, dx = Math.sin(yaw) * Math.cos(pit), dy = Math.sin(pit), dz = Math.cos(yaw) * Math.cos(pit); let bestT = 120, hit = null;
  const test = (x, y, z, r, fn) => { const rx = x - ox, ry = y - oy, rz = z - oz, t = rx * dx + ry * dy + rz * dz; if (t < 0.5 || t > bestT) return; const cx = ox + dx * t - x, cy = oy + dy * t - y, cz = oz + dz * t - z; if (cx * cx + cy * cy + cz * cz < r * r) { bestT = t; hit = fn; } };
  for (const t of hostiles()) test(t.x, t.y + 0.4, t.z, t.r + 0.35, () => t.hit(34));
  for (const e of G.crowd.list) if (e.state !== 'hit') test(e.x, (e.lift || 0) + 0.9, e.z, 0.7, () => { e.state = 'hit'; e.t = 0; e.vy = 3; e.hx = dx * 4; e.hz = dz * 4; e.spin = 3; if (e.kind === 'human') { toast('You shot a pedestrian! Wanted level up', 2000); setStars(Math.min(5, (G.police.stars || 0) + 1), 'murder'); } });
  G.scene.tracer(ox + dx, oy + dy - 0.2, oz + dz, ox + dx * bestT, oy + dy * bestT, oz + dz * bestT); if (hit) hit();
}
function hurt(dmg, from) { if (G.dead || G.arrest) return; G.hp = Math.max(0, G.hp - dmg); $('flash').style.opacity = 0.7; setTimeout(() => { $('flash').style.opacity = 0; }, 120); if (G.hp <= 0) die(); }
function die() {
  G.dead = { t: 0 }; $('wasted').hidden = false; $('wastedTxt').textContent = 'WASTED'; $('wastedTxt').className = ''; $('wastedSub').textContent = 'You are taken to the nearest police station hospital wing'; G.joy && G.joy.release();
  if (G.foot) { G.foot.anim = null; } setTimeout(() => respawnAt(null), 3500);
}
function respawnAt(st) {
  const ns = st || (G.law.nearestStation(G.foot ? G.foot.x : G.veh.x, G.foot ? G.foot.z : G.veh.z) || {}).st, sp = ns ? ns.door : { x: G.veh.x, z: G.veh.z };
  const fine = Math.min(G.money, 200); G.money -= fine; G.hp = 100; G.dead = null; G.arrest = null; $('wasted').hidden = true; setStars(0);
  if (!G.foot) exitVehicle(true); G.foot.anim = null; G.foot.x = sp.x; G.foot.z = sp.z; G.foot.y = G.world.heightAt(sp.x, sp.z); G.camInit = false; toast(fine ? `Hospital bill Rs ${fine}` : 'Back on your feet', 2500);
}
function setStars(n, why) {
  const pol = G.police, P = G.foot ? footProxy : G.veh;
  if (n <= 0) { if (pol.active) pol.stop(); G.law.clearChase(); return; }
  if (!pol.active) { pol.start(P, n); } else if (n > pol.stars) pol.raise(P, n - pol.stars); else pol.stars = n;
  H.radio(G.law.radioFor(n >= 4 ? 'swat' : n >= 2 ? 'backup' : 'crime', { x: P.x, z: P.z, stars: n }));
  G.lawT = 0;
}
function startArrest(why) {
  if (G.arrest || G.dead) return; const P = G.foot || G.veh, stars = Math.max(1, G.police.stars || 1);
  G.arrest = G.law.startArrest({ x: P.x, z: P.z, money: G.money }, stars, why); G.arrest.stage = 'busted'; G.joy && G.joy.release();
  $('wasted').hidden = false; $('wastedTxt').textContent = 'BUSTED'; $('wastedTxt').className = 'busted'; $('wastedSub').textContent = why || 'You have been arrested'; G.police.stop(); G.law.clearChase();
  H.radio(G.law.radioFor('arrest', { station: G.arrest.st && G.arrest.st.name }));
}
function arrestStep(dt) {
  const a = G.arrest; if (!a) return; a.t += dt;
  if (a.stage === 'busted' && a.t > 2.5) { a.stage = 'jail'; a.t = 0; G.money -= a.fine; const st = a.st; if (!G.foot) exitVehicle(true); if (st) { G.foot.anim = null; G.foot.x = st.door.x; G.foot.z = st.door.z; G.foot.y = G.world.heightAt(st.door.x, st.door.z); } G.camInit = false; $('wastedTxt').textContent = 'IN CUSTODY'; }
  if (a.stage === 'jail') { $('wastedSub').textContent = `Questioned by the police... released in ${Math.max(0, Math.ceil(a.time - a.t))}s (fine Rs ${a.fine})`; if (a.t > a.time) { G.arrest = null; $('wasted').hidden = true; toast('Released. Stay out of trouble.', 2500); } }
}
function policeBump(v) {
  if (!G.police.active) return;
  for (const P of G.police.cars) {
    const c = P.car, dx = v.x - c.x, dz = v.z - c.z, d = Math.hypot(dx, dz), rr = v.spec.wid * 0.5 + c.spec.wid * 0.5 + (v.spec.len + c.spec.len) * 0.22;
    if (d < rr && d > 0.01) {
      const nx = dx / d, nz = dz / d, rel = (v.vx - c.vx) * nx + (v.vz - c.vz) * nz, push = (rr - d) * 0.5;
      v.x += nx * push; v.z += nz * push; c.x -= nx * push; c.z -= nz * push;
      if (rel < 0) { const j = -1.2 * rel * 0.5; v.vx += nx * j; v.vz += nz * j; c.vx -= nx * j; c.vz -= nz * j; v.impact = Math.max(v.impact || 0, -rel); if (-rel > 6 && P.hp > 0) G.police.damage(G.police.cars.indexOf(P), -rel * 2); }
    }
  }
}
function lawStep(dt, tg) {
  const L = G.law, stars = G.police.active ? G.police.stars : 0, onFoot = !!G.foot;
  const r = L.update(dt, { x: tg.x, z: tg.z, onFoot, speed: tg.speed || 0, moveSpeed: tg.speed || 0, hurt }, stars);
  if (r.arrested && !G.arrest) startArrest('Arrested by officers on foot');
  G.lawT = (G.lawT || 0) - dt;
  if (stars > 0 && G.lawT < 0 && !G.arrest) { G.lawT = 6; const want = Math.min(6, stars + 1); if (L.chasers() < want) { if (onFoot) L.nearSpawn(tg, 2, stars >= 4); else if (stars >= 2) L.dispatch(tg, 1, stars >= 4); } H.radio(L.radioFor(onFoot ? 'onfoot' : 'spotted', { x: tg.x, z: tg.z, from: L.nearestStation(tg.x, tg.z) ? L.nearestStation(tg.x, tg.z).st : tg, veh: G.veh.spec.label })); }
  if (stars === 0 && L.chasers() > 0 && !G.arrest) L.clearChase();
  const hit = L.roamerHit(G.veh); if (hit && !G.police.active && L.cool.hit <= 0) { L.cool.hit = 5; toast('You hit a police vehicle!', 2200); setStars(2, 'hit cop'); }
  if (G.heat && stars === 0 && L.roamerSees(tg) && !onFoot && G.veh.speed > 32 && L.cool.speed <= 0) { L.cool.speed = 25; toast('Police spotted you speeding', 2000); setStars(1, 'speed'); }
  for (const e of G.lot.all()) { if (Math.abs(e.x - G.veh.x) > 14 || Math.abs(e.z - G.veh.z) > 14 || onFoot) continue; const dx = G.veh.x - e.x, dz = G.veh.z - e.z, d = Math.hypot(dx, dz), sp = SPECS[e.type], rr = (sp.len + G.veh.spec.len) * 0.28 + 0.8; if (d < rr && d > 0.01) { G.veh.x += dx / d * (rr - d) * 0.6; G.veh.z += dz / d * (rr - d) * 0.6; G.veh.vx *= 0.9; G.veh.vz *= 0.9; } }
}
function stepSim(dt) {
  const v = G.veh, inp = G.foot || G.arrest || G.dead || (G.storyC && G.storyC.cine) ? PARK : readInput(dt);
  v.step(dt, inp); footStep(dt); arrestStep(dt); const tg = G.foot ? footProxy : v;
  lawStep(dt, tg);
  for (const ev of G.crowd.update(dt, tg)) onHit(ev);
  { if (G.police.active) G.lastStars = G.police.stars; const res = G.police.update(dt, tg); if (res) policeResult(res); policeBump(v); }
  // soft collisions with ambient traffic
  const np = G.scene.npcPos;
  for (let i = 0; i < np.length; i++) {
    const n = np[i], dx = v.x - n.x, dz = v.z - n.z; if (dx * dx + dz * dz > 400) continue;
    const rr = (n.type === 'bus' ? 4.6 : n.type === 'lorry' ? 4.2 : 2.3) + v.spec.wid * 0.5 + 0.8, d = Math.hypot(dx, dz);
    if (d < rr && d > 0.01) {
      const nx = dx / d, nz = dz / d, vn = v.vx * nx + v.vz * nz;
      v.x += nx * (rr - d); v.z += nz * (rr - d);
      if (vn < 0) { v.vx -= 1.3 * vn * nx; v.vz -= 1.3 * vn * nz; v.vx *= 0.9; v.vz *= 0.9; v.impact = Math.max(v.impact, -vn); }
    }
  }
  if (v.impact > 3) { G.shake = Math.min(1.2, G.shake + v.impact * 0.05); G.audio.crash(v.impact); if (v.impact > 9) { $('flash').style.opacity = Math.min(1, v.impact / 22); setTimeout(() => { $('flash').style.opacity = 0; }, 180); } }
  v.impact = 0;
  if (v.needsRespawn) { toast('You were towed out of the water'); v.respawnOnRoad(); G.camYaw = v.h; }
  updateJob(dt);
  // refuelling
  const st = stationNear(); G.atStation = st;
  if (st && v.speed < 3 && (G.keys.KeyF || G.touch.fuel) && v.fuel < v.spec.tank && !modalOpen() && !typing()) {
    let l = Math.min(v.spec.tank - v.fuel, 14 * dt); const cost = l * FUEL_PRICE;
    if (cost > G.money) l = Math.max(0, G.money / FUEL_PRICE);
    if (l > 0) { v.fuel += l; G.money -= l * FUEL_PRICE; } else toast('Not enough money for fuel');
  }
}

function poseOf(alpha, out) {
  const v = G.veh, p = v.prev; out.x = p.x + (v.x - p.x) * alpha; out.z = p.z + (v.z - p.z) * alpha; out.y = p.y + (v.y - p.y) * alpha;
  out.h = lerpAngle(p.h, v.h, alpha); out.pitch = p.pitch + (v.pitch - p.pitch) * alpha; out.roll = p.roll + (v.roll - p.roll) * alpha; out.steer = p.steer + (v.steerAngle - p.steer) * alpha; return out;
}

function updateCamera(dt, pose) {
  const cam = G.scene.camera, v = G.veh, cfg = CAM[v.type] || CAM.car, now = performance.now();
  if (G.storyC && G.storyC.cine) return;
  G.shake *= Math.exp(-6 * dt);
  const me = G.scene.models.get('me'); if (me) me.group.visible = G.camMode !== 2;
  if (G.foot) { const f = G.foot, yaw = G.camYaw + G.orbit, d = 4.6 * G.zoom, tx = f.x - Math.sin(yaw) * d, tz = f.z - Math.cos(yaw) * d, ty = f.y + 2.2 + G.orbitY * 0.5; G.aimYaw = yaw; const k = 1 - Math.exp(-14 * dt);
    if (!G.camInit) cam.position.set(tx, ty, tz); cam.position.x += (tx - cam.position.x) * k; cam.position.y += (ty - cam.position.y) * k; cam.position.z += (tz - cam.position.z) * k;
    cam.position.y = Math.max(cam.position.y, G.world.heightAt(cam.position.x, cam.position.z) + 0.6); cam.lookAt(f.x, f.y + 1.4 - G.orbitY * 0.15, f.z); return; }
  let px, py, pz, lx, ly, lz;
  if (G.camMode === 2) { // driver's seat (India: right-hand drive => local -x)
    const e = cfg.eye, s = Math.sin(pose.h), c = Math.cos(pose.h);
    px = pose.x + e[0] * c + e[2] * s; pz = pose.z + (-e[0] * s) + e[2] * c; py = pose.y + e[1];
    lx = px + s * 30; lz = pz + c * 30; ly = py + Math.tan(pose.pitch) * 30 * 0.8; G.camYaw = pose.h;
  } else {
    let target = pose.h; if (v.speed > 4 && v.u > 0) target = lerpAngle(pose.h, Math.atan2(v.vx, v.vz), 0.3);
    G.camYaw = lerpAngle(G.camYaw, target, 1 - Math.exp(-3.4 * dt));
    if (!G.looking && now - (G.lastDrag || 0) > 4500 && v.speed > 3) { G.orbit -= Math.round(G.orbit / 6.2832) * 6.2832; G.orbit *= Math.exp(-2.4 * dt); G.orbitY *= Math.exp(-2 * dt); }
    const yaw = G.camYaw + G.orbit; G.aimYaw = yaw; G.aimPitch = clamp(-G.orbitY * 0.05, -0.3, 0.6); const mul = (G.camMode === 1 ? 1.7 : 1) * G.zoom, dist = cfg.dist * mul;
    const tx = pose.x - Math.sin(yaw) * dist, tz = pose.z - Math.cos(yaw) * dist, ty = pose.y + cfg.h * mul * 0.9 + G.orbitY;
    if (!G.camInit || v.teleported) { px = tx; py = ty; pz = tz; G.camInit = true; } else { const k = 1 - Math.exp(-11 * dt); px = cam.position.x + (tx - cam.position.x) * k; py = cam.position.y + (ty - cam.position.y) * k; pz = cam.position.z + (tz - cam.position.z) * k; }
    py = Math.max(py, G.world.heightAt(px, pz) + 1.4);
    lx = pose.x + Math.sin(yaw) * cfg.look; lz = pose.z + Math.cos(yaw) * cfg.look; ly = pose.y + cfg.lookH - G.orbitY * 0.35;
  }
  if (G.shake > 0.01) { px += (Math.random() - 0.5) * G.shake; py += (Math.random() - 0.5) * G.shake; pz += (Math.random() - 0.5) * G.shake; }
  cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz);
  const fov = 62 + clamp(v.speed, 0, 45) * 0.38 + (G.camMode === 2 ? 6 : 0);
  if (Math.abs(cam.fov - fov) > 0.25) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
}

function updateRemotes() {
  const net = G.net, w = G.world; if (!net) return;
  const sc = G.scene, me = G.veh;
  for (const [id, r] of net.remotes) {
    const s = net.sample(r, G.tmp.rs || (G.tmp.rs = {})); if (!s) continue;
    const spec = SPECS[r.veh] || SPECS.car, hl = spec.wheelbase / 2, sn = Math.sin(s.h), cs = Math.cos(s.h);
    const fy = w.heightAt(s.x + sn * hl, s.z + cs * hl), by = w.heightAt(s.x - sn * hl, s.z - cs * hl);
    if (s.f & FLAG.FOOT) { sc.removeModel('r' + id); r.ph = (r.ph || 0) + 0.1 * (1 + Math.abs(s.v)); const cm = G.storyC && G.storyC.cine; const rl = G.net.story && G.net.story.roles && G.net.story.roles[id], R = rl && ROLES[rl]; G.chars.set('r' + id, { x: s.x, y: w.heightAt(s.x, s.z), z: s.z, h: s.h, phase: r.ph, moving: Math.min(1.3, Math.abs(s.v) / 4.8), color: R ? R.shirt : r.color, pants: R ? R.pants : '#2c3e50', crouch: (s.f & 256) ? 0.6 : 0, gun: !!(s.f & 512), aim: !!(s.f & 512), flash: !!(s.f & FLAG.GUN), air: !!(s.f & FLAG.AIR), vis: !cm && !(s.f & FLAG.PASS) }); updateTag(id, r, s, w.heightAt(s.x, s.z) + 2.2, Math.hypot(s.x - me.x, s.z - me.z)); continue; }
    G.chars.remove('r' + id);
    const m = sc.model('r' + id, r.veh, r.color);
    sc.placeModel(m, { x: s.x, z: s.z, y: (fy + by) / 2, h: s.h, pitch: Math.atan((fy - by) / spec.wheelbase), roll: 0, steer: s.st * spec.maxSteer, brake: s.f & FLAG.BRAKE, lights: s.f & FLAG.LIGHTS, reverse: s.f & FLAG.REVERSE, signed: s.v });
    const d = Math.hypot(s.x - me.x, s.z - me.z);
    if (s.f & FLAG.HORN) { if (!r.horn) { r.horn = true; if (d < 400) G.audio.horn(r.veh, 0.18 * clamp(1 - d / 400, 0.05, 1)); } } else r.horn = false;
    updateTag(id, r, s, (fy + by) / 2 + spec.wid + 1.6, d);
  }
}
function updateTag(id, r, s, y, d) {
  let el = G.tags.get(id);
  if (!el) { el = document.createElement('div'); el.className = 'tag'; $('tags').appendChild(el); G.tags.set(id, el); el._name = ''; }
  if (d > 320) { el.style.display = 'none'; return; }
  const p = G.scene.toScreen(s.x, y, s.z, G.tmp.sp || (G.tmp.sp = {}));
  if (!p.visible) { el.style.display = 'none'; return; }
  const chat = performance.now() - r.chatAt < 6000 ? r.chat : '';
  const sp = G.voice && typeof id === 'number' && G.voice.speaking(id) ? '🔊 ' : ''; if (el._name !== sp + r.name + '|' + chat) { el._name = sp + r.name + '|' + chat; el.innerHTML = (chat ? `<small>${esc(chat)}</small>` : '') + sp + esc(r.name); }
  el.style.display = 'block'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.opacity = String(clamp(1.5 - d / 250, 0.35, 1));
}
function dropTag(id) { const el = G.tags.get(id); if (el) el.remove(); G.tags.delete(id); }
function clearTags() { for (const el of G.tags.values()) el.remove(); G.tags.clear(); }

function updateHud(dt, info, serverSec) {
  const v = G.veh, kmh = Math.round(Math.abs(v.u) * 3.6);
  $('speed').textContent = kmh; $('gear').textContent = v.reversing || v.u < -0.5 ? 'R' : kmh < 1 ? 'N' : String(v.gear);
  const f = clamp(v.fuel / v.spec.tank, 0, 1); $('fuelBar').style.width = '100%'; $('fuelBar').style.clipPath = `inset(0 ${100 - f * 100}% 0 0)`;
  $('fuelTxt').textContent = `FUEL ${Math.round(v.fuel)} / ${v.spec.tank} L`; $('fuelTxt').parentElement.classList.toggle('low', f < 0.15);
  $('money').textContent = rs(G.money); $('rank').textContent = rankFor(G.earned);
  const tod = todOf(serverSec + (G.dayShift || 0)) * 24, hh = Math.floor(tod), mm = Math.floor((tod - hh) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ·  ${v.surf === SURF.ROAD || v.surf === SURF.STREET ? 'road' : v.surf === SURF.WATER ? 'water!' : 'off-road'}`;
  const { city, dist } = nearestCityInfo(), nr = G.world.nearestRoad(v.x, v.z), onRoad = nr && nr.d < nr.halfW + 3 ? nr.road.ref : '';
  $('where').textContent = dist < city.R ? `${city.name}${city.te ? ' · ' + city.te : ''}` : `${(dist * 0.001).toFixed(1)} km from ${city.name}${onRoad ? ' · ' + onRoad : ''}`;
  { const wp = G.wp, box = $('wpBox'); box.hidden = !wp; if (wp) { const P2 = G.foot || v, hd = G.foot ? G.camYaw + G.orbit : v.h, d = Math.hypot(wp.x - P2.x, wp.z - P2.z); if (d < 25 && !G.wpStory) { setWaypoint(null); toast('You have arrived!', 2500); } else { $('wpDist').textContent = (wp.label ? wp.label + ' · ' : '') + (d > 1000 ? `${(d * 0.001).toFixed(1)} km` : `${Math.round(d)} m`); $('wpArrow').style.transform = `rotate(${-(Math.atan2(wp.x - P2.x, wp.z - P2.z) - hd) * 57.2958}deg)`; } }
    const pol = G.police.active; $('wanted').hidden = !pol; if (pol) { const c = G.police.car, st = G.police.stars; $('stars').innerHTML = '★'.repeat(st) + '<span class="off">' + '★'.repeat(5 - st) + '</span>'; $('stars').classList.toggle('flash', G.police.close > 0.3); $('wantedTxt').textContent = c ? `${G.police.units.length} unit(s) · ${G.police.lv.name} · ${Math.round(Math.hypot(c.x - v.x, c.z - v.z))} m` : ''; } }
  const r = G.runner; $('jobPanel').hidden = !r; $('arrowBox').hidden = !r;
  if (r) {
    const t = r.target, d = Math.hypot(t.x - v.x, t.z - v.z), ang = Math.atan2(t.x - v.x, t.z - v.z) - v.h;
    $('jobTitle').textContent = r.job.title; $('jobStep').textContent = `${t.label} → ${t.city.name} (${r.index + 1}/${r.job.stops.length})`;
    $('jobDist').textContent = d > 1000 ? `${(d * 0.001).toFixed(1)} km` : `${Math.round(d)} m`; const tl = Math.max(0, Math.ceil(r.timeLeft));
    $('jobTime').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}${r.timeLeft < 0 ? ' late' : ''}`; $('arrow').style.transform = `rotate(${-ang * 57.2958}deg)`;
  }
  const pr = $('prompt'), st = G.atStation; if (G.touch.enabled) $('fuelBtn').style.display = st && v.speed < 3 ? 'block' : 'none';
  if (st && v.speed < 3) { pr.hidden = false; pr.textContent = v.fuel >= v.spec.tank - 0.2 ? 'Tank full' : (G.touch.enabled ? `Hold FUEL to refuel  (${rs(FUEL_PRICE)}/L)` : `Hold F to refuel  (${rs(FUEL_PRICE)}/L)`); }
  else if (v.fuel <= 0.2) { pr.hidden = false; pr.textContent = 'Out of fuel! Press R to reset to road'; }
  else pr.hidden = true;
  $('hpBar').style.width = G.hp + '%'; $('hpTxt').textContent = Math.round(G.hp); $('arBar').style.width = '0%'; $('weapon').textContent = G.foot ? 'PISTOL' : 'ROOF GUN';
  { const ep = $('enterPrompt'), eb = $('enterBtn'); let n = null, rc = null; if (G.foot && !G.foot.anim && !G.dead && !G.ride) { n = G.lot.nearest(G.foot.x, G.foot.z); if (!n) rc = rideCandidate(); } ep.hidden = !n && !rc && !G.ride; if (n) ep.textContent = `${G.touch.enabled ? 'Tap ENTER' : 'Press E'} to get into the ${SPECS[n.e.type].label}`; else if (rc) ep.textContent = `${G.touch.enabled ? 'Tap ENTER' : 'Press E'} to ride with ${rc.r.name}`; else if (G.ride) ep.textContent = 'Riding - press E to get off'; eb.hidden = !(n || rc || G.ride) || !G.touch.enabled; }
  if (G.storyC) { G.storyC.hud(); const L = G.law.lastRadio; if (L && G.lastRadioT !== L.t) { G.lastRadioT = L.t; showRadio(L.text); } }
  if (!$('players').hidden) renderPlayers();
}

/* ------------------------------------------------------------ main loop */
function frame(now) {
  requestAnimationFrame(frame);
  if (!G.running) return;
  const dt = Math.min(0.1, (now - G.lastT) / 1000); G.lastT = now;
  G.fpsAcc += dt; G.fpsN++; if (G.fpsAcc > 3) { G.fps = G.fpsN / G.fpsAcc; G.fpsAcc = 0; G.fpsN = 0; autoQuality(); }
  if (!G.paused) { G.acc += dt; let n = 0; while (G.acc >= FIXED_DT && n < MAX_STEPS) { stepSim(FIXED_DT); G.acc -= FIXED_DT; n++; } if (n === MAX_STEPS) G.acc = 0; }
  const v = G.veh, pose = poseOf(clamp(G.acc / FIXED_DT, 0, 1), G.tmp.pose || (G.tmp.pose = {}));
  const serverSec = (G.net ? G.net.now() : Date.now()) / 1000, tod = todOf(serverSec + (G.dayShift || 0));
  const info = G.scene.update(dt, { x: pose.x, y: pose.y, z: pose.z }, tod, serverSec);
  G.scene.updateChunks(pose.x, pose.z, 1);
  const lightsOn = G.lights === 'on' || (G.lights === 'auto' && info.night);
  let me = null; if (!G.foot) { me = G.scene.model('me', v.type, G.vcolor); G.scene.placeModel(me, { ...pose, brake: v.brakeLit, lights: lightsOn, reverse: v.reversing, ax: v.ax, ay: v.ay, signed: v.u }); }
  G.scene.setHeadlight(lightsOn && info.night, { x: pose.x, y: pose.y, z: pose.z, h: pose.h }, v.spec);
  G.scene.updatePeds(G.crowd.list);
  { const live = new Set(); if (G.police.active) for (const P of G.police.cars) { const c = P.car; live.add(P.id); const pm = G.scene.model(P.id, P.swat ? 'bus' : 'car', P.swat ? '#111827' : '#1d3a8a'); G.scene.placeModel(pm, { x: c.x, z: c.z, y: c.y || 0, h: c.h, pitch: c.pitch || 0, roll: c.roll || 0, steer: c.steerAngle || 0, brake: c.brakeLit, lights: true, reverse: c.reversing, signed: c.u }); pm.group.rotation.z += P.hp <= 0 ? 0.5 : 0; }
    for (const k of [...G.scene.models.keys()]) if (k.startsWith('pol') && !live.has(k)) G.scene.removeModel(k);
    if (G.police.active && (G.sirenT = (G.sirenT || 0) - dt) < 0) { G.sirenT = 0.9; G.audio.chime(); } }
  if (me && !G.dead) gunFrame(dt, me, pose, v); else G.scene.tickFx(dt);
  renderWorldExtras(dt, pose);
  { const ab = $('actBtn'), fb = document.querySelector('.fire'), foot = !!G.foot; if (G.lastFoot !== foot) setFootMode(foot); if (ab && G.lastFoot !== foot) { G.lastFoot = foot; ab.innerHTML = foot ? '🚗<br>ENTER' : '🚪<br>EXIT'; if (fb) fb.innerHTML = foot ? '⬆<br>JUMP' : '🔫<br>FIRE'; } }
  updateRemotes(); updateCamera(dt, pose); G.scene.render();
  const flags = (v.brakeLit ? FLAG.BRAKE : 0) | (lightsOn ? FLAG.LIGHTS : 0) | (G.keys.KeyH ? FLAG.HORN : 0) | (v.reversing ? FLAG.REVERSE : 0);
  if (G.net) { if (G.foot) { const f = G.foot; G.net.sendState({ x: f.x, z: f.z, h: f.h, u: f.speed || 0, steerAngle: 0, spec: { maxSteer: 1 }, teleported: false }, FLAG.FOOT | (f.speed > 4.5 ? FLAG.RUN : 0) | (f.lift > 0.15 ? FLAG.AIR : 0) | (G.shotFlash > 0 ? FLAG.GUN : 0) | (f.anim ? 256 : 0) | (f.shotT > 0 ? 512 : 0) | (G.ride ? FLAG.PASS : 0)); } else G.net.sendState(v, flags); }
  G.audio.update(v.rpm, G.paused ? 0 : Math.max(0, G.keys.KeyW || G.keys.ArrowUp || G.touch.gas ? 1 : 0), v.skid * (v.speed > 3 ? 1 : 0), v.type);
  if ((G.hudT += dt) > 0.066) { G.hudT = 0; updateHud(dt, info, serverSec); }
  if ((G.minimapT += dt) > 0.1) { G.minimapT = 0; const c = $('minimap'); const me2 = G.foot || v; G.map.draw(c.getContext('2d'), c.width, c.height, { full: false, theme: 'gta3', rotateH: G.foot ? G.camYaw + G.orbit : v.h, cx: me2.x, cz: me2.z, radius: G.miniR || 650, me: me2, target: G.runner && G.runner.target, wp: G.wp, players: remotePins(), blips: allBlips() }); if (!$('bigmap').hidden) drawBigMap(); }
  if ((G.saveT += dt) > 6) { G.saveT = 0; persist(); } if ((G.moneyT += dt) > 5) { G.moneyT = 0; if (G.net) G.net.sendMoney(G.earned); }
}
function autoQuality() {
  const order = ['high', 'medium', 'low'], cur = G.scene.qName;
  if (G.fps < 28 && cur !== 'low' && !G.paused) { const n = order[order.indexOf(cur) + 1]; G.scene.setQuality(n); $('quality').value = n; toast('Low frame rate: graphics set to ' + n, 2500); }
}

/* ------------------------------------------------ story / law glue */
let radioTimer = 0, callTimer = 0;
function showRadio(text) { const r = $('radio'); $('radioTxt').textContent = text; r.hidden = false; clearTimeout(radioTimer); radioTimer = setTimeout(() => { r.hidden = true; }, 6000); G.audio.chime && G.audio.chime(); }
const H = {
  toast: (m, ms) => toast(m, ms),
  radio: text => { if (text) { G.law.radio(text); } },
  call: (who, text) => { const N = NPCS[who] || ROLES[who] || { name: who, emoji: '📞' }; $('callBox').hidden = false; $('callAva').textContent = N.emoji || '📞'; $('callWho').textContent = N.name || who; $('callTxt').textContent = text; clearTimeout(callTimer); callTimer = setTimeout(() => { $('callBox').hidden = true; }, 7000); },
  startStory: async () => { if (!G.running) { await startGame(); } G.storyC.openLobby(); },
  stageTeam: A => {   // regroup everyone around the cutscene location
    const roles = G.net && G.net.story ? G.net.story.roles : {}, myRole = G.storyC.myRole, i = Math.max(0, ['mastermind', 'driver', 'hacker', 'insider'].indexOf(myRole));
    const P = G.foot || G.veh; if (Math.hypot(P.x - A.x, P.z - A.z) > 60) { if (!G.foot) exitVehicle(true); const a = i * 1.57, x = A.x + Math.cos(a) * 3, z = A.z + Math.sin(a) * 3; G.foot.anim = null; G.foot.x = x; G.foot.z = z; G.foot.y = G.world.heightAt(x, z); G.veh.x = x + 4; G.veh.z = z + 4; G.lot.dyn.forEach(e => { if (e.id === G.myPark) { e.x = x + 5; e.z = z + 5; } }); G.camInit = false; }
    else if (!G.foot) exitVehicle(true);
    G.scene.updateChunks(A.x, A.z, 60); G.joy && G.joy.release();
  },
};
function onEv(k, d, from) { if (k === 'rtc') { G.voice && G.voice.onSignal(d, from); return; } G.storyC.onEv(k, d, from); }
G_expose();
function G_expose() { G.setStars = setStars; G.hurt = hurt; G.lawChase = () => G.law.chasers() > 0; G.arrestBusy = () => !!(G.arrest || G.dead); }
function allBlips(full) {
  const out = []; for (const st of G.law.stations) out.push({ x: st.x, z: st.z, color: '#3b6fe0', r: 5, glyph: 'P', gcolor: '#fff', label: full ? st.name : '' });
  for (const s of G.world.stations || []) if (full) out.push({ x: s.x, z: s.z, color: '#d63031', r: 3 });
  if (G.storyC) out.push(...G.storyC.blips());
  if (G.aiList) out.push(...G.aiList);
  if (G.police.active) for (const P of G.police.cars) if (P.hp > 0 && !P.block) out.push({ x: P.car.x, z: P.car.z, color: (performance.now() / 300 | 0) % 2 ? '#e74c3c' : '#3b6fe0', r: 3.5 });
  for (const o of G.law.officers) if (o.state === 'chase' && o.hp > 0) out.push({ x: o.x, z: o.z, color: '#6aa0ff', r: 3 });
  return out;
}
let stMeshes = new Map();
function stationMesh(st) {
  const T = G.T, g = new T.Group(), mat = c => new T.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const body = new T.Mesh(new T.BoxGeometry(18, 5, 12.4), mat(0xe9edf2)); body.position.y = 2.5; g.add(body);
  const band = new T.Mesh(new T.BoxGeometry(18.2, 0.9, 12.6), mat(0x1d3a8a)); band.position.y = 4.4; g.add(band);
  const roof = new T.Mesh(new T.BoxGeometry(18.8, 0.4, 13), mat(0x2a2f3a)); roof.position.y = 5.2; g.add(roof);
  const sign = G.scene._canvasTex(256, 96, (x, w, h) => { x.fillStyle = '#1d3a8a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = 'bold 54px system-ui'; x.textAlign = 'center'; x.fillText('POLICE', w / 2, 66); }); sign.wrapS = sign.wrapT = T.ClampToEdgeWrapping;
  const board = new T.Mesh(new T.PlaneGeometry(7, 2.6), new T.MeshBasicMaterial({ map: sign })); board.position.set(0, 3.2, 6.25); g.add(board);
  const door = new T.Mesh(new T.BoxGeometry(2.2, 3, 0.2), mat(0x35527a)); door.position.set(0, 1.5, 6.25); g.add(door);
  const l1 = new T.Mesh(new T.BoxGeometry(0.8, 0.5, 0.5), new T.MeshBasicMaterial({ color: 0xff2020 })), l2 = new T.Mesh(new T.BoxGeometry(0.8, 0.5, 0.5), new T.MeshBasicMaterial({ color: 0x2040ff })); l1.position.set(-0.5, 5.6, 0); l2.position.set(0.5, 5.6, 0); g.add(l1, l2);
  g.position.set(st.x, G.world.heightAt(st.x, st.z), st.z); g.rotation.y = st.th; G.scene.scene.add(g); return { g, l1, l2 };
}
function renderWorldExtras(dt, pose) {
  const sc = G.scene, C = G.chars, S = G.storyC, cine = S && S.cine, w = G.world; const fx = G.foot ? G.foot.x : pose.x, fz = G.foot ? G.foot.z : pose.z, t = performance.now() / 1000;
  S.update(dt); updateAI(dt);
  G.lot.render(sc, fx, fz);
  // stations
  for (const st of G.law.stations) { const near = Math.hypot(st.x - fx, st.z - fz) < 450, o = stMeshes.get(st.id); if (near && !o) stMeshes.set(st.id, stationMesh(st)); else if (!near && o) { sc.scene.remove(o.g); stMeshes.delete(st.id); } else if (o) { const on = (t * 3 | 0) % 2; o.l1.visible = !!on; o.l2.visible = !on; } }
  // local character
  if (G.foot) { const f = G.foot, role = S.myRole && ROLES[S.myRole]; C.set('me', { x: f.x, y: f.y, z: f.z, h: f.h, s: f.s, phase: f.phase, moving: f.moving, air: f.lift > 0.15, crouch: f.crouch, color: role ? role.shirt : G.profile.color, pants: role ? role.pants : '#2c3e50', gun: f.shotT > 0 || !!G.dead, aim: f.shotT > 0, flash: G.shotFlash > 0, dead: G.dead ? Math.min(1, G.dead.t = (G.dead.t || 0) + dt * 2) : 0, vis: !cine }); } else C.remove('me');
  G.shotFlash = Math.max(0, (G.shotFlash || 0) - dt);
  // officers + roaming patrols
  for (const o of G.law.officers) { if (Math.hypot(o.x - fx, o.z - fz) > 260) { C.remove('cop' + o.id); continue; } C.set('cop' + o.id, { x: o.x, y: w.heightAt(o.x, o.z), z: o.z, h: o.h, phase: o.phase, moving: o.moving, color: o.swat ? '#15171c' : '#2c4a8c', pants: o.swat ? '#15171c' : '#1b2a52', hat: o.swat ? 'helmet' : 'cap', gun: o.state === 'chase', aim: o.state === 'chase' && o.firing > 0, flash: o.firing > 0.05, dead: o.hp <= 0 ? 1 : 0, s: o.swat ? 1.1 : 1 }); }
  C.sweep('cop');
  const live = new Set(); for (const r of G.law.roamers) { const key = 'lw' + r.id; live.add(key); const m = sc.model(key, r.type, r.type === 'bike' ? '#1d3a8a' : '#1d3a8a'); sc.placeModel(m, { x: r.x, z: r.z, y: r.y, h: r.h, pitch: 0, roll: 0, steer: 0, lights: true, signed: r.u }); }
  for (const k of [...sc.models.keys()]) if (k.startsWith('lw') && !live.has(k)) sc.removeModel(k);
  // gang members
  if (S.gang.length) { for (const g of S.gang) { const L = S.look(g); C.set('g' + g.id, { x: g.x, y: w.heightAt(g.x, g.z), z: g.z, h: g.h, phase: g.phase, moving: g.mv, color: L.color, pants: L.pants, hat: L.hat, gun: true, aim: g.fire > 0, dead: g.hp <= 0 ? 1 : 0, s: g.kind === 'boss' ? 1.25 : 1 }); g.fire = Math.max(0, (g.fire || 0) - dt); } }
  C.sweep('g'); 
  // cutscene actors
  if (cine && S.cine.shotActors) { const sh = S.cine.shotActors, A = S.cine.A; (sh.actors || []).forEach(a => { const R = ROLES[a.id] || NPCS[a.id]; if (!R) return; const x = A.x + a.at[0], z = A.z + a.at[1]; C.set('cs_' + a.id, { x, y: w.heightAt(x, z), z, h: Math.atan2(-a.at[0] + (Math.random() * 0), -a.at[1]) + 0, color: R.shirt, pants: R.pants, hat: R.hat, s: R.s || 1, phase: t * 2, moving: 0 }); }); (sh.props || []).forEach((p, i) => { const m = sc.model('csp' + i, 'car', p.color); sc.placeModel(m, { x: A.x + p.at[0], z: A.z + p.at[1], y: w.heightAt(A.x + p.at[0], A.z + p.at[1]), h: p.h, pitch: 0, roll: 0, steer: 0, lights: !!p.bar }); }); }
  C.sweep('cs_'); if (!cine) for (const k of [...sc.models.keys()]) if (k.startsWith('csp')) sc.removeModel(k);
  C.tick(dt);
}

/* ------------------------------------------------ fullscreen, mic, team, passenger, AI teammates */
function toggleFs() { const d = document, el = d.documentElement; if (!d.fullscreenElement && !d.webkitFullscreenElement) { const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' }); Promise.resolve(p).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => toast('Full screen is not allowed here. Use browser menu > Add to Home screen.', 3500)); } else (d.exitFullscreen || d.webkitExitFullscreen).call(d); }
$('fsBtn').onclick = toggleFs; if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('fsBtn').style.display = 'none';
document.addEventListener('fullscreenchange', () => { $('fsBtn').innerHTML = document.fullscreenElement ? '&#x2715;' : '&#x26F6;'; G.scene && G.scene.resize(); });
function voiceState(s) { const b = $('micBtn'); const n = G.voice ? G.voice.count() : 0; b.textContent = s === 'on' ? '🎤' + (n ? ' ' + n : ' ON') : s === 'muted' ? '🔇' : '🎤'; b.style.background = s === 'on' ? 'rgba(46,204,113,.5)' : s === 'muted' ? 'rgba(231,76,60,.5)' : ''; if (s === 'denied') toast('Microphone permission denied', 3000); if (s === 'nosupport') toast('Voice chat is not supported in this browser', 3000); if (s === 'on') toast('Voice chat on. Friends who tap the mic can hear you. Tap again to mute.', 3500); }
document.addEventListener('pointerdown', () => G.voice && G.voice.resume());
function toggleMic() { if (!G.net || G.net.status !== 'online') { toast('Voice chat needs the online server (same room code as your friends)', 3000); return; } G.voice.toggle(); }
function teamJump() {
  if (!G.net || G.net.status !== 'online' || !G.net.remotes.size) { toast('No friends in this room yet. Share your room code.', 2500); return; }
  const P = G.foot || G.veh; let best = null, bd = 1e18;
  for (const r of G.net.remotes.values()) { const s = G.net.sample(r, {}); if (!s) continue; const d = (s.x - P.x) ** 2 + (s.z - P.z) ** 2; if (d < bd) { bd = d; best = { r, s }; } }
  if (!best) return; const s = best.s;
  if (G.foot && !G.foot.anim) { G.foot.x = s.x + 2; G.foot.z = s.z + 1; G.foot.y = G.world.heightAt(G.foot.x, G.foot.z); }
  else if (!G.foot) { G.veh.reset(s.x - Math.sin(s.h) * 9, s.z - Math.cos(s.h) * 9, s.h); G.camYaw = s.h; }
  G.camInit = false; toast('Joined ' + best.r.name, 1800);
}
function rideCandidate() {
  if (!G.foot || G.foot.anim || G.ride || !G.net || G.net.status !== 'online') return null;
  for (const [id, r] of G.net.remotes) { const s = r.snaps[r.snaps.length - 1]; if (!s || (s.f & FLAG.FOOT)) continue; const sp = SPECS[r.veh] || SPECS.car; if (distToVehicle(G.foot.x, G.foot.z, s.x, s.z, s.h, sp) < 4.5) return { id, r }; }
  return null;
}
function startRide(c) { G.ride = { id: c.id }; G.foot.moving = 0; toast('Riding with ' + c.r.name + '. Press E / EXIT to get off', 2500); }
function rideStep(dt) {
  const f = G.foot, r = G.net && G.net.remotes.get(G.ride.id), s = r && G.net.sample(r, G.tmp.ride || (G.tmp.ride = {}));
  if (!s || (r.snaps[r.snaps.length - 1].f & FLAG.FOOT)) { endRide(); return; }
  f.x = s.x; f.z = s.z; f.y = G.world.heightAt(s.x, s.z) + 0.8; f.h = s.h; f.moving = 0; f.speed = 0; G.camYaw = lerpAngle(G.camYaw, s.h, 1 - Math.exp(-3 * dt));
}
function endRide() { if (!G.ride) return; const f = G.foot; f.x += Math.cos(f.h) * 2.6; f.z -= Math.sin(f.h) * 2.6; f.y = G.world.heightAt(f.x, f.z); G.ride = null; toast('Got off', 1200); }
const AI_ORDER = ['mastermind', 'driver', 'hacker', 'insider'];
function updateAI(dt) {
  const S = G.storyC, st = S.state, out = [];
  if (!st || !st.on || (S.cine)) { G.aiList = out; G.chars.sweep('ai_'); return; }
  const held = new Set(Object.values(st.roles || {})), P = G.foot || G.veh, w = G.world; G.ai = G.ai || {};
  AI_ORDER.forEach((role, i) => {
    if (held.has(role)) { delete G.ai[role]; return; }
    let a = G.ai[role]; const slot = (i + 1) * 1.7, tx = P.x + Math.cos(slot) * 3.2, tz = P.z + Math.sin(slot) * 3.2;
    if (!a) a = G.ai[role] = { x: tx, z: tz, h: 0, phase: 0, moving: 0, riding: false };
    if (!G.foot) { a.riding = true; a.x = P.x; a.z = P.z; return; }      // they ride in your vehicle
    if (a.riding) { a.riding = false; a.x = tx; a.z = tz; }
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz); if (d > 45) { a.x = tx; a.z = tz; }
    let spd = d > 2 ? Math.min(7, 1.5 + d * 0.9) : 0; if (spd > 0) { const aim = Math.atan2(dx, dz); for (const off of [0, 0.7, -0.7, 1.4, -1.4]) { const q = aim + off, nx = a.x + Math.sin(q) * (spd * dt + 0.4), nz = a.z + Math.cos(q) * (spd * dt + 0.4); if (!G.law._blocked(nx, nz)) { a.x += Math.sin(q) * spd * dt; a.z += Math.cos(q) * spd * dt; a.h += Math.atan2(Math.sin(q - a.h), Math.cos(q - a.h)) * Math.min(1, dt * 9); break; } } } else a.h += Math.atan2(Math.sin(Math.atan2(P.x - a.x, P.z - a.z) - a.h), Math.cos(Math.atan2(P.x - a.x, P.z - a.z) - a.h)) * Math.min(1, dt * 4);
    a.moving += ((spd > 0 ? Math.min(1.3, spd / 4.8) : 0) - a.moving) * Math.min(1, dt * 8); a.phase += dt * (spd > 4 ? 12 : 8) * (spd > 0 ? 1 : 0);
    const R = ROLES[role]; G.chars.set('ai_' + role, { x: a.x, y: w.heightAt(a.x, a.z), z: a.z, h: a.h, phase: a.phase, moving: a.moving, color: R.shirt, pants: R.pants }); out.push({ x: a.x, z: a.z, color: R.color, r: 3.5 });
    updateTag('ai_' + role, { name: R.emoji + ' ' + R.short + ' (AI)', chat: '', chatAt: 0 }, a, w.heightAt(a.x, a.z) + 2.2, Math.hypot(a.x - P.x, a.z - P.z));
  });
  G.aiList = out; G.chars.sweep('ai_');
  for (const role of AI_ORDER) if (held.has(role) || !G.ai[role] || G.ai[role].riding) dropTag('ai_' + role);
}

boot();
