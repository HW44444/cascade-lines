/* Cascade Lines — the shop: what you can buy with points, and what you are wearing */
(function () {
  'use strict';
  const G = window.G;

  /* Every item carries `eff`, the effect it would have if gear were ever
     allowed to change how you ski. It is zero everywhere today, so a bought
     kit is purely a look and every star time stays comparable. */
  const E0 = { speed: 0, grip: 0 };
  const it = (id, name, price, color, extra) => Object.assign({ id, name, price, color, eff: E0 }, extra || {});

  G.SHOP = {
    gear: { name: 'Skis / board', items: [
      it('rental', 'Rental', 0, '#ffc233', { tier: 'Rental' }),
      it('sport', 'Cascade Sport', 1800, '#3ad1a0', { tier: 'Sport' }),
      it('pro', 'Hood Pro', 4500, '#ff5b1f', { tier: 'Pro' }),
      it('team', 'Team Issue', 9000, '#111418', { tier: 'Team' }),
      it('gold', 'Gold Edition', 14000, '#e8b53c', { tier: 'Team' }),
    ] },
    poles: { name: 'Poles', items: [
      it('alu', 'Aluminium', 0, '#15191d'),
      it('carbon', 'Carbon', 900, '#2b3440'),
      it('race', 'Race', 1800, '#d8342a'),
      it('bamboo', 'Bamboo', 1200, '#c8a35c'),
    ] },
    head: { name: 'Head', items: [
      it('helm-white', 'White helmet', 0, '#f4f4f1', { hat: 'helmet' }),
      it('helm-black', 'Black helmet', 400, '#1b1f24', { hat: 'helmet' }),
      it('helm-red', 'Red helmet', 700, '#e2341d', { hat: 'helmet' }),
      it('helm-mint', 'Mint helmet', 1100, '#8fe3c6', { hat: 'helmet' }),
      it('beanie-navy', 'Navy beanie', 600, '#1e2a44', { hat: 'beanie', pom: '#f4f4f1' }),
      it('beanie-rust', 'Rust beanie', 900, '#c9541f', { hat: 'beanie', pom: '#ffd9a8' }),
      it('beanie-stripe', 'Pom beanie', 1600, '#f4f4f1', { hat: 'beanie', pom: '#e2341d' }),
      it('helm-gold', 'Gold lid', 2500, '#e8b53c', { hat: 'helmet' }),
    ] },
    jacket: { name: 'Jacket', items: [
      it('j-red', 'Patrol red', 0, '#e2341d'),
      it('j-blue', 'Glacier blue', 300, '#1aa3d8'),
      it('j-green', 'Spruce', 500, '#1f7a55'),
      it('j-purple', 'Huckleberry', 900, '#7442cf'),
      it('j-pink', 'Alpenglow', 1200, '#ff7a9c'),
      it('j-black', 'Stealth', 1600, '#1b1f24'),
      it('j-cream', 'Glacier cream', 2000, '#f1e7d4'),
      it('j-hiviz', 'Hi-viz', 2500, '#d9ff3a'),
    ] },
    pants: { name: 'Pants', items: [
      it('p-navy', 'Navy', 0, '#16222c'),
      it('p-grey', 'Slate', 300, '#51606b'),
      it('p-brown', 'Bark', 500, '#3b2d21'),
      it('p-black', 'Black', 800, '#15191d'),
      it('p-olive', 'Olive', 1200, '#4e5a33'),
      it('p-cream', 'Bone', 1600, '#e4dccb'),
      it('p-plum', 'Plum', 2000, '#43213f'),
    ] },
    pack: { name: 'Backpack', items: [
      it('none', 'None', 0, null),
      it('day', 'Daypack', 800, '#2b3440'),
      it('avy', 'Avy pack', 1800, '#e2341d'),
      it('vest', 'Race vest', 3000, '#d9ff3a'),
    ] },
  };
  G.SLOTS = ['gear', 'poles', 'head', 'jacket', 'pants', 'pack'];

  G.shopItem = function (slot, id) {
    const s = G.SHOP[slot]; if (!s) return null;
    return s.items.find((i) => i.id === id) || s.items[0];
  };
  G.owns = function (slot, id) {
    const it2 = G.shopItem(slot, id);
    return !!it2 && (it2.price === 0 || (G.Save.data.own || []).indexOf(slot + ':' + id) >= 0);
  };

  /* The rider's appearance: the chosen preset, with anything bought laid over it. */
  G.kitLook = function () {
    const d = G.Save.data, base = G.LOOKS[d.look] || G.LOOKS[0], kit = d.kit || {};
    const pick = (slot) => (kit[slot] && G.owns(slot, kit[slot]) ? G.shopItem(slot, kit[slot]) : null);
    const head = pick('head'), jk = pick('jacket'), pt = pick('pants'), gr = pick('gear'), pl = pick('poles'), pk = pick('pack');
    return {
      name: base.name,
      jacket: jk ? jk.color : base.jacket,
      pants: pt ? pt.color : base.pants,
      helmet: head ? head.color : base.helmet,
      gear: gr ? gr.color : base.gear,
      pole: pl ? pl.color : '#15191d',
      hat: head ? head.hat : 'helmet',
      pom: head ? head.pom : null,
      pack: pk && pk.color ? pk.color : null,
    };
  };

  G.Wallet = {
    get() { return G.Save.data.coins || 0; },
    earn(n) { const d = G.Save.data; d.coins = Math.max(0, (d.coins || 0) + Math.round(n)); G.Save.write(); return d.coins; },
    /* Returns true when the purchase went through. */
    buy(slot, id) {
      const i = G.shopItem(slot, id), d = G.Save.data;
      if (!i || G.owns(slot, id) || (d.coins || 0) < i.price) return false;
      d.coins -= i.price; d.own = (d.own || []).concat(slot + ':' + id);
      d.kit = Object.assign({}, d.kit); d.kit[slot] = id;
      G.Save.write(); return true;
    },
    equip(slot, id) {
      if (!G.owns(slot, id)) return false;
      const d = G.Save.data; d.kit = Object.assign({}, d.kit); d.kit[slot] = id; G.Save.write(); return true;
    },
  };

  /* What a finished run pays out. */
  G.payout = function (res, newStars, unlocked) {
    const trick = Math.floor((res.score || 0) / 20), stars = newStars * 400;
    return { trick, finish: 100, stars, unlock: unlocked ? 2000 : 0, total: trick + 100 + stars + (unlocked ? 2000 : 0) };
  };
})();
