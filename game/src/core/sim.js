/* GameSim — pure simulation core. No DOM; runs in the browser and in Node.
 * The world is an isometric grid (20x15 cells); heroes and beasts move
 * cell-by-cell along BFS paths. Every system feeds the fire. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  const W = 640, H = 480;
  const GRID = { GX: 20, GY: 15, TW: 32, TH: 16, OX: 320, OY: 96 };
  const FIRE_CELL = { gx: 10, gy: 7 };
  const HERO_SPEED = 80; // px/s along the grid path

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cellCenter(gx, gy) {
    return { x: GRID.OX + (gx - gy) * (GRID.TW / 2), y: GRID.OY + (gx + gy) * (GRID.TH / 2) };
  }
  function cellOf(x, y) {
    const rx = (x - GRID.OX) / (GRID.TW / 2);
    const ry = (y - GRID.OY) / (GRID.TH / 2);
    return {
      gx: clamp(Math.round((rx + ry) / 2), 0, GRID.GX - 1),
      gy: clamp(Math.round((ry - rx) / 2), 0, GRID.GY - 1),
    };
  }
  function cheb(a, b) { return Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy)); }
  function key(c) { return c.gx + ',' + c.gy; }

  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const CAMP_CELLS = [{ gx: 9, gy: 7 }, { gx: 11, gy: 7 }, { gx: 10, gy: 8 }, { gx: 10, gy: 6 }];

  /* Trees are real, choppable, blocking cells — deterministic per seed layout. */
  function isTreeCell(gx, gy) {
    if (gx === FIRE_CELL.gx && gy === FIRE_CELL.gy) return false;
    if (CAMP_CELLS.some(c => c.gx === gx && c.gy === gy)) return false;
    const border = gx === 0 || gy === 0 || gx === GRID.GX - 1 || gy === GRID.GY - 1;
    const h = hash2(gx + 31, gy + 17);
    return border ? h < 0.32 : h < 0.18;
  }

  function defaultBlocked(c) { return c.gx === FIRE_CELL.gx && c.gy === FIRE_CELL.gy; }
  function moveBlocked(c) { return defaultBlocked(c) || isTreeCell(c.gx, c.gy); }

  /* 4-directional BFS on the grid. isBlocked(cell) blocks; allowTarget lets the
   * final cell be a blocked cell (e.g. walk up to a tree / the fire). */
  function bfsPath(from, to, isBlocked, allowTarget) {
    isBlocked = isBlocked || defaultBlocked;
    if (key(from) === key(to)) return [];
    const parent = new Map([[key(from), null]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { gx: c.gx + dx, gy: c.gy + dy };
        if (n.gx < 0 || n.gy < 0 || n.gx >= GRID.GX || n.gy >= GRID.GY) continue;
        const isTarget = n.gx === to.gx && n.gy === to.gy;
        if (isBlocked(n) && !(allowTarget && isTarget)) continue;
        if (parent.has(key(n))) continue;
        parent.set(key(n), c);
        if (isTarget) {
          const path = [];
          let cur = n;
          while (cur) { path.unshift(cur); cur = parent.get(key(cur)); }
          path.shift();
          return path;
        }
        q.push(n);
      }
    }
    return [];
  }

  let beastCounter = 1;

  class GameSim {
    constructor(seed, opts) {
      opts = opts || {};
      this.seed = seed >>> 0;
      this.rng = new BF.RNG(this.seed);
      this.opts = Object.assign(
        { day: 60, dusk: 12, night: 110, sites: 5, emberTime: 25 },
        opts
      );
      this.clock = new BF.GameClock({ day: this.opts.day, dusk: this.opts.dusk, night: this.opts.night });
      this.fire = new BF.FireSim();
      this.firePos = cellCenter(FIRE_CELL.gx, FIRE_CELL.gy);
      this.inventory = { wood: 12, food: 8, blankets: 2, torches: 3, embers: 1 };
      const campCells = [{ gx: 9, gy: 7 }, { gx: 11, gy: 7 }, { gx: 10, gy: 8 }, { gx: 10, gy: 6 }];
      this.heroes = BF.DATA.heroes.map((h, i) => {
        const c = campCells[i];
        const p = cellCenter(c.gx, c.gy);
        return {
          id: h.id, name: h.name, role: h.role, color: h.color,
          maxHp: h.hp, hp: h.hp, atk: h.atk,
          warmth: 80, hunger: 70, morale: 60,
          alive: true,
          x: p.x, y: p.y, cell: { gx: c.gx, gy: c.gy }, path: [],
          task: 'rest', watching: true, atkCd: 0, late: false,
          carried: 0, chopping: false, chopT: 0, treeTarget: null,
          bonds: {},
        };
      });
      for (const a of this.heroes)
        for (const b of this.heroes) if (a.id !== b.id) a.bonds[b.id] = 0;
      this.beasts = [];
      this.spawnT = 4;
      this.mode = 'camp'; // camp | ember | castle
      this.distance = this.opts.sites;
      this.status = 'playing'; // playing | won | lost
      this.storm = false;
      this.castleSeen = false;
      this.ember = null;
      this.boss = null;
      this.time = 0;
      this.stats = { kills: 0, daysSurvived: 1, embersCarried: 0 };
      this.log = [];
      this.say('The fire is lit. Four survivors, one valley, a castle on the hill.');
      this.say('Day ' + this.clock.day + '. Assign the party, then wait for dusk.');
    }

    say(msg) {
      this.log.push(msg);
      if (this.log.length > 200) this.log.shift();
    }

    aliveHeroes() { return this.heroes.filter(h => h.alive); }
    hero(id) { return this.heroes.find(h => h.id === id); }
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    effPhase() { return this.mode === 'castle' ? 'night' : this.clock.phase; }

    // ---------- player actions ----------

    assignTask(id, task) {
      const h = this.hero(id);
      const t = BF.DATA.tasks.find(t => t.id === task);
      if (h && h.alive && t && this.mode === 'camp' && this.clock.phase === 'day') {
        h.task = task;
        this.say(h.name + ' will ' + t.label.toLowerCase() + ' today.');
        return true;
      }
      return false;
    }

    stoke() { this.fire.stoke(); this.say('You stoke the fire. It roars — and burns faster.'); }
    bank() { this.fire.bank(); this.say('You bank the fire down. Smaller, quieter, colder.'); }

    addWood(n) {
      if (n === undefined) n = 1;
      n = Math.min(n, this.inventory.wood);
      if (n <= 0) return false;
      this.inventory.wood -= n;
      this.fire.addWood(n);
      return true;
    }

    /* Relight a dead fire: costs 1 ember, or 3 wood if no embers remain. */
    relight() {
      if (!this.fire.dead) return false;
      if (this.inventory.embers > 0) {
        this.inventory.embers--;
        this.fire.wood = Math.max(this.fire.wood, 6);
      } else if (this.inventory.wood >= 3) {
        this.inventory.wood -= 3;
        this.fire.wood += 3;
      } else {
        this.say('Nothing left to relight the fire with.');
        return false;
      }
      this.fire.dead = false;
      this.fire.hp = 100;
      this.fire.size = 0.3;
      this.say('You strike a spark and the fire catches again. It will not burn high yet.');
      return true;
    }

    feed() {
      const alive = this.aliveHeroes();
      if (this.inventory.food < alive.length) { this.say('Not enough food for everyone.'); return false; }
      this.inventory.food -= alive.length;
      for (const h of alive) {
        h.hunger = Math.min(100, h.hunger + 35);
        h.morale = Math.min(100, h.morale + 5);
      }
      this.say('You split the food around the fire.');
      return true;
    }

    giveBlanket(id) {
      const h = this.hero(id);
      if (!h || !h.alive || this.inventory.blankets <= 0) return false;
      this.inventory.blankets--;
      h.warmth = Math.min(100, h.warmth + 30);
      h.morale = Math.min(100, h.morale + 8);
      this.say(h.name + ' gets a blanket.');
      return true;
    }

    setWatch(id, on) {
      const h = this.hero(id);
      if (h && h.alive) h.watching = !!on;
    }

    /* Cell-by-cell movement: click a grid cell, the hero walks the BFS path.
     * Trees and the fire block; clicking one paths up to it instead. */
    setHeroTargetCell(id, gx, gy) {
      const h = this.hero(id);
      if (!h || !h.alive) return false;
      const target = {
        gx: clamp(Math.round(gx), 0, GRID.GX - 1),
        gy: clamp(Math.round(gy), 0, GRID.GY - 1),
      };
      if (target.gx === FIRE_CELL.gx && target.gy === FIRE_CELL.gy) return false;
      let p = bfsPath(h.cell, target, moveBlocked, true);
      if (p.length && moveBlocked(p[p.length - 1])) p.pop(); // stop adjacent to a blocked cell
      h.path = p;
      return true;
    }

    /* Pixel-space convenience (used by tests): targets the cell under x,y. */
    setHeroTarget(id, x, y) {
      const c = cellOf(x, y);
      return this.setHeroTargetCell(id, c.gx, c.gy);
    }

    /* Teleport a hero to a cell (tests). */
    placeAtCell(id, gx, gy) {
      const h = this.hero(id);
      if (!h) return;
      h.cell = { gx, gy };
      const p = cellCenter(gx, gy);
      h.x = p.x; h.y = p.y;
      h.path = [];
    }

    /* Fireside conversation: builds a bond or a grudge between two heroes. */
    talk() {
      const alive = this.aliveHeroes();
      if (alive.length < 2) return null;
      const conv = this.rng.pick(BF.DATA.conversations);
      const a = this.hero(conv.a), b = this.hero(conv.b);
      if (!a.alive || !b.alive) return null;
      a.bonds[b.id] = Math.max(-100, Math.min(100, a.bonds[b.id] + conv.delta));
      b.bonds[a.id] = Math.max(-100, Math.min(100, b.bonds[a.id] + conv.delta));
      const line = conv.line
        .replace('{a}', a.name.split(' ')[0])
        .replace('{b}', b.name.split(' ')[0]);
      this.say('Fireside — ' + line + (conv.delta >= 0 ? '  [bond +' + conv.delta + ']' : '  [grudge ' + conv.delta + ']'));
      return conv;
    }

    /* Moving camp: abandon the safe fire, carry embers through the dark. */
    startEmberRun() {
      if (this.mode !== 'camp' || this.clock.phase !== 'day' || this.distance <= 0) return false;
      if (this.inventory.torches <= 0) { this.say('No torches to carry the embers.'); return false; }
      if (this.fire.dead) { this.say('The fire is dead. You can\'t carry embers from ash.'); return false; }
      this.inventory.torches--;
      this.mode = 'ember';
      this.ember = { t: this.opts.emberTime, progress: 0, lungeT: 2, lunge: null };
      this.say('You bank the fire, scoop up embers, and step into the dark...');
      return true;
    }

    /* Player strikes a beast (night defense or an ember-run lunge). */
    clickBeast(id) {
      let b = this.beasts.find(x => x.id === id);
      if (!b && this.ember && this.ember.lunge && this.ember.lunge.id === id) b = this.ember.lunge;
      if (!b) return false;
      b.hp -= 12;
      if (b.hp <= 0) this._killBeast(b);
      return true;
    }

    startCastleAssault() {
      if (this.mode === 'camp' && this.distance <= 0 && this.clock.phase === 'day') {
        this.mode = 'castle';
        const bc = { gx: 10, gy: 3 };
        const p = cellCenter(bc.gx, bc.gy);
        const hp = 220 + this.clock.day * 20;
        this.boss = {
          id: 'boss', x: p.x, y: p.y, cell: bc, path: [], aiT: 0,
          hp, maxHp: hp, atk: 14, speed: 30, atkCd: 0, radius: 22,
        };
        this.spawnT = 2;
        this.say('The castle gates. The eyes come from everywhere. End it.');
        return true;
      }
      return false;
    }

    // ---------- tick ----------

    tick(dt) {
      if (this.status !== 'playing') return;
      dt = Math.min(dt, 0.25);
      this.time += dt;

      if (this.mode === 'ember') { this._tickEmber(dt); return; }

      if (this.mode === 'camp') {
        const phase = this.clock.tick(dt);
        if (phase) this._phaseChanged(phase);
      }

      this.fire.tick(dt);

      // A dead fire with no wood and no embers: the cold takes the camp.
      if (this.fire.dead && this.inventory.wood === 0 && this.inventory.embers === 0) {
        for (const h of this.aliveHeroes()) {
          h.warmth = Math.max(0, h.warmth - 3 * dt);
          if (h.warmth <= 0) this._damageHero(h, 8 * dt, 'freezes');
        }
      }

      this._tickHeroes(dt);
      this._tickBeasts(dt);
      this._checkEnd();
    }

    _phaseChanged(phase) {
      if (phase === 'dusk') this._resolveDay();
      if (phase === 'night') this._startNight();
      if (phase === 'day') {
        this.stats.daysSurvived = this.clock.day;
        this.storm = false;
        this.say('Day ' + this.clock.day + '. The fire still burns. Assign the party.');
        this._fireEvent(['day']);
      }
    }

    _resolveDay() {
      this.say('Dusk. The light goes amber over the snow.');
      for (const h of this.aliveHeroes()) {
        if (h.task === 'wood') {
          // wood is gathered physically at tree cells; deposit whatever was carried
          if (h.carried > 0) {
            this.inventory.wood += h.carried;
            this.say(h.name + ' brings ' + h.carried + ' carried wood back.');
          } else {
            this.say(h.name + ' found no time to chop wood.');
          }
          h.carried = 0;
          h.chopping = false;
          h.treeTarget = null;
        } else if (h.task === 'hunt') {
          let n = 2 + this.rng.int(0, 3);
          if (h.id === 'ranger') n = Math.round(n * 1.5);
          this.inventory.food += n;
          this.say(h.name + ' brings back ' + n + ' food.');
          if (this.rng.chance(0.25)) {
            h.hp -= 10;
            this.say(h.name + ' is hurt on the hunt (-10 hp).');
          }
        } else if (h.task === 'scout') {
          this.say(h.name + ' scouts toward the castle. ' + this.distance + ' campsites remain.');
          if (this.rng.chance(0.3)) {
            this.inventory.wood += 2;
            this.inventory.food += 2;
            this.say('A supply cache on the trail: +2 wood, +2 food.');
          }
          if (this.rng.chance(0.35)) h.late = true;
        } else {
          h.hp = Math.min(h.maxHp, h.hp + 20);
        }
        if (h.task !== 'scout' && this.rng.chance(0.15)) h.late = true;
        h.task = 'rest';
      }
      this._fireEvent(['dusk']);
    }

    _startNight() {
      this.say('Night ' + this.clock.day + '. The eyes come out. Defend the ring of light.');
      for (const h of this.aliveHeroes()) {
        if (h.late) {
          const edge = this._randomEdgeCell();
          h.cell = edge;
          const p = cellCenter(edge.gx, edge.gy);
          h.x = p.x; h.y = p.y; h.path = [];
          h.late = false;
          this.say(h.name + ' stumbles in out of the dark, barely ahead of the eyes.');
        }
      }
      if (this.fire.visibleToCastle) {
        this.castleSeen = true;
        this.say('Your fire burns high — the castle watch has seen it. They will not be pleased.');
      }
      this.spawnT = 2;
      this._fireEvent(['night']);
    }

    _randomEdgeCell() {
      if (this.rng.chance(0.5)) {
        return { gx: this.rng.int(0, GRID.GX - 1), gy: this.rng.chance(0.5) ? 0 : GRID.GY - 1 };
      }
      return { gx: this.rng.chance(0.5) ? 0 : GRID.GX - 1, gy: this.rng.int(0, GRID.GY - 1) };
    }

    _fireEvent(whenList) {
      const pool = BF.DATA.events.filter(e => e.when.some(w => whenList.includes(w)));
      if (!pool.length) return;
      const ev = this.rng.pick(pool);
      this.say('Event: ' + ev.text);
      ev.apply(this);
    }

    _moveAlongPath(e, speed, dt) {
      if (!e.path || !e.path.length) return;
      const next = e.path[0];
      const c = cellCenter(next.gx, next.gy);
      const d = Math.hypot(c.x - e.x, c.y - e.y);
      const step = speed * dt;
      if (d <= step) {
        e.x = c.x; e.y = c.y;
        e.cell = { gx: next.gx, gy: next.gy };
        e.path.shift();
      } else {
        e.x += ((c.x - e.x) / d) * step;
        e.y += ((c.y - e.y) / d) * step;
      }
    }

    _tickHeroes(dt) {
      const phase = this.effPhase();
      const night = phase === 'night';
      for (const h of this.heroes) {
        if (!h.alive) continue;
        h.hunger = Math.max(0, h.hunger - (night ? 0.5 : 0.25) * dt);

        this._moveAlongPath(h, HERO_SPEED, dt);
        h.cell = cellOf(h.x, h.y);

        if (this.mode === 'camp' && phase === 'day' && h.task === 'wood') this._tickWoodcutting(h, dt);

        const d = cheb(h.cell, FIRE_CELL);
        const inLight = !this.fire.dead && d <= this.fire.warmthRadiusCells;
        let coldRate, warmRate;
        if (night) { coldRate = 1.6 * (this.storm ? 1.5 : 1); warmRate = 6; }
        else { coldRate = 0.3; warmRate = 2; }
        if (inLight) h.warmth = Math.min(100, h.warmth + warmRate * dt);
        else h.warmth = Math.max(0, h.warmth - coldRate * dt);
        if (h.warmth <= 0 && night) this._damageHero(h, 4 * dt, 'freezes');

        // morale drifts toward bonds, hunger and warmth
        const others = this.aliveHeroes().filter(o => o.id !== h.id);
        const avgBond = others.length
          ? others.reduce((s, o) => s + h.bonds[o.id], 0) / others.length : 0;
        const target = 50 + avgBond * 0.3 - (h.hunger < 25 ? 15 : 0) - (h.warmth < 25 ? 15 : 0);
        h.morale = Math.max(0, Math.min(100, h.morale + (target - h.morale) * 0.02 * dt * 10));

        // auto-attack beasts on adjacent cells (watchers only)
        h.atkCd -= dt;
        if (h.watching && h.atkCd <= 0) {
          const b = this._adjacentBeast(h.cell);
          if (b) {
            h.atkCd = 0.8;
            const dmgMult = (0.8 + (h.morale / 100) * 0.4 + (avgBond / 100) * 0.2);
            b.hp -= h.atk * dmgMult;
            if (b.hp <= 0) this._killBeast(b);
          }
        }
        if (h.hp <= 0) this._killHero(h);
      }
    }

    /* Physical woodcutting: walk to a tree cell, chop, carry back to camp. */
    _tickWoodcutting(h, dt) {
      const g = BF.grid;
      if (h.chopping) {
        h.chopT -= dt;
        if (h.chopT <= 0) {
          h.chopping = false;
          let n = 2 + this.rng.int(0, 2);
          if (h.id === 'trapper') n = Math.round(n * 1.5);
          h.carried += n;
          this.say(h.name + ' chops ' + n + ' wood (' + h.carried + ' carried).');
        }
        return;
      }
      if (h.carried >= 6) {
        // haul the load back to the fire
        if (cheb(h.cell, FIRE_CELL) <= 1) {
          this.inventory.wood += h.carried;
          this.say(h.name + ' hauls ' + h.carried + ' wood back to camp.');
          h.carried = 0;
          h.treeTarget = null;
        } else if (!h.path.length) {
          h.path = bfsPath(h.cell, { gx: 9, gy: 7 }, moveBlocked, false);
        }
        return;
      }
      if (!h.treeTarget || cheb(h.cell, h.treeTarget) > 1) {
        if (!h.path.length) {
          const t = this._nearestTree(h.cell, h.id);
          if (t) {
            h.treeTarget = t;
            const p = bfsPath(h.cell, t, moveBlocked, true);
            if (p.length && moveBlocked(p[p.length - 1])) p.pop(); // stop adjacent to the tree
            h.path = p;
          }
        }
      }
      if (h.treeTarget && cheb(h.cell, h.treeTarget) <= 1 && !h.path.length) {
        h.chopping = true;
        h.chopT = 2;
      }
    }

    _nearestTree(fromCell, claimBy) {
      const g = BF.grid;
      let best = null, bd = Infinity;
      for (let gx = 0; gx < g.GRID.GX; gx++) {
        for (let gy = 0; gy < g.GRID.GY; gy++) {
          if (!isTreeCell(gx, gy)) continue;
          const claimed = this.heroes.some(o => o.alive && o.id !== claimBy &&
            o.treeTarget && o.treeTarget.gx === gx && o.treeTarget.gy === gy);
          if (claimed) continue;
          const d = cheb(fromCell, { gx, gy });
          if (d < bd) { bd = d; best = { gx, gy }; }
        }
      }
      return best;
    }

    _adjacentBeast(cell) {
      const all = this.boss && this.boss.hp > 0 ? this.beasts.concat([this.boss]) : this.beasts;
      let best = null, bd = 2;
      for (const b of all) {
        const d = cheb(cell, b.cell || cellOf(b.x, b.y));
        if (d <= 1 && d < bd) { bd = d; best = b; }
      }
      return best;
    }

    _damageHero(h, amount, cause) {
      h.hp -= amount;
      if (h.hp <= 0 && h.alive) this._killHero(h, cause);
    }

    _killHero(h, cause) {
      h.alive = false;
      h.hp = 0;
      this.say(h.name + ' is dead' + (cause ? ' — ' + cause : '') + '. There is no coming back.');
      if (this.aliveHeroes().length === 0) {
        this.status = 'lost';
        this.say('The fire gutters. The valley keeps its survivors.');
      }
    }

    _spawnBeast() {
      const edge = this._randomEdgeCell();
      const p = cellCenter(edge.gx, edge.gy);
      const day = this.clock.day;
      this.beasts.push({
        id: 'b' + beastCounter++,
        x: p.x, y: p.y, cell: { gx: edge.gx, gy: edge.gy }, path: [], aiT: 0,
        hp: 30 + day * 6, maxHp: 30 + day * 6,
        atk: 6 + day, speed: 26 + day * 2,
        atkCd: 0, radius: 12,
      });
    }

    _tickBeasts(dt) {
      const night = this.effPhase() === 'night';
      if (night && this.mode !== 'ember') {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this._spawnBeast();
          const day = this.clock.day;
          let interval = 9 - day * 0.7;
          if (this.fire.visibleToCastle && this.mode === 'camp') interval -= 2.5;
          if (this.mode === 'castle') interval = Math.min(interval, 4);
          this.spawnT = Math.max(2.5, interval);
        }
      }
      for (const b of this.beasts) {
        if (b.hp <= 0) continue;
        b.atkCd -= dt;
        b.aiT -= dt;
        if (b.aiT <= 0) {
          b.aiT = 0.4;
          const heroes = this.aliveHeroes();
          let target = null;
          if (heroes.length) {
            const prey = heroes.reduce((m, h) => (cheb(b.cell, h.cell) < cheb(b.cell, m.cell) ? h : m));
            if (cheb(b.cell, prey.cell) <= 3 || this.fire.dead || this.mode === 'castle') target = prey.cell;
            else if (!this.fire.dead) target = { gx: FIRE_CELL.gx, gy: FIRE_CELL.gy };
          } else if (!this.fire.dead) {
            target = { gx: FIRE_CELL.gx, gy: FIRE_CELL.gy };
          }
          if (target) {
            const p = bfsPath(b.cell, target, moveBlocked, true);
            if (p.length && moveBlocked(p[p.length - 1])) p.pop();
            b.path = p;
          }
        }
        this._moveAlongPath(b, b.speed, dt);
        b.cell = cellOf(b.x, b.y);
        if (b.atkCd <= 0) {
          const prey = this.aliveHeroes().find(h => cheb(b.cell, h.cell) <= 1);
          if (prey) {
            b.atkCd = 1;
            this._damageHero(prey, b.atk, 'mauled');
          } else if (!this.fire.dead && cheb(b.cell, FIRE_CELL) <= 1) {
            b.atkCd = 1;
            this.fire.hp -= b.atk;
            if (this.fire.hp <= 0) this.say('The beasts tear at the fire itself!');
          }
        }
      }
      this.beasts = this.beasts.filter(b => b.hp > 0);

      if (this.boss && this.boss.hp > 0) {
        const b = this.boss;
        b.atkCd -= dt;
        b.aiT -= dt;
        if (b.aiT <= 0) {
          b.aiT = 0.4;
          const heroes = this.aliveHeroes();
          if (heroes.length) {
            const prey = heroes.reduce((m, h) => (cheb(b.cell, h.cell) < cheb(b.cell, m.cell) ? h : m));
            b.path = bfsPath(b.cell, prey.cell, moveBlocked, false);
          }
        }
        this._moveAlongPath(b, b.speed, dt);
        b.cell = cellOf(b.x, b.y);
        if (b.atkCd <= 0) {
          const prey = this.aliveHeroes().find(h => cheb(b.cell, h.cell) <= 1);
          if (prey) {
            b.atkCd = 1.2;
            this._damageHero(prey, b.atk, 'slain by the castle thing');
          }
        }
      } else if (this.boss) {
        this.status = 'won';
        this.say('The thing in the castle falls. The valley is quiet. You survived.');
      }
    }

    _killBeast(b) {
      b.hp = 0;
      this.stats.kills++;
      if (this.ember && this.ember.lunge === b) this.ember.lunge = null;
      if (this.rng.chance(0.2)) {
        this.inventory.food += 1;
        this.say('The beast carries meat. +1 food.');
      }
    }

    _tickEmber(dt) {
      const e = this.ember;
      if (!e) { this.mode = 'camp'; return; }
      this.fire.tick(dt); // the old fire burns while you're gone
      e.t -= dt;
      e.progress += 9 * dt;
      e.lungeT -= dt;
      if (e.lungeT <= 0 && !e.lunge) {
        e.lunge = { id: 'lunge' + beastCounter++, hp: 20 + this.clock.day * 4, t: 1.5 };
        e.lungeT = 3;
        this.say('Something lunges at the torchlight!');
      }
      if (e.lunge) {
        e.lunge.t -= dt;
        if (e.lunge.t <= 0) {
          const alive = this.aliveHeroes();
          if (alive.length) this._damageHero(this.rng.pick(alive), 10, 'mauled in the dark');
          e.lunge = null;
        }
      }
      if (e.progress >= 100) {
        this.distance--;
        this.stats.embersCarried++;
        this.mode = 'camp';
        this.ember = null;
        this.fire.dead = false;
        this.fire.hp = Math.max(this.fire.hp, 40);
        this.fire.size = 0.35;
        this.fire.wood = Math.max(this.fire.wood, 6);
        this.say('You reach the next rise and strike the embers into a new fire.');
        if (this.distance <= 0) this.say('The castle is right there on the hill. One more push.');
      } else if (e.t <= 0) {
        this.mode = 'camp';
        this.ember = null;
        this.say('The torch gutters out. You crawl back to the old fire in the dark.');
      }
    }

    _checkEnd() {
      if (this.status !== 'playing') return;
      if (this.aliveHeroes().length === 0) this.status = 'lost';
    }

    // ---------- save / load ----------

    serialize() {
      return JSON.stringify({
        seed: this.seed, rngS: this.rng.s, time: this.time,
        dur: this.clock.d, emberTime: this.opts.emberTime,
        clock: { phase: this.clock.phase, t: this.clock.t, day: this.clock.day },
        fire: { wood: this.fire.wood, size: this.fire.size, hp: this.fire.hp, dead: this.fire.dead },
        firePos: this.firePos, inventory: this.inventory, heroes: this.heroes,
        beasts: this.beasts, spawnT: this.spawnT, mode: this.mode, distance: this.distance,
        status: this.status, storm: this.storm, castleSeen: this.castleSeen,
        ember: this.ember, boss: this.boss, stats: this.stats, log: this.log.slice(-50),
      });
    }

    static deserialize(json) {
      const o = typeof json === 'string' ? JSON.parse(json) : json;
      const sim = new GameSim(o.seed, Object.assign({}, o.dur || {}, { sites: o.distance, emberTime: o.emberTime || 25 }));
      sim.rng.s = o.rngS;
      sim.time = o.time;
      sim.clock.phase = o.clock.phase; sim.clock.t = o.clock.t; sim.clock.day = o.clock.day;
      Object.assign(sim.fire, o.fire);
      sim.firePos = o.firePos;
      sim.inventory = o.inventory;
      sim.heroes = o.heroes;
      sim.beasts = o.beasts;
      sim.spawnT = o.spawnT;
      sim.mode = o.mode;
      sim.distance = o.distance;
      sim.status = o.status;
      sim.storm = o.storm;
      sim.castleSeen = o.castleSeen;
      sim.ember = o.ember;
      sim.boss = o.boss;
      sim.stats = o.stats;
      sim.log = o.log || [];
      return sim;
    }
  }

  BF.GameSim = GameSim;
  BF.WORLD = { W, H };
  BF.grid = { GRID, FIRE_CELL, CAMP_CELLS, cellCenter, cellOf, cheb, bfsPath, clamp, hash2, isTreeCell, defaultBlocked, moveBlocked };
})();
