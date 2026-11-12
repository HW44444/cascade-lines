# Cascade Lines

A 3D skiing and snowboarding game that runs in the browser, built on the real trail
networks of Oregon's Cascade ski areas.

Play it: ski or ride a progression of runs at each mountain, earn stars, and unlock
the next area. Timed runs are scored on the clock; terrain parks are scored on points.

## Mountains

| | Mountain | Runs | Unlocks |
|---|---|---|---|
| 01 | Mt. Hood Meadows | 12 | Summit Pass |
| 02 | Summit Pass | 6 | Timberline |
| 03 | Timberline | 8 | Hoodoo |
| 04 | Hoodoo | 8 | Mt. Bachelor |
| 05 | Mt. Bachelor | 12 | — |

Meadows and Timberline are built from surveyed trail geometry, so the runs follow
their real centrelines, turns, pitch and elevations. The in-game trail map for those
two is drawn from the same data.

## Controls

| | |
|---|---|
| Steer | A / D or ← / → |
| Tuck | W or ↑ |
| Brake | S or ↓ |
| Jump | Space (hold to load, release to pop) |
| Spin | A / D in the air |
| Flip | W / S in the air |
| Grab | J / K / L |
| Boost | Shift |
| Pause | Esc |

Tricks bank points on landing and fill the boost bar in proportion to what you landed.

## Running it

It is a static site with no build step. Serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Built with

[three.js](https://threejs.org) (r128, from a CDN). Everything else — terrain, rider,
physics, trick system, HUD and trail maps — is plain JavaScript with no dependencies.

## Trail data

Run and lift geometry for Mt. Hood Meadows and Timberline comes from OpenStreetMap,
via the [OpenSkiStats](https://github.com/dhimmel/openskistats) dataset.
OpenStreetMap data is © OpenStreetMap contributors, licensed under the
[Open Database License](https://opendatacommons.org/licenses/odbl/).
