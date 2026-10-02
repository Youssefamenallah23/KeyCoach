/**
 * Audio engine: one lazily-created AudioContext produces the piano.
 *
 * What makes this read as a piano rather than a tone generator:
 *
 *  1. Additive spectrum: per-partial sine oscillators with a 1/n^tilt amplitude
 *     roll-off, normalised across the bank so loudness is preset-independent.
 *  2. Stiff-string inharmonicity: each partial sits sharp of the perfect harmonic
 *     (see voicing.ts), which is what makes the treble read as bright, not dull.
 *  3. Three-string unison, detuned a few cents per strike, for the slow beating
 *     that reads as "piano". The spread is re-drawn every strike so repeats vary.
 *  4. A two-part hammer transient: a low thump plus a mid click, so the strike has
 *     body as well as edge.
 *  5. Brightness decay: high partials die first, so a note starts bright and
 *     settles warm, exactly like a struck string.
 *  6. Velocity coupling: louder strikes are brighter and harder; softer ones are
 *     darker and slower-sprung.
 *  7. A damper thud on key release, so releases read as real rather than silent.
 *  8. Register-dependent decay, stereo spread, and a procedurally generated
 *     convolution reverb, so it works offline with no sample downloads.
 *
 * A sample engine can later be added beside `noteOn` as an optional setting, with
 * this synth as the offline fallback (see README, "The sound engine").
 *
 * It also bridges `performance.now()` (keyboard event timeline) and
 * `AudioContext.currentTime` (audio timeline), and reports `outputLatency` so the
 * app can compensate for output buffering when scoring timing.
 */

import {
  MAX_CONCURRENT_VOICES,
  MAX_UNISON,
  VOICINGS,
  baseDecaySec,
  inharmonicPartial,
  mergeVoicing,
  partialAmplitude,
  partialDecayFactor,
  tunedFreq,
  DEFAULT_TUNING,
  type TuningState,
  type Voicing,
  type VoicingId,
  type VoicingOverrides,
} from './voicing';

/** Kept as a re-export so existing imports of the old profile ids still resolve. */
export type SoundProfileId = VoicingId;

interface Voice {
  tone: GainNode;
  oscs: OscillatorNode[];
  partialGains: GainNode[];
  noise: AudioBufferSourceNode | null;
  panner: StereoPannerNode;
  stop: (release: number) => void;
  killed: boolean;
  sustained: boolean;
}

interface MetroState {
  beatSec: number;
  nextBeat: number;
  beatIndex: number;
  startAudio: number;
  timer: ReturnType<typeof setInterval> | null;
  onBeat: ((beatIndex: number, audioTime: number) => void) | null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;

  // output chain
  private noteBus: GainNode | null = null;
  private clickBus: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private eq: BiquadFilterNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;

  private voices = new Map<number, Voice>();
  private metro: MetroState | null = null;

  private voicing: Voicing = VOICINGS.concert;
  private tuning: TuningState = { ...DEFAULT_TUNING };
  /** Sustained tone used by the tuning helper. Only one at a time. */
  private referenceTone: Voice | null = null;
  private referenceToneKey: number | null = null;

  private volume = 0.75;
  private metronomeVolume = 0.55;
  private muted = false;

  private perfAnchor = 0;
  private audioAnchor = 0;
  private lastVoicedAt = 0;

