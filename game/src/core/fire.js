/* FireSim — the bonfire is the health bar, the base, and the clock.
 * size trades warmth/safety against wood burn rate and castle visibility. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  class FireSim {
    constructor() {
      this.wood = 20;      // fuel units
      this.size = 0.5;     // 0..1, player-set via stoke/bank
      this.hp = 100;       // beasts can attack the fire itself
      this.dead = false;
    }
    get burnRate() {     // wood per second
      return this.dead ? 0 : 0.08 + this.size * 0.55;
    }
    get lightRadiusCells() { // the safe zone, in grid cells
      return this.dead ? 0 : Math.round(2 + this.size * 6);
    }
    get lightRadius() {      // screen px, for the renderer glow
      return this.lightRadiusCells * 18;
    }
    get warmthRadiusCells() {
      return this.lightRadiusCells;
    }
    get warmthRadius() {
      return this.lightRadius;
    }
    get visibleToCastle() {
      return !this.dead && this.size > 0.66;
    }
    stoke() { if (this.wood > 0) this.size = Math.min(1, this.size + 0.25); }
    bank() { this.size = Math.max(this.wood > 0 ? 0.15 : 0, this.size - 0.25); }
    addWood(n) { this.wood += n; }
    tick(dt) {
      if (this.dead) return;
      this.wood -= this.burnRate * dt;
      if (this.wood <= 0) {
        this.wood = 0;
        this.size = Math.max(0, this.size - 0.3 * dt);
        if (this.size <= 0.001) {
          this.size = 0;
          this.dead = true;
        }
      }
      if (this.hp <= 0) {
        this.dead = true;
        this.size = 0;
        this.hp = 0;
      }
    }
  }

  BF.FireSim = FireSim;
})();
