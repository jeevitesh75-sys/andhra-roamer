'use strict';
/**
 * Andhra Roamer - multiplayer server (Render free tier friendly).
 * Zero dependencies: a small RFC 6455 WebSocket implementation on top of node:http.
 *
 * Protocol (JSON text frames):
 *  client -> server
 *    {t:'join', name, veh, color, room}      join a room ('public' = auto-assign)
 *    {t:'s', x,z,h,v,st,f}                   my state (position, heading, speed, steer, flags)
 *    {t:'veh', veh, color}                   change vehicle
 *    {t:'chat', text}
 *    {t:'m', m}                              my money (for the leaderboard)
 *    {t:'tp'}                                I teleported / respawned (skip speed check once)
 *    {t:'ping', ts}
 *  server -> client
 *    {t:'welcome', id, room, time, players:[...]}
 *    {t:'join', p:{...}} {t:'leave', id} {t:'veh', id, veh, color}
 *    {t:'snap', time, p:[[id,x,z,h,v,st,f],...]}
 *    {t:'roster', p:[[id,money],...]}
 *    {t:'chat', id, name, text}
 *    {t:'pong', ts} {t:'error', msg}
 */
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const TICK_HZ = 15;
const ROOM_CAP = Number(process.env.ROOM_CAP) || 24;
const MAX_FRAME = 4096;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const VEHICLES = ['car', 'bus', 'lorry'];
const WORLD_MIN = -2000, WORLD_MAX = 130000;
const MAX_SPEED_UNITS = 260; // u/s; anything faster than this between updates is rejected as a teleport

/* ------------------------------------------------------------------ WebSocket */
class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.fragLen = 0;
    this.fragOp = 0;
    this.alive = true;
    this.closed = false;
    this.onmessage = () => {};
    this.onclose = () => {};
    socket.on('data', d => this._data(d));
    // http.Server sockets are allowHalfOpen: a bare FIN (tab crash, network drop) emits 'end' but never 'close'.
    socket.on('end', () => this._closed());
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }
  _closed() {
    if (this.closed) return;
    this.closed = true;
    try { this.socket.destroy(); } catch (e) { /* ignore */ }
    this.onclose();
  }
  _data(d) {
    if (this.closed) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > MAX_FRAME * 4) return this.close(1009);
    while (!this.closed && this._frame()) { /* parse all complete frames */ }
  }
  _frame() {
    const b = this.buf;
    if (b.length < 2) return false;
    const fin = !!(b[0] & 0x80);
    const op = b[0] & 0x0f;
    const masked = !!(b[1] & 0x80);
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return false;
      len = b.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (b.length < 10) return false;
      if (b.readUInt32BE(2) !== 0) { this.close(1009); return false; }
      len = b.readUInt32BE(6); off = 10;
    }
    if (len > MAX_FRAME) { this.close(1009); return false; }
    if (!masked) { this.close(1002); return false; }
    if (b.length < off + 4 + len) return false;
    const mask = b.subarray(off, off + 4);
    const payload = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) payload[i] = b[off + 4 + i] ^ mask[i & 3];
    this.buf = b.subarray(off + 4 + len);

    if (op === 0x8) { this.close(1000); return false; }
    if (op === 0x9) { this._raw(0xA, payload); return true; }
    if (op === 0xA) { this.alive = true; return true; }
    if (op === 0x1 || op === 0x2 || op === 0x0) {
      if (op !== 0x0) { this.fragOp = op; this.frag = []; this.fragLen = 0; }
      this.frag.push(payload);
      this.fragLen += payload.length;
      if (this.fragLen > MAX_FRAME) { this.close(1009); return false; }
      if (fin) {
        const msg = Buffer.concat(this.frag);
        const isText = this.fragOp === 0x1;
        this.frag = []; this.fragLen = 0;
        if (isText) {
          try { this.onmessage(msg.toString('utf8')); } catch (e) { /* bad message must never crash the server */ }
        }
      }
      return true;
    }
    this.close(1002);
    return false;
  }
  _raw(op, payload) {
    if (this.closed) return;
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(n, 6); }
    try {
      if (this.socket.writableLength > 1 << 20) return this._closed(); // client is not reading; drop it
      this.socket.write(Buffer.concat([head, payload]));
    } catch (e) { this._closed(); }
  }
  send(str) { this._raw(0x1, Buffer.from(str, 'utf8')); }
  ping() { this._raw(0x9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (this.closed) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code, 0);
    this._raw(0x8, p);
    try { this.socket.end(); } catch (e) { /* ignore */ }
    setTimeout(() => this._closed(), 200);
  }
}

