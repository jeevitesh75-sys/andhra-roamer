// Humanoid character rigs (box people) used for: your own character on foot, other players on foot, police officers, gang members.
// One Characters instance manages any number of keyed rigs inside the three.js scene. Pure presentation, no game logic.
export const CHAR_TOP = 1.7; // y of the top of the head on the glTF person (metres)
export class Characters {
  constructor(T, scene, assets = null) {
    this.T = T; this.scene = scene; this.assets = assets; this.rigs = new Map(); this.mats = new Map(); this.geo = {};
    const G = this.geo;
    G.torso = new T.BoxGeometry(0.5, 0.7, 0.28); G.head = new T.SphereGeometry(0.15, 10, 8); G.leg = new T.BoxGeometry(0.2, 0.8, 0.22);
    G.arm = new T.BoxGeometry(0.14, 0.62, 0.16); G.gun = new T.BoxGeometry(0.07, 0.12, 0.36); G.cap = new T.CylinderGeometry(0.17, 0.19, 0.09, 10);
    G.brim = new T.BoxGeometry(0.26, 0.02, 0.12); G.badge = new T.BoxGeometry(0.1, 0.1, 0.02); G.hat = new T.BoxGeometry(0.34, 0.03, 0.34); G.flash = new T.SphereGeometry(0.1, 6, 6);
  }
  _mat(c) { let m = this.mats.get(c); if (!m) { m = new this.T.MeshStandardMaterial({ color: c, roughness: 0.85 }); this.mats.set(c, m); } return m; }
  /** rigged, animated glTF person (Quaternius). Returns null if the model is not available so the box rig is used. */
  _makeGlb(p) {
    const A = this.assets, T = this.T; if (!A || !A.char || !A.SkeletonUtils) return null;
    const swat = p.hat === 'cap' && A.swat, CH = swat || A.char;
    const model = A.SkeletonUtils.clone(CH.scene), g = new T.Group(), body = new T.Group(), k = CH.scale; g.add(body); body.add(model); model.scale.setScalar(k);
    const mats = [], cache = new Map(), col = c => new T.Color(c);
    const tint = { Shirt: p.color || '#2980b9', UnderShirt: new T.Color(p.color || '#2980b9').multiplyScalar(0.8), Pants: p.pants || '#2c3e50' }; if (p.skin) tint.Skin = p.skin;
    model.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
      const m = o.material; if (!m) return; let c = cache.get(m);
      if (!c) { c = m.clone(); cache.set(m, c); mats.push(c); const t = tint[m.name]; if (t !== undefined) c.color.copy(t.isColor ? t : col(t)); c.metalness = Math.min(c.metalness, 0.15); }
      o.material = c;
    });
    const mixer = new T.AnimationMixer(model), actions = {};
    for (const clip of CH.anims) if (!clip.name.includes('|')) actions[clip.name] = mixer.clipAction(clip);
    if (swat) { if (actions.Idle_Gun) actions.Idle = actions.Idle_Gun; if (actions.Idle_Gun_Pointing) actions.Attacking_Idle = actions.Idle_Gun_Pointing; }
    const gunSrc = swat && A.rifle ? A.rifle : A.pistol, gun = gunSrc ? gunSrc.clone(true) : null, flash = new T.Mesh(this.geo.flash, new T.MeshBasicMaterial({ color: 0xffd24a })); flash.visible = false;
    if (gun) { flash.position.set(0, 0.04, swat && A.rifle ? 0.95 : 0.22); flash.scale.setScalar(0.7); gun.add(flash); gun.visible = false; g.add(gun); }
    const hand = model.getObjectByName('Fist.R') || model.getObjectByName('LowerArm.R');
    const hatMesh = (geo, c, x, y, z, sc) => { const o = new T.Mesh(geo, this._mat(c)); o.position.set(x, y, z); o.scale.setScalar(sc || 1); o.castShadow = true; body.add(o); return o; };
    const G = this.geo, hy = CHAR_TOP;
    if (p.hat === 'cap' && !swat) { hatMesh(G.cap, p.hatColor || '#1d2f63', 0, hy + 0.02, 0, 1.45); hatMesh(G.brim, '#111', 0, hy - 0.03, 0.27, 1.7); }
    else if (p.hat === 'helmet') { const h = hatMesh(G.cap, '#f5f5f5', 0, hy - 0.02, 0, 1.7); h.scale.set(1.9, 2.4, 1.9); }
    else if (p.hat === 'bandana') hatMesh(G.hat, '#b0171f', 0, hy - 0.06, 0, 1.45);
    else if (p.hat === 'crown') hatMesh(G.cap, '#d4af37', 0, hy + 0.04, 0, 1.1);
    this.scene.add(g);
    return { g, body, model, k, mixer, actions, cur: null, glb: true, mats, gun: gun || { visible: false }, hasGun: !!gun, hand, flash, flashT: 0, key: '', last: p, tmpV: new T.Vector3() };
  }
  _play(r, name, ts = 1) {
    const a = r.actions[name] || r.actions.Idle; if (!a) return; a.timeScale = ts;
    if (r.cur === a) return;
    if (name === 'Death') { a.setLoop(this.T.LoopOnce, 1); a.clampWhenFinished = true; }
    a.reset().setEffectiveWeight(1).play(); if (r.cur) r.cur.crossFadeTo(a, 0.18, false); r.cur = a;
  }
  _poseGlb(r, p) {
    const sc = p.s || 1, mv = p.moving || 0, cr = p.crouch || 0, dead = p.dead || 0;
    r.g.position.set(p.x, p.y, p.z); r.g.rotation.order = 'YXZ'; r.g.rotation.set(0, p.h, 0); r.g.scale.setScalar(sc);
    r.model.scale.set(r.k, r.k * (1 - 0.28 * cr), r.k);
    let clip = 'Idle', ts = 1;
    if (dead > 0.02) clip = 'Death';
    else if (mv > 0.9) { clip = 'Run'; ts = Math.max(0.8, Math.min(1.5, mv / 1.1)); }
    else if (mv > 0.05) { clip = 'Walk'; ts = Math.max(0.6, Math.min(1.6, mv / 0.55)); }
    else if (p.gun && p.aim) clip = 'Attacking_Idle';
    this._play(r, clip, ts);
    r.gun.visible = !!p.gun && r.hasGun;
    if (p.flash && r.hasGun) { r.flash.visible = true; r.flashT = 0.06; }
  }
  _make(p) {
    if (this.assets && this.assets.char) { try { const r = this._makeGlb(p); if (r) return r; } catch (e) { console.warn('glb character failed, using box rig', e); this.assets = null; } }
    const T = this.T, G = this.geo, M = c => this._mat(c), mesh = (g, c) => { const o = new T.Mesh(g, M(c)); o.castShadow = true; return o; };
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const shirt = p.color || '#2980b9', pants = p.pants || '#2c3e50', skin = p.skin || '#c68b59';
    const torso = mesh(G.torso, shirt); torso.position.y = 1.15; const head = mesh(G.head, skin); head.position.y = 1.67;
    const leg = x => { const pv = new T.Group(); pv.position.set(x, 0.8, 0); const l = mesh(G.leg, pants); l.position.y = -0.4; pv.add(l); return pv; };
    const arm = x => { const pv = new T.Group(); pv.position.set(x, 1.45, 0); const l = mesh(G.arm, shirt); l.position.y = -0.3; pv.add(l); return pv; };
    const lL = leg(-0.13), lR = leg(0.13), aL = arm(-0.34), aR = arm(0.34);
    const gun = mesh(G.gun, '#1d1f24'); gun.position.set(0, -0.58, 0.2); gun.visible = false; aR.add(gun);
    const flash = new T.Mesh(G.flash, new T.MeshBasicMaterial({ color: 0xffd24a })); flash.position.set(0, 0, 0.3); flash.visible = false; gun.add(flash);
    body.add(torso, head, lL, lR, aL, aR);
    if (p.hat === 'cap') { const cap = mesh(G.cap, p.hatColor || '#1d2f63'); cap.position.y = 1.83; const brim = mesh(G.brim, '#111'); brim.position.set(0, 1.79, 0.15); body.add(cap, brim); const bd = mesh(G.badge, '#f1c40f'); bd.position.set(0.12, 1.3, 0.15); body.add(bd); }
    else if (p.hat === 'helmet') { const h = mesh(G.cap, '#f5f5f5'); h.position.y = 1.78; h.scale.set(1.15, 1.6, 1.15); body.add(h); }
    else if (p.hat === 'bandana') { const b = mesh(G.hat, '#b0171f'); b.position.y = 1.8; body.add(b); }
    else if (p.hat === 'crown') { const b = mesh(G.cap, '#d4af37'); b.position.y = 1.84; b.scale.set(0.85, 1.2, 0.85); body.add(b); }
    this.scene.add(g);
    return { g, body, lL, lR, aL, aR, gun, flash, flashT: 0, key: '', last: p };
  }
  /** p = {x,y,z,h, s(scale), phase, moving(0..1.3), air, crouch(0..1), aim(bool), gun(bool), flash(bool), dead(0..1), color, pants, skin, hat, vis} */
  set(key, p) {
    let r = this.rigs.get(key);
    const sig = (p.color || '') + (p.pants || '') + (p.hat || '') + (p.skin || '');
    if (r && r.key !== sig) { this.remove(key); r = null; }
    if (!r) { r = this._make(p); r.key = sig; this.rigs.set(key, r); }
    r.g.visible = p.vis !== false; r.seen = true;
    if (r.glb) { this._poseGlb(r, p); return r; }
    const sc = p.s || 1, mv = p.moving || 0, sw = Math.sin(p.phase || 0) * mv * 0.9, cr = p.crouch || 0, dead = p.dead || 0;
    r.g.position.set(p.x, p.y, p.z); r.g.rotation.order = 'YXZ'; r.g.rotation.set(-dead * 1.5, p.h, 0); r.g.scale.setScalar(sc);
    r.body.position.y = -0.38 * cr; r.body.rotation.x = mv * 0.08 + cr * 0.18;
    r.lL.rotation.x = sw - cr * 1.1; r.lR.rotation.x = -sw - cr * 1.1; r.aL.rotation.x = -sw * 0.8 - cr * 0.5; r.aR.rotation.x = sw * 0.8 - cr * 0.5;
    if (p.air) { r.lL.rotation.x = -0.6; r.lR.rotation.x = 0.4; r.aL.rotation.x = r.aR.rotation.x = -2.2; }
    r.gun.visible = !!p.gun;
    if (p.gun && p.aim) { r.aR.rotation.x = -1.45; r.aL.rotation.x = -1.2; }
    if (p.flash) { r.flash.visible = true; r.flashT = 0.06; }
    return r;
  }
  has(key) { return this.rigs.has(key); }
  remove(key) { const r = this.rigs.get(key); if (r) { this.scene.remove(r.g); this.rigs.delete(key); if (r.glb) { r.mixer.stopAllAction(); for (const m of r.mats) m.dispose(); } } }
  removePrefix(prefix) { for (const k of [...this.rigs.keys()]) if (k.startsWith(prefix)) this.remove(k); }
  tick(dt) {
    for (const r of this.rigs.values()) {
      if (r.flashT > 0 && (r.flashT -= dt) <= 0) r.flash.visible = false;
      if (!r.glb) continue;
      r.mixer.update(dt);
      if (r.hasGun && r.gun.visible && r.hand) { r.hand.getWorldPosition(r.tmpV); r.g.worldToLocal(r.tmpV); r.gun.position.copy(r.tmpV); r.gun.position.z += 0.05; }
    }
  }
  /** remove every rig of this prefix that was not set() since the last call */
  sweep(prefix) { for (const [k, r] of [...this.rigs]) { if (!k.startsWith(prefix)) continue; if (!r.seen) this.remove(k); else r.seen = false; } }
  clear() { for (const k of [...this.rigs.keys()]) this.remove(k); }
}
