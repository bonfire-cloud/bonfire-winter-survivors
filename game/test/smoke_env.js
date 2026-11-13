/* Smoke test: loads the FULL browser shell (audio/render/ui/main) against a
 * mocked BF.env via BF.installEnv — no real document/localStorage/rAF needed,
 * and no host globals are touched. Run: node game/test/smoke_env.js */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function anyProxy() {
  const f = function () { return anyProxy(); };
  return new Proxy(f, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => 0; return anyProxy(); },
    set() { return true; },
    apply() { return anyProxy(); },
  });
}
function makeEl() {
  return {
    style: {}, dataset: {}, children: {}, handlers: {}, _kids: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    innerHTML: '', textContent: '', scrollTop: 0, scrollHeight: 0,
    value: '', checked: false, disabled: false, className: '',
    appendChild(c) { this._kids.push(c); return c; },
    querySelector(sel) { return this.children[sel] || (this.children[sel] = makeEl()); },
    querySelectorAll() { return { forEach() {} }; },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    getContext() { return anyProxy(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 480 }; },
  };
}

// load the pure core first, then install the mock env, then the browser shell
for (const f of ['core/env.js', 'core/rng.js', 'core/data.js', 'core/fire.js', 'core/clock.js', 'core/sim.js'])
  eval(fs.readFileSync(path.join(root, 'src', f), 'utf8'));
const BF = globalThis.BF;

const els = {};
const storage = {};
let rafCb = null;
BF.installEnv({
  document: {
    getElementById: (id) => (els[id] = els[id] || makeEl()),
    createElement: () => makeEl(),
  },
  localStorage: {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  setInterval: () => ({ unref() {} }),
  clearInterval: () => {},
  addEventListener: () => {},
  innerWidth: () => 1280,
  innerHeight: () => 800,
  now: () => 1000,
  audioContextCtor: () => null,
  random: () => 0.5,
});

for (const f of ['audio.js', 'render.js', 'ui.js', 'desktop.js', 'apps/spider_core.js', 'apps/notepad.js', 'apps/spider_view.js', 'main.js'])
  eval(fs.readFileSync(path.join(root, 'src', f), 'utf8'));

let failed = 0;
function ok(c, name) { console.log((c ? '  ok - ' : '  FAIL - ') + name); if (!c) failed++; }
function pump(n, t0) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; cb(t0 + i * 16.7); } }

// boot ran at load with the mock env; start a run via the title dialog
els['overlay'].children['#btn-new'].onclick();
pump(3000, 1000);
ok(!!BF.getSim(), 'game booted and a run started entirely on the mocked env');

BF.UI.heroEls[0].taskBtns.find(b => b.id === 'wood').el.onclick();
pump(50, 50000);
ok(BF.getSim().hero('sword').task === 'wood', 'Wood task button click landed mid-refresh');
BF.UI.heroEls[0].taskBtns.find(b => b.id === 'hunt').el.onclick();
pump(50, 60000);
ok(BF.getSim().hero('sword').task === 'hunt', 'Hunt task button click landed mid-refresh');

els['game'].handlers.click({ clientX: 320, clientY: 300 });
ok(true, 'canvas click handled without exceptions');
ok('bonfire_winter_survivors_save' in storage, 'run autosaved via mocked localStorage');

// desktop shell: start menu toggle + app windows via the registry
els['startbtn'].onclick();
BF.Apps.open('spider');
BF.Apps.open('notepad');
pump(30, 70000);
ok(true, 'start menu + Spider Solitaire + Notepad opened without exceptions');

// close and reopen the game window
BF.Desktop.getWin('game').el.querySelector; // window exists
BF.Desktop.reopenGame();
ok(els['window'].style.display !== 'none', 'game window reopens via Start-menu path');

console.log(failed ? failed + ' FAILED' : 'SMOKE OK');
process.exit(failed ? 1 : 0);
