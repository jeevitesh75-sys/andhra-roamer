// A Proxy-based stand-in for THREE used ONLY for smoke tests in a sandbox with no CDN access.
// It records constructor calls and lets code run end-to-end to catch typos / wrong data flow. It cannot check visuals.
export function makeMockThree() {
  const calls = {};
  const mk = name => {
    const target = function () {};
    const p = new Proxy(target, {
      construct(_t, args) { calls[name] = (calls[name] || 0) + 1; return makeInstance(name, args); },
      get(_t, k) { if (k === 'prototype') return {}; return undefined; },
    });
    return p;
  };
  const makeInstance = (cls, args) => {
    const store = { __cls: cls, __args: args };
    if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Float32Array)) for (const [k, v] of Object.entries(args[0])) if (!['color', 'emissive', 'groundColor'].includes(k)) store[k] = v; // real three.js copies options onto the material (colours become Color objects)
    if (/Mesh|Sprite/.test(cls)) { store.geometry = args[0]; store.material = args[1]; }
    const fn = function () {};
    const inst = new Proxy(fn, {
      get(_t, k) {
        if (k in store && store[k] !== undefined) return store[k];
        if (k === Symbol.toPrimitive) return () => 0;
        if (k === 'then') return undefined;
        if (k === 'isMesh') return /Mesh/.test(cls);
        if (['position', 'rotation', 'scale', 'quaternion', 'color', 'matrix', 'up', 'offset', 'repeat', 'center', 'emissive', 'groundColor'].includes(k)) {
          const v = makeVec(); store[k] = v; return v;
        }
        if (['children'].includes(k)) { store[k] = store[k] || []; return store[k]; }
        if (k === 'target') { const o = makeInstance('Object3D', []); store.target = o; return o; }
        if (k === 'array') { store.array = new Float32Array(1024); return store.array; }
        if (['attributes'].includes(k)) { const o = { position: inst, normal: inst, color: inst, uv: inst, instanceMatrix: inst }; store[k] = o; return o; }
        if (k === 'capabilities') return { getMaxAnisotropy: () => 8 };
        if (k === 'domElement') return { addEventListener() {}, style: {} };
        if (k === 'shadow') { const s = { camera: makeVec(), mapSize: makeVec(), bias: 0 }; store.shadow = s; return s; }
        if (k === 'map' || k === 'texture') return inst;
        return (...a) => { if (k === 'add') { store.children = store.children || []; store.children.push(...a); } return inst; };
      },
      set(_t, k, v) { store[k] = v; return true; },
      has() { return true; },
    });
    return inst;
  };
  const makeVec = () => { const v = { x: 0, y: 0, z: 0, w: 1, set(...a) { [this.x, this.y, this.z] = a; return this; }, copy() { return this; }, setScalar() { return this; }, lerp() { return this; }, add() { return this; }, sub() { return this; }, normalize() { return this; }, multiplyScalar() { return this; }, clone() { return makeVec(); }, setRGB() { return this; }, setHex() { return this; }, getHex() { return 0xffffff; }, offsetHSL() { return this; }, setHSL() { return this; }, equals() { return false; }, length() { return 1; }, applyMatrix4() { return this; }, project() { return this; }, setFromMatrixPosition() { return this; }, setFromEuler() { return this; }, setFromAxisAngle() { return this; }, compose() { return this; }, order: 'XYZ', isEuler: true }; return v; };
  const THREE = new Proxy({}, {
    get(_t, k) {
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z]/.test(k) && /Line|Geometry|Mesh|Material|Light|Group|Scene|Camera|Object3D|Color|Vector|Texture|Sprite|Shape|Attribute|Renderer|Fog|Matrix|Euler|Quaternion|Generator|Helper|Raycaster|Clock|Float|Plane|Box|Cylinder|Sphere|Ring|Torus/.test(k)) return mk(k);
      return 0; // enums / constants (SRGBColorSpace, DoubleSide, ...)
    },
  });
  return { THREE, calls };
}
