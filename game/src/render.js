/* Renderer — 640x480 canvas, isometric snowfield, firelight ring, darkness
 * with glowing eyes. Browser only. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});
  const W = 640, H = 480;

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.t = 0;
      this.snow = [];
      for (let i = 0; i < 130; i++)
        this.snow.push({ x: Math.random() * W, y: Math.random() * H, v: 12 + Math.random() * 22, s: Math.random() * 6 });
      this.eyes = [];
      for (let i = 0; i < 12; i++)
        this.eyes.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * 6, d: 4 + Math.random() * 10 });
    }

    draw(sim, selectedId, dt) {
      this.t += dt;
      const ctx = this.ctx;
      if (sim.mode === 'ember') this._drawEmber(sim, ctx);
      else this._drawCamp(sim, selectedId, ctx);
      this._drawSnow(ctx, dt);
    }

    // ---------- camp / castle ----------
    _drawCamp(sim, selectedId, ctx) {
      const night = sim.effPhase() === 'night';
      const dusk = sim.effPhase() === 'dusk';
      const fp = sim.firePos;

      // ground
      ctx.fillStyle = night ? '#232a3a' : dusk ? '#4a4460' : '#b8c4d4';
      ctx.fillRect(0, 0, W, H);
      // isometric diamond tiles
      for (let gx = 0; gx < 22; gx++) {
        for (let gy = 0; gy < 16; gy++) {
          const x = W / 2 + (gx - gy) * 16 - 8;
          const y = 120 + (gx + gy) * 9;
          if (y > H + 20) continue;
          ctx.fillStyle = (gx + gy) % 2 ? (night ? '#1f2634' : dusk ? '#454060' : '#aeb9ca') : (night ? '#252d3e' : dusk ? '#4d4866' : '#c2cddb');
          ctx.beginPath();
          ctx.moveTo(x, y - 8); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 16, y);
          ctx.closePath(); ctx.fill();
        }
      }

      // hill + castle, top right
      this._drawCastle(ctx, sim, night);

      // treeline
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const x = fp.x + Math.cos(a) * (300 + (i * 37) % 60);
        const y = fp.y + Math.sin(a) * (240 + (i * 53) % 50);
        if (x < -20 || x > W + 20 || y < 40 || y > H + 20) continue;
        this._tree(ctx, x, y, 1 + (i % 3) * 0.3, night);
      }

      // fire ring of stones
      ctx.fillStyle = '#5a5a66';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(fp.x + Math.cos(a) * 22, fp.y + Math.sin(a) * 12, 4, 0, 7);
        ctx.fill();
      }

      // beasts
      for (const b of sim.beasts) this._beast(ctx, b.x, b.y, b.radius, night);
      if (sim.boss && sim.boss.hp > 0) this._beast(ctx, sim.boss.x, sim.boss.y, sim.boss.radius, true);

      // fire glow + flame (additive)
      if (!sim.fire.dead) {
        const lr = sim.fire.lightRadius;
        const g = ctx.createRadialGradient(fp.x, fp.y, 8, fp.x, fp.y, lr * 0.9);
        g.addColorStop(0, 'rgba(255,190,80,0.85)');
        g.addColorStop(0.35, 'rgba(255,140,40,0.35)');
        g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fp.x, fp.y, lr * 0.9, 0, 7); ctx.fill();
        ctx.restore();
        // flame
        const f = 1 + Math.sin(this.t * 11) * 0.15 + Math.sin(this.t * 23) * 0.1;
        const s = sim.fire.size;
        ctx.fillStyle = '#ffdd66';
        ctx.beginPath(); ctx.ellipse(fp.x, fp.y - 10 * s * f, 7 * s + 3, 12 * s * f, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff9a2a';
        ctx.beginPath(); ctx.ellipse(fp.x, fp.y - 6 * s * f, 5 * s + 2, 8 * s * f, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff5a1a';
        ctx.beginPath(); ctx.ellipse(fp.x, fp.y - 3, 3 * s + 1, 5 * s, 0, 0, 7); ctx.fill();
        // logs
        ctx.strokeStyle = '#4a3423'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(fp.x - 10, fp.y + 4); ctx.lineTo(fp.x + 10, fp.y - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fp.x - 9, fp.y - 3); ctx.lineTo(fp.x + 9, fp.y + 3); ctx.stroke();
      }

      // safe-zone ring
      if (!sim.fire.dead) {
        ctx.strokeStyle = 'rgba(255,200,120,0.35)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(fp.x, fp.y, sim.fire.lightRadius, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      }

      // heroes
      for (const h of sim.heroes) {
        if (!h.alive) {
          ctx.fillStyle = '#777';
          ctx.font = '9px Courier New';
          ctx.fillText('✝', h.x - 3, h.y + 3);
          continue;
        }
        this._hero(ctx, h, h.id === selectedId);
      }

      // darkness overlay with a hole at the fire
      if (night || dusk || sim.mode === 'castle') {
        const lr = sim.fire.dead ? 0 : sim.fire.lightRadius;
        const g = ctx.createRadialGradient(fp.x, fp.y, lr * 0.35, fp.x, fp.y, Math.max(lr * 1.25, 60));
        const a = night || sim.mode === 'castle' ? 0.93 : 0.55;
        g.addColorStop(0, 'rgba(3,5,20,0)');
        g.addColorStop(0.6, 'rgba(3,5,20,' + (a * 0.6) + ')');
        g.addColorStop(1, 'rgba(3,5,20,' + a + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        if (dusk && !night) { ctx.fillStyle = 'rgba(120,60,120,0.12)'; ctx.fillRect(0, 0, W, H); }
        // glowing eyes in the treeline
        for (const e of this.eyes) {
          if (Math.hypot(e.x - fp.x, e.y - fp.y) < lr + 10) continue;
          const tw = 0.6 + 0.4 * Math.sin(this.t * 2 + e.p);
          ctx.fillStyle = 'rgba(255,210,80,' + (tw * (night ? 1 : 0.5)) + ')';
          ctx.fillRect(e.x, e.y, 2, 2);
          ctx.fillRect(e.x + e.d, e.y + 1, 2, 2);
        }
      }

      // HUD text
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Courier New';
      ctx.fillText('DAY ' + sim.clock.day + ' — ' + sim.effPhase().toUpperCase(), 8, 16);
      ctx.fillText('CASTLE: ' + (sim.distance <= 0 ? 'ASSAULT' : sim.distance + ' campsites'), 8, 32);
      if (sim.fire.visibleToCastle && (night || sim.mode === 'castle')) {
        ctx.fillStyle = '#ff9040';
        ctx.fillText('! THE CASTLE HAS SEEN YOUR FIRE !', 8, 48);
      }
      if (sim.mode === 'castle' && sim.boss && sim.boss.hp > 0) {
        ctx.fillStyle = '#ff5040';
        ctx.fillRect(200, 8, 240, 10);
        ctx.fillStyle = '#a01010';
        ctx.fillRect(200, 8, 240 * Math.max(0, sim.boss.hp / sim.boss.maxHp), 10);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(200, 8, 240, 10);
        ctx.fillStyle = '#fff'; ctx.fillText('THE THING IN THE CASTLE', 200, 30);
      }
    }

    _drawCastle(ctx, sim, night) {
      const cx = 520, cy = 70;
      // hill
      ctx.fillStyle = night ? '#1a2030' : '#8a94a8';
      ctx.beginPath(); ctx.ellipse(cx, cy + 60, 130, 70, 0, Math.PI, 0); ctx.fill();
      // towers
      ctx.fillStyle = night ? '#2c3448' : '#6a7488';
      const towers = [[-60, -10, 22, 60], [-20, -30, 26, 80], [20, -18, 24, 68], [58, -6, 20, 56], [0, -46, 30, 96]];
      for (const [dx, dy, w, h] of towers) ctx.fillRect(cx + dx - w / 2, cy + dy - h, w, h);
      // roofs
      ctx.fillStyle = night ? '#1c2333' : '#4a5468';
      for (const [dx, dy, w, h] of towers) {
        ctx.beginPath();
        ctx.moveTo(cx + dx - w / 2 - 3, cy + dy - h);
        ctx.lineTo(cx + dx, cy + dy - h - 12);
        ctx.lineTo(cx + dx + w / 2 + 3, cy + dy - h);
        ctx.closePath(); ctx.fill();
      }
      // lit windows
      ctx.fillStyle = night ? '#ffd060' : '#3a4356';
      for (const [dx, dy, w, h] of towers) {
        for (let wy = cy + dy - h + 8; wy < cy + dy - 6; wy += 12)
          for (let wx = cx + dx - w / 2 + 4; wx < cx + dx + w / 2 - 6; wx += 9)
            ctx.fillRect(wx, wy, 4, 6);
      }
    }

    _tree(ctx, x, y, s, night) {
      ctx.fillStyle = night ? '#0e1a14' : '#2a4a34';
      ctx.beginPath();
      ctx.moveTo(x, y - 26 * s); ctx.lineTo(x - 12 * s, y); ctx.lineTo(x + 12 * s, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = night ? '#16241c' : '#3a5f44';
      ctx.beginPath();
      ctx.moveTo(x, y - 34 * s); ctx.lineTo(x - 9 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y - 12 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(230,238,250,0.85)';
      ctx.beginPath();
      ctx.moveTo(x, y - 34 * s); ctx.lineTo(x - 5 * s, y - 26 * s); ctx.lineTo(x + 5 * s, y - 26 * s);
      ctx.closePath(); ctx.fill();
    }

    _beast(ctx, x, y, r, boss) {
      ctx.fillStyle = boss ? '#3a1016' : '#14161f';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd050';
      ctx.fillRect(x - r * 0.45, y - r * 0.25, 3, 3);
      ctx.fillRect(x + r * 0.25, y - r * 0.25, 3, 3);
    }

    _hero(ctx, h, selected) {
      if (selected) {
        ctx.strokeStyle = '#ffe080'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x, h.y, 15, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = h.color;
      ctx.beginPath(); ctx.arc(h.x, h.y, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8c8a0';
      ctx.beginPath(); ctx.arc(h.x, h.y - 12, 6, 0, 7); ctx.fill();
      if (h.id === 'ranger') { ctx.fillStyle = '#c03020'; ctx.beginPath(); ctx.arc(h.x, h.y - 14, 6, Math.PI, 0); ctx.fill(); }
      if (h.id === 'rogue') { ctx.fillStyle = '#2a2440'; ctx.beginPath(); ctx.arc(h.x, h.y - 12, 7, Math.PI, 0); ctx.fill(); }
      if (h.id === 'trapper') { ctx.fillStyle = '#7a5a30'; ctx.fillRect(h.x - 7, h.y - 20, 14, 5); }
      if (h.id === 'sword') { ctx.strokeStyle = '#cfd6e4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h.x + 8, h.y - 6); ctx.lineTo(h.x + 14, h.y - 14); ctx.stroke(); }
      // bars
      const bw = 26;
      ctx.fillStyle = '#000'; ctx.fillRect(h.x - bw / 2, h.y + 14, bw, 3);
      ctx.fillStyle = '#2a8a2a'; ctx.fillRect(h.x - bw / 2, h.y + 14, bw * Math.max(0, h.hp / h.maxHp), 3);
      ctx.fillStyle = '#000'; ctx.fillRect(h.x - bw / 2, h.y + 18, bw, 3);
      ctx.fillStyle = '#e08018'; ctx.fillRect(h.x - bw / 2, h.y + 18, bw * (h.warmth / 100), 3);
      ctx.fillStyle = '#fff'; ctx.font = '9px Courier New';
      ctx.fillText(h.name.split(' ')[0], h.x - 14, h.y + 28);
    }

    // ---------- ember run (moving camp) ----------
    _drawEmber(sim, ctx) {
      const e = sim.ember;
      ctx.fillStyle = '#0a0d18';
      ctx.fillRect(0, 0, W, H);
      // path
      ctx.fillStyle = '#1c2233';
      ctx.fillRect(0, 200, W, 90);
      ctx.strokeStyle = '#2c3448'; ctx.setLineDash([8, 10]);
      ctx.beginPath(); ctx.moveTo(20, 245); ctx.lineTo(W - 20, 245); ctx.stroke(); ctx.setLineDash([]);
      // castle silhouette at the end
      this._drawCastle(ctx, sim, true);
      // party with torch
      const px = 60 + (e.progress / 100) * (W - 140);
      const py = 245;
      const g = ctx.createRadialGradient(px, py, 6, px, py, 110);
      g.addColorStop(0, 'rgba(255,190,90,0.8)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 110, 0, 7); ctx.fill(); ctx.restore();
      // torch flame
      const f = 1 + Math.sin(this.t * 13) * 0.2;
      ctx.fillStyle = '#ffdd66';
      ctx.beginPath(); ctx.ellipse(px, py - 12 * f, 4, 9 * f, 0, 0, 7); ctx.fill();
      // party members
      let i = 0;
      for (const h of sim.aliveHeroes()) {
        ctx.fillStyle = h.color;
        ctx.beginPath(); ctx.arc(px - 18 + i * 12, py + 8 + (i % 2) * 6, 6, 0, 7); ctx.fill();
        i++;
      }
      // lunge beast
      if (e.lunge) this._beast(ctx, px + 40, py - 10, 12, false);
      // darkness beyond the torch
      const g2 = ctx.createRadialGradient(px, py, 90, px, py, 340);
      g2.addColorStop(0, 'rgba(2,4,16,0)');
      g2.addColorStop(1, 'rgba(2,4,16,0.96)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      // eyes
      for (const e2 of this.eyes) {
        if (Math.hypot(e2.x - px, e2.y - py) < 120) continue;
        ctx.fillStyle = 'rgba(255,210,80,0.9)';
        ctx.fillRect(e2.x, e2.y, 2, 2); ctx.fillRect(e2.x + e2.d, e2.y + 1, 2, 2);
      }
      // HUD
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Courier New';
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
        if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
        ctx.fillRect(s.x, s.y, 2, 2);
      }
    }
  }

  BF.Renderer = Renderer;
})();
