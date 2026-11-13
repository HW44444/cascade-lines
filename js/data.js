/* Cascade Lines — resorts, runs and trail-map layouts.
   Lift and run names follow each resort's published trail map. Layouts are simplified
   sketches (1000 x 640 map units), and the in-game runs are generated from the section
   recipes below, so every number here is easy to retune. */
(function () {
  'use strict';
  const G = window.G;

  G.DIFF = {
    green: { label: 'Easier', sym: 'circle', color: '#1f9d55' },
    blue: { label: 'More difficult', sym: 'square', color: '#1c6dd0' },
    black: { label: 'Most difficult', sym: 'diamond', color: '#14181c' },
    double: { label: 'Experts only', sym: 'double', color: '#14181c' },
    park: { label: 'Terrain park', sym: 'oval', color: '#f07a1a' },
  };

  /* Section recipe fields:
     len (m) · pitch (deg) · hw (half width, m) · curve (0..1) · wave (bend length, m)
     prof: flat | crown | bowl | gully · trees: none | sparse | edge | glade
     surf: groomed | powder | moguls
     feats: evenly spaced along the section. 'a|b' puts features side by side.
       roll, rolls3, hit, kS, kM, kL, kXL, rail, box, rainbow, long, drop3, drop5, cornice, boost */
  const S = (len, pitch, hw, o) => {
    const sc = Object.assign({ len, pitch, hw }, o || {});
    if (sc.wave) sc.wave = Math.round(sc.wave * 0.62);      /* shorter wavelength = real, linked turns */
    if (sc.curve) sc.curve = Math.min(1, sc.curve * 1.15);
    return sc;
  };

  G.RESORTS = [
    /* ------------------------------------------------------------------ */
    {
      id: 'meadows', name: 'Mt. Hood Meadows', short: 'Meadows', range: 'Mt. Hood · east side',
      base: 4523, top: 7300, vert: 2777, acres: '2,150', need: 18, aspect: 120, real: true,
      blurb: 'Bowls up top, canyons out right, and a park lap by the lodge.',
      peaks: [{ az: 180, h: 2500, w: 24 }, { az: 58, h: 620, w: 5 }, { az: -70, h: 380, w: 9 }],
      runs: [
        {
          id: 'vista-ridge', name: 'Vista Ridge', diff: 'green', lift: 'Vista Express', sky: 'dawn',
          real: 'vista-ridge', elev: [6555, 5846],
          blurb: 'High-alpine cruiser along the ridge, wide and mellow the whole way. Rollers to learn your first 180 on.',
          sections: [
            S(520, 9.5, 44, { prof: 'crown', trees: 'none', feats: ['boost', 'roll', 'hit', 'roll'] }),
            S(540, 10, 38, { prof: 'crown', trees: 'sparse', feats: ['kS', 'rolls3', 'hit', 'boost'] }),
            S(510, 9, 33, { trees: 'edge', feats: ['kS', 'roll', 'box', 'kM'] }),
          ],
        },
        {
          id: 'north-canyon', name: 'North Canyon', diff: 'green', lift: 'Mt. Hood Express', sky: 'snow',
          real: 'north-canyon', elev: [6535, 5755],
          blurb: 'A winding natural gully through the firs. Ride the banked walls like a bobsled track.',
          sections: [
            S(260, 10, 26, { trees: 'sparse', feats: ['boost', 'roll'] }),
            S(600, 9.5, 15, { prof: 'gully', trees: 'edge', feats: ['roll', 'hit', 'rolls3', 'boost', 'roll', 'kS'] }),
            S(264, 9, 24, { trees: 'edge', feats: ['kS', 'box'] }),
          ],
        },
        {
          id: 'stadium', name: 'Stadium', diff: 'blue', lift: 'Stadium Express', sky: 'night',
          real: 'stadium', elev: [5909, 5361], race: true,
          blurb: 'Meadows\u2019 race hill, lit for night training. Twenty gates, red and blue, alternating down the fall line. Clip them all for the clean run.',
          sections: [
            S(120, 12, 30, { trees: 'edge', feats: ['boost'] }),
            S(540, 14, 32, { trees: 'edge', slalom: 20, feats: ['roll', 'rolls3', 'roll'] }),
            S(129, 12, 30, { trees: 'edge', feats: ['kM', 'boost'] }),
          ],
        },
        {
          id: 'shooting-star', name: 'Shooting Star Ridge', diff: 'blue', lift: 'Shooting Star Express', sky: 'dusk',
          real: 'shooting-star', elev: [6539, 5846],
          blurb: 'Rolling ridge-top cruiser with side hits the whole way down. Best at alpenglow.',
          sections: [
            S(420, 15, 32, { prof: 'crown', trees: 'sparse', feats: ['boost', 'hit', 'roll', 'kM', 'hit'] }),
            S(539, 14, 27, { trees: 'edge', feats: ['rolls3', 'kM', 'box', 'hit', 'kL', 'boost'] }),
          ],
        },
        {
          id: 'zoo', name: 'The Zoo', diff: 'park', lift: 'Easy Rider', sky: 'bluebird',
          real: 'zoo', elev: [5860, 5502],
          blurb: 'The park off Easy Rider. Jump line on the left, jib line on the right. Link them for combos.',
          sections: [
            S(604, 13, 31, { trees: 'edge', feats: ['kS|box', 'kM|rail', 'kM|rainbow', 'boost', 'kL|box', 'kL|long', 'kXL|rail'] }),
          ],
        },
        {
          id: 'shipyard', name: 'Shipyard', diff: 'park', lift: 'Vista Express', sky: 'bluebird',
          real: 'shipyard', elev: [6535, 5837],
          blurb: 'The big park, high on the Vista shoulder. Three XL booters, a superpipe through the middle, and a jib line to finish. Come with speed.',
          sections: [
            S(300, 13, 32, { trees: 'sparse', feats: ['boost', 'kL|rail', 'kXL', 'kXL|long'] }),
            S(60, 12, 20, { trees: 'edge', feats: [] }),
            S(280, 11, 13, { prof: 'pipe', trees: 'edge', feats: ['boost', 'boost'] }),
            S(315, 13, 32, { trees: 'edge', feats: ['kXL|box', 'kXL|rainbow', 'boost', 'kXL'] }),
          ],
        },
        {
          id: 'three-bowl', name: '3 Bowl', diff: 'black', lift: 'Mt. Hood Express', sky: 'bluebird',
          real: 'three-bowl', elev: [6194, 5705],
          blurb: 'Short, steep and straight off the ridge. Drop the lip and stay off the brakes.',
          sections: [
            S(180, 24, 46, { prof: 'bowl', trees: 'none', surf: 'moguls', feats: ['cornice', 'boost', 'drop3'] }),
            S(153, 19, 36, { prof: 'bowl', trees: 'sparse', feats: ['kM', 'hit', 'roll'] }),
          ],
        },
        {
          id: 'blue-face', name: 'Face', diff: 'black', lift: 'Mt. Hood Express', sky: 'snow',
          real: 'blue-face', elev: [6535, 5643],
          blurb: 'Straight down the fall line under the old Blue chair line. Bumps up top, a step mid-run, trees at the bottom.',
          sections: [
            S(430, 24, 34, { trees: 'edge', surf: 'moguls', feats: ['boost', 'drop3', 'kM'] }),
            S(382, 19, 30, { trees: 'edge', feats: ['kL', 'rolls3', 'kM'] }),
          ],
        },
        {
          id: 'waterfall', name: 'Waterfall', diff: 'black', lift: 'Mt. Hood Express', sky: 'overcast',
          real: 'waterfall', elev: [5758, 5381], powder: true,
          blurb: 'Steep, treed and stepped, and it holds knee-deep snow for days. Pick a line between the firs and air each tier.',
          sections: [
            S(517, 23, 30, { trees: 'glade', surf: 'powder', feats: ['drop3', 'boost', 'drop5', 'kM', 'drop3', 'roll', 'drop5'] }),
          ],
        },
        {
          id: 'elevator', name: 'Elevator', diff: 'black', lift: 'Cascade Express', sky: 'bluebird',
          real: 'elevator', elev: [7064, 6339], powder: true,
          blurb: 'A plunge off the top of Cascade. It does not look like much until you are in it. Deep, open and very fast.',
          sections: [
            S(380, 30, 48, { prof: 'bowl', trees: 'none', surf: 'powder', feats: ['cornice', 'boost', 'drop5', 'hit'] }),
            S(437, 22, 36, { prof: 'bowl', trees: 'sparse', surf: 'powder', feats: ['kL', 'drop3', 'boost', 'kM', 'rolls3'] }),
          ],
        },
        {
          id: 'moon-bowl', name: 'Moon Bowl', diff: 'double', lift: 'Shooting Star Express · Heather', sky: 'bluebird',
          real: 'moon-bowl', elev: [6503, 5269], powder: true, deadTrees: true,
          blurb: 'Off the Shooting Star ridge and east through heavy timber all the way to the Heather chair. Tight old growth and bottomless snow. Hit a trunk in here and your day is over.',
          sections: [
            S(360, 16, 34, { trees: 'glade', surf: 'powder', feats: ['boost', 'drop3', 'kM', 'rolls3'] }),
            S(620, 15, 28, { trees: 'glade', surf: 'powder', feats: ['drop3', 'kM', 'boost', 'drop5', 'roll', 'kM'] }),
            S(497, 13, 24, { trees: 'glade', surf: 'powder', feats: ['drop3', 'rolls3', 'kM', 'boost', 'roll'] }),
          ],
        },
        {
          id: 'heather-canyon', name: 'Heather Canyon', diff: 'double', lift: 'Cascade Express · Heather', sky: 'dawn',
          real: 'heather-canyon', elev: [7306, 5259], powder: true,
          blurb: 'A-Zone cornice, open bowl, tight trees, then pump the creek-bed runout to the Heather chair. The whole mountain, top to bottom.',
          sections: [
            S(700, 30, 62, { prof: 'bowl', trees: 'none', surf: 'powder', feats: ['cornice', 'boost', 'drop5', 'hit', 'drop3'] }),
            S(640, 22, 46, { prof: 'bowl', trees: 'sparse', surf: 'powder', feats: ['kL', 'drop5', 'boost', 'kM'] }),
            S(560, 15, 26, { prof: 'gully', trees: 'glade', surf: 'powder', feats: ['roll', 'drop3', 'kM', 'rolls3'] }),
            S(978, 8.5, 14, { prof: 'gully', trees: 'edge', feats: ['boost', 'roll', 'hit', 'rolls3', 'boost', 'roll', 'kS', 'roll', 'boost'] }),
          ],
        },
      ],
    },
    /* ------------------------------------------------------------------ */
    {
      id: 'summit', name: 'Summit Pass', short: 'Summit', range: 'Government Camp',
      base: 4000, top: 4290, vert: 290, acres: '70', need: 9, aspect: 190,
      blurb: 'Open since 1927. Short, mellow laps that are perfect for learning tricks.',
      peaks: [{ az: 180, h: 2900, w: 28 }, { az: 4, h: 520, w: 30 }, { az: 30, h: 700, w: 5 }],
      map: {
        back: [[[250, 190], [400, 70], [470, 22], [540, 12], [600, 50], [700, 110], [860, 200]]],
        massif: [[0, 300], [200, 226], [400, 168], [520, 146], [700, 176], [1000, 262]],
        treeline: [[0, 312], [200, 240], [400, 182], [520, 160], [700, 190], [1000, 276]],
        peak: { x: 520, y: 8, text: 'Mt. Hood' },
        bases: [{ x: 500, y: 552, text: 'Summit Pass Lodge 4,000′' }],
        notes: [{ x: 500, y: 172, text: '4,290′' }, { x: 938, y: 44, text: 'from Timberline' }],
        lifts: [
          { name: 'Summit Chair', a: [482, 527], b: [522, 184] },
          { name: 'Heidi’s Conveyor', a: [568, 546], b: [598, 496], quiet: true },
        ],
      },
      runs: [
        {
          id: 'bumblebee', name: 'Bumblebee', diff: 'green', lift: 'Summit Chair', sky: 'bluebird', elev: [4290, 4000],
          blurb: 'The friendliest hill on Hood. Small rollers, a box and two little kickers.',
          path: [[518, 186], [440, 250], [400, 340], [420, 440], [470, 522]],
          sections: [S(680, 9.5, 34, { curve: 0.3, wave: 380, trees: 'edge', feats: ['boost', 'roll', 'kS', 'box', 'rolls3', 'kS'] })],
        },
        {
          id: 'lower-kruser', name: 'Lower Kruser', diff: 'green', lift: 'Summit Chair', sky: 'snow', elev: [4290, 4000],
          blurb: 'A snowy forest road with banked corners and side hits.',
          path: [[510, 182], [380, 200], [300, 280], [290, 380], [350, 470], [452, 535]],
          sections: [S(860, 9, 20, { curve: 0.65, wave: 300, prof: 'gully', trees: 'edge', feats: ['roll', 'hit', 'boost', 'rolls3', 'kS', 'box', 'hit'] })],
        },
        {
          id: 'yellow-jacket', name: 'Yellow Jacket', diff: 'blue', lift: 'Summit Chair', sky: 'dusk', elev: [4290, 4000],
          blurb: 'Summit’s punchy side. Three kickers and two rails packed into one short pitch.',
          path: [[528, 186], [600, 250], [618, 340], [580, 440], [520, 525]],
          sections: [S(700, 12.5, 28, { curve: 0.35, wave: 340, trees: 'edge', feats: ['kM', 'rail', 'hit', 'kM', 'rainbow', 'kL'] })],
        },
        {
          id: 'alpine', name: 'Alpine Trail', diff: 'blue', lift: 'Timberline to Government Camp', sky: 'overcast', elev: [6000, 4000],
          blurb: 'The old route down from Timberline: two thousand feet of narrow, twisting forest trail.',
          path: [[930, 60], [840, 120], [740, 200], [690, 300], [660, 400], [610, 480], [545, 540]],
          sections: [
            S(900, 12.5, 14, { curve: 0.9, wave: 240, prof: 'gully', trees: 'edge', feats: ['boost', 'roll', 'hit', 'rolls3', 'kS', 'roll', 'boost'] }),
            S(900, 10.5, 12, { curve: 0.95, wave: 220, prof: 'gully', trees: 'edge', feats: ['roll', 'hit', 'boost', 'rolls3', 'kS', 'roll', 'hit'] }),
            S(380, 9, 26, { curve: 0.35, wave: 360, trees: 'edge', feats: ['kM', 'box', 'kM'] }),
          ],
        },
      ],
    },
    /* ------------------------------------------------------------------ */
    {
      id: 'timberline', name: 'Timberline', short: 'Timberline', range: 'Mt. Hood · south side',
      base: 4844, top: 8540, vert: 3696, acres: '1,415', need: 16, aspect: 185, real: true,
      blurb: 'Year-round snow on Palmer, the parks off Stormin’ Norman, and long fall-line blues into the trees.',
      peaks: [{ az: 180, h: 3000, w: 30 }, { az: 5, h: 860, w: 6 }, { az: 13, h: 330, w: 3 }, { az: 16, h: 300, w: 3 }],
      runs: [
        {
          id: 'west-leg', name: 'West Leg Road', diff: 'green', lift: 'Pucci Express', sky: 'dawn',
          real: 'west-leg', realTrim: [0, 1200], elev: [5650, 5495],
          blurb: 'The old access road down the west side. Barely a grade, one long sweeping bend after another — keep poling and let the rollers do the work.',
          sections: [
            S(440, 4, 15, { trees: 'edge', cut: -1, feats: ['boost', 'roll', 'rolls3'] }),
            S(380, 3.5, 13, { trees: 'edge', cut: -1, feats: ['roll', 'hit', 'boost'] }),
            S(380, 4, 16, { trees: 'edge', cut: -1, feats: ['rolls3', 'roll', 'box'] }),
          ],
        },
        {
          id: 'glade', name: 'Glade', diff: 'green', lift: 'Stormin’ Norman', sky: 'snow',
          real: 'glade', elev: [6028, 5387],
          blurb: 'Straight down the fall line through widely spaced firs. The first run most people learn to link turns on.',
          sections: [
            S(640, 9.5, 30, { trees: 'sparse', feats: ['boost', 'roll', 'hit', 'kS'] }),
            S(611, 9, 26, { trees: 'glade', feats: ['roll', 'kS', 'box', 'boost'] }),
          ],
        },
        {
          id: 'otto-lang', name: 'Otto Lang', diff: 'blue', lift: 'Magic Mile', sky: 'dusk',
          real: 'otto-lang', elev: [6932, 5919],
          blurb: 'Above the trees on the east shoulder of the Mile. Nothing to hit, a lot of sky, and rollers the size of cars.',
          sections: [
            S(700, 11, 52, { prof: 'crown', trees: 'none', feats: ['boost', 'roll', 'kM', 'hit', 'rolls3'] }),
            S(620, 12, 44, { prof: 'crown', trees: 'none', feats: ['kL', 'roll', 'kM', 'boost', 'hit'] }),
            S(465, 7, 38, { trees: 'sparse', feats: ['rolls3', 'kM', 'box', 'boost'] }),
          ],
        },
        {
          id: 'kruser', name: 'Kruser', diff: 'blue', lift: 'Stormin’ Norman', sky: 'bluebird',
          real: 'kruser', realTrim: [0, 2100], elev: [6243, 5130],
          blurb: 'The long one. From the top of Norman all the way into Still Creek Basin, bending through the timber the whole way.',
          sections: [
            S(620, 10, 34, { trees: 'edge', feats: ['boost', 'roll', 'kM', 'hit', 'rolls3'] }),
            S(780, 9.5, 28, { trees: 'edge', feats: ['kM', 'roll', 'box', 'boost', 'hit', 'kL', 'roll'] }),
            S(700, 8.5, 24, { trees: 'glade', feats: ['rolls3', 'kM', 'rail', 'boost', 'roll', 'kS'] }),
          ],
        },
        {
          id: 'paintbrush', name: 'Paintbrush', diff: 'park', lift: 'Stormin’ Norman', sky: 'bluebird',
          real: 'paintbrush', elev: [5943, 5523],
          blurb: 'The jib park. Short, tight and stacked with rails — small takeoffs, a lot of metal, built for linking combos.',
          sections: [
            S(750, 10, 28, { trees: 'edge', feats: ['kS|rail', 'kS|box', 'boost', 'kM|rainbow', 'kM|long', 'kM|rail', 'kL|box'] }),
          ],
        },
        {
          id: 'conways', name: 'Conway’s', diff: 'park', lift: 'Stormin’ Norman', sky: 'dusk',
          real: 'conways', elev: [6221, 5614],
          blurb: 'The big line. Three XL booters down the gut with a pipe cut alongside. Come in with speed or come up short.',
          sections: [
            S(340, 11, 32, { trees: 'sparse', feats: ['boost', 'kL|rail', 'kXL'] }),
            S(60, 10, 20, { trees: 'edge', feats: [] }),
            S(270, 10, 13, { prof: 'pipe', trees: 'edge', feats: ['boost', 'boost'] }),
            S(359, 11, 32, { trees: 'edge', feats: ['kXL|box', 'kXL', 'boost', 'kXL|long'] }),
          ],
        },
        {
          id: 'mustang-sally', name: 'Mustang Sally', diff: 'black', lift: 'Stormin’ Norman · Jeff Flood', sky: 'overcast',
          real: 'mustang-sally', realTrim: [0, 1600], elev: [6026, 5096], powder: true,
          blurb: 'Drops off the Norman ridge and steepens as it goes, through old growth that holds knee-deep snow for days after a storm. Pick a line early.',
          sections: [
            S(520, 11, 30, { trees: 'glade', surf: 'powder', feats: ['boost', 'drop3', 'kM', 'rolls3'] }),
            S(560, 9, 26, { trees: 'glade', surf: 'powder', feats: ['drop3', 'kM', 'boost', 'roll', 'kM'] }),
            S(520, 13, 24, { trees: 'glade', surf: 'powder', feats: ['drop5', 'kM', 'boost', 'drop3', 'rolls3'] }),
          ],
        },
        {
          id: 'outer-west', name: 'Outer West', diff: 'black', lift: 'Palmer', sky: 'bluebird',
          real: 'outer-west', elev: [8469, 6939],
          blurb: 'The west edge of the Palmer snowfield above 8,000 feet. Wide, firm, fast and completely exposed — the steepest sustained pitch on the mountain.',
          sections: [
            S(800, 17, 58, { prof: 'bowl', trees: 'none', surf: 'moguls', feats: ['cornice', 'boost', 'drop5', 'kL'] }),
            S(920, 14, 50, { prof: 'bowl', trees: 'none', feats: ['kXL', 'rolls3', 'boost', 'kL', 'drop3', 'kM'] }),
          ],
        },
      ],
    },
    /* ------------------------------------------------------------------ */
    {
      id: 'hoodoo', name: 'Hoodoo', short: 'Hoodoo', range: 'Santiam Pass',
      base: 4668, top: 5703, vert: 1035, acres: '806', need: 12, aspect: 60, real: true,
      blurb: 'A volcanic butte you can lap all the way around — night skiing out front, and the steep ungroomed side out the back.',
      peaks: [{ az: 180, h: 420, w: 44 }, { az: -42, h: 640, w: 4 }, { az: 52, h: 760, w: 3 }, { az: 78, h: 560, w: 4 }, { az: 86, h: 520, w: 4 }],
      runs: [
        {
          id: 'over-easy', name: 'Over Easy', diff: 'green', lift: 'Big Green Machine', sky: 'bluebird',
          real: 'over-easy', elev: [5685, 4683],
          blurb: 'All the way around the butte from the summit, the long way home. Nothing steep anywhere on it — just a mile and a half of cruising with the whole Cascade crest out to the west.',
          sections: [
            S(620, 7, 30, { trees: 'edge', feats: ['boost', 'roll', 'rolls3', 'hit'] }),
            S(700, 8.5, 26, { trees: 'edge', feats: ['roll', 'kS', 'boost', 'rolls3'] }),
            S(700, 7.5, 28, { trees: 'edge', feats: ['rolls3', 'hit', 'box', 'roll'] }),
            S(643, 6.5, 32, { trees: 'sparse', feats: ['roll', 'kS', 'boost', 'rolls3'] }),
          ],
        },
        {
          id: 'blue-valley', name: 'Blue Valley', diff: 'park', lift: 'Manzanita', sky: 'bluebird',
          real: 'blue-valley', elev: [4952, 4683],
          blurb: 'The park lives at the bottom of Blue Valley, under the lights. Roll in off the mellow pitch up top and hit the line all the way to the lodge.',
          sections: [
            S(180, 8, 26, { trees: 'edge', feats: ['boost', 'roll', 'kS'] }),
            S(259, 9, 24, { trees: 'edge', feats: ['kS|rail', 'kM|box', 'boost', 'kM|rainbow', 'kL|long', 'kM|rail'] }),
          ],
        },
        {
          id: 'red-valley', name: 'Red Valley', diff: 'blue', lift: 'Ed Chair', sky: 'snow',
          real: 'red-valley', elev: [5352, 4739],
          blurb: 'Top to bottom down the front face, past the slalom lane and the Midway flats. The classic Hoodoo lap.',
          sections: [
            S(300, 12, 30, { trees: 'edge', feats: ['boost', 'roll', 'kM', 'hit'] }),
            S(244, 10, 26, { trees: 'edge', feats: ['kM', 'roll', 'box', 'boost'] }),
            S(200, 13, 28, { trees: 'edge', feats: ['rolls3', 'kM', 'boost', 'kS'] }),
          ],
        },
        {
          id: 'impossible-dream', name: 'Impossible Dream', diff: 'blue', lift: 'Hodag Chair', sky: 'dusk',
          real: 'impossible-dream', elev: [5669, 4998],
          blurb: 'Straight off the summit down the Hodag side. Steeper than it looks from the chair, and it holds a long rolling fall line the whole way.',
          sections: [
            S(360, 13, 32, { trees: 'edge', feats: ['boost', 'roll', 'kM', 'rolls3'] }),
            S(346, 11.5, 28, { trees: 'glade', feats: ['kM', 'drop3', 'boost', 'roll', 'kS'] }),
          ],
        },
        {
          id: 'big-dipper', name: 'Big Dipper', diff: 'blue', lift: 'Manzanita', sky: 'overcast',
          real: 'big-dipper', elev: [5153, 4693], powder: true,
          blurb: 'Dips through the trees on the Manzanita side and holds light snow between storms. Soft underfoot and quiet.',
          sections: [
            S(380, 10, 26, { trees: 'glade', surf: 'powder', feats: ['boost', 'roll', 'kM', 'drop3'] }),
            S(379, 12, 24, { trees: 'glade', surf: 'powder', feats: ['drop3', 'kM', 'boost', 'rolls3'] }),
          ],
        },
        {
          id: 'dive', name: 'Dive', diff: 'black', lift: 'Big Green Machine', sky: 'bluebird',
          real: 'dive', elev: [5660, 5211],
          blurb: 'Short, and all of it steep. Drops off the summit ridge in one pitch with no run-out to collect yourself.',
          sections: [
            S(351, 20, 22, { prof: 'crown', trees: 'edge', surf: 'moguls', feats: ['cornice', 'boost', 'drop5', 'kM'] }),
          ],
        },
        {
          id: 'chucks-backside', name: "Chuck's Backside", diff: 'black', lift: 'Big Green Machine · Hodag Chair', sky: 'snow',
          real: 'chucks-backside', elev: [5669, 5063], powder: true,
          blurb: 'Over the back of the butte, out of sight of the lodge. Never groomed, never cut — trees, drops and whatever the last storm left. The hardest line at Hoodoo.',
          sections: [
            S(260, 15, 24, { trees: 'glade', surf: 'powder', feats: ['cornice', 'drop3', 'boost', 'kM'] }),
            S(240, 17, 20, { trees: 'glade', surf: 'powder', deadTrees: true, feats: ['drop5', 'kM', 'boost', 'drop3'] }),
            S(237, 14, 22, { trees: 'glade', surf: 'powder', feats: ['drop3', 'rolls3', 'boost', 'kM'] }),
          ],
        },
      ],
    },
    /* ------------------------------------------------------------------ */
    {
      id: 'bachelor', name: 'Mt. Bachelor', short: 'Bachelor', range: 'Central Cascades',
      base: 5700, top: 9065, vert: 3365, acres: '4,323', need: 14, aspect: 20,
      blurb: 'A full volcano to ride: lava-flow whoops, a mile of park and a summit cirque.',
      peaks: [{ az: 180, h: 1500, w: 36 }, { az: -16, h: 980, w: 5 }, { az: -8, h: 900, w: 4 }, { az: -1, h: 940, w: 5 }, { az: 15, h: 760, w: 6 }],
      map: {
        back: [],
        massif: [[0, 470], [120, 400], [260, 280], [380, 150], [470, 60], [500, 38], [530, 60], [620, 150], [740, 280], [880, 400], [1000, 470]],
        treeline: [[0, 482], [200, 402], [340, 332], [440, 302], [560, 302], [680, 342], [820, 422], [1000, 482]],
        peak: { x: 500, y: 28, text: 'Summit 9,065′' },
        bases: [{ x: 330, y: 574, text: 'West Village 6,350′' }, { x: 704, y: 576, text: 'Sunrise Lodge' }, { x: 64, y: 616, text: '5,700′' }],
        notes: [{ x: 452, y: 290, text: 'Pine Marten Lodge' }],
        lifts: [
          { name: 'Summit', a: [522, 292], b: [506, 62] },
          { name: 'Pine Marten', a: [342, 556], b: [422, 300] },
          { name: 'Skyliner', a: [566, 560], b: [545, 300] },
          { name: 'Sunrise', a: [702, 560], b: [652, 400] },
          { name: 'Cloudchaser', a: [905, 522], b: [705, 300] },
          { name: 'Rainbow', a: [640, 548], b: [608, 340], quiet: true },
          { name: 'Outback', a: [182, 520], b: [352, 282] },
          { name: 'Northwest', a: [62, 600], b: [332, 222] },
          { name: 'Red Chair', a: [300, 560], b: [362, 402], quiet: true },
        ],
      },
      runs: [
        {
          id: 'marshmallow', name: 'Marshmallow', diff: 'green', lift: 'Sunrise', sky: 'bluebird',
          blurb: 'Soft, wide and sunny. Warm up with small kickers and a box.',
          path: [[652, 402], [690, 440], [676, 490], [700, 556]],
          sections: [S(1250, 9.5, 40, { curve: 0.35, wave: 460, trees: 'edge', feats: ['boost', 'roll', 'kS', 'rolls3', 'box', 'kS', 'hit', 'kM'] })],
        },
        {
          id: 'thunderbird', name: 'Thunderbird', diff: 'blue', lift: 'Pine Marten', sky: 'dawn', elev: [7775, 6350],
          blurb: 'Bachelor’s lava flows left berms and whoops everywhere. Pump them, pop them, keep your speed.',
          path: [[422, 302], [400, 360], [385, 430], [352, 500], [342, 552]],
          sections: [S(1750, 14.5, 36, { curve: 0.5, wave: 370, trees: 'edge', feats: ['boost', 'rolls3', 'hit', 'kM', 'rolls3', 'hit', 'kL', 'boost', 'rolls3', 'kM', 'hit', 'kL'] })],
        },
        {
          id: 'bachelor-parks', name: 'Bachelor Parks', diff: 'park', lift: 'Skyliner', sky: 'dusk',
          blurb: 'Nearly a mile of park, three zones back to back. Ten sets if you can hold the combo.',
          path: [[545, 302], [572, 370], [556, 440], [572, 510], [566, 556]],
          sections: [S(1550, 12.5, 36, { curve: 0.15, wave: 640, trees: 'edge', feats: ['kS|box', 'kM|rail', 'kM|rainbow', 'boost', 'kL|long', 'kL|box', 'kXL|rail', 'boost', 'kL|rainbow', 'kXL|long', 'kXL|box'] })],
        },
        {
          id: 'boomerang', name: 'Boomerang', diff: 'black', lift: 'Outback', sky: 'snow',
          blurb: 'Outback storm laps. A fast upper pitch, then spaced old-growth with drops between the trunks.',
          path: [[352, 284], [300, 330], [258, 400], [214, 468], [184, 518]],
          sections: [
            S(620, 22, 34, { curve: 0.3, wave: 460, trees: 'edge', feats: ['boost', 'kM', 'rolls3', 'kL'] }),
            S(920, 19, 38, { curve: 0.45, wave: 400, trees: 'glade', surf: 'powder', feats: ['drop3', 'kM', 'boost', 'drop5', 'roll', 'kM', 'drop3'] }),
          ],
        },
        {
          id: 'cows-face', name: 'Cow’s Face', diff: 'black', lift: 'Summit', sky: 'bluebird', elev: [9065, 7340],
          blurb: 'A huge treeless face off the summit, covered in wind lips. Go as fast as you dare.',
          path: [[512, 64], [590, 110], [660, 180], [705, 250], [706, 298]],
          sections: [S(1550, 25, 75, { curve: 0.2, wave: 760, trees: 'none', surf: 'powder', feats: ['cornice', 'boost', 'hit', 'drop3', 'kL', 'rolls3', 'hit', 'drop5', 'kL', 'boost', 'kXL'] })],
        },
        {
          id: 'cirque-northwest', name: 'Cirque Bowl to Northwest', diff: 'double', lift: 'Summit · Northwest', sky: 'dusk', elev: [9065, 5700],
          blurb: 'All 3,365 feet. Drop into the Cirque, run the west bowls, thread the trees and ride the catchline out to Northwest.',
          path: [[500, 62], [440, 110], [380, 180], [300, 280], [210, 400], [130, 510], [64, 598]],
          sections: [
            S(650, 33, 65, { curve: 0.2, wave: 720, prof: 'bowl', trees: 'none', surf: 'powder', feats: ['cornice', 'drop5', 'boost', 'drop5', 'hit'] }),
            S(700, 22, 50, { curve: 0.3, wave: 560, prof: 'bowl', trees: 'none', surf: 'powder', feats: ['kL', 'drop3', 'boost', 'kXL'] }),
            S(800, 17, 34, { curve: 0.5, wave: 400, trees: 'glade', surf: 'powder', feats: ['drop3', 'kM', 'rolls3', 'kL', 'boost'] }),
            S(1000, 12, 20, { curve: 0.8, wave: 265, prof: 'gully', trees: 'edge', feats: ['roll', 'hit', 'rolls3', 'kM', 'boost', 'roll', 'kL'] }),
          ],
        },
      ],
    },
  ];

  /* Rough trick value of each feature, used to set score goals. */
  G.FEATVAL = { roll: 60, rolls3: 150, hit: 260, kS: 300, kM: 560, kL: 850, kXL: 1200, rail: 540, box: 500, rainbow: 640, long: 860, drop3: 240, drop5: 380, cornice: 300, boost: 0 };

  G.resortById = (id) => G.RESORTS.find((r) => r.id === id);
  G.runById = (resort, id) => resort.runs.find((r) => r.id === id);
  G.RESORTS.forEach((r) => {
    /* runs without a published lift elevation get one from their place on the trail map */
    if (r.runs.every((run) => run.elev)) return;
    let yTop = 1e9, yBase = -1e9;
    r.runs.forEach((run) => (run.path || []).forEach((p) => { if (p[1] < yTop) yTop = p[1]; if (p[1] > yBase) yBase = p[1]; }));
    const at = (y) => Math.round((r.top - ((y - yTop) / (yBase - yTop)) * r.vert) / 10) * 10;
    r.runs.forEach((run) => { if (!run.elev) run.elev = [at(run.path[0][1]), at(run.path[run.path.length - 1][1])]; });
  });
  G.RESORTS.forEach((r) => r.runs.forEach((run) => {
    let v = 0;
    run.sections.forEach((sc) => (sc.feats || []).forEach((tok) => tok.split('|').forEach((t) => { v += G.FEATVAL[t] || 0; })));
    run.featValue = v;
    run.goalScore = Math.max(600, Math.round((v * 0.5) / 100) * 100);
    run.park = run.diff === 'park';
    if (run.park) run.scoreTiers = [run.goalScore, Math.round((run.goalScore * 1.7) / 100) * 100, Math.round((run.goalScore * 2.6) / 100) * 100];
  }));
})();
