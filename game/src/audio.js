// Skyridge Courier — synthesised sound.
// One clear job: every sound the game makes, built from oscillators and
// filtered noise at run time. No audio files, no network, nothing to load.

export function createSounds() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let masterGain = null;
  let muted = false;
  let started = false;

  // Build the audio graph on the first user gesture (browsers demand it).
  function ensureStarted() {
    if (started) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.5;
      masterGain.connect(ctx.destination);

      // Engine: two detuned sawtooths through a low-pass filter.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(masterGain);
      engineOsc.start();
      engineOsc2.start();

      // Wind: looped white noise through a band-pass filter.
      const noiseLength = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(masterGain);
      noise.start();

      started = true;
    } catch (err) {
      // No audio on this machine: the game plays on silently.
      started = false;
    }
  }

  // Continuous engine and wind, following throttle and airspeed.
  function updateEngine(throttle, speedMs, airborne) {
    if (!started || !ctx) return;
    const now = ctx.currentTime;
    const rpm = 52 + throttle * 68;
    engineOsc.frequency.setTargetAtTime(rpm, now, 0.08);
    engineOsc2.frequency.setTargetAtTime(rpm * 1.007 + 1.5, now, 0.08);
    engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.075 : throttle * 0.06, now, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.16, (speedMs / 96) * 0.16), now, 0.15);
    windFilter.frequency.setTargetAtTime(500 + speedMs * 9, now, 0.15);
  }

  function blip(frequency, duration, type, volume, when = 0) {
    if (!started || !ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function chime() {
    blip(660, 0.35, 'sine', 0.22);
    blip(880, 0.4, 'sine', 0.2, 0.09);
    blip(1320, 0.5, 'sine', 0.14, 0.18);
  }

  function thud() {
    if (!started || !ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + 0.35);
  }

  function crash() {
    if (!started || !ctx) return;
    const t0 = ctx.currentTime;
    const noiseLength = ctx.sampleRate * 0.7;
    const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(t0);
    blip(70, 0.5, 'sine', 0.4);
  }

  function takeoff() {
    blip(520, 0.25, 'triangle', 0.15);
    blip(780, 0.3, 'triangle', 0.12, 0.1);
  }

  function click() {
    blip(1200, 0.07, 'square', 0.08);
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain && ctx) masterGain.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
    return muted;
  }

  return { ensureStarted, updateEngine, chime, thud, crash, takeoff, click, toggleMute };
}