  /** Clock tick: keyboard and audio timelines share a rate, so one anchor pair is enough. */
  isReady(): boolean {
    return this.ctx !== null;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;

    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();

    // Output chain: notes -> dry -> eq, notes -> convolver -> wet -> eq,
    // clicks -> eq. Then eq -> comp -> limiter -> master -> destination.
    const noteBus = ctx.createGain();
    noteBus.gain.value = 1;
    const clickBus = ctx.createGain();
    clickBus.gain.value = 1;

    const dry = ctx.createGain();
    dry.gain.value = 0.86;

    const wet = ctx.createGain();
    wet.gain.value = 0.86;

    const convolver = ctx.createConvolver();
    convolver.buffer = this.buildImpulse(ctx, 2.0, 2.5);

    const eq = ctx.createBiquadFilter();
    eq.type = 'lowshelf';
    eq.frequency.value = 120;
    eq.gain.value = 1.8;

    const presence = ctx.createBiquadFilter();
    presence.type = 'highshelf';
    presence.frequency.value = 6500;
    presence.gain.value = 1.2;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 2.6;
    comp.attack.value = 0.006;
    comp.release.value = 0.24;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;

    noteBus.connect(dry);
    noteBus.connect(convolver);
    convolver.connect(wet);
    clickBus.connect(eq);
    dry.connect(eq);
    wet.connect(presence);
    presence.connect(eq);
    eq.connect(comp);
    comp.connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.noteBus = noteBus;
    this.clickBus = clickBus;
    this.dry = dry;
    this.wet = wet;
    this.convolver = convolver;
    this.eq = eq;
    this.comp = comp;
    this.limiter = limiter;
    this.master = master;
    this.noiseBuffer = this.buildNoise(ctx, 0.5);
    this.perfAnchor = performance.now();
    this.audioAnchor = ctx.currentTime;
    this.applyWet();
    return ctx;
  }

  /** Procedural room: decaying, darkened noise plus a few early reflections. */
  private buildImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    const early = [0.009, 0.017, 0.026, 0.038, 0.055, 0.081];

