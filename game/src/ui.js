/* UI — Win95-style side panel, overlays, log. Browser only. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  const panel = () => document.getElementById('panel');
  const overlay = () => document.getElementById('overlay');

  function bar(cls, val, max, lbl) {
    const pct = Math.max(0, Math.min(100, (val / max) * 100));
    return '<div class="bar ' + cls + '"><div style="width:' + pct + '%"></div><span class="lbl">' + lbl + '</span></div>';
  }

  const UI = {
    actions: {}, // set by main.js

    refresh(sim, selectedId) {
      const p = panel();
      const phase = sim.effPhase();
      const inv = sim.inventory;
      let html = '';

      html += '<h3>SITUATION</h3>';
      html += '<div class="row"><span>Day</span><b>' + sim.clock.day + ' (' + phase + ')</b></div>';
      html += '<div class="row"><span>Castle</span><b>' + (sim.distance <= 0 ? 'at the gates' : sim.distance + ' campsites away') + '</b></div>';
      html += '<div class="row"><span>Seed</span><b>' + sim.seed + '</b></div>';

      html += '<h3>BONFIRE ' + (sim.fire.dead ? '<span class="warn">(DEAD)</span>' : '') + '</h3>';
      html += '<div class="row"><span>Wood in fire</span><b>' + sim.fire.wood.toFixed(1) + '</b></div>';
      html += '<div class="row"><span>Size</span><b>' + (sim.fire.size * 100).toFixed(0) + '%</b></div>';
      html += '<div class="row"><span>Light radius</span><b>' + Math.round(sim.fire.lightRadius) + 'px</b></div>';
      html += '<div class="row"><span>Fire integrity</span><b>' + Math.max(0, Math.round(sim.fire.hp)) + '</b></div>';
      if (sim.fire.visibleToCastle) html += '<div class="row warn"><span>!</span><b>visible from the castle</b></div>';
      html += '<div>';
      html += '<button data-act="stoke" ' + (sim.fire.dead ? 'disabled' : '') + '>Stoke</button>';
      html += '<button data-act="bank" ' + (sim.fire.dead ? 'disabled' : '') + '>Bank</button>';
      html += '<button data-act="wood">+1 wood</button>';
      html += '<button data-act="relight" ' + (sim.fire.dead ? '' : 'disabled') + '>Relight</button>';
      html += '</div>';

      html += '<h3>SUPPLIES</h3>';
      html += '<div class="row"><span>Wood</span><b>' + inv.wood + '</b></div>';
      html += '<div class="row"><span>Food</span><b>' + inv.food + '</b></div>';
      html += '<div class="row"><span>Blankets</span><b>' + inv.blankets + '</b></div>';
      html += '<div class="row"><span>Torches</span><b>' + inv.torches + '</b></div>';
      html += '<div class="row"><span>Embers</span><b>' + inv.embers + '</b></div>';

      html += '<h3>PARTY</h3>';
      for (const h of sim.heroes) {
        html += '<div class="hero' + (h.alive ? '' : ' dead') + (h.id === selectedId ? ' selected' : '') + '" data-hero="' + h.id + '">';
        html += '<div class="row"><b>' + h.name + '</b><span>' + h.role + (h.alive ? '' : ' — dead') + '</span></div>';
        if (h.alive) {
          html += bar('hp', h.hp, h.maxHp, 'hp');
          html += bar('warmth', h.warmth, 100, 'warm');
          html += bar('hunger', h.hunger, 100, 'food');
          html += bar('morale', h.morale, 100, 'morale');
          if (sim.mode === 'camp' && phase === 'day') {
            html += '<select data-task="' + h.id + '">';
            for (const t of BF.DATA.tasks)
              html += '<option value="' + t.id + '"' + (h.task === t.id ? ' selected' : '') + '>' + t.label + '</option>';
            html += '</select>';
          } else {
            html += '<div class="row"><span>task: ' + h.task + '</span>';
            html += '<label><input type="checkbox" data-watch="' + h.id + '"' + (h.watching ? ' checked' : '') + '> watch</label></div>';
          }
          const bonds = Object.entries(h.bonds).map(([k, v]) => k + (v >= 0 ? '+' : '') + v).join(' ');
          html += '<div class="row"><span style="font-size:10px">bonds: ' + bonds + '</span>';
          html += '<button data-act="blanket" data-id="' + h.id + '" ' + (inv.blankets <= 0 ? 'disabled' : '') + '>blanket</button></div>';
        }
        html += '</div>';
      }

      html += '<h3>CAMP</h3>';
      html += '<div>';
      html += '<button data-act="feed" ' + (inv.food < sim.aliveHeroes().length ? 'disabled' : '') + '>Feed party</button>';
      html += '<button data-act="talk">Fireside talk</button>';
      if (sim.mode === 'camp' && phase === 'day') {
        html += '<button data-act="ember" ' + (inv.torches <= 0 || sim.distance <= 0 || sim.fire.dead ? 'disabled' : '') + '>Carry embers (move camp)</button>';
        if (sim.distance <= 0) html += '<button data-act="castle">ASSAULT THE CASTLE</button>';
        else html += '<button data-act="skip">Wait for dusk</button>';
      }
      html += '</div>';

      html += '<h3>LOG</h3>';
      html += '<div id="log">' + sim.log.slice(-40).map(l => escapeHtml(l)).join('\n') + '</div>';

      p.innerHTML = html;
      const logEl = document.getElementById('log');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;

      // wire events
      p.querySelectorAll('button[data-act]').forEach(b => {
        b.onclick = () => UI.actions[b.dataset.act] && UI.actions[b.dataset.act](b.dataset.id);
      });
      p.querySelectorAll('select[data-task]').forEach(s => {
        s.onchange = () => UI.actions.assign(s.dataset.task, s.value);
      });
      p.querySelectorAll('input[data-watch]').forEach(c => {
        c.onchange = () => UI.actions.watch(c.dataset.watch, c.checked);
      });
      p.querySelectorAll('.hero[data-hero]').forEach(d => {
        d.onclick = (ev) => { if (!ev.target.closest('button,select,input,label')) UI.actions.select(d.dataset.hero); };
      });
    },

    showTitle(hasSave, onNew, onContinue) {
      const o = overlay();
      o.style.display = 'flex';
      o.innerHTML =
        '<div class="box">' +
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

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  BF.UI = UI;
})();
