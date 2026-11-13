/* Audio — zero-dependency WebAudio: a tracker-style minor-key loop, fire
 * crackle tied to fire size, and small stingers. No-op outside the browser. */
(function () {
  const BF = (globalThis.BF = globalThis.BF || {});

  let ctx = null, master = null, crackleGain = null, musicTimer = null, step = 0;

  // 16-step loop: triangle bass, quiet square lead, sine drone every 4 steps
  const bass = [110, 0, 110, 0, 130.81, 0, 98, 0, 110, 0, 110, 0, 146.83, 0, 98, 0];
  const lead = [440, 0, 523.25, 440, 0, 392, 0, 349.23, 440, 0, 523.25, 0, 587.33, 523.25, 440, 0];

  function note(freq, t, dur, type, vol) {
    if (!freq || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const Audio = {
    start() {
      if (ctx) return;
      const AC = BF.env.audioContextCtor();
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        // fire crackle: looped noise through a lowpass
        const len = ctx.sampleRate;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.12);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 900;
        crackleGain = ctx.createGain();
        crackleGain.gain.value = 0;
        src.connect(filt); filt.connect(crackleGain); crackleGain.connect(master);
        src.start();
        musicTimer = BF.env.setInterval(() => {
          if (!ctx) return;
          const t = ctx.currentTime + 0.05;
          const spb = 0.22;
          note(bass[step % 16], t, spb * 0.9, 'triangle', 0.20);
          note(lead[step % 16], t, spb * 0.9, 'square', 0.045);
          if (step % 4 === 0) note(55, t, spb * 3.5, 'sine', 0.25);
          step++;
        }, 220);
      } catch (e) { ctx = null; }
    },
    /* called each frame: crackle follows the fire */
    tick(sim) {
      if (!ctx || !crackleGain) return;
      const target = sim && sim.status === 'playing' && !sim.fire.dead ? 0.05 + sim.fire.size * 0.1 : 0;
      crackleGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
    },
    blip(freq) { if (ctx) note(freq || 660, ctx.currentTime, 0.08, 'square', 0.06); },
    bad() {
      if (!ctx) return;
      note(160, ctx.currentTime, 0.3, 'sawtooth', 0.12);
      note(110, ctx.currentTime + 0.12, 0.45, 'sawtooth', 0.12);
    },
    stop() {
      if (musicTimer) { BF.env.clearInterval(musicTimer); musicTimer = null; }
      if (ctx) { try { ctx.close(); } catch (e) { /* ignore */ } ctx = null; }
    },
  };

  BF.Audio = Audio;
})();
