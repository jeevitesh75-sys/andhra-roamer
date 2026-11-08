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
    G.money = G.save.money || 0; G.earned = G.save.earned || 0;
    initInput(); initHud();
  } else { G.veh.setType(prof.veh); G.scene.removeModel('me'); }
  const c = G.world.cityByName.get(prof.city) || G.world.cities.find(h => h.tier === 2) || G.world.cities[0];
  const sp = c.spawn || c.dropPoints[0] || { x: c.x, z: c.z, h: 0 }, dp = sp;
  G.veh.setType(prof.veh); G.veh.reset(sp.x, sp.z, sp.h);
  G.camYaw = G.veh.h; G.orbit = 0; G.runner = null; G.scene.setBeacon(null);
  // initial terrain ring, a few chunks per frame so the progress bar moves
  let left = 1; while (left > 0) { left = G.scene.updateChunks(dp.x, dp.z, 4); progress('Rendering the world...', 0.5 + 0.5 * (1 - Math.min(1, left / 60))); await nextFrame(); }
  G.scene.model('me', prof.veh, prof.color);
  $('loading').hidden = true; $('hud').hidden = false;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { $('touch').hidden = false; G.touch.enabled = true; $('hud').classList.add('is-touch'); }
  G.swatches($('garColors'), c2 => { G.profile.color = c2; applyVehicleChange(); });
  G.vehBtns($('garVeh'), v => { G.profile.veh = v; applyVehicleChange(); });
  persist();
  // network
  if (!G.net) G.net = new Net({ onStatus: onNetStatus, onChat: m => addChat(m.name, m.text), onJoin: r => { toast(r.name + ' joined'); }, onLeave: r => { toast(r.name + ' left'); G.scene.removeModel('r' + r.id); dropTag(r.id); },
    onLeaveAll: () => { for (const k of [...G.scene.models.keys()]) if (k.startsWith('r')) G.scene.removeModel(k); clearTags(); }, onError: m => toast(m, 3500) });
  const url = new URLSearchParams(location.search).get('server') || (window.GAME_CONFIG && window.GAME_CONFIG.SERVER_URL) || '';
  G.net.disconnect();
  if (url) G.net.connect(url, { name: prof.name, veh: prof.veh, color: prof.color, room: prof.region + '-' + (prof.room || 'open') });
  else onNetStatus('offline', 'Offline mode (no server URL set)');
  if (G.dayShift === undefined) G.dayShift = 0.07 * CYCLE_SEC - (G.net ? G.net.now() : Date.now()) / 1000; // every player starts in the morning
  G.running = true; G.paused = false; G.lastT = performance.now(); G.acc = 0;
  if (!G.started) { G.started = true; requestAnimationFrame(frame); }
  toast(`Welcome to ${c.name}! Press J for jobs, M for the map`, 3500);
}

