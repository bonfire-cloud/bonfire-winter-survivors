/* UI — Win95-style side panel. The DOM is built ONCE per run; refresh() only
 * updates text, bar widths, classes and disabled flags in place, so clicks are
 * never swallowed by a re-render. Browser only. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  const paneL = () => BF.env.document.getElementById('pane-left');
  const paneR = () => BF.env.document.getElementById('pane-right');
  const overlay = () => BF.env.document.getElementById('overlay');

  const TASK_SHORT = { wood: 'Wood', hunt: 'Hunt', scout: 'Scout', rest: 'Rest' };

  function barHtml(cls, lbl) {
    return '<div class="bar ' + cls + '"><div></div><span class="lbl">' + lbl + '</span></div>';
  }
  function setBar(el, f) {
    el.style.width = Math.max(0, Math.min(100, f * 100)).toFixed(1) + '%';
  }

  const UI = {
    actions: {},
    els: null,
    heroEls: [],
    logCount: -1,

    /* Build the static pane skeletons once: party left, everything else right. */
    build() {
      const L = paneL();
      const R = paneR();
      L.innerHTML = '<h3 id="el-partyh">PARTY</h3><div id="el-heroes"></div>';
      R.innerHTML =
        '<h3>SITUATION</h3>' +
        '<div class="row"><span>Day</span><b id="el-day"></b></div>' +
        '<div class="row"><span>Castle</span><b id="el-castle"></b></div>' +
        '<div class="row"><span>Seed</span><b id="el-seed"></b></div>' +
        '<h3>BONFIRE <span id="el-firedead" class="warn" style="display:none">(DEAD)</span></h3>' +
        '<div class="row"><span>Wood in fire</span><b id="el-fwood"></b></div>' +
        '<div class="row"><span>Size</span><b id="el-fsize"></b></div>' +
        '<div class="row"><span>Light radius</span><b id="el-flight"></b></div>' +
        '<div class="row"><span>Fire integrity</span><b id="el-fhp"></b></div>' +
        '<div class="row warn" id="el-fvisrow" style="display:none"><span>!</span><b>visible from the castle</b></div>' +
        '<div>' +
        '<button id="b-stoke">Stoke</button>' +
        '<button id="b-bank">Bank</button>' +
        '<button id="b-wood" title="Move 1 wood from Supplies into the fire">supplies→fire +1</button>' +
        '<button id="b-woodall" title="Move all wood from Supplies into the fire">all</button>' +
        '<button id="b-relight" title="Relight a dead fire: costs 1 ember, or 3 wood">Relight</button>' +
        '</div>' +
        '<h3>SUPPLIES</h3>' +
        '<div class="row"><span>Wood</span><b id="el-wood"></b></div>' +
        '<div class="row"><span>Food</span><b id="el-food"></b></div>' +
        '<div class="row"><span>Blankets</span><b id="el-blankets"></b></div>' +
        '<div class="row"><span>Torches</span><b id="el-torches"></b></div>' +
        '<div class="row"><span>Embers</span><b id="el-embers"></b></div>' +
        '<h3>CAMP</h3>' +
        '<div>' +
        '<button id="b-feed">Feed party</button>' +
        '<button id="b-talk">Fireside talk</button>' +
        '<button id="b-ember" title="Abandon this fire and carry embers to the next campsite">Carry embers (move camp)</button>' +
        '<button id="b-castle">ASSAULT THE CASTLE</button>' +
        '<button id="b-skip" title="Skip to dusk">Wait for dusk</button>' +
        '</div>' +
        '<h3>LOG</h3>' +
        '<div id="log"></div>';

      const qL = (s) => L.querySelector(s);
      const qR = (s) => R.querySelector(s);
      this.els = {
        day: qR('#el-day'), castle: qR('#el-castle'), seed: qR('#el-seed'),
        firedead: qR('#el-firedead'), fwood: qR('#el-fwood'), fsize: qR('#el-fsize'),
        flight: qR('#el-flight'), fhp: qR('#el-fhp'), fvisrow: qR('#el-fvisrow'),
        wood: qR('#el-wood'), food: qR('#el-food'), blankets: qR('#el-blankets'),
        torches: qR('#el-torches'), embers: qR('#el-embers'),
        partyh: qL('#el-partyh'), heroes: qL('#el-heroes'), log: qR('#log'),
        stoke: qR('#b-stoke'), bank: qR('#b-bank'), wood: qR('#b-wood'), woodall: qR('#b-woodall'), relight: qR('#b-relight'),
        feed: qR('#b-feed'), talk: qR('#b-talk'), ember: qR('#b-ember'), castleBtn: qR('#b-castle'), skip: qR('#b-skip'),
      };
      const A = UI.actions;
      this.els.stoke.onclick = () => A.stoke();
      this.els.bank.onclick = () => A.bank();
      this.els.wood.onclick = () => A.wood();
      this.els.woodall.onclick = () => A.woodall();
      this.els.relight.onclick = () => A.relight();
      this.els.feed.onclick = () => A.feed();
      this.els.talk.onclick = () => A.talk();
      this.els.ember.onclick = () => A.ember();
      this.els.castleBtn.onclick = () => A.castle();
      this.els.skip.onclick = () => A.skip();
    },

    /* (Re)build the per-hero cards — called once per run, not per frame. */
    reset(sim) {
      const c = this.els.heroes;
      c.innerHTML = '';
      this.heroEls = sim.heroes.map(h => {
        const d = BF.env.document.createElement('div');
        d.className = 'hero';
        d.dataset.hero = h.id;
        d.innerHTML =
          '<div class="row"><b></b><span class="hh-status"></span></div>' +
          barHtml('hp', 'hp') + barHtml('warmth', 'warm') + barHtml('hunger', 'food') + barHtml('morale', 'morale') +
          '<div class="tasks"></div>' +
          '<div class="watchrow" style="display:none"><span style="font-size:10px">task: <span class="hh-task"></span></span>' +
          '<label><input type="checkbox" class="hh-watch"> watch</label></div>' +
          '<div class="row"><span class="hh-bonds" style="font-size:10px"></span><button class="hh-blanket">blanket</button></div>';
        d.querySelector('b').textContent = h.name;
        c.appendChild(d);
        const q = (s) => d.querySelector(s);
        const tasks = q('.tasks');
        const taskBtns = BF.DATA.tasks.map(t => {
          const b = BF.env.document.createElement('button');
          b.className = 'taskbtn';
          b.textContent = TASK_SHORT[t.id];
          b.dataset.task = h.id;
          b.dataset.val = t.id;
          b.onclick = () => UI.actions.assign(h.id, t.id);
          tasks.appendChild(b);
          return { id: t.id, el: b };
        });
        const watch = q('.hh-watch');
        watch.onchange = () => UI.actions.watch(h.id, watch.checked);
        const blanket = q('.hh-blanket');
        blanket.onclick = () => UI.actions.blanket(h.id);
        d.onclick = (ev) => {
          if (!ev.target.closest('button,input,label')) UI.actions.select(h.id);
        };
        return {
          root: d,
          status: q('.hh-status'),
          bars: {
            hp: q('.bar.hp > div'), warmth: q('.bar.warmth > div'),
            hunger: q('.bar.hunger > div'), morale: q('.bar.morale > div'),
          },
          taskRow: tasks, taskBtns,
          watchRow: q('.watchrow'), watch, taskLbl: q('.hh-task'),
          bonds: q('.hh-bonds'), blanket,
        };
      });
      this.logCount = -1;
    },

    /* In-place update. Never rebuilds nodes the user may be clicking. */
    refresh(sim, selectedId) {
      const E = this.els;
      if (!E) return;
      const phase = sim.effPhase();
      const inv = sim.inventory;
      const dayCamp = sim.mode === 'camp' && phase === 'day';

      E.day.textContent = sim.clock.day + ' (' + phase + ')';
      E.castle.textContent = sim.distance <= 0 ? 'at the gates' : sim.distance + ' campsites away';
      E.seed.textContent = sim.seed;
      E.firedead.style.display = sim.fire.dead ? '' : 'none';
      E.fwood.textContent = sim.fire.wood.toFixed(1);
      E.fsize.textContent = Math.round(sim.fire.size * 100) + '%';
      E.flight.textContent = sim.fire.lightRadiusCells + ' cells';
      E.fhp.textContent = Math.max(0, Math.round(sim.fire.hp));
      E.fvisrow.style.display = sim.fire.visibleToCastle ? '' : 'none';
      E.wood.textContent = inv.wood;
      E.food.textContent = inv.food;
      E.blankets.textContent = inv.blankets;
      E.torches.textContent = inv.torches;
      E.embers.textContent = inv.embers;

      E.stoke.disabled = sim.fire.dead;
      E.bank.disabled = sim.fire.dead;
      E.relight.disabled = !sim.fire.dead;
      E.wood.disabled = inv.wood <= 0;
      E.woodall.disabled = inv.wood <= 0;
      E.feed.disabled = inv.food < sim.aliveHeroes().length;
      E.ember.style.display = dayCamp ? '' : 'none';
      E.skip.style.display = dayCamp ? '' : 'none';
      E.castleBtn.style.display = dayCamp && sim.distance <= 0 ? '' : 'none';
      E.ember.disabled = inv.torches <= 0 || sim.distance <= 0 || sim.fire.dead;
      E.partyh.textContent = dayCamp ? 'PARTY — assign day tasks' : 'PARTY';

      sim.heroes.forEach((h, i) => {
        const he = this.heroEls[i];
        if (!he) return;
        he.root.classList.toggle('dead', !h.alive);
        he.root.classList.toggle('selected', h.id === selectedId);
        he.status.textContent = h.role + (h.alive ? '' : ' — dead');
        if (!h.alive) return;
        setBar(he.bars.hp, h.hp / h.maxHp);
        setBar(he.bars.warmth, h.warmth / 100);
        setBar(he.bars.hunger, h.hunger / 100);
        setBar(he.bars.morale, h.morale / 100);
        he.taskRow.style.display = dayCamp ? '' : 'none';
        he.watchRow.style.display = dayCamp ? 'none' : '';
        he.taskBtns.forEach(tb => tb.el.classList.toggle('cur', h.task === tb.id));
        he.watch.checked = h.watching;
        he.taskLbl.textContent = h.task;
        he.bonds.textContent = 'bonds: ' + Object.entries(h.bonds)
          .map(([k, v]) => k + (v >= 0 ? '+' : '') + v).join(' ');
        he.blanket.disabled = inv.blankets <= 0;
      });

      if (sim.log.length !== this.logCount) {
        if (this.logCount < 0 || sim.log.length < this.logCount) {
          E.log.textContent = sim.log.slice(-40).join('\n');
        } else {
          E.log.textContent += (this.logCount > 0 ? '\n' : '') + sim.log.slice(this.logCount).join('\n');
        }
        this.logCount = sim.log.length;
        E.log.scrollTop = E.log.scrollHeight;
      }
    },

    showTitle(hasSave, onNew, onContinue) {
      const o = overlay();
      o.style.display = 'flex';
      o.innerHTML =
        '<div class="box">' +
        '<div class="dlgtitle"><span>BONFIRE: WINTER SURVIVORS — Setup</span><span class="dlgx">✕</span></div>' +
        '<img class="dlgimg" src="cover-16c.png" alt="Bonfire: Winter Survivors box art (16 colours)">' +
        '<h1>BONFIRE<br>WINTER SURVIVORS</h1>' +
        '<p>Four survivors. One frozen valley. A castle on the hill that is lit every night — ' +
        'and something in the treeline with glowing eyes that only firelight keeps back.</p>' +
        '<p>The bonfire is your health bar, your base, and your clock. Split the party by day. ' +
        'Defend the ring of light by night. Carry embers through the dark to move camp. ' +
        'Death is permanent.</p>' +
        '<p style="font-size:10px;color:#555">486 DX/33 · 8 MB RAM · 4 MB VGA · CD-ROM · Windows 95 compatible · 3dfx support</p>' +
        '<button id="btn-new">NEW RUN</button>' +
        (hasSave ? '<button id="btn-cont">CONTINUE</button>' : '') +
        '</div>';
      o.querySelector('#btn-new').onclick = () => { o.style.display = 'none'; onNew(); };
      if (hasSave) o.querySelector('#btn-cont').onclick = () => { o.style.display = 'none'; onContinue(); };
    },

    showEnd(sim, onNew) {
      const o = overlay();
      const won = sim.status === 'won';
      o.style.display = 'flex';
      o.innerHTML =
        '<div class="box">' +
        '<div class="dlgtitle"><span>BONFIRE: WINTER SURVIVORS — ' + (won ? 'Victory' : 'Game Over') + '</span><span class="dlgx">✕</span></div>' +
        '<img class="dlgimg" src="cover-16c.png" alt="box art (16 colours)">' +
        '<h1>' + (won ? 'THE FIRE HOLDS' : 'THE VALLEY KEEPS ITS SURVIVORS') + '</h1>' +
        '<p>' + (won
          ? 'The thing in the castle is dead. Your fire burns on the last campsite, and the valley is quiet at last.'
          : 'The fire gutters out. The eyes close in. ' +
            sim.heroes.filter(h => !h.alive).map(h => h.name).join(', ') + ' did not make it.') + '</p>' +
        '<p>Days survived: <b>' + sim.clock.day + '</b> · Beasts slain: <b>' + sim.stats.kills + '</b> · ' +
        'Camps moved: <b>' + sim.stats.embersCarried + '</b> · Seed: <b>' + sim.seed + '</b></p>' +
        '<p style="font-size:10px;color:#555">PC Gamer: 9/10 — "One idea, tied through everything."</p>' +
        '<button id="btn-new">NEW RUN</button>' +
        '</div>';
      o.querySelector('#btn-new').onclick = () => { o.style.display = 'none'; onNew(); };
    },

    hideOverlay() { overlay().style.display = 'none'; },
  };

  BF.UI = UI;
})();
