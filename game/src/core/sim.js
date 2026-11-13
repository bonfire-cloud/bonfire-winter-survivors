/* GameSim — pure simulation core. No DOM; runs in the browser and in Node
 * (tests). Every system feeds the fire. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  const W = 640, H = 480;
  const HERO_SPEED = 70;
  const MELEE_RANGE = 46;

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
      this.firePos = { x: W / 2, y: H / 2 + 10 };
      this.inventory = { wood: 12, food: 8, blankets: 2, torches: 3, embers: 1 };
      this.heroes = BF.DATA.heroes.map((h, i) => ({
        id: h.id, name: h.name, role: h.role, color: h.color,
        maxHp: h.hp, hp: h.hp, atk: h.atk,
        warmth: 80, hunger: 70, morale: 60,
        alive: true,
        x: this.firePos.x + (i - 1.5) * 46,
        y: this.firePos.y + 78 + (i % 2) * 24,
        task: 'rest', watching: true, target: null, atkCd: 0, late: false,
        bonds: {},
      }));
      for (const a of this.heroes)
        for (const b of this.heroes) if (a.id !== b.id) a.bonds[b.id] = 0;
      this.beasts = [];
      this.spawnT = 4;
      this.mode = 'camp'; // camp | ember | castle
      this.distance = this.opts.sites; // camp sites left until the castle
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
      if (h && h.alive && this.mode === 'camp' && this.clock.phase === 'day' &&
          BF.DATA.tasks.some(t => t.id === task)) {
        h.task = task;
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

    setHeroTarget(id, x, y) {
      const h = this.hero(id);
      if (h && h.alive) h.target = { x: Math.max(16, Math.min(W - 16, x)), y: Math.max(16, Math.min(H - 16, y)) };
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
        const hp = 220 + this.clock.day * 20;
        this.boss = { id: 'boss', x: this.firePos.x, y: this.firePos.y - 130, hp, maxHp: hp, atk: 14, speed: 22, atkCd: 0, radius: 22 };
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
          let n = 5 + this.rng.int(0, 5);
          if (h.id === 'trapper') n = Math.round(n * 1.5);
          this.inventory.wood += n;
          this.say(h.name + ' hauls back ' + n + ' wood.');
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
          const ang = this.rng.range(0, Math.PI * 2);
          h.x = Math.max(20, Math.min(W - 20, this.firePos.x + Math.cos(ang) * 290));
          h.y = Math.max(20, Math.min(H - 20, this.firePos.y + Math.sin(ang) * 250));
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

    _fireEvent(whenList) {
      const pool = BF.DATA.events.filter(e => e.when.some(w => whenList.includes(w)));
      if (!pool.length) return;
      const ev = this.rng.pick(pool);
      this.say('Event: ' + ev.text);
      ev.apply(this);
    }

    _tickHeroes(dt) {
      const phase = this.effPhase();
      const night = phase === 'night';
      for (const h of this.heroes) {
        if (!h.alive) continue;
        h.hunger = Math.max(0, h.hunger - (night ? 0.5 : 0.25) * dt);

        const d = this.dist(h, this.firePos);
        const inLight = !this.fire.dead && d <= this.fire.warmthRadius;
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

        // movement
        if (h.target) {
          const d = this.dist(h, h.target);
          if (d < 4) h.target = null;
          else {
            h.x += ((h.target.x - h.x) / d) * HERO_SPEED * dt;
            h.y += ((h.target.y - h.y) / d) * HERO_SPEED * dt;
          }
        }

        // auto-attack beasts in melee range (watchers only)
        h.atkCd -= dt;
        if (h.watching && h.atkCd <= 0) {
          const b = this._nearestBeast(h.x, h.y, MELEE_RANGE);
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
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(270, 320);
      const day = this.clock.day;
      this.beasts.push({
        id: 'b' + beastCounter++,
        x: Math.max(20, Math.min(W - 20, this.firePos.x + Math.cos(ang) * r)),
        y: Math.max(20, Math.min(H - 20, this.firePos.y + Math.sin(ang) * r)),
        hp: 30 + day * 6, maxHp: 30 + day * 6,
        atk: 6 + day, speed: 24 + day * 2,
        atkCd: 0, radius: 12,
      });
    }

    _nearestBeast(x, y, maxD) {
      let best = null, bd = maxD;
      const all = this.boss && this.boss.hp > 0 ? this.beasts.concat([this.boss]) : this.beasts;
      for (const b of all) {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
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
      const targets = this.aliveHeroes();
      for (const b of this.beasts) {
        if (b.hp <= 0) continue;
        b.atkCd -= dt;
        // prefer a hero standing in the dark near the beast, else the fire/party
        let tx, ty;
        const prey = targets.length ? targets.reduce((m, h) => (this.dist(b, h) < this.dist(b, m) ? h : m)) : null;
        if (prey && this.dist(b, prey) < 90 && (!this.fire.dead || this.mode === 'castle')) {
          tx = prey.x; ty = prey.y;
        } else if (!this.fire.dead) {
          tx = this.firePos.x; ty = this.firePos.y;
        } else if (prey) {
          tx = prey.x; ty = prey.y;
        } else continue;

        const d = Math.hypot(tx - b.x, ty - b.y);
        const reach = (b === this.boss ? 30 : 22);
        if (d > reach) {
          b.x += ((tx - b.x) / d) * b.speed * dt;
          b.y += ((ty - b.y) / d) * b.speed * dt;
        } else if (b.atkCd <= 0) {
          b.atkCd = 1;
          if (!this.fire.dead && this.dist(b, this.firePos) <= 22 && !(prey && this.dist(b, prey) < 26)) {
            this.fire.hp -= b.atk;
            if (this.fire.hp <= 0) this.say('The beasts tear at the fire itself!');
          } else if (prey && this.dist(b, prey) <= 30) {
            this._damageHero(prey, b.atk, 'mauled');
          }
        }
      }
      this.beasts = this.beasts.filter(b => b.hp > 0);
      if (this.boss) {
        const b = this.boss;
        if (b.hp > 0) {
          b.atkCd -= dt;
          const prey = targets.length ? targets[0] : null;
          if (prey) {
            const d = this.dist(b, prey);
            if (d > 30) {
              b.x += ((prey.x - b.x) / d) * b.speed * dt;
              b.y += ((prey.y - b.y) / d) * b.speed * dt;
            } else if (b.atkCd <= 0) {
              b.atkCd = 1.2;
              this._damageHero(prey, b.atk, 'slain by the castle thing');
            }
          }
        } else {
          this.status = 'won';
          this.say('The thing in the castle falls. The valley is quiet. You survived.');
        }
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
      if (this.aliveHeroes().length === 0) {
        this.status = 'lost';
      }
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
})();
