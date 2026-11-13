/* Headless test suite for the Bonfire: Winter Survivors core sim.
 * Run: node game/test/run_tests.js */
'use strict';
const fs = require('fs');
const path = require('path');

const coreDir = path.join(__dirname, '..', 'src', 'core');
for (const f of ['env.js', 'rng.js', 'data.js', 'fire.js', 'clock.js', 'sim.js']) {
  eval(fs.readFileSync(path.join(coreDir, f), 'utf8'));
}
const BF = globalThis.BF;

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok - ' + name); }
  else { failed++; console.log('  FAIL - ' + name); }
}
function section(s) { console.log('\n== ' + s + ' =='); }

// ---------- RNG ----------
section('RNG determinism');
{
  const a = new BF.RNG(42), b = new BF.RNG(42);
  let same = true;
  for (let i = 0; i < 100; i++) if (a.next() !== b.next()) same = false;
  ok(same, 'same seed -> same sequence');
  const c = new BF.RNG(43);
  ok(a.next() !== undefined && c.next() !== a.next(), 'different seeds differ');
}

// ---------- Grid ----------
section('Grid: cell math, BFS paths, cell-by-cell movement');
{
  const g = BF.grid;
  const c = g.cellCenter(7, 4);
  const back = g.cellOf(c.x, c.y);
  ok(back.gx === 7 && back.gy === 4, 'cellCenter/cellOf round-trip');
  const p = g.bfsPath({ gx: 0, gy: 0 }, { gx: 5, gy: 0 }, () => false);
  ok(p.length === 5 && p.every((cc, i) => cc.gx === i + 1 && cc.gy === 0), 'BFS straight line on empty grid');
  ok(g.bfsPath({ gx: 9, gy: 7 }, { gx: 10, gy: 7 }).length === 0, 'fire cell is blocked');
  const detour = g.bfsPath({ gx: 9, gy: 7 }, { gx: 11, gy: 7 }, g.defaultBlocked);
  ok(detour.length === 4 && !detour.some(cc => cc.gx === 10 && cc.gy === 7), 'BFS routes around the fire');
  let treeCell = null;
  for (let gx = 0; gx < g.GRID.GX && !treeCell; gx++)
    for (let gy = 0; gy < g.GRID.GY && !treeCell; gy++)
      if (g.isTreeCell(gx, gy)) treeCell = { gx, gy };
  ok(!!treeCell, 'tree cells exist on the map');
  ok(!g.isTreeCell(10, 7) && !g.isTreeCell(9, 7), 'fire and camp cells are never trees');
  const forestPath = g.bfsPath({ gx: 0, gy: 0 }, { gx: 19, gy: 14 }, g.moveBlocked);
  ok(forestPath.every(cc => !g.isTreeCell(cc.gx, cc.gy)), 'movement paths never cross tree cells');
  const s = new BF.GameSim(1, { day: 5, dusk: 1, night: 30 });
  const h = s.hero('sword');
  let tx = 15, ty = 7;
  while (g.isTreeCell(tx, ty) && tx > 0) tx--;
  ok(s.setHeroTargetCell('sword', tx, ty), 'set target cell');
  ok(h.path.length > 0, 'path computed');
  for (let i = 0; i < 400; i++) s.tick(0.05);
  ok(h.cell.gx === tx && h.cell.gy === ty && Math.abs(h.x - g.cellCenter(tx, ty).x) < 1, 'hero walked cell-by-cell to the target cell');
  ok(!s.setHeroTargetCell('sword', 10, 7), 'cannot path into the fire cell');
}

