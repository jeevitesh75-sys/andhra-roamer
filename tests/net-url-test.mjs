import { Net } from '../client/src/net.js';
let f = 0; const eq = (a, b) => { const ok = a === b; console.log(ok ? 'ok  ' : 'FAIL', a, '=>', b); if (!ok) f++; };
eq(Net.normalize('https://x.onrender.com/'), 'wss://x.onrender.com');
eq(Net.normalize('  andhra-roamer-server.onrender.com '), 'wss://andhra-roamer-server.onrender.com');
eq(Net.normalize('ws://localhost:8080'), 'ws://localhost:8080');
eq(Net.normalize('wss://a.b'), 'wss://a.b');
eq(Net.normalize(''), '');
console.log(f ? 'FAILED' : 'NET URL TESTS PASSED'); process.exit(f ? 1 : 0);
