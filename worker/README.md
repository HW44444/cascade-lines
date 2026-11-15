# Cascade Lines — party server

Riding together needs one small server. It cannot live inside the Pages
project: Cloudflare does not allow Durable Objects there, and a Durable Object
is what holds a party together. So this is a Worker of its own, deployed once
and then left alone.

## Deploy

```sh
cd worker
npx wrangler login      # once, in a browser
npx wrangler deploy
```

Wrangler prints an address like
`https://cascade-lines-party.<your-subdomain>.workers.dev`.

Open the game, go to **Season pass → Party**, and paste that address in. It is
saved locally, so you only do this once. Anyone you ride with pastes the same
address and then types your party code.

## What it does

One Durable Object per party code. It holds the roster, the host's choice of
run, and relays each rider's state to the others. Nothing is written to disk —
when the last player leaves, the party goes with them.

| Route | |
| --- | --- |
| `GET /new` | mints an unused five-letter code |
| `GET /party/:code` | party status as JSON |
| `WS /party/:code` | join the party |

Codes come from `ACDEFHJKLMNPRTUVWXY34679` — no O/0, I/1, S/5 or B/8, so a code
read out loud is a code that works. Eight players per party.

## Costs

Durable Objects are on the Workers paid plan ($5/month), which also covers a
great deal else. The traffic itself is negligible: eight riders at 15 Hz is a
few KB a second.

## Protocol

JSON both ways. `hello` sets your name, gear and kit; `pick` and `start` are
host-only; `s` is a state tick, stamped with the sender and passed on to
everyone else; `box` carries a power-up going off; `fin` reports a finish, and
when everyone is down the server sends `results`.

If the host leaves, the next player in becomes host and the party carries on.
