// three.js world renderer. THREE is injected so the module has no import-map dependency.
import { CHUNK, terrainChunk, osmBuildings, osmRoads, osmBridges, osmRails, roundTreeGeometry, palmGeometry, treesForChunk } from './meshbuild.js';
import { createModels } from './models.js';
import { smooth, lerp, clamp, mulberry32 } from './noise.js';

export const QUALITY = {
  low: { radius: 3, pr: 1, shadows: false, shadowSize: 1024 },
  medium: { radius: 4, pr: 1.5, shadows: true, shadowSize: 1024 },
  high: { radius: 5, pr: 2, shadows: true, shadowSize: 2048 },
};

const SKY_VERT = `varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uStars;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float t = pow(max(d.y, 0.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.25, d.y));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 14.0) * 0.22);
  vec3 q = floor(d * 240.0);
  float s = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  col += vec3(step(0.9972, s) * uStars * smoothstep(0.02, 0.3, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Scene3D {
  constructor(T, canvas, world, quality = 'medium', assets = null) {
    this.T = T; this.assets = assets; this.world = world; this.canvas = canvas; this.qName = quality; this.q = QUALITY[quality];
    this.time = 0; this.dayf = 1; this.chunks = new Map(); this.cityObjs = new Map(); this.models = new Map(); this.npcModels = new Map();
    this.envMats = []; this.lastEnv = -1; this.buildQueue = [];
    const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: !(window.matchMedia && matchMedia('(pointer: coarse)').matches), powerPreference: 'default' });
    this.dyn = 1; r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr) * this.dyn);
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = this.q.shadows; r.shadowMap.type = T.PCFSoftShadowMap;
    this.maxAniso = r.capabilities.getMaxAnisotropy ? Math.min(8, r.capabilities.getMaxAnisotropy()) : 1;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(65, 1, 0.3, 7000);
    this.scene.fog = new T.FogExp2(0xb8d4ee, 0.00105);
    this.cHorizon = new T.Color(); this.cZenith = new T.Color(); this.cSun = new T.Color(); this.tmpC = new T.Color();
    this.models3d = createModels(T, assets);
    this._textures(); this._materials(); this._sky(); this._lights(); this._water(); this._envMap();
    this._landmarks(); this._labels(); this._stations(); this._initLamps(); this._initExtras(); this._npcInit(); this._beacon();
    this.resize();
  }

  /* ---------------------------------- setup ---------------------------------- */
  _canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new this.T.CanvasTexture(c); if (srgb) t.colorSpace = this.T.SRGBColorSpace;
    t.wrapS = t.wrapT = this.T.RepeatWrapping; t.anisotropy = this.maxAniso; return t;
  }
  _textures() {
    const rnd = mulberry32(7);
    this.texDetail = this._canvasTex(256, 256, (x, w, h) => {
      const img = x.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { const v = 205 + rnd() * 50; img.data[4 * i] = v; img.data[4 * i + 1] = v; img.data[4 * i + 2] = v; img.data[4 * i + 3] = 255; }
      x.putImageData(img, 0, 0);
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '120,120,120'},0.06)`; x.beginPath(); x.arc(rnd() * w, rnd() * h, 6 + rnd() * 26, 0, 7); x.fill(); }
    });
    const road = (x, w, h, dash) => {
      x.fillStyle = '#3b3c40'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const v = 40 + rnd() * 40; x.fillStyle = `rgb(${v},${v},${v + 3})`; x.fillRect(rnd() * w, rnd() * h, 2, 2); }
      x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(w * 0.28, 0, w * 0.1, h); x.fillRect(w * 0.62, 0, w * 0.1, h); // tyre wear
      x.fillStyle = '#e9e9e4'; x.fillRect(w * 0.055, 0, w * 0.018, h); x.fillRect(w * 0.927, 0, w * 0.018, h); // edge lines
      if (dash) { x.fillStyle = '#f3f3ee'; x.fillRect(w * 0.488, 0, w * 0.024, h * 0.38); } else { x.fillStyle = '#f2c94c'; x.fillRect(w * 0.482, 0, w * 0.014, h); x.fillRect(w * 0.504, 0, w * 0.014, h); }
    };
    this.texHighway = this._canvasTex(256, 256, (x, w, h) => road(x, w, h, true));
    this.texStreet = this._canvasTex(256, 256, (x, w, h) => road(x, w, h, true));
    this.texFacade = this._canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
      for (const [cx, cy] of [[16, 12], [76, 12], [16, 76], [76, 76]]) {
        x.fillStyle = '#62778c'; x.fillRect(cx, cy, 36, 40); x.fillStyle = '#9db4c9'; x.fillRect(cx + 3, cy + 3, 30, 14);
        x.fillStyle = '#d8d8d2'; x.fillRect(cx - 3, cy + 40, 42, 4);
      }
    });
    const rnd2 = mulberry32(99);
    this.texLit = this._canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
      for (const [cx, cy] of [[16, 12], [76, 12], [16, 76], [76, 76]]) if (rnd2() < 0.55) { x.fillStyle = rnd2() < 0.5 ? '#ffd68a' : '#fff0c8'; x.fillRect(cx, cy, 36, 40); }
    });
    this.texWater = this._canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#7fa9c0'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(255,255,255,${0.04 + rnd() * 0.1})`; x.lineWidth = 1 + rnd() * 2; const a = rnd() * w, b = rnd() * h; x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(a + 14, b - 6, a + 30, b); x.stroke(); }
    });
  }
  _reg(m, base = 1) { if (m) this.envMats.push({ m, base }); return m; }
  _materials() {
    const T = this.T, e = (m, b) => this._reg(m, b);
    this.mTerrain = e(new T.MeshStandardMaterial({ vertexColors: true, map: this.texDetail, roughness: 0.96, metalness: 0 }), 0.25);
    const roadOpts = { roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    this.mHighway = e(new T.MeshStandardMaterial({ map: this.texHighway, ...roadOpts }), 0.3);
    this.mStreet = e(new T.MeshStandardMaterial({ map: this.texStreet, ...roadOpts }), 0.3);
    for (const mm of [this.mHighway, this.mStreet]) { mm.polygonOffset = true; mm.polygonOffsetFactor = -2; mm.polygonOffsetUnits = -2; }
    this.mBuilding = e(new T.MeshStandardMaterial({ vertexColors: true, map: this.texFacade, emissive: 0xffffff, emissiveMap: this.texLit, emissiveIntensity: 0, roughness: 0.85, metalness: 0 }), 0.4);
    this.mTree = e(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: T.DoubleSide }), 0.25);
    this.mConcrete = e(new T.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.95 }), 0.3);
    this.geoRound = (this.assets && this.assets.treeGeo) || this._geo(roundTreeGeometry()); this.geoPalm = this._geo(palmGeometry());
  }
  _geo(a) {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(a.pos, 3));
    if (a.nor) g.setAttribute('normal', new T.BufferAttribute(a.nor, 3));
    if (a.col) g.setAttribute('color', new T.BufferAttribute(a.col, 3));
    if (a.uv) g.setAttribute('uv', new T.BufferAttribute(a.uv, 2));
    g.setIndex(new T.BufferAttribute(a.idx, 1)); g.computeBoundingSphere(); return g;
  }
  _skyMat() {
    const T = this.T;
    return new T.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uHorizon: { value: new T.Color(0xb8d4ee) }, uZenith: { value: new T.Color(0x3b78d0) }, uSunDir: { value: new T.Vector3(0.4, 0.8, 0.3) },
        uSunColor: { value: new T.Color(0xffe2a8) }, uStars: { value: 0 } } });
  }
  _sky() {
    const T = this.T; this.skyMat = this._skyMat();
    this.sky = new T.Mesh(new T.SphereGeometry(1, 32, 16), this.skyMat); this.sky.frustumCulled = false; this.sky.renderOrder = -10; this.scene.add(this.sky);
  }
  _lights() {
    const T = this.T;
    this.hemi = new T.HemisphereLight(0xbfd8ff, 0x6b5a3a, 1); this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff0d0, 3); this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    const c = this.sun.shadow.camera; c.left = -95; c.right = 95; c.top = 95; c.bottom = -95; c.near = 10; c.far = 520;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.moon = new T.DirectionalLight(0x8fa8ff, 0); this.scene.add(this.moon);
    this.headlight = new T.SpotLight(0xfff2d0, 0, 120, 0.5, 0.55, 1.2); this.scene.add(this.headlight); this.scene.add(this.headlight.target);
  }
  _water() {
    const T = this.T;
    this.mWater = new T.MeshStandardMaterial({ color: 0x3f86a8, map: this.texWater, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.86 });
    this._reg(this.mWater, 1.2);
    this.waterSize = 7000; this.texWater.repeat.set(this.waterSize / 60, this.waterSize / 60);
    this.water = new T.Mesh(new T.PlaneGeometry(this.waterSize, this.waterSize), this.mWater);
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = -0.7; this.water.renderOrder = 1; this.scene.add(this.water);
  }
  _envMap() {
    const T = this.T;
    try {
      const pm = new T.PMREMGenerator(this.renderer), es = new T.Scene(), m = this._skyMat();
      m.uniforms.uHorizon.value.setRGB(0.72, 0.84, 0.95, T.SRGBColorSpace); m.uniforms.uZenith.value.setRGB(0.25, 0.5, 0.88, T.SRGBColorSpace);
      es.add(new T.Mesh(new T.SphereGeometry(1, 24, 12), m));
      this.scene.environment = pm.fromScene(es, 0.03).texture; pm.dispose();
    } catch (e) { console.warn('environment map unavailable', e); }
  }

  /* ---------------------------------- roads ---------------------------------- */
  _roads() {
    this.roadGroup = new this.T.Group(); this.scene.add(this.roadGroup);
    for (const road of this.world.roads) {
      for (const p of roadPieces(this.world, road)) {
        const m = new this.T.Mesh(this._geo(p.geo), this.mHighway); m.receiveShadow = true; this.roadGroup.add(m);
      }
    }
  }

  /* ------------------------------- labels/landmarks ------------------------------- */
  _labels() {
    const T = this.T; this.labels = [];
    for (const c of this.world.cities.filter(c => c.tier >= 1)) {
      const tex = this._canvasTex(512, 128, (x, w, h) => {
        x.fillStyle = 'rgba(15,28,40,0.78)'; x.beginPath(); x.roundRect ? x.roundRect(4, 4, w - 8, h - 8, 22) : x.rect(4, 4, w - 8, h - 8); x.fill();
        x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = 'bold 50px system-ui, sans-serif'; x.fillText(c.name, w / 2, 62);
        x.fillStyle = '#ffd66b'; x.font = '34px "Noto Sans Telugu","Nirmala UI",system-ui,sans-serif'; x.fillText(c.te, w / 2, 106);
      });
      tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
      const k = 1 + c.tier * 0.35; s.scale.set(120 * k, 30 * k, 1); s.position.set(c.x, c.y + 55 + c.tier * 14, c.z);
      this.scene.add(s); this.labels.push({ s, c });
    }
  }
  _landmarks() {
    const T = this.T, g = this.landGroup = new T.Group(); this.scene.add(g);
    const mat = (c, r = 0.8) => this._reg(new T.MeshStandardMaterial({ color: c, roughness: r }), 0.4);
    const ochre = mat(0xc9733a), cream = mat(0xf1e6cf), gold = this._reg(new T.MeshStandardMaterial({ color: 0xe3b23c, metalness: 0.9, roughness: 0.3 }), 1), red = mat(0xc0392b), white = mat(0xf4f4f0), stone = mat(0x9b8e78, 0.95);
    const mesh = (geo, m, x, y, z, grp) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; grp.add(o); return o; };
    for (const l of this.world.landmarks) {
      const grp = new T.Group(), y = this.world.heightAt(l.x, l.z); grp.position.set(l.x, y, l.z);
      if (l.type === 'gopuram') {
        for (let i = 0; i < 6; i++) { const w = 12 - i * 1.6, h = 4.2; mesh(new T.BoxGeometry(w, h, w * 0.7), i % 2 ? cream : ochre, 0, h / 2 + i * h, 0, grp); mesh(new T.BoxGeometry(w + 0.8, 0.5, w * 0.7 + 0.8), cream, 0, i * h + h, 0, grp); }
        mesh(new T.CylinderGeometry(0.2, 1.4, 4, 8), gold, 0, 6 * 4.2 + 2, 0, grp); mesh(new T.BoxGeometry(14, 3, 10), cream, 0, 1.5, 12, grp);
      } else if (l.type === 'lighthouse') {
        mesh(new T.CylinderGeometry(2.2, 3.6, 30, 16), white, 0, 15, 0, grp); mesh(new T.CylinderGeometry(2.3, 2.9, 4, 16), red, 0, 8, 0, grp); mesh(new T.CylinderGeometry(2.1, 2.5, 4, 16), red, 0, 20, 0, grp);
        mesh(new T.CylinderGeometry(3.2, 3.2, 0.6, 16), stone, 0, 30.3, 0, grp);
        this.lamp = mesh(new T.CylinderGeometry(1.4, 1.4, 3, 12), new T.MeshBasicMaterial({ color: 0xfff2a0 }), 0, 32, 0, grp); mesh(new T.ConeGeometry(2, 2.5, 12), red, 0, 34.7, 0, grp);
      } else if (l.type === 'chimneys') {
        [[-20, 0], [0, 6], [20, 0]].forEach(([x, z], i) => { mesh(new T.CylinderGeometry(2.4, 3.4, 60 + i * 8, 14), i % 2 ? white : red, x, 30 + i * 4, z, grp); mesh(new T.CylinderGeometry(2.5, 2.5, 5, 14), red, x, 58 + i * 8, z, grp); });
        mesh(new T.BoxGeometry(60, 14, 24), mat(0x7d8790), 0, 7, 24, grp);
      } else if (l.type === 'stupa') {
        mesh(new T.CylinderGeometry(15, 16, 3, 28), cream, 0, 1.5, 0, grp); mesh(new T.SphereGeometry(13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 3, 0, grp);
        mesh(new T.CylinderGeometry(0.3, 0.3, 7, 8), gold, 0, 16.5, 0, grp); mesh(new T.BoxGeometry(5, 1, 5), cream, 0, 15.8, 0, grp);
      } else if (l.type === 'fort') {
        mesh(new T.CylinderGeometry(7, 8, 22, 18), stone, 0, 11, 0, grp); mesh(new T.CylinderGeometry(8.4, 8.4, 2, 18), stone, 0, 23, 0, grp);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; mesh(new T.BoxGeometry(2, 2, 2), stone, Math.cos(a) * 8, 25, Math.sin(a) * 8, grp); }
        mesh(new T.BoxGeometry(44, 8, 3), stone, 24, 4, 0, grp);
      }
      g.add(grp);
    }
  }
  /** petrol stations from OSM fuel nodes: instanced canopies, pumps and a tall price sign */
  _stations() {
    const T = this.T, L = this.world.stations || []; this.stationGroup = new T.Group(); this.scene.add(this.stationGroup); if (!L.length) return;
    const mk = (geo, color, y, rough = 0.6) => { const im = new T.InstancedMesh(geo, this._reg(new T.MeshStandardMaterial({ color, roughness: rough }), 0.4), L.length), d = new T.Object3D(); L.forEach((s, i) => { d.position.set(s.x, y, s.z); d.rotation.set(0, 0, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.castShadow = true; this.stationGroup.add(im); return im; };
    mk(new T.BoxGeometry(14, 0.6, 9), 0xeeeeea, 5.2); mk(new T.BoxGeometry(14.2, 0.45, 9.2), 0xd63031, 4.8);
    mk(new T.BoxGeometry(0.9, 1.7, 0.7), 0xd63031, 0.85); mk(new T.CylinderGeometry(0.22, 0.22, 5, 8), 0xbbbbbb, 2.5);
    const pole = mk(new T.CylinderGeometry(0.25, 0.25, 11, 8), 0x999999, 5.5), d = new T.Object3D(); L.forEach((s, i) => { d.position.set(s.x + 9, 5.5, s.z + 6); d.updateMatrix(); pole.setMatrixAt(i, d.matrix); }); pole.instanceMatrix.needsUpdate = true;
    { const sg = mk(new T.BoxGeometry(3.2, 1.8, 0.4), 0xd63031, 10.5), dd = new T.Object3D(); L.forEach((s, i) => { dd.position.set(s.x + 9, 10.5, s.z + 6); dd.updateMatrix(); sg.setMatrixAt(i, dd.matrix); }); sg.instanceMatrix.needsUpdate = true; }
  }
  /** street lamps: shared geometry/material, instanced per chunk. Lit heads + additive light pools on the road at night. */
  _initLamps() {
    const T = this.T;
    this.lampGeos = new Set();
    this.lampPole = new T.CylinderGeometry(0.08, 0.13, 8, 6); this.lampHead = new T.BoxGeometry(0.5, 0.22, 1.5); this.lampPool = new T.PlaneGeometry(20, 20);
    for (const g of [this.lampPole, this.lampHead, this.lampPool]) this.lampGeos.add(g);
    const glow = this._canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,214,140,1)'); g.addColorStop(0.35, 'rgba(255,190,100,0.45)'); g.addColorStop(1, 'rgba(255,170,80,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    glow.wrapS = glow.wrapT = T.ClampToEdgeWrapping;
    this.mLampPole = this._reg(new T.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.7, metalness: 0.4 }), 0.4);
    this.mLampHead = new T.MeshBasicMaterial({ color: 0xffe4a0 });
    this.mLampPool = new T.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this._lp = {};
  }
  _chunkLamps(grp, x0, z0) {
    const T = this.T, w = this.world, runs = w.roadsInRect(x0, z0, x0 + CHUNK, z0 + CHUNK, 5), P = [];
    for (const u of runs) {
      const r = u.road, sp = r.cls <= 1 ? 45 : r.cls <= 4 ? 36 : 32, sEnd = r.cum[u.b];
      for (let s = Math.ceil(r.cum[u.a] / sp) * sp; s <= sEnd; s += sp) {
        const side = Math.floor(s / sp) % 2 ? 1 : -1, p = w.roadPoint(r, s, 0, this._lp), off = (r.halfW + 1.3) * side;
        const x = p.x + Math.cos(p.h) * off, z = p.z - Math.sin(p.h) * off;
        if (x < x0 || x >= x0 + CHUNK || z < z0 || z >= z0 + CHUNK) continue;
        P.push({ x, z, h: p.h, inx: -Math.cos(p.h) * side, inz: Math.sin(p.h) * side, hw: r.halfW });
      }
    }
    if (!P.length) return;
    const mk = (geo, mat, f) => { const im = new T.InstancedMesh(geo, mat, P.length), d = new T.Object3D(); P.forEach((q, i) => { f(d, q); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; grp.add(im); return im; };
    mk(this.lampPole, this.mLampPole, (d, q) => { d.position.set(q.x, 4, q.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
    mk(this.lampHead, this.mLampHead, (d, q) => { d.position.set(q.x + q.inx * 0.7, 8.1, q.z + q.inz * 0.7); d.rotation.set(0, q.h, 0); d.scale.set(1, 1, 1); });
    mk(this.lampPool, this.mLampPool, (d, q) => { d.position.set(q.x + q.inx * q.hw * 0.7, 0.25, q.z + q.inz * q.hw * 0.7); d.rotation.set(-Math.PI / 2, 0, 0); d.scale.set(1, 1, 1); });
  }
  /** railway materials, railway stations, waypoint beacon, pedestrians/animals */
  _initExtras() {
    const T = this.T, w = this.world;
    this.mRailBed = this._reg(new T.MeshStandardMaterial({ color: 0x716a61, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.2);
    this.mRailSteel = this._reg(new T.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.35, metalness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 0.9);
    // waypoint beacon (blue)
    this.wpBeacon = new T.Group(); this.wpBeacon.visible = false;
    const wm = new T.MeshBasicMaterial({ color: 0x3b9dff, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide, fog: false });
    const wp = new T.Mesh(new T.CylinderGeometry(5, 5, 220, 20, 1, true), wm); wp.position.y = 110; const wr = new T.Mesh(new T.RingGeometry(10, 13, 36), wm); wr.rotation.x = -Math.PI / 2; wr.position.y = 0.4;
    this.wpBeacon.add(wp); this.wpBeacon.add(wr); this.scene.add(this.wpBeacon);
    // railway stations: platform + canopy + building + name board, oriented along the nearest track
    const stoneM = this._reg(new T.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9 }), 0.4), roofM = this._reg(new T.MeshStandardMaterial({ color: 0x8a2f2a, roughness: 0.8 }), 0.4), bldM = this._reg(new T.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }), 0.4), postM = this._reg(new T.MeshStandardMaterial({ color: 0x555a60, roughness: 0.6 }), 0.4);
    this.railStationGroups = [];
    for (const st of w.railStations || []) {
      const g = new T.Group(), h = st.rail ? st.rail.h : 0, px = st.rail ? st.rail.x : st.x, pz = st.rail ? st.rail.z : st.z;
      const side = st.rail && ((st.x - px) * Math.cos(h) - (st.z - pz) * Math.sin(h)) < 0 ? -1 : 1, add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
      add(new T.BoxGeometry(5.5, 1.1, 90), stoneM, side * 4.8, 0.55, 0);                 // platform
      add(new T.BoxGeometry(5.2, 0.3, 70), roofM, side * 5.6, 4.6, 0);                  // canopy
      for (let z = -30; z <= 30; z += 15) add(new T.CylinderGeometry(0.15, 0.15, 3.6, 8), postM, side * 7.6, 2.9, z);
      add(new T.BoxGeometry(12, 5.5, 16), bldM, side * 14.5, 2.75, 0); add(new T.BoxGeometry(12.6, 0.5, 16.6), roofM, side * 14.5, 5.8, 0);   // station building
      const tex = this._canvasTex(512, 96, (x, ww, hh) => { x.fillStyle = '#1b4f9c'; x.fillRect(0, 0, ww, hh); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(5, 5, ww - 10, hh - 10); x.fillStyle = '#fff'; x.font = 'bold 46px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText(st.name.slice(0, 22).toUpperCase(), ww / 2, 62); });
      tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; const bm = new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }); this._reg(bm, 0.8);
      const board = new T.Mesh(new T.PlaneGeometry(10, 1.9), bm); board.position.set(side * 5.6, 3.3, 0); board.rotation.y = Math.PI / 2; g.add(board);
      g.position.set(px, 0, pz); g.rotation.y = h; this.scene.add(g); this.railStationGroups.push(g);
      if (this.labels) { const lt = this._canvasTex(512, 128, (x, ww, hh) => { x.fillStyle = 'rgba(27,79,156,0.88)'; x.fillRect(4, 4, ww - 8, hh - 8); x.fillStyle = '#fff'; x.font = 'bold 44px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('\u{1F689} ' + st.name.slice(0, 20), ww / 2, 76); }); lt.wrapS = lt.wrapT = T.ClampToEdgeWrapping; const sp = new T.Sprite(new T.SpriteMaterial({ map: lt, transparent: true, fog: false, depthWrite: false })); sp.scale.set(120, 30, 1); sp.position.set(px, 45, pz); this.scene.add(sp); this.labels.push({ s: sp, c: st }); }
    }
    // people & animals (instanced boxes, recoloured per instance)
    const mkI = (geo, n) => { const im = new T.InstancedMesh(geo, this._reg(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), 0.5), n); im.frustumCulled = false; im.castShadow = true; im.count = 0; this.scene.add(im); return im; };
    this.pedMax = 90; this.aniMax = 40;
    this.pedI = { torso: mkI(new T.BoxGeometry(0.5, 0.65, 0.28), this.pedMax), legs: mkI(new T.BoxGeometry(0.34, 0.8, 0.24), this.pedMax), head: mkI(new T.BoxGeometry(0.22, 0.25, 0.22), this.pedMax) };
    this.aniI = { body: mkI(new T.BoxGeometry(0.7, 0.8, 1.5), this.aniMax), legs: mkI(new T.BoxGeometry(0.5, 0.65, 1.2), this.aniMax), head: mkI(new T.BoxGeometry(0.32, 0.4, 0.55), this.aniMax) };
    this._pd = new T.Object3D(); this._pp = new T.Object3D(); this._pm = new T.Matrix4(); this._pc = new T.Color();
  }
  _pfSlot(kind, idx, tpl) {
    const T = this.T, pool = (this._pfPool || (this._pfPool = {}))[kind] || (this._pfPool[kind] = []); let s = pool[idx];
    if (!s || s.tpl !== tpl) {
      if (s) this.scene.remove(s.g);
      const g = new T.Group(), yawG = new T.Group(), inner = tpl.scene.clone(true); inner.scale.setScalar(tpl.scale); inner.position.set(-tpl.cx, tpl.footY, -tpl.cz); yawG.rotation.y = tpl.yaw || 0; yawG.add(inner); g.add(yawG);
      g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } }); this.scene.add(g); s = pool[idx] = { g, tpl };
    }
    return s;
  }
  setWaypoint(t) { if (!t) { this.wpBeacon.visible = false; return; } this.wpBeacon.visible = true; this.wpBeacon.position.set(t.x, 0, t.z); }
  /** list of {kind:'human'|'cow'|'dog'|'goat', x,z,h, lift, lie (0..1 fallen), phase, c1, c2} */
  updatePeds(list) {
    const P = this._pp, d = this._pd, M = this._pm, col = this._pc; let hn = 0, an = 0;
    const part = (im, i, ox, oy, oz, sx, sy, sz, c) => { d.position.set(ox, oy, oz); d.rotation.set(0, 0, 0); d.scale.set(sx, sy, sz); d.updateMatrix(); M.multiplyMatrices(P.matrix, d.matrix); im.setMatrixAt(i, M); if (c) { col.set(c); im.setColorAt(i, col); } };
    const pf = this.assets && this.assets.pf, cnt = { human: 0, cow: 0, dog: 0, goat: 0 }, CAP = { human: 14, cow: 5, dog: 4, goat: 5 };
    for (const p of list) {
      if (pf) {   // real Polyfork models for the nearest people/animals (pooled, bobbing/swaying as they walk); the box figures remain as the overflow
        const kind = p.kind, tl = kind === 'human' ? ((p.sc || 1) < 0.8 && pf.kids.length ? pf.kids : pf.humans) : pf.animals[kind];
        if (tl && tl.length && cnt[kind] < CAP[kind]) {
          let hsh = 0; const key = String(p.c1) + String(p.c2); for (let i = 0; i < key.length; i++) hsh = (hsh * 31 + key.charCodeAt(i)) >>> 0;
          const tpl = tl[hsh % tl.length], slot = this._pfSlot(kind, cnt[kind]++, tpl), sc = kind === 'human' ? Math.min(1.3, (p.sc || 1) * ((p.sc || 1) < 0.8 ? 1.2 : 1)) : 1;
          const bobY = p.lie ? 0 : Math.abs(Math.sin((p.phase || 0))) * (kind === 'human' ? 0.05 : 0.03);
          slot.g.visible = true; slot.g.position.set(p.x, (p.lift || 0) + bobY, p.z); slot.g.rotation.set(-(p.lie || 0) * 1.45, p.h, Math.sin(p.phase || 0) * 0.035); slot.g.scale.setScalar(sc); continue;
        }
      }
      P.position.set(p.x, p.lift || 0, p.z); P.rotation.order = 'YXZ'; P.rotation.set(-(p.lie || 0) * 1.45, p.h, 0); P.scale.set(1, 1, 1); P.updateMatrix();
      const bob = p.lie ? 0 : Math.sin(p.phase || 0) * 0.04;
      if (p.kind === 'human') { if (hn >= this.pedMax) continue; const sc = p.sc || 1; P.scale.set(sc, sc, sc); P.updateMatrix();
        part(this.pedI.legs, hn, 0, 0.4, 0, 1, 1, 1, p.c2); part(this.pedI.torso, hn, 0, 1.12 + bob, 0, 1, 1, 1, p.c1); part(this.pedI.head, hn, 0, 1.6 + bob, 0, 1, 1, 1, p.skin || '#a9744f'); hn++; }
      else { if (an >= this.aniMax) continue; const k = p.kind === 'cow' ? 1 : p.kind === 'goat' ? 0.55 : 0.36; P.scale.set(k, k, k); P.updateMatrix();
        part(this.aniI.legs, an, 0, 0.3, 0, 1, 1, 1, p.c2); part(this.aniI.body, an, 0, 0.98 + bob, 0, 1, 1, 1, p.c1); part(this.aniI.head, an, 0, 1.35 + bob, 0.95, 1, 1, 1, p.c1); an++; }
    }
    if (this._pfPool) for (const k of Object.keys(this._pfPool)) { const pool = this._pfPool[k]; for (let i = cnt[k] || 0; i < pool.length; i++) if (pool[i]) pool[i].g.visible = false; }
    for (const im of [...Object.values(this.pedI)]) { im.count = hn; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    for (const im of [...Object.values(this.aniI)]) { im.count = an; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  _beacon() {
    const T = this.T;
    this.beacon = new T.Group(); this.beacon.visible = false;
    this.beaconMat = new T.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.28, depthWrite: false, side: T.DoubleSide, fog: false });
    const pillar = new T.Mesh(new T.CylinderGeometry(7, 7, 160, 24, 1, true), this.beaconMat); pillar.position.y = 80;
    const ring = new T.Mesh(new T.RingGeometry(13, 16, 40), this.beaconMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4;
    this.beacon.add(pillar); this.beacon.add(ring); this.scene.add(this.beacon);
  }
  setBeacon(target, color) {
    if (!target) { this.beacon.visible = false; return; }
    this.beacon.visible = true; this.beacon.position.set(target.x, this.world.heightAt(target.x, target.z), target.z);
    this.beaconMat.color.set(color || '#ff4040');
  }

  /* ----------------------------------- cities ----------------------------------- */
  _station(c, grp) {
    const T = this.T, g = new T.Group();
    const roof = new T.Mesh(new T.BoxGeometry(22, 0.7, 12), this._reg(new T.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 }), 0.4)); roof.position.y = 5.4; roof.castShadow = true; g.add(roof);
    const band = new T.Mesh(new T.BoxGeometry(22.2, 0.5, 12.2), new T.MeshStandardMaterial({ color: 0xd63031, roughness: 0.5 })); band.position.y = 5.0; g.add(band);
    const postM = this._reg(new T.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.6 }), 0.4);
    for (const [x, z] of [[-9, -4.5], [9, -4.5], [-9, 4.5], [9, 4.5]]) { const p = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 5.2, 8), postM); p.position.set(x, 2.6, z); p.castShadow = true; g.add(p); }
    const pumpM = new T.MeshStandardMaterial({ color: 0xd63031, roughness: 0.5 });
    for (const x of [-5, 5]) for (const z of [-2.2, 2.2]) { const p = new T.Mesh(new T.BoxGeometry(0.9, 1.7, 0.7), pumpM); p.position.set(x, 0.85, z); p.castShadow = true; g.add(p); }
    const sign = this._canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#d63031'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = 'bold 60px system-ui'; x.textAlign = 'center'; x.fillText('FUEL', w / 2, 62); x.font = 'bold 32px system-ui'; x.fillText('Rs 105 / L', w / 2, 108); });
    sign.wrapS = sign.wrapT = T.ClampToEdgeWrapping;
    const board = new T.Mesh(new T.PlaneGeometry(6, 3), new T.MeshBasicMaterial({ map: sign })); board.position.set(0, 9.5, 0); g.add(board);
    const board2 = board.clone(); board2.rotation.y = Math.PI; g.add(board2);
    const pole = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 8, 8), postM); pole.position.set(0, 4, 0); g.add(pole);
    // job depot kiosk
    const kiosk = new T.Mesh(new T.BoxGeometry(5, 3.2, 4), new T.MeshStandardMaterial({ color: 0x2e86de, roughness: 0.5 })); kiosk.position.set(22, 1.6, -14); kiosk.castShadow = true; g.add(kiosk);
    const jsign = this._canvasTex(256, 96, (x, w, h) => { x.fillStyle = '#10375c'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd66b'; x.font = 'bold 44px system-ui'; x.textAlign = 'center'; x.fillText('JOBS  [J]', w / 2, 62); });
    jsign.wrapS = jsign.wrapT = T.ClampToEdgeWrapping;
    const jb = new T.Mesh(new T.PlaneGeometry(4.6, 1.7), new T.MeshBasicMaterial({ map: jsign })); jb.position.set(22, 4.5, -11.9); g.add(jb);
    g.position.set(c.plaza.x, c.y + 0.3, c.plaza.z); g.rotation.y = -c.angle; grp.add(g);
  }
  _ensureCity(c) {
    if (this.cityObjs.has(c.id)) return this.cityObjs.get(c.id);
    const T = this.T, grp = new T.Group();
    const b = new T.Mesh(this._geo(cityBuildings(c)), this.mBuilding); b.castShadow = true; b.receiveShadow = true; grp.add(b);
    const s = new T.Mesh(this._geo(cityStreets(this.world, c)), this.mStreet); s.receiveShadow = true; grp.add(s);
    const plaza = new T.Mesh(new T.BoxGeometry(56, 0.3, 56), this.mConcrete); plaza.position.set(c.plaza.x, c.y + 0.1, c.plaza.z); plaza.rotation.y = -c.angle; plaza.receiveShadow = true; grp.add(plaza);
    this._station(c, grp); this.scene.add(grp);
    const o = { grp, b }; this.cityObjs.set(c.id, o); return o;
  }

  /* ------------------------------------ chunks ------------------------------------ */
  _buildChunk(cx, cz) {
    const T = this.T, w = this.world, grp = new T.Group();
    const m = new T.Mesh(this._geo(terrainChunk(w, cx, cz)), this.mTerrain); m.receiveShadow = true; grp.add(m);
    if (w.buildingsInRect) { // real OSM tile: buildings + roads (geometry is local to the tile corner)
      const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
      const bg = osmBuildings(w.buildingsInRect(x0, z0, x1, z1), x0, z0);
      if (bg) { const bm = new T.Mesh(this._geo(bg), this.mBuilding); bm.position.set(x0, 0, z0); bm.castShadow = true; bm.receiveShadow = true; grp.add(bm); }
      this._chunkLamps(grp, x0, z0);
      const runs = w.roadsInRect(x0, z0, x1, z1), rg = osmRoads(runs, x0, z0), brg = osmBridges(w, runs, x0, z0);
      if (brg) { const bm = new T.Mesh(this._geo(brg), this.mBuilding); bm.position.set(x0, 0, z0); bm.castShadow = true; bm.receiveShadow = true; grp.add(bm); }
      const rl = osmRails(w.railsInRect(x0, z0, x1, z1), x0, z0);
      if (rl.bed) { const rm = new T.Mesh(this._geo(rl.bed), this.mRailBed); rm.position.set(x0, 0, z0); rm.receiveShadow = true; grp.add(rm); }
      if (rl.steel) { const rm = new T.Mesh(this._geo(rl.steel), this.mRailSteel); rm.position.set(x0, 0, z0); grp.add(rm); }
      if (rg.lo) { const rm = new T.Mesh(this._geo(rg.lo), this.mStreet); rm.position.set(x0, 0, z0); rm.receiveShadow = true; grp.add(rm); }
      if (rg.hi) { const rm = new T.Mesh(this._geo(rg.hi), this.mHighway); rm.position.set(x0, 0, z0); rm.receiveShadow = true; grp.add(rm); }
    }
    const trees = treesForChunk(w, cx, cz), round = trees.filter(t => !t.palm), palms = trees.filter(t => t.palm);
    const dummy = new T.Object3D(), col = new T.Color();
    const inst = (list, geo) => {
      if (!list.length) return;
      const im = new T.InstancedMesh(geo, this.mTree, list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(t.s, t.s * (0.9 + 0.2 * (t.tint - 0.85)), t.s); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix); col.setRGB(t.tint, t.tint * 1.02, t.tint * 0.95); im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; grp.add(im);
    };
    inst(round, this.geoRound); inst(palms, this.geoPalm);
    this.scene.add(grp); this.chunks.set(`${cx},${cz}`, grp);
  }
  _dropChunk(key) {
    const g = this.chunks.get(key); this.scene.remove(g);
    g.traverse(o => { if (o.geometry && o.geometry !== this.geoRound && o.geometry !== this.geoPalm && !this.lampGeos.has(o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh && o.dispose) o.dispose(); });
    this.chunks.delete(key);
  }
  /** budget = chunks to build this call (use a large number for the initial load) */
  updateChunks(px, pz, budget = 1) {
    const R = this.q.radius, ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK), want = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz; if (d2 > (R + 0.4) ** 2) continue;
      const key = `${ccx + dx},${ccz + dz}`; if (!this.chunks.has(key)) want.push([d2, ccx + dx, ccz + dz]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(budget, want.length); i++) this._buildChunk(want[i][1], want[i][2]);
    for (const key of [...this.chunks.keys()]) {
      const [x, z] = key.split(',').map(Number);
      if ((x - ccx) ** 2 + (z - ccz) ** 2 > (R + 1.6) ** 2) this._dropChunk(key);
    }
    return want.length;
  }

  /* --------------------------------- vehicles & NPCs --------------------------------- */
  /** get/create a model for key; recreates if type changed */
  model(key, type, color, npc) {
    let m = this.models.get(key);
    if (m && m.type !== type) { this.scene.remove(m.group); m.dispose(); m = null; }
    if (!m) { m = this.models3d.create(type, color, npc); m.prevX = null; m.group.traverse(o => { if (o.isMesh) o.receiveShadow = false; }); this.scene.add(m.group); this.models.set(key, m); }
    if (m.color !== color) m.setColor(color);
    return m;
  }
  removeModel(key) { const m = this.models.get(key); if (!m) return; this.scene.remove(m.group); m.dispose(); this.models.delete(key); }
  /* ---- on-foot character ---- */
  setFoot(p) {
    const T = this.T; if (!p) { if (this.foot) { this.scene.remove(this.foot.g); this.foot = null; } return; }
    if (!this.foot) {
      const mk = (w, h, d, c) => new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color: c })), g = new T.Group(), body = new T.Group(); g.add(body);
      const torso = mk(0.5, 0.7, 0.28, p.c1 || '#2980b9'); torso.position.y = 1.15; const head = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), new T.MeshStandardMaterial({ color: p.skin || '#c68b59' })); head.position.y = 1.67;
      const leg = x => { const pv = new T.Group(); pv.position.set(x, 0.8, 0); const l = mk(0.2, 0.8, 0.22, '#2c3e50'); l.position.y = -0.4; pv.add(l); return pv; }, arm = x => { const pv = new T.Group(); pv.position.set(x, 1.45, 0); const l = mk(0.14, 0.62, 0.16, p.c1 || '#2980b9'); l.position.y = -0.3; pv.add(l); return pv; };
      const lL = leg(-0.13), lR = leg(0.13), aL = arm(-0.34), aR = arm(0.34); body.add(torso, head, lL, lR, aL, aR); this.scene.add(g); this.foot = { g, body, lL, lR, aL, aR };
    }
    const f = this.foot, sw = Math.sin(p.phase || 0) * (p.moving || 0) * 0.9; f.g.position.set(p.x, p.y, p.z); f.g.rotation.y = p.h; f.g.scale.setScalar(p.s || 1);
    f.lL.rotation.x = sw; f.lR.rotation.x = -sw; f.aL.rotation.x = -sw * 0.8; f.aR.rotation.x = sw * 0.8; f.body.rotation.x = (p.moving || 0) * 0.08; if (p.air) { f.lL.rotation.x = -0.6; f.lR.rotation.x = 0.4; f.aL.rotation.x = f.aR.rotation.x = -2.2; }
  }
  /* ---- roof gun + tracers ---- */
  attachGun(m, type) {
    if (m.gun) return m.gun; const T = this.T, o = (m.mount ? m.mount.slice() : null) || { car: [0, 1.55, -0.3], bus: [0, 3.25, 0.5], lorry: [0, 3.1, 1.2] }[type] || [0, 1.6, 0];
    if (!m.mount) o[0] = -0.85; if (m.mount) o[0] = -0.85, o[1] = Math.max(1.0, o[1] - 0.45), o[2] = 0.4;
    const yawG = new T.Group(), pitchG = new T.Group(), mat = new T.MeshStandardMaterial({ color: 0x2b2f36 }), mat2 = new T.MeshStandardMaterial({ color: 0x555b66 });
    const base = new T.Mesh(new T.CylinderGeometry(0.32, 0.4, 0.22, 10), mat), body = new T.Mesh(new T.BoxGeometry(0.34, 0.3, 0.7), mat2), barrel = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.1, 8), mat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.85); body.position.set(0, 0, 0.1); pitchG.position.y = 0.3; pitchG.add(body, barrel);
    const flash = new T.Mesh(new T.SphereGeometry(0.16, 6, 6), new T.MeshBasicMaterial({ color: 0xffd24a })); flash.position.set(0, 0, 0.9); flash.visible = false; pitchG.add(flash);
    base.visible = body.visible = barrel.visible = false; yawG.add(base, pitchG); yawG.position.set(o[0], o[1], o[2]); m.group.add(yawG); m.gun = { yawG, pitchG, flash, muzzleH: o[1] + 0.3, z: o[2], flashT: 0 }; return m.gun;
  }
  aimGun(m, worldYaw, pitch, carH) { const g = m.gun; if (!g) return; g.yawG.rotation.y = worldYaw - carH; g.pitchG.rotation.x = -pitch; }
  gunFlash(m) { if (m.gun) { m.gun.flash.visible = true; m.gun.flashT = 0.05; } }
  tracer(x0, y0, z0, x1, y1, z1) {
    const T = this.T; if (!this.tracers) this.tracers = [];
    const g = new T.BufferGeometry().setFromPoints([new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1)]), l = new T.Line(g, new T.LineBasicMaterial({ color: 0xffe27a }));
    this.scene.add(l); this.tracers.push({ l, t: 0.07 });
  }
  tickFx(dt) {
    if (this.tracers) for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; if ((t.t -= dt) <= 0) { this.scene.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); this.tracers.splice(i, 1); } }
    for (const m of this.models.values()) if (m.gun && m.gun.flashT > 0 && (m.gun.flashT -= dt) <= 0) m.gun.flash.visible = false;
  }
  /** place a model. pose = {x,z,h,y,pitch,roll,steer,brake,lights,reverse,ax,ay} */
  placeModel(m, pose) {
    const g = m.group; g.position.set(pose.x, pose.y, pose.z); g.rotation.order = 'YXZ';
    g.rotation.set(-(pose.pitch || 0), pose.h, pose.roll || 0);
    let dist = 0; if (m.prevX !== null) dist = Math.hypot(pose.x - m.prevX, pose.z - m.prevZ) * (pose.reverse ? -1 : (pose.signed === undefined ? 1 : Math.sign(pose.signed || 1)));
    if (Math.abs(dist) > 20) dist = 0; m.prevX = pose.x; m.prevZ = pose.z;
    m.update({ steer: pose.steer || 0, brake: pose.brake, lights: pose.lights, reverse: pose.reverse, dist, ax: pose.ax, ay: pose.ay });
  }
  _npcInit() {
    const rnd = mulberry32(2024), w = this.world; this.npcs = [];
    const roads = w.trafficRoads || w.roads.filter(r => r.kind !== 'ghat');
    const colors = ['#e74c3c', '#f1c40f', '#ecf0f1', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#bdc3c7', '#1abc9c', '#c0392b'];
    const near = roads.filter(r => { const x = r.pts[0], z = r.pts[1]; for (const c of w.cities) if ((c.x - x) ** 2 + (c.z - z) ** 2 < 7000 * 7000) return true; return false; }), pool = near.length > 40 ? near : roads;
    for (let i = 0; i < 340; i++) {
      const road = pool[Math.floor(rnd() * pool.length)], r = rnd();
      const type = r < 0.5 ? 'car' : r < 0.78 ? 'bike' : r < 0.9 ? 'bus' : 'lorry';
      const speed = type === 'car' ? 17 + rnd() * 10 : type === 'bike' ? 15 + rnd() * 9 : type === 'bus' ? 13 + rnd() * 6 : 11 + rnd() * 6;
      this.npcs.push({ id: i, road, s0: rnd() * road.len * 2, speed, type, color: colors[Math.floor(rnd() * colors.length)] });
    }
    this.npcPos = this.npcs.map(() => ({ x: 0, z: 0, y: 0, h: 0 })); this._rp = {};
  }
  takeNPC(i, serverSec) { const n = this.npcs[i]; if (!n) return; n.goneUntil = serverSec + 150; if (this.models.has('npc' + n.id)) this.removeModel('npc' + n.id); }
  /** positions are analytic (ping-pong along each road) so every client sees the same ambient traffic */
  updateNPCs(serverSec, focus, night) {
    const w = this.world, dt = Math.min(0.1, this._dt || 0.016), fp = this.footPos;
    let shown = 0;   // cap the number of drawn traffic vehicles (each is a real 3D model) - big frame-rate saver on phones
    this.npcs.forEach((n, i) => {
      if (n.goneUntil) { if (serverSec < n.goneUntil) { const q = this.npcPos[i]; q.x = q.z = -1e9; if (this.models.has('npc' + n.id)) this.removeModel('npc' + n.id); return; } n.goneUntil = 0; }
      if (n.v === undefined) { n.v = 1; n.off = 0; }
      // a person on foot standing near the road makes traffic brake to a stop (so you can jack it)
      { const q = this.npcPos[i]; let want = 1; if (fp) { const d = Math.hypot(q.x - fp.x, q.z - fp.z); if (d < 26) want = Math.max(0, Math.min(1, (d - 5) / 18)); } n.v += (want - n.v) * Math.min(1, dt * (want < n.v ? 2.2 : 1.0)); n.off -= n.speed * (1 - n.v) * dt; }
      const L = n.road.len, ph = (((n.s0 + n.off + n.speed * serverSec) % (2 * L)) + 2 * L) % (2 * L), fwd = ph < L, s = fwd ? ph : 2 * L - ph;
      const p = w.roadPoint(n.road, s, fwd ? 2.6 : -2.6, this._rp);           // drive on the left of travel
      const pos = this.npcPos[i]; pos.x = p.x; pos.z = p.z; pos.y = p.y; pos.h = fwd ? p.h : p.h + Math.PI; pos.type = n.type;
      const d2 = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2, key = 'npc' + n.id;
      if (d2 < 330 * 330 && shown < 26) { shown++; const m = this.model(key, n.type, n.color, true); this.placeModel(m, { ...pos, lights: night, steer: 0 }); m.group.visible = true; }
      else if (this.models.has(key)) this.removeModel(key);
    });
  }

  /* ------------------------------------ per frame ------------------------------------ */
  /** tod: 0..1 (0.25 sunrise, 0.5 noon, 0.75 sunset) */
  applyTime(tod, focus) {
    const T = this.T, el = Math.sin((tod - 0.25) * Math.PI * 2);        // sun elevation -1..1
    const a = (tod - 0.25) * Math.PI * 2, sx = Math.cos(a), sy = el, sz = 0.35;
    const il = 1 / Math.hypot(sx, sy, sz), dir = [sx * il, sy * il, sz * il];
    const dayf = smooth(-0.12, 0.28, el), tw = Math.exp(-(((el - 0.02) / 0.16) ** 2));
    this.dayf = dayf;
    const H = [lerp(0.34, 0.72, dayf), lerp(0.09, 0.84, dayf), lerp(0.40, 0.96, dayf)], Z = [lerp(0.05, 0.22, dayf), lerp(0.03, 0.46, dayf), lerp(0.26, 0.86, dayf)];   // night: Vice-City magenta haze over a deep violet sky
    const hz = [lerp(H[0], 1.0, tw * 0.75), lerp(H[1], 0.55, tw * 0.75), lerp(H[2], 0.32, tw * 0.75)];
    const u = this.skyMat.uniforms;
    u.uHorizon.value.setRGB(hz[0], hz[1], hz[2], T.SRGBColorSpace); u.uZenith.value.setRGB(Z[0], Z[1], Z[2], T.SRGBColorSpace);
    u.uSunDir.value.set(dir[0], dir[1], dir[2]); u.uSunColor.value.setRGB(1, lerp(0.55, 0.92, clamp(el * 2, 0, 1)), lerp(0.3, 0.78, clamp(el * 2, 0, 1)), T.SRGBColorSpace);
    u.uStars.value = 1 - smooth(-0.15, 0.08, el);
    this.scene.fog.color.setRGB(hz[0], hz[1], hz[2], T.SRGBColorSpace);
    this.hemi.color.setRGB(lerp(0.52, 0.72, dayf), lerp(0.36, 0.84, dayf), lerp(0.85, 1, dayf), T.SRGBColorSpace);
    this.hemi.groundColor.setRGB(lerp(0.32, 0.42, dayf), lerp(0.14, 0.36, dayf), lerp(0.36, 0.25, dayf), T.SRGBColorSpace);
    this.hemi.intensity = lerp(0.95, 1.15, dayf);
    this.sun.color.setRGB(1, lerp(0.62, 0.95, clamp(el * 2.2, 0, 1)), lerp(0.4, 0.88, clamp(el * 2.2, 0, 1)), T.SRGBColorSpace);
    this.sun.intensity = 3.4 * Math.pow(Math.max(el, 0), 0.55);
    const f = this.sunFocus || (this.sunFocus = { x: 0, y: 0, z: 0 });
    f.x = Math.round(focus.x / 4) * 4; f.y = focus.y; f.z = Math.round(focus.z / 4) * 4;
    const night = el < -0.02;
    const lx = night ? -dir[0] : dir[0], ly = night ? -dir[1] : dir[1], lz = night ? -dir[2] : dir[2]; // moon opposite the sun
    this.sun.position.set(f.x + dir[0] * 260, f.y + Math.max(dir[1], 0.12) * 260, f.z + dir[2] * 260); this.sun.target.position.set(f.x, f.y, f.z);
    this.moon.position.set(focus.x + lx * 100, focus.y + Math.abs(ly) * 100 + 20, focus.z + lz * 100); this.moon.intensity = 1.5 * (1 - dayf); this.moon.color.setRGB(0.62, 0.66, 1.0, T.SRGBColorSpace);
    this.renderer.toneMappingExposure = lerp(1.7, 0.95, dayf);
    this.mBuilding.emissiveIntensity = (1 - smooth(-0.05, 0.12, el)) * 2.6;
    { const night = 1 - smooth(-0.1, 0.16, el); if (this.mLampPool) { this.mLampPool.opacity = night * 0.95; this.mLampHead.color.setRGB(lerp(0.42, 1.0, night), lerp(0.4, 0.88, night), lerp(0.36, 0.55, night)); } }
    const ei = 0.4 + 0.6 * dayf;
    if (Math.abs(ei - this.lastEnv) > 0.01) {
      this.lastEnv = ei;
      for (const e of this.envMats) e.m.envMapIntensity = e.base * ei;
      for (const m of this.models3d.envMats) m.envMapIntensity = ei;
      for (const m of this.models3d.paintMats) m.envMapIntensity = 1.2 * ei;
    }
    return { night: dayf < 0.35, el };
  }
  update(dt, focus, tod, serverSec, headlightsOn) {
    const T = this.T; this.time += dt; this._dt = dt;
    const info = this.applyTime(tod, focus);
    this.sky.position.copy(this.camera.position); this.sky.scale.setScalar(3000);
    this.water.position.x = Math.round(focus.x / 60) * 60; this.water.position.z = Math.round(focus.z / 60) * 60;
    this.texWater.offset.set(focus.x / 60 + this.time * 0.01, -focus.z / 60 + this.time * 0.006);
    this.updateNPCs(serverSec, focus, info.night);
    const pulse = 0.2 + 0.1 * Math.sin(this.time * 3); if (this.beacon.visible) this.beaconMat.opacity = pulse + 0.08;
    for (const l of this.labels) { const d = Math.hypot(l.s.position.x - this.camera.position.x, l.s.position.z - this.camera.position.z), k = clamp(d * 0.035, 8, 120); l.s.visible = d < 9000 && d > 350; l.s.scale.set(k * 4, k, 1); }
    if (this.lamp) this.lamp.material.color.setRGB(1, 0.95, info.night ? 0.7 : 0.4);
    return info;
  }
  /** headlight beam attached to the player's vehicle */
  setHeadlight(on, veh, spec) {
    const h = this.headlight;
    if (!on) { h.intensity = 0; return; }
    h.intensity = 90; const fx = Math.sin(veh.h), fz = Math.cos(veh.h);
    h.position.set(veh.x + fx * spec.len * 0.45, veh.y + 1.0, veh.z + fz * spec.len * 0.45);
    h.target.position.set(veh.x + fx * 40, veh.y + 0.2, veh.z + fz * 40);
  }
  toScreen(x, y, z, out = {}) {
    const v = this._v || (this._v = new this.T.Vector3()); v.set(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * window.innerWidth; out.y = (-v.y * 0.5 + 0.5) * window.innerHeight; out.visible = v.z < 1 && v.z > -1; return out;
  }
  setQuality(name) {
    this.qName = name; this.q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr) * (this.dyn || 1));
    this.renderer.shadowMap.enabled = this.q.shadows; this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  /** dynamic resolution: f in 0.55..1 scales the render resolution without touching the HUD */
  setDyn(f) { f = Math.max(0.55, Math.min(1, f)); if (Math.abs(f - this.dyn) < 0.01) return; this.dyn = f; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr) * f); this.resize(); }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
