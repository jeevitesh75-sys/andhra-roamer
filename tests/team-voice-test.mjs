import { Team, Voice } from '../client/src/extras.js';
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m);} else console.log('ok  ',m); };
// --- AI teammates follow the player's trail
const set=new Map(), models=new Map(), tags=[];
const G={ storyC:{active:true,state:{roles:{1:'mastermind'}}}, net:{remotes:new Map([[2,{id:2,name:'Ravi',snaps:[{x:500,z:500}]}]])},
  chars:{set:(k,p)=>set.set(k,p),remove:k=>set.delete(k),sweep:()=>{}}, world:{heightAt:()=>0,groundAt:()=>0},
  scene:{models:{has:k=>models.has(k),},model:(k,t,c)=>{models.set(k,{t,c});return {};},placeModel:()=>{},removeModel:k=>models.delete(k),toScreen:()=>({visible:false,x:0,y:0})},
  updateTag:(...a)=>tags.push(a), dropTag:()=>{} };
G.scene.models.get=k=>models.get(k);
global.document={getElementById:()=>null}; global.innerWidth=800; global.innerHeight=400;
const T=new Team(G); ok(JSON.stringify(T.aiRoles())==='["driver","hacker","insider"]','3 empty roles become AI teammates: '+T.aiRoles());
let t=0; for(let i=0;i<200;i++){ t+=0.05; T.update(0.05,t,{x:i*1.0,z:0,h:Math.PI/2},false); }
ok(T.ai.length===3 && models.size===3,'3 AI convoy cars rendered ('+models.size+')');
const lead=T.ai[0], last=T.ai[2]; ok(lead.x<199 && lead.x>150 && last.x<lead.x,'convoy trails behind player in order: '+T.ai.map(a=>a.x.toFixed(0)).join(' > '));
for(let i=0;i<40;i++){ t+=0.05; T.update(0.05,t,{x:200,z:i*0.5,h:0},true); }
ok(set.size===3 && models.size===0,'on foot: AI teammates become characters, cars removed');
ok(T.mates().length===4,'mates() = 3 AI + 1 human friend'); const f=T.nearestFriend({x:0,z:0}); ok(f&&f.name==='Ravi'&&Math.abs(f.d-707)<2,'nearest friend found');
G.storyC.state.roles={1:'mastermind',2:'driver',3:'hacker',4:'insider'}; t+=0.1; T.update(0.05,t,{x:200,z:20,h:0},true); ok(T.ai.length===0,'full human team => no AI teammates');
// --- voice signalling between two fake peers (lower id offers)
const bus=[]; let peers={};
class FakePC{ constructor(){this.tracks=[];this.signalingState='stable';} addTrack(t){this.tracks.push(t);} async createOffer(){return{type:'offer'};} async createAnswer(){return{type:'answer'};} async setLocalDescription(d){this.localDescription=d;this.signalingState=d.type==='offer'?'have-local-offer':'stable';} async setRemoteDescription(d){this.remote=d;this.signalingState='stable';} async addIceCandidate(){} close(){} }
global.RTCPeerConnection=FakePC; Object.defineProperty(globalThis,"navigator",{value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}],getAudioTracks:()=>[{enabled:true}]})}},configurable:true});
global.requestAnimationFrame=()=>{}; global.window={}; global.document={createElement:()=>({remove(){}}),body:{appendChild(){}},getElementById:()=>null};
const mk=(id)=>{ const n={id,status:'online',remotes:new Map(),sendEv:(k,d,to)=>bus.push({from:id,k,d,to})}; const g={net:n}; const v=new Voice(g,()=>{}); g.voice=v; return {n,v}; };
const A=mk(1),B=mk(2); A.n.remotes.set(2,{}); B.n.remotes.set(1,{});
const pump=async()=>{ for(let i=0;i<20&&bus.length;i++){ const m=bus.shift(); for(const P of [A,B]){ if(P.n.id===m.from) continue; if(m.to&&m.to!==P.n.id) continue; await P.v.onSignal(m.d,m.from); } } };
await A.v.enable(); await B.v.enable(); await pump();
ok(A.v.peers.has(2)&&B.v.peers.has(1),'both peers created a connection');
ok(B.v.peers.get(1).remote&&B.v.peers.get(1).remote.type==='offer','lower id (1) made the offer, 2 received it');
ok(A.v.peers.get(2).remote&&A.v.peers.get(2).remote.type==='answer','answer returned to the offerer');
await A.v.toggle(); ok(A.v.status()==='muted','mic can be muted'); A.v.disable(); ok(A.v.peers.size===0,'disable closes connections');
console.log(fails?fails+' FAILURES':'team/voice OK'); process.exit(fails?1:0);
