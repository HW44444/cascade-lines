/* Cascade Lines — the party client.
 *
 * Talks to the party Worker over one WebSocket. Everything is JSON: eight
 * riders at 15 Hz is a few KB a second, and being able to read the traffic is
 * worth more than the bytes. State ticks are fire-and-forget; if one is lost
 * the next one lands 66 ms later and the interpolator never notices.
 */
(function () {
  'use strict';
  const G = window.G;
  const TICK = 1 / 15;

  /* Another rider, as the renderer sees them. Rider.update() reads a sim, so a
     Remote pretends to be one: the fields it does not receive hold still. */
  class Remote {
    constructor(id, name, gear, kit) {
      this.id = id; this.name = name; this.gear = gear || 'ski'; this.kit = kit || {};
      this.state = 'ground'; this.s = 0; this.x = 0; this.y = 0; this.th = 0; this.v = 0;
      this.bodyYaw = 0; this.flip = 0; this.spinV = 0; this.flipV = 0; this.air = 0;
      this.grab = 0; this.sw = false; this.sink = 0; this.steer = 0; this.braking = false;
      this.tuck = false; this.landT = 9; this.landHard = 0; this.crashT = 0; this.boosting = false;
      this.score = 0; this.done = false; this.finishTime = 0;
      this.a = null; this.b = null; this.at = 0;     /* the two packets we tween between */
      this.gone = 0;
    }
    /* Keep the last two packets and the time between them. */
    feed(p, now) {
      this.a = this.b || p; this.b = p; this.at = now; this.gone = 0;
      this.gear = p.g === 1 ? 'board' : 'ski';
    }
    step(dt, now) {
      this.gone += dt;
      if (!this.b) return;
      const a = this.a || this.b, b = this.b;
      const k = G.clamp((now - this.at) / TICK, 0, 1.6);
      const L = (p, q) => p + (q - p) * k;
      this.s = L(a.s, b.s); this.x = L(a.x, b.x); this.y = L(a.y, b.y);
      this.v = L(a.v, b.v);
      this.th = a.t + G.wrapPi(b.t - a.t) * k;
      this.bodyYaw = a.y2 + G.wrapPi(b.y2 - a.y2) * k;
      this.flip = a.f + (b.f - a.f) * k;
      this.spinV = (b.y2 - a.y2) / TICK; this.flipV = (b.f - a.f) / TICK;
      this.state = b.st === 2 ? 'crash' : b.st === 1 ? 'air' : b.st === 3 ? 'grind' : 'ground';
      this.air = b.st === 1 ? Math.max(0.1, this.air + dt) : 0;
      this.grab = b.gr || 0; this.sw = !!b.sw; this.boosting = !!b.bo;
      this.score = b.sc || 0;
    }
  }

  const Net = (G.Net = {
    ws: null, code: '', you: 0, host: false, players: [], remotes: {},
    pick: null, startAt: 0, state: 'off',     /* off | connecting | lobby | racing */
    ping: 0, error: '',
    onchange: null,

    url() { return (G.Save.data.partyUrl || '').trim().replace(/\/+$/, ''); },
    configured() { return !!this.url(); },

    fire() { if (this.onchange) try { this.onchange(); } catch (e) { /* ui only */ } },

    async newCode() {
      const r = await fetch(this.url() + '/new');
      if (!r.ok) throw new Error('server said ' + r.status);
      return (await r.json()).code;
    },

    connect(code) {
      this.close();
      this.code = String(code || '').toUpperCase();
      this.state = 'connecting'; this.error = ''; this.fire();
      const base = this.url().replace(/^http/, 'ws');
      let ws;
      try { ws = new WebSocket(base + '/party/' + this.code); }
      catch (e) { this.state = 'off'; this.error = 'That address is not a party server.'; this.fire(); return; }
      this.ws = ws;
      ws.onopen = () => {
        this.send({ t: 'hello', name: G.Save.data.name || '', gear: G.Save.data.gear, kit: G.Save.data.kit || {} });
        this.pingT = setInterval(() => this.send({ t: 'ping', n: Date.now() }), 5000);
      };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
      ws.onclose = () => {
        clearInterval(this.pingT);
        if (this.state !== 'off') { this.state = 'off'; this.error = this.error || 'Disconnected.'; this.fire(); }
      };
      ws.onerror = () => { this.error = 'Could not reach the party server.'; };
    },

    close() {
      clearInterval(this.pingT);
      if (this.ws) { const w = this.ws; this.ws = null; this.state = 'off'; try { w.close(); } catch { /* fine */ } }
      this.remotes = {}; this.players = []; this.you = 0; this.host = false; this.pick = null; this.startAt = 0;
    },

    send(o) { const w = this.ws; if (w && w.readyState === 1) { try { w.send(JSON.stringify(o)); } catch { /* dropped */ } } },

    handle(m) {
      switch (m.t) {
        case 'joined':
          this.you = m.you; this.host = m.host; this.code = m.code;
          this.pick = m.pick; this.startAt = m.startAt || 0;
          this.state = 'lobby'; this.fire(); break;
        case 'roster': {
          this.players = m.players || []; this.pick = m.pick || this.pick; this.startAt = m.startAt || this.startAt;
          const live = {};
          for (const p of this.players) {
            live[p.id] = 1;
            if (p.id !== this.you && !this.remotes[p.id]) this.remotes[p.id] = new Remote(p.id, p.name, p.gear, p.kit);
            else if (this.remotes[p.id]) { this.remotes[p.id].name = p.name; this.remotes[p.id].kit = p.kit; }
          }
          for (const id of Object.keys(this.remotes)) if (!live[id]) delete this.remotes[id];
          this.fire(); break;
        }
        case 'youarehost': this.host = true; this.fire(); break;
        case 'go':
          this.pick = m.pick || this.pick;
          this.skew = (m.now || Date.now()) - Date.now();
          this.startAt = m.at; this.state = 'racing';
          if (this.ongo) this.ongo(); this.fire(); break;
        case 's': { const r = this.remotes[m.id]; if (r) r.feed(m, performance.now() / 1000); break; }
        case 'box': if (this.onbox) this.onbox(m); break;
        case 'fin': {
          const r = this.remotes[m.id]; if (r) { r.done = true; r.finishTime = m.time; r.score = m.score; }
          if (this.onfin) this.onfin(m); this.fire(); break;
        }
        case 'results': this.results = m.results || []; if (this.onresults) this.onresults(this.results); this.fire(); break;
        case 'pong': this.ping = Math.round(Date.now() - m.n); break;
      }
    },

    /* Countdown, in seconds, using the server's clock rather than ours. */
    countdown() { return this.startAt ? (this.startAt - (Date.now() + (this.skew || 0))) / 1000 : 0; },

    pickRun(resort, run) {
      this.send({ t: 'pick', resort: resort.id, run: run.id, time: G.Save.data.time, wx: G.Save.data.wx });
    },
    startRace() { this.send({ t: 'start' }); },
    setReady(v) { this.send({ t: 'ready', v: !!v }); },
    finish(time, score, crash) { this.send({ t: 'fin', time, score, crash: !!crash }); },

    /* Called every frame while racing. Sends our own state at 15 Hz. */
    pump(dt, sim) {
      const now = performance.now() / 1000;
      for (const id of Object.keys(this.remotes)) this.remotes[id].step(dt, now);
      if (!sim || this.state !== 'racing') return;
      this.acc = (this.acc || 0) + dt;
      if (this.acc < TICK) return;
      this.acc = 0;
      this.send({
        t: 's', s: +sim.s.toFixed(2), x: +sim.x.toFixed(2), y: +sim.y.toFixed(2),
        v: +sim.v.toFixed(1), t2: 0, t: +sim.th.toFixed(3), y2: +sim.bodyYaw.toFixed(3),
        f: +sim.flip.toFixed(3), st: sim.state === 'air' ? 1 : sim.state === 'crash' ? 2 : sim.state === 'grind' ? 3 : 0,
        gr: sim.grab || 0, sw: sim.sw ? 1 : 0, bo: sim.boosting ? 1 : 0, sc: sim.score | 0,
        g: sim.gear === 'board' ? 1 : 0,
      });
    },

    /* Where everyone is on the hill right now, leader first. */
    standings(sim) {
      const list = [{ id: this.you, name: 'You', s: sim ? sim.s : 0, done: sim ? sim.finished : false, me: true }];
      for (const id of Object.keys(this.remotes)) {
        const r = this.remotes[id];
        list.push({ id: r.id, name: r.name, s: r.s, done: r.done, me: false });
      }
      return list.sort((a, b) => b.s - a.s);
    },
  });
  G.Remote = Remote;
})();
