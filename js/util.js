/* Cascade Lines — shared helpers */
(function () {
  'use strict';
  const G = (window.G = {});
  G.TAU = Math.PI * 2;
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  G.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  G.wrapPi = (a) => { a = (a + Math.PI) % G.TAU; if (a < 0) a += G.TAU; return a - Math.PI; };

  G.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  G.hashStr = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  function h2(x, y, seed) {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  G.noise2 = function (x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h2(ix, iy, seed), b = h2(ix + 1, iy, seed), c = h2(ix, iy + 1, seed), d = h2(ix + 1, iy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  G.fbm = (x, y, seed) =>
    G.noise2(x, y, seed) * 0.6 + G.noise2(x * 2.1, y * 2.1, seed + 17) * 0.28 + G.noise2(x * 4.3, y * 4.3, seed + 31) * 0.12;

  G.fmt = (n) => Math.round(n).toLocaleString('en-US');
  G.fmtTime = function (t) {
    if (!isFinite(t)) return '--:--.-';
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  };
  G.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Merge primitive geometries into one non-indexed geometry with vertex colours.
     parts: [{ g: BufferGeometry, color: [r,g,b] | (x,y,z)=>[r,g,b], m?: Matrix4 }] */
  G.mergeGeos = function (parts) {
    const T = window.THREE;
    let total = 0;
    const prep = parts.map((p) => {
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      if (p.m) g.applyMatrix4(p.m);
      if (!g.attributes.normal) g.computeVertexNormals();
      total += g.attributes.position.count;
      return { g, p };
    });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const { g, p } of prep) {
      const pa = g.attributes.position.array, na = g.attributes.normal.array, n = g.attributes.position.count;
      pos.set(pa, o * 3); nor.set(na, o * 3);
      for (let i = 0; i < n; i++) {
        const c = typeof p.color === 'function' ? p.color(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]) : p.color;
        col[(o + i) * 3] = c[0]; col[(o + i) * 3 + 1] = c[1]; col[(o + i) * 3 + 2] = c[2];
      }
      o += n;
      g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    return out;
  };
  G.hex3 = function (hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
})();
