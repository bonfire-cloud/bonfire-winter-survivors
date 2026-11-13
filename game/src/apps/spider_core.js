/* SpiderCore — pure Spider Solitaire logic (2 decks, 104 cards, 10 columns).
 * No DOM, no env: fully unit-testable. Cards are {r: 1..13, s: 0..3, up: bool}.
 * Rules: only same-suit descending runs move; drop onto rank+1 or empty column;
 * a completed same-suit K..A run is removed to a foundation; 8 foundations = win;
 * stock deals one card per column, only when no column is empty. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  class SpiderCore {
    constructor(seed) {
      this.rng = new BF.RNG(seed >>> 0);
      this.score = 500;
      this.moves = 0;
      this.foundations = 0;
      this.won = false;
      this.tableau = [];
      this.stock = [];
      const cards = [];
      for (let d = 0; d < 2; d++)
        for (let s = 0; s < 4; s++)
          for (let r = 1; r <= 13; r++) cards.push({ r, s, up: false });
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
      }
      const counts = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5];
      let i = 0;
      for (let c = 0; c < 10; c++) {
        const col = cards.slice(i, i + counts[c]);
        i += counts[c];
        if (col.length) col[col.length - 1].up = true;
        this.tableau.push(col);
      }
      this.stock = cards.slice(i);
      for (const c of this.stock) c.up = true;
    }

    /* Is the run from (col, idx) to the column end a movable same-suit run? */
    movableRun(col, idx) {
      const pile = this.tableau[col];
      if (!pile || idx < 0 || idx >= pile.length || !pile[idx].up) return false;
      for (let i = idx + 1; i < pile.length; i++) {
        if (!pile[i].up) return false;
        if (pile[i].r !== pile[i - 1].r - 1) return false;
        if (pile[i].s !== pile[i - 1].s) return false;
      }
      return true;
    }

    tryMove(srcCol, srcIdx, dstCol) {
      if (srcCol === dstCol || this.won) return false;
      if (!this.movableRun(srcCol, srcIdx)) return false;
      const src = this.tableau[srcCol];
      const dst = this.tableau[dstCol];
      const run = src.slice(srcIdx);
      const top = dst.length ? dst[dst.length - 1] : null;
      if (top && (!top.up || top.r !== run[0].r + 1)) return false;
      src.length = srcIdx;
      dst.push(...run);
      if (src.length) src[src.length - 1].up = true;
      this.moves++;
      this.score = Math.max(0, this.score - 1);
      this._checkFoundation(dstCol);
      return true;
    }

    _checkFoundation(col) {
      const pile = this.tableau[col];
      if (pile.length < 13) return;
      const seq = pile.slice(-13);
      if (!seq.every(c => c.up)) return;
      for (let i = 0; i < 13; i++)
        if (seq[i].r !== 13 - i || seq[i].s !== seq[0].s) return;
      pile.length -= 13;
      if (pile.length) pile[pile.length - 1].up = true;
      this.foundations++;
      this.score += 100;
      if (this.foundations === 8) this.won = true;
    }

    dealStock() {
      if (this.won) return false;
      if (this.stock.length < 10) return false;
      if (this.tableau.some(c => c.length === 0)) return false;
      for (let c = 0; c < 10; c++) {
        const card = this.stock.pop();
        card.up = true;
        this.tableau[c].push(card);
      }
      this.moves++;
      for (let c = 0; c < 10; c++) this._checkFoundation(c);
      return true;
    }
  }

  BF.SpiderCore = SpiderCore;
})();
