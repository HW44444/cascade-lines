/* Cascade Lines - party server.
 *
 * One Durable Object per party code. It holds the roster, the host's choice of
 * run, and relays every rider's state to everyone else. It stores nothing: when
 * the last player leaves, the object goes away with the party.
 *
 * Deploy:  cd worker && npx wrangler deploy
 * Then paste the printed URL into the game's Party screen.
 */

const CODE_ALPHABET = 'ACDEFHJKLMNPRTUVWXY34679';   /* no O/0, I/1, S/5, B/8 */
const MAX_PLAYERS = 8;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function newCode() {
  let s = '';
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    /* A code to hand to friends. The object is only created when someone joins. */
    if (url.pathname === '/new') {
      return Response.json({ code: newCode() }, { headers: CORS });
    }

    const m = url.pathname.match(/^\/party\/([A-Za-z0-9]{4,8})$/);
    if (m) {
      const code = m[1].toUpperCase();
      const id = env.PARTY.idFromName(code);
      return env.PARTY.get(id).fetch(request);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({ ok: true, service: 'cascade-lines-party' }, { headers: CORS });
    }
    return new Response('Not found', { status: 404, headers: CORS });
  },
};

export class Party {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.nextId = 1;
    this.pick = null;        /* the host's chosen run */
    this.startAt = 0;        /* epoch ms the countdown ends, 0 when not racing */
    this.results = [];
  }

  /* Everyone currently connected, in join order. */
  sockets() {
    return this.state.getWebSockets().filter((ws) => this.meta(ws));
  }
  meta(ws) {
    try { return ws.deserializeAttachment() || null; } catch { return null; }
  }
  setMeta(ws, m) { ws.serializeAttachment(m); }

  roster() {
    return this.sockets().map((ws) => {
      const m = this.meta(ws);
      return { id: m.id, name: m.name, gear: m.gear, kit: m.kit, host: m.host, ready: m.ready, done: m.done };
    });
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* gone */ } }
  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const ws of this.sockets()) { if (ws !== except) { try { ws.send(s); } catch { /* gone */ } } }
  }
  pushRoster() { this.broadcast({ t: 'roster', players: this.roster(), pick: this.pick, startAt: this.startAt }); }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.pathname.split('/').pop().toUpperCase();

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ code, players: this.roster().length, pick: this.pick }, { headers: CORS });
    }
    if (this.sockets().length >= MAX_PLAYERS) {
      return new Response('Party full', { status: 403, headers: CORS });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server);

    const first = this.sockets().length === 0;
    const id = this.nextId++;
    this.setMeta(server, {
      id, code, name: 'Rider ' + id, gear: 'ski', kit: {},
      host: first, ready: false, done: false,
    });

    this.send(server, { t: 'joined', you: id, code, host: first, pick: this.pick, startAt: this.startAt });
    this.pushRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const me = this.meta(ws);
    if (!me) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.t) {
      case 'hello': {
        /* Names are the player's own, trimmed and capped. */
        me.name = String(msg.name || me.name).slice(0, 14).replace(/[^\w .'-]/g, '') || ('Rider ' + me.id);
        me.gear = msg.gear === 'board' ? 'board' : 'ski';
        me.kit = msg.kit && typeof msg.kit === 'object' ? msg.kit : {};
        this.setMeta(ws, me);
        this.pushRoster();
        break;
      }
      case 'pick': {
        if (!me.host) break;
        this.pick = {
          resort: String(msg.resort || '').slice(0, 24),
          run: String(msg.run || '').slice(0, 32),
          time: String(msg.time || 'auto').slice(0, 10),
          wx: String(msg.wx || 'auto').slice(0, 10),
        };
        this.startAt = 0; this.results = [];
        for (const s of this.sockets()) { const m = this.meta(s); m.ready = false; m.done = false; this.setMeta(s, m); }
        this.pushRoster();
        break;
      }
      case 'ready': {
        me.ready = !!msg.v; this.setMeta(ws, me); this.pushRoster();
        break;
      }
      case 'start': {
        if (!me.host || !this.pick) break;
        this.startAt = Date.now() + 4000;          /* a four second countdown */
        this.results = [];
        for (const s of this.sockets()) { const m = this.meta(s); m.done = false; this.setMeta(s, m); }
        this.broadcast({ t: 'go', at: this.startAt, pick: this.pick, now: Date.now() });
        break;
      }
      case 's': {
        /* A state tick. Stamped with the sender and passed straight on. */
        msg.id = me.id;
        this.broadcast(msg, ws);
        break;
      }
      case 'box': {
        /* Someone opened a power-up box, or used an item on the field. */
        msg.id = me.id;
        this.broadcast(msg, ws);
        break;
      }
      case 'fin': {
        me.done = true; this.setMeta(ws, me);
        this.results.push({ id: me.id, name: me.name, time: +msg.time || 0, score: +msg.score || 0, crash: !!msg.crash });
        this.broadcast({ t: 'fin', id: me.id, name: me.name, time: +msg.time || 0, score: +msg.score || 0, crash: !!msg.crash });
        if (this.sockets().every((s) => (this.meta(s) || {}).done)) {
          this.startAt = 0;
          this.broadcast({ t: 'results', results: this.results.slice().sort((a, b) => (a.time || 1e9) - (b.time || 1e9)) });
        }
        break;
      }
      case 'ping': this.send(ws, { t: 'pong', n: msg.n, now: Date.now() }); break;
    }
  }

  async webSocketClose(ws) { this.handoff(ws); }
  async webSocketError(ws) { this.handoff(ws); }

  /* If the host leaves, the next player in becomes host so the party survives. */
  handoff(ws) {
    const me = this.meta(ws);
    try { ws.close(); } catch { /* already closed */ }
    const left = this.sockets().filter((s) => s !== ws);
    if (me && me.host && left.length) {
      const m = this.meta(left[0]); m.host = true; this.setMeta(left[0], m);
      this.send(left[0], { t: 'youarehost' });
    }
    if (left.length) this.pushRoster();
  }
}
