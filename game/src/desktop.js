/* desktop.js — mock Windows 95 shell: Start menu, window drag / minimize /
 * maximize / close, taskbar buttons, and an app registry (BF.Apps) that the
 * mock apps in src/apps/ register themselves into. All host access goes
 * through BF.env so tests can mock it. */
(function () {
  const BF = globalThis.BF;
  const DESK_W = 1024, DESK_H = 768, TASKBAR_H = 30;

  // windows stack ABOVE the modal-dialog layer (z 70): a Win95 modal only owns
  // its parent window; other windows may still be raised over it
  let zTop = 80;
  const wins = []; // {id, title, el, btn, minimized, maximized, closed, prev}

  const doc = () => BF.env.document;
  const el = (id) => doc().getElementById(id);
  const mk = (tag) => doc().createElement(tag);

  /* App registry: src/apps/*.js call BF.Apps.register(id, {title,w,h,x,y,open}) */
  BF.Apps = {
    list: {},
    register(id, def) { this.list[id] = def; },
    get(id) { return this.list[id]; },
    open(id, arg) { const d = this.list[id]; if (d) return d.open(arg); },
  };

  function viewScale() {
    const d = el('desktop');
    const m = /scale\(([\d.]+)\)/.exec((d && d.style.transform) || '');
    return m ? parseFloat(m[1]) : 1;
  }

  function bringFront(w) {
    w.el.style.zIndex = ++zTop;
    wins.forEach(o => { o.focused = o === w; if (o.btn) o.btn.classList.toggle('on', o.focused); });
  }

  /* A modal dialog claims a z just above every current window (it owns the
   * game window); windows raised later still stack above the dialog. */
  function claimZ() { return ++zTop; }

  function minimize(w) {
    w.el.style.display = 'none';
    w.minimized = true;
    if (w.btn) w.btn.classList.remove('on');
  }

  function restore(w) {
    w.el.style.display = '';
    w.minimized = false;
    bringFront(w);
  }

  function closeWin(w) {
    minimize(w);
    if (w.btn) w.btn.style.display = 'none';
    w.closed = true;
    if (w.id === 'game' && BF.onGameClosed) BF.onGameClosed();
  }

  function maximize(w) {
    if (w.maximized) {
      Object.assign(w.el.style, w.prev);
      w.maximized = false;
    } else {
      w.prev = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
      Object.assign(w.el.style, { left: '0px', top: '0px', width: DESK_W + 'px', height: (DESK_H - TASKBAR_H) + 'px' });
      w.maximized = true;
    }
  }

  function addTaskButton(w) {
    if (w.btn) { w.btn.style.display = ''; return; }
    const bar = el('taskbar');
    const b = mk('div');
    b.className = 'taskbtn2 on';
    b.textContent = w.title;
    b.onclick = () => {
      if (w.minimized || w.closed) { w.closed = false; restore(w); }
      else if (w.focused) minimize(w);
      else bringFront(w);
    };
    if (bar.insertBefore && el('clock')) bar.insertBefore(b, el('clock'));
    else bar.appendChild(b);
    w.btn = b;
  }

  /* Generic title-bar drag for any absolutely-positioned element. */
  function drag(elm, handle) {
    if (!handle) handle = elm;
    handle.onmousedown = (ev) => {
      if (ev.target && ev.target.tagName === 'BUTTON') return;
      const s = viewScale();
      const sx = ev.clientX, sy = ev.clientY;
      const ox = parseFloat(elm.style.left) || 0;
      const oy = parseFloat(elm.style.top) || 0;
      const d = doc();
      if (!d.addEventListener) return;
      const mv = (e2) => {
        elm.style.left = Math.max(0, Math.min(DESK_W - 60, ox + (e2.clientX - sx) / s)) + 'px';
        elm.style.top = Math.max(0, Math.min(DESK_H - TASKBAR_H - 20, oy + (e2.clientY - sy) / s)) + 'px';
      };
      const up = () => {
        if (d.removeEventListener) d.removeEventListener('mousemove', mv);
        if (d.removeEventListener) d.removeEventListener('mouseup', up);
      };
      d.addEventListener('mousemove', mv);
      d.addEventListener('mouseup', up);
    };
  }

  function wireChrome(w) {
    const win = w.el;
    win.onmousedown = () => bringFront(w);
    const btns = win.querySelectorAll('.wbtns button');
    if (btns.forEach) btns.forEach((b, i) => {
      b.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (i === 0) minimize(w);
        else if (i === 1) maximize(w);
        else closeWin(w);
      };
    });
    drag(win, win.querySelector('.wintitle'));
  }

  function makeWindow(id, title, wpx, hpx, x, y) {
    const win = mk('div');
    win.className = 'win';
    win.style.left = x + 'px';
    win.style.top = y + 'px';
    win.style.width = wpx + 'px';
    win.style.height = hpx + 'px';
    win.innerHTML =
      '<div class="wintitle"><span class="wtitle">' + title + '</span>' +
      '<span class="wbtns"><button>_</button><button>□</button><button>✕</button></span></div>' +
      '<div class="winmenu"><span>File</span><span>Edit</span><span>View</span><span>Help</span></div>' +
      '<div class="winclient"></div>';
    el('desktop').appendChild(win);
    const w = { id, title, el: win, btn: null, minimized: false, maximized: false, closed: false, prev: null };
    wins.push(w);
    wireChrome(w);
    addTaskButton(w);
    bringFront(w);
    return w;
  }

  function getWin(id) { return wins.find(w => w.id === id); }

  function openWindow(id, title, wpx, hpx, x, y, onCreate) {
    let w = getWin(id);
    if (!w) { w = makeWindow(id, title, wpx, hpx, x, y); if (onCreate) onCreate(w); }
    w.closed = false;
    restore(w);
    if (w.btn) w.btn.style.display = '';
    return w;
  }

  /* Close the game window = quit to desktop; reopening shows the title dialog. */
  function reopenGame() {
    const w = getWin('game');
    if (w) { w.closed = false; restore(w); if (w.btn) w.btn.style.display = ''; }
    if (BF.reopenTitle) BF.reopenTitle();
  }

  // ---------- start menu ----------

  let startMenu = null;

  function closeStart() { if (startMenu) startMenu.style.display = 'none'; }

  function buildStartMenu() {
    const sm = mk('div');
    sm.id = 'startmenu';
    sm.innerHTML =
      '<div class="sm-side"><span>Windows<b>95</b></span></div>' +
      '<div class="sm-items">' +
      '<div class="sm-item" data-sub="programs">Programs <i>►</i>' +
      '  <div class="sm-sub">' +
      '    <div class="sm-item" data-app="bonfire">Bonfire: Winter Survivors</div>' +
      '    <div class="sm-item" data-app="spider">Spider Solitaire</div>' +
      '    <div class="sm-item" data-app="notepad">Notepad</div>' +
      '  </div>' +
      '</div>' +
      '<div class="sm-item" data-app="readme">Documents ► README.txt</div>' +
      '<div class="sm-item" data-app="help">Help</div>' +
      '<div class="sm-sep"></div>' +
      '<div class="sm-item" data-app="shutdown">Shut Down...</div>' +
      '</div>';
    el('desktop').appendChild(sm);
    startMenu = sm;
    // clicks inside the menu must not bubble to the document handler that closes it
    sm.onclick = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); };
    // leaving the menu entirely collapses any open submenu
    sm.onmouseleave = () => { sm.querySelectorAll('.sm-sub').forEach(s2 => { s2.style.display = 'none'; }); };
    sm.querySelectorAll('.sm-item').forEach(it => {
      it.onmouseenter = () => {
        // hide only submenus unrelated to the hovered item — related means the item
        // OWNS the submenu (top-level parent) or is INSIDE it (submenu entry)
        sm.querySelectorAll('.sm-sub').forEach(s2 => {
          const related = it.contains && (it.contains(s2) || s2.contains(it));
          if (!related) s2.style.display = 'none';
        });
        const sub = it.querySelector('.sm-sub');
        if (sub) sub.style.display = 'block';
      };
      it.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const sub = it.querySelector('.sm-sub');
        if (sub) { sub.style.display = 'block'; return; } // parent item: click opens submenu, menu stays
        const app = it.dataset.app;
        closeStart();
        if (app === 'bonfire') reopenGame();
        else if (app === 'spider') BF.Apps.open('spider');
        else if (app === 'notepad') BF.Apps.open('notepad');
        else if (app === 'readme') BF.Apps.open('notepad');
        else if (app === 'help') { const n = BF.Apps.get('notepad'); BF.Apps.open('notepad', n && n.HELP_TEXT); }
        else if (app === 'shutdown') shutdown();
      };
    });
  }

  let shutdownEl = null;
  function shutdown() {
    if (!shutdownEl) {
      shutdownEl = mk('div');
      shutdownEl.id = 'shutdown';
      shutdownEl.textContent = "It's now safe to turn off your computer.";
      shutdownEl.onclick = () => { shutdownEl.style.display = 'none'; };
      el('desktop').appendChild(shutdownEl);
    }
    shutdownEl.style.display = 'block';
  }

  // ---------- init ----------

  function init() {
    const gameWin = el('window');
    if (gameWin) {
      const w = { id: 'game', title: 'Bonfire: Winter Survivors', el: gameWin, btn: el('taskbtn'), minimized: false, maximized: false, closed: false, prev: null };
      wins.push(w);
      wireChrome(w);
      bringFront(w);
    }
    buildStartMenu();
    const start = el('startbtn');
    if (start) start.onclick = (ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      startMenu.style.display = startMenu.style.display === 'block' ? 'none' : 'block';
    };
    const d = doc();
    if (d.addEventListener) d.addEventListener('click', () => closeStart());
    // double-click the Bonfire desktop icon to relaunch the game
    const icon = el('icon-bonfire');
    if (icon) icon.ondblclick = () => reopenGame();
  }

  BF.Desktop = { init, drag, claimZ, getWin, openWindow, reopenGame };
})();
