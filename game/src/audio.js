// Synthesised sound effects through WebAudio: no audio files, no network.
// The context is created lazily on the first user gesture; every call before
// that (including the deterministic screenshot runs) is a silent no-op.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(dur, filterFreq, gainValue, type = 'lowpass', when = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gainValue, type = 'square', slideTo = 0, when = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    shot(kind) {
      if (kind === 'p9') { noise(0.09, 2400, 0.5); tone(190, 0.07, 0.22, 'square', 70); }
      else if (kind === 'vex9') { noise(0.07, 3200, 0.4); tone(240, 0.05, 0.18, 'square', 90); }
      else { noise(0.12, 1800, 0.6); tone(150, 0.09, 0.28, 'square', 55); }
    },
    enemyShot(distance) {
      const vol = Math.max(0.05, 0.45 - distance * 0.012);
      noise(0.1, 1500, vol);
      tone(140, 0.08, vol * 0.4, 'square', 60);
    },
    dryFire() { tone(900, 0.03, 0.12, 'square'); },
    reload() {
      tone(500, 0.04, 0.14, 'square');
      tone(350, 0.04, 0.14, 'square', 0, 0.18);
      tone(650, 0.05, 0.16, 'square', 0, 0.45);
    },
    hit() { tone(1400, 0.05, 0.2, 'sine'); },
    kill() { tone(880, 0.07, 0.2, 'sine'); tone(1320, 0.09, 0.2, 'sine', 0, 0.07); },
    hurt() { noise(0.15, 700, 0.35); tone(110, 0.14, 0.25, 'sawtooth', 60); },
    click() { tone(700, 0.03, 0.12, 'square'); },
    buy() { tone(660, 0.06, 0.16, 'sine'); tone(990, 0.08, 0.16, 'sine', 0, 0.06); },
    denied() { tone(220, 0.12, 0.16, 'square', 160); },
    plantBeep() { tone(1200, 0.08, 0.18, 'sine'); },
    defuseBeep() { tone(1000, 0.08, 0.18, 'sine'); tone(1000, 0.08, 0.18, 'sine', 0, 0.12); },
    explosion() {
      noise(0.9, 420, 0.9);
      tone(70, 0.8, 0.5, 'sine', 28);
      noise(0.4, 2400, 0.3, 'highpass', 0.05);
    },
    grenadePin() { tone(1100, 0.03, 0.12, 'square'); },
    roundWin() {
      tone(523, 0.12, 0.18, 'sine'); tone(659, 0.12, 0.18, 'sine', 0, 0.12);
      tone(784, 0.2, 0.2, 'sine', 0, 0.24);
    },
    roundLose() {
      tone(392, 0.14, 0.18, 'sine'); tone(311, 0.14, 0.18, 'sine', 0, 0.14);
      tone(233, 0.24, 0.2, 'sine', 0, 0.28);
    },
    step() { noise(0.03, 500, 0.06); },
  };
}
