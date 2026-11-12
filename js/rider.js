/* Cascade Lines — skier / snowboarder model with a small IK rig and trick poses */
(function () {
  'use strict';
  const G = window.G, T = window.THREE;
  const Yax = new T.Vector3(0, 1, 0);
  const PI = Math.PI;

  G.LOOKS = [
    { name: 'Patrol', jacket: '#e2341d', pants: '#16222c', helmet: '#f4f4f1', gear: '#ffc233' },
    { name: 'Glacier', jacket: '#1aa3d8', pants: '#0f2a3d', helmet: '#0f2a3d', gear: '#ff5b1f' },
    { name: 'Huckleberry', jacket: '#7442cf', pants: '#23262c', helmet: '#f0c02e', gear: '#22d3a5' },
    { name: 'Spruce', jacket: '#1f7a55', pants: '#3b2d21', helmet: '#e9e1d0', gear: '#e9e1d0' },
    { name: 'Alpenglow', jacket: '#ff7a9c', pants: '#2c304c', helmet: '#ffffff', gear: '#2c304c' },
  ];

  /* Pose targets. Hands are [x, y, z]; "face" hands are relative to the pelvis in the
     direction the chest faces, "body" hands are fixed points on the skis or board. */
  const P = (o) => Object.assign({ hipY: 0.74, hipZ: 0, tPitch: -0.36, tYaw: 0, tRoll: 0, head: 0, L: [-0.34, 0.62, -0.3], R: [0.34, 0.62, -0.3], body: false, gA: 0, gB: 0, gC: 0 }, o);
  const POSES = {
    ski: {
      ride: P({}),
      tuck: P({ hipY: 0.5, tPitch: -1.02, L: [-0.1, 0.5, -0.42], R: [0.1, 0.5, -0.42] }),
      charge: P({ hipY: 0.45, tPitch: -0.72, L: [-0.3, 0.4, -0.2], R: [0.3, 0.4, -0.2] }),
      brake: P({ hipY: 0.6, tPitch: -0.2, L: [-0.46, 0.62, -0.1], R: [0.46, 0.66, -0.14] }),
      air: P({ hipY: 0.6, tPitch: -0.3, L: [-0.52, 0.86, -0.1], R: [0.52, 0.86, -0.1] }),
      spin: P({ hipY: 0.5, tPitch: -0.5, L: [-0.2, 0.58, -0.26], R: [0.2, 0.58, -0.26] }),
      grind: P({ hipY: 0.6, tPitch: -0.3, L: [-0.55, 0.72, 0], R: [0.55, 0.72, 0] }),
      cheer: P({ hipY: 0.8, tPitch: -0.05, L: [-0.3, 1.3, -0.05], R: [0.3, 1.3, -0.05] }),
      crash: P({ hipY: 0.42, tPitch: -0.9, L: [-0.55, 0.3, 0.2], R: [0.5, 0.75, -0.2] }),
      g1: P({ hipY: 0.42, tPitch: -0.9, tYaw: 0.45, L: [-0.52, 0.82, 0.1], R: [-0.24, 0.17, -0.32], body: true, gA: 0.3 }),
      g2: P({ hipY: 0.42, tPitch: -0.8, L: [-0.5, 0.86, -0.05], R: [0.27, 0.15, 0.0], body: true }),
      g3: P({ hipY: 0.46, tPitch: -0.15, tYaw: -0.7, L: [-0.45, 0.9, -0.2], R: [0.2, 0.24, 0.6], body: true, gB: 0.36 }),
      g4: P({ hipY: 0.42, tPitch: -0.5, tYaw: -0.55, L: [0.1, 0.18, 0.14], R: [0.52, 0.86, 0], body: true, gB: 0.2, gC: 0.5 }),
    },
    board: {
      ride: P({ hipY: 0.7, tPitch: -0.24, tYaw: 0.45, head: 0.8, L: [-0.46, 0.62, -0.06], R: [0.44, 0.6, -0.02] }),
      tuck: P({ hipY: 0.5, tPitch: -0.5, tYaw: 0.5, head: 0.8, L: [-0.3, 0.42, -0.2], R: [0.24, 0.42, -0.18] }),
      charge: P({ hipY: 0.44, tPitch: -0.5, tYaw: 0.4, head: 0.8, L: [-0.4, 0.4, -0.1], R: [0.4, 0.4, -0.1] }),
      brake: P({ hipY: 0.58, tPitch: 0.0, tYaw: 0.2, head: 0.7, L: [-0.5, 0.66, -0.1], R: [0.5, 0.64, -0.1] }),
      air: P({ hipY: 0.56, tPitch: -0.2, tYaw: 0.3, head: 0.7, L: [-0.54, 0.84, 0], R: [0.54, 0.8, 0] }),
      spin: P({ hipY: 0.48, tPitch: -0.36, tYaw: 0.2, head: 0.6, L: [-0.24, 0.56, -0.2], R: [0.24, 0.56, -0.2] }),
      grind: P({ hipY: 0.58, tPitch: -0.2, tYaw: 0.2, head: 0.7, L: [-0.56, 0.74, 0], R: [0.56, 0.74, 0] }),
      cheer: P({ hipY: 0.78, tPitch: 0, tYaw: 0.7, head: 0.5, L: [-0.3, 1.28, -0.05], R: [0.3, 1.28, -0.05] }),
      crash: P({ hipY: 0.42, tPitch: -0.8, L: [-0.55, 0.3, 0.2], R: [0.5, 0.75, -0.2] }),
      g1: P({ hipY: 0.4, tPitch: -0.6, tYaw: 0.1, head: 0.7, L: [-0.2, 0.85, -0.45], R: [0.2, 0.12, 0.09], body: true, gA: 0.26 }),
      g2: P({ hipY: 0.42, tPitch: 0.05, tYaw: 0.3, head: 0.8, L: [-0.21, 0.12, -0.09], R: [0.25, 0.9, 0.4], body: true, gA: -0.36 }),
      g3: P({ hipY: 0.42, tPitch: -0.3, tYaw: -0.3, head: 0.9, L: [0.0, 0.85, -0.5], R: [0.02, 0.2, 0.68], body: true, gB: 0.32 }),
      g4: P({ hipY: 0.42, tPitch: -0.5, tYaw: 0.6, head: 0.6, L: [0.02, 0.2, -0.68], R: [0.1, 0.85, 0.5], body: true, gB: -0.32 }),
    },
  };
  const NUMKEYS = ['hipY', 'hipZ', 'tPitch', 'tYaw', 'tRoll', 'head', 'gA', 'gB', 'gC'];

  function ik(a, c, l1, l2, hint, out) {
    const d0 = a.distanceTo(c), d = G.clamp(d0, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.005);
    const ax = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - ax * ax));
    const dir = _v1.copy(c).sub(a); if (d0 > 1e-5) dir.multiplyScalar(1 / d0); else dir.set(0, -1, 0);
    const bend = _v2.copy(hint).addScaledVector(dir, -hint.dot(dir));
    if (bend.lengthSq() < 1e-6) bend.set(0, 0, -1); bend.normalize();
    out.copy(a).addScaledVector(dir, ax).addScaledVector(bend, h);
    return d0 > l1 + l2 ? _v3.copy(a).addScaledVector(dir, l1 + l2) : c;
  }
  const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _v4 = new T.Vector3(), _v5 = new T.Vector3();
  function place(mesh, a, b) {
    const len = a.distanceTo(b);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(1, Math.max(0.01, len), 1);
    mesh.quaternion.setFromUnitVectors(Yax, _v4.copy(b).sub(a).normalize());
  }

  class Rider {
    constructor(gear, look) {
      this.gear = gear; this.look = look || G.LOOKS[0];
      this.root = new T.Group(); this.tilt = new T.Group(); this.spinG = new T.Group(); this.body = new T.Group();
      this.root.add(this.tilt); this.tilt.add(this.spinG); this.spinG.add(this.body);
      this.spinG.position.y = 0.85; this.body.position.y = -0.85;
      this.spinG.rotation.order = 'YXZ';
      this.n = new T.Vector3(0, 1, 0); this.lean = 0; this.leanV = 0; this.brakeYaw = 0; this.pitchBack = 0;
      this.hipLat = 0; this.counter = 0; this.headLook = 0; this.plant = 0; this.plantSide = 1; this.lastSteer = 0; this.bob = 0;
      this.crashRot = new T.Vector3(); this.crashVel = new T.Vector3();
      this.pose = {}; NUMKEYS.forEach((k) => (this.pose[k] = POSES[gear].ride[k]));
      this.handL = new T.Vector3(-0.34, 0.62, -0.3); this.handR = new T.Vector3(0.34, 0.62, -0.3);
      this.mats = [];
      this.build();
    }
    mat(color) { const m = new T.MeshLambertMaterial({ color }); this.mats.push(m); return m; }
    build() {
      const L = this.look, b = this.body, gear = this.gear;
      const jacket = this.mat(L.jacket), pants = this.mat(L.pants), helmet = this.mat(L.helmet), gearM = this.mat(L.gear), dark = this.mat('#15191d'), skin = this.mat('#e8b796');
      const add = (parent, geo, m) => { const o = new T.Mesh(geo, m); o.castShadow = true; parent.add(o); return o; };
      const cyl = (r1, r2) => new T.CylinderGeometry(r1, r2, 1, 8);
      /* gear */
      this.gearG = new T.Group(); b.add(this.gearG);
      if (gear === 'ski') {
        this.skis = [];
        for (const sx of [-1, 1]) {
          const sg = new T.Group(); sg.position.set(sx * 0.14, 0.02, 0); this.gearG.add(sg);
          add(sg, new T.BoxGeometry(0.095, 0.022, 1.62), gearM);
          const tip = add(sg, new T.BoxGeometry(0.09, 0.02, 0.2), gearM); tip.position.set(0, 0.035, -0.89); tip.rotation.x = 0.42;
          const tail = add(sg, new T.BoxGeometry(0.09, 0.02, 0.12), gearM); tail.position.set(0, 0.02, 0.85); tail.rotation.x = -0.3;
          add(sg, new T.BoxGeometry(0.1, 0.05, 0.3), dark).position.set(0, 0.035, 0.02);
          this.skis.push(sg);
        }
        this.poles = [];
        for (let i = 0; i < 2; i++) { const p = add(b, new T.CylinderGeometry(0.012, 0.012, 1, 5), dark); this.poles.push(p); }
      } else {
        this.board = new T.Group(); this.board.position.y = 0.02; this.gearG.add(this.board);
        add(this.board, new T.BoxGeometry(0.28, 0.026, 1.22), gearM);
        for (const sz of [-1, 1]) {
          const e = add(this.board, new T.CylinderGeometry(0.14, 0.14, 0.026, 12, 1, false, 0, PI), gearM);
          e.position.set(0, 0.012, sz * 0.61); e.rotation.y = sz < 0 ? PI / 2 : -PI / 2; e.rotation.x = sz * 0.0;
          add(this.board, new T.BoxGeometry(0.26, 0.05, 0.12), dark).position.set(0, 0.04, sz * 0.26);
        }
        add(this.board, new T.BoxGeometry(0.06, 0.03, 0.9), this.mat(L.jacket)).position.set(0, 0.003, 0);
      }
      this.boots = [add(b, new T.BoxGeometry(0.12, 0.15, 0.28), dark), add(b, new T.BoxGeometry(0.12, 0.15, 0.28), dark)];
      /* legs + arms */
      this.thigh = [add(b, cyl(0.085, 0.07), pants), add(b, cyl(0.085, 0.07), pants)];
      this.shin = [add(b, cyl(0.07, 0.06), pants), add(b, cyl(0.07, 0.06), pants)];
      this.uarm = [add(b, cyl(0.065, 0.055), jacket), add(b, cyl(0.065, 0.055), jacket)];
      this.farm = [add(b, cyl(0.055, 0.045), jacket), add(b, cyl(0.055, 0.045), jacket)];
      this.hand = [add(b, new T.SphereGeometry(0.062, 8, 6), dark), add(b, new T.SphereGeometry(0.062, 8, 6), dark)];
      /* pelvis + torso + head */
      this.pelvis = new T.Group(); b.add(this.pelvis);
      add(this.pelvis, new T.BoxGeometry(0.32, 0.2, 0.22), pants).position.y = 0.02;
      this.torso = new T.Group(); this.torso.position.y = 0.08; this.pelvis.add(this.torso);
      const chest = add(this.torso, new T.CylinderGeometry(0.185, 0.155, 0.5, 10), jacket); chest.position.y = 0.26; chest.scale.set(1.12, 1, 0.74);
      const sh = add(this.torso, new T.SphereGeometry(0.19, 10, 6), jacket); sh.position.y = 0.46; sh.scale.set(1.2, 0.5, 0.78);
      add(this.torso, new T.BoxGeometry(0.27, 0.36, 0.15), gearM).position.set(0, 0.3, 0.17);
      this.headG = new T.Group(); this.headG.position.y = 0.69; this.headG.scale.set(1.3, 1.3, 1.3); this.torso.add(this.headG);
      add(this.headG, new T.SphereGeometry(0.108, 10, 8), skin);
      const hel = add(this.headG, new T.SphereGeometry(0.128, 12, 8, 0, PI * 2, 0, PI * 0.62), helmet); hel.position.y = 0.012;
      const gog = add(this.headG, new T.BoxGeometry(0.2, 0.075, 0.08), this.mat('#ff8a2b')); gog.position.set(0, 0.012, -0.085);
      add(this.headG, new T.BoxGeometry(0.235, 0.05, 0.2), dark).position.set(0, 0.012, 0.0);
    }
    dispose() { this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.mats.forEach((m) => m.dispose()); }

    /* drive the model from the simulation */
    update(dt, sim, time) {
      const run = sim.run, gear = this.gear, st = sim.state, board = gear === 'board';
      run.toWorld(sim.s, sim.x, sim.y, this.root.position);
      this.root.position.y -= (sim.sink || 0) * 0.78;      /* knee deep in the soft stuff */
      const psi = run.psiAt(sim.s), heading = psi + sim.th;
      /* surface normal the rider stands on */
      const tx = Math.sin(psi), tz = -Math.cos(psi), rx = Math.cos(psi), rz = Math.sin(psi);
      const tn = _v5;
      if (st === 'air') tn.set(-sim.gns * tx * 0.3, 1, -sim.gns * tz * 0.3);
      else if (st === 'grind') { const m = run.railSlope(sim.rail, sim.s); tn.set(-m * tx, 1, -m * tz); }
      else tn.set(-sim.gns * tx - sim.gnx * rx, 1, -sim.gns * tz - sim.gnx * rz);
      tn.normalize();
      const nk = st === 'air' ? 2.5 : 14;
      this.n.x = G.damp(this.n.x, tn.x, nk, dt); this.n.y = G.damp(this.n.y, tn.y, nk, dt); this.n.z = G.damp(this.n.z, tn.z, nk, dt); this.n.normalize();
      _qa.setFromUnitVectors(Yax, this.n); _qb.setFromAxisAngle(Yax, -heading);
      this.root.quaternion.copy(_qa).multiply(_qb);

      const spd = G.clamp(sim.v / 22, 0, 1);
      const ground = st === 'ground';
      const braking = ground && sim.braking && sim.v > 2.5;
      /* a light spring, so edge changes roll through the body instead of snapping */
      const leanT = ground ? -sim.steer * (0.2 + 0.42 * spd) : 0;
      this.leanV += ((leanT - this.lean) * 150 - this.leanV * 23) * dt;
      this.lean += this.leanV * dt;
      this.hipLat = G.damp(this.hipLat, ground ? -sim.steer * 0.1 * (0.4 + spd) : 0, 7, dt);
      this.counter = G.damp(this.counter, ground ? sim.steer * (0.3 + 0.3 * spd) : 0, 6, dt);
      this.headLook = G.damp(this.headLook, ground ? -sim.steer * 0.55 : 0, 5, dt);
      /* plant the inside pole as the edge changes */
      const sgn = sim.steer > 0.22 ? 1 : sim.steer < -0.22 ? -1 : 0;
      if (gear === 'ski' && ground && sgn !== 0 && sgn !== this.lastSteer && sim.v > 5) { this.plant = 1; this.plantSide = sgn; }
      if (sgn !== 0) this.lastSteer = sgn;
      this.plant = Math.max(0, this.plant - dt * 3.1);
      this.bob += dt * (3.2 + spd * 7);
      const bDir = sim.steer < -0.1 ? -1 : 1;
      this.brakeYaw = G.damp(this.brakeYaw, braking ? bDir * (board ? 1.25 : 1.05) : 0, 9, dt);
      this.pitchBack = G.damp(this.pitchBack, braking ? 0.22 : 0, 8, dt);
      this.tilt.rotation.set(0, 0, this.lean);
      this.tilt.position.x = this.hipLat;

      if (st === 'crash') {
        this.crashRot.addScaledVector(this.crashVel, dt); this.crashVel.multiplyScalar(1 - 1.2 * dt);
        this.spinG.rotation.set(this.crashRot.x, this.crashRot.y, this.crashRot.z);
      } else {
        this.crashRot.set(0, 0, 0);
        const press = st === 'grind' && sim.grind ? sim.grind.press * 0.28 : 0;
        this.spinG.rotation.set(sim.flip + press, -(sim.bodyYaw + this.brakeYaw), this.pitchBack * (this.brakeYaw >= 0 ? 1 : -1));
      }
      this.root.visible = sim.inv > 0 ? Math.floor(time * 14) % 2 === 0 : true;

      /* choose a pose */
      const set = POSES[gear];
      let key = 'ride';
      if (st === 'crash') key = 'crash';
      else if (sim.finished && sim.v < 1.5 && st === 'ground') key = 'cheer';
      else if (st === 'air') key = sim.grab ? 'g' + sim.grab : Math.abs(sim.spinV) > 2.5 || Math.abs(sim.flipV) > 2.5 ? 'spin' : sim.air > 0.12 ? 'air' : 'ride';
      else if (st === 'grind') key = 'grind';
      else if (sim.charging) key = 'charge';
      else if (braking) key = 'brake';
      else if (sim.tuck && sim.v > 4) key = 'tuck';
      const tgt = set[key], pose = this.pose, k = key.charAt(0) === 'g' && key !== 'grind' ? 16 : (key === 'crash' ? 7 : 9);
      for (const n of NUMKEYS) pose[n] = G.damp(pose[n], tgt[n], k, dt);
      let hipY = pose.hipY;
      if (ground && sim.landT < 0.35) hipY -= 0.26 * sim.landHard * (1 - sim.landT / 0.35);
      if (ground && sim.charging) hipY -= 0.06 * sim.charge;
      if (ground) hipY += Math.sin(this.bob) * 0.012 * (0.3 + spd) - Math.abs(this.lean) * 0.07;
      hipY = Math.max(0.36, hipY);

      /* pelvis, torso, head */
      const pelYaw = board ? -PI / 2 : 0;
      this.pelvis.position.set(0, hipY, pose.hipZ);
      this.pelvis.rotation.set(0, pelYaw, 0);
      this.torso.rotation.set(pose.tPitch, pose.tYaw + (ground ? this.counter : 0), pose.tRoll - this.lean * 0.5, 'YXZ');
      this.headG.rotation.set(-pose.tPitch * 0.6, pose.head + (ground ? this.headLook : 0), -this.lean * 0.25, 'YXZ');
      this.pelvis.updateMatrix(); this.torso.updateMatrix();

      /* gear tweaks while grabbing */
      let footL, footR;
      if (board) {
        this.board.rotation.set(pose.gB, 0, pose.gA + this.lean * 0.5);
        this.board.updateMatrix();
        footL = _f1.set(0, 0.1, -0.26).applyMatrix4(this.board.matrix); footR = _f2.set(0, 0.1, 0.26).applyMatrix4(this.board.matrix);
        this.boots[0].position.copy(footL); this.boots[1].position.copy(footR);
        this.boots[0].quaternion.copy(this.board.quaternion); this.boots[1].quaternion.copy(this.board.quaternion);
        this.boots[0].rotateY(PI / 2 - 0.25); this.boots[1].rotateY(PI / 2 + 0.1);
      } else {
        const edge = this.lean * 0.8;
        this.skis[0].rotation.set(pose.gB, -pose.gA, edge, 'YXZ'); this.skis[1].rotation.set(pose.gB + pose.gC, pose.gA, edge, 'YXZ');
        this.skis[1].position.y = 0.02 + pose.gC * 0.2;
        footL = _f1.set(-0.14, 0.12, 0.02); footR = _f2.set(0.14, 0.12 + pose.gC * 0.2, 0.02);
        this.boots[0].position.copy(footL); this.boots[1].position.copy(footR);
        this.boots[0].quaternion.copy(this.skis[0].quaternion); this.boots[1].quaternion.copy(this.skis[1].quaternion);
      }
      /* legs */
      const hint = _h1.set(0, 0.25, -1).applyAxisAngle(Yax, pelYaw);
      for (let i = 0; i < 2; i++) {
        const hip = _a.set(i ? 0.1 : -0.1, -0.02, 0).applyMatrix4(this.pelvis.matrix);
        const foot = i ? footR : footL;
        _c.copy(foot); _c.y += 0.06;
        const end = ik(hip, _c, 0.43, 0.43, hint, _k);
        place(this.thigh[i], hip, _k); place(this.shin[i], _k, end);
      }
      /* arms */
      const hl = this.handTarget(tgt.L, tgt.body, pelYaw, hipY, _t1), hr = this.handTarget(tgt.R, tgt.body, pelYaw, hipY, _t2);
      if (gear === 'ski' && this.plant > 0 && ground) {
        const h = this.plantSide > 0 ? hr : hl;
        h.z -= this.plant * 0.34; h.y -= this.plant * 0.1; h.x += this.plantSide * this.plant * 0.08;
      }
      const hk = key === 'crash' ? 5 : 12;
      this.handL.x = G.damp(this.handL.x, hl.x, hk, dt); this.handL.y = G.damp(this.handL.y, hl.y, hk, dt); this.handL.z = G.damp(this.handL.z, hl.z, hk, dt);
      this.handR.x = G.damp(this.handR.x, hr.x, hk, dt); this.handR.y = G.damp(this.handR.y, hr.y, hk, dt); this.handR.z = G.damp(this.handR.z, hr.z, hk, dt);
      const eh = _h1.set(0, -1, 0.5).applyAxisAngle(Yax, pelYaw + pose.tYaw);
      for (let i = 0; i < 2; i++) {
        const sh = _a.set(i ? 0.21 : -0.21, 0.45, 0).applyMatrix4(this.torso.matrix).applyMatrix4(this.pelvis.matrix);
        const end = ik(sh, i ? this.handR : this.handL, 0.3, 0.29, eh, _k);
        place(this.uarm[i], sh, _k); place(this.farm[i], _k, end); this.hand[i].position.copy(end);
        if (this.poles) {
          const p = this.poles[i], showPole = key !== 'crash';
          p.visible = showPole;
          let back = key === 'tuck' ? 0.95 : key === 'air' || key === 'spin' || key === 'cheer' ? 0.5 : key.charAt(0) === 'g' ? 0.9 : 0.62;
          const planting = this.plant > 0 && ((i === 1) === (this.plantSide > 0));
          if (planting) back -= this.plant * 0.95;
          _c.set((i ? 0.12 : -0.12) * (key === 'tuck' ? 0.3 : 1) + (planting ? (i ? 0.2 : -0.2) * this.plant : 0),
            -Math.cos(back) * 1.05, Math.sin(back) * 1.05).add(end);
          place(p, end, _c);
        }
      }
    }
    handTarget(h, bodySpace, pelYaw, hipY, out) {
      if (bodySpace && h[1] < 0.45) return out.set(h[0], h[1], h[2]);
      out.set(h[0], 0, h[2]).applyAxisAngle(Yax, pelYaw + this.pose.tYaw * 0.6);
      out.y = h[1] + (hipY - 0.74) * 0.9 + (bodySpace ? 0.0 : 0);
      out.z += this.pose.hipZ;
      return out;
    }
    startCrash(rnd) {
      this.crashVel.set((rnd() - 0.3) * 9, (rnd() - 0.5) * 8, (rnd() - 0.5) * 7);
    }
  }
  const _qa = new T.Quaternion(), _qb = new T.Quaternion();
  const _f1 = new T.Vector3(), _f2 = new T.Vector3(), _a = new T.Vector3(), _c = new T.Vector3(), _k = new T.Vector3(), _h1 = new T.Vector3(), _t1 = new T.Vector3(), _t2 = new T.Vector3();
  G.Rider = Rider;
})();