    for (let ch = 0; ch < 2; ch += 1) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i += 1) {
        const t = i / len;
        const noise = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        lp = lp * 0.6 + noise * 0.4; // darken the tail so it reads as a room
        data[i] = lp;
      }
      for (let k = 0; k < early.length; k += 1) {
        const idx = Math.floor((early[k] + (ch === 0 ? 0 : 0.0031)) * rate);
        if (idx < len) data[idx] += (k % 2 === 0 ? 0.55 : -0.42) * Math.pow(0.7, k);
      }
    }
    return buf;
  }

  private buildNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private applyWet(): void {
    const ctx = this.ctx;
    if (!ctx || !this.wet) return;
    this.wet.gain.setTargetAtTime(this.voicing.wet * 0.9, ctx.currentTime, 0.05);
  }

  /** Must be triggered by a user gesture. Never awaited in the hot path. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  nowAudio(): number {
    this.ensure();
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Convert a `performance.now()` timestamp into audio seconds. */
  toAudio(perfMs: number): number {
    this.ensure();
    return this.audioAnchor + (perfMs - this.perfAnchor) / 1000;
  }

  /**
   * Output latency in seconds: the gap between scheduling a sound and hearing it.
   * Subtracting this from a measured error removes the device's own buffering,
   * which is the honest way to report timing on an unknown machine.
   */
  outputLatency(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const withOutput = ctx as AudioContext & { outputLatency?: number };
    const value = withOutput.outputLatency ?? ctx.baseLatency ?? 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  /* -------------------------------------------------------------- controls */

  setVoicing(id: VoicingId, overrides?: VoicingOverrides): void {
    this.voicing = mergeVoicing(id, overrides);
    this.applyWet();
  }

  /** Apply a fully merged voicing. Used when settings hold user overrides. */
  applyVoicing(voicing: Voicing): void {
    this.voicing = voicing;
    this.applyWet();
  }

  getVoicing(): Voicing {
    return this.voicing;
  }

  /**
   * Set the tuning state. Takes effect on the next note, so a learner can hold a
   * tone and nudge the cents slider while it sounds.
   */
  setTuning(tuning: TuningState): void {
    this.tuning = { ...tuning };
  }

  getTuning(): TuningState {
    return { ...this.tuning };
  }

  /** Frequency a key will actually sound at, given the current tuning. */
  frequencyOf(midi: number): number {
    return tunedFreq(midi, this.tuning);
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    const ctx = this.ctx;
    if (ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, ctx.currentTime, 0.02);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.setVolume(this.volume);
  }

  /** Peak level of the last note, 0 to 1. Used by the volume meter in settings. */
  lastPeak(): number {
    return this.lastVoicedAt > 0 ? 1 : 0;
  }

  activeVoices(): number {
    return this.voices.size;
  }

  /* ---------------------------------------------------------------- voices */

  noteOn(midi: number, velocity = 0.85, options: { sustain?: boolean } = {}): void {
    const ctx = this.ensure();
    if (!ctx || !this.noteBus) return;

    // Retrigger safety: a real key strike damps the previous vibration.
    this.stopVoice(midi, 0.012);
    this.enforceVoiceLimit();

    const voicing = this.voicing;
    const sustain = options.sustain === true;
    const t = ctx.currentTime + 0.002;
    const vel = clamp(velocity, 0.06, 1);

    // Pitch, with the A4 reference, the fine offset and the Railsback stretch.
    const f0 = tunedFreq(midi, this.tuning);

    // Low notes lean left, high notes lean right, as heard from the bench.
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp((midi - 60) / 46, -0.32, 0.32);

    // Overall envelope. The individual partials add their own decay on top.
    const tone = ctx.createGain();
    const peak = 0.24 + 0.6 * vel;
    const naturalDecay = sustain ? 40 : baseDecaySec(midi) * voicing.decay;
    tone.gain.setValueAtTime(0.0001, t);
    tone.gain.linearRampToValueAtTime(peak, t + voicing.attack);
    tone.gain.exponentialRampToValueAtTime(Math.max(peak * 0.42, 0.0002), t + 0.16);
    tone.gain.exponentialRampToValueAtTime(
      Math.max(peak * (sustain ? 0.5 : 0.02), 0.00015),
      t + naturalDecay,
    );

    // A gentle filter for warmth. The brightness decay now comes from the partial
    // envelopes, which is how a real string behaves, so this no longer sweeps hard.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.5;
    const cutoff = Math.min(f0 * voicing.filterOpen * (0.6 + vel * 0.7), 18000);
    filter.frequency.setValueAtTime(Math.max(cutoff, 800), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(f0 * 3, 400), t + naturalDecay * 0.6);

    filter.connect(tone);
    tone.connect(panner);
    panner.connect(this.noteBus);

    const oscs: OscillatorNode[] = [];
    const partialGains: GainNode[] = [];

    // Normalise across the bank, so loudness does not depend on the preset.
    let ampSum = 0;
    for (let n = 1; n <= voicing.partials; n += 1) ampSum += partialAmplitude(n, voicing);
    const norm = ampSum > 0 ? 1 / ampSum : 1;

    const unisonCount = sustain ? 1 : Math.max(1, Math.min(MAX_UNISON, voicing.unison));

    for (let u = 0; u < unisonCount; u += 1) {
      // Draw the unison spread per strike, so repeated notes are never identical.
      const spread =
        u === 0 ? 0 : (u % 2 === 1 ? 1 : -1) * voicing.unisonCents * (0.7 + Math.random() * 0.6);

      for (let n = 1; n <= voicing.partials; n += 1) {
        // Stiff string: partial n sits sharp of the perfect harmonic.
        const partialHz = inharmonicPartial(f0, n, voicing.inharmonicity);
        if (partialHz > 18000) break;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(partialHz, t);
        osc.detune.setValueAtTime(spread, t);

        const g = ctx.createGain();
        // Louder strikes hit harder: upper partials gain more than the fundamental,
        // which is what makes a forte read as bright rather than just loud. A small
        // per-strike jitter keeps repeated notes from sounding identical.
        const velLift = n === 1 ? 1 : 1 + Math.max(0, vel - 0.55) * (n - 1) * 0.16;
        const jitter = 1 + (Math.random() - 0.5) * 0.05;
        const amp = partialAmplitude(n, voicing) * norm * vel * velLift * jitter;
        // High partials die first: the note starts bright and settles warm.
        const partialLife = sustain
          ? 40
          : Math.max(0.08, naturalDecay * partialDecayFactor(n, voicing));
        // Soft notes are softer-sprung: the attack slows as velocity falls.
        const attack = voicing.attack * (n > 6 ? 0.7 : 1) * (1.5 - vel * 0.5);

        g.gain.setValueAtTime(0.000001, t);
        g.gain.linearRampToValueAtTime(Math.max(amp, 0.000001), t + attack);
        g.gain.exponentialRampToValueAtTime(Math.max(amp * 0.0006, 0.000001), t + partialLife);

        osc.connect(g);
        g.connect(filter);
        osc.start(t);
        oscs.push(osc);
        partialGains.push(g);
      }
    }

    // Hammer transient: a low thump plus a mid click, so the strike has body as
    // well as edge. Both are short filtered noise bursts drawn from one buffer.
    let noise: AudioBufferSourceNode | null = null;
    if (this.noiseBuffer && voicing.noise > 0 && !sustain) {
      const thumpSrc = ctx.createBufferSource();
      thumpSrc.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(Math.max(f0 * 1.6, 140), 520);
      const tg = ctx.createGain();
      const thump = voicing.noise * (0.18 + vel * 0.5);
      tg.gain.setValueAtTime(0.0001, t);
      tg.gain.linearRampToValueAtTime(thump, t + 0.001);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      thumpSrc.connect(lp);
      lp.connect(tg);
      tg.connect(panner);
      thumpSrc.start(t);
      thumpSrc.stop(t + 0.06);

      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(f0 * 9 + 900, 9000);
      bp.Q.value = 0.9;
      const ng = ctx.createGain();
      const amount = voicing.noise * (0.18 + vel * 0.8);
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(amount, t + 0.001);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      clickSrc.connect(bp);
      bp.connect(ng);
      ng.connect(panner);
      clickSrc.start(t);
      clickSrc.stop(t + 0.06);
      noise = clickSrc;
    }

    this.voices.set(midi, {
      tone,
      oscs,
      partialGains,
      noise,
      panner,
      killed: false,
      sustained: sustain,
      stop: (release: number) => this.stopVoice(midi, release),
    });
    this.lastVoicedAt = t;
  }

  /** Oldest-first voice stealing, so a stuck key cannot exhaust the graph. */
  private enforceVoiceLimit(): void {
    if (this.voices.size < MAX_CONCURRENT_VOICES) return;
    const keys = Array.from(this.voices.keys());
    const excess = this.voices.size - MAX_CONCURRENT_VOICES + 1;
    for (let i = 0; i < excess && i < keys.length; i += 1) {
      this.stopVoice(keys[i], 0.06);
    }
  }

  /**
   * A steady tone for tuning against a reference recording.
   *
   * Sustained rather than struck, because the job is to hear the beating between
   * this note and the recording, and a decaying note makes that harder every
   * second. Only one at a time.
   */
  startReferenceTone(midi: number, velocity = 0.4): void {
    this.stopReferenceTone();
    this.noteOn(midi, velocity, { sustain: true });
    this.referenceToneKey = this.voices.has(midi) ? midi : null;
  }

  stopReferenceTone(): void {
    if (this.referenceToneKey !== null) this.stopVoice(this.referenceToneKey, 0.08);
    this.referenceTone = null;
    this.referenceToneKey = null;
  }

  isReferenceToneOn(): boolean {
    return this.referenceToneKey !== null;
  }

  /** Key release. A piano damper stops the string quickly, not instantly. */
  noteOff(midi: number, release = 0.22): void {
    this.stopVoice(midi, release);
  }

  private stopVoice(midi: number, release: number): void {
    const ctx = this.ctx;
    const voice = this.voices.get(midi);
    if (!ctx || !voice || voice.killed) return;

    voice.killed = true;
    const t = ctx.currentTime;
    const current = Math.max(voice.tone.gain.value, 0.0002);

    // A returning damper makes a faint thud; adding it makes releases read as real
    // instead of silently stopping. Skipped for retriggers and the tuning tone.
    if (release >= 0.05 && !voice.sustained && this.noiseBuffer) {
      const damper = ctx.createBufferSource();
      damper.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.linearRampToValueAtTime(0.05, t + 0.002);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      damper.connect(lp);
      lp.connect(dg);
      dg.connect(voice.panner);
      damper.start(t);
      damper.stop(t + 0.07);
    }

    voice.tone.gain.cancelScheduledValues(t);
    voice.tone.gain.setValueAtTime(current, t);
    voice.tone.gain.exponentialRampToValueAtTime(0.00012, t + release);

    const stopAt = t + release + 0.06;
    for (const osc of voice.oscs) {
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    if (voice.noise) {
      try {
        voice.noise.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    this.voices.delete(midi);
  }

  allOff(): void {
    this.referenceTone = null;
    this.referenceToneKey = null;
    for (const midi of Array.from(this.voices.keys())) this.stopVoice(midi, 0.08);
  }

  /* ------------------------------------------------------------ metronome */

  setMetronomeVolume(v: number): void {
    this.metronomeVolume = clamp01(v);
  }

  isMetronomeRunning(): boolean {
    return this.metro !== null;
  }

  /**
   * Clicks are scheduled ahead on the audio clock (sample accurate, immune to JS
   * timer drift) while the UI beat callback fires from a JS timer so the display
   * can pulse in step. Clicks skip the reverb bus: a smeared click is a bad timing
   * cue.
   */
  startMetronome(
    bpm: number,
    onBeat?: (beatIndex: number, audioTime: number) => void,
  ): MetronomeOrigin | null {
    const ctx = this.ensure();
    if (!ctx || !this.clickBus) return null;

    this.stopMetronome();

    const beatSec = 60 / clamp(bpm, 30, 240);
    const startAudio = ctx.currentTime + 0.16;

    const state: MetroState = {
      beatSec,
      nextBeat: startAudio,
      beatIndex: 0,
      startAudio,
      timer: null,
      onBeat: onBeat ?? null,
    };

    const lookahead = 0.14;

    const tick = () => {
      const c = this.ctx;
      if (!c || this.metro !== state) return;
      while (state.nextBeat < c.currentTime + lookahead) {
        const accent = state.beatIndex % 4 === 0;
        this.click(state.nextBeat, accent);

        const beat = state.beatIndex;
        const at = state.nextBeat;
        const delayMs = Math.max(0, (at - c.currentTime) * 1000);
        setTimeout(() => {
          if (this.metro === state) state.onBeat?.(beat, at);
        }, delayMs);

        state.beatIndex += 1;
        state.nextBeat += beatSec;
      }
    };

    state.timer = setInterval(tick, 25);
    tick();
    this.metro = state;

    return { startAudio, beatSec };
  }

  private click(audioTime: number, accent: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.clickBus) return;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1568 : 1046, audioTime);

    const gain = ctx.createGain();
    const peak = Math.max(0.0002, this.metronomeVolume * (accent ? 0.5 : 0.28));
    gain.gain.setValueAtTime(0.0001, audioTime);
    gain.gain.linearRampToValueAtTime(peak, audioTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioTime + 0.06);

    osc.connect(gain);
    gain.connect(this.clickBus);
    osc.start(audioTime);
    osc.stop(audioTime + 0.08);
  }

  stopMetronome(): void {
    if (this.metro?.timer) clearInterval(this.metro.timer);
    this.metro = null;
  }

  /** Beat 0 of the running metronome, in audio seconds. Null when stopped. */
  metronomeOrigin(): MetronomeOrigin | null {
    if (!this.metro) return null;
    return { startAudio: this.metro.startAudio, beatSec: this.metro.beatSec };
  }

  /** Metronome position in beats, for count-ins and UI pulses. */
  metronomeBeat(atAudioTime?: number): number | null {
    if (!this.metro) return null;
    const now = atAudioTime ?? this.nowAudio();
    return (now - this.metro.startAudio) / this.metro.beatSec;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export interface MetronomeOrigin {
  startAudio: number;
  beatSec: number;
}

let engine: AudioEngine | null = null;

/** Singleton so the whole app shares one AudioContext. */
export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}