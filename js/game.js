/* Cascade Lines — renderer, game loop, camera, input and HUD */
(function () {
  'use strict';
  const G = window.G, T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const A = G.Audio;

  const runCache = new Map();
  G.getRun = function (resort, def) {
    const key = resort.id + '/' + def.id + (G.skyFor(def).night ? '/n' : '');   /* night adds lamp posts to the run itself */
    if (runCache.has(key)) { const r = runCache.get(key); runCache.delete(key); runCache.set(key, r); return r; }
    const run = new G.Run(resort, def);
    runCache.set(key, run);
    if (runCache.size > 5) runCache.delete(runCache.keys().next().value);
    return run;
  };
  const goalCache = {};
  G.goals = function (resort, def) {
    const key = resort.id + '/' + def.id;
    if (!goalCache[key]) {
      const run = G.getRun(resort, def), par = G.parTime(run);
      const half = (t) => Math.ceil(t * 2) / 2;
      const g = { vert: Math.round((run.drop * 3.281) / 10) * 10, len: run.Lmain, gates: run.gates.length };
      if (def.park) { g.kind = 'park'; g.scores = def.scoreTiers.slice(); g.score = g.scores[0]; g.time = 0; }
      else {
        /* the pace-setter never falls, so the steep runs get a second or two of slack */
        const extra = { black: [1, 2], double: [1.5, 2] }[def.diff] || [0, 0];
        g.kind = 'time'; g.t2 = half(par * 1.12 + extra[0]); g.t3 = half(par * 0.92 + extra[1]); g.time = g.t2; g.score = def.goalScore;
      }
      goalCache[key] = g;
    }
    return goalCache[key];
  };
  /* Which of the three stars a finished run earns. */
  G.stars = function (goal, score, time) {
    if (goal.kind === 'park') return goal.scores.map((s) => score >= s);
    return [true, time <= goal.t2, time <= goal.t3];
  };
  G.goalText = function (goal, i) {
    if (goal.kind === 'park') return 'Score ' + G.fmt(goal.scores[i]);
    return i === 0 ? 'Reach the bottom' : 'Finish under ' + G.fmtTime(i === 1 ? goal.t2 : goal.t3);
  };
  /* compact form for the in-run card */
  G.goalShort = function (goal, i) {
    if (goal.kind === 'park') return G.fmt(goal.scores[i]) + ' pts';
    return i === 0 ? 'Finish' : 'Under ' + G.fmtTime(i === 1 ? goal.t2 : goal.t3);
  };

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.camera = new T.PerspectiveCamera(62, 1, 0.3, 14000);
      this.inp = { x: 0, y: 0, jump: false, boost: false, grab: 0 };
      this.keys = {}; this.touch = { x: 0, y: 0, jump: false, boost: false, grab: 0 };
      this.mode = 'idle'; this.time = 0; this.acc = 0; this.last = 0;
      this.camPos = new T.Vector3(); this.camLook = new T.Vector3(); this.camTh = 0; this.camSnap = true; this.shake = 0; this.fov = 62;
      this.tmp = new T.Vector3(); this.tmp2 = new T.Vector3();
      this.rnd = G.rng(1234); this.trackD = 0; this.fps = 60; this.slowT = 0;
      this.applyQuality();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.bindInput();
      this.raf = this.frame.bind(this);
      requestAnimationFrame(this.raf);
    }

    applyQuality() {
      const pref = G.Save.data.quality || 'auto';
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      this.quality = pref === 'auto' ? (coarse || this.autoLow ? 'low' : 'high') : pref;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.75 : 1.1));
      this.renderer.shadowMap.enabled = this.quality === 'high';
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    }
    resize() {
      const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
      if (this.parts) this.parts.mat.uniforms.uScale.value = h * this.renderer.getPixelRatio() * 0.9;
    }

    /* ---------- loading ---------- */
    /* Swap the light and the weather under a run already in progress. The
       terrain is identical in every condition - lamp posts are props, not
       colliders - so the sim carries straight on and the clock never stops. */
    relight() {
      if (!this.world || this.mode === 'attract') return this.world && this.load(this.resort, this.def, 'attract');
      const sim = this.sim, was = this.run;
      const run = (this.run = G.getRun(this.resort, this.def));
      if (run !== was) {   /* night swaps in the lamp-post build; carry the collected orbs over */
        const taken = {}; was.orbs.forEach((o) => { if (o.taken) taken[Math.round(o.s * 10) + ':' + Math.round(o.x * 10)] = 1; });
        run.orbs.forEach((o) => { o.taken = !!taken[Math.round(o.s * 10) + ':' + Math.round(o.x * 10)]; });
        sim.run = run;
      }
      this.world.dispose();
      if (this.parts) this.parts.dispose();
      if (this.tracks) this.tracks.dispose();
      this.world = new G.World(run, this.renderer, this.quality);
      this.night = !!this.world.sky.night;
      this.world.scene.add(this.rider.root);
      this.parts = new G.Particles(this.world.scene, 700);
      this.tracks = new G.Tracks(this.world.scene, G.Save.data.gear === 'ski' ? 2 : 1, this.night);
      for (const m of this.world.orbMeshes) if (m.userData.o.taken) { m.visible = false; }
      this.resize();
    }
    unload() {
      document.body.classList.remove('ko');
      if (this.world) { this.world.dispose(); this.world = null; }
      if (this.rider) { this.rider.dispose(); this.rider = null; }
      if (this.parts) { this.parts.dispose(); this.parts = null; }
      if (this.tracks) { this.tracks.dispose(); this.tracks = null; }
      this.renderer.renderLists.dispose();
    }
    load(resort, def, mode) {
      this.unload();
      this.resort = resort; this.def = def;
      const gear = G.Save.data.gear, run = (this.run = G.getRun(resort, def));
      this.world = new G.World(run, this.renderer, this.quality);
      this.sim = new G.Sim(run, gear);
      this.rider = new G.Rider(gear, G.kitLook());
      this.world.scene.add(this.rider.root);
      this.parts = new G.Particles(this.world.scene, 700);
      this.tracks = new G.Tracks(this.world.scene, gear === 'ski' ? 2 : 1, !!this.world.sky.night);
      this.night = !!this.world.sky.night;
      this.goal = G.goals(resort, def);
      this.resize();
      if (mode === 'attract') { this.mode = 'attract'; this.sim.go(); this.sim.s = 62; this.sim.v = 13; this.camSnap = true; this.attractEnd = 0; }
      else this.beginIntro();
      this.setupHud();
    }
    restart() {
      if (!this.world) return;
      this.sim.reset(); this.world.resetOrbs(); this.tracks.reset();
      this.beginIntro(); this.setupHud();
    }
    attract() {
      if (!this.world) return;
      this.sim.reset(); this.sim.go(); this.sim.s = 62; this.sim.v = 13; this.world.resetOrbs(); this.tracks.reset();
      this.mode = 'attract'; this.camSnap = true; this.attractEnd = 0;
      A.quiet(); document.body.classList.remove('boosting'); $('count').hidden = true; this.setupHud();
    }
    setRider() {
      if (!this.world) return;
      const gear = G.Save.data.gear;
      this.world.scene.remove(this.rider.root); this.rider.dispose();
      this.rider = new G.Rider(gear, G.kitLook()); this.world.scene.add(this.rider.root);
      this.sim.gear = gear;
      this.tracks.dispose(); this.tracks = new G.Tracks(this.world.scene, gear === 'ski' ? 2 : 1, this.night);
    }
    beginIntro() {
      this.mode = 'intro'; this.introT = 0; this.introLen = 3.0; this.countShown = -1; this.camSnap = true; this.camTh = 0; this.doneT = 0; this.resultShown = false;
      this.goalLit = [false, false, false]; this.acc = 0;
      $('count').hidden = true;
    }

    /* ---------- input ---------- */
    bindInput() {
      const playKeys = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };
      window.addEventListener('keydown', (e) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const live = this.mode === 'intro' || this.mode === 'play' || this.mode === 'done' || this.mode === 'paused';
        if (live && playKeys[e.code]) e.preventDefault();
        if (e.repeat) return;
        this.keys[e.code] = true;
        if (!live) return;
        if (e.code === 'Escape' || e.code === 'KeyP') { if (this.mode !== 'done') this.togglePause(); }
        else if (e.code === 'KeyR') { G.UI.hideOverlays(); this.restart(); }
        else if (e.code === 'KeyM') G.UI.toggleMapOverlay();
        else if (e.code === 'KeyN') G.UI.toggleSound();
        else if (this.mode === 'intro' && (e.code === 'Space' || e.code === 'Enter')) this.introT = Math.max(this.introT, this.introLen - 0.05);
      });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.togglePause(); });

      $('hudPause').addEventListener('click', () => this.togglePause());
      $('hudRestart').addEventListener('click', () => { G.UI.hideOverlays(); this.restart(); });
      $('hudMap').addEventListener('click', () => G.UI.backToMap());
      /* touch: left side is a stick, right side buttons */
      const stick = $('stick'), nub = $('nub');
      if (stick) {
        let id = null, ox = 0, oy = 0;
        const end = () => { id = null; this.touch.x = 0; this.touch.y = 0; nub.style.transform = 'translate(-50%,-50%)'; };
        stick.addEventListener('pointerdown', (e) => { id = e.pointerId; ox = e.clientX; oy = e.clientY; stick.setPointerCapture(id); e.preventDefault(); });
        stick.addEventListener('pointermove', (e) => {
          if (e.pointerId !== id) return;
          const dx = G.clamp((e.clientX - ox) / 46, -1, 1), dy = G.clamp((e.clientY - oy) / 46, -1, 1);
          this.touch.x = Math.abs(dx) < 0.15 ? 0 : dx; this.touch.y = Math.abs(dy) < 0.3 ? 0 : dy;
          nub.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
        });
        stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
        document.querySelectorAll('[data-touch]').forEach((b) => {
          const act = b.dataset.touch;
          const set = (v) => {
            if (act === 'jump') this.touch.jump = v; else if (act === 'boost') this.touch.boost = v;
            else if (act.charAt(0) === 'g') this.touch.grab = v ? (act === 'g0' ? -1 : +act.charAt(1)) : 0;
            b.classList.toggle('on', v);
          };
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (act === 'pause') { this.togglePause(); return; }
            b.setPointerCapture(e.pointerId); set(true);
            if (this.mode === 'intro' && act === 'jump') this.introT = this.introLen;
          });
          b.addEventListener('pointerup', () => set(false)); b.addEventListener('pointercancel', () => set(false));
        });
      }
    }
    readInput() {
      const k = this.keys, i = this.inp, t = this.touch;
      i.x = G.clamp((k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0) + t.x, -1, 1);
      i.y = G.clamp((k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0) + t.y, -1, 1);
      i.jump = !!k.Space || t.jump;
      i.boost = !!(k.ShiftLeft || k.ShiftRight) || t.boost;
      i.grab = k.KeyE ? -1 : k.KeyJ || k.KeyZ ? 1 : k.KeyK || k.KeyX ? 2 : k.KeyL || k.KeyC ? 3 : k.KeyI || k.KeyV ? 4 : t.grab;
    }
    togglePause() {
      if (this.mode === 'paused') { this.mode = this.pausedFrom || 'play'; G.UI.hidePause(); this.last = performance.now(); }
      else if (this.mode === 'play' || this.mode === 'intro') { this.pausedFrom = this.mode; this.mode = 'paused'; A.quiet(); G.UI.showPause(); }
    }
    stop() { this.mode = 'idle'; A.quiet(); $('hud').hidden = true; $('touch').hidden = true; $('count').hidden = true; }

    /* ---------- HUD ---------- */
    setupHud() {
      const play = this.mode !== 'attract';
      $('hud').hidden = !play;
      $('touch').hidden = !(play && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      if (!play) return;
      const d = this.def, g = this.goal;
      $('hudSym').innerHTML = G.symSVG(d.diff, 20);
      $('hudRun').textContent = d.name; $('hudLift').textContent = this.resort.short + ' · ' + d.lift;
      $('timerPill').className = 'pill timer num' + (g.kind === 'park' ? ' nogoal' : '');
      $('hudGoalT').textContent = g.kind === 'park' ? '' : G.fmtTime(g.t2);
      [0, 1, 2].forEach((i) => { $('goal' + (i + 1)).querySelector('span').textContent = G.goalShort(g, i); $('goal' + (i + 1)).className = 'goal'; });
      $('hudGates').hidden = !d.race;
      if (d.race) { $('gateTotal').textContent = String(g.gates); $('gateHit').textContent = '0'; }
      $('hudTricks').innerHTML = ''; $('hudChain').hidden = true; $('chainMult').hidden = true; $('scorePill').classList.add('solo'); $('hudMsg').className = 'msg';
      const names = G.GRABS[G.Save.data.gear];
      document.querySelectorAll('[data-grabname]').forEach((el) => { el.textContent = names[el.dataset.grabname]; });
      this.hudCache = {};
      $('hudHint').hidden = !!G.Save.data.seenHint;
      this.setupMini(); this.setupProfile();
    }

    /* ---------- elevation profile card ---------- */
    setupProfile() {
      const c = $('prof'), dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth || 280, h = c.clientHeight || 74;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const run = this.run, n = 90, pts = [], e0 = run.height(0, 0), e1 = run.height(run.finishS, 0);
      for (let i = 0; i <= n; i++) { const s = (run.finishS * i) / n; pts.push((run.height(s, 0) - e1) / (e0 - e1)); }
      this.prof = { ctx: c.getContext('2d'), w, h, dpr, pts, e0, e1, last: -1 };
    }
    drawProfile() {
      const p = this.prof; if (!p) return;
      const sim = this.sim, run = this.run, t = G.clamp(sim.s / run.finishS, 0, 1), key = Math.round(t * 400);
      if (key === p.last) return; p.last = key;
      const { ctx, w, h, dpr, pts } = p, n = pts.length - 1, L = 14, R = w - 12, T = 24, B = h - 9;
      const X = (i) => L + ((R - L) * i) / n, Y = (v) => B - (B - T) * v;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const col = G.DIFF[this.def.diff].color === '#14181c' ? '#3b4a55' : G.DIFF[this.def.diff].color;
      ctx.beginPath(); ctx.moveTo(X(0), B + 4); for (let i = 0; i <= n; i++) ctx.lineTo(X(i), Y(pts[i])); ctx.lineTo(X(n), B + 4); ctx.closePath();
      const gr = ctx.createLinearGradient(0, T, 0, B + 4); gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '0d'); ctx.fillStyle = gr; ctx.fill();
      ctx.beginPath(); for (let i = 0; i <= n; i++) { if (i) ctx.lineTo(X(i), Y(pts[i])); else ctx.moveTo(X(i), Y(pts[i])); }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      const fi = t * n, i0 = Math.min(n - 1, Math.floor(fi)), v = pts[i0] + (pts[i0 + 1] - pts[i0]) * (fi - i0), px = L + (R - L) * t, py = Y(v);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#8a99a3'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, B + 4); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(px, py, 5.5, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#17242d'; ctx.stroke();
    }

    /* ---------- minimap: round, top-down, turning with the camera ---------- */
    setupMini() {
      const c = $('mini'), dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth || 176, h = c.clientHeight || 176;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const run = this.run, v = new T.Vector3(), m = (this.mini = { ctx: c.getContext('2d'), w, h, dpr, scale: 0.6, jumps: [], rails: [], drops: [], trees: [], blobs: [], tick: 0 });
      for (const k of run.kickers) { if (k.ride) continue; run.toWorld(k.s0, k.x, 0, v); m.jumps.push({ X: v.x, Z: v.z, s: k.s0, r: 3.0 + k.H * 1.4 }); }
      for (const r of run.rails) { run.toWorld(r.s0, r.x, 0, v); const a = { X0: v.x, Z0: v.z, s: r.s0 }; run.toWorld(r.s1, r.x, 0, v); a.X1 = v.x; a.Z1 = v.z; m.rails.push(a); }
      for (const d of run.drops) { const hw = run.hwAt(d.s); run.toWorld(d.s, -hw, 0, v); const a = { X0: v.x, Z0: v.z, s: d.s }; run.toWorld(d.s, hw, 0, v); a.X1 = v.x; a.Z1 = v.z; m.drops.push(a); }
      for (const key in run.cb) for (const col of run.cb[key]) { if (col.kind === 'tree' && Math.abs(col.x) < run.hwAt(col.s) - 0.5) { run.toWorld(col.s, col.x, 0, v); m.trees.push({ X: v.x, Z: v.z, s: col.s }); } }
      /* soft patches of forest or bare snow beside the run, so the map reads as terrain */
      const rnd = G.rng(run.seed ^ 77);
      for (let s = -40; s < run.L; s += 26) {
        const mode = run.secAt(s).trees, wood = mode === 'edge' || mode === 'glade';
        for (const side of [-1, 1]) for (let q = 0; q < 3; q++) {
          if (!wood && (mode !== 'sparse' || rnd() > 0.35)) { rnd(); rnd(); continue; }
          const x = side * (run.hwAt(s) + 14 + q * 46 + rnd() * 30); run.toWorld(s + rnd() * 26, x, 0, v);
          m.blobs.push({ X: v.x, Z: v.z, s, r: 22 + rnd() * 26, wood: true });
        }
      }
      const fs = run.finishS, fh = run.hwAt(fs); run.toWorld(fs, -fh, 0, v); m.fin = { X0: v.x, Z0: v.z }; run.toWorld(fs, fh, 0, v); m.fin.X1 = v.x; m.fin.Z1 = v.z;
      m.lift = run.lift.pts; m.towers = run.lift.towers;
    }
    drawMini(dt) {
      const m = this.mini; if (!m) return;
      if (++m.tick % 2) return;
      const { ctx, w, h, dpr } = m, run = this.run, sim = this.sim, DS = G.DS, S0 = G.S0;
      m.scale = G.damp(m.scale, G.lerp(0.68, 0.44, G.clamp(sim.v / 32, 0, 1)), 2, dt * 2);
      const sc = m.scale, hd = run.psiAt(sim.s) + this.camTh;
      const Fx = Math.sin(hd), Fz = -Math.cos(hd), Rx = Math.cos(hd), Rz = Math.sin(hd);
      const P = this.rider.root.position, cx = w / 2, cy = h * 0.62, rad = w / 2;
      const U = (X, Z) => cx + ((X - P.x) * Rx + (Z - P.z) * Rz) * sc, V = (X, Z) => cy - ((X - P.x) * Fx + (Z - P.z) * Fz) * sc;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, rad, 0, 6.2832); ctx.clip();
      const night = this.night;
      ctx.fillStyle = night ? '#1b2a44' : '#e7eef2'; ctx.fillRect(0, 0, w, h);
      const ahead = (cy + 40) / sc, behind = (h - cy + 40) / sc;
      const near = (s) => s > sim.s - behind && s < sim.s + ahead;
      for (const b of m.blobs) if (near(b.s)) { ctx.fillStyle = b.wood ? (night ? 'rgba(24,60,58,.75)' : 'rgba(126,163,142,.62)') : (night ? 'rgba(60,80,120,.5)' : 'rgba(255,255,255,.9)'); ctx.beginPath(); ctx.arc(U(b.X, b.Z), V(b.X, b.Z), b.r * sc, 0, 6.2832); ctx.fill(); }
      const i0 = Math.max(0, Math.floor((sim.s - behind + S0) / DS)), i1 = Math.min(run.N - 1, Math.ceil((sim.s + ahead + S0) / DS));
      const L = [], R = [];
      for (let i = i0; i <= i1; i += 3) {
        const c = Math.cos(run.psi[i]), sn = Math.sin(run.psi[i]), hw = run.hw[i], X = run.cx[i], Z = run.cz[i];
        L.push(U(X - c * hw, Z - sn * hw), V(X - c * hw, Z - sn * hw)); R.push(U(X + c * hw, Z + sn * hw), V(X + c * hw, Z + sn * hw));
      }
      const n = L.length / 2;
      if (n >= 2) {
        const dcol = G.DIFF[this.def.diff].color === '#14181c' ? '#3b4a55' : G.DIFF[this.def.diff].color;
        ctx.beginPath(); ctx.moveTo(L[0], L[1]);
        for (let i = 1; i < n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
        ctx.closePath(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = dcol; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = night ? '#dfe8f6' : '#ffffff'; ctx.fill();
      }
      /* lift line with tower ticks */
      if (m.lift.length > 1) {
        ctx.strokeStyle = night ? 'rgba(255,255,255,.55)' : 'rgba(23,36,45,.6)'; ctx.lineWidth = 1.4; ctx.beginPath();
        let first = true; for (const p of m.lift) { if (!near(p.s)) continue; const u = U(p.X, p.Z), vv = V(p.X, p.Z); if (first) { ctx.moveTo(u, vv); first = false; } else ctx.lineTo(u, vv); }
        ctx.stroke(); ctx.fillStyle = night ? '#fff' : '#17242d';
        for (const t of m.towers) { const u = U(t.X, t.Z), vv = V(t.X, t.Z); if (u > -5 && u < w + 5 && vv > -5 && vv < h + 5) ctx.fillRect(u - 2, vv - 2, 4, 4); }
      }
      ctx.strokeStyle = '#8fa1ae'; ctx.lineWidth = 2.2; ctx.setLineDash([3, 3]);
      for (const d of m.drops) if (near(d.s)) { ctx.beginPath(); ctx.moveTo(U(d.X0, d.Z0), V(d.X0, d.Z0)); ctx.lineTo(U(d.X1, d.Z1), V(d.X1, d.Z1)); ctx.stroke(); }
      const f = m.fin;
      if (near(run.finishS)) { ctx.strokeStyle = '#17242d'; ctx.lineWidth = 4; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(U(f.X0, f.Z0), V(f.X0, f.Z0)); ctx.lineTo(U(f.X1, f.Z1), V(f.X1, f.Z1)); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.fillStyle = '#2f7a5c';
      for (const t of m.trees) if (near(t.s)) { ctx.beginPath(); ctx.arc(U(t.X, t.Z), V(t.X, t.Z), 1.8, 0, 6.2832); ctx.fill(); }
      ctx.strokeStyle = '#1b9cf0'; ctx.lineWidth = 3;
      for (const r of m.rails) if (near(r.s)) { ctx.beginPath(); ctx.moveTo(U(r.X0, r.Z0), V(r.X0, r.Z0)); ctx.lineTo(U(r.X1, r.Z1), V(r.X1, r.Z1)); ctx.stroke(); }
      ctx.fillStyle = '#ff5b1f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
      for (const j of m.jumps) if (near(j.s)) {
        const u = U(j.X, j.Z), vv = V(j.X, j.Z), r = j.r * (0.6 + sc * 0.6);
        ctx.beginPath(); ctx.moveTo(u, vv - r); ctx.lineTo(u + r * 0.85, vv + r * 0.6); ctx.lineTo(u - r * 0.85, vv + r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#f0a800';
      const b0 = Math.floor((sim.s - behind + S0) / 40), b1 = Math.floor((sim.s + ahead + S0) / 40), v = this.tmp;
      for (let b = b0; b <= b1; b++) { const list = run.ob[b]; if (!list) continue; for (const o of list) { if (o.taken) continue; run.toWorld(o.s, o.x, 0, v); ctx.beginPath(); ctx.arc(U(v.x, v.z), V(v.x, v.z), 2.4, 0, 6.2832); ctx.fill(); } }
      /* rider: view cone + arrow */
      const a = sim.th - this.camTh;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 46); cg.addColorStop(0, 'rgba(226,52,29,.34)'); cg.addColorStop(1, 'rgba(226,52,29,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 46, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7.5); ctx.lineTo(0, 3.5); ctx.lineTo(-7, 7.5); ctx.closePath();
      ctx.fillStyle = sim.boosting ? '#ffc233' : '#e2341d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.restore();
      /* north marker rides the rim */
      const na = -((this.resort.aspect || 0) * Math.PI) / 180 - hd, nr = rad - 2;
      const nEl = $('miniN'); nEl.style.transform = `translate(${(Math.sin(na) * nr).toFixed(1)}px, ${(-Math.cos(na) * nr).toFixed(1)}px)`;
    }
    setText(id, v) { if (this.hudCache[id] !== v) { this.hudCache[id] = v; $(id).textContent = v; } }
    updateHud() {
      const sim = this.sim, run = this.run, mph = G.Save.data.units !== 'kmh', d = this.def;
      this.setText('hudScore', G.fmt(sim.score));
      this.setText('hudTime', G.fmtTime((sim.finished ? sim.finishTime : sim.t + sim.penalty)));
      this.setText('hudSpeed', String(Math.round(sim.v * (mph ? 2.237 : 3.6))));
      this.setText('hudUnit', mph ? 'mph' : 'km/h');
      const b = Math.round(sim.boost * 100);
      if (this.hudCache.boost !== b) { this.hudCache.boost = b; $('boostFill').style.transform = `scaleX(${b / 100})`; }
      const bo = sim.boosting; if (this.hudCache.bo !== bo) { this.hudCache.bo = bo; $('boostWrapP').classList.toggle('on', bo); document.body.classList.toggle('boosting', bo); }
      /* elevation: the run's real top and bottom, spread over the drop ridden so far */
      const p = this.prof, frac = p ? G.clamp((p.e0 - run.height(Math.min(sim.s, run.finishS), 0)) / (p.e0 - p.e1), 0, 1) : 0;
      const elev = d.elev[0] - (d.elev[0] - d.elev[1]) * frac;
      this.setText('hudElev', G.fmt(Math.round(elev / 5) * 5) + ' ft');
      this.setText('progFt', G.fmt(Math.max(0, Math.round((elev - d.elev[1]) / 10) * 10)) + ' ft to go');
      const ch = sim.chain, has = ch.n > 0;
      if (this.hudCache.has !== has) { this.hudCache.has = has; $('hudChain').hidden = !has; }
      const multOn = has && ch.n > 1;
      if (this.hudCache.multOn !== multOn) { this.hudCache.multOn = multOn; $('chainMult').hidden = !multOn; $('scorePill').classList.toggle('solo', !multOn); }
      if (has) {
        this.setText('chainPts', '+' + G.fmt(ch.pts)); this.setText('chainMult', '×' + sim.chainMult().toFixed(1));
        $('chainBar').style.transform = `scaleX(${sim.state === 'ground' ? G.clamp(ch.timer / G.CHAIN, 0, 1) : 1})`;
      }
      const gl = this.goal;
      if (gl.kind === 'park') {
        for (let i = 0; i < 3; i++) if (!this.goalLit[i] && sim.score >= gl.scores[i]) { this.goalLit[i] = true; $('goal' + (i + 1)).classList.add('lit'); A.star(i); }
      } else if (!sim.finished) {
        const t = sim.t + sim.penalty;
        if (!this.hudCache.late3 && t > gl.t3) { this.hudCache.late3 = true; $('goal3').classList.add('missed'); }
        if (!this.hudCache.late && t > gl.t2) { this.hudCache.late = true; $('goal2').classList.add('missed'); $('timerPill').classList.add('late'); }
      }
      if (this.def.race) this.setText('gateHit', String(sim.gatesHit));
      const deep = sim.sink > 0.10;
      if (this.hudCache.deep !== deep) { this.hudCache.deep = deep; $('hudPow').hidden = !deep; }
      this.drawProfile();
    }
    popTrick(e) {
      const box = $('hudTricks'), el = document.createElement('div');
      const tag = e.sketchy ? 'Sketchy' : e.pts >= 2500 ? 'Huge' : e.pts >= 1200 ? 'Sick' : e.pts >= 450 ? 'Nice' : 'Clean';
      el.className = 'trick' + (e.sketchy ? ' sketchy' : '') + (e.pts >= 1200 ? ' big' : '');
      el.innerHTML = `<span class="tag">${tag.toUpperCase()}</span><b>${G.esc(e.name)}</b><i>+${G.fmt(e.pts)}${e.rep > 0 && !e.sketchy ? ' · repeat' : ''}</i>`;
      box.appendChild(el);
      while (box.children.length > 2) box.removeChild(box.firstChild);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1900);
    }
    msg(text, cls) {
      const el = $('hudMsg'); el.textContent = text; el.className = 'msg show ' + (cls || '');
      clearTimeout(this.msgT); this.msgT = setTimeout(() => { el.className = 'msg'; }, 1500);
    }

    /* ---------- per-frame ---------- */
    frame(now) {
      requestAnimationFrame(this.raf);
      let dt = (now - this.last) / 1000; this.last = now;
      if (!(dt > 0)) dt = 0.016; if (dt > 0.05) dt = 0.05;
      if (!this.world || this.mode === 'idle') return;
      if (this.mode === 'paused') { this.renderer.render(this.world.scene, this.camera); return; }
      this.time += dt;
      if (this.mode === 'attract' && this.quality === 'high' && !this.autoLow && (G.Save.data.quality || 'auto') === 'auto') {
        this.fpsN = (this.fpsN || 0) + 1; this.fpsT = (this.fpsT || 0) + dt;
        if (this.fpsN === 150) { if (this.fpsT / 150 > 0.034) { this.autoLow = true; this.applyQuality(); this.resize(); this.load(this.resort, this.def, 'attract'); return; } this.fpsN = 0; this.fpsT = 0; }
      }
      const sim = this.sim, inp = this.inp;
      if (this.mode === 'attract') G.autoInput(sim, 'attract', inp); else this.readInput();
      if (this.mode === 'intro') this.updateIntro(dt);
      if (this.mode === 'done') this.updateDone(dt);

      this.acc += dt; const h = 1 / 120; let n = 0;
      while (this.acc >= h && n < 8) { sim.step(h, inp); this.acc -= h; n++; }
      if (n === 8) this.acc = 0;
      this.handleEvents();

      this.rider.update(dt, sim, this.time);
      this.updateFx(dt);
      this.updateCamera(dt);
      this.world.update(dt, this.camera, sim.s, this.time, this.rider.root.position);
      if (this.mode !== 'attract') {
        this.updateHud(); this.drawMini(dt);
        A.frame(sim.state === 'crash' ? 0 : sim.v, sim.state === 'ground' ? Math.abs(sim.steer) * G.clamp(sim.v / 18, 0, 1) + (sim.braking ? 0.8 : 0) : 0, sim.state === 'grind', sim.boosting, sim.state === 'air');
      } else if (sim.finished) { this.attractEnd += dt; if (this.attractEnd > 2.5) { sim.reset(); sim.go(); sim.s = 62; sim.v = 13; this.world.resetOrbs(); this.tracks.reset(); this.camSnap = true; this.attractEnd = 0; } }
      this.renderer.render(this.world.scene, this.camera);
    }

    updateIntro(dt) {
      this.introT += dt;
      const left = this.introLen - this.introT, c = $('count');
      const n = left > 2.1 ? 3 : left > 1.4 ? 2 : left > 0.7 ? 1 : 0;
      if (this.introT > 0.25 && n !== this.countShown) {
        this.countShown = n; c.hidden = false; c.textContent = n === 0 ? 'DROP IN' : String(n);
        c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick'); A.count(n === 0);
      }
      if (left <= 0) {
        this.mode = 'play'; this.sim.go();
        setTimeout(() => { if (this.mode === 'play') $('count').hidden = true; }, 600);
      }
    }
    updateDone(dt) {
      this.doneT += dt;
      if (!this.resultShown && this.doneT > 1.7 && this.sim.state !== 'air' && this.sim.chain.n === 0) {
        this.resultShown = true;
        const sim = this.sim, g = this.goal;
        const res = { score: sim.score, time: sim.finishTime, stars: G.stars(g, sim.score, sim.finishTime), bestTrick: sim.bestTrick, maxV: sim.maxV, air: sim.airTotal, crashes: sim.crashes, bestChain: sim.bestChain, tricks: sim.tricks, gatesHit: sim.gatesHit, gatesTotal: sim.gates.length, penalty: sim.penalty };
        A.quiet();
        G.UI.showResults(this.resort, this.def, res, g);
      }
    }

    handleEvents() {
      const sim = this.sim, ev = sim.events, play = this.mode !== 'attract';
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        switch (e.type) {
          case 'takeoff': this.tracks.lift(); break;
          case 'pop': if (play) A.pop(); break;
          case 'land': this.shake = Math.max(this.shake, G.clamp(-e.vn / 22, 0.15, 1)); this.burst(26, 4 + Math.min(6, -e.vn * 0.4)); if (play) A.land(G.clamp(-e.vn / 20, 0, 1)); break;
          case 'trick': if (play) { this.popTrick(e); A.trick(e.n); if (!G.Save.data.seenHint) { G.Save.data.seenHint = true; G.Save.write(); $('hudHint').hidden = true; } } break;
          case 'bank': if (play) { const el = $('hudScore'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); if (e.n > 1) { this.msg(e.n + ' trick combo  +' + G.fmt(e.gain), 'good'); A.bank(); } } break;
          case 'lost': if (play && e.pts > 0) this.msg('Combo lost', 'bad'); break;
          case 'crash':
            this.rider.startCrash(this.rnd); this.shake = e.ko ? 1.6 : 1; this.burst(e.ko ? 70 : 40, e.ko ? 9 : 7); this.tracks.lift();
            if (play) { this.msg(e.why, 'bad'); A.crash(); if (e.ko) document.body.classList.add('ko'); }
            break;
          case 'respawn': document.body.classList.remove('ko'); break;
          case 'gate':
            if (play) {
              if (e.ok) { if (e.streak >= 3 && e.streak % 3 === 0) this.msg(e.streak + ' gates clean', 'good'); A.gate(true); }
              else { this.msg('Gate missed  +1.0s', 'bad'); A.gate(false); }
            }
            break;
          case 'orb': if (play) { A.orb(); const w = $('boostWrapP'); w.classList.remove('gain'); void w.offsetWidth; w.classList.add('gain'); } break;
          case 'grindStart': this.tracks.lift(); break;
          case 'finish':
            if (play) {
              this.mode = 'done'; this.doneT = 0;
              const st = G.stars(this.goal, sim.score, sim.finishTime);
              st.forEach((ok, i) => { if (ok) { $('goal' + (i + 1)).classList.remove('missed'); $('goal' + (i + 1)).classList.add('lit'); A.star(i); } });
              if (st[1]) $('timerPill').classList.add('made');
            }
            break;
        }
      }
      ev.length = 0;
    }

    burst(n, power) {
      const p = this.rider.root.position, c = this.night ? 0.62 : 1;
      for (let i = 0; i < n; i++) {
        const a = this.rnd() * Math.PI * 2, r = power * (0.3 + this.rnd() * 0.7);
        this.parts.emit(p.x, p.y + 0.1, p.z, Math.cos(a) * r, 1 + this.rnd() * power * 0.6, Math.sin(a) * r, 0.45 + this.rnd() * 0.45, 0.16 + this.rnd() * 0.2, c, c, c * 1.03);
      }
    }
    updateFx(dt) {
      const sim = this.sim, p = this.rider.root.position, run = this.run, rnd = this.rnd;
      const heading = run.psiAt(sim.s) + sim.th;
      const fx = Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = Math.sin(heading);
      const c = this.night ? 0.62 : 1;
      if (sim.state === 'ground' && sim.v > 1.5) {
        this.trackD += sim.v * dt;
        if (this.trackD > 0.5) {
          this.trackD = 0;
          const y = p.y + 0.035, wide = sim.braking ? 0.3 : 0;
          if (this.tracks.r.length === 2) {
            for (let k = 0; k < 2; k++) { const o = (k ? 0.14 : -0.14), w = 0.05 + wide; this.tracks.push(k, p.x + rx * (o - w), y, p.z + rz * (o - w), p.x + rx * (o + w), y, p.z + rz * (o + w)); }
          } else { const w = 0.1 + wide + Math.abs(sim.steer) * 0.05; this.tracks.push(0, p.x - rx * w, y, p.z - rz * w, p.x + rx * w, y, p.z + rz * w); }
        }
        /* spray off the edges */
        const pow = run.powAt(sim.s);
        const amt = (Math.abs(sim.steer) * sim.v * 0.09 + (sim.braking ? sim.v * 0.25 : 0) + pow * sim.v * 0.065) * dt * 60;
        let n = Math.floor(amt * 1.6) + (rnd() < (amt * 1.6) % 1 ? 1 : 0); if (n > 14) n = 14;
        const sd = sim.steer > 0 ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const sp = 1.5 + rnd() * 3.5 + (sim.braking ? 2 : 0);
          this.parts.emit(p.x + rx * sd * 0.2 - fx * 0.5, p.y + 0.08, p.z + rz * sd * 0.2 - fz * 0.5,
            rx * sd * sp + fx * sim.v * 0.35, 1.2 + rnd() * 2.6, rz * sd * sp + fz * sim.v * 0.35, 0.3 + rnd() * 0.4, 0.1 + rnd() * 0.16, c, c, c * 1.03);
        }
      }
      if (sim.state === 'grind' && rnd() < 0.7) this.parts.emit(p.x, p.y + 0.02, p.z, -fx * 3 + (rnd() - 0.5) * 3, 1 + rnd() * 2, -fz * 3 + (rnd() - 0.5) * 3, 0.25, 0.14, 1, 0.75, 0.25, 9);
      if (sim.boosting) for (let i = 0; i < 2; i++) this.parts.emit(p.x - fx * 0.6 + (rnd() - 0.5) * 0.4, p.y + 0.3 + rnd() * 0.6, p.z - fz * 0.6 + (rnd() - 0.5) * 0.4, -fx * 4, rnd() * 1.5, -fz * 4, 0.3 + rnd() * 0.2, 0.14, 1, 0.55 + rnd() * 0.3, 0.12, 0);
      this.parts.update(dt);
    }

    updateCamera(dt) {
      const sim = this.sim, run = this.run, cam = this.camera, mode = this.mode;
      const sp = G.clamp(sim.v / 34, 0, 1), air = sim.state === 'air';
      this.camTh = G.damp(this.camTh, sim.th * 0.55, 3.5, dt);
      let dist = 7.4 + 3.0 * sp + (air ? 1.2 : 0), up = 2.9 + 1.0 * sp, orbit = 0, lookRider = 0;
      if (mode === 'intro') { const t = G.smooth(this.introT / this.introLen); orbit = (1 - t) * 2.5; dist = G.lerp(5.2, dist, t); lookRider = 1 - t; }
      else if (mode === 'done') { orbit = Math.min(2.5, this.doneT * 0.8); dist = 6.2; lookRider = Math.min(1, this.doneT); }
      else if (mode === 'attract') { orbit = 0.45 * Math.sin(this.time * 0.11) + 0.3; dist += 2.5; up += 0.6; lookRider = 0.3; }
      const ang = this.camTh + orbit;
      const cs = sim.s - dist * Math.cos(ang), cx = sim.x - dist * Math.sin(ang);
      const gC = run.height(cs, cx), gR = run.height(sim.s, sim.x);
      const cy = Math.max(gC + 1.5, sim.y + up + (gC - gR) * 0.8);
      const tgt = run.toWorld(cs, cx, cy, this.tmp), cp = this.camPos, k = mode === 'intro' || mode === 'done' ? 5 : 10;
      const la = 11 + 9 * sp, ls = sim.s + la * Math.cos(this.camTh), lx = sim.x + la * Math.sin(this.camTh);
      const look = run.toWorld(ls, lx, G.lerp(run.height(ls, lx) + 0.9, sim.y + 1.0, air ? 0.65 : 0.3), this.tmp2);
      if (lookRider > 0) { const rp = this.rider.root.position; look.x = G.lerp(look.x, rp.x, lookRider); look.y = G.lerp(look.y, rp.y + 1.0, lookRider); look.z = G.lerp(look.z, rp.z, lookRider); }
      if (this.camSnap) { cp.copy(tgt); this.camLook.copy(look); this.camSnap = false; }
      else {
        cp.x = G.damp(cp.x, tgt.x, k, dt); cp.y = G.damp(cp.y, tgt.y, k * 0.8, dt); cp.z = G.damp(cp.z, tgt.z, k, dt);
        this.camLook.x = G.damp(this.camLook.x, look.x, 9, dt); this.camLook.y = G.damp(this.camLook.y, look.y, 9, dt); this.camLook.z = G.damp(this.camLook.z, look.z, 9, dt);
      }
      if (cp.y < gC + 1.0) cp.y = gC + 1.0;
      cam.position.copy(cp);
      if (this.shake > 0.01) { const s = this.shake * 0.22; cam.position.x += (this.rnd() - 0.5) * s; cam.position.y += (this.rnd() - 0.5) * s; this.shake *= Math.exp(-7 * dt); }
      cam.lookAt(this.camLook);
      const fovT = 60 + 15 * sp + (sim.boosting ? 9 : 0);
      this.fov = G.damp(this.fov, fovT, 4, dt);
      if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    }
  }
  G.Game = Game;
})();
