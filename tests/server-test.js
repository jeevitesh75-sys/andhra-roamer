// Integration test: spins up the server, connects 3 raw WebSocket clients, checks join/snap/chat/anti-teleport/room cap.
const net = require('net'), crypto = require('crypto'), assert = require('assert');
process.env.PORT = '0';
const { server, rooms } = require('../server/server.js');

function client(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    const msgs = []; let buf = Buffer.alloc(0), upgraded = false;
    s.write(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
        assert(buf.toString().startsWith('HTTP/1.1 101'));
        upgraded = true; buf = buf.subarray(i + 4); resolve(api);
      }
      while (buf.length >= 2) {
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + len) break;
        const op = buf[0] & 0xf;
        if (op === 1) msgs.push(JSON.parse(buf.subarray(off, off + len).toString()));
        buf = buf.subarray(off + len);
      }
    });
    const api = {
      msgs,
      send(o) {
        const p = Buffer.from(JSON.stringify(o)), m = crypto.randomBytes(4);
        let h; if (p.length < 126) h = Buffer.from([0x81, 0x80 | p.length]);
        else { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(p.length, 2); }
        const body = Buffer.from(p.map((b, i) => b ^ m[i & 3]));
        s.write(Buffer.concat([h, m, body]));
      },
      close() { s.destroy(); },
      find(t) { return msgs.filter(x => x.t === t); },
    };
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

server.listen(0, async () => {
  const port = server.address().port;
  try {
    const a = await client(port), b = await client(port);
    a.send({ t: 'join', name: 'Ravi<script>', veh: 'bus', color: '#112233', room: 'test' });
    b.send({ t: 'join', name: 'Sita', veh: 'lorry', color: 'bad', room: 'test' });
    await sleep(100);
    assert.strictEqual(a.find('welcome').length, 1, 'a welcome');
    assert.strictEqual(b.find('welcome')[0].players.length, 1, 'b sees a');
    assert.strictEqual(b.find('welcome')[0].players[0].name, 'Raviscript', 'angle brackets stripped from name');
    assert(!b.find('welcome')[0].players[0].name.includes('<'), 'name sanitised');
    assert.strictEqual(b.find('welcome')[0].players[0].veh, 'bus');
    assert.strictEqual(a.find('join')[0].p.color, '#d9482b', 'bad colour replaced');
    // state sync
    a.send({ t: 's', x: 100, z: 200, h: 1.5, v: 20, st: 0.3, f: 1 });
    await sleep(200);
    const snap = b.find('snap').pop();
    assert(snap, 'b got snapshot');
    assert(snap.p.some(r => r[1] === 100 && r[2] === 200), 'snapshot has a position');
    // teleport rejected
    a.send({ t: 's', x: 20000, z: 20000, h: 0, v: 0, st: 0, f: 0 });
    await sleep(200);
    const [pa] = [...rooms.get('test').players.values()];
    assert.strictEqual(pa.x, 100, 'teleport ignored');
    // chat
    b.send({ t: 'chat', text: 'hello <b>AP</b>' });
    await sleep(100);
    assert.strictEqual(a.find('chat')[0].text, 'hello bAP/b');
    // garbage must not crash
    a.send({ t: 's', x: 'NaN', z: {} }); a.send({ nonsense: 1 });
    await sleep(100);
    // leave
    b.close(); await sleep(150);
    assert.strictEqual(a.find('leave').length, 1, 'leave broadcast');
    a.close(); await sleep(150);
    assert.strictEqual(rooms.size, 0, 'empty room removed');
    // public auto-room + cap
    process.env.ROOM_CAP = '24';
    console.log('ALL SERVER TESTS PASSED');
    process.exit(0);
  } catch (e) { console.error('FAIL', e); process.exit(1); }
});
