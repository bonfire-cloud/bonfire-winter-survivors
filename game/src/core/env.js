/* Environment abstraction — every host/browser global is accessed through
 * BF.env at CALL time (never captured at load). Tests replace it wholesale
 * (BF.env = mock) or merge overrides (BF.installEnv({...})). The pure core
 * (rng/data/fire/clock/sim) never touches BF.env at all. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});
  const g = globalThis;

  const defaults = {
    document: g.document || null,
    localStorage: g.localStorage || null,
    requestAnimationFrame: (cb) => g.requestAnimationFrame(cb),
    setInterval: (fn, ms) => g.setInterval(fn, ms),
    clearInterval: (id) => g.clearInterval(id),
    addEventListener: (type, fn) => { if (g.addEventListener) g.addEventListener(type, fn); },
    innerWidth: () => (typeof g.innerWidth === 'number' ? g.innerWidth : 1024),
    innerHeight: () => (typeof g.innerHeight === 'number' ? g.innerHeight : 768),
    now: () => (g.performance && g.performance.now ? g.performance.now() : Date.now()),
    audioContextCtor: () => g.AudioContext || g.webkitAudioContext || null,
    random: () => Math.random(),
  };

  BF.env = defaults;
  BF.installEnv = function (mock) {
    BF.env = Object.assign({}, defaults, mock);
    return BF.env;
  };
})();
