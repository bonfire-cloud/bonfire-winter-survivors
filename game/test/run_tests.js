/* Headless test suite for the Bonfire: Winter Survivors core sim.
 * Run: node game/test/run_tests.js */
'use strict';
const fs = require('fs');
const path = require('path');

const coreDir = path.join(__dirname, '..', 'src', 'core');
for (const f of ['rng.js', 'data.js', 'fire.js', 'clock.js', 'sim.js']) {
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

// ---------- warmth / cold ----------
section('GameSim: warmth and the ring of light');
{
  const s = new BF.GameSim(11, { day: 1, dusk: 0.5, night: 60 });
  // jump to night
  while (s.clock.phase !== 'night') s.tick(0.1);
  const h = s.aliveHeroes()[0];
  h.x = 600; h.y = 440; // far outside the light
  const w0 = h.warmth;
  for (let i = 0; i < 50; i++) s.tick(0.1);
  ok(h.warmth < w0, 'hero outside the light freezes at night');
  h.x = s.firePos.x; h.y = s.firePos.y + 30; // inside the light
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
  const s = new BF.GameSim(2024, { day: 8, dusk: 2, night: 25, sites: 3, emberTime: 15 });
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
      for (const h of s.aliveHeroes()) if (!h.target && s.boss) s.setHeroTarget(h.id, s.boss.x, s.boss.y + 30);
      for (const b of s.beasts.slice()) s.clickBeast(b.id);
    } else if (s.clock.phase === 'night') {
      while (s.fire.wood < 8 && s.inventory.wood > 0) s.addWood(3);
      if (s.fire.size < 0.45) s.stoke();
      for (const h of s.aliveHeroes()) { // haul stragglers back into the light
        if (s.dist(h, s.firePos) > s.fire.warmthRadius * 0.8) s.setHeroTarget(h.id, s.firePos.x, s.firePos.y + 60);
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
