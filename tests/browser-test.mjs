import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import http from 'http'; import path from 'path'; import fs from 'fs';
const names = [...new Set([...['ACESFilmicToneMapping','BackSide','BoxGeometry','BufferAttribute','BufferGeometry','CanvasTexture','ClampToEdgeWrapping','Color','ConeGeometry','CylinderGeometry','DirectionalLight','DoubleSide','ExtrudeGeometry','FogExp2','Group','HemisphereLight','InstancedMesh','Mesh','MeshBasicMaterial','MeshPhysicalMaterial','MeshStandardMaterial','Object3D','PCFSoftShadowMap','PMREMGenerator','PerspectiveCamera','PlaneGeometry','RepeatWrapping','RingGeometry','SRGBColorSpace','ShaderMaterial','Shape','SphereGeometry','SpotLight','Sprite','SpriteMaterial','Vector3','WebGLRenderer','Scene','LinearSRGBColorSpace','NoToneMapping','LinearFilter','Float32BufferAttribute']])];
const mock = readFileSync('tests/mock-three.mjs','utf8') + `\nconst T=makeMockThree().THREE;\n` + names.map(n=>`export const ${n}=T.${n};`).join('\n');
const srv = spawn('node',['server/server.js'],{env:{...process.env,PORT:'8099'}});
const root='client'; const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const web = http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; if(p==='/config.js'){r.setHeader('content-type','text/javascript');return r.end("window.GAME_CONFIG={SERVER_URL:'ws://localhost:8099'}")}
 try{const d=fs.readFileSync(path.join(root,p));r.setHeader('content-type',mime[path.extname(p)]||'text/plain');r.end(d)}catch{r.statusCode=404;r.end()}}).listen(8098);
await new Promise(r=>setTimeout(r,800));
const b = await chromium.launch();
const mk = async (name) => { const pg = await b.newPage({viewport:{width:1280,height:720}}); const errs=[]; pg.on('pageerror',e=>errs.push(String(e))); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.route('**/three.module.js',r=>r.fulfill({contentType:'text/javascript',body:mock}));
  await pg.goto('http://localhost:8098/'); await pg.waitForSelector('#menu:not([hidden])',{timeout:20000}); await pg.fill('#name',name); return {pg,errs}; };
const A = await mk('Ravi'), B = await mk('Sita');
for (const {pg} of [A,B]) { await pg.fill('#room','test'); await pg.selectOption('#region','vizag'); await pg.waitForTimeout(800); await pg.click('#startBtn').catch(async()=>{await pg.click('button:has-text("Start")')}); }
const info = async ({pg}) => pg.evaluate(()=>{const g=window.__game; const nr=g.world.nearestRoad(g.veh.x,g.veh.z); return {region:g.world.meta.id, room:g.net.room, remotes:[...g.net.remotes.values()].map(r=>r.name), x:Math.round(g.veh.x), z:Math.round(g.veh.z), speed:+g.veh.speed.toFixed(1), surf:g.veh.surf, roadD:nr&&+nr.d.toFixed(1), fuel:+g.veh.fuel.toFixed(1)}});
await A.pg.waitForTimeout(9000);
await A.pg.keyboard.down('KeyW'); await A.pg.waitForTimeout(3000); await A.pg.keyboard.up('KeyW');
console.log('A after W',await info(A));
await A.pg.keyboard.down('KeyS'); await A.pg.waitForTimeout(3500); await A.pg.keyboard.up('KeyS'); await A.pg.keyboard.down('KeyS'); await A.pg.waitForTimeout(2500);
console.log('A after S (should be braking then reversing)',await info(A), 'u=',await A.pg.evaluate(()=>+window.__game.veh.u.toFixed(2)), 'gear=',await A.pg.textContent('#gear')); await A.pg.keyboard.up('KeyS');
console.log('early errs',A.errs.slice(0,6),B.errs.slice(0,3));
console.log('A',await info(A)); console.log('B',await info(B));
await A.pg.screenshot({path:'/tmp/claude-0/-home-claude/37f8f6fa-367a-55a3-a419-14b2d6ce60d5/scratchpad/hud.png'});
console.log('errors A',A.errs.slice(0,5)); console.log('errors B',B.errs.slice(0,5));
await b.close(); srv.kill(); web.close();