/* ------------------------------------------------------------------ Game state */
const rooms = new Map(); // name -> { name, players: Map<id, P>, dirty }
let nextId = 1;
const startedAt = Date.now();

const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const cleanText = (s, max) =>
  String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanColor = c => (/^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : '#d9482b');
const cleanRoom = r => cleanText(r, 24).replace(/[^A-Za-z0-9_-]/g, '').toLowerCase();

function broadcast(room, obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const p of room.players.values()) if (p.id !== exceptId) p.conn.send(s);
}
const info = p => ({ id: p.id, name: p.name, veh: p.veh, color: p.color, money: p.money, x: p.x, z: p.z, h: p.h, v: p.v, st: p.st, f: p.f });

function pickRoom(requested) {
  if (!requested || requested === 'public') {
    for (let i = 1; i < 100; i++) {
      const name = 'public-' + i;
      const r = rooms.get(name);
      if (!r) return makeRoom(name);
      if (r.players.size < ROOM_CAP) return r;
    }
    return null;
  }
  const r = rooms.get(requested) || makeRoom(requested);
  return r.players.size < ROOM_CAP ? r : null;
}
function makeRoom(name) {
  const r = { name, players: new Map(), dirty: false };
  rooms.set(name, r);
  return r;
}

function handle(p, raw) {
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  const now = Date.now();

  // token bucket: 60 msgs/sec burst 120 is far above the 15Hz client rate
  p.tokens = Math.min(120, p.tokens + (now - p.tokenAt) * 0.06);
  p.tokenAt = now;
  if (p.tokens < 1) return;
  p.tokens -= 1;

  switch (m.t) {
    case 'join': {
      if (p.room) return;
      p.name = cleanText(m.name, 16) || 'Driver' + p.id;
      p.veh = VEHICLES.includes(m.veh) ? m.veh : 'car';
      p.color = cleanColor(m.color);
      const requested = cleanRoom(m.room);
      const room = pickRoom(requested);
      if (!room) { p.conn.send(JSON.stringify({ t: 'error', msg: 'Room is full. Try another room code.' })); return; }
      p.room = room;
      p.x = num(m.x, WORLD_MIN, WORLD_MAX); p.z = num(m.z, WORLD_MIN, WORLD_MAX);
      room.players.set(p.id, p);
      p.conn.send(JSON.stringify({
        t: 'welcome', id: p.id, room: room.name, time: now,
        players: [...room.players.values()].filter(q => q !== p).map(info),
      }));
      broadcast(room, { t: 'join', p: info(p) }, p.id);
      break;
    }
    case 's': {
      const room = p.room; if (!room) return;
      const x = num(m.x, WORLD_MIN, WORLD_MAX, NaN), z = num(m.z, WORLD_MIN, WORLD_MAX, NaN);
      if (Number.isNaN(x) || Number.isNaN(z)) return;
      const dt = Math.max(0.02, (now - p.lastState) / 1000);
      if (p.hasState && !p.tp) {
        const speed = Math.hypot(x - p.x, z - p.z) / dt;
        if (speed > MAX_SPEED_UNITS) return; // teleport / speed hack: ignore
      }
      p.tp = false; p.hasState = true; p.lastState = now;
      p.x = x; p.z = z;
      p.h = num(m.h, -100, 100); p.v = num(m.v, -150, 150);
      p.st = num(m.st, -1, 1); p.f = num(m.f, 0, 255) | 0;
      room.dirty = true;
      break;
    }
    case 'tp': p.tp = true; break;
    case 'veh': {
      if (!p.room) return;
      p.veh = VEHICLES.includes(m.veh) ? m.veh : p.veh;
      p.color = cleanColor(m.color);
      p.tp = true;
      broadcast(p.room, { t: 'veh', id: p.id, veh: p.veh, color: p.color });
      break;
    }
    case 'chat': {
      if (!p.room) return;
      if (now - p.chatAt < 700) return;
      p.chatAt = now;
      const text = cleanText(m.text, 120);
      if (text) broadcast(p.room, { t: 'chat', id: p.id, name: p.name, text });
      break;
    }
    case 'foot': {   // on-foot character state (the parked vehicle keeps being sent by 's')
      if (!p.room) return; if (now - (p.footAt || 0) < 60) return; p.footAt = now;
      broadcast(p.room, { t: 'foot', id: p.id, on: m.on ? 1 : 0, x: num(m.x, WORLD_MIN, WORLD_MAX), z: num(m.z, WORLD_MIN, WORLD_MAX), h: num(m.h, -100, 100), m: num(m.m, 0, 2), a: m.a ? 1 : 0, s: num(m.s, 0, 1.5) }, p.id);
      break;
    }
    case 'rtc': {   // WebRTC signalling for voice chat: forwarded to one player in the same room
      if (!p.room) return; const to = p.room.players.get(num(m.to, 0, 1e9, -1)); const d = JSON.stringify(m.d || null); if (!to || d.length > 6000) return;
      if (now - (p.rtcAt || 0) < 4) return; p.rtcAt = now; to.conn.send(JSON.stringify({ t: 'rtc', from: p.id, d: m.d })); break;
    }
    case 'st': {   // story relay: forwarded to the room with a sanitised payload
      if (!p.room) return; if (now - (p.stAt || 0) < 150) return; p.stAt = now;
      const d = { t: 'st', id: p.id, k: String(m.k || '').slice(0, 8) }; if (!['start', 'adv', 'vote', 'res', 'flag'].includes(d.k)) return;
      d.ch = num(m.ch, 0, 20); d.i = num(m.i, 0, 50); if (m.v !== undefined) d.v = String(m.v).slice(0, 16); if (m.key !== undefined) d.key = String(m.key).slice(0, 16);
      broadcast(p.room, d); break;
    }
    case 'm': p.money = Math.floor(num(m.m, 0, 1e9)); break;
    case 'ping': p.conn.send(JSON.stringify({ t: 'pong', ts: num(m.ts, 0, 1e15) })); break;
    default: break;
  }
}

