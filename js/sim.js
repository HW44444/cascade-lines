/* Cascade Lines — rider physics, tricks, grinds, combo scoring and boost.
   The simulation works in run coordinates: s = distance down the run, x = offset
   to the rider's right of the centreline, y = height. No rendering in here. */
(function () {
  'use strict';
  const G = window.G;
  const g = 9.81, PI = Math.PI, TAU = PI * 2;
  const CHAIN = (G.CHAIN = 6);   // seconds on the snow before a combo banks
  const SPIN = 7.4;   // rad/s while a spin key is held (about 425 deg/s)
  const FLIP = 7.0;   // rad/s while a flip key is held

  const GRABS = (G.GRABS = {
    ski: { 1: 'Mute', 2: 'Safety', 3: 'Tail', 4: 'Japan' },
    board: { 1: 'Indy', 2: 'Melon', 3: 'Tail', 4: 'Nose' },
  });
  const SPINPTS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];
  const FLIPPTS = [0, 600, 1500, 2700, 4200];

  /* Trick naming, scoring and combo banking, shared by both ways of riding. */
  G.Trick = {
    chainMult(sim) { return Math.min(5, 1 + 0.5 * (sim.chain.n - 1)); },
    scoreAir(sim, sketchy) {
      const n180 = Math.floor(Math.abs(sim.spin) / PI + 0.4), nf = Math.round(Math.abs(sim.flip) / TAU), back = sim.flip > 0;
      const grabs = Object.keys(sim.grabT).filter((k) => sim.grabT[k] > 0.18), gn = GRABS[sim.gear];
      let pts = 0, name = '';
      if (nf > 0) pts += FLIPPTS[Math.min(nf, 4)];
      if (n180 > 0) pts += SPINPTS[Math.min(n180, 9)];
      if (nf > 0 && n180 > 0) {
        name = nf > 1 ? (nf === 2 ? 'Double' : 'Triple') + ' Cork ' + (n180 * 180 + nf * 360) : (back ? 'Rodeo ' : 'Misty ') + n180 * 180;
        pts *= 1.3;
      } else if (nf > 0) name = (nf === 2 ? 'Double ' : nf >= 3 ? 'Triple ' : '') + (back ? 'Backflip' : 'Frontflip');
      else if (n180 > 0) name = String(n180 * 180);
      if (grabs.length) {
        let gp = 0; grabs.forEach((k) => { gp += 150 + Math.min(sim.grabT[k], 1.5) * 420; });
        name += (name ? ' ' : '') + grabs.map((k) => gn[k]).join(' + ');
        pts = (pts + gp) * (n180 > 0 || nf > 0 ? 1.15 : 1);
      }
      if (!name) { if (sim.air < 0.9) return; name = sim.air > 1.7 ? 'Big Air' : 'Air'; pts = sim.air * 70; }
      else pts += sim.air * 80;
      if (sim.takeSw) { name = 'Switch ' + name; pts *= 1.15; }
      G.Trick.add(sim, name, pts, sketchy);
    },
    add(sim, name, pts, sketchy) {
      const rep = sim.counts[name] || 0; sim.counts[name] = rep + 1;
      const p = Math.max(10, Math.round((pts * [1, 0.75, 0.5, 0.35][Math.min(rep, 3)] * (sketchy ? 0.5 : 1)) / 10) * 10);
      const ch = sim.chain; ch.pts += p; ch.n++; ch.timer = CHAIN; ch.last = name;
      sim.boost = Math.min(1, sim.boost + Math.min(0.34, p / 2200)); sim.tricks++;
      if (!sim.bestTrick || p > sim.bestTrick.pts) sim.bestTrick = { name, pts: p };
      sim.emit('trick', { name, pts: p, sketchy, n: ch.n, mult: G.Trick.chainMult(sim), total: ch.pts, rep });
    },
    bank(sim) {
      const ch = sim.chain; if (!ch.n) return;
      const mult = G.Trick.chainMult(sim), gain = Math.round(ch.pts * mult);
      sim.score += gain; if (ch.n > sim.bestChain) sim.bestChain = ch.n;
      sim.emit('bank', { gain, n: ch.n, mult });
      sim.chain = { pts: 0, n: 0, timer: 0, last: '' };
    },
  };

  class Sim {
    constructor(run, gear, opts) {
      this.run = run; this.gear = gear || 'ski'; this.ghost = !!(opts && opts.ghost); this.events = [];
      this.reset();
    }
    emit(type, data) { const e = data || {}; e.type = type; this.events.push(e); }
    reset() {
      const r = this.run;
      this.s = -9; this.x = 0; this.y = r.height(-9, 0); this.v = 0; this.th = 0; this.vy = 0;
      this.state = 'ready'; this.bodyYaw = 0; this.spin = 0; this.flip = 0; this.spinV = 0; this.flipV = 0; this.flipDir = 1; this.sw = false;
      this.air = 0; this.t = 0; this.score = 0; this.boost = 0.5; this.boosting = false; this.charge = 0; this.charging = false;
      this.grab = 0; this.grabT = {}; this.rail = null; this.grind = null; this.crashT = 0; this.inv = 0; this.counts = {};
      this.chain = { pts: 0, n: 0, timer: 0, last: '' };
      this.finished = false; this.finishTime = 0; this.maxV = 0; this.airTotal = 0; this.tricks = 0; this.crashes = 0; this.bestChain = 0; this.bestTrick = null;
      this.steer = 0; this.braking = false; this.tuck = false; this.slope = 0; this.gns = 0; this.gnx = 0; this.takeSw = false; this.clear = 0; this.landT = 9; this.landHard = 0;
      this.sink = 0; this.pw = 0; this.penalty = 0; this.gateI = 0; this.gatesHit = 0; this.gatesMissed = 0; this.gateStreak = 0; this.bestStreak = 0;
      this.gates = this.run.gates || [];
      if (!this.ghost) for (const o of r.orbs) o.taken = false;
    }
    go() { if (this.state === 'ready') { this.state = 'ground'; this.v = 7.5; } }
    chainMult() { return G.Trick.chainMult(this); }

    step(dt, inp) {
      if (this.state === 'ready') { this.y = this.run.height(this.s, this.x); return; }
      if (!this.finished) this.t += dt;
      if (this.inv > 0) this.inv -= dt;
      this.landT += dt;
      const st = this.state;
      this.boosting = !!inp.boost && this.boost > 0.01 && st !== 'crash' && !this.finished;
      if (this.boosting) this.boost = Math.max(0, this.boost - 0.27 * dt); else this.boost = Math.min(1, this.boost + 0.012 * dt);
      if (st === 'ground') this.stepGround(dt, inp);
      else if (st === 'air') this.stepAir(dt, inp);
      else if (st === 'grind') this.stepGrind(dt, inp);
      else this.stepCrash(dt);
      if (this.state !== 'crash' && !this.ghost) { this.pickups(); this.collide(); }
      if (!this.finished && this.s >= this.run.finishS) { this.finished = true; this.finishTime = this.t + this.penalty; this.emit('finish'); }
      if (this.finished && this.chain.n && this.state === 'ground') this.bank();
      if (this.v > this.maxV) this.maxV = this.v;
    }

    stepGround(dt, inp) {
      const run = this.run;
      let ix = inp.x, iy = inp.y, jump = inp.jump;
      if (this.finished) { ix = G.clamp(-this.x * 0.04 - this.th * 2.2, -1, 1); iy = this.s > run.finishS + 10 ? 1 : 0; jump = false; }
      const k = run.kapAt(this.s), jac = Math.max(0.35, 1 - k * this.x);
      const braking = iy > 0.3, tuck = iy < -0.3;
      this.braking = braking; this.tuck = tuck;
      this.steer = G.damp(this.steer, ix, 9, dt);
      const sp = G.clamp(this.v / 34, 0, 1);
      this.th += G.lerp(2.35, 0.9, sp) * this.steer * (braking ? 1.25 : 1) * (tuck ? 0.72 : 1) * dt;

      const e = 0.6, s = this.s, x = this.x;
      const gs = (run.height(s + e, x) - run.height(s - e, x)) / (2 * e) / jac;
      const gx = (run.height(s, x + e) - run.height(s, x - e)) / (2 * e);
      const c = Math.cos(this.th), sn = Math.sin(this.th);
      const m = gs * c + gx * sn;
      this.slope = m; this.gns = gs; this.gnx = gx;
      /* skis seek the fall line, more so when slow or on a banked wall */
      const gmag = Math.hypot(gs, gx);
      if (gmag > 0.02) {
        const pull = (gmag * 3.0) / (this.v * 0.15 + 1);
        this.th += G.wrapPi(Math.atan2(-gx, -gs) - this.th) * Math.min(1, pull * dt) * (Math.abs(ix) > 0.2 ? 0.35 : 1);
      }
      let a = (-g * m) / (1 + m * m);
      const off = Math.max(0, Math.abs(x) - run.hwAt(s)), sc = run.secAt(s);
      const pw = (this.pw = run.powAt(s));
      this.sink = G.damp(this.sink, pw * 0.26, 6, dt);
      const mu = 0.034 + pw * 0.017 + Math.min(off, 6) * 0.035;
      let drag = (tuck ? 0.003 : 0.0042) * this.v * this.v;
      if (sc.mog) drag += 0.004 * this.v * this.v;
      if (this.v > 36) drag += 0.03 * (this.v - 36) * (this.v - 36);
      if (braking) a -= 6 + 0.14 * this.v;
      if (this.boosting) { a += 6; drag *= 0.8; }
      a -= mu * g + drag + 0.0019 * Math.abs(this.steer) * this.v * this.v;
      /* poling and skating: a push at low speed so mellow pitches still get moving */
      if (!braking && !this.finished && this.v < 15) a += (tuck ? 3.4 : 2.0) * (1 - this.v / 15);
      this.v += a * dt; if (this.v < 0) this.v = 0;
      if (!braking && !this.finished && this.v < 2.4) this.v = Math.min(2.4, this.v + 3.5 * dt);

      const prevS = this.s, prevX = this.x;
      const ds = (this.v * c * dt) / jac;
      this.s += ds; this.x += this.v * sn * dt; this.th = G.clamp(this.th - k * ds, -1.6, 1.6);
      if (this.s > run.L - 14) { this.s = run.L - 14; this.v = 0; }
      if (this.gates.length) this.checkGates(prevS, prevX);

      if (jump && !this.finished) { this.charging = true; this.charge = Math.min(1, this.charge + dt * 1.7); }
      const hN = run.height(this.s, this.x);
      const cs = Math.cos(this.th), ss = Math.sin(this.th);
      const mB = (hN - run.height(this.s - 2 * cs, this.x - 2 * ss)) / 2;
      const mA = (run.height(this.s + 1.2 * cs, this.x + 1.2 * ss) - hN) / 1.2;
      this.y = hN; this.vy = this.v * m;
      let launched = false;
      if (this.charging && !jump) {
        this.vy = this.v * Math.max(mB, m) + 3.6 + 3.6 * this.charge; launched = true; this.emit('pop', { charge: this.charge });
      } else if (this.v > 5 && (this.v * this.v * (mB - mA)) / 1.6 > g * (sc.mog && this.v < 22 && run.featH(this.s, this.x) < 0.05 ? 9 : 1.6)) {
        this.vy = this.v * mB;
        if (this.charging) { this.vy += (3.6 + 3.6 * this.charge) * 0.75; this.emit('pop', { charge: this.charge }); }
        launched = true;
      }
      if (launched) { this.charging = false; this.charge = 0; this.toAir(); }
      if (this.chain.n > 0) { this.chain.timer -= dt; if (this.chain.timer <= 0) this.bank(); }
      if (this.state !== 'air' || launched) this.railCheck();
    }

    toAir() {
      this.state = 'air'; this.air = 0; this.spin = 0; this.flip = 0; this.spinV = 0; this.flipV = 0;
      this.grab = 0; this.grabT = {}; this.takeSw = this.sw; this.emit('takeoff');
    }

    stepAir(dt, inp) {
      const run = this.run;
      this.air += dt; this.airTotal += dt;
      this.sink = G.damp(this.sink, 0, 9, dt);
      const prevS = this.s, prevX = this.x;
      this.vy -= g * dt; this.y += this.vy * dt;
      this.v -= 0.0009 * this.v * this.v * dt; if (this.boosting && this.v < 38) this.v += 3 * dt;
      const k = run.kapAt(this.s), jac = Math.max(0.35, 1 - k * this.x);
      const ds = (this.v * Math.cos(this.th) * dt) / jac;
      this.s += ds; this.x += this.v * Math.sin(this.th) * dt; this.th -= k * ds;
      if (this.s > run.L - 14) { this.s = run.L - 14; this.v = 0; }

      const ix = this.finished ? 0 : inp.x, iy = this.finished ? 0 : inp.y;
      const sr = SPIN * (this.gear === 'board' ? 1.06 : 1);
      if (Math.abs(ix) > 0.25) this.spinV = G.damp(this.spinV, ix * sr, 16, dt);
      else this.spinV = G.clamp((Math.round(this.bodyYaw / PI) * PI - this.bodyYaw) * 9, -sr, sr);   // settle to the nearest clean landing
      if (Math.abs(iy) > 0.25) { this.flipV = G.damp(this.flipV, iy * FLIP, 16, dt); this.flipDir = iy > 0 ? 1 : -1; }
      else {
        const err = Math.round(this.flip / TAU) * TAU - this.flip;
        if (Math.abs(err) < 0.9) this.flipV = G.clamp(err * 9, -FLIP, FLIP);
        else this.flipV = G.damp(this.flipV, this.flipDir * FLIP * 0.75, 10, dt);                      // carry a released flip round
      }
      const dy = this.spinV * dt;
      this.bodyYaw += dy; this.spin += dy; this.flip += this.flipV * dt;

      const gk = this.finished ? 0 : inp.grab;
      if (gk && this.air > 0.1) { this.grab = gk; this.grabT[gk] = (this.grabT[gk] || 0) + dt; } else this.grab = 0;

      if (this.gates.length) this.checkGates(prevS, prevX);
      const hN = run.height(this.s, this.x);
      this.clear = this.y - hN;
      if (this.railCheck()) return;
      if (this.y <= hN) this.land(hN);
    }

    land(hN) {
      const run = this.run, e = 0.6, c = Math.cos(this.th), sn = Math.sin(this.th);
      const m = (run.height(this.s + e * c, this.x + e * sn) - run.height(this.s - e * c, this.x - e * sn)) / (2 * e);
      const vn = (this.vy - this.v * m) / Math.sqrt(1 + m * m);
      this.y = hN;
      const yawErr = Math.abs(this.bodyYaw - Math.round(this.bodyYaw / PI) * PI);
      const flipErr = Math.abs(G.wrapPi(this.flip));
      const trivial = this.air < 0.28 && Math.abs(this.spin) < 0.5 && Math.abs(this.flip) < 0.5;
      const deep = this.run.powAt(this.s);                      /* knee-deep snow absorbs a bad landing */
      const yawLim = 0.95 + deep * 0.5, flipLim = 1.0 + deep * 0.55, vnLim = -30 - deep * 14;
      if (!this.ghost && !trivial && (yawErr > yawLim || flipErr > flipLim || vn < vnLim)) {
        this.crash(flipErr > flipLim ? 'Over-rotated' : yawErr > yawLim ? 'Landed sideways' : 'Too much air'); return;
      }
      const sketchy = !trivial && (yawErr > 0.5 + deep * 0.35 || flipErr > 0.55 + deep * 0.3 || vn < -22 - deep * 10);
      this.sw = Math.abs(Math.round(this.bodyYaw / PI)) % 2 === 1;
      this.bodyYaw = this.sw ? PI : 0;
      if (!trivial) {
        this.scoreAir(sketchy);
        this.emit('land', { vn, sketchy, air: this.air });
        this.landT = 0; this.landHard = Math.min(1, Math.abs(vn) / 18);
        this.v *= sketchy ? 0.78 : 1 - Math.min(0.08, Math.abs(vn) * 0.004);
      }
      this.flip = 0; this.spin = 0; this.spinV = 0; this.flipV = 0; this.grab = 0;
      this.state = 'ground'; this.vy = this.v * m; this.charging = false; this.charge = 0;
    }

    scoreAir(sketchy) { G.Trick.scoreAir(this, sketchy); }
    addTrick(name, pts, sketchy) { G.Trick.add(this, name, pts, sketchy); }
    bank() { G.Trick.bank(this); }
    railCheck() {
      if (this.finished) return false;
      const run = this.run, list = run.rb[Math.floor((this.s + G.S0) / 40)];
      if (!list) return false;
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (this.s < r.s0 - 0.7 || this.s > r.s1 - 1.5) continue;
        if (Math.abs(this.x - r.x) > r.tol) continue;
        const top = run.railTop(r, this.s), dy = this.y - top;
        if (dy > 1.0 || dy < -0.5) continue;
        if (this.vy - this.v * run.railSlope(r, this.s) > 1.6) continue;
        if (this.state === 'air' && Math.abs(G.wrapPi(this.flip)) > 0.9) { this.crash('Landed on the rail upside down'); return true; }
        const onDeg = this.state === 'air' ? Math.round(Math.abs(this.spin) / (PI / 2)) * 90 : 0;
        this.grind = { r, t: 0, pts: 0, onDeg, slideT: 0, pressT: 0, alignedT: 0, press: 0, lastPress: 1 };
        this.rail = r; this.state = 'grind'; this.y = top; this.flip = 0; this.flipV = 0; this.spinV = 0; this.grab = 0; this.charging = false; this.charge = 0;
        this.emit('grindStart'); return true;
      }
      return false;
    }

    stepGrind(dt, inp) {
      const run = this.run, gr = this.grind, r = gr.r; gr.t += dt;
      const m = run.railSlope(r, this.s);
      let a = (-g * m) / (1 + m * m) - 0.05 * g; if (this.boosting && this.v < 36) a += 5;
      this.v = Math.max(4, this.v + a * dt);
      const k = run.kapAt(this.s), jac = Math.max(0.35, 1 - k * this.x);
      this.s += (this.v * dt) / jac; this.x = G.damp(this.x, r.x, 22, dt); this.th = G.damp(this.th, 0, 14, dt);
      this.y = run.railTop(r, this.s); this.vy = this.v * m;
      const sr = 5.6;
      if (Math.abs(inp.x) > 0.25) this.bodyYaw += inp.x * sr * dt;
      else { const tgt = Math.round(this.bodyYaw / (PI / 2)) * (PI / 2); this.bodyYaw += G.clamp((tgt - this.bodyYaw) * 10, -sr, sr) * dt; }
      const side = Math.abs(this.bodyYaw - Math.round(this.bodyYaw / PI) * PI) > PI / 4;
      gr.press = !side && Math.abs(inp.y) > 0.3 ? (inp.y < 0 ? -1 : 1) : 0;
      gr.side = side;
      /* jibbing pays: a grind held, turned and pressed is worth standing up for */
      const hold = 1 + Math.min(gr.t, 3.5) * 0.15;
      gr.pts += 520 * (side ? 1.5 : gr.press ? 1.85 : 1) * hold * dt;
      if (side) gr.slideT += dt; else if (gr.press) { gr.pressT += dt; gr.lastPress = gr.press; } else gr.alignedT += dt;
      if (inp.jump) { this.charging = true; this.charge = Math.min(1, this.charge + dt * 2.2); }
      const release = this.charging && !inp.jump;
      if (this.s >= r.s1 || release) this.endGrind(release);
    }
    endGrind(pop) {
      const gr = this.grind, r = gr.r, run = this.run, m = run.railSlope(r, Math.min(this.s, r.s1));
      const board = this.gear === 'board';
      let type;
      if (gr.slideT >= gr.alignedT && gr.slideT >= gr.pressT) type = board ? 'Boardslide' : 'Rail Slide';
      else if (gr.pressT > gr.alignedT) type = gr.lastPress < 0 ? 'Nose Press' : 'Tail Press';
      else type = '50-50';
      let name = (gr.onDeg >= 180 ? gr.onDeg + ' On ' : '') + type, pts = gr.pts + 170 + (gr.onDeg >= 180 ? gr.onDeg * 2.6 : 0);
      if (r.type === 'rainbow') { name = 'Rainbow ' + name; pts *= 1.32; }
      else if (r.type === 'rail') pts *= 1.12;
      if (gr.t > 0.12) this.addTrick(name, pts, false);
      this.state = 'air'; this.air = 0; this.spin = 0; this.flip = 0; this.spinV = 0; this.flipV = 0; this.grabT = {}; this.grab = 0; this.takeSw = false;
      this.vy = this.v * m + (pop ? 3.0 + 2.6 * this.charge : 0.5);
      this.charging = false; this.charge = 0; this.rail = null; this.grind = null;
      this.emit('grindEnd', { pop });
    }

    crash(why, hold) {
      if (this.ghost || this.state === 'crash') return;
      if (this.chain.n) this.emit('lost', { pts: this.chain.pts });
      this.chain = { pts: 0, n: 0, timer: 0, last: '' };
      this.state = 'crash'; this.crashT = hold || 1.5; this.crashes++; this.ko = !!hold; this.boost = Math.max(0, this.boost - 0.08); this.v *= 0.6;
      this.rail = null; this.grind = null; this.charging = false; this.charge = 0; this.grab = 0;
      this.emit('crash', { why, ko: !!hold });
    }
    stepCrash(dt) {
      const run = this.run; this.crashT -= dt;
      const hN = run.height(this.s, this.x);
      if (this.y > hN + 0.05) { this.vy -= g * dt; this.y += this.vy * dt; if (this.y < hN) this.y = hN; }
      else { this.y = hN; this.v = Math.max(0, this.v - 13 * dt); }
      const k = run.kapAt(this.s), jac = Math.max(0.35, 1 - k * this.x);
      const ds = (this.v * Math.cos(this.th) * dt) / jac;
      this.s += ds; this.x += this.v * Math.sin(this.th) * dt; this.th -= k * ds;
      const lim = run.hwAt(this.s) + 7;
      if (Math.abs(this.x) > lim) { this.x = Math.sign(this.x) * lim; this.v *= 0.5; }
      if (this.s > run.L - 14) this.s = run.L - 14;
      if (this.crashT <= 0) this.respawn();
    }
    respawn() {
      const run = this.run, hwS = run.hwAt(this.s);
      let x = G.clamp(this.x, -hwS * 0.55, hwS * 0.55);
      if (run.secAt(this.s).trees === 'glade') x = run.lineX(this.s);
      this.x = x; this.th = 0; this.v = 7; this.y = run.height(this.s, x); this.vy = 0;
      this.state = 'ground'; this.bodyYaw = 0; this.sw = false; this.flip = 0; this.spin = 0; this.inv = 1.8;
      this.emit('respawn');
    }

    checkGates(prevS, prevX) {
      while (this.gateI < this.gates.length && this.gates[this.gateI].s <= this.s) {
        const g = this.gates[this.gateI++];
        const t = G.clamp((g.s - prevS) / Math.max(1e-6, this.s - prevS), 0, 1);
        const xAt = prevX + (this.x - prevX) * t;
        const inside = Math.abs(xAt - g.x) <= g.half + 0.9 && this.state !== 'crash';
        if (inside) {
          this.gatesHit++; this.gateStreak++;
          if (this.gateStreak > this.bestStreak) this.bestStreak = this.gateStreak;
          this.score += 60 + Math.min(140, this.gateStreak * 10);
          this.boost = Math.min(1, this.boost + 0.035);
          this.emit('gate', { ok: true, n: this.gatesHit, streak: this.gateStreak, total: this.gates.length });
        } else {
          this.gatesMissed++; this.gateStreak = 0; this.penalty += 1.0;
          this.emit('gate', { ok: false, n: this.gatesHit, total: this.gates.length });
        }
      }
    }

    collide() {
      if (this.inv > 0) return;
      const run = this.run, b = Math.floor((this.s + G.S0) / 12);
      for (let q = b - 1; q <= b + 1; q++) {
        const list = run.cb[q]; if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i], ds = this.s - c.s, dx = this.x - c.x, rr = c.r + 0.3;
          if (ds * ds + dx * dx < rr * rr && this.y < c.top) {
            if (c.kill) this.crash('Knocked out', 2.9); else this.crash('Hit a ' + c.kind);
            return;
          }
        }
      }
      if (Math.abs(this.x) > run.hwAt(this.s) + 8.5) this.crash('Out of bounds');
    }
    pickups() {
      const run = this.run, b = Math.floor((this.s + G.S0) / 40);
      for (let q = b - 1; q <= b + 1; q++) {
        const list = run.ob[q]; if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const o = list[i]; if (o.taken) continue;
          if (Math.abs(this.s - o.s) < 2.6 && Math.abs(this.x - o.x) < 2.6 && Math.abs(this.y + 0.9 - o.y) < (o.air ? 3.4 : 2.4)) {
            o.taken = true; this.boost = Math.min(1, this.boost + 0.15); this.score += 50; this.emit('orb');
          }
        }
      }
    }
  }
  G.Sim = Sim;

  /* Simple autopilot: 'par' sets the time goal, 'attract' rides behind the title screen. */
  G.autoInput = function (sim, mode, out) {
    const run = sim.run;
    out.x = 0; out.y = 0; out.jump = false; out.boost = false; out.grab = 0;
    if (sim.state === 'ground') {
      let tx = run.secAt(sim.s).trees === 'glade' ? run.lineX(sim.s + 18) : 0;
      if (run.gates.length) {                       /* a racer rides the gates, not the fall line */
        for (let i = 0; i < run.gates.length; i++) if (run.gates[i].s > sim.s + 4) { tx = run.gates[i].x; break; }
      }
      if (mode === 'attract') {
        for (const k of run.kickers) if (!k.ride && k.s0 > sim.s + 4 && k.s0 < sim.s + 80) { tx = k.x; break; }
        if (sim.v > 21) out.y = 0.5;
      }
      out.x = G.clamp((tx - sim.x) * 0.09 - sim.th * 2.0, -1, 1);
      if (mode === 'par' && Math.abs(out.x) < 0.35) out.y = -1;
    } else if (sim.state === 'air' && mode === 'attract') {
      if (sim.clear > 1.8 || sim.vy > 1) { out.x = Math.floor(sim.s / 170) % 2 ? 1 : -1; if (sim.air > 0.3) out.grab = 1 + (Math.floor(sim.s / 90) % 4); }
    }
    return out;
  };
  G.parTime = function (run) {
    const sim = new Sim(run, 'ski', { ghost: true }), inp = {}, dt = 1 / 90;
    sim.go();
    for (let n = 0; n < 90 * 600 && !sim.finished; n++) { G.autoInput(sim, 'par', inp); sim.step(dt, inp); sim.events.length = 0; }
    return sim.finished ? sim.finishTime : 600;
  };
})();