function applyVehicleChange() {
  const p = G.profile; if (p.veh !== G.veh.type) { G.veh.setType(p.veh); G.runner = null; G.scene.setBeacon(null); toast('Switched to ' + SPECS[p.veh].label + ' (refuelled)'); }
  G.scene.model('me', p.veh, p.color); G.net && G.net.sendVehicle(p.veh, p.color); persist();
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
  });
  addEventListener('keyup', e => { G.keys[e.code] = false; if (e.code === 'Tab') $('players').hidden = true; });
  addEventListener('blur', () => { G.keys = {}; });
  let drag = false, lx = 0, ly = 0;
  $('game').addEventListener('mousedown', e => { drag = true; lx = e.clientX; ly = e.clientY; });
  addEventListener('mouseup', () => { drag = false; G.lastDrag = performance.now(); });
  addEventListener('mousemove', e => { if (!drag) return; G.orbit -= (e.clientX - lx) * 0.006; G.orbitY = clamp(G.orbitY + (e.clientY - ly) * 0.02, -1, 5); lx = e.clientX; ly = e.clientY; G.lastDrag = performance.now(); });
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
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.k, on = v => e => { e.preventDefault(); G.touch[k] = v; if (v && k === 'horn') G.audio.horn(G.veh.type); if (v && k === 'jobs') toggleBoard(); if (v && k === 'map') toggleMap(); };
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
function toggleMap() { const open = $('bigmap').hidden; closeModals(); $('bigmap').hidden = !open; if (open) drawBigMap(); }
function toggleGarage() { const open = $('garage').hidden; closeModals(); $('garage').hidden = !open; }
function toggleBoard() { const open = $('board').hidden; closeModals(); if (!open) return; $('board').hidden = false; renderBoard(); }
function drawBigMap() { const c = $('bigcanvas'), M = G.mapV || (G.mapV = { zoom: 1, cx: null, cz: null }); G.map.draw(c.getContext('2d'), c.width, c.height, { full: true, zoom: M.zoom, mcx: M.cx, mcz: M.cz, me: G.veh, wp: G.wp, target: G.runner && G.runner.target, players: remotePins() }); }
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
  if (ev.kind === 'human') { toast('You hit a pedestrian! The police are after you - escape!', 4500); if (!G.police.active && G.police.start(G.veh)) G.sirenT = 0; }
  else { const fine = ev.kind === 'cow' ? 150 : ev.kind === 'goat' ? 80 : 50, paid = Math.min(G.money, fine); G.money -= paid; toast(`You hit a ${ev.kind}! Fine ${rs(paid)}`, 3000); }
}
function policeResult(res) {
  G.scene.removeModel('pol');
  if (res === 'escaped') toast('You escaped the police!', 3500);
  else { const fine = Math.min(G.money, 1500); G.money -= fine; G.veh.vx = G.veh.vz = 0; toast(`Caught by the police! Fine ${rs(fine)}`, 4500); }
}
function setWaypoint(p) { G.wp = p; G.scene.setWaypoint(p); if (p) toast('Pin set - follow the blue arrow', 2000); }