function onConnection(conn) {
  const p = {
    id: nextId++, conn, room: null, name: '', veh: 'car', color: '#d9482b', money: 0,
    x: 0, z: 0, h: 0, v: 0, st: 0, f: 0, hasState: false, tp: true, lastState: Date.now(),
    chatAt: 0, tokens: 120, tokenAt: Date.now(),
  };
  conn.onmessage = raw => handle(p, raw);
  conn.onclose = () => {
    const room = p.room;
    if (!room) return;
    room.players.delete(p.id);
    broadcast(room, { t: 'leave', id: p.id });
    if (room.players.size === 0) rooms.delete(room.name);
    p.room = null;
  };
  // a socket that never joins is dropped after 15s
  setTimeout(() => { if (!p.room) conn.close(1008); }, 15000).unref();
}

/* ------------------------------------------------------------------ HTTP + upgrade */
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (url === '/health') {
    let players = 0;
    for (const r of rooms.values()) players += r.players.size;
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players, rooms: rooms.size, uptime: Math.round((Date.now() - startedAt) / 1000) }));
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Andhra Roamer game server is running.\n');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (!key || upgrade !== 'websocket') { socket.destroy(); return; }
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);
  socket.setTimeout(0);
  onConnection(new Conn(socket));
});

/* ------------------------------------------------------------------ Loops */
const r1 = v => Math.round(v * 10) / 10;
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.dirty || room.players.size < 2) { room.dirty = false; continue; }
    room.dirty = false;
    const arr = [];
    for (const p of room.players.values()) {
      if (p.hasState) arr.push([p.id, r1(p.x), r1(p.z), Math.round(p.h * 1000) / 1000, r1(p.v), Math.round(p.st * 100) / 100, p.f]);
    }
    broadcast(room, { t: 'snap', time: Date.now(), p: arr });
  }
}, Math.round(1000 / TICK_HZ));

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size < 2) continue;
    broadcast(room, { t: 'roster', p: [...room.players.values()].map(p => [p.id, p.money]) });
  }
}, 3000);

// keepalive + dead-connection sweep (browsers answer pings automatically)
setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of [...room.players.values()]) {
      if (!p.conn.alive) { p.conn.close(1001); continue; }
      p.conn.alive = false;
      p.conn.ping();
    }
  }
}, 20000).unref();

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log('Andhra Roamer server listening on :' + PORT));
  const stop = () => { server.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
module.exports = { server, rooms };
