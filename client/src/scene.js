// three.js world renderer. THREE is injected so the module has no import-map dependency.
import { CHUNK, terrainChunk, roadPieces, cityStreets, cityBuildings, roundTreeGeometry, palmGeometry, treesForChunk } from './meshbuild.js';
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
  constructor(T, canvas, world, quality = 'medium') {
    this.T = T; this.world = world; this.canvas = canvas; this.qName = quality; this.q = QUALITY[quality];
    this.time = 0; this.dayf = 1; this.chunks = new Map(); this.cityObjs = new Map(); this.models = new Map(); this.npcModels = new Map();
    this.envMats = []; this.lastEnv = -1; this.buildQueue = [];
    const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr));
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = this.q.shadows; r.shadowMap.type = T.PCFSoftShadowMap;
    this.maxAniso = r.capabilities.getMaxAnisotropy ? Math.min(8, r.capabilities.getMaxAnisotropy()) : 1;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(65, 1, 0.3, 7000);
    this.scene.fog = new T.FogExp2(0xb8d4ee, 0.00105);
    this.cHorizon = new T.Color(); this.cZenith = new T.Color(); this.cSun = new T.Color(); this.tmpC = new T.Color();
    this.models3d = createModels(T);
    this._textures(); this._materials(); this._sky(); this._lights(); this._water(); this._envMap();
    this._roads(); this._landmarks(); this._labels(); this._npcInit(); this._beacon();
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
    this.mBuilding = e(new T.MeshStandardMaterial({ vertexColors: true, map: this.texFacade, emissive: 0xffffff, emissiveMap: this.texLit, emissiveIntensity: 0, roughness: 0.85, metalness: 0 }), 0.4);
    this.mTree = e(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: T.DoubleSide }), 0.25);
    this.mConcrete = e(new T.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.95 }), 0.3);
    this.geoRound = this._geo(roundTreeGeometry()); this.geoPalm = this._geo(palmGeometry());
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
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = 0; this.water.renderOrder = 1; this.scene.add(this.water);
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
    for (const c of this.world.cities) {
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
    g.traverse(o => { if (o.geometry && o.geometry !== this.geoRound && o.geometry !== this.geoPalm) o.geometry.dispose(); if (o.isInstancedMesh && o.dispose) o.dispose(); });
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
    for (const c of this.world.cities) {
      const d = Math.hypot(px - c.x, pz - c.z), near = d < c.R + CHUNK * (R - 0.6);
      if (near) { const o = this._ensureCity(c); o.grp.visible = true; } else { const o = this.cityObjs.get(c.id); if (o) o.grp.visible = d < c.R + CHUNK * (R + 1); }
    }
    return want.length;
  }

  /* --------------------------------- vehicles & NPCs --------------------------------- */
  /** get/create a model for key; recreates if type changed */
  model(key, type, color) {
    let m = this.models.get(key);
    if (m && m.type !== type) { this.scene.remove(m.group); m.dispose(); m = null; }
    if (!m) { m = this.models3d.create(type, color); m.prevX = null; m.group.traverse(o => { if (o.isMesh) o.receiveShadow = false; }); this.scene.add(m.group); this.models.set(key, m); }
    if (m.color !== color) m.setColor(color);
    return m;
  }
  removeModel(key) { const m = this.models.get(key); if (!m) return; this.scene.remove(m.group); m.dispose(); this.models.delete(key); }
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
    const roads = w.roads.filter(r => r.kind !== 'ghat');
    const colors = ['#e74c3c', '#f1c40f', '#ecf0f1', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#bdc3c7', '#1abc9c', '#c0392b'];
    for (let i = 0; i < 90; i++) {
      const road = roads[Math.floor(rnd() * roads.length)], r = rnd();
      const type = r < 0.55 ? 'car' : r < 0.75 ? 'bus' : 'lorry';
      const speed = type === 'car' ? 17 + rnd() * 10 : type === 'bus' ? 13 + rnd() * 6 : 11 + rnd() * 6;
      this.npcs.push({ id: i, road, s0: rnd() * road.len * 2, speed, type, color: colors[Math.floor(rnd() * colors.length)] });
    }
    this.npcPos = this.npcs.map(() => ({ x: 0, z: 0, y: 0, h: 0 })); this._rp = {};
  }
  /** positions are analytic (ping-pong along each road) so every client sees the same ambient traffic */
  updateNPCs(serverSec, focus, night) {
    const w = this.world;
    this.npcs.forEach((n, i) => {
      const L = n.road.len, ph = (n.s0 + n.speed * serverSec) % (2 * L), fwd = ph < L, s = fwd ? ph : 2 * L - ph;
      const p = w.roadPoint(n.road, s, fwd ? 2.6 : -2.6, this._rp);           // drive on the left of travel
      const pos = this.npcPos[i]; pos.x = p.x; pos.z = p.z; pos.y = p.y; pos.h = fwd ? p.h : p.h + Math.PI; pos.type = n.type;
      const d2 = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2, key = 'npc' + n.id;
      if (d2 < 900 * 900) { const m = this.model(key, n.type, n.color); this.placeModel(m, { ...pos, lights: night, steer: 0 }); m.group.visible = true; }
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
    const H = [lerp(0.04, 0.72, dayf), lerp(0.06, 0.84, dayf), lerp(0.13, 0.96, dayf)], Z = [lerp(0.01, 0.22, dayf), lerp(0.02, 0.46, dayf), lerp(0.07, 0.86, dayf)];
    const hz = [lerp(H[0], 1.0, tw * 0.75), lerp(H[1], 0.55, tw * 0.75), lerp(H[2], 0.32, tw * 0.75)];
    const u = this.skyMat.uniforms;
    u.uHorizon.value.setRGB(hz[0], hz[1], hz[2], T.SRGBColorSpace); u.uZenith.value.setRGB(Z[0], Z[1], Z[2], T.SRGBColorSpace);
    u.uSunDir.value.set(dir[0], dir[1], dir[2]); u.uSunColor.value.setRGB(1, lerp(0.55, 0.92, clamp(el * 2, 0, 1)), lerp(0.3, 0.78, clamp(el * 2, 0, 1)), T.SRGBColorSpace);
    u.uStars.value = 1 - smooth(-0.15, 0.08, el);
    this.scene.fog.color.setRGB(hz[0], hz[1], hz[2], T.SRGBColorSpace);
    this.hemi.color.setRGB(lerp(0.12, 0.72, dayf), lerp(0.16, 0.84, dayf), lerp(0.3, 1, dayf), T.SRGBColorSpace);
    this.hemi.groundColor.setRGB(lerp(0.05, 0.42, dayf), lerp(0.05, 0.36, dayf), lerp(0.06, 0.25, dayf), T.SRGBColorSpace);
    this.hemi.intensity = lerp(0.18, 1.15, dayf);
    this.sun.color.setRGB(1, lerp(0.62, 0.95, clamp(el * 2.2, 0, 1)), lerp(0.4, 0.88, clamp(el * 2.2, 0, 1)), T.SRGBColorSpace);
    this.sun.intensity = 3.4 * Math.pow(Math.max(el, 0), 0.55);
    const f = this.sunFocus || (this.sunFocus = { x: 0, y: 0, z: 0 });
    f.x = Math.round(focus.x / 4) * 4; f.y = focus.y; f.z = Math.round(focus.z / 4) * 4;
    const night = el < -0.02;
    const lx = night ? -dir[0] : dir[0], ly = night ? -dir[1] : dir[1], lz = night ? -dir[2] : dir[2]; // moon opposite the sun
    this.sun.position.set(f.x + dir[0] * 260, f.y + Math.max(dir[1], 0.12) * 260, f.z + dir[2] * 260); this.sun.target.position.set(f.x, f.y, f.z);
    this.moon.position.set(focus.x + lx * 100, focus.y + Math.abs(ly) * 100 + 20, focus.z + lz * 100); this.moon.intensity = 0.55 * (1 - dayf);
    this.renderer.toneMappingExposure = lerp(1.25, 0.95, dayf);
    this.mBuilding.emissiveIntensity = (1 - smooth(-0.05, 0.12, el)) * 1.6;
    const ei = 0.12 + 0.88 * dayf;
    if (Math.abs(ei - this.lastEnv) > 0.01) {
      this.lastEnv = ei;
      for (const e of this.envMats) e.m.envMapIntensity = e.base * ei;
      for (const m of this.models3d.envMats) m.envMapIntensity = ei;
      for (const m of this.models3d.paintMats) m.envMapIntensity = 1.2 * ei;
    }
    return { night: dayf < 0.35, el };
  }
  update(dt, focus, tod, serverSec, headlightsOn) {
    const T = this.T; this.time += dt;
    const info = this.applyTime(tod, focus);
    this.sky.position.copy(this.camera.position); this.sky.scale.setScalar(3000);
    this.water.position.x = Math.round(focus.x / 60) * 60; this.water.position.z = Math.round(focus.z / 60) * 60;
    this.texWater.offset.set(focus.x / 60 + this.time * 0.01, -focus.z / 60 + this.time * 0.006);
    this.updateNPCs(serverSec, focus, info.night);
    const pulse = 0.2 + 0.1 * Math.sin(this.time * 3); if (this.beacon.visible) this.beaconMat.opacity = pulse + 0.08;
    for (const l of this.labels) { const d = Math.hypot(l.s.position.x - this.camera.position.x, l.s.position.z - this.camera.position.z); l.s.visible = d < 6500 && d > 60; }
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr));
    this.renderer.shadowMap.enabled = this.q.shadows; this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
