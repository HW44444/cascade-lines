/* Cascade Lines — saved progress, menus, trail-map screen, results */
(function () {
  'use strict';
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const KEY = 'cascade-lines-save-v1';
  const STAR_PATH = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z';
  const star = (on) => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  const SKYNAME = { bluebird: 'Bluebird', dawn: 'First chair', snow: 'Storm day', overcast: 'Overcast', dusk: 'Alpenglow', night: 'Night session' };

  /* difficulty symbol as inline SVG, optionally with a number inside */
  G.symSVG = function (diff, size, num) {
    const d = G.DIFF[diff], c = d.color, wide = d.sym === 'double' || d.sym === 'oval', w = wide ? 34 : 24;
    let shape;
    if (d.sym === 'circle') shape = `<circle cx="12" cy="12" r="10" fill="${c}"/>`;
    else if (d.sym === 'square') shape = `<rect x="2.5" y="2.5" width="19" height="19" fill="${c}"/>`;
    else if (d.sym === 'diamond') shape = `<path d="M12 .8 21 12 12 23.2 3 12Z" fill="${c}"/>`;
    else if (d.sym === 'double') shape = `<path d="M10 .8 19 12 10 23.2 1 12Z" fill="${c}"/><path d="M24 .8 33 12 24 23.2 15 12Z" fill="${c}"/>`;
    else shape = `<ellipse cx="17" cy="12" rx="16" ry="9.5" fill="${c}"/>`;
    const txt = num ? `<text x="${w / 2}" y="16.4" text-anchor="middle" font-family="Instrument Sans,system-ui,sans-serif" font-weight="700" font-size="${d.sym === 'double' ? 11 : 12.5}" fill="#fff">${num}</text>` : '';
    return `<svg viewBox="0 0 ${w} 24" width="${(size * w) / 24}" height="${size}" role="img" aria-label="${d.label}" style="flex:none;display:block">${shape}${txt}</svg>`;
  };

  /* ---------------- save ---------------- */
  const Save = (G.Save = { data: { v: 1, gear: 'ski', look: 0, units: 'mph', sound: true, quality: 'auto', runs: {}, seenHint: false, unlockAll: false, time: 'auto', wx: 'auto', coins: 0, own: [], kit: {} } });
  Save.load = function (seed) {
    try { const raw = window.localStorage.getItem(KEY); if (raw) Object.assign(Save.data, JSON.parse(raw)); } catch (e) { /* storage can be unavailable */ }
    if (seed && seed.runs) {
      Object.keys(seed).forEach((k) => { if (k !== 'runs') Save.data[k] = seed[k]; });
      Object.keys(seed.runs).forEach((k) => { if (!Save.data.runs[k]) Save.data.runs[k] = seed.runs[k]; });
    }
  };
  Save.write = function () { try { window.localStorage.setItem(KEY, JSON.stringify(Save.data)); } catch (e) { /* keep playing from memory */ } };
  Save.rec = (resort, def) => Save.data.runs[resort.id + '/' + def.id] || { stars: [0, 0, 0], best: 0, time: 0 };
  Save.stars = (resort) => resort.runs.reduce((n, d) => n + Save.rec(resort, d).stars.reduce((a, b) => a + b, 0), 0);
  Save.unlocked = function (i) {
    if (i <= 0 || Save.data.unlockAll) return true;
    return Save.unlocked(i - 1) && Save.stars(G.RESORTS[i - 1]) >= G.RESORTS[i - 1].need;
  };
  Save.record = function (resort, def, res) {
    const idx = G.RESORTS.indexOf(resort), prev = Save.rec(resort, def);
    const nextWas = idx + 1 < G.RESORTS.length ? Save.unlocked(idx + 1) : true;
    const doneWas = Save.stars(resort) >= resort.need;
    const stars = prev.stars.map((s, i) => (s || res.stars[i] ? 1 : 0));
    Save.data.runs[resort.id + '/' + def.id] = { stars, best: Math.max(prev.best, res.score), time: prev.time ? Math.min(prev.time, res.time) : res.time };
    const newStars = stars.map((s, i) => !!s && !prev.stars[i]);
    const unlocked = !nextWas && Save.unlocked(idx + 1) ? G.RESORTS[idx + 1] : null;
    const pay = G.payout(res, newStars.filter(Boolean).length, !!unlocked);
    Save.data.coins = (Save.data.coins || 0) + pay.total;
    Save.write();
    return {
      newStars, prev, unlocked, pay,
      seasonDone: idx === G.RESORTS.length - 1 && !doneWas && Save.stars(resort) >= resort.need,
    };
  };

  /* ---------------- trail map drawing ---------------- */
  function smoothPath(pts) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  const poly = (pts) => pts.map((p) => p.join(',')).join(' ');
  /* Surveyed resorts are drawn from the real trail network rather than a sketch. */
  function realMapSVG(resort, selId, you) {
    const GEO = G.GEO[resort.id], PK = GEO.picks, M = GEO.map, V = M.view, W = V[2], H = V[3];
    const halo = 'paint-order="stroke" stroke="#f4f8f8" stroke-width="3" stroke-linejoin="round"';
    const d = (a) => { let o = ''; for (let i = 0; i < a.length; i += 2) o += (i ? 'L' : 'M') + a[i] + ' ' + a[i + 1]; return o; };
    /* a run ridden only part way down a long trail is highlighted only that far */
    const ridden = (def, pk) => {
      if (!def.realTrim) return pk.m;
      let full = 0;
      for (let i = 3; i < pk.p.length; i += 3) full += Math.hypot(pk.p[i] - pk.p[i - 3], pk.p[i + 1] - pk.p[i - 2]);
      const f0 = def.realTrim[0] / full, f1 = Math.min(1, def.realTrim[1] / full);
      const cum = [0];
      for (let i = 2; i < pk.m.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pk.m[i] - pk.m[i - 2], pk.m[i + 1] - pk.m[i - 1]));
      const tot = cum[cum.length - 1], at = (f) => {
        const t = f * tot; let k = 0; while (k < cum.length - 2 && cum[k + 1] < t) k++;
        const u = (t - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
        return [pk.m[k * 2] + (pk.m[k * 2 + 2] - pk.m[k * 2]) * u, pk.m[k * 2 + 1] + (pk.m[k * 2 + 3] - pk.m[k * 2 + 1]) * u, k];
      };
      const a0 = at(f0), a1 = at(f1), out = [a0[0], a0[1]];
      for (let k = a0[2] + 1; k <= a1[2]; k++) out.push(pk.m[k * 2], pk.m[k * 2 + 1]);
      out.push(a1[0], a1[1]);
      return out;
    };
    const picks = {};
    resort.runs.forEach((r) => { picks[PK[r.real] ? PK[r.real].n : r.name] = r; });
    let s = `<svg viewBox="${V.join(' ')}" role="img" aria-label="Trail map of ${G.esc(resort.name)}" font-family="Outfit,system-ui,sans-serif">`;
    s += `<defs><linearGradient id="rSnow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbe7f0"/></linearGradient>
      <linearGradient id="rWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d7a5e"/><stop offset="1" stop-color="#255744"/></linearGradient></defs>`;
    s += `<rect x="${V[0]}" y="${V[1]}" width="${W}" height="${H}" fill="url(#rSnow)"/>`;
    /* one path, so the rings cut holes in each other instead of stacking into a solid mass */
    s += `<path fill="url(#rWood)" fill-rule="evenodd" d="${M.forest.map((f) => d(f) + 'Z').join('')}"/>`;
    s += `<g fill="none" stroke="#9fb3c4" stroke-width=".7" opacity=".5">` + M.cont.map((c) => `<path d="${d(c.p)}"/>`).join('') + `</g>`;
    s += `<g fill="none" stroke="#17242d" stroke-width="1.4" stroke-dasharray="7 5" opacity=".45">` + M.bound.map((b) => `<path d="${d(b)}Z"/>`).join('') + `</g>`;
    /* every surveyed trail, then the playable ones picked out on top */
    s += `<g fill="none" stroke-linecap="round" stroke-linejoin="round">`;
    for (const r of M.runs) {
      if (picks[r.n]) continue;
      s += `<path d="${d(r.p)}" stroke="#f7fbfd" stroke-width="6.5"/><path d="${d(r.p)}" stroke="${G.DIFF[r.d].color}" stroke-width="2" opacity=".62"/>`;
    }
    s += `</g>`;
    for (const l of M.lifts) {
      s += `<path d="${d(l.p)}" fill="none" stroke="#3a2a22" stroke-width="2"/><path d="${d(l.p)}" fill="none" stroke="#3a2a22" stroke-width="6.5" stroke-dasharray="1.6 15"/>`;
      const n = l.p.length, ax = l.p[0], ay = l.p[1], bx = l.p[n - 2], by = l.p[n - 1];
      s += `<rect x="${ax - 3.5}" y="${ay - 3.5}" width="7" height="7" fill="#3a2a22"/><rect x="${bx - 3.5}" y="${by - 3.5}" width="7" height="7" fill="#3a2a22"/>`;
      if (!l.q) {
        let ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        s += `<text transform="translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${ang.toFixed(1)})" y="-5.5" text-anchor="middle" font-size="11" font-weight="600" fill="#3a2a22" ${halo}>${G.esc(l.n)}</text>`;
      }
    }
    resort.runs.forEach((r) => {
      const pk = PK[r.real]; if (!pk) return;
      const sel = r.id === selId, m = ridden(r, pk);
      if (sel) s += `<path d="${d(m)}" fill="none" stroke="#ffc233" stroke-width="11" stroke-linecap="round" opacity=".95"/>`;
      s += `<path d="${d(m)}" fill="none" stroke="#f7fbfd" stroke-width="7.5" stroke-linecap="round"/>`;
      s += `<path d="${d(m)}" fill="none" stroke="${G.DIFF[r.diff].color}" stroke-width="${sel ? 4.6 : 3.4}" stroke-linecap="round"${r.diff === 'park' ? ' stroke-dasharray="8 5"' : ''}/>`;
    });
    for (const b of M.lodges) {
      s += `<g transform="translate(${b.p[0]} ${b.p[1]})"><path d="M-10 4V-4L0 -12 10 -4V4Z" fill="#7a3b22" stroke="#f4f8f8" stroke-width="1.4"/><path d="M-12 -3 0 -13 12 -3" fill="none" stroke="#3a2a22" stroke-width="2.2"/></g>`;
      s += `<text x="${b.p[0]}" y="${b.p[1] + 19}" text-anchor="middle" font-size="12" font-weight="700" fill="#16222c" ${halo}>${G.esc(b.n)} ${G.fmt(b.e)}′</text>`;
    }
    s += `<text x="${M.peak[0]}" y="${Math.max(V[1] + 16, M.peak[1])}" text-anchor="middle" font-size="13" font-weight="700" fill="#16222c" ${halo}>▲ ${G.esc(M.peakName || resort.name)}</text>`;
    resort.runs.forEach((r, i) => {
      const pk = PK[r.real]; if (!pk) return;
      const px = pk.m[0], py = pk.m[1], dd = G.DIFF[r.diff], wide = dd.sym === 'double' || dd.sym === 'oval', sc = r.id === selId ? 1.3 : 1.02;
      s += `<g transform="translate(${px - (wide ? 17 : 12) * sc} ${py - 12 * sc}) scale(${sc})" stroke="#f4f8f8" stroke-width="1.5">${G.symSVG(r.diff, 24, i + 1).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
    });
    const selRun = resort.runs.find((r) => r.id === selId), pk = selRun && PK[selRun.real];
    if (pk) {
      const k = Math.min(pk.m.length - 2, (Math.floor(pk.m.length / 4) * 2)), px = pk.m[k], py = pk.m[k + 1];
      const wText = pk.n.length * 14 + 10, right = px + 13 + wText < V[0] + W - 6 || px - 13 - wText < V[0] + 6;
      const tx = right ? Math.min(px + 13, V[0] + W - 6 - wText) : Math.max(px - 13, V[0] + 6 + wText);
      s += `<text x="${tx.toFixed(1)}" y="${py + 4}" text-anchor="${right ? 'start' : 'end'}" font-family="Big Shoulders Display,Arial Narrow,sans-serif" font-size="23" font-weight="900" fill="#16222c" paint-order="stroke" stroke="#ffc233" stroke-width="6" stroke-linejoin="round" style="text-transform:uppercase">${G.esc(pk.n.toUpperCase())}</text>`;
    }
    if (you) s += `<g transform="translate(${you.x} ${you.y}) rotate(${you.a})"><circle r="9" fill="#e2341d" opacity=".25"/><path d="M0 -8 6 7 0 3.5 -6 7Z" fill="#e2341d" stroke="#fff" stroke-width="2"/></g>`;
    const lsc = Math.min(1, (W - 24) / 612);
    s += `<g transform="translate(${V[0] + 12} ${V[1] + H - 30}) scale(${lsc.toFixed(3)})"><rect x="-4" y="-8" width="612" height="32" rx="4" fill="#f4f8f8" opacity=".94"/>`;
    let lx = 6;
    for (const key of ['green', 'blue', 'black', 'double', 'park']) {
      const dd = G.DIFF[key], w = dd.sym === 'double' || dd.sym === 'oval' ? 34 : 24;
      s += `<g transform="translate(${lx} -2) scale(.72)">${G.symSVG(key, 24).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g><text x="${lx + w * 0.72 + 5}" y="12" font-size="12.5" font-weight="600" fill="#16222c">${dd.label}</text>`;
      lx += w * 0.72 + 16 + dd.label.length * 7.1;
    }
    s += `</g>`;
    for (const r of resort.runs) { const q = PK[r.real]; if (q) s += `<path class="runhit" data-run="${r.id}" d="${d(ridden(r, q))}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="26" stroke-linecap="round"><title>${G.esc(r.name)}</title></path>`; }
    return s + '</svg>';
  }

  function mapSVG(resort, selId) {
    const m = resort.map, W = 1000, H = 640;
    const halo = 'paint-order="stroke" stroke="#f4f8f8" stroke-width="3.5" stroke-linejoin="round"';
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trail map of ${G.esc(resort.name)}" font-family="Instrument Sans,system-ui,sans-serif">`;
    s += `<defs>
      <linearGradient id="mSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fbfee"/><stop offset=".55" stop-color="#cfe8f8"/><stop offset="1" stop-color="#eaf5fb"/></linearGradient>
      <linearGradient id="mSnow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d5e3ef"/></linearGradient>
      <linearGradient id="mShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1c25" stop-opacity="0"/><stop offset="1" stop-color="#0e1c25" stop-opacity=".28"/></linearGradient>
      <pattern id="mTrees" width="15" height="13" patternUnits="userSpaceOnUse"><rect width="15" height="13" fill="#2e6a52"/><path d="M1.5 10 4.5 2 7.5 10Z" fill="#1c4a3a"/><path d="M9 13.5 11.6 6.5 14.2 13.5Z" fill="#225542"/><path d="M9 .5 11.6 -6.5 14.2 .5Z" fill="#225542"/></pattern>
    </defs>`;
    s += `<rect width="${W}" height="${H}" fill="url(#mSky)"/>`;
    for (const b of m.back || []) s += `<polygon points="${poly(b)} ${b[b.length - 1][0]},${H} ${b[0][0]},${H}" fill="#f6fafd" stroke="#c4d6e4" stroke-width="1.5" opacity=".9"/>`;
    s += `<polygon points="${poly(m.massif)} ${W},${H} 0,${H}" fill="url(#mSnow)" stroke="#aebfce" stroke-width="1.5"/>`;
    /* ridge lines falling from the skyline */
    m.massif.forEach((p, i) => {
      if (i === 0 || i === m.massif.length - 1) return;
      const dx = (p[0] - m.peak.x) * 0.22 + (i % 2 ? 26 : -18);
      s += `<path d="M${p[0]} ${p[1]} q${dx * 0.3} 60 ${dx} 150" fill="none" stroke="#9db3c6" stroke-width="1.2" opacity=".55"/>`;
    });
    s += `<polygon points="${poly(m.treeline)} ${W},${H} 0,${H}" fill="url(#mTrees)"/>`;
    s += `<polygon points="${poly(m.treeline)} ${W},${H} 0,${H}" fill="url(#mShade)"/>`;
    /* pistes cut through the trees */
    for (const r of resort.runs) s += `<path d="${smoothPath(r.path)}" fill="none" stroke="#f7fbfd" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`;
    /* lifts */
    for (const l of m.lifts) {
      const [ax, ay] = l.a, [bx, by] = l.b;
      s += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#3a2a22" stroke-width="2.2"/>`;
      s += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#3a2a22" stroke-width="7" stroke-dasharray="2 17"/>`;
      s += `<rect x="${ax - 4}" y="${ay - 4}" width="8" height="8" fill="#3a2a22"/><rect x="${bx - 4}" y="${by - 4}" width="8" height="8" fill="#3a2a22"/>`;
      let ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      s += `<text transform="translate(${mx} ${my}) rotate(${ang.toFixed(1)})" y="-6" text-anchor="middle" font-size="${l.quiet ? 10.5 : 12.5}" font-weight="600" fill="#3a2a22" ${halo}>${G.esc(l.name)}</text>`;
    }
    /* run lines */
    resort.runs.forEach((r, i) => {
      const d = smoothPath(r.path), col = G.DIFF[r.diff].color, sel = r.id === selId;
      if (sel) s += `<path d="${d}" fill="none" stroke="#ffc233" stroke-width="12" stroke-linecap="round" opacity=".95"/>`;
      s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sel ? 5.5 : 4.2}" stroke-linecap="round" ${r.diff === 'park' ? 'stroke-dasharray="9 6"' : ''}/>`;
      void i;
    });
    for (const b of m.bases) {
      s += `<g transform="translate(${b.x} ${b.y})"><path d="M-11 4V-5L0 -13 11 -5V4Z" fill="#7a3b22" stroke="#f4f8f8" stroke-width="1.5"/><path d="M-13 -4 0 -14 13 -4" fill="none" stroke="#3a2a22" stroke-width="2.5"/></g>`;
      s += `<text x="${b.x}" y="${b.y + 20}" text-anchor="middle" font-size="13" font-weight="700" fill="#16222c" ${halo}>${G.esc(b.text)}</text>`;
    }
    for (const n of m.notes || []) s += `<text x="${n.x}" y="${n.y}" text-anchor="middle" font-size="12" font-style="italic" font-weight="500" fill="#2a3b46" ${halo}>${G.esc(n.text)}</text>`;
    s += `<text x="${m.peak.x}" y="${Math.max(16, m.peak.y)}" text-anchor="middle" font-size="14" font-weight="700" fill="#16222c" ${halo}>▲ ${G.esc(m.peak.text)}</text>`;
    /* numbered markers at the top of each run, drawn last so they stay readable */
    resort.runs.forEach((r, i) => {
      const p = r.path[1], d = G.DIFF[r.diff], wide = d.sym === 'double' || d.sym === 'oval', sc = r.id === selId ? 1.3 : 1.05;
      s += `<g transform="translate(${p[0] - (wide ? 17 : 12) * sc} ${p[1] - 12 * sc}) scale(${sc})" stroke="#f4f8f8" stroke-width="1.6">${G.symSVG(r.diff, 24, i + 1).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
    });
    const selRun = resort.runs.find((r) => r.id === selId);
    if (selRun) {
      const p = selRun.path[Math.min(selRun.path.length - 1, Math.floor(selRun.path.length / 2) + 1)], right = p[0] < 700;
      s += `<text x="${p[0] + (right ? 14 : -14)}" y="${p[1] + 4}" text-anchor="${right ? 'start' : 'end'}" font-family="Big Shoulders Display,Arial Narrow,sans-serif" font-size="24" font-weight="900" fill="#16222c" paint-order="stroke" stroke="#ffc233" stroke-width="6" stroke-linejoin="round" style="text-transform:uppercase">${G.esc(selRun.name.toUpperCase())}</text>`;
    }
    /* legend */
    s += `<g transform="translate(14 ${H - 34})"><rect x="-4" y="-8" width="612" height="32" rx="4" fill="#f4f8f8" opacity=".94"/>`;
    let lx = 6;
    for (const key of ['green', 'blue', 'black', 'double', 'park']) {
      const d = G.DIFF[key], w = d.sym === 'double' || d.sym === 'oval' ? 34 : 24;
      s += `<g transform="translate(${lx} -2) scale(.72)">${G.symSVG(key, 24).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g><text x="${lx + w * 0.72 + 5}" y="12" font-size="12.5" font-weight="600" fill="#16222c">${d.label}</text>`;
      lx += w * 0.72 + 16 + d.label.length * 7.1;
    }
    s += `</g>`;
    /* wide invisible hit lines on top */
    for (const r of resort.runs) s += `<path class="runhit" data-run="${r.id}" d="${smoothPath(r.path)}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="30" stroke-linecap="round"><title>${G.esc(r.name)}</title></path>`;
    return s + '</svg>';
  }
  function miniPeak(resort) {
    const m = resort.map;
    if (!m) {
      const g0 = G.GEO[resort.id] || G.GEO.meadows, V = g0.map.view;
      const f = g0.map.forest.slice(0, 3).map((a) => { let o = ''; for (let i = 0; i < a.length; i += 2) o += (i ? 'L' : 'M') + (((a[i] - V[0]) / V[2]) * 1000).toFixed(0) + ' ' + (((a[i + 1] - V[1]) / V[3]) * 480).toFixed(0); return o + 'Z'; }).join('');
      const sx = (v) => (((v - V[0]) / V[2]) * 1000).toFixed(0), sy = (v) => (((v - V[1]) / V[3]) * 480).toFixed(0);
      const net = g0.map.runs.map((r) => { let o = ''; for (let i = 0; i < r.p.length; i += 2) o += (i ? 'L' : 'M') + sx(r.p[i]) + ' ' + sy(r.p[i + 1]); return o; }).join('');
      return `<svg class="peak" viewBox="0 0 1000 480" preserveAspectRatio="none" aria-hidden="true"><rect width="1000" height="480" fill="#16222c"/><path d="${f}" fill="#1f5140" fill-rule="evenodd"/><path d="${net}" fill="none" stroke="#dce9f2" stroke-opacity=".8" stroke-width="3.5" stroke-linecap="round"/></svg>`;
    }
    return `<svg class="peak" viewBox="0 0 1000 480" preserveAspectRatio="none" aria-hidden="true"><polygon points="${poly(m.massif)} 1000,480 0,480" fill="#16222c"/><polygon points="${poly(m.treeline)} 1000,480 0,480" fill="#1f5140"/></svg>`;
  }

  /* ---------------- screens ---------------- */
  const UI = (G.UI = { game: null, resort: null, runId: null });
  UI.init = function (game) {
    UI.game = game;
    document.querySelectorAll('[data-gear]').forEach((b) => b.addEventListener('click', () => { Save.data.gear = b.dataset.gear; Save.write(); UI.syncTitle(); game.setRider(); G.Audio.click(); }));
    $('swatches').innerHTML = G.LOOKS.map((l, i) => `<button data-look="${i}" title="${l.name}" aria-label="${l.name} outfit" aria-pressed="false" style="background:linear-gradient(135deg,${l.jacket} 0 55%,${l.pants} 55% 100%)"></button>`).join('');
    $('swatches').addEventListener('click', (e) => { const b = e.target.closest('[data-look]'); if (!b) return; Save.data.look = +b.dataset.look; Save.write(); UI.syncTitle(); game.setRider(); G.Audio.click(); });
    $('btnStart').addEventListener('click', () => { G.Audio.click(); UI.show('resorts'); });
    $('btnSound').addEventListener('click', UI.toggleSound); $('pSound').addEventListener('click', UI.toggleSound);
    $('btnUnits').addEventListener('click', UI.toggleUnits); $('pUnits').addEventListener('click', UI.toggleUnits);
    $('btnQuality').addEventListener('click', UI.cycleQuality); $('pQuality').addEventListener('click', UI.cycleQuality);
    document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { G.Audio.click(); UI.show(b.dataset.nav); }));
    $('shopGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-buy],[data-equip]'); if (!b) return;
      const slot = b.dataset.buy || b.dataset.equip;
      const done = b.dataset.buy ? G.Wallet.buy(slot, b.dataset.id) : G.Wallet.equip(slot, b.dataset.id);
      if (done) { G.Audio.click(); UI.renderShop(); if (UI.game) UI.game.setRider(); }
    });
    $('tickets').addEventListener('click', (e) => {
      const t = e.target.closest('.ticket'); if (!t || t.classList.contains('locked')) return;
      G.Audio.click(); UI.openResort(G.RESORTS[+t.dataset.i]);
    });
    $('mapsheet').addEventListener('click', (e) => { const h = e.target.closest('[data-run]'); if (h) UI.selectRun(h.dataset.run); });
    $('runlist').addEventListener('click', (e) => { const h = e.target.closest('[data-run]'); if (h) UI.selectRun(h.dataset.run); });
    $('sel').addEventListener('click', (e) => {
      if (e.target.closest('#btnGo')) return UI.dropIn();
      const c = e.target.closest('[data-cond]');
      if (c) { G.Audio.click(); Save.data[c.dataset.cond] = c.dataset.val; Save.write(); UI.renderSel(); }
    });
    $('pResume').addEventListener('click', () => game.togglePause());
    $('pRestart').addEventListener('click', () => { UI.hideOverlays(); game.restart(); });
    $('pMap').addEventListener('click', () => UI.backToMap());
    $('mapoverClose').addEventListener('click', () => UI.toggleMapOverlay());
    $('resCard').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'rAgain') { UI.hideOverlays(); game.restart(); }
      else if (b.id === 'rNext') { UI.hideOverlays(); const n = UI.next; UI.resort = n.resort; UI.runId = n.def.id; game.load(n.resort, n.def, 'play'); }
      else if (b.id === 'rMap') UI.backToMap();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !$('results').hidden) { const b = $('rNext') || $('rAgain'); if (b) b.click(); }
    });
    window.addEventListener('pointerdown', () => G.Audio.init(), { passive: true });
    window.addEventListener('keydown', () => G.Audio.init());
    G.Audio.on = Save.data.sound;
    UI.syncTitle();
  };
  UI.syncTitle = function () {
    const d = Save.data;
    document.querySelectorAll('[data-gear]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gear === d.gear)));
    document.querySelectorAll('[data-look]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.look === d.look)));
    const snd = 'Sound ' + (d.sound ? 'on' : 'off'), un = 'Speed in ' + (d.units === 'kmh' ? 'km/h' : 'mph'), q = 'Graphics: ' + d.quality;
    $('btnSound').textContent = snd; $('pSound').textContent = snd; $('btnUnits').textContent = un; $('pUnits').textContent = un; $('btnQuality').textContent = q; $('pQuality').textContent = q;
    const gn = G.GRABS[d.gear]; $('grabHelp').textContent = `Grab (${gn[1]}, ${gn[2]}, ${gn[3]}, ${gn[4]})`;
  };
  UI.toggleSound = function () { Save.data.sound = !Save.data.sound; Save.write(); G.Audio.setOn(Save.data.sound); UI.syncTitle(); };
  UI.toggleUnits = function () { Save.data.units = Save.data.units === 'kmh' ? 'mph' : 'kmh'; Save.write(); UI.syncTitle(); };
  UI.cycleQuality = function () {
    const o = ['auto', 'high', 'low']; Save.data.quality = o[(o.indexOf(Save.data.quality) + 1) % 3]; Save.write(); UI.syncTitle();
    const g = UI.game; g.applyQuality(); g.resize();
    if (g.world) { const m = g.mode, keep = g.mode === 'attract'; g.load(g.resort, g.def, keep ? 'attract' : 'play'); if (m === 'paused') UI.hideOverlays(); }
  };

  UI.show = function (name) {
    $('mapover').hidden = true;
    ['title', 'resorts', 'map', 'shop'].forEach((n) => { $('s-' + n).hidden = n !== name; });
    UI.hideOverlays();
    if (UI.game && UI.game.mode !== 'attract') UI.game.attract();
    if (name === 'resorts') UI.renderResorts();
    if (name === 'map') UI.renderMap();
    if (name === 'shop') UI.renderShop();
    const el = $('s-' + name); if (el) el.scrollTop = 0;
  };
  UI.hideScreens = function () { ['title', 'resorts', 'map', 'shop'].forEach((n) => { $('s-' + n).hidden = true; }); };
  UI.hideOverlays = function () { $('pause').hidden = true; $('results').hidden = true; };
  UI.showPause = function () { $('pauseSub').textContent = UI.game.def.name + ' · ' + UI.game.resort.name; $('pause').hidden = false; };
  UI.hidePause = function () { $('pause').hidden = true; };
  UI.backToMap = function () { UI.resort = UI.game.resort; UI.runId = UI.game.def.id; UI.show('map'); };

  UI.renderResorts = function () {
    const pc = $('passCoins'); if (pc) pc.textContent = G.fmt(G.Wallet.get());
    $('tickets').innerHTML = G.RESORTS.map((r, i) => {
      const open = Save.unlocked(i), got = Save.stars(r), max = r.runs.length * 3, done = got >= r.need;
      const prev = G.RESORTS[i - 1];
      const punches = Array.from({ length: r.need }, (_, k) => `<i class="${k < got ? 'on' : ''}"></i>`).join('');
      const nextName = G.RESORTS[i + 1] ? G.RESORTS[i + 1].short : null;
      let status;
      if (!open) status = `Locked · ${Math.max(0, prev.need - Save.stars(prev))} more ★ at ${prev.short}`;
      else if (done) status = `<b>Card full</b> · ${got}/${max} ★`;
      else status = `<b>Open</b> · ${got}/${r.need} ★${nextName ? ' to open ' + nextName : ' to finish the season'}`;
      return `<button class="ticket${open ? '' : ' locked'}${done ? ' done' : ''}" data-i="${i}" ${open ? '' : 'aria-disabled="true"'}>
        <span class="no num">0${i + 1}</span>
        <span class="range">${G.esc(r.range)}</span>
        <span class="name">${G.esc(r.name)}</span>
        ${miniPeak(r)}
        <span class="blurb">${G.esc(r.blurb)}</span>
        <dl><div><dt>Base</dt><dd class="num">${G.fmt(r.base)}′</dd></div><div><dt>Top</dt><dd class="num">${G.fmt(r.top)}′</dd></div><div><dt>Vertical</dt><dd class="num">${G.fmt(r.vert)}′</dd></div></dl>
        <span class="punches" aria-hidden="true">${punches}</span>
        <span class="status">${status}</span>
        ${open ? '' : '<span class="stamp">Locked</span>'}
      </button>`;
    }).join('');
  };

  UI.openResort = function (resort) {
    UI.resort = resort;
    const firstOpen = resort.runs.find((d) => !Save.rec(resort, d).stars[0]) || resort.runs[0];
    UI.runId = firstOpen.id;
    UI.show('map');
  };
  UI.renderMap = function () {
    const r = UI.resort || G.RESORTS[0]; UI.resort = r;
    if (!r.runs.find((d) => d.id === UI.runId)) UI.runId = r.runs[0].id;
    const i = G.RESORTS.indexOf(r), got = Save.stars(r), next = G.RESORTS[i + 1];
    $('mapTitle').textContent = r.name;
    $('unlockbar').innerHTML = `<span class="bar"><i style="width:${Math.min(100, (got / r.need) * 100)}%"></i></span><span>${got >= r.need ? (next ? next.name + ' is open' : 'Season complete') : `${got} of ${r.need} ★ to ${next ? 'open ' + next.name : 'finish the season'}`}</span>`;
    $('mapsheet').innerHTML = r.real ? realMapSVG(r, UI.runId) : mapSVG(r, UI.runId);
    $('runlist').innerHTML = r.runs.map((d, k) => {
      const rec = Save.rec(r, d);
      return `<li><button data-run="${d.id}" aria-current="${d.id === UI.runId}">${G.symSVG(d.diff, 20, k + 1)}<span>${G.esc(d.name)}</span><span>${rec.stars.map((s) => star(s)).join('')}</span></button></li>`;
    }).join('');
    UI.renderSel();
  };
  /* Time and weather pickers. "As it comes" leaves the run's own default look. */
  function picker(kind, table, d) {
    const cur = Save.data[kind], sky = G.skyFor(d), now = kind === 'time' ? sky.timeKey : sky.wxKey;
    const opts = [['auto', 'As it comes']].concat(Object.keys(table).map((k) => [k, table[k].label]));
    return opts.map(([k, lab]) => {
      const on = cur === k;
      const hint = k === 'auto' ? ' title="' + G.esc(table[now].label) + ' on this run"' : '';
      return `<button class="cond${on ? ' on' : ''}" data-cond="${kind}" data-val="${k}"${hint}>${G.esc(lab)}</button>`;
    }).join('');
  }
  UI.renderSel = function () {
    const r = UI.resort, d = G.runById(r, UI.runId), rec = Save.rec(r, d), g = G.goals(r, d);
    const mi = (g.len / 1609).toFixed(1);
    $('sel').innerHTML = `
      <div class="top">${G.symSVG(d.diff, 30)}<h3>${G.esc(d.name)}</h3></div>
      <p class="meta">${G.DIFF[d.diff].label} · ${G.esc(d.lift)} · ${G.fmt(d.elev[0] - d.elev[1])} ft vertical · ${mi} mi<span class="chip">${G.esc(G.condName(d))}</span>${
        d.powder ? '<span class="chip pow">Powder</span>' : ''}${d.race ? '<span class="chip race">Slalom</span>' : ''}${d.deadTrees ? '<span class="chip warn">Tight trees</span>' : ''}</p>
      <p class="blurb">${G.esc(d.blurb)}</p>
      <div class="conds">
        <div class="condrow"><span>Time</span><div>${picker('time', G.TIME, d)}</div></div>
        <div class="condrow"><span>Weather</span><div>${picker('wx', G.WX, d)}</div></div>
      </div>
      <table class="goals">
        ${[0, 1, 2].map((i) => `<tr><td>${star(rec.stars[i])}</td><td>${G.goalText(g, i)}</td><td class="num">${
          g.kind === 'park' ? (i === 0 && rec.best ? 'Best ' + G.fmt(rec.best) : '') : (i === 1 && rec.time ? 'Best ' + G.fmtTime(rec.time) : '')}</td></tr>`).join('')}
      </table>
      <div><button class="btn" id="btnGo">Drop in <span aria-hidden="true">→</span></button></div>`;
  };
  UI.selectRun = function (id) { if (id === UI.runId) return; G.Audio.click(); UI.runId = id; UI.renderMap(); };
  UI.dropIn = function () {
    const r = UI.resort, d = G.runById(r, UI.runId);
    G.Audio.init(); UI.hideScreens(); UI.game.load(r, d, 'play');
  };

  /* ---------------- shop ---------------- */
  UI.renderShop = function () {
    const coins = G.Wallet.get();
    $('shopCoins').textContent = G.fmt(coins);
    $('shopGrid').innerHTML = G.SLOTS.map((slot) => {
      const cat = G.SHOP[slot], kit = Save.data.kit || {};
      const rows = cat.items.map((i) => {
        const own = G.owns(slot, i.id), on = own && (kit[slot] ? kit[slot] === i.id : i.price === 0 && cat.items.indexOf(i) === 0);
        const can = coins >= i.price;
        const btn = on ? '<button class="on" disabled>Worn</button>'
          : own ? `<button class="own" data-equip="${slot}" data-id="${i.id}">Wear</button>`
          : `<button data-buy="${slot}" data-id="${i.id}"${can ? '' : ' disabled'}>${G.fmt(i.price)}</button>`;
        const sw = i.color ? `<span class="sw" style="background:${i.color}"></span>` : '<span class="sw none"></span>';
        const sub = i.tier ? i.tier : i.hat === 'beanie' ? 'Beanie' : '';
        return `<li>${sw}<span class="nm">${G.esc(i.name)}${sub ? `<small>${G.esc(sub)}</small>` : ''}</span>${btn}</li>`;
      }).join('');
      return `<div class="shopcat"><h3>${G.esc(cat.name)}</h3><p class="sub">${slot === 'gear' || slot === 'poles' ? 'Looks only for now \u2014 every star time stays comparable.' : 'Pick a look.'}</p><ul>${rows}</ul></div>`;
    }).join('');
  };

  /* ---------------- full-screen trail map ---------------- */
  UI.worldToMap = function (resort, X, Z) {
    const M = G.GEO[resort.id], c = Math.cos(M.phi), sn = Math.sin(M.phi);
    return { x: (c * X - sn * Z) * M.sc + M.offu, y: (sn * X + c * Z) * M.sc + M.offv };
  };
  UI.toggleMapOverlay = function () {
    const g = UI.game;
    if (!g || !g.world) return;
    const el = $('mapover');
    if (!el.hidden) { el.hidden = true; if (g.mode === 'paused') g.togglePause(); return; }
    const r = g.resort;
    if (!r || !r.real) return;
    $('mapoverSheet').innerHTML = realMapSVG(r, g.def.id, null);
    $('mapoverTitle').textContent = r.name + ' · ' + g.def.name;
    el.hidden = false;
    if (g.mode === 'play') { g.pausedFrom = g.mode; g.mode = 'paused'; G.Audio.quiet(); }
  };

  UI.showResults = function (resort, def, res, goal) {
    const out = Save.record(resort, def, res), mph = Save.data.units !== 'kmh';
    const idx = resort.runs.indexOf(def), ri = G.RESORTS.indexOf(resort);
    let next = null;
    if (idx + 1 < resort.runs.length) next = { resort, def: resort.runs[idx + 1] };
    else if (ri + 1 < G.RESORTS.length && Save.unlocked(ri + 1)) next = { resort: G.RESORTS[ri + 1], def: G.RESORTS[ri + 1].runs[0] };
    UI.next = next;
    const nb = (flag) => (flag ? '<span class="new">New best</span>' : '');
    const bestScore = res.score > out.prev.best && out.prev.best > 0, bestTime = out.prev.time > 0 && res.time < out.prev.time;
    let banner = '';
    if (out.unlocked) banner = `<div class="unlock">New mountain open: ${G.esc(out.unlocked.name)}<small>${G.esc(out.unlocked.blurb)}</small></div>`;
    else if (out.seasonDone) banner = `<div class="unlock">Season complete<small>Every card is full. Go back for the stars you missed.</small></div>`;
    $('resCard').innerHTML = `
      <h2>${G.esc(def.name)}</h2>
      <p class="sub">${G.esc(resort.name)} · ${G.esc(def.lift)}</p>
      <div class="bigstars" aria-label="${res.stars.filter(Boolean).length} of 3 stars">${res.stars.map((s) => star(s)).join('')}</div>
      <table class="res">
        <tr><th>Score${goal.kind === 'park' ? ` <small>(goal ${G.fmt(goal.scores[0])} · ${G.fmt(goal.scores[1])} · ${G.fmt(goal.scores[2])})</small>` : ''}</th><td class="num">${nb(bestScore)}${G.fmt(res.score)}</td></tr>
        <tr><th>Time${goal.kind === 'time' ? ` <small>(goal ${G.fmtTime(goal.t2)} · ${G.fmtTime(goal.t3)})</small>` : ''}</th><td class="num">${nb(bestTime)}${G.fmtTime(res.time)}</td></tr>
        ${res.gatesTotal ? `<tr><th>Gates${res.penalty ? ` <small>(+${res.penalty.toFixed(1)}s penalty)</small>` : ''}</th><td class="num">${res.gatesHit} / ${res.gatesTotal}</td></tr>` : ''}
        <tr><th>Best trick</th><td>${res.bestTrick ? G.esc(res.bestTrick.name) + ' · ' + G.fmt(res.bestTrick.pts) : 'None landed'}</td></tr>
        <tr><th>Longest combo</th><td class="num">${res.bestChain} ${res.bestChain === 1 ? 'trick' : 'tricks'}</td></tr>
        <tr><th>Top speed</th><td class="num">${Math.round(res.maxV * (mph ? 2.237 : 3.6))} ${mph ? 'mph' : 'km/h'}</td></tr>
        <tr><th>Air time</th><td class="num">${res.air.toFixed(1)} s</td></tr>
        <tr><th>Crashes</th><td class="num">${res.crashes}</td></tr>
      </table>
      ${banner}
      <div class="row">
        ${next ? `<button class="btn" id="rNext">Next: ${G.esc(next.def.name)}</button>` : ''}
        <button class="btn ${next ? 'paper small' : ''}" id="rAgain">Ride again</button>
        <button class="btn paper small" id="rMap">Trail map</button>
      </div>`;
    $('results').hidden = false;
    res.stars.forEach((s, i) => { if (s && out.newStars[i]) setTimeout(() => G.Audio.star(i), 200 + i * 180); });
  };
})();
