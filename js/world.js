/* Cascade Lines — run generator (terrain, features, trees, lift) and scene builder */
(function () {
  'use strict';
  const G = window.G;
  const T = window.THREE;
  const TAU = Math.PI * 2;

  const DS = 1.5;          // row spacing along the run (m)
  const S0 = 60;           // metres of start bench before s = 0
  const EDGE = 6;          // fine grid extends this far past the piste edge
  const NIN = 49;          // fine columns across the piste
  const OUT = [5, 12, 22, 36, 55, 82]; // coarse columns beyond the fine grid
  const NO = OUT.length;
  const NC = NIN + NO * 2;
  const OUTRUN = 130;

  const KICK = {
    kS: { H: 1.0, L: 6.5, w: 5, T: 4, D: 8 },
    kM: { H: 1.7, L: 9, w: 6, T: 7, D: 12 },
    kL: { H: 2.5, L: 12, w: 7, T: 10, D: 16 },
    kXL: { H: 3.4, L: 15, w: 8.5, T: 13, D: 20 },
    hit: { H: 1.2, L: 7, w: 4.5, T: 2, D: 7 },
  };
  const RAILS = {
    rail: { len: 14, hr: 0.55, tol: 0.8, arc: 0 },
    box: { len: 12, hr: 0.45, tol: 1.1, arc: 0 },
    rainbow: { len: 13, hr: 0.5, tol: 0.85, arc: 0.9 },
    long: { len: 24, hr: 0.6, tol: 0.8, arc: 0 },
  };
  G.KICK = KICK; G.RAILS = RAILS; G.S0 = S0; G.DS = DS;

  function kickH(k, s, x) {
    const u = s - k.sa;
    if (u < 0 || u > k.len) return 0;
    const dx = Math.abs(x - k.x) - k.w * 0.5;
    if (dx > k.side) return 0;
    const lat = dx <= 0 ? 1 : G.smooth(1 - dx / k.side);
    let f;
    if (u <= k.L) { const t = u / k.L; f = k.ride ? G.smooth(t) : t * t; }
    else if (u <= k.L + k.T) f = 1;
    else f = 1 - G.smooth((u - k.L - k.T) / k.D);
    return k.H * f * lat;
  }

  /* ====================================================================== */
  class Run {
    constructor(resort, def) {
      this.resort = resort; this.def = def;
      this.seed = G.hashStr(resort.id + '/' + def.id);
      this.generate();
    }

    generate() {
      const def = this.def, rnd = G.rng(this.seed), nseed = this.seed & 0xffff;
      const secs = def.sections.map((o) => Object.assign({ curve: 0.3, wave: 420, prof: 'flat', trees: 'edge', surf: 'groomed', feats: [] }, o));
      /* A surveyed centreline, where we have one: real turns, real pitch changes. */
      this.real = def.real ? this.realPath(def.real) : null;
      if (this.real) {
        const want = this.real.len, have = secs.reduce((a, b) => a + b.len, 0), k = want / have;
        secs.forEach((sc) => { sc.len *= k; });
      }
      const last = secs[secs.length - 1];
      secs.push({ len: OUTRUN, pitch: 2.6, hw: Math.max(last.hw, 28), curve: 0, wave: 500, prof: 'flat', trees: last.trees === 'none' ? 'none' : 'edge', surf: 'groomed', feats: [], outrun: true });
      let acc = 0;
      secs.forEach((sc) => {
        sc.s0 = acc; acc += sc.len; sc.s1 = acc;
        sc.slalom = sc.slalom || 0;
        sc.crown = sc.prof === 'crown' ? -2.4 : sc.prof === 'bowl' ? sc.hw * 0.12 : sc.prof === 'gully' ? 0 : 0.5;
        sc.gully = sc.prof === 'gully' ? sc.hw * 0.36 : 0;
        sc.pipe = sc.prof === 'pipe' ? 1 : 0;
        sc.mog = sc.surf === 'moguls' ? 1 : 0;
        sc.pow = sc.surf === 'powder' ? 1 : 0;
        sc.cut = sc.cut || 0;   /* a road cut into a sidehill: +1 banks up to the right, -1 to the left */
      });
      this.secs = secs;
      this.Lmain = acc - OUTRUN; this.finishS = this.Lmain + 28; this.L = acc;
      const N = (this.N = Math.ceil((this.L + S0) / DS) + 2);
      const F = () => new Float32Array(N);
      const hw = (this.hw = F()), pitch = F(), crown = F(), gully = F(), mog = F(), pow = F(), curveA = F(), wave = F(), pipe = F(), cut = F();
      const sec = (this.sec = new Uint8Array(N));
      const B = 45;
      const num = (k, s, key) => {
        const a = secs[k]; let v = a[key];
        if (k > 0 && s - a.s0 < B) v = G.lerp(secs[k - 1][key], v, G.smooth(0.5 + (0.5 * (s - a.s0)) / B));
        else if (k < secs.length - 1 && a.s1 - s < B) v = G.lerp(secs[k + 1][key], v, G.smooth(0.5 + (0.5 * (a.s1 - s)) / B));
        return v;
      };
      let k = 0;
      for (let i = 0; i < N; i++) {
        const s = i * DS - S0;
        while (k < secs.length - 1 && s >= secs[k].s1) k++;
        sec[i] = k;
        hw[i] = num(k, s, 'hw'); pitch[i] = num(k, s, 'pitch'); crown[i] = num(k, s, 'crown'); gully[i] = num(k, s, 'gully');
        mog[i] = num(k, s, 'mog'); pow[i] = num(k, s, 'pow'); curveA[i] = num(k, s, 'curve'); wave[i] = num(k, s, 'wave'); pipe[i] = num(k, s, 'pipe'); cut[i] = num(k, s, 'cut');
      }
      this.pow = pow;
      this.maxHw = 0; for (let i = 0; i < N; i++) if (hw[i] > this.maxHw) this.maxHw = hw[i];

      /* centreline */
      const psi = (this.psi = F()), cx = (this.cx = F()), cz = (this.cz = F()), kap = (this.kap = F());
      if (this.real) {
        for (let i = 0; i < N; i++) psi[i] = this.real.psiAt(i * DS - S0);
      } else {
        let phase = rnd() * TAU; const ph2 = rnd() * TAU;
        for (let i = 0; i < N; i++) {
          const s = i * DS - S0;
          const ramp = G.smooth((s - 15) / 110) * G.smooth((this.Lmain + 40 - s) / 120);
          psi[i] = curveA[i] * 0.5 * ramp * (Math.sin(phase) + 0.3 * Math.sin(2.3 * phase + ph2));
          if (s > 0) phase += (TAU * DS) / wave[i];
        }
      }
      for (let i = 0; i < N - 1; i++) { cx[i + 1] = cx[i] + Math.sin(psi[i]) * DS; cz[i + 1] = cz[i] - Math.cos(psi[i]) * DS; }
      for (let i = 1; i < N - 1; i++) kap[i] = (psi[i + 1] - psi[i - 1]) / (2 * DS);

      /* feature plan */
      const mods = []; this.kickers = []; this.rails = []; this.orbs = []; this.drops = []; this.gates = [];
      const hwAt0 = (s) => hw[G.clamp(Math.round((s + S0) / DS), 0, N - 1)];
      const addDrop = (s, D, w) => { mods.push({ type: 'drop', s, D, w }); this.drops.push({ s, D }); };
      const addKicker = (type, s, x, hwS) => {
        const sp = KICK[type];
        const kd = { type, s0: s, x, w: Math.min(sp.w, hwS * 0.55), H: sp.H, L: sp.L, T: sp.T, D: sp.D, side: 1.8, ride: false };
        kd.sa = s - sp.L; kd.len = sp.L + sp.T + sp.D;
        this.kickers.push(kd);
        if (type === 'kL' || type === 'kXL') this.orbs.push({ s: s + sp.T + sp.D * 0.3, x, h: sp.H + 1.6, air: true });
      };
      secs.forEach((sc) => {
        if (!sc.slalom) return;
        const a = sc.s0 + 40, b = sc.s1 - 30, n = sc.slalom;
        for (let j = 0; j < n; j++) {
          const s = a + ((b - a) * j) / Math.max(1, n - 1), hwS = hwAt0(s), side = j % 2 ? 1 : -1;
          this.gates.push({ i: j, s, x: side * hwS * 0.3, side, half: Math.max(4.2, hwS * 0.26), red: j % 2 === 0 });
        }
      });
      secs.forEach((sc, si) => {
        let feats = sc.feats.slice();
        if (si === 0 && feats[0] === 'cornice') { addDrop(20, 4.2, 2.8); feats.shift(); }
        const n = feats.length; if (!n) return;
        const a = sc.s0 + (si === 0 ? 80 : 30), b = sc.s1 - 25;
        feats.forEach((tok, j) => {
          const s = a + ((b - a) * (j + 0.5)) / n, hwS = hwAt0(s);
          const toks = tok.split('|');
          const lanes = toks.length === 1 ? [null] : toks.length === 2 ? [-0.4, 0.4] : [-0.55, 0, 0.55];
          toks.forEach((t, li) => {
            const lf = lanes[li];
            if (t === 'roll') mods.push({ type: 'roll', s, a: 1.0 + rnd() * 0.5, l: 17 + rnd() * 5 });
            else if (t === 'rolls3') for (let q = 0; q < 3; q++) mods.push({ type: 'roll', s: s + q * 12.5 - 14, a: 0.85, l: 12.5 });
            else if (t === 'drop3') addDrop(s, 3 + rnd() * 0.5, 3.2);
            else if (t === 'drop5' || t === 'cornice') addDrop(s, 4.8 + rnd() * 0.7, 4.4);
            else if (t === 'boost') {
              const xc = (rnd() - 0.5) * hwS * 0.6, ph = rnd() * TAU;
              for (let q = 0; q < 5; q++) this.orbs.push({ s: s + q * 8 - 16, x: xc + Math.sin(q * 0.9 + ph) * hwS * 0.22, h: 1.0 });
            } else if (KICK[t]) {
              const x = lf !== null ? lf * hwS : t === 'hit' ? (rnd() < 0.5 ? -1 : 1) * hwS * 0.6 : (rnd() - 0.5) * hwS * 0.5;
              addKicker(t, s, x, hwS);
            } else if (RAILS[t]) {
              const sp = RAILS[t];
              const x = lf !== null ? lf * hwS : (rnd() - 0.5) * hwS * 0.5;
              this.rails.push({ type: t, s0: s, s1: s + sp.len, x, hr: sp.hr, arc: sp.arc, tol: sp.tol });
              const kd = { type: 'ride', s0: s - 0.9, x, w: 2.6, H: sp.hr - 0.04, L: 7.5, T: 0.5, D: 1.6, side: 1.2, ride: true };
              kd.sa = kd.s0 - kd.L; kd.len = kd.L + kd.T + kd.D;
              this.kickers.push(kd);
            }
          });
        });
      });
      this.mods = mods;

      /* elevation profile */
      const ey = (this.ey = F());
      const pa = rnd() * TAU, pb = rnd() * TAU;
      let e = 0;
      for (let i = 0; i < N; i++) {
        const s = i * DS - S0;
        let p = this.real ? this.real.pitchAt(s) : pitch[i] * (1 + 0.22 * Math.sin(s / 83 + pa) + 0.12 * Math.sin(s / 37 + pb));
        p *= G.smooth((s + 4) / 16);
        if (s > this.Lmain) p = G.lerp(p, -2.2, G.smooth(((s - this.Lmain) / OUTRUN - 0.3) / 0.6));
        ey[i] = e;
        e -= Math.tan((p * Math.PI) / 180) * DS;
      }
      for (let i = 0; i < N; i++) {
        const s = i * DS - S0; let m = 0;
        for (let j = 0; j < mods.length; j++) {
          const md = mods[j];
          if (md.type === 'roll') { const u = s - md.s; if (u > 0 && u < md.l) m += md.a * 0.5 * (1 - Math.cos((TAU * u) / md.l)); }
          else m -= md.D * G.smooth((s - md.s + md.w * 0.5) / md.w);
        }
        ey[i] += m;
      }
      this.drop = -ey[Math.round((this.finishS + S0) / DS)];

      /* height grid */
      const limR = F(), limL = F();
      for (let i = 0; i < N; i++) {
        let kmax = 0, kmin = 0;
        for (let j = Math.max(0, i - 10); j <= Math.min(N - 1, i + 10); j++) { if (kap[j] > kmax) kmax = kap[j]; if (kap[j] < kmin) kmin = kap[j]; }
        limR[i] = kmax > 1e-5 ? 0.78 / kmax : 1e9; limL[i] = kmin < -1e-5 ? 0.78 / -kmin : 1e9;
      }
      this.limR = limR; this.limL = limL;
      const gx = (this.gx = new Float32Array(N * NC)), gh = (this.gh = new Float32Array(N * NC));
      for (let i = 0; i < N; i++) {
        const s = i * DS - S0, hwI = hw[i], W = hwI + EDGE;
        for (let c = 0; c < NC; c++) {
          let x0;
          if (c < NO) x0 = -(W + OUT[NO - 1 - c]);
          else if (c < NO + NIN) x0 = (((c - NO) / (NIN - 1)) * 2 - 1) * W;
          else x0 = W + OUT[c - NO - NIN];
          let x = x0;
          /* Inside a bend there is only so much room before the shelf folds over itself.
             Squeeze it into what room there is rather than flattening it into an apron. */
          const lim = x0 > 0 ? limR[i] : limL[i];
          if (Math.abs(x0) > W && Math.abs(cut[i]) > 0.25 && lim < 1e8) {
            const room = Math.max(3, lim - W), d0 = Math.abs(x0) - W;
            x = (x0 < 0 ? -1 : 1) * (W + room * (1 - Math.exp(-d0 / room)));
          } else if (x > limR[i]) x = limR[i]; else if (x < -limL[i]) x = -limL[i];
          const u = x / hwI, au = Math.abs(u);
          let h = ey[i], namp = 0.9 + pow[i] * 0.7;
          const PW = 4.2;   /* superpipe wall: flat floor, then a steepening transition to the deck */
          if (au <= 1) h += crown[i] * u * u + gully[i] * Math.pow(au, 2.4) + pipe[i] * PW * Math.pow(G.clamp((au - 0.45) / 0.5, 0, 1), 1.5);
          else {
            const d = Math.abs(x) - hwI, cs = cut[i];
            /* on a cut road the hillside climbs on one side and drops away on the other */
            const out = Math.abs(cs) > 0.25 ? ((x < 0 ? -1 : 1) * cs > 0 ? 0.62 : -0.52) : crown[i] < -0.5 ? -0.22 : 0.42;
            h += crown[i] + gully[i] + pipe[i] * PW + out * (d < 40 ? d : 40 + (d - 40) * 0.3);
            namp += Math.min(d, 40) * 0.07;
          }
          h += (G.fbm(s / 55, x / 48, nseed) - 0.5) * namp * 2;
          if (mog[i] > 0.01 && au < 0.95) {
            const m = Math.sin((TAU * s) / 9.5 + 1.2 * Math.sin(x / 4.7)) * Math.sin((TAU * x) / 8.5 + 0.9 * Math.sin(s / 6.1));
            h += mog[i] * (m > 0 ? m : m * 0.35) * 0.55 * G.smooth((0.95 - au) / 0.15);
          }
          gx[i * NC + c] = x; gh[i * NC + c] = h;
        }
      }

      /* feature lookups */
      this.kb = {}; this.rb = {};
      for (const kd of this.kickers) {
        for (let b = Math.floor((kd.sa + S0) / 40); b <= Math.floor((kd.sa + kd.len + S0) / 40); b++) (this.kb[b] = this.kb[b] || []).push(kd);
      }
      for (const r of this.rails) {
        r.y0 = this.gridH(r.s0, r.x) + r.hr; r.y1 = this.gridH(r.s1, r.x) + r.hr; r.m = (r.y1 - r.y0) / (r.s1 - r.s0);
        for (let b = Math.floor((r.s0 - 2 + S0) / 40); b <= Math.floor((r.s1 + S0) / 40); b++) (this.rb[b] = this.rb[b] || []).push(r);
      }
      for (const o of this.orbs) { o.y = this.height(o.s, o.x) + o.h; o.taken = false; }
      this.ob = {};
      this.orbs.forEach((o) => { const b = Math.floor((o.s + S0) / 40); (this.ob[b] = this.ob[b] || []).push(o); });

      this.layoutLift(rnd);
      this.scatter(rnd);
    }

    /* Resample a surveyed centreline into heading and pitch along s. */
    realPath(id) {
      const geo = G.GEO && G.GEO[this.resort.id], src = geo && geo.picks && geo.picks[id];
      if (!src) return null;
      const raw = [];
      for (let i = 0; i < src.p.length; i += 3) raw.push([src.p[i], src.p[i + 1], src.p[i + 2]]);
      const pts = [raw[0]];
      for (let i = 1; i < raw.length; i++) if (Math.hypot(raw[i][0] - pts[pts.length - 1][0], raw[i][1] - pts[pts.length - 1][1]) > 2) pts.push(raw[i]);
      const n = pts.length, cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      /* realTrim [from, to] in metres rides only part of a very long trail */
      const full = cum[n - 1], tr = this.def.realTrim || [0, full];
      const d0 = Math.max(0, Math.min(full - 120, tr[0])), len = Math.max(120, Math.min(full, tr[1]) - d0);
      const M = Math.ceil(len / DS) + 1, head = new Float32Array(M), el = new Float32Array(M);
      let k = 0;
      for (let i = 0; i < M; i++) {
        const d = d0 + Math.min(len, i * DS);
        while (k < n - 2 && cum[k + 1] < d) k++;
        const t = (d - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
        el[i] = pts[k][2] + (pts[k + 1][2] - pts[k][2]) * t;
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 2)];
        head[i] = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
      }
      /* unwrap, then relative to the start so the run begins pointing down the page */
      for (let i = 1; i < M; i++) head[i] = head[i - 1] + G.wrapPi(head[i] - head[i - 1]);
      const h0 = head[0];
      for (let i = 0; i < M; i++) head[i] -= h0;
      for (let pass = 0; pass < 3; pass++) for (let i = 1; i < M - 1; i++) head[i] = (head[i - 1] + 2 * head[i] + head[i + 1]) / 4;
      /* pitch: smoothed, never uphill, never flatter than a slow glide */
      for (let pass = 0; pass < 6; pass++) for (let i = 1; i < M - 1; i++) el[i] = (el[i - 1] + 2 * el[i] + el[i + 1]) / 4;
      const pit = new Float32Array(M);
      for (let i = 0; i < M; i++) {
        const a = el[Math.max(0, i - 1)], b = el[Math.min(M - 1, i + 1)];
        pit[i] = Math.max(2.2, Math.min(40, (Math.atan2(a - b, DS * (Math.min(M - 1, i + 1) - Math.max(0, i - 1))) * 180) / Math.PI));
      }
      const at = (arr, s) => { let f = s / DS; if (f < 0) f = 0; else if (f > M - 1.001) f = M - 1.001; const i = Math.floor(f); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };
      return { len, top: el[0], bottom: el[M - 1], psiAt: (s) => at(head, s), pitchAt: (s) => at(pit, s) };
    }

    /* ---- lookups ---- */
    rowH(i, x) {
      const gh = this.gh, gx = this.gx, W = this.hw[i] + EDGE, o = i * NC;
      if (x <= -W) {
        const d = -x - W; let prev = 0, hp = gh[o + NO];
        for (let k = 0; k < NO; k++) { const col = o + NO - 1 - k, dk = -gx[col] - W, hk = gh[col]; if (d <= dk) return hp + ((hk - hp) * (d - prev)) / Math.max(1e-4, dk - prev); prev = dk; hp = hk; }
        return hp;
      }
      if (x >= W) {
        const d = x - W; let prev = 0, hp = gh[o + NO + NIN - 1];
        for (let k = 0; k < NO; k++) { const col = o + NO + NIN + k, dk = gx[col] - W, hk = gh[col]; if (d <= dk) return hp + ((hk - hp) * (d - prev)) / Math.max(1e-4, dk - prev); prev = dk; hp = hk; }
        return hp;
      }
      const f = (x / W + 1) * 0.5 * (NIN - 1);
      let j = Math.floor(f); if (j > NIN - 2) j = NIN - 2;
      const a = gh[o + NO + j];
      return a + (gh[o + NO + j + 1] - a) * (f - j);
    }
    gridH(s, x) {
      let f = (s + S0) / DS;
      if (f < 0) f = 0; else if (f > this.N - 1.001) f = this.N - 1.001;
      const i = Math.floor(f), a = this.rowH(i, x);
      return a + (this.rowH(i + 1, x) - a) * (f - i);
    }
    featH(s, x) {
      const list = this.kb[Math.floor((s + S0) / 40)];
      if (!list) return 0;
      let h = 0;
      for (let i = 0; i < list.length; i++) { const v = kickH(list[i], s, x); if (v > h) h = v; }
      return h;
    }
    height(s, x) { return this.gridH(s, x) + this.featH(s, x); }
    rowF(s) { let f = (s + S0) / DS; if (f < 0) f = 0; else if (f > this.N - 1.001) f = this.N - 1.001; return f; }
    hwAt(s) { const f = this.rowF(s), i = Math.floor(f); return this.hw[i] + (this.hw[i + 1] - this.hw[i]) * (f - i); }
    kapAt(s) { const f = this.rowF(s), i = Math.floor(f); return this.kap[i] + (this.kap[i + 1] - this.kap[i]) * (f - i); }
    psiAt(s) { const f = this.rowF(s), i = Math.floor(f); return this.psi[i] + (this.psi[i + 1] - this.psi[i]) * (f - i); }
    secAt(s) { return this.secs[this.sec[Math.round(this.rowF(s))]]; }
    powAt(s) { const f = this.rowF(s), i = Math.floor(f); return this.pow[i] + (this.pow[i + 1] - this.pow[i]) * (f - i); }
    lineX(s) { return this.hwAt(s) * 0.3 * Math.sin(s / 55 + (this.seed % 7)); }
    toWorld(s, x, y, out) {
      const f = this.rowF(s), i = Math.floor(f), t = f - i;
      const ps = this.psi[i] + (this.psi[i + 1] - this.psi[i]) * t;
      out.x = this.cx[i] + (this.cx[i + 1] - this.cx[i]) * t + Math.cos(ps) * x;
      out.y = y;
      out.z = this.cz[i] + (this.cz[i + 1] - this.cz[i]) * t + Math.sin(ps) * x;
      return out;
    }
    railTop(r, s) { const t = (s - r.s0) / (r.s1 - r.s0); return r.y0 + (r.y1 - r.y0) * t + r.arc * Math.sin(Math.PI * G.clamp(t, 0, 1)); }
    railSlope(r, s) { const t = (s - r.s0) / (r.s1 - r.s0); return r.m + ((r.arc * Math.PI) / (r.s1 - r.s0)) * Math.cos(Math.PI * t); }
    project(X, Z) {
      const cx = this.cx, cz = this.cz, N = this.N;
      let best = 1e18, bi = 0;
      for (let i = 0; i < N; i += 6) { const d = (cx[i] - X) * (cx[i] - X) + (cz[i] - Z) * (cz[i] - Z); if (d < best) { best = d; bi = i; } }
      for (let i = Math.max(0, bi - 6); i <= Math.min(N - 1, bi + 6); i++) { const d = (cx[i] - X) * (cx[i] - X) + (cz[i] - Z) * (cz[i] - Z); if (d < best) { best = d; bi = i; } }
      const ps = this.psi[bi], dx = X - cx[bi], dz = Z - cz[bi];
      return { s: bi * DS - S0 + dx * Math.sin(ps) - dz * Math.cos(ps), x: dx * Math.cos(ps) + dz * Math.sin(ps) };
    }

    /* ---- lift line: follows a smoothed copy of the run, off to one side ---- */
    layoutLift(rnd) {
      const N = this.N, cx = this.cx, cz = this.cz, hw = this.hw;
      const win = Math.round(300 / DS);
      const px = new Float64Array(N + 1), pz = new Float64Array(N + 1), ph = new Float64Array(N + 1);
      for (let i = 0; i < N; i++) { px[i + 1] = px[i] + cx[i]; pz[i + 1] = pz[i] + cz[i]; ph[i + 1] = ph[i] + hw[i]; }
      const sm = (p, i) => { const a = Math.max(0, i - win), b = Math.min(N, i + win + 1); return (p[b] - p[a]) / (b - a); };
      let dev = 0;
      for (let i = 0; i < N; i += 4) { const d = Math.hypot(cx[i] - sm(px, i), cz[i] - sm(pz, i)); if (d > dev) dev = d; }
      const side = rnd() < 0.5 ? -1 : 1;
      const pts = [];
      const i0 = Math.round((S0 - 30) / DS), i1 = Math.round((this.Lmain + 70 + S0) / DS);
      for (let i = i0; i <= i1; i += 4) {
        const ia = Math.max(0, i - 6), ib = Math.min(N - 1, i + 6);
        let tx = sm(px, ib) - sm(px, ia), tz = sm(pz, ib) - sm(pz, ia);
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const off = side * (sm(ph, i) + dev + 13);
        const X = sm(px, i) - tz * off, Z = sm(pz, i) + tx * off;
        const pr = this.project(X, Z);
        pts.push({ X, Z, s: pr.s, x: pr.x, y: this.gridH(pr.s, pr.x) });
      }
      this.lift = { pts, side };
    }
    nearLift(X, Z, s) {
      const pts = this.lift.pts; if (!pts.length) return false;
      const guess = Math.round(((s + 30) / (this.Lmain + 100)) * (pts.length - 1));
      for (let i = Math.max(0, guess - 14); i <= Math.min(pts.length - 1, guess + 14); i++) {
        const dx = pts[i].X - X, dz = pts[i].Z - Z; if (dx * dx + dz * dz < 30) return true;
      }
      return false;
    }

    /* ---- trees, rocks, rope poles, lamps, colliders ---- */
    addCollider(s, x, r, top, kind) {
      const b = Math.floor((s + S0) / 12);
      (this.cb[b] = this.cb[b] || []).push({ s, x, r, top, kind, kill: kind === 'tree' && !!this.def.deadTrees });
    }
    clearOfFeatures(s, x) {
      if (Math.abs(x - this.lineX(s)) < 5.5) return false;
      for (const k of this.kickers) if (s > k.sa - 30 && s < k.sa + k.len + 38 && Math.abs(x - k.x) < k.w * 0.5 + 5) return false;
      for (const r of this.rails) if (s > r.s0 - 30 && s < r.s1 + 20 && Math.abs(x - r.x) < 5) return false;
      for (const d of this.drops) if (s > d.s - 10 && s < d.s + 26) return false;
      for (const o of this.orbs) if (Math.abs(s - o.s) < 8 && Math.abs(x - o.x) < 4) return false;
      return true;
    }
    scatter(rnd) {
      const trees = (this.trees = []), rocks = (this.rocks = []), poles = (this.poles = []), lamps = (this.lamps = []);
      this.cb = {};
      const v = new T.Vector3();
      const step = 3.6;
      const put = (s, x, sc) => {
        const i = Math.round(this.rowF(s));
        if (x > this.limR[i] * 0.95 || x < -this.limL[i] * 0.95) return;
        this.toWorld(s, x, 0, v);
        if (this.nearLift(v.x, v.z, s)) return;
        const y = this.gridH(s, x) - 0.35;
        trees.push({ s, x, sc, X: v.x, Y: y, Z: v.z, rot: rnd() * TAU });
        if (Math.abs(x) < this.hwAt(s) + 16) this.addCollider(s, x, 0.3 + sc * 0.2, y + 6.3 * sc, 'tree');
      };
      for (let s = -S0 + 3; s < this.L - 2; s += step) {
        const i = Math.round(this.rowF(s)), sec0 = this.secs[this.sec[i]], mode = sec0.trees, hwS = this.hw[i];
        const d0 = sec0.pipe ? 17 : 3.5;        /* keep the pipe deck clear */
        for (let side = -1; side <= 1; side += 2) {
          if (mode === 'edge' || mode === 'glade') {
            for (let d = d0; d < 58; d += 3.6) {
              const p = d < 16 ? 0.55 : d < 32 ? 0.34 : 0.17;
              if (rnd() < p) put(s + rnd() * step, side * (hwS + d + rnd() * 3), 0.9 + rnd() * 0.8 + d * 0.006);
            }
          } else if (mode === 'sparse') {
            for (let d = 5; d < 58; d += 6) if (rnd() < 0.14) put(s + rnd() * step, side * (hwS + d + rnd() * 5), 0.4 + rnd() * 0.45);
          }
          if (mode === 'none' || mode === 'sparse') {
            for (let d = 6; d < 62; d += 8) {
              if (rnd() < 0.05) {
                const x = side * (hwS + d + rnd() * 7), ss = s + rnd() * step, sz = 0.8 + rnd() * 2.2;
                this.toWorld(ss, x, 0, v);
                rocks.push({ X: v.x, Y: this.gridH(ss, x) - sz * 0.25, Z: v.z, sz, rot: rnd() * TAU });
                if (d < 10) this.addCollider(ss, x, sz * 0.75, 1e9, 'rock');
              }
            }
          }
        }
        if (mode === 'glade' && s > 45 && s < this.Lmain - 5) {
          for (let xx = -hwS + 2; xx < hwS - 2; xx += 5.5) {
            if (rnd() < 0.16) { const x = xx + rnd() * 5, ss = s + rnd() * step; if (this.clearOfFeatures(ss, x)) put(ss, x, 0.9 + rnd() * 0.7); }
          }
        }
      }
      /* rope-line poles on open terrain */
      for (let s = 6; s < this.Lmain + 20; s += 26) {
        for (let side = -1; side <= 1; side += 2) {
          const x = side * (this.hwAt(s) + 0.6); this.toWorld(s, x, this.gridH(s, x), v); poles.push({ X: v.x, Y: v.y, Z: v.z, side });
        }
      }
      /* rocks flanking each drop */
      for (const d of this.drops) {
        for (let side = -1; side <= 1; side += 2) for (let q = 0; q < 4; q++) {
          const ss = d.s + rnd() * 3 - 1, x = side * (this.hwAt(ss) + 0.5 + q * 2.4 + rnd()), sz = 1.2 + rnd() * 1.6;
          this.toWorld(ss, x, 0, v); rocks.push({ X: v.x, Y: this.gridH(ss, x) - sz * 0.3, Z: v.z, sz, rot: rnd() * TAU });
        }
      }
      /* lamp posts for night sessions */
      if (this.def.sky === 'night') {
        let q = 0;
        for (let s = -20; s < this.L - 10; s += 44, q++) {
          const x = (q % 2 ? 1 : -1) * (this.hwAt(s) + 2.5); this.toWorld(s, x, this.gridH(s, x), v);
          lamps.push({ s, x, X: v.x, Y: v.y, Z: v.z });
        }
      }
      /* lift towers */
      const lp = this.lift.pts, towers = (this.lift.towers = []);
      for (let i = 2; i < lp.length; i += 11) {
        const p = lp[i]; towers.push({ X: p.X, Y: p.y, Z: p.Z });
        if (Math.abs(p.x) < this.hwAt(p.s) + 10) this.addCollider(p.s, p.x, 0.7, 1e9, 'lift tower');
      }
    }
  }
  G.Run = Run;

  /* ====================================================================== */
  G.SKY = {
    bluebird: { top: 0x1e68cc, hor: 0xc6e4ff, fog: 0xd6eaff, fogNear: 320, fogFar: 2900, sun: 0xfff0d6, sunI: 0.92, sunAz: 52, sunEl: 30, hemiSky: 0xb4d4ff, hemiGround: 0xf2f6ff, hemiI: 0.5, snow: 0, ridge: 0x6f8fb5, cap: 0xffffff },
    dawn: { top: 0x7f93d6, hor: 0xffdcc0, fog: 0xf6d6c6, fogNear: 300, fogFar: 2900, sun: 0xffc89c, sunI: 1.0, sunAz: 62, sunEl: 17, hemiSky: 0xb9b6ec, hemiGround: 0xffe4d6, hemiI: 0.66, snow: 0, ridge: 0x8a7ba6, cap: 0xffe3d4 },
    snow: { top: 0xb4bec8, hor: 0xe1e7ec, fog: 0xe1e7ec, fogNear: 30, fogFar: 520, sun: 0xffffff, sunI: 0.2, sunAz: 40, sunEl: 55, hemiSky: 0xe6ecf2, hemiGround: 0xffffff, hemiI: 0.76, snow: 1, ridge: 0xcfd7de, cap: 0xe6ebf0 },
    overcast: { top: 0x93a5b6, hor: 0xd6dee5, fog: 0xd6dee5, fogNear: 120, fogFar: 1150, sun: 0xfff8ee, sunI: 0.36, sunAz: 60, sunEl: 45, hemiSky: 0xd6e0ea, hemiGround: 0xffffff, hemiI: 0.62, snow: 0.3, ridge: 0x9fb0bf, cap: 0xe4eaef },
    dusk: { top: 0x2b3f86, hor: 0xffb48c, fog: 0xf2c2ae, fogNear: 260, fogFar: 2800, sun: 0xff9d62, sunI: 0.9, sunAz: 72, sunEl: 14, hemiSky: 0x8c9ee0, hemiGround: 0xffd8c8, hemiI: 0.72, snow: 0, ridge: 0x5f5488, cap: 0xffc9b8 },
    night: { top: 0x040816, hor: 0x0f1b36, fog: 0x0a1226, fogNear: 50, fogFar: 650, sun: 0xfff0d0, sunI: 0.82, sunAz: 20, sunEl: 62, hemiSky: 0x4a5f92, hemiGround: 0x1f2a4a, hemiI: 0.72, snow: 0.15, ridge: 0x0b1326, cap: 0x26324d, night: true },
  };

  function snowTexture(kind, aniso) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = '#f5f8fc'; g.fillRect(0, 0, 256, 256);
    const rnd = G.rng(kind === 'groomed' ? 7 : 11);
    if (kind === 'groomed') {
      /* corduroy comes from the normal map, which is masked to the piste; keep the colour plain */
      for (let i = 0; i < 26; i++) { const x = rnd() * 256, y = rnd() * 256, r = 20 + rnd() * 44; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(150,175,210,0.07)'); gr.addColorStop(1, 'rgba(150,175,210,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    } else {
      for (let i = 0; i < 26; i++) { const x = rnd() * 256, y = rnd() * 256, r = 18 + rnd() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(150,175,210,0.10)'); gr.addColorStop(1, 'rgba(150,175,210,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(110,140,185,0.16)' : 'rgba(255,255,255,0.85)'; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.5, 1 + rnd() * 2.5); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; return t;
  }
  function corduroyNormal(aniso) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), img = g.createImageData(256, 256), d = img.data, rnd = G.rng(5);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const o = (y * 256 + x) * 4, nx = Math.sin((x / 256) * Math.PI * 2 * 16) * 0.8 + (rnd() - 0.5) * 0.2;
      d[o] = 128 + nx * 105; d[o + 1] = 128 + (rnd() - 0.5) * 26; d[o + 2] = 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; return t;
  }
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
  }
  function drawSym(g, sym, cx, cy, r, color) {
    g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = r * 0.16;
    const dia = (x) => { g.beginPath(); g.moveTo(x, cy - r); g.lineTo(x + r * 0.72, cy); g.lineTo(x, cy + r); g.lineTo(x - r * 0.72, cy); g.closePath(); g.fill(); g.stroke(); };
    if (sym === 'circle') { g.beginPath(); g.arc(cx, cy, r * 0.82, 0, TAU); g.fill(); g.stroke(); }
    else if (sym === 'square') { g.fillRect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5); g.strokeRect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5); }
    else if (sym === 'diamond') dia(cx);
    else if (sym === 'double') { dia(cx - r * 0.62); dia(cx + r * 0.62); }
    else { g.beginPath(); g.ellipse(cx, cy, r * 1.15, r * 0.66, 0, 0, TAU); g.fill(); g.stroke(); }
  }
  function bannerTexture(text, sub, diffKey) {
    const d = G.DIFF[diffKey] || { color: '#ff5b1f', sym: null };
    const c = document.createElement('canvas'); c.width = 1024; c.height = 192; const g = c.getContext('2d');
    g.fillStyle = diffKey ? '#f4f1e8' : '#ff5b1f'; g.fillRect(0, 0, 1024, 192);
    g.fillStyle = diffKey ? '#123' : '#fff'; g.fillRect(0, 0, 1024, 10); g.fillRect(0, 182, 1024, 10);
    let tx = 60;
    if (d.sym) { drawSym(g, d.sym, 110, 96, 54, d.color); tx = 210; }
    g.fillStyle = diffKey ? '#10212b' : '#fff'; g.textBaseline = 'middle';
    let fs = 92; g.font = `800 ${fs}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
    const up = text.toUpperCase();
    while (g.measureText(up).width > 1024 - tx - 50 && fs > 40) { fs -= 4; g.font = `800 ${fs}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`; }
    g.fillText(up, tx, sub ? 78 : 100);
    if (sub) { g.font = '600 34px "Big Shoulders Display", "Arial Narrow", sans-serif'; g.globalAlpha = 0.7; g.fillText(sub.toUpperCase(), tx + 2, 146); g.globalAlpha = 1; }
    const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  function treeGeo() {
    const green = [0.06, 0.2, 0.15], snow = [0.94, 0.97, 1.0];
    const tier = (r, h, y0) => {
      const g = new T.ConeGeometry(r, h, 7, 1, true); g.translate(0, y0 + h / 2, 0);
      return { g, color: (x, y) => { const t = (y - y0) / h; return t > 0.5 ? snow : [G.lerp(green[0], 0.3, t), G.lerp(green[1], 0.42, t), G.lerp(green[2], 0.36, t)]; } };
    };
    const trunk = new T.CylinderGeometry(0.16, 0.22, 1.5, 5); trunk.translate(0, 0.75, 0);
    return G.mergeGeos([{ g: trunk, color: [0.27, 0.2, 0.15] }, tier(1.55, 2.7, 1.1), tier(1.2, 2.4, 2.6), tier(0.82, 2.1, 4.1)]);
  }
  function rockGeo() {
    const g = new T.DodecahedronGeometry(1, 0);
    return G.mergeGeos([{ g, color: (x, y) => (y > 0.45 ? [0.93, 0.95, 0.99] : [0.3 + y * 0.05, 0.3, 0.33]) }]);
  }
  function chairGeo() {
    const b = (w, h, d, x, y, z) => { const g = new T.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
    const red = [0.72, 0.13, 0.12], steel = [0.2, 0.22, 0.25];
    const parts = [
      { g: b(0.08, 2.3, 0.08, 0, -1.15, 0), color: steel },
      { g: b(2.3, 0.1, 0.55, 0, -2.3, 0), color: red },
      { g: b(2.3, 0.6, 0.08, 0, -1.98, 0.28), color: red },
      { g: b(2.3, 0.06, 0.06, 0, -1.7, -0.32), color: steel },
      { g: b(2.3, 0.05, 0.3, 0, -2.85, -0.36), color: steel },
      { g: b(2.5, 0.12, 0.9, 0, -0.02, 0), color: red },
    ];
    const jackets = [[0.12, 0.42, 0.75], [0.95, 0.72, 0.16], [0.2, 0.6, 0.4]];
    [-0.72, 0, 0.72].forEach((x, i) => {
      parts.push({ g: b(0.4, 0.62, 0.34, x, -1.92, 0.05), color: jackets[i] });
      parts.push({ g: b(0.34, 0.2, 0.5, x, -2.2, -0.2), color: [0.13, 0.15, 0.2] });
      const h = new T.SphereGeometry(0.17, 8, 6); h.translate(x, -1.46, 0.04); parts.push({ g: h, color: [0.9, 0.9, 0.88] });
    });
    return G.mergeGeos(parts);
  }
  function towerGeo() {
    const p = new T.CylinderGeometry(0.26, 0.36, 11.5, 8); p.translate(0, 5.75, 0);
    const a = new T.BoxGeometry(4.4, 0.3, 0.45); a.translate(0, 11.5, 0);
    return G.mergeGeos([{ g: p, color: [0.36, 0.42, 0.43] }, { g: a, color: [0.3, 0.35, 0.36] }]);
  }

  /* ====================================================================== */
  class World {
    constructor(run, renderer, quality) {
      this.run = run; this.q = quality; this.disposables = [];
      const sky = (this.sky = G.SKY[run.def.sky] || G.SKY.bluebird);
      const scene = (this.scene = new T.Scene());
      scene.fog = new T.Fog(sky.fog, sky.fogNear, sky.fogFar);
      scene.background = new T.Color(sky.hor);
      this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      this.accent = new T.Color(G.DIFF[run.def.diff].color === '#14181c' ? '#ff5b1f' : G.DIFF[run.def.diff].color);

      const hemi = new T.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemiI); scene.add(hemi);
      const az = (sky.sunAz * Math.PI) / 180, el = (sky.sunEl * Math.PI) / 180;
      this.sunDir = new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      const sun = (this.sun = new T.DirectionalLight(sky.sun, sky.sunI)); scene.add(sun); scene.add(sun.target);
      if (quality !== 'low') {
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
        const c = sun.shadow.camera; c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.near = 10; c.far = 520;
        sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.5;
      }
      this.buildSky(); this.buildTerrain(); this.buildBackdrop(); this.buildFeatures(); this.buildScatter(); this.buildLift(); this.buildProps();
      if (sky.snow > 0) this.buildSnowfall(sky.snow);
    }
    own(o) { this.disposables.push(o); return o; }

    buildSky() {
      const sky = this.sky, scene = this.scene;
      const mat = this.own(new T.ShaderMaterial({
        uniforms: { top: { value: new T.Color(sky.top) }, hor: { value: new T.Color(sky.hor) }, sunDir: { value: this.sunDir }, sunCol: { value: new T.Color(sky.sun) }, glow: { value: sky.night ? 0.0 : sky.snow >= 1 ? 0.1 : 1.0 } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir; void main(){ vec3 d = normalize(vDir); float h = clamp(d.y*1.5+0.04,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.6)); float sd = max(dot(d, sunDir),0.0); c += sunCol*(pow(sd,900.0)*1.4 + pow(sd,14.0)*0.2)*glow; gl_FragColor = vec4(c,1.0); }',
        side: T.BackSide, depthWrite: false, fog: false,
      }));
      const dome = (this.dome = new T.Mesh(this.own(new T.SphereGeometry(9000, 24, 14)), mat)); dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);

      /* distant ridgelines + named volcanoes */
      const peaks = this.run.resort.peaks || [];
      const hor = new T.Color(sky.hor), ridge = new T.Color(sky.ridge), cap = new T.Color(sky.cap);
      const ring = (R, seed, base, amp, mix, usePeaks, snowline) => {
        const NS = 360, pos = [], col = [], idx = [];
        const cRidge = hor.clone().lerp(ridge, mix), cCap = hor.clone().lerp(cap, 0.75);
        for (let j = 0; j <= NS; j++) {
          const a = (j / NS) * TAU, deg = ((a * 180) / Math.PI + 180) % 360 - 180;
          let h = base + amp * (G.fbm(j * 0.09, 1.3, seed) + 0.45 * G.fbm(j * 0.31, 7.7, seed + 3));
          if (usePeaks) for (const p of peaks) { let dd = Math.abs(deg - p.az); if (dd > 180) dd = 360 - dd; const g = Math.exp(-(dd * dd) / (2 * p.w * p.w * 0.5)); h = Math.max(h, base * 0.4 + p.h * g * (0.85 + 0.3 * G.noise2(j * 0.7, 2, seed))); }
          const x = R * Math.sin(a), z = -R * Math.cos(a), mid = Math.min(h, snowline);
          pos.push(x, -900, z, x, mid, z, x, h, z);
          const top = h > snowline + 30 ? cCap : cRidge;
          col.push(hor.r, hor.g, hor.b, cRidge.r, cRidge.g, cRidge.b, top.r, top.g, top.b);
          if (j < NS) { const o = j * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
        }
        const g = this.own(new T.BufferGeometry());
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx);
        const m = new T.Mesh(g, this.own(new T.MeshBasicMaterial({ vertexColors: true, fog: false, side: T.DoubleSide, depthWrite: false })));
        m.frustumCulled = false; m.renderOrder = -9; return m;
      };
      this.rings = new T.Group();
      this.rings.add(ring(7600, 5, 320, 520, 0.5, true, 640));
      const near = ring(5600, 23, 80, 380, 0.8, false, 1e9); near.renderOrder = -8; this.rings.add(near);
      scene.add(this.rings);
      if (sky.night) {
        const n = 700, pos = new Float32Array(n * 3), rnd = G.rng(99);
        for (let i = 0; i < n; i++) { const a = rnd() * TAU, e = 0.08 + rnd() * 1.4, R = 8600; pos[i * 3] = R * Math.cos(e) * Math.sin(a); pos[i * 3 + 1] = R * Math.sin(e); pos[i * 3 + 2] = R * Math.cos(e) * Math.cos(a); }
        const g = this.own(new T.BufferGeometry()); g.setAttribute('position', new T.BufferAttribute(pos, 3));
        const st = new T.Points(g, this.own(new T.PointsMaterial({ color: 0xcfe0ff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false })));
        st.frustumCulled = false; st.renderOrder = -9; this.rings.add(st);
      }
    }

    buildTerrain() {
      const run = this.run, N = run.N, gx = run.gx, gh = run.gh, sky = this.sky;
      const P = new Float32Array(N * NC * 3), Nn = new Float32Array(N * NC * 3);
      for (let i = 0; i < N; i++) {
        const c0 = Math.cos(run.psi[i]), s0 = Math.sin(run.psi[i]);
        for (let c = 0; c < NC; c++) { const o = (i * NC + c) * 3, x = gx[i * NC + c]; P[o] = run.cx[i] + c0 * x; P[o + 1] = gh[i * NC + c]; P[o + 2] = run.cz[i] + s0 * x; }
      }
      for (let i = 0; i < N; i++) for (let c = 0; c < NC; c++) {
        const ia = Math.max(0, i - 1), ib = Math.min(N - 1, i + 1), ca = Math.max(0, c - 1), cb = Math.min(NC - 1, c + 1);
        const a = (ia * NC + c) * 3, b = (ib * NC + c) * 3, l = (i * NC + ca) * 3, r = (i * NC + cb) * 3;
        const sx = P[b] - P[a], sy = P[b + 1] - P[a + 1], sz = P[b + 2] - P[a + 2];
        let dx = P[r] - P[l], dy = P[r + 1] - P[l + 1], dz = P[r + 2] - P[l + 2];
        if (dx * dx + dz * dz < 1e-6) { dx = Math.cos(run.psi[i]); dy = 0; dz = Math.sin(run.psi[i]); }
        let nx = dy * sz - dz * sy, ny = dz * sx - dx * sz, nz = dx * sy - dy * sx;
        const nl = Math.hypot(nx, ny, nz) || 1; const o = (i * NC + c) * 3;
        Nn[o] = nx / nl; Nn[o + 1] = ny / nl; Nn[o + 2] = nz / nl;
      }
      const texG = this.own(snowTexture('groomed', this.aniso)), texP = this.own(snowTexture('powder', this.aniso));
      const matG = this.own(new T.MeshStandardMaterial({ vertexColors: true, map: texG, roughness: 0.6, metalness: 0, normalMap: this.own(corduroyNormal(this.aniso)), normalScale: new T.Vector2(0.38, 0.38) }));
      /* corduroy only between the piste markers: the groom weight rides in as a vertex attribute */
      matG.onBeforeCompile = (sh) => {
        const chunk = T.ShaderChunk.normal_fragment_maps;
        sh.vertexShader = 'attribute float aGroom;\nvarying float vGroom;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGroom = aGroom;');
        sh.fragmentShader = 'varying float vGroom;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>',
          chunk ? chunk.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vGroom;') : '#include <normal_fragment_maps>');
        G.groomPatched = sh.fragmentShader.indexOf('normalScale * vGroom') > 0;
      };
      const matP = this.own(new T.MeshStandardMaterial({ vertexColors: true, map: texP, roughness: 0.96, metalness: 0 }));
      const lamps = run.lamps;
      const lampF = (s, x) => {
        if (!sky.night) return 1;
        let f = 0.36; const qi = Math.round((s + 20) / 44);
        for (let q = qi - 1; q <= qi + 1; q++) { const L = lamps[q]; if (!L) continue; const d2 = (s - L.s) * (s - L.s) + (x - L.x) * (x - L.x); f = Math.max(f, 0.36 + 0.64 * Math.exp(-d2 / (2 * 28 * 28))); }
        return f;
      };
      const RPC = 48; this.chunks = [];
      for (let i0 = 0; i0 < N - 1; i0 += RPC) {
        const i1 = Math.min(i0 + RPC, N - 1), rows = i1 - i0 + 1, nv = rows * NC;
        const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), grm = new Float32Array(nv);
        const idx = new Uint16Array((rows - 1) * (NC - 1) * 6);
        let powSum = 0;
        for (let r = 0; r < rows; r++) {
          const i = i0 + r, s = i * DS - S0, hwI = run.hw[i], sc = run.secs[run.sec[i]];
          powSum += sc.pow;
          for (let c = 0; c < NC; c++) {
            const src = (i * NC + c) * 3, dst = (r * NC + c) * 3, x = gx[i * NC + c];
            pos[dst] = P[src]; pos[dst + 1] = P[src + 1]; pos[dst + 2] = P[src + 2];
            nor[dst] = Nn[src]; nor[dst + 1] = Nn[src + 1]; nor[dst + 2] = Nn[src + 2];
            const d = Math.abs(x) - hwI; let cr = 0.975, cg = 0.985, cb = 1.0;
            grm[r * NC + c] = sc.pow > 0.5 || sc.mog > 0.5 ? 0 : 1 - G.smooth(d / 14);
            if (d > 0) { const t = G.smooth(d / 16) * (sc.trees === 'edge' || sc.trees === 'glade' ? 1 : 0.6); cr = G.lerp(cr, 0.76, t); cg = G.lerp(cg, 0.82, t); cb = G.lerp(cb, 0.92, t); }
            const f = lampF(s, x), n = 0.985 + 0.03 * G.noise2(s / 9, x / 9, 5);
            col[dst] = cr * f * n; col[dst + 1] = cg * f * n; col[dst + 2] = cb * f * n;
            uv[(r * NC + c) * 2] = x / 2.6; uv[(r * NC + c) * 2 + 1] = s / 2.6;
          }
        }
        let q = 0;
        for (let r = 0; r < rows - 1; r++) for (let c = 0; c < NC - 1; c++) {
          const a = r * NC + c, b = a + 1, d = a + NC, e = d + 1;
          idx[q++] = a; idx[q++] = b; idx[q++] = e; idx[q++] = a; idx[q++] = e; idx[q++] = d;
        }
        const g = this.own(new T.BufferGeometry());
        g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
        g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
        g.setAttribute('aGroom', new T.BufferAttribute(grm, 1));
        g.setIndex(new T.BufferAttribute(idx, 1)); g.computeBoundingSphere();
        const m = new T.Mesh(g, powSum / rows > 0.5 ? matP : matG);
        m.name = 'piste'; m.receiveShadow = true; m.userData.s0 = i0 * DS - S0; m.userData.s1 = i1 * DS - S0;
        this.scene.add(m); this.chunks.push(m);
      }
    }

    /* The wider mountain around the run: a coarse heightfield that meets the run's edges and
       rolls away into ridges, valleys and forest so the view never ends at a wall of fog. */
    buildBackdrop() {
      const run = this.run, sky = this.sky, seed = (run.seed >> 3) & 0xfff, N = run.N;
      const STEP = this.q === 'low' ? 70 : 46, PAD = 2700;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < N; i += 8) { if (run.cx[i] < x0) x0 = run.cx[i]; if (run.cx[i] > x1) x1 = run.cx[i]; if (run.cz[i] < z0) z0 = run.cz[i]; if (run.cz[i] > z1) z1 = run.cz[i]; }
      x0 -= PAD; x1 += PAD; z0 -= PAD; z1 += PAD;
      const nx = Math.ceil((x1 - x0) / STEP) + 1, nz = Math.ceil((z1 - z0) / STEP) + 1;
      const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
      const sA = -S0 + 1, sB = run.L - 1, eyA = run.ey[0], eyB = run.ey[N - 1];
      const ax = run.cx[N - 1] - run.cx[0], az = run.cz[N - 1] - run.cz[0], al = Math.hypot(ax, az) || 1;
      const avg = (eyA - eyB) / al, midE = (eyA + eyB) / 2;
      const hs = new Float32Array(nx * nz), forest = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const X = x0 + i * STEP, Z = z0 + j * STEP, pr = run.project(X, Z);
        const sC = G.clamp(pr.s, sA, sB), a = Math.abs(pr.x), side = pr.x < 0 ? -1 : 1, hw = run.hwAt(sC);
        /* Through a bend the corridor's outer shelf is pulled in well short of its nominal reach.
           How far the run's own mesh really covers is what decides where this grid takes over. */
        const li = Math.max(0, Math.min(run.N - 1, Math.round((sC + S0) / DS)));
        const lim = side < 0 ? run.limL[li] : run.limR[li];
        const inner = Math.min(hw + EDGE + OUT[NO - 1], Math.max(hw + EDGE, lim));
        const beyond = pr.s - sC, sec = run.secAt(sC);
        let h;
        if (a <= inner && beyond === 0) {
          /* The corridor mesh already covers this ground, and this grid is far too coarse to
             follow it: one flat cell can span the piste and roof it over. Hold the seam exactly,
             then duck well under the run so no cell can surface through it. */
          const inset = inner - a;
          /* Never read the corridor from a single point: one flat cell spans 46 m of a surface
             that rolls on a much shorter wavelength, so take the lowest ground it could bridge. */
          let low = run.gridH(sC, pr.x), t;
          for (const dx of [-STEP * 0.62, STEP * 0.62]) { t = run.gridH(sC, G.clamp(pr.x + dx, -inner, inner)); if (t < low) low = t; }
          for (const ds of [-STEP * 0.62, STEP * 0.62]) { t = run.gridH(G.clamp(sC + ds, sA, sB), pr.x); if (t < low) low = t; }
          /* Tight at the seam, then away under the run fast enough that nothing can surface. */
          h = low - 0.4 - Math.min((inset * inset) / 20, 60);
        } else {
          const d = Math.max(0, a - inner) + Math.abs(beyond), near = run.gridH(sC, side * Math.min(a, inner)) - 0.4;
          const t = ((X - run.cx[0]) * ax + (Z - run.cz[0]) * az) / (al * al);
          const macro = eyA - (eyA - eyB) * G.clamp(t, -0.8, 1.7) - (t > 1 ? (t - 1) * al * 0.03 : 0);
          /* Hold the ground beside the run close to the run's own level and only let the wider
             mountain assert itself further out, or a slope or hollow lands right next to the piste. */
          const ramp = G.smooth(d / 300);
          const trend = (G.fbm(sC / 700 + 9, side * 2.7 + 4, seed) - 0.47) * 0.5 * ramp;
          const hills = ((G.fbm(X / 1500, Z / 1500, seed + 5) - 0.5) * 2 * 340 * G.smooth(d / 1100) + (G.fbm(X / 360, Z / 360, seed + 8) - 0.5) * 2 * 46 * G.smooth(d / 220)) * ramp;
          const k = G.smooth(d / 420);
          h = G.lerp(near, macro + trend * Math.min(d, 1400), k) + (1 - k) * trend * d + hills;
          if (beyond < 0) h += -beyond * avg * 0.5 * (1 - k);
        }
        hs[j * nx + i] = h;
        const fb = sec.trees === 'edge' || sec.trees === 'glade' ? 0.62 : sec.trees === 'sparse' ? 0.3 : 0.06;
        forest[j * nx + i] = G.clamp(fb + (midE - h) / 520, 0, 0.85);
      }
      const dim = sky.night ? 0.3 : 1;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i, X = x0 + i * STEP, Z = z0 + j * STEP, o = k * 3;
        pos[o] = X; pos[o + 1] = hs[k]; pos[o + 2] = Z;
        const hl = hs[j * nx + Math.max(0, i - 1)], hr = hs[j * nx + Math.min(nx - 1, i + 1)], hu = hs[Math.max(0, j - 1) * nx + i], hd = hs[Math.min(nz - 1, j + 1) * nx + i];
        const steep = Math.hypot(hr - hl, hd - hu) / (2 * STEP);
        let r = 0.95, g = 0.965, b = 1.0;
        const wd = G.smooth((forest[k] * 0.92 - G.fbm(X / 210, Z / 210, seed + 21)) / 0.16);
        if (wd > 0.03) { const m = wd * (0.5 + 0.22 * G.noise2(X / 60, Z / 60, seed)); r = G.lerp(r, 0.26, m); g = G.lerp(g, 0.38, m); b = G.lerp(b, 0.34, m); }
        else if (steep > 0.62) { const m = G.smooth((steep - 0.62) / 0.3) * 0.75; r = G.lerp(r, 0.4, m); g = G.lerp(g, 0.38, m); b = G.lerp(b, 0.42, m); }
        col[o] = r * dim; col[o + 1] = g * dim; col[o + 2] = b * dim;
      }
      let q = 0;
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
      const geo = this.own(new T.BufferGeometry());
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeVertexNormals();
      const m = new T.Mesh(geo, this.own(new T.MeshLambertMaterial({ vertexColors: true })));
      m.name = 'backdrop'; m.frustumCulled = false; this.scene.add(m); this.backdrop = m;
    }

    buildFeatures() {
      const run = this.run, scene = this.scene, v = new T.Vector3(), v2 = new T.Vector3();
      const acc = this.accent.clone().lerp(new T.Color(1, 1, 1), 0.52);
      const mat = this.own(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
      this.featGroup = new T.Group(); scene.add(this.featGroup);
      for (const k of run.kickers) {
        const us = [];
        const nR = Math.max(6, Math.round(k.L / 1.1));
        for (let j = 0; j <= nR; j++) us.push((k.L * j) / nR);
        if (!k.ride) us.splice(us.length - 1, 0, k.L - 0.45);
        us.push(k.L + k.T * 0.5, k.L + k.T);
        const nD = Math.max(4, Math.round(k.D / 1.6));
        for (let j = 1; j <= nD; j++) us.push(k.L + k.T + (k.D * j) / nD);
        const hwid = k.w / 2, lat = [-(hwid + k.side), -(hwid + k.side * 0.5), -hwid, -hwid * 0.5, 0, hwid * 0.5, hwid, hwid + k.side * 0.5, hwid + k.side];
        const nu = us.length, nl = lat.length, pos = new Float32Array(nu * nl * 3), col = new Float32Array(nu * nl * 3), idx = [];
        for (let a = 0; a < nu; a++) for (let b = 0; b < nl; b++) {
          const s = k.sa + us[a], x = k.x + lat[b];
          const border = a === 0 || a === nu - 1 || b === 0 || b === nl - 1;
          const h = run.gridH(s, x) + kickH(k, s, x) + (border ? -0.14 : 0.035);
          run.toWorld(s, x, h, v); const o = (a * nl + b) * 3; pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
          const lip = !k.ride && us[a] >= k.L - 0.5 && us[a] <= k.L + 0.01 && b >= 2 && b <= nl - 3;
          const nf = this.sky.night ? 0.6 : 1;
          col[o] = (lip ? acc.r : 0.955) * nf; col[o + 1] = (lip ? acc.g : 0.97) * nf; col[o + 2] = (lip ? acc.b : 1.0) * nf;
          if (a < nu - 1 && b < nl - 1) { const p = a * nl + b; idx.push(p, p + 1, p + nl + 1, p, p + nl + 1, p + nl); }
        }
        const g = this.own(new T.BufferGeometry());
        g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new T.Mesh(g, mat); m.receiveShadow = true; this.featGroup.add(m);
      }
      /* rails and boxes */
      const steel = this.own(new T.MeshStandardMaterial({ color: 0x8d99a6, roughness: 0.35, metalness: 0.7 }));
      const paint = this.own(new T.MeshStandardMaterial({ color: acc, roughness: 0.6 }));
      const white = this.own(new T.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.7 }));
      const seg = (a, b, w, h, material, drop) => {
        const len = a.distanceTo(b), g = this.own(new T.BoxGeometry(w, h, len)), m = new T.Mesh(g, material);
        m.position.copy(a).add(b).multiplyScalar(0.5); m.position.y -= drop; m.lookAt(b.x, b.y - drop, b.z); m.castShadow = true; this.featGroup.add(m); return m;
      };
      for (const r of run.rails) {
        const n = r.arc ? 10 : 1;
        for (let j = 0; j < n; j++) {
          const sa = r.s0 + ((r.s1 - r.s0) * j) / n, sb = r.s0 + ((r.s1 - r.s0) * (j + 1)) / n;
          run.toWorld(sa, r.x, run.railTop(r, sa), v); run.toWorld(sb, r.x, run.railTop(r, sb), v2);
          if (r.type === 'box') { seg(v, v2, 0.8, 0.4, white, 0.2); seg(v, v2, 0.62, 0.04, paint, -0.005); }
          else seg(v, v2, 0.13, 0.13, r.type === 'rainbow' ? paint : steel, 0.065);
        }
        const posts = Math.max(2, Math.round((r.s1 - r.s0) / 3.5));
        for (let j = 0; j <= posts; j++) {
          const s = r.s0 + ((r.s1 - r.s0) * j) / posts, top = run.railTop(r, s) - 0.1, ground = run.gridH(s, r.x) - 0.2;
          run.toWorld(s, r.x, top, v);
          const g = this.own(new T.BoxGeometry(r.type === 'box' ? 0.5 : 0.09, Math.max(0.1, top - ground), 0.09)), m = new T.Mesh(g, r.type === 'box' ? white : paint);
          m.position.set(v.x, (top + ground) / 2, v.z); m.rotation.y = -run.psiAt(s); this.featGroup.add(m);
        }
      }
      /* slalom gates: a pole pair with a flag panel, race colours */
      if (run.gates.length) {
        const poleG = this.own(new T.CylinderGeometry(0.045, 0.055, 2.0, 6)); poleG.translate(0, 1.0, 0);
        const flagG = this.own(new T.PlaneGeometry(0.62, 0.42)); flagG.translate(0.31, 1.62, 0);
        const mats = { r: this.own(new T.MeshLambertMaterial({ color: 0xe2341d })), b: this.own(new T.MeshLambertMaterial({ color: 0x1b6fd0 })) };
        const flagM = { r: this.own(new T.MeshLambertMaterial({ color: 0xe2341d, side: T.DoubleSide })), b: this.own(new T.MeshLambertMaterial({ color: 0x1b6fd0, side: T.DoubleSide })) };
        const M = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0);
        const list = [];
        for (const g of run.gates) for (const sgn of [-1, 1]) list.push({ g, x: g.x + sgn * g.half, sgn });
        for (const col of ['r', 'b']) {
          const sel = list.filter((o) => (o.g.red ? 'r' : 'b') === col);
          if (!sel.length) continue;
          for (const [geo, mat, flag] of [[poleG, mats[col], false], [flagG, flagM[col], true]]) {
            const m = new T.InstancedMesh(geo, mat, sel.length);
            sel.forEach((o, i) => {
              run.toWorld(o.g.s, o.x, run.gridH(o.g.s, o.x) - 0.15, v);
              q.setFromAxisAngle(up, -run.psiAt(o.g.s) + (flag ? (o.sgn > 0 ? Math.PI : 0) : 0));
              M.compose(v, q, one); m.setMatrixAt(i, M);
            });
            m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = this.q !== 'low';
            this.featGroup.add(m);
          }
        }
      }
      /* boost orbs */
      const og = this.own(new T.OctahedronGeometry(0.42, 0)), om = this.own(new T.MeshBasicMaterial({ color: 0xffc233, fog: false }));
      const gm = this.own(new T.SpriteMaterial({ map: this.own(glowTexture()), color: 0xff9a1f, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
      this.orbMeshes = [];
      for (const o of run.orbs) {
        const m = new T.Mesh(og, om); run.toWorld(o.s, o.x, o.y, m.position); m.userData.o = o; m.userData.y = o.y;
        const sp = new T.Sprite(gm); sp.scale.set(1.7, 1.7, 1); m.add(sp);
        scene.add(m); this.orbMeshes.push(m);
      }
    }

    buildScatter() {
      const run = this.run, scene = this.scene, low = this.q === 'low';
      const M = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3(0, 1, 0);
      const inst = (geo, material, list, fn, shadow) => {
        if (!list.length) return null;
        const m = new T.InstancedMesh(geo, material, list.length);
        list.forEach((it, i) => { fn(it); M.compose(p, q, sc); m.setMatrixAt(i, M); });
        m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = !!shadow && !low; scene.add(m); return m;
      };
      const tGeo = this.own(treeGeo()), tMat = this.own(new T.MeshLambertMaterial({ vertexColors: true }));
      /* trees are grouped into bands along the run so far-away bands can be hidden */
      const band = 160, bands = {};
      run.trees.forEach((t, i) => { if (low && i % 2) return; const b = Math.floor((t.s + S0) / band); (bands[b] = bands[b] || []).push(t); });
      this.treeBands = [];
      Object.keys(bands).forEach((b) => {
        const m = inst(tGeo, tMat, bands[b], (t) => { p.set(t.X, t.Y, t.Z); q.setFromAxisAngle(up, t.rot); sc.set(t.sc * 1.05, t.sc, t.sc * 1.05); }, true);
        m.userData.s0 = b * band - S0; m.userData.s1 = m.userData.s0 + band; this.treeBands.push(m);
      });
      const rGeo = this.own(rockGeo()), rMat = this.own(new T.MeshLambertMaterial({ vertexColors: true }));
      this.rockMesh = inst(rGeo, rMat, run.rocks, (r) => { p.set(r.X, r.Y, r.Z); q.setFromAxisAngle(up, r.rot); sc.set(r.sz * 1.2, r.sz * 0.8, r.sz); }, true);
      /* piste marker poles in the run's difficulty colour, orange-topped on the right-hand edge */
      const dc = G.hex3(G.DIFF[run.def.diff].color), oc = [1, 0.42, 0.1], lean = new T.Vector3(0, 0, 1);
      const poleGeo = (top) => { const a = new T.CylinderGeometry(0.04, 0.04, 1.25, 6); a.translate(0, 0.62, 0); const b = new T.CylinderGeometry(0.045, 0.045, 0.5, 6); b.translate(0, 1.5, 0); return this.own(G.mergeGeos([{ g: a, color: dc }, { g: b, color: top }])); };
      const pMat = this.own(new T.MeshLambertMaterial({ vertexColors: true }));
      for (const sd of [-1, 1]) inst(poleGeo(sd > 0 ? oc : dc), pMat, run.poles.filter((o) => o.side === sd), (o) => { p.set(o.X, o.Y - 0.1, o.Z); q.setFromAxisAngle(lean, sd * 0.12); sc.set(1, 1, 1); }, true);
      if (run.lamps.length) {
        const lg = this.own(new T.CylinderGeometry(0.09, 0.12, 9, 6)); lg.translate(0, 4.5, 0);
        inst(lg, this.own(new T.MeshLambertMaterial({ color: 0x3a4250 })), run.lamps, (o) => { p.set(o.X, o.Y, o.Z); q.identity(); sc.set(1, 1, 1); }, false);
        const gm = this.own(new T.SpriteMaterial({ map: this.own(glowTexture()), color: 0xfff0c4, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
        run.lamps.forEach((o) => { const s = new T.Sprite(gm); s.position.set(o.X, o.Y + 9.2, o.Z); s.scale.set(7, 7, 1); scene.add(s); });
      }
    }

    buildLift() {
      const run = this.run, scene = this.scene, L = run.lift, tw = L.towers;
      if (tw.length < 2) return;
      const M = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), p = new T.Vector3(), up = new T.Vector3(0, 1, 0);
      const tMesh = new T.InstancedMesh(this.own(towerGeo()), this.own(new T.MeshLambertMaterial({ vertexColors: true })), tw.length);
      const tops = [];
      tw.forEach((t, i) => {
        const a = tw[Math.max(0, i - 1)], b = tw[Math.min(tw.length - 1, i + 1)], yaw = Math.atan2(b.X - a.X, b.Z - a.Z);
        t.yaw = yaw; p.set(t.X, t.Y - 0.5, t.Z); q.setFromAxisAngle(up, yaw); M.compose(p, q, one); tMesh.setMatrixAt(i, M);
        tops.push(new T.Vector3(t.X, t.Y + 11.2, t.Z));
      });
      tMesh.frustumCulled = false; tMesh.castShadow = this.q !== 'low'; scene.add(tMesh);
      const lineMat = this.own(new T.LineBasicMaterial({ color: 0x2a3136 }));
      const sides = [];
      for (const off of [-1.7, 1.7]) {
        const pts = tops.map((t, i) => new T.Vector3(t.x + Math.cos(tw[i].yaw) * off, t.y, t.z - Math.sin(tw[i].yaw) * off));
        scene.add(new T.Line(this.own(new T.BufferGeometry().setFromPoints(pts)), lineMat)); sides.push(pts);
      }
      let total = 0; const segLen = [];
      for (let i = 0; i < tops.length - 1; i++) { const d = tops[i].distanceTo(tops[i + 1]); segLen.push(d); total += d; }
      const per = Math.max(2, Math.floor(total / 24));
      const chairs = new T.InstancedMesh(this.own(chairGeo()), this.own(new T.MeshLambertMaterial({ vertexColors: true })), per * 2);
      chairs.frustumCulled = false; chairs.castShadow = this.q !== 'low'; scene.add(chairs);
      this.liftAnim = { chairs, sides, segLen, total, per, tw, M, q, one, p, up };
      this.updateLift(0);
    }
    updateLift(time) {
      const L = this.liftAnim; if (!L) return;
      const { chairs, sides, segLen, total, per, tw } = L;
      for (let side = 0; side < 2; side++) for (let c = 0; c < per; c++) {
        /* side 0 carries riders uphill (towards the start), side 1 returns */
        let d = ((c / per) * total + (side === 0 ? -1 : 1) * time * 3.2) % total; if (d < 0) d += total;
        let i = 0; while (i < segLen.length - 1 && d > segLen[i]) { d -= segLen[i]; i++; }
        const a = sides[side][i], b = sides[side][i + 1], t = d / segLen[i];
        L.p.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - 0.1, a.z + (b.z - a.z) * t);
        L.q.setFromAxisAngle(L.up, tw[i].yaw + (side === 0 ? 0 : Math.PI));
        L.M.compose(L.p, L.q, L.one); chairs.setMatrixAt(side * per + c, L.M);
      }
      chairs.instanceMatrix.needsUpdate = true;
    }

    buildProps() {
      const run = this.run, scene = this.scene, def = run.def, v = new T.Vector3();
      const wood = this.own(new T.MeshLambertMaterial({ color: 0x5a4030 })), dark = this.own(new T.MeshLambertMaterial({ color: 0x2b3238 }));
      const roof = this.own(new T.MeshLambertMaterial({ color: 0xeef3f8 }));
      const post = (s, x, h) => { const g = this.own(new T.CylinderGeometry(0.14, 0.16, h, 6)), m = new T.Mesh(g, wood); run.toWorld(s, x, run.gridH(s, x) + h / 2 - 0.3, m.position); m.castShadow = true; scene.add(m); return m; };
      const banner = (s, half, w, h, y, tex) => {
        const g = this.own(new T.PlaneGeometry(w, h)), m = new T.Mesh(g, this.own(new T.MeshBasicMaterial({ map: this.own(tex), side: T.DoubleSide, fog: true })));
        run.toWorld(s, 0, run.gridH(s, 0) + y, m.position); m.rotation.y = -run.psiAt(s); scene.add(m);
        post(s, -half, y + h / 2 + 0.3); post(s, half, y + h / 2 + 0.3);
      };
      banner(-1.5, 5.4, 10.6, 2.0, 4.2, bannerTexture(def.name, def.lift, def.diff));
      const fh = Math.min(13, Math.max(8, run.hwAt(run.finishS) * 0.5));
      banner(run.finishS, fh, fh * 2 - 0.4, 1.9, 4.6, bannerTexture('Finish', run.resort.name, null));
      /* top shack and base lodge */
      const hut = (s, x, w, d, h, rh) => {
        const y = run.gridH(s, x); run.toWorld(s, x, y, v);
        const b = new T.Mesh(this.own(new T.BoxGeometry(w, h, d)), wood); b.position.set(v.x, y + h / 2 - 0.4, v.z); b.rotation.y = -run.psiAt(s); b.castShadow = true; scene.add(b);
        const r = new T.Mesh(this.own(new T.ConeGeometry(Math.max(w, d) * 0.78, rh, 4)), roof); r.position.set(v.x, y + h + rh / 2 - 0.4, v.z); r.rotation.y = -run.psiAt(s) + Math.PI / 4; r.castShadow = true; scene.add(r);
        const win = new T.Mesh(this.own(new T.BoxGeometry(w * 0.7, h * 0.3, d + 0.1)), this.own(new T.MeshBasicMaterial({ color: this.sky.night || def.sky === 'dusk' ? 0xffd27a : 0x39424a })));
        win.position.set(v.x, y + h * 0.55, v.z); win.rotation.y = b.rotation.y; scene.add(win);
      };
      const side = -run.lift.side;
      hut(-34, side * 13, 5, 6, 3.4, 2.2);
      hut(run.L - 30, side * (run.hwAt(run.L - 30) + 14), 16, 11, 6.5, 5);
      /* orange safety fence across the very end */
      const fg = this.own(new T.PlaneGeometry(run.hwAt(run.L - 8) * 2 + 8, 1.3)), fm = new T.Mesh(fg, this.own(new T.MeshBasicMaterial({ color: 0xff6a1a, side: T.DoubleSide, transparent: true, opacity: 0.85 })));
      run.toWorld(run.L - 8, 0, run.gridH(run.L - 8, 0) + 0.8, fm.position); fm.rotation.y = -run.psiAt(run.L - 8); scene.add(fm);
      void dark;
    }

    buildSnowfall(amount) {
      const n = Math.round((this.q === 'low' ? 500 : 1500) * amount), pos = new Float32Array(n * 3), rnd = G.rng(3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 70; pos[i * 3 + 1] = rnd() * 36 - 8; pos[i * 3 + 2] = (rnd() - 0.5) * 70; }
      const g = this.own(new T.BufferGeometry()); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const m = new T.Points(g, this.own(new T.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false, map: this.own(glowTexture()), fog: false })));
      m.frustumCulled = false; this.scene.add(m); this.flakes = { m, pos, n, off: new T.Vector3() };
    }

    update(dt, camera, riderS, time, riderPos) {
      const far = Math.min(this.sky.fogFar * 1.05, 2300);
      for (const c of this.chunks) c.visible = c.userData.s1 > riderS - 160 && c.userData.s0 < riderS + far;
      for (const b of this.treeBands) b.visible = b.userData.s1 > riderS - 200 && b.userData.s0 < riderS + Math.min(far, 1700);
      this.dome.position.copy(camera.position);
      this.rings.position.set(camera.position.x, camera.position.y * 0.82 - 260, camera.position.z);
      this.updateLift(time);
      for (const m of this.orbMeshes) {
        const o = m.userData.o;
        if (o.taken) { if (m.visible) { m.scale.multiplyScalar(1 + dt * 12); if (m.scale.x > 3) m.visible = false; } }
        else { m.rotation.y = time * 2.2; m.position.y = m.userData.y + Math.sin(time * 3 + o.s) * 0.18; }
      }
      if (riderPos) {
        this.sun.target.position.copy(riderPos);
        this.sun.position.copy(riderPos).addScaledVector(this.sunDir, 240);
      }
      if (this.flakes) {
        const { m, pos, n } = this.flakes, cp = camera.position;
        for (let i = 0; i < n; i++) {
          const o = i * 3;
          pos[o + 1] -= (2.2 + (i % 5) * 0.4) * dt; pos[o] += (1.5 + (i % 3)) * dt;
          const lx = pos[o] - cp.x, ly = pos[o + 1] - cp.y, lz = pos[o + 2] - cp.z;
          if (lx > 35 || lx < -35) pos[o] = cp.x + ((((lx + 35) % 70) + 70) % 70) - 35;
          if (ly < -8 || ly > 28) pos[o + 1] = cp.y + ((((ly + 8) % 36) + 36) % 36) - 8;
          if (lz > 35 || lz < -35) pos[o + 2] = cp.z + ((((lz + 35) % 70) + 70) % 70) - 35;
        }
        m.geometry.attributes.position.needsUpdate = true;
      }
    }
    resetOrbs() { for (const m of this.orbMeshes) { m.userData.o.taken = false; m.visible = true; m.scale.set(1, 1, 1); } }
    dispose() { for (const d of this.disposables) if (d && d.dispose) d.dispose(); this.disposables.length = 0; }
  }
  G.World = World;
  G.drawSym = drawSym;
})();
