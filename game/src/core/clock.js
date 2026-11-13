/* GameClock — day / dusk / night cycle. Returns the new phase on change. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  const ORDER = ['day', 'dusk', 'night'];

  class GameClock {
    constructor(durations) {
      this.d = Object.assign({ day: 60, dusk: 12, night: 110 }, durations);
      this.phase = 'day';
      this.t = 0;
      this.day = 1;
    }
    tick(dt) {
      this.t += dt;
      if (this.t < this.d[this.phase]) return null;
      this.t -= this.d[this.phase];
      let i = (ORDER.indexOf(this.phase) + 1) % ORDER.length;
      if (ORDER[i] === 'day') this.day++;
      this.phase = ORDER[i];
      return this.phase;
    }
    /* 0..1 progress through the current phase, for UI bars. */
    get progress() {
      return Math.min(1, this.t / this.d[this.phase]);
    }
  }

  BF.GameClock = GameClock;
})();
