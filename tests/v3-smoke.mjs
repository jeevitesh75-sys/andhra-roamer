import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs'; import { spawn } from 'child_process'; import http from 'http'; import path from 'path'; import fs from 'fs';
const names=[...new Set(readFileSync('tests/browser-test.mjs','utf8').match(/\['ACES[^\]]+\]/)[0].match(/'(\w+)'/g).map(s=>s.slice(1,-1)))];
const mock=readFileSync('tests/mock-three.mjs','utf8')+`\nconst T=makeMockThree().THREE;\n`+names.map(n=>`export const ${n}=T.${n};`).join('\n');
const srv=spawn('node',['server/server.js'],{env:{...process.env,PORT:'8099'}});
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const web=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';if(p==='/config.js'){r.setHeader('content-type','text/javascript');return r.end("window.GAME_CONFIG={SERVER_URL:'ws://localhost:8099'}");}
 try{const d=fs.readFileSync(path.join('client',p));r.setHeader('content-type',mime[path.extname(p)]||'application/octet-stream');r.end(d)}catch{r.statusCode=404;r.end()}}).listen(8098);
await new Promise(r=>setTimeout(r,600));
const b=await chromium.launch(); const errs=[];
const mk=async n=>{const pg=await b.newPage({viewport:{width:900,height:480},hasTouch:true});pg.on('pageerror',e=>errs.push(n+': '+e));pg.on('console',m=>{if(m.type()==='error')errs.push(n+' c: '+m.text())});
 await pg.route('**/three.module.js',r=>r.fulfill({contentType:'text/javascript',body:mock}));await pg.goto('http://localhost:8098/');await pg.waitForSelector('#menu:not([hidden])',{timeout:20000});await pg.fill('#name',n);await pg.fill('#room','t1');await pg.selectOption('#region','vizag');await pg.waitForTimeout(600);await pg.click(n==='Sita'?'#storyBtn':'#startBtn');await pg.waitForSelector('#hud:not([hidden])',{timeout:60000});return pg};
const A=await mk('Ravi'),B=await mk('Sita');await A.waitForTimeout(2500);
console.log('lobby auto-open after Story button (B):',await B.evaluate(()=>!document.getElementById('lobby').hidden));
const ev=(pg,f)=>pg.evaluate(f);
console.log('stations',await ev(A,()=>__game.law.stations.length),'static parked',await ev(A,()=>__game.lot.statics.size));
// exit vehicle
await ev(A,()=>{__game.veh.speed=0;}); await A.keyboard.press('KeyE'); await A.waitForTimeout(1500);
console.log('A foot after E:',await ev(A,()=>!!__game.foot),'myPark',await ev(A,()=>__game.myPark));
await B.waitForTimeout(500); console.log('B sees parked',await ev(B,()=>__game.lot.dyn.size),'remote A foot flag',await ev(B,()=>{const r=[...__game.net.remotes.values()][0];const s=r&&r.snaps[r.snaps.length-1];return s&&(s.f&16)}));
// joystick walk
await ev(A,()=>__game.joy.setVec(0,1)); const p0=await ev(A,()=>[__game.foot.x,__game.foot.z]); await A.waitForTimeout(1500); const p1=await ev(A,()=>[__game.foot.x,__game.foot.z]); console.log('joystick moved m:',Math.hypot(p1[0]-p0[0],p1[1]-p0[1]).toFixed(1)); await ev(A,()=>__game.joy.setVec(0,0));
await ev(A,()=>{const g=__game;g.joy.setVec(0,0);}); await A.screenshot({path:'/tmp/claude-0/-home-claude/d38ec714-3ad8-5178-8d1f-bc0f7ab12ae2/scratchpad/foot.png'});
// walk back & enter
await ev(A,()=>{const g=__game,e=g.lot.dyn.get(g.myPark);g.foot.x=e.x+2.5;g.foot.z=e.z;}); await A.keyboard.press('KeyE'); await A.waitForTimeout(1500);
console.log('A back in vehicle:',await ev(A,()=>!__game.foot));
// story: 4-role lobby via server
await ev(A,()=>__game.storyC.openLobby()); await A.waitForTimeout(300); await ev(B,()=>__game.storyC.openLobby()); await B.waitForTimeout(300);
await ev(A,()=>{__game.net.send({t:'role',role:'mastermind'});}); await ev(B,()=>{__game.net.send({t:'role',role:'driver'});}); await A.waitForTimeout(300);
await ev(A,()=>__game.net.send({t:'sstart',ch:1})); await A.waitForTimeout(800);
console.log('story step A:',await ev(A,()=>__game.net.story.id),'B:',await ev(B,()=>__game.net.story.id),'cine',await ev(A,()=>!!__game.storyC.cine));
await A.screenshot({path:'/tmp/claude-0/-home-claude/d38ec714-3ad8-5178-8d1f-bc0f7ab12ae2/scratchpad/cine.png'});
// --- shared AI teammates + gang requested by the non-host
for(let i=0;i<40;i++){ for(const pg of [A,B]) await ev(pg,()=>{const s=__game.storyC,st=__game.net.story;if(!st||!st.on)return; if(s.cine)s.endCine(); else if(s.def&&s.def.need==='all')s.finishStep(); else if(s.def&&s.def.need==='vote'){const o=s.def.options;__game.net.sendStory('svote',{id:st.id,val:o[0].id});}}); await A.waitForTimeout(100); if(await ev(A,()=>__game.net.story.id)==='c2_rival')break; }
await A.waitForTimeout(1500);
const aiKeys=pg=>ev(pg,()=>[...__game.chars.rigs.keys()].filter(k=>k.startsWith('ai_')));
const hostA=await ev(A,()=>__game.net.isHost); const NH=hostA?B:A, HO=hostA?A:B;
console.log('step',await ev(A,()=>__game.net.story.id),'AI rigs host',JSON.stringify(await aiKeys(HO)),'nonhost',JSON.stringify(await aiKeys(NH)));
await ev(NH,()=>{const s=__game.storyC; s.list=[{k:'clear',at:'warehouse',n:5,text:'x'}]; s.idx=0;}); await NH.waitForTimeout(4500);
const gh=await ev(HO,()=>__game.storyC.gang.length), gn=await ev(NH,()=>__game.storyC.gang.length); console.log('gang host',gh,'nonhost',gn); if(!gh||!gn){console.log('FAIL gang not shared');process.exitCode=1;}
// skip through everything: cut -> ready; all -> done; vote -> vote
for(let i=0;i<60;i++){ for(const pg of [A,B]) await ev(pg,()=>{const s=__game.storyC,st=__game.net.story;if(!st||!st.on)return; if(s.cine)s.endCine(); else if(s.def&&s.def.need==='all')s.finishStep(); else if(s.def&&s.def.need==='vote'){const o=s.def.options.filter(x=>!x.secret||st.choices.c4_choice==='protect');__game.net.sendStory('svote',{id:st.id,val:o[o.length-1].id});}}); await A.waitForTimeout(120); if(await ev(A,()=>__game.net.story.ended))break; }
console.log('story ended:',await ev(A,()=>__game.net.story.ended),'ending',await ev(A,()=>__game.net.story.ending),'final id',await ev(A,()=>__game.net.story.id));
console.log('ERRORS',errs.length?errs.slice(0,8):'none');
await b.close();srv.kill();web.close();process.exit(0);
