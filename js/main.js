/* Cascade Lines — boot */
(function () {
  'use strict';
  const G = window.G;
  function fail(msg) {
    const el = document.getElementById('nogl'); el.hidden = false;
    if (msg) el.querySelector('p').textContent = msg;
    document.getElementById('s-title').hidden = true;
  }
  function start(seed) {
    if (!window.THREE || !G.Game) { fail('The 3D library did not load. Check your connection and reload the page.'); return; }
    G.Save.load(seed);
    let game;
    try { game = G.game = new G.Game(document.getElementById('gl')); } catch (e) { fail(); return; }
    G.UI.init(game);
    const r = G.RESORTS[0];
    try { game.load(r, r.runs[0], 'attract'); } catch (e) { if (window.console) console.error(e); fail(); return; }
    G.UI.show('title');
  }
  function boot(seed) {
    /* the trail-sign textures use the display face, so give it a moment to arrive */
    const ready = document.fonts && document.fonts.load ? document.fonts.load('800 92px "Big Shoulders Display"') : Promise.resolve();
    let done = false; const go = () => { if (!done) { done = true; start(seed); } };
    ready.then(go, go); setTimeout(go, 1500);
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => G.Save.data);
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
