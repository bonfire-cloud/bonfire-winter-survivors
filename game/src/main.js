/* main.js — boot, game loop, input, save/load. Browser only. */
(function () {
  const BF = globalThis.BF;
  const SAVE_KEY = 'bonfire_winter_survivors_save';

  let sim = null;
  let selectedId = null;
  let renderer = null;
  let last = 0;
  let uiAccum = 0;
  let saveAccum = 0;
  let ended = false;

  const canvas = document.getElementById('game');

  function newRun() {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    sim = new BF.GameSim(seed);
    selectedId = null;
    ended = false;
    if (BF.Audio) BF.Audio.start();
    save();
  }

  function continueRun() {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (json) sim = BF.GameSim.deserialize(json);
    } catch (e) { sim = null; }
    if (!sim || sim.status !== 'playing') { newRun(); return; }
    ended = false;
    if (BF.Audio) BF.Audio.start();
  }

  function save() {
    if (sim && sim.status === 'playing') {
      try { localStorage.setItem(SAVE_KEY, sim.serialize()); } catch (e) { /* private mode */ }
    }
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  // ---------- actions wired to the panel ----------
  BF.UI.actions = {
    stoke: () => sim.stoke(),
    bank: () => sim.bank(),
    wood: () => { if (!sim.addWood(1)) flash('No wood left in supplies.'); },
    relight: () => { if (!sim.relight()) flash('Need 1 ember or 3 wood to relight.'); },
    feed: () => sim.feed(),
    talk: () => sim.talk(),
    blanket: (id) => { if (!sim.giveBlanket(id)) flash('No blankets left.'); },
    ember: () => { if (!sim.startEmberRun()) flash('Cannot move camp now.'); },
    castle: () => sim.startCastleAssault(),
    skip: () => { sim.clock.t = sim.clock.d[sim.clock.phase] - 0.01; },
    assign: (id, task) => sim.assignTask(id, task),
    watch: (id, on) => sim.setWatch(id, on),
    select: (id) => { selectedId = (selectedId === id ? null : id); },
  };

  function flash(msg) {
    if (sim) sim.say(msg);
  }

  // ---------- canvas input ----------
  canvas.addEventListener('click', (ev) => {
    if (!sim || sim.status !== 'playing') return;
    const r = canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 640;
    const y = ((ev.clientY - r.top) / r.height) * 480;

    if (sim.mode === 'ember') {
      if (sim.ember && sim.ember.lunge) sim.clickBeast(sim.ember.lunge.id);
      return;
    }
    // click a beast?
    const all = sim.boss && sim.boss.hp > 0 ? sim.beasts.concat([sim.boss]) : sim.beasts;
    const b = all.find(bb => Math.hypot(bb.x - x, bb.y - y) <= bb.radius + 6);
    if (b) { sim.clickBeast(b.id); if (BF.Audio) BF.Audio.blip(520); return; }
    // click a hero?
    const h = sim.aliveHeroes().find(hh => Math.hypot(hh.x - x, hh.y - y) <= 14);
    if (h) { selectedId = h.id; return; }
    // otherwise move selected hero
    if (selectedId) sim.setHeroTarget(selectedId, x, y);
  });

  // ---------- loop ----------
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!sim) return;
    const dt = Math.min(0.1, (ts - last) / 1000 || 0.016);
    last = ts;

    if (sim.status === 'playing') {
      sim.tick(dt);
      if (BF.Audio) BF.Audio.tick(sim);
      uiAccum += dt;
      saveAccum += dt;
      if (uiAccum > 0.12) { BF.UI.refresh(sim, selectedId); uiAccum = 0; }
      if (saveAccum > 2) { save(); saveAccum = 0; }
    } else if (!ended) {
      ended = true;
      if (BF.Audio) { if (sim.status === 'won') BF.Audio.blip(880); else BF.Audio.bad(); }
      clearSave();
      BF.UI.refresh(sim, selectedId);
      BF.UI.showEnd(sim, newRun);
    }

    renderer.draw(sim, selectedId, dt);
  }

  // ---------- boot ----------
  renderer = new BF.Renderer(canvas);
  let hasSave = false;
  try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) { /* ignore */ }
  BF.UI.showTitle(hasSave, newRun, continueRun);
  requestAnimationFrame(frame);
})();
