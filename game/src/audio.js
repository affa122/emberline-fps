// Sound, all synthesized with WebAudio: no audio files ship in the game, so nothing
// is fetched and nothing can be a copy. One AudioContext, created on first input.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      // low ambient hum, started once and left running
      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 48;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.035;
      hum.connect(humGain);
      humGain.connect(master);
      hum.start();
      const wind = ctx.createBufferSource();
      wind.buffer = noiseBuffer;
      wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 220;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.02;
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      wind.start();
    } catch {
      return false;
    }
    return true;
  }

  function burst({ at = 0, duration = 0.12, filterType = 'lowpass', filterFreq = 1800, gain = 0.5, decay = 0.09 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5, duration);
    src.stop(t + duration + 0.05);
  }

  function tone({ at = 0, freq = 440, freqEnd = null, duration = 0.1, type = 'sine', gain = 0.3 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'marksman') {
        burst({ duration: 0.22, filterFreq: 1200, gain: 0.85, decay: 0.16 });
        tone({ freq: 160, freqEnd: 55, duration: 0.18, type: 'sine', gain: 0.5 });
      } else if (kind === 'smg') {
        burst({ duration: 0.08, filterFreq: 2600, gain: 0.42, decay: 0.06 });
        tone({ freq: 220, freqEnd: 90, duration: 0.07, gain: 0.22 });
      } else if (kind === 'sidearm') {
        burst({ duration: 0.09, filterFreq: 2200, gain: 0.5, decay: 0.07 });
        tone({ freq: 200, freqEnd: 80, duration: 0.08, gain: 0.25 });
      } else {
        burst({ duration: 0.14, filterFreq: 1500, gain: 0.65, decay: 0.11 });
        tone({ freq: 180, freqEnd: 60, duration: 0.12, gain: 0.35 });
      }
    },
    distantShot() {
      burst({ duration: 0.1, filterFreq: 900, gain: 0.16, decay: 0.08 });
    },
    dryFire() {
      tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.12 });
    },
    reload() {
      tone({ at: 0, freq: 900, duration: 0.04, type: 'square', gain: 0.1 });
      tone({ at: 0.25, freq: 700, duration: 0.04, type: 'square', gain: 0.1 });
      tone({ at: 0.55, freq: 1100, duration: 0.05, type: 'square', gain: 0.14 });
    },
    hit() {
      tone({ freq: 2400, duration: 0.045, type: 'square', gain: 0.14 });
    },
    kill() {
      tone({ freq: 1800, duration: 0.06, type: 'square', gain: 0.16 });
      tone({ at: 0.07, freq: 2400, duration: 0.09, type: 'square', gain: 0.16 });
    },
    hurt() {
      tone({ freq: 140, freqEnd: 70, duration: 0.16, gain: 0.3 });
    },
    step() {
      burst({ duration: 0.05, filterFreq: 500, gain: 0.06, decay: 0.045 });
    },
    grenadeThrow() {
      burst({ duration: 0.1, filterFreq: 800, gain: 0.2, decay: 0.08 });
    },
    explosion() {
      burst({ duration: 0.9, filterFreq: 500, gain: 1.0, decay: 0.8 });
      tone({ freq: 90, freqEnd: 28, duration: 0.8, gain: 0.7 });
    },
    beep(urgent) {
      tone({ freq: urgent ? 1500 : 1100, duration: 0.07, type: 'square', gain: 0.2 });
    },
    plantTick() {
      tone({ freq: 950, duration: 0.04, type: 'square', gain: 0.12 });
    },
    buy() {
      tone({ freq: 700, duration: 0.05, type: 'sine', gain: 0.18 });
      tone({ at: 0.06, freq: 1050, duration: 0.07, type: 'sine', gain: 0.18 });
    },
    denied() {
      tone({ freq: 220, duration: 0.1, type: 'square', gain: 0.14 });
      tone({ at: 0.11, freq: 180, duration: 0.12, type: 'square', gain: 0.14 });
    },
    roundWin() {
      tone({ freq: 523, duration: 0.12, gain: 0.22 });
      tone({ at: 0.12, freq: 659, duration: 0.12, gain: 0.22 });
      tone({ at: 0.24, freq: 784, duration: 0.22, gain: 0.24 });
    },
    roundLose() {
      tone({ freq: 392, duration: 0.14, gain: 0.2 });
      tone({ at: 0.14, freq: 330, duration: 0.14, gain: 0.2 });
      tone({ at: 0.28, freq: 262, duration: 0.24, gain: 0.2 });
    },
    flash() {
      tone({ freq: 3000, freqEnd: 1200, duration: 0.5, gain: 0.12 });
    },
  };
}