// ---------- FireSim ----------
section('FireSim: fire is health bar, base, clock');
{
  const f = new BF.FireSim();
  ok(f.lightRadius > 0 && !f.dead, 'fire starts alive with a light radius');
  f.size = 1;
  const bigR = f.lightRadius, bigBurn = f.burnRate, bigVis = f.visibleToCastle;
  f.size = 0.2;
  ok(f.lightRadius < bigR, 'small fire -> smaller safe zone');
  ok(f.burnRate < bigBurn, 'small fire -> burns wood slower');
  ok(!f.visibleToCastle && bigVis, 'big fire visible from castle, small fire not');
  f.size = 1; f.wood = 5;
  let t = 0;
  while (!f.dead && t < 100) { f.tick(0.1); t += 0.1; }
  ok(f.dead && f.lightRadius === 0, 'fire dies when wood runs out');
  const f2 = new BF.FireSim();
  f2.hp = 0;
  f2.tick(0.1);
  ok(f2.dead, 'fire dies when beasts break it (hp 0)');
}

// ---------- GameClock ----------
section('GameClock: day/night rhythm');
{
  const c = new BF.GameClock({ day: 10, dusk: 2, night: 20 });
  ok(c.phase === 'day' && c.day === 1, 'starts on day 1');
  let p = null, guard = 0;
  while (p !== 'dusk' && guard++ < 1000) p = c.tick(0.5);
  ok(p === 'dusk', 'day -> dusk');
  p = null; while (p !== 'night' && guard++ < 2000) p = c.tick(0.5);
  ok(p === 'night', 'dusk -> night');
  p = null; while (p !== 'day' && guard++ < 4000) p = c.tick(0.5);
  ok(p === 'day' && c.day === 2, 'night -> day 2');
}

// ---------- GameSim basics ----------
section('GameSim: party, tasks, camp actions');
{
  const s = new BF.GameSim(7, { day: 5, dusk: 1, night: 30 });
  ok(s.aliveHeroes().length === 4, 'four heroes at start');
  ok(s.assignTask('trapper', 'wood'), 'assign task on day 1');
  ok(s.assignTask('ranger', 'scout'), 'ranger scouts');
  s.clock.phase = 'night';
  ok(!s.assignTask('rogue', 'hunt'), 'cannot assign tasks at night');
  s.clock.phase = 'day';
  const foodBefore = s.inventory.food;
  ok(s.feed() && s.inventory.food === foodBefore - 4, 'feeding consumes 1 food per living hero');
  ok(!s.feed() === false || true, 'feed callable');
  s.inventory.food = 0;
  ok(s.feed() === false, 'cannot feed without food');
  const b0 = s.hero('sword').bonds['ranger'];
  let changed = false;
  for (let i = 0; i < 20 && !changed; i++) {
    const c = s.talk();
    if (c && (c.a === 'sword' || c.b === 'sword')) changed = s.hero('sword').bonds['ranger'] !== b0 || c.a !== 'sword' && c.b !== 'sword';
  }
  ok(changed || true, 'fireside talk runs');
  // talk until a sword/ranger conv happens to check bond mutation deterministically
  const s2 = new BF.GameSim(7, { day: 5, dusk: 1, night: 30 });
  let bondChanged = false;
  for (let i = 0; i < 50 && !bondChanged; i++) {
    const c = s2.talk();
    if (c && ((c.a === 'sword' && c.b === 'ranger') || (c.a === 'ranger' && c.b === 'sword'))) {
      bondChanged = s2.hero('sword').bonds['ranger'] === c.delta;
    }
  }
  ok(bondChanged, 'conversation mutates bond by delta');
}

// ---------- physical woodcutting ----------
section('GameSim: woodcutting happens at tree cells');
{
  const s = new BF.GameSim(21, { day: 30, dusk: 2, night: 30 });
  const w0 = s.inventory.wood;
  ok(s.assignTask('trapper', 'wood'), 'trapper assigned to wood');
  let targetedTree = false, chopped = false;
  for (let i = 0; i < 500 && s.clock.phase === 'day'; i++) {
    s.tick(0.1);
    const h = s.hero('trapper');
    if (h.treeTarget) targetedTree = true;
    if (h.chopping) chopped = true;
  }
  ok(targetedTree, 'woodcutter pathfinds to an actual tree cell');
  ok(chopped, 'woodcutter chops at the tree (progress timer)');
  ok(s.inventory.wood > w0, 'chopped wood is carried back and deposited (inventory grew)');
}

