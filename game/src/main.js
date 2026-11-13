/* main.js — boot, game loop, input, save/load. Browser shell; ALL host access
 * goes through BF.env (see src/core/env.js) so tests can mock it. */
(function () {
  const BF = globalThis.BF;
  const SAVE_KEY = 'bonfire_winter_survivors_save';

  let sim = null;
  let selectedId = null;
  let renderer = null;
  let canvas = null;
  let last = 0;
  let uiAccum = 0;
  let saveAccum = 0;
  let ended = false;

  function store() { return BF.env.localStorage; }

  function newRun() {
    const seed = (BF.env.now() ^ Math.floor(BF.env.random() * 0xffffffff)) >>> 0;
    sim = new BF.GameSim(seed);
    selectedId = null;
    ended = false;
    if (BF.Audio) BF.Audio.start();
    BF.UI.reset(sim);
    save();
  }

  function continueRun() {
    try {
      const json = store() && store().getItem(SAVE_KEY);
      if (json) sim = BF.GameSim.deserialize(json);
    } catch (e) { sim = null; }
    if (!sim || sim.status !== 'playing') { newRun(); return; }
    ended = false;
    if (BF.Audio) BF.Audio.start();
    BF.UI.reset(sim);
  }

  function save() {
    if (sim && sim.status === 'playing' && store()) {
      try { store().setItem(SAVE_KEY, sim.serialize()); } catch (e) { /* private mode */ }
    }
  }

  function clearSave() {
    try { if (store()) store().removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  // ---------- actions wired to the panel ----------
  BF.UI.actions = {
    stoke: () => sim.stoke(),
    bank: () => sim.bank(),
    wood: () => { if (!sim.addWood(1)) flash('No wood left in supplies.'); },
    woodall: () => { if (!sim.addWood(sim.inventory.wood)) flash('No wood left in supplies.'); },
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

  // ---------- canvas input (grid cells) ----------
  function wireInput(cv) {
    cv.addEventListener('click', (ev) => {
      if (!sim || sim.status !== 'playing') return;
      const r = cv.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * 640;
      const y = ((ev.clientY - r.top) / r.height) * 480;

      if (sim.mode === 'ember') {
        if (sim.ember && sim.ember.lunge) sim.clickBeast(sim.ember.lunge.id);
        return;
      }
      const cell = BF.grid.cellOf(x, y);
      const cc = BF.grid.cellCenter(cell.gx, cell.gy);
      // click a beast on/near this cell?
      const all = sim.boss && sim.boss.hp > 0 ? sim.beasts.concat([sim.boss]) : sim.beasts;
      const b = all.find(bb => Math.hypot(bb.x - cc.x, bb.y - cc.y) <= 16 || Math.hypot(bb.x - x, bb.y - y) <= 14);
      if (b) { sim.clickBeast(b.id); if (BF.Audio) BF.Audio.blip(520); return; }
      // click a hero?
      const h = sim.aliveHeroes().find(hh => Math.hypot(hh.x - x, hh.y - y) <= 14);
      if (h) { selectedId = h.id; return; }
      // otherwise send the selected hero to this cell
      if (selectedId) sim.setHeroTargetCell(selectedId, cell.gx, cell.gy);
    });
  }

  // ---------- loop ----------
  function frame(ts) {
    BF.env.requestAnimationFrame(frame);
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
  function boot() {
    const doc = BF.env.document;
    canvas = doc.getElementById('game');
    renderer = new BF.Renderer(canvas);
    BF.UI.build();
    if (BF.Desktop) BF.Desktop.init();
    BF.getSim = () => sim; // debug/tests
    wireInput(canvas);

    // taskbar clock
    const clockEl = doc.getElementById('clock');
    function updateClock() {
      if (!clockEl) return;
      const d = new Date(BF.env.now());
      let h = d.getHours();
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      clockEl.textContent = h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
    }
    updateClock();
    const clockTimer = BF.env.setInterval(updateClock, 10000);
    if (clockTimer && clockTimer.unref) clockTimer.unref(); // let Node exit in tests

    // scale the fixed 1024x768 desktop mockup to fit the viewport
    const desktop = doc.getElementById('desktop');
    function fit() {
      if (!desktop) return;
      const s = Math.min(BF.env.innerWidth() / 1024, BF.env.innerHeight() / 768, 1);
      desktop.style.transform = 'scale(' + s + ')';
    }
    BF.env.addEventListener('resize', fit);
    fit();

    let hasSave = false;
    try { hasSave = !!(store() && store().getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
    BF.UI.showTitle(hasSave, newRun, continueRun);
    BF.reopenTitle = () => {
      let hs = false;
      try { hs = !!(store() && store().getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
      BF.UI.showTitle(hs, newRun, continueRun);
    };
    BF.env.requestAnimationFrame(frame);
  }

  boot();
})();
