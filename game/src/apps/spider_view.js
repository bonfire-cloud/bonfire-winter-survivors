/* Spider Solitaire view — thin DOM layer over the pure BF.SpiderCore. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});
  const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const SUIT_LABEL = ['♠', '♥', '♦', '♣'];
  const RED = { 1: true, 2: true };

  let game = null;
  let win = null;
  let sel = null; // {col, idx} of the selected movable run

  function label(c) { return (RANK_LABEL[c.r] || c.r) + SUIT_LABEL[c.s]; }
  function newSeed() { return (BF.env.now() ^ Math.floor(BF.env.random() * 1e9)) >>> 0; }

  function render() {
    if (!win || !game) return;
    const client = win.el.querySelector('.winclient');
    client.className = 'winclient spider';
    client.innerHTML = '';
    const bar = BF.env.document.createElement('div');
    bar.className = 'sp-top';
    bar.innerHTML =
      '<span>Stock: ' + game.stock.length + '</span>' +
      '<span>Foundations: ' + game.foundations + '/8</span>' +
      '<span>Score: ' + game.score + ' · Moves: ' + game.moves + '</span>' +
      (game.won ? '<b class="sp-win">YOU WIN!</b>' : '');
    client.appendChild(bar);
    if (game.stock.length >= 10 && !game.won) {
      const pile = BF.env.document.createElement('div');
      pile.className = 'card back sp-stockpile';
      pile.style.left = '8px'; pile.style.top = '30px';
      pile.title = 'Deal one card to each column';
      pile.onclick = () => { if (game.dealStock()) { sel = null; render(); } };
      client.appendChild(pile);
    }
    for (let c = 0; c < 10; c++) {
      const col = game.tableau[c];
      const x = 8 + c * 54;
      for (let i = 0; i < col.length; i++) {
        const card = col[i];
        const d = BF.env.document.createElement('div');
        d.className = 'card' + (card.up ? '' : ' back') + (sel && sel.col === c && i >= sel.idx ? ' sel' : '');
        d.style.left = x + 'px';
        d.style.top = (96 + i * (card.up ? 18 : 8)) + 'px';
        if (card.up) {
          d.textContent = label(card);
          d.style.color = RED[card.s] ? '#c00' : '#000';
          d.onclick = () => onCard(c, i);
        }
        client.appendChild(d);
      }
    }
  }

  function onCard(c, i) {
    if (!game || game.won) return;
    if (sel && sel.col !== c) {
      if (game.tryMove(sel.col, sel.idx, c)) sel = null;
      else sel = null;
      render();
      return;
    }
    sel = game.movableRun(c, i) ? { col: c, idx: i } : null;
    render();
  }

  BF.Apps.register('spider', {
    title: 'Spider Solitaire',
    w: 560, h: 480, x: 230, y: 50,
    open() {
      const first = !BF.Desktop.getWin('spider');
      win = BF.Desktop.openWindow('spider', 'Spider Solitaire', 560, 480, 230, 50, (w) => {
        const menu = w.el.querySelector('.winmenu');
        const g = menu && menu.querySelector('span');
        if (g) {
          g.textContent = 'Game';
          g.title = 'New Game';
          g.onclick = () => { game = new BF.SpiderCore(newSeed()); sel = null; render(); };
        }
      });
      if (first || !game) game = new BF.SpiderCore(newSeed());
      sel = null;
      render();
      return win;
    },
  });
})();
