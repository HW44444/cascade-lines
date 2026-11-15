/* Cascade Lines — power-up boxes. Party mode only, and the host can turn them
 * off for a straight race. Boxes sit on the run like the boost orbs do; the
 * roll is weighted by where you are in the pack, so a bad start is recoverable
 * without the leader being able to farm rockets. */
(function () {
  'use strict';
  const G = window.G;

  /* front/back are the weights at the head and the tail of the field. */
  G.ITEMS = {
    tuck: { name: 'Tuck', front: 30, back: 10, blurb: 'Boost bar, full' },
    rocket: { name: 'Rocket', front: 5, back: 25, blurb: 'A hard shove forward' },
    cloud: { name: 'Snow cloud', front: 10, back: 20, blurb: 'Whiteout, everyone ahead' },
    ice: { name: 'Ice patch', front: 25, back: 10, blurb: 'Drop it behind you' },
    yard: { name: 'Yard sale', front: 0, back: 10, blurb: 'The rider ahead goes down' },
    shield: { name: 'Shield', front: 20, back: 15, blurb: 'Blocks the next hit' },
    magnet: { name: 'Magnet', front: 10, back: 10, blurb: 'Pulls in nearby orbs' },
  };
  const KEYS = Object.keys(G.ITEMS);

  /* place is 0 for the leader, 1 for last. */
  G.rollItem = function (place) {
    const p = G.clamp(place, 0, 1);
    let total = 0; const w = KEYS.map((k) => {
      const it = G.ITEMS[k], v = it.front + (it.back - it.front) * p;
      total += v; return v;
    });
    let r = Math.random() * total;
    for (let i = 0; i < KEYS.length; i++) { r -= w[i]; if (r <= 0) return KEYS[i]; }
    return KEYS[0];
  };

  /* Boxes go where the orbs already are, on the fast line, every so often. */
  G.boxesFor = function (run) {
    const out = [], rnd = G.rng(7701);
    for (let s = 90; s < run.L - 90; s += 120 + rnd() * 90) {
      const hw = run.hwAt ? run.hwAt(s) : 10;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * Math.min(5.5, hw * 0.45);
        out.push({ s, x, h: 1.3, taken: 0 });
      }
    }
    return out;
  };

  /* What an item does when it goes off. The sim is the local rider; `net` is
     how an effect reaches everyone else. */
  G.useItem = function (key, sim, game) {
    const N = G.Net;
    switch (key) {
      case 'tuck': sim.boost = 1; game.msg('Boost!'); break;
      case 'rocket':
        sim.rocket = 2.0; sim.boost = Math.max(sim.boost, 0.6); game.msg('Rocket');
        break;
      case 'magnet': sim.magnet = 5; game.msg('Magnet'); break;
      case 'shield': sim.shield = 1; game.msg('Shield up'); break;
      case 'ice':
        if (N) N.send({ t: 'box', k: 'ice', s: sim.s - 6, x: sim.x });
        game.dropHazard('ice', sim.s - 6, sim.x); game.msg('Ice patch dropped');
        break;
      case 'cloud':
        if (N) N.send({ t: 'box', k: 'cloud', ahead: sim.s });
        game.msg('Snow cloud');
        break;
      case 'yard': {
        const ahead = G.nextAhead(sim);
        if (ahead && N) { N.send({ t: 'box', k: 'yard', to: ahead.id }); game.msg('Yard sale → ' + ahead.name); }
        else game.msg('Nobody ahead');
        break;
      }
    }
  };

  /* The rider directly in front of you, if there is one. */
  G.nextAhead = function (sim) {
    const N = G.Net; if (!N) return null;
    let best = null;
    for (const id of Object.keys(N.remotes)) {
      const r = N.remotes[id];
      if (r.s <= sim.s || r.done) continue;
      if (!best || r.s < best.s) best = r;
    }
    return best;
  };
})();