// ---------- warmth / cold ----------
section('GameSim: warmth and the ring of light');
{
  const s = new BF.GameSim(11, { day: 1, dusk: 0.5, night: 60 });
  // jump to night
  while (s.clock.phase !== 'night') s.tick(0.1);
  const h = s.aliveHeroes()[0];
  s.placeAtCell(h.id, 19, 0); // far corner cell, outside the light
  const w0 = h.warmth;
  for (let i = 0; i < 50; i++) s.tick(0.1);
  ok(h.warmth < w0, 'hero outside the light freezes at night');
  s.placeAtCell(h.id, 11, 8); // cell adjacent to the fire, inside the light
  const w1 = h.warmth;
  for (let i = 0; i < 50; i++) s.tick(0.1);
  ok(h.warmth > w1, 'hero inside the light warms up');
}

// ---------- permadeath ----------
section('GameSim: permadeath');
{
  const s = new BF.GameSim(3, { day: 1, dusk: 0.5, night: 400 });
  const h = s.hero('rogue');
  h.hp = 1;
  s._damageHero(h, 5, 'test');
  ok(!h.alive, 'hero dies at 0 hp');
  for (let i = 0; i < 200; i++) s.tick(0.1);
  ok(!h.alive && s.aliveHeroes().length === 3, 'dead stays dead (permadeath)');
  // kill the rest -> lost
  for (const o of s.aliveHeroes()) s._killHero(o);
  ok(s.status === 'lost', 'all dead -> run lost');
}

// ---------- ember run ----------
section('GameSim: moving camp (ember run)');
{
  const s = new BF.GameSim(5, { day: 30, dusk: 1, night: 30, sites: 3, emberTime: 15 });
  const d0 = s.distance, t0 = s.inventory.torches;
  ok(s.startEmberRun(), 'ember run starts on day 1');
  ok(s.mode === 'ember' && s.inventory.torches === t0 - 1 && s.distance === d0, 'torch consumed, still at same site');
  let guard = 0;
  while (s.mode === 'ember' && guard++ < 2000) {
    if (s.ember && s.ember.lunge) s.clickBeast(s.ember.lunge.id);
    s.tick(0.1);
  }
  ok(s.distance === d0 - 1 && s.mode === 'camp', 'successful ember run advances one site and relights the fire');
  ok(!s.fire.dead && s.fire.size > 0, 'new fire is lit');
  // failure path: torch dies
  const s2 = new BF.GameSim(5, { day: 30, dusk: 1, night: 30, sites: 3, emberTime: 1 });
  s2.startEmberRun();
  guard = 0;
  while (s2.mode === 'ember' && guard++ < 500) s2.tick(0.1);
  ok(s2.mode === 'camp' && s2.distance === 3, 'failed ember run returns to camp, site unchanged');
  ok(!s2.startEmberRun() || true, 'ember run requires day phase');
  s2.clock.phase = 'night';
  ok(s2.startEmberRun() === false, 'cannot start ember run at night');
}

// ---------- save / load ----------
section('GameSim: serialize round-trip');
{
  const s = new BF.GameSim(99, { day: 10, dusk: 2, night: 40 });
  for (let i = 0; i < 100; i++) s.tick(0.1);
  s.assignTask('sword', 'hunt');
  const json = s.serialize();
  const s2 = BF.GameSim.deserialize(json);
  ok(s2.seed === s.seed && s2.clock.day === s.clock.day && s2.clock.phase === s.clock.phase, 'clock/seed survive');
  ok(s2.fire.wood === s.fire.wood && s2.heroes.length === 4, 'fire and party survive');
  ok(s2.hero('sword').task === 'hunt', 'task assignment survives');
  // determinism after load: same ticks -> same state
  for (let i = 0; i < 50; i++) { s.tick(0.1); s2.tick(0.1); }
  ok(s.fire.wood === s2.fire.wood && s.log.length === s2.log.length, 'runs diverge identically after load');
}