function stepSim(dt) {
  const v = G.veh, inp = readInput(dt);
  v.step(dt, inp);
  for (const ev of G.crowd.update(dt, v)) onHit(ev);
  { const res = G.police.update(dt, v); if (res) policeResult(res); }
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
  const cam = G.scene.camera, v = G.veh, cfg = CAM[v.type], now = performance.now();
  G.shake *= Math.exp(-6 * dt);
  const me = G.scene.models.get('me'); if (me) me.group.visible = G.camMode !== 2;
  let px, py, pz, lx, ly, lz;
  if (G.camMode === 2) { // driver's seat (India: right-hand drive => local -x)
    const e = cfg.eye, s = Math.sin(pose.h), c = Math.cos(pose.h);
    px = pose.x + e[0] * c + e[2] * s; pz = pose.z + (-e[0] * s) + e[2] * c; py = pose.y + e[1];
    lx = px + s * 30; lz = pz + c * 30; ly = py + Math.tan(pose.pitch) * 30 * 0.8; G.camYaw = pose.h;
  } else {
    let target = pose.h; if (v.speed > 4 && v.u > 0) target = lerpAngle(pose.h, Math.atan2(v.vx, v.vz), 0.3);
    G.camYaw = lerpAngle(G.camYaw, target, 1 - Math.exp(-3.4 * dt));
    if (now - (G.lastDrag || 0) > 1600) { G.orbit *= Math.exp(-2.4 * dt); G.orbitY *= Math.exp(-2 * dt); }
    const yaw = G.camYaw + G.orbit, mul = (G.camMode === 1 ? 1.7 : 1) * G.zoom, dist = cfg.dist * mul;
    const tx = pose.x - Math.sin(yaw) * dist, tz = pose.z - Math.cos(yaw) * dist, ty = pose.y + cfg.h * mul * 0.9 + G.orbitY;
    if (!G.camInit || v.teleported) { px = tx; py = ty; pz = tz; G.camInit = true; } else { const k = 1 - Math.exp(-11 * dt); px = cam.position.x + (tx - cam.position.x) * k; py = cam.position.y + (ty - cam.position.y) * k; pz = cam.position.z + (tz - cam.position.z) * k; }
    py = Math.max(py, G.world.heightAt(px, pz) + 1.4);
    lx = pose.x + Math.sin(pose.h) * cfg.look; lz = pose.z + Math.cos(pose.h) * cfg.look; ly = pose.y + cfg.lookH;
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
  if (el._name !== r.name + '|' + chat) { el._name = r.name + '|' + chat; el.innerHTML = (chat ? `<small>${esc(chat)}</small>` : '') + esc(r.name); }
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
  { const wp = G.wp, box = $('wpBox'); box.hidden = !wp; if (wp) { const d = Math.hypot(wp.x - v.x, wp.z - v.z); if (d < 25) { setWaypoint(null); toast('You have arrived!', 2500); } else { $('wpDist').textContent = d > 1000 ? `${(d * 0.001).toFixed(1)} km` : `${Math.round(d)} m`; $('wpArrow').style.transform = `rotate(${-(Math.atan2(wp.x - v.x, wp.z - v.z) - v.h) * 57.2958}deg)`; } }
    const pol = G.police.active; $('wanted').hidden = !pol; if (pol) { const c = G.police.car; $('wantedTxt').textContent = `POLICE CHASE - ${Math.round(Math.hypot(c.x - v.x, c.z - v.z))} m behind. Get away!`; } }
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
  const me = G.scene.model('me', G.profile.veh === v.type ? v.type : v.type, G.profile.color);
  G.scene.placeModel(me, { ...pose, brake: v.brakeLit, lights: lightsOn, reverse: v.reversing, ax: v.ax, ay: v.ay, signed: v.u });
  G.scene.setHeadlight(lightsOn && info.night, { x: pose.x, y: pose.y, z: pose.z, h: pose.h }, v.spec);
  G.scene.updatePeds(G.crowd.list);
  if (G.police.active) { const c = G.police.car, m = G.scene.model('pol', 'car', '#1d3a8a'); G.scene.placeModel(m, { x: c.x, z: c.z, y: c.y || 0, h: c.h, pitch: c.pitch || 0, roll: c.roll || 0, steer: c.steerAngle || 0, brake: c.brakeLit, lights: true, reverse: c.reversing, signed: c.u });
    if ((G.sirenT = (G.sirenT || 0) - dt) < 0) { G.sirenT = 0.9; G.audio.chime(); } } else if (G.scene.models.has('pol')) G.scene.removeModel('pol');
  updateRemotes(); updateCamera(dt, pose); G.scene.render();
  const flags = (v.brakeLit ? FLAG.BRAKE : 0) | (lightsOn ? FLAG.LIGHTS : 0) | (G.keys.KeyH ? FLAG.HORN : 0) | (v.reversing ? FLAG.REVERSE : 0);
  if (G.net) G.net.sendState(v, flags);
  G.audio.update(v.rpm, G.paused ? 0 : Math.max(0, G.keys.KeyW || G.keys.ArrowUp || G.touch.gas ? 1 : 0), v.skid * (v.speed > 3 ? 1 : 0), v.type);
  if ((G.hudT += dt) > 0.066) { G.hudT = 0; updateHud(dt, info, serverSec); }
  if ((G.minimapT += dt) > 0.1) { G.minimapT = 0; const c = $('minimap'); G.map.draw(c.getContext('2d'), c.width, c.height, { full: false, cx: v.x, cz: v.z, radius: G.miniR || 650, me: v, target: G.runner && G.runner.target, wp: G.wp, players: remotePins() }); if (!$('bigmap').hidden) drawBigMap(); }
  if ((G.saveT += dt) > 6) { G.saveT = 0; persist(); } if ((G.moneyT += dt) > 5) { G.moneyT = 0; if (G.net) G.net.sendMoney(G.earned); }
}
function autoQuality() {
  const order = ['high', 'medium', 'low'], cur = G.scene.qName;
  if (G.fps < 28 && cur !== 'low' && !G.paused) { const n = order[order.indexOf(cur) + 1]; G.scene.setQuality(n); $('quality').value = n; toast('Low frame rate: graphics set to ' + n, 2500); }
}

boot();
