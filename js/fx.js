/* Cascade Lines — snow spray, ski tracks and synthesised sound */
(function () {
  'use strict';
  const G = window.G, T = window.THREE;

  /* ---------------- particles ---------------- */
  class Particles {
    constructor(scene, max) {
      this.max = max; this.i = 0;
      this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
      this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3);
      this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.s0 = new Float32Array(max);
      const g = (this.geo = new T.BufferGeometry());
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
      g.setAttribute('aSize', new T.BufferAttribute(this.size, 1));
      g.setAttribute('aAlpha', new T.BufferAttribute(this.alpha, 1));
      g.setAttribute('aColor', new T.BufferAttribute(this.col, 3));
      this.mat = new T.ShaderMaterial({
        uniforms: { uScale: { value: 600 } },
        vertexShader: 'attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC; void main(){ vA=aAlpha; vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.5,-mv.z); gl_Position=projectionMatrix*mv; }',
        fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d); if(r>0.25) discard; gl_FragColor=vec4(vC, vA*smoothstep(0.25,0.03,r)); }',
        transparent: true, depthWrite: false,
      });
      this.points = new T.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
    }
    emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav) {
      const i = this.i; this.i = (i + 1) % this.max;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.life[i] = life; this.maxLife[i] = life; this.s0[i] = size; this.grav[i] = grav === undefined ? 7 : grav;
      this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    }
    update(dt) {
      const { pos, vel, life, maxLife, size, alpha, s0, grav, max } = this;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt; const o = i * 3;
        vel[o + 1] -= grav[i] * dt; vel[o] *= 1 - 1.4 * dt; vel[o + 2] *= 1 - 1.4 * dt;
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        const t = Math.max(0, life[i] / maxLife[i]);
        alpha[i] = t * 0.8; size[i] = s0[i] * (1.9 - 0.9 * t);
      }
      const a = this.geo.attributes; a.position.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true; a.aColor.needsUpdate = true;
    }
    dispose() { this.geo.dispose(); this.mat.dispose(); }
  }
  G.Particles = Particles;

  /* ---------------- tracks in the snow ---------------- */
  class Tracks {
    constructor(scene, ribbons, night) {
      this.N = 240; this.r = [];
      this.mat = new T.MeshBasicMaterial({ color: night ? 0x3b4a66 : 0xbfd0e6, transparent: true, opacity: night ? 0.5 : 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: T.DoubleSide });
      for (let k = 0; k < ribbons; k++) {
        const pos = new Float32Array(this.N * 6), idx = [];
        for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(idx);
        const m = new T.Mesh(g, this.mat); m.frustumCulled = false; m.renderOrder = 2; scene.add(m);
        this.r.push({ pos, g, m, broken: true });
      }
    }
    push(k, lx, ly, lz, rx, ry, rz) {
      const R = this.r[k], p = R.pos;
      const write = (ax, ay, az, bx, by, bz) => { p.copyWithin(0, 6); const o = p.length - 6; p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz; };
      if (R.broken) {
        const o = p.length - 6; write(p[o], p[o + 1], p[o + 2], p[o], p[o + 1], p[o + 2]);   // collapse the old end
        write(lx, ly, lz, lx, ly, lz); R.broken = false;                                       // and the new start
      }
      write(lx, ly, lz, rx, ry, rz); R.g.attributes.position.needsUpdate = true;
    }
    lift() { for (const R of this.r) R.broken = true; }
    reset() { for (const R of this.r) { R.pos.fill(0); R.broken = true; R.g.attributes.position.needsUpdate = true; } }
    dispose() { for (const R of this.r) { R.g.dispose(); R.m.parent && R.m.parent.remove(R.m); } this.mat.dispose(); }
  }
  G.Tracks = Tracks;

  /* ---------------- audio (all synthesised, no files) ---------------- */
  const A = (G.Audio = { ctx: null, on: true, ready: false });
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = (A.ctx = new C());
      A.master = ctx.createGain(); A.master.gain.value = A.on ? 0.8 : 0; A.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.noise = buf;
      const loop = (type, freq, q) => {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const gn = ctx.createGain(); gn.gain.value = 0; src.connect(f); f.connect(gn); gn.connect(A.master); src.start();
        return { f, g: gn };
      };
      A.wind = loop('bandpass', 500, 0.6); A.carve = loop('highpass', 2600, 0.4); A.grind = loop('bandpass', 3200, 6); A.boostL = loop('bandpass', 900, 2.5);
      A.ready = true;
    } catch (e) { A.ctx = null; }
  };
  A.setOn = function (on) { A.on = on; if (A.master) A.master.gain.value = on ? 0.8 : 0; };
  A.frame = function (v, carve, grinding, boosting, air) {
    if (!A.ready) return;
    const t = A.ctx.currentTime, sp = G.clamp(v / 36, 0, 1);
    A.wind.g.gain.setTargetAtTime(0.03 + sp * sp * (air ? 0.34 : 0.24), t, 0.08); A.wind.f.frequency.setTargetAtTime(350 + sp * 1300, t, 0.1);
    A.carve.g.gain.setTargetAtTime(air || grinding ? 0 : Math.min(0.22, carve * 0.2 + sp * 0.035), t, 0.05);
    A.grind.g.gain.setTargetAtTime(grinding ? 0.16 : 0, t, 0.02);
    A.boostL.g.gain.setTargetAtTime(boosting ? 0.2 : 0, t, 0.06); A.boostL.f.frequency.setTargetAtTime(boosting ? 1500 : 700, t, 0.3);
  };
  A.quiet = function () { if (!A.ready) return; const t = A.ctx.currentTime; for (const l of [A.wind, A.carve, A.grind, A.boostL]) l.g.gain.setTargetAtTime(0, t, 0.1); };
  function tone(type, f0, f1, dur, vol, delay) {
    if (!A.ready) return;
    const ctx = A.ctx, t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(A.master); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(freq, dur, vol, type) {
    if (!A.ready) return;
    const ctx = A.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = A.noise; f.type = type || 'lowpass'; f.frequency.value = freq;
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(gn); gn.connect(A.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  A.land = (hard) => { tone('sine', 110, 42, 0.22, 0.35 + hard * 0.4); burst(900, 0.28, 0.25 + hard * 0.3); };
  A.pop = () => { burst(1800, 0.12, 0.16, 'highpass'); tone('sine', 180, 320, 0.09, 0.12); };
  A.trick = (n) => { const base = 520 * Math.pow(1.122, Math.min(n - 1, 8)); tone('triangle', base, base, 0.12, 0.2); tone('triangle', base * 1.5, base * 1.5, 0.2, 0.18, 0.09); };
  A.bank = () => { tone('triangle', 660, 660, 0.1, 0.16); tone('triangle', 880, 880, 0.1, 0.16, 0.08); tone('triangle', 1320, 1320, 0.28, 0.16, 0.16); };
  A.crash = () => { burst(500, 0.6, 0.6); tone('sawtooth', 160, 50, 0.4, 0.2); };
  A.orb = () => { tone('sine', 880, 1560, 0.14, 0.16); };
  A.click = () => { tone('square', 420, 420, 0.04, 0.06); };
  A.count = (go) => { tone('square', go ? 880 : 440, go ? 880 : 440, go ? 0.4 : 0.14, 0.12); };
  A.star = (i) => { tone('triangle', 784 * Math.pow(1.26, i), 784 * Math.pow(1.26, i), 0.4, 0.2); };
  A.gate = (ok) => { if (ok) tone('square', 1200, 1200, 0.05, 0.07); else { tone('sawtooth', 300, 180, 0.2, 0.13); } };
})();