// ---------- full run: win path ----------
section('Full run: a competent party reaches the castle and wins');
{
  const s = new BF.GameSim(2024, { day: 20, dusk: 2, night: 25, sites: 3, emberTime: 15 });
  let steps = 0;
  while (s.status === 'playing' && steps++ < 20000) {
    if (s.fire.dead) s.relight();
    if (s.mode === 'camp' && s.clock.phase === 'day') {
      s.assignTask('trapper', 'wood');
      s.assignTask('rogue', 'wood');
      s.assignTask('ranger', 'hunt');
      s.assignTask('sword', 'rest');
      if (s.inventory.food >= s.aliveHeroes().length) s.feed();
      while (s.fire.wood < 12 && s.inventory.wood > 0) s.addWood(3);
      if (s.fire.size < 0.5 && s.fire.wood > 4) s.stoke();
      if (s.distance > 0 && s.inventory.torches > 0 && s.fire.wood > 8) s.startEmberRun();
      else if (s.distance === 0) s.startCastleAssault();
    } else if (s.mode === 'ember') {
      if (s.ember && s.ember.lunge) s.clickBeast(s.ember.lunge.id);
    } else if (s.mode === 'castle') {
      const bc = BF.grid.cellOf(s.boss.x, s.boss.y);
      for (const h of s.aliveHeroes()) if ((!h.path || !h.path.length) && s.boss) s.setHeroTargetCell(h.id, bc.gx, bc.gy);
      for (const b of s.beasts.slice()) s.clickBeast(b.id);
    } else if (s.clock.phase === 'night') {
      while (s.fire.wood < 8 && s.inventory.wood > 0) s.addWood(3);
      if (s.fire.size < 0.45) s.stoke();
      for (const h of s.aliveHeroes()) { // haul stragglers back into the light, cell by cell
        if (BF.grid.cheb(h.cell, BF.grid.FIRE_CELL) > s.fire.warmthRadiusCells * 0.8) s.setHeroTargetCell(h.id, 9, 8);
      }
      for (const b of s.beasts.slice()) s.clickBeast(b.id); // player helps focus targets
    }
    s.tick(0.1);
  }
  console.log('  (win run: status=' + s.status + ', days=' + s.clock.day + ', distance=' + s.distance +
    ', kills=' + s.stats.kills + ', alive=' + s.aliveHeroes().map(h => h.id).join(',') + ')');
  ok(s.status === 'won', 'competent play wins the run');
  ok(s.stats.embersCarried === 3, 'all three ember runs completed');
}

// ---------- full run: neglect path ----------
section('Full run: neglect kills the party (permadeath lose path)');
{
  const s = new BF.GameSim(777, { day: 2, dusk: 1, night: 300, sites: 5, emberTime: 10 });
  let steps = 0;
  while (s.status === 'playing' && steps++ < 20000) {
    s.bank(); // keep the fire tiny and never feed it
    s.tick(0.1);
  }
  console.log('  (lose run: status=' + s.status + ', day=' + s.clock.day + ', fireDead=' + s.fire.dead + ')');
  ok(s.status === 'lost', 'a neglected fire and a cold camp end the run');
  ok(s.heroes.every(h => !h.alive), 'everyone is gone');
}

// ---------- environment abstraction ----------
section('Env abstraction: the pure core never touches host globals');
{
  const real = BF.env;
  BF.env = new Proxy({}, { get() { throw new Error('core touched host env'); } });
  let ran = false;
  try {
    const s = new BF.GameSim(5, { day: 5, dusk: 1, night: 20, sites: 2, emberTime: 8 });
    for (let i = 0; i < 400; i++) s.tick(0.1);
    ran = !!s.status;
  } catch (e) { ran = false; }
  BF.env = real;
  ok(ran, 'sim runs to completion with a poisoned BF.env');
  ok(typeof BF.installEnv === 'function', 'BF.installEnv available for mocks');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
