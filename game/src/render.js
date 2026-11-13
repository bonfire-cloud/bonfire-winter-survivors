/* Renderer — 640x480 canvas, isometric 20x15 grid, 8-bit-style pixel sprites
 * drawn from bitmap maps, per-cell darkness with glowing eyes, snow.
 * Browser only. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});
  const W = 640, H = 480;

  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // palette for sprite maps
  const SKIN = '#e8c8a0', HAND = '#c8c0b0', BOOT = '#4a3423', STEEL = '#dfe6f2';

  /* 12x12 hero bitmap; p=hat/hair, C=cloak, S=skin, A=hands, B=boots, W=sword */
  function heroMap(cloak, hat, sword, hood, beard) {
    const rows = [
      '....pppp....',
      hood ? '...ppppp...' : '...ppSSpp...',
      hood ? '...pSSSp...' : '...SSSSS...',
      beard ? '...SBBBS...' : '...SSSSS...',
      '..CCCCCC...',
      sword ? '.CCCAAWCC..' : '.CCCAAACC..',
      sword ? '..CCAWCC...' : '..CCAACC...',
      '..CCCCCC...',
      '..CCCCCC...',
      '..C.CC.C...',
      '..B....B...',
      '.BB....BB..',
    ];
    return rows.map(r => r
      .replaceAll('p', hat).replaceAll('C', cloak)
      .replaceAll('S', 'S').replaceAll('A', 'A').replaceAll('B', 'B').replaceAll('W', 'W'));
  }

  const HERO_SPRITES = {
    sword:   { map: heroMap('C', 'p', true, false, false), pal: { p: '#2e3440', C: '#9aa3b2', S: SKIN, A: HAND, B: BOOT, W: STEEL } },
    ranger:  { map: heroMap('C', 'p', false, false, false), pal: { p: '#c03020', C: '#c96f4a', S: SKIN, A: HAND, B: BOOT } },
    rogue:   { map: heroMap('C', 'p', false, true, false),  pal: { p: '#4a3f66', C: '#6a5a8a', S: SKIN, A: HAND, B: BOOT } },
    trapper: { map: heroMap('C', 'p', false, false, true),  pal: { p: '#5a4326', C: '#8a6f4d', S: SKIN, A: HAND, B: BOOT } },
  };

  const BEAST_MAP = [
    '..EE....EE..',
    '.DDDDDDDDDD.',
    'DDDDDDDDDDDD',
    'DDDDDDDDDDDD',
    '.DDDDDDDDDD.',
    '..DDDDDDDD..',
  ];
  const BEAST_PAL = { D: '#171a24', E: '#ffd050' };
  const BOSS_PAL = { D: '#3a1016', E: '#ff5040' };

  function drawSprite(ctx, map, pal, x, y, scale) {
    for (let r = 0; r < map.length; r++) {
      const row = map[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = pal[ch] || '#f0f';
        ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale);
      }
    }
  }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.t = 0;
      this.snow = [];
      for (let i = 0; i < 130; i++)
        this.snow.push({ x: BF.env.random() * W, y: BF.env.random() * H, v: 12 + BF.env.random() * 22, s: BF.env.random() * 6 });
    }

    draw(sim, selectedId, dt) {
      this.t += dt;
      const ctx = this.ctx;
      if (sim.mode === 'ember') this._drawEmber(sim, ctx);
      else this._drawCamp(sim, selectedId, ctx);
      this._drawSnow(ctx, dt);
    }

    _diamond(ctx, c, hw, hh) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - hh); ctx.lineTo(c.x + hw, c.y); ctx.lineTo(c.x, c.y + hh); ctx.lineTo(c.x - hw, c.y);
      ctx.closePath();
    }

    // ---------- camp / castle ----------
    _drawCamp(sim, selectedId, ctx) {
      const g = BF.grid;
      const fc = g.FIRE_CELL;
      const night = sim.effPhase() === 'night';
      const dusk = sim.effPhase() === 'dusk';
      const castleMode = sim.mode === 'castle';
      const rCells = sim.fire.lightRadiusCells;
      const fp = sim.firePos;

      // ground base
      ctx.fillStyle = night || castleMode ? '#161b28' : dusk ? '#3c3850' : '#9aa8bc';
      ctx.fillRect(0, 0, W, H);

      // isometric grid cells
      for (let gx = 0; gx < g.GRID.GX; gx++) {
        for (let gy = 0; gy < g.GRID.GY; gy++) {
          const c = g.cellCenter(gx, gy);
          const isFire = gx === fc.gx && gy === fc.gy;
          const d = g.cheb({ gx, gy }, fc);
          const lit = d <= rCells && !sim.fire.dead;
          let fill;
          if (night || castleMode) fill = (gx + gy) % 2 ? '#1c2230' : '#202636';
          else if (dusk) fill = (gx + gy) % 2 ? '#443f5c' : '#4a4566';
          else fill = lit ? ((gx + gy) % 2 ? '#ccd4de' : '#d8dfe6') : ((gx + gy) % 2 ? '#a8b4c6' : '#b2bdcc');
          ctx.fillStyle = fill;
          this._diamond(ctx, c, 16, 8);
          ctx.fill();
          // snow specks (deterministic per cell)
          if (hash2(gx, gy) > 0.55) {
            ctx.fillStyle = night || castleMode ? '#3a4458' : '#eef2f8';
            ctx.fillRect(c.x - 6 + hash2(gx + 9, gy) * 12, c.y - 4 + hash2(gx, gy + 9) * 8, 2, 2);
          }
          // trees are real grid cells (shared map with the sim)
          if (!isFire && g.isTreeCell(gx, gy)) this._tree(ctx, c.x, c.y, 0.9 + hash2(gx, gy + 5) * 0.4, night || castleMode);
        }
      }

      // castle on the hill, top right
      this._drawCastle(ctx, sim, night || castleMode);

      // per-cell darkness outside the ring of light
      if (night || dusk || castleMode) {
        for (let gx = 0; gx < g.GRID.GX; gx++) {
          for (let gy = 0; gy < g.GRID.GY; gy++) {
            const c = g.cellCenter(gx, gy);
            const d = g.cheb({ gx, gy }, fc);
            const a = night || castleMode
              ? Math.min(1, Math.max(0, (d - rCells) / 4)) * 0.93
              : Math.min(1, Math.max(0, (d - rCells) / 4)) * 0.5;
            if (a > 0.01) {
              ctx.fillStyle = 'rgba(3,5,20,' + a.toFixed(3) + ')';
              this._diamond(ctx, c, 16, 8);
              ctx.fill();
            }
          }
        }
        // dashed ring of light boundary
        if (!sim.fire.dead && rCells > 0) {
          ctx.strokeStyle = 'rgba(255,200,120,0.35)';
          ctx.setLineDash([5, 5]);
          for (let gx = 0; gx < g.GRID.GX; gx++)
            for (let gy = 0; gy < g.GRID.GY; gy++)
              if (g.cheb({ gx, gy }, fc) === rCells) { this._diamond(ctx, g.cellCenter(gx, gy), 16, 8); ctx.stroke(); }
          ctx.setLineDash([]);
        }
      }

      // fire
      if (!sim.fire.dead) {
        const lr = sim.fire.lightRadius;
        const glow = ctx.createRadialGradient(fp.x, fp.y, 6, fp.x, fp.y, Math.max(lr, 40));
        glow.addColorStop(0, 'rgba(255,190,80,0.75)');
        glow.addColorStop(0.4, 'rgba(255,140,40,0.28)');
        glow.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(fp.x, fp.y, Math.max(lr, 40), 0, 7); ctx.fill();
        ctx.restore();
      }
      // stone ring
      ctx.fillStyle = sim.fire.dead ? '#3a3a44' : '#5a5a66';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillRect(Math.round(fp.x + Math.cos(a) * 13) - 2, Math.round(fp.y + Math.sin(a) * 7) - 2, 4, 4);
      }
      if (!sim.fire.dead) {
        const s = sim.fire.size;
        const fl = 1 + Math.sin(this.t * 11) * 0.18 + Math.sin(this.t * 27) * 0.1;
        ctx.fillStyle = '#4a3423';
        ctx.fillRect(fp.x - 10, fp.y - 1, 20, 4);
        ctx.fillRect(fp.x - 8, fp.y + 2, 16, 4);
        const cols = [[-6, '#ff5a1a', 0.75], [0, '#ff9a2a', 1], [6, '#ffdd66', 0.6]];
        for (const [ox, col, m] of cols) {
          const hgt = (7 + 9 * s) * fl * m;
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(fp.x + ox - 2), Math.round(fp.y - 2 - hgt), 4, Math.round(hgt));
        }
      }

      // heroes (pixel sprites, feet at cell position)
      for (const h of sim.heroes) {
        if (!h.alive) {
          ctx.fillStyle = '#666';
          ctx.font = '10px Courier New';
          ctx.fillText('✝', h.x - 3, h.y + 4);
          continue;
        }
        const spr = HERO_SPRITES[h.id];
        if (h.id === selectedId) {
          ctx.strokeStyle = '#ffe080';
          ctx.lineWidth = 2;
          this._diamond(ctx, g.cellCenter(h.cell.gx, h.cell.gy), 17, 10);
          ctx.stroke();
        }
        drawSprite(ctx, spr.map, spr.pal, h.x - 12, h.y - 24, 2);
        // hp / warmth bars
        const bw = 24;
        ctx.fillStyle = '#000';
        ctx.fillRect(h.x - bw / 2, h.y - 32, bw, 3);
        ctx.fillStyle = '#2a8a2a';
        ctx.fillRect(h.x - bw / 2, h.y - 32, bw * Math.max(0, h.hp / h.maxHp), 3);
        ctx.fillStyle = '#000';
        ctx.fillRect(h.x - bw / 2, h.y - 28, bw, 3);
        ctx.fillStyle = '#e08018';
        ctx.fillRect(h.x - bw / 2, h.y - 28, bw * (h.warmth / 100), 3);
        // chopping progress at a tree
        if (h.chopping) {
          ctx.fillStyle = '#000';
          ctx.fillRect(h.x - 10, h.y - 38, 20, 3);
          ctx.fillStyle = '#ffb040';
          ctx.fillRect(h.x - 10, h.y - 38, 20 * Math.max(0, Math.min(1, 1 - h.chopT / 2)), 3);
        }
        ctx.fillStyle = '#fff';
        ctx.font = '9px Courier New';
        ctx.fillText(h.name.split(' ')[0], h.x - 13, h.y + 10);
        if (h.carried > 0) {
          ctx.fillStyle = '#c89040';
          ctx.fillText('wood x' + h.carried, h.x - 13, h.y + 19);
        }
      }

      // beasts
      for (const b of sim.beasts) drawSprite(ctx, BEAST_MAP, BEAST_PAL, b.x - 12, b.y - 6, 2);
      if (sim.boss && sim.boss.hp > 0) drawSprite(ctx, BEAST_MAP, BOSS_PAL, sim.boss.x - 18, sim.boss.y - 9, 3);

      // glowing eyes in dark cells
      if (night || castleMode) {
        for (let gx = 0; gx < g.GRID.GX; gx++) {
          for (let gy = 0; gy < g.GRID.GY; gy++) {
            const d = g.cheb({ gx, gy }, fc);
            if (d <= rCells) continue;
            const hh = hash2(gx + 53, gy + 71);
            if (hh > 0.72) {
              const c = g.cellCenter(gx, gy);
              const tw = 0.6 + 0.4 * Math.sin(this.t * 2 + hh * 9);
              ctx.fillStyle = 'rgba(255,210,80,' + (tw * 0.9).toFixed(2) + ')';
              ctx.fillRect(c.x - 4 + hh * 8, c.y - 2, 2, 2);
              ctx.fillRect(c.x - 2 + hh * 8, c.y - 1, 2, 2);
            }
          }
        }
      }

      // HUD
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Courier New';
      ctx.fillText('DAY ' + sim.clock.day + ' — ' + sim.effPhase().toUpperCase(), 8, 16);
      ctx.fillText('CASTLE: ' + (sim.distance <= 0 ? 'ASSAULT' : sim.distance + ' campsites away'), 8, 32);
      if (sim.fire.visibleToCastle && (night || castleMode)) {
        ctx.fillStyle = '#ff9040';
        ctx.fillText('! THE CASTLE HAS SEEN YOUR FIRE !', 8, 48);
      }
      if (castleMode && sim.boss && sim.boss.hp > 0) {
        ctx.fillStyle = '#400';
        ctx.fillRect(200, 8, 240, 10);
        ctx.fillStyle = '#ff5040';
        ctx.fillRect(200, 8, 240 * Math.max(0, sim.boss.hp / sim.boss.maxHp), 10);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(200, 8, 240, 10);
        ctx.fillStyle = '#fff';
        ctx.fillText('THE THING IN THE CASTLE', 200, 30);
      }
    }

    _drawCastle(ctx, sim, night) {
      const cx = 520, cy = 64;
      ctx.fillStyle = night ? '#141a28' : '#8a94a8';
      ctx.beginPath(); ctx.ellipse(cx, cy + 58, 130, 66, 0, Math.PI, 0); ctx.fill();
      const towers = [[-60, -8, 22, 58], [-20, -28, 26, 78], [20, -16, 24, 66], [58, -4, 20, 54], [0, -44, 30, 94]];
      ctx.fillStyle = night ? '#262e42' : '#6a7488';
      for (const [dx, dy, w, h] of towers) ctx.fillRect(cx + dx - w / 2, cy + dy - h, w, h);
      ctx.fillStyle = night ? '#1a2130' : '#4a5468';
      for (const [dx, dy, w, h] of towers) {
        ctx.beginPath();
        ctx.moveTo(cx + dx - w / 2 - 3, cy + dy - h);
        ctx.lineTo(cx + dx, cy + dy - h - 12);
        ctx.lineTo(cx + dx + w / 2 + 3, cy + dy - h);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = night ? '#ffd060' : '#3a4356';
      for (const [dx, dy, w, h] of towers) {
        for (let wy = cy + dy - h + 8; wy < cy + dy - 6; wy += 12)
          for (let wx = cx + dx - w / 2 + 4; wx < cx + dx + w / 2 - 6; wx += 9)
            ctx.fillRect(wx, wy, 4, 6);
      }
    }

    _tree(ctx, x, y, s, night) {
      ctx.fillStyle = night ? '#0c1712' : '#2a4a34';
      ctx.beginPath();
      ctx.moveTo(x, y - 24 * s); ctx.lineTo(x - 11 * s, y); ctx.lineTo(x + 11 * s, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = night ? '#122019' : '#3a5f44';
      ctx.beginPath();
      ctx.moveTo(x, y - 32 * s); ctx.lineTo(x - 8 * s, y - 11 * s); ctx.lineTo(x + 8 * s, y - 11 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(230,238,250,0.85)';
      ctx.beginPath();
      ctx.moveTo(x, y - 32 * s); ctx.lineTo(x - 4 * s, y - 25 * s); ctx.lineTo(x + 4 * s, y - 25 * s);
      ctx.closePath(); ctx.fill();
    }

    // ---------- ember run (moving camp) ----------
    _drawEmber(sim, ctx) {
      const e = sim.ember;
      ctx.fillStyle = '#0a0d18';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1c2233';
      ctx.fillRect(0, 200, W, 90);
      ctx.strokeStyle = '#2c3448';
      ctx.setLineDash([8, 10]);
      ctx.beginPath(); ctx.moveTo(20, 245); ctx.lineTo(W - 20, 245); ctx.stroke();
      ctx.setLineDash([]);
      this._drawCastle(ctx, sim, true);
      const px = 60 + (e.progress / 100) * (W - 140);
      const py = 245;
      const g = ctx.createRadialGradient(px, py, 6, px, py, 110);
      g.addColorStop(0, 'rgba(255,190,90,0.8)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 110, 0, 7); ctx.fill();
      ctx.restore();
      const f = 1 + Math.sin(this.t * 13) * 0.2;
      ctx.fillStyle = '#ffdd66';
      ctx.beginPath(); ctx.ellipse(px, py - 12 * f, 4, 9 * f, 0, 0, 7); ctx.fill();
      let i = 0;
      for (const h of sim.aliveHeroes()) {
        const spr = HERO_SPRITES[h.id];
        drawSprite(ctx, spr.map, spr.pal, px - 24 + i * 14, py - 6, 2);
        i++;
      }
      if (e.lunge) drawSprite(ctx, BEAST_MAP, BEAST_PAL, px + 34, py - 14, 2);
      const g2 = ctx.createRadialGradient(px, py, 90, px, py, 340);
      g2.addColorStop(0, 'rgba(2,4,16,0)');
      g2.addColorStop(1, 'rgba(2,4,16,0.96)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Courier New';
      ctx.fillText('CARRYING EMBERS — DAY ' + sim.clock.day, 8, 16);
      ctx.fillStyle = '#000'; ctx.fillRect(8, 26, 300, 10);
      ctx.fillStyle = '#e08018'; ctx.fillRect(8, 26, 300 * (e.progress / 100), 10);
      ctx.strokeStyle = '#fff'; ctx.strokeRect(8, 26, 300, 10);
      ctx.fillStyle = '#fff'; ctx.fillText('new fire', 8, 48);
      ctx.fillStyle = '#000'; ctx.fillRect(8, 54, 300, 10);
      ctx.fillStyle = '#c03020'; ctx.fillRect(8, 54, 300 * Math.max(0, e.t / sim.opts.emberTime), 10);
      ctx.strokeStyle = '#fff'; ctx.strokeRect(8, 54, 300, 10);
      ctx.fillStyle = '#fff'; ctx.fillText('torch', 8, 76);
    }

    _drawSnow(ctx, dt) {
      ctx.fillStyle = 'rgba(240,246,255,0.8)';
      for (const s of this.snow) {
        s.y += s.v * dt;
        s.x += Math.sin(this.t + s.s) * 8 * dt;
        if (s.y > H) { s.y = -2; s.x = BF.env.random() * W; }
        ctx.fillRect(s.x, s.y, 2, 2);
      }
    }
  }

  BF.Renderer = Renderer;
})();
