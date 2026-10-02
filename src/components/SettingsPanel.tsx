'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine, type SoundProfileId } from '@/lib/audio';
import {
  A4_PRESETS,
  TUNING_REFERENCE_NOTES,
  VOICING_LIST,
  centsBetween,
  describeTuning,
  mergeVoicing,
  partialSharpnessCents,
  type VoicingOverrides,
} from '@/lib/voicing';
import { LAYOUT_CHOICES, type LayoutId } from '@/lib/keyboardLayout';
import { noteLabel } from '@/lib/notes';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import { useProgress } from '@/lib/progress';
import { useSettings } from '@/lib/settings';
import { eventTimestamp } from '@/lib/notes';

const CALIBRATION_BPM = 80;
const CALIBRATION_TAPS = 8;

export default function SettingsPanel() {
  const engine = getAudioEngine();
  const layout = useKeyboardLayout();

  const layoutId = useSettings((s) => s.layoutId);
  const setLayoutId = useSettings((s) => s.setLayoutId);
  const learnedLabels = useSettings((s) => s.learnedLabels);
  const showKeyHints = useSettings((s) => s.showKeyHints);
  const setShowKeyHints = useSettings((s) => s.setShowKeyHints);
  const showNoteNames = useSettings((s) => s.showNoteNames);
  const setShowNoteNames = useSettings((s) => s.setShowNoteNames);

  const voicingId = useSettings((s) => s.voicing);
  const setVoicing = useSettings((s) => s.setVoicing);
  const voicingOverrides = useSettings((s) => s.voicingOverrides);
  const setVoicingOverride = useSettings((s) => s.setVoicingOverride);
  const tuning = useSettings((s) => s.tuning);
  const setTuning = useSettings((s) => s.setTuning);
  const resetVoicing = useSettings((s) => s.resetVoicing);

  const masterVolume = useSettings((s) => s.masterVolume);
  const setMasterVolume = useSettings((s) => s.setMasterVolume);
  const metronomeVolume = useSettings((s) => s.metronomeVolume);
  const setMetronomeVolume = useSettings((s) => s.setMetronomeVolume);
  const muted = useSettings((s) => s.muted);
  const setMuted = useSettings((s) => s.setMuted);

  const latencyCompensation = useSettings((s) => s.latencyCompensation);
  const setLatencyCompensation = useSettings((s) => s.setLatencyCompensation);
  const latencyOffsetMs = useSettings((s) => s.latencyOffsetMs);
  const setLatencyOffsetMs = useSettings((s) => s.setLatencyOffsetMs);

  const reducedMotion = useSettings((s) => s.reducedMotion);
  const setReducedMotion = useSettings((s) => s.setReducedMotion);

  const timingDisplay = useSettings((s) => s.timingDisplay);
  const setTimingDisplay = useSettings((s) => s.setTimingDisplay);
  const practiceMode = useSettings((s) => s.practiceMode);
  const setPracticeMode = useSettings((s) => s.setPracticeMode);
  const listenFirst = useSettings((s) => s.listenFirst);
  const setListenFirst = useSettings((s) => s.setListenFirst);
  const showReferenceSongs = useSettings((s) => s.showReferenceSongs);
  const setShowReferenceSongs = useSettings((s) => s.setShowReferenceSongs);

  const resetProgress = useProgress((s) => s.reset);
  const attemptCount = useProgress((s) => s.attempts.length);
  const resetSettings = useSettings((s) => s.resetSettings);

  const [measuredLatency, setMeasuredLatency] = useState<number | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);

  // Tuning helper state.
  const [referenceOn, setReferenceOn] = useState(false);
  const [referenceMidi, setReferenceMidi] = useState(69);

  /** The voicing actually in force: preset merged with the user's overrides. */
  const current = mergeVoicing(voicingId, voicingOverrides);

  const beatTimesRef = useRef<number[]>([]);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    engine.applyVoicing(mergeVoicing(voicingId, voicingOverrides));
    engine.setTuning(tuning);
  }, [engine, tuning, voicingId, voicingOverrides]);

  useEffect(() => {
    engine.setVolume(masterVolume);
    engine.setMuted(muted);
    engine.setMetronomeVolume(metronomeVolume);
  }, [engine, masterVolume, metronomeVolume, muted]);

  useEffect(() => {
    setMeasuredLatency(Math.round(engine.outputLatency() * 1000));
  }, [engine]);

  /* -------------------------------------------------------- calibration */

  const stopCalibration = useCallback(() => {
    engine.stopMetronome();
    setCalibrating(false);
  }, [engine]);

  const finishCalibration = useCallback(() => {
    const values = [...tapsRef.current].sort((a, b) => a - b);
    engine.stopMetronome();
    setCalibrating(false);
    if (values.length === 0) return;
    const median = values[Math.floor(values.length / 2)];
    setTaps(values);
    const measured = engine.outputLatency() * 1000;
    // The learner taps to what they hear, so the median already contains the
    // device delay. Only the remainder needs a manual correction.
    setLatencyOffsetMs(Math.round(median - measured));
  }, [engine, setLatencyOffsetMs]);

  const startCalibration = useCallback(() => {
    engine.unlock();
    engine.setMetronomeVolume(metronomeVolume);
    beatTimesRef.current = [];
    tapsRef.current = [];
    setTaps([]);
    setCalibrating(true);

    engine.startMetronome(CALIBRATION_BPM, (beat, audioTime) => {
      beatTimesRef.current.push(audioTime);
    });
  }, [engine, metronomeVolume]);

  useEffect(() => {
    if (!calibrating) return undefined;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      const at = engine.toAudio(eventTimestamp(e)) - engine.outputLatency();
      const beats = beatTimesRef.current;
      if (beats.length === 0) return;
      let nearest = beats[0];
      for (const b of beats) {
        if (Math.abs(b - at) < Math.abs(nearest - at)) nearest = b;
      }
      tapsRef.current.push((at - nearest) * 1000);
      if (tapsRef.current.length >= CALIBRATION_TAPS) finishCalibration();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [calibrating, engine, finishCalibration]);

  useEffect(() => () => engine.stopMetronome(), [engine]);

  const meanTap = taps.length === 0 ? null : taps.reduce((a, b) => a + b, 0) / taps.length;
  const spread = taps.length < 2 ? null : Math.max(...taps) - Math.min(...taps);

  /* ------------------------------------------------------------- layout */

  const learnedCount = Object.keys(learnedLabels).length;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- keyboard */}
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label-xs">Keyboard layout</p>
          <span className={layout.exact ? 'chip-amber' : 'chip'}>
            {layout.exact ? 'read from your browser' : 'from presets and key presses'}
          </span>
        </div>

        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Keys are labelled with the legends printed on your own keyboard. The mapping stays
          positional, so the shape is the same on every layout. Currently showing{' '}
          <span className="font-mono text-amber-soft">{layout.effectiveLayout.toUpperCase()}</span>.
          {learnedCount > 0
            ? ` Learned ${learnedCount} key legends from your own presses.`
            : ' Press a few keys and the app will read your layout automatically.'}
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {LAYOUT_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={layoutId === choice.id}
              onClick={() => setLayoutId(choice.id as LayoutId)}
              className={[
                'rounded-xl border px-3 py-2 text-left transition duration-150 motion-reduce:transition-none',
                layoutId === choice.id
                  ? 'border-amber bg-amber/10'
                  : 'border-line/70 bg-panel2/40 hover:border-amber/50',
              ].join(' ')}
            >
              <span className="block text-sm font-semibold text-ink">{choice.label}</span>
              <span className="block text-[11px] leading-tight text-muted">{choice.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Show key legends on the piano"
            checked={showKeyHints}
            onChange={setShowKeyHints}
          />
          <Toggle
            label="Show note names on the piano"
            checked={showNoteNames}
            onChange={setShowNoteNames}
          />
        </div>

        <div className="mt-3 rounded-xl border border-line/60 bg-panel2/30 p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">Your white keys</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { midi: 60, name: 'C' },
              { midi: 62, name: 'D' },
              { midi: 64, name: 'E' },
              { midi: 65, name: 'F' },
              { midi: 67, name: 'G' },
              { midi: 69, name: 'A' },
              { midi: 71, name: 'B' },
              { midi: 72, name: 'C' },
            ].map((item) => (
              <span
                key={item.midi}
                className="inline-flex items-center gap-1 rounded-lg border border-line/70 bg-bg2/60 px-1.5 py-0.5"
              >
                <span className="font-mono text-[12px] font-bold text-ink">
                  {layout.labelForMidi(item.midi) ?? '-'}
                </span>
                <span className="text-[10px] text-muted">{item.name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* SOUND_SECTION */}
      <section className="panel p-4">
        <p className="label-xs">Feedback and practice</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2">
            <span className="label-xs">How timing is reported</span>
            <div className="mt-1.5 flex gap-1 rounded-lg border border-line/70 bg-bg2/50 p-0.5">
              {(['words', 'numbers'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={timingDisplay === mode}
                  onClick={() => setTimingDisplay(mode)}
                  className={[
                    'flex-1 rounded-md px-2 py-1 text-[12px] font-semibold transition duration-150 motion-reduce:transition-none',
                    timingDisplay === mode
                      ? 'bg-amber text-[#201704]'
                      : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {mode === 'words' ? 'Plain words' : 'Milliseconds'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              {timingDisplay === 'words'
                ? 'You get "a bit late" instead of "+180 ms". Recommended unless you already read timing numbers.'
                : 'Raw signed milliseconds, for learners who want the number.'}
            </p>
          </div>

          <div className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2">
            <span className="label-xs">Default way to start a lesson</span>
            <div className="mt-1.5 flex gap-1 rounded-lg border border-line/70 bg-bg2/50 p-0.5">
              {(['listen', 'echo', 'together'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={practiceMode === mode}
                  onClick={() => setPracticeMode(mode)}
                  className={[
                    'flex-1 rounded-md px-2 py-1 text-[12px] font-semibold capitalize transition duration-150 motion-reduce:transition-none',
                    practiceMode === mode ? 'bg-amber text-[#201704]' : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              Listen plays it for you. Echo is listen then play. Together plays a quiet guide under
              you while you play.
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Suggest listening before the first attempt"
            checked={listenFirst}
            onChange={setListenFirst}
          />
          <Toggle
            label="Show the copyrighted reference arrangements"
            checked={showReferenceSongs}
            onChange={setShowReferenceSongs}
          />
        </div>
        {showReferenceSongs ? (
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Showing Interstellar and Runaway. These are simplified single-hand reductions for private
            study, still in copyright, and kept out of your schedule and statistics.
          </p>
        ) : null}
      </section>
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label-xs">Piano sound and tuning</p>
          <span className="chip">A4 {tuning.a4Hz.toFixed(1)} Hz</span>
        </div>

        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Two separate things. <span className="text-ink">Voicing</span> is the tone: how hard
          the attack is and how strong the upper partials are. A real piano string is stiff, so
          its partials are stretched sharp of the harmonic series, and that is what makes a
          piano sound hard or metallic rather than soft.{' '}
          <span className="text-ink">Tuning</span> is where the pitches sit.
        </p>

        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          If you are matching a recording, remember that a video played at anything other than
          1x speed shifts the pitch. Check that first.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {VOICING_LIST.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={voicingId === v.id}
              onClick={() => {
                engine.unlock();
                setVoicing(v.id);
                engine.setVoicing(v.id, {});
                engine.noteOn(64, 0.8);
              }}
              className={[
                'rounded-xl border px-3 py-2 text-left transition duration-150 motion-reduce:transition-none',
                voicingId === v.id
                  ? 'border-amber bg-amber/10'
                  : 'border-line/70 bg-panel2/40 hover:border-amber/50',
              ].join(' ')}
            >
              <span className="block text-sm font-semibold text-ink">{v.label}</span>
              <span className="block text-[11px] leading-tight text-muted">{v.blurb}</span>
            </button>
          ))}
        </div>

        {/* VOICING_SLIDERS */}
        <div className="mt-4 rounded-xl border border-line/60 bg-panel2/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label-xs">Tone controls</span>
            <button
              type="button"
              className="btn py-1 text-[11px]"
              onClick={() => {
                resetVoicing();
                engine.setVoicing('concert', {});
              }}
            >
              Reset all
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Slider
              label="Metallic edge (stiffness)"
              value={voicingOverrides.inharmonicity ?? current.inharmonicity}
              min={0}
              max={0.03}
              step={0.0005}
              format={(v) => {
                const cents = partialSharpnessCents(8, v);
                return `${Math.round(cents)} c at partial 8`;
              }}
              onChange={(v) => setVoicingOverride('inharmonicity', v)}
            />
            <Slider
              label="Brightness (upper partials)"
              value={voicingOverrides.brightness ?? current.brightness}
              min={0.2}
              max={3}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={(v) => setVoicingOverride('brightness', v)}
            />
            <Slider
              label="Attack hardness"
              value={voicingOverrides.attack ?? current.attack}
              min={0.0005}
              max={0.03}
              step={0.0005}
              format={(v) => `${(v * 1000).toFixed(1)} ms`}
              onChange={(v) => setVoicingOverride('attack', v)}
            />
            <Slider
              label="Unison spread (wobble)"
              value={voicingOverrides.unisonCents ?? current.unisonCents}
              min={0}
              max={60}
              step={1}
              format={(v) => `${v} cents`}
              onChange={(v) => setVoicingOverride('unisonCents', v)}
            />
            <Slider
              label="Reverb"
              value={voicingOverrides.wet ?? current.wet}
              min={0}
              max={0.8}
              step={0.02}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => setVoicingOverride('wet', v)}
            />
            <Slider
              label="Partial count"
              value={voicingOverrides.partials ?? current.partials}
              min={4}
              max={18}
              step={1}
              format={(v) => `${v}`}
              onChange={(v) => setVoicingOverride('partials', v)}
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Metallic edge is the one to reach for first. It stretches every partial sharp, which is
            what makes a real piano cut through, and it is measured above in cents at the eighth
            partial so you can see what you are doing.
          </p>
        </div>

        {/* TUNING_BLOCK */}
        <div className="mt-4 rounded-xl border border-amber/30 bg-amber/[0.06] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-amber-soft">
              Tune against the video
            </span>
            <button
              type="button"
              className={`btn py-1.5 ${referenceOn ? 'btn-primary' : ''}`}
              onClick={() => {
                if (referenceOn) {
                  engine.stopReferenceTone();
                  setReferenceOn(false);
                } else {
                  engine.unlock();
                  engine.startReferenceTone(referenceMidi, 0.4);
                  setReferenceOn(true);
                }
              }}
            >
              {referenceOn ? 'Stop the tone' : `Hold ${noteLabel(referenceMidi)}`}
            </button>
          </div>

          <p className="mt-2 text-[12px] leading-snug text-muted">
            This is how you match a recording when nobody can hear it for you. Hold this steady tone
            while the video plays. When the two are slightly out of tune you will hear a slow wobble
            that speeds up as they get closer and disappears when they match. Slide the fine pitch
            until the wobble stops.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {TUNING_REFERENCE_NOTES.map((n) => (
              <button
                key={n.midi}
                type="button"
                title={n.why}
                aria-pressed={referenceMidi === n.midi}
                onClick={() => {
                  setReferenceMidi(n.midi);
                  if (referenceOn) engine.startReferenceTone(n.midi, 0.4);
                }}
                className={[
                  'rounded-md border px-2 py-1 font-mono text-[11px] font-semibold transition duration-150 motion-reduce:transition-none',
                  referenceMidi === n.midi
                    ? 'border-amber bg-amber/15 text-amber-soft'
                    : 'border-line/70 bg-panel2/40 text-muted hover:text-ink',
                ].join(' ')}
              >
                {n.label}
              </button>
            ))}
          </div>

          {/* TUNING_SLIDERS */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2">
              <span className="label-xs">Fine pitch</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={tuning.pitchOffsetCents}
                  onChange={(e) => setTuning({ pitchOffsetCents: Number(e.target.value) })}
                  className="h-1 flex-1 accent-[#e9b055]"
                  aria-label="Fine pitch offset in cents"
                />
                <span className="tabular w-16 text-right font-mono text-[12px] text-ink">
                  {tuning.pitchOffsetCents > 0 ? '+' : ''}
                  {tuning.pitchOffsetCents} c
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Shifts the whole piano uniformly. For a sharper feel, try +20 to +50.
              </p>
            </div>

            <div className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2">
              <span className="label-xs">A4 reference</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={415}
                  max={466}
                  step={0.5}
                  value={tuning.a4Hz}
                  onChange={(e) => setTuning({ a4Hz: Number(e.target.value) })}
                  className="h-1 flex-1 accent-[#e9b055]"
                  aria-label="A4 reference frequency"
                />
                <span className="tabular w-20 text-right font-mono text-[12px] text-ink">
                  {tuning.a4Hz.toFixed(1)} Hz
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {A4_PRESETS.map((p) => (
                  <button
                    key={p.hz}
                    type="button"
                    aria-pressed={Math.abs(tuning.a4Hz - p.hz) < 0.3}
                    onClick={() => setTuning({ a4Hz: p.hz })}
                    className={[
                      'rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition duration-150 motion-reduce:transition-none',
                      Math.abs(tuning.a4Hz - p.hz) < 0.3
                        ? 'border-amber bg-amber/15 text-amber-soft'
                        : 'border-line/70 text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2 sm:col-span-2">
              <span className="label-xs">Railsback stretch</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={-10}
                  max={25}
                  step={0.5}
                  value={tuning.stretchCentsPerOctave}
                  onChange={(e) => setTuning({ stretchCentsPerOctave: Number(e.target.value) })}
                  className="h-1 flex-1 accent-[#e9b055]"
                  aria-label="Tuning stretch in cents per octave"
                />
                <span className="tabular w-24 text-right font-mono text-[12px] text-ink">
                  {tuning.stretchCentsPerOctave.toFixed(1)} c/oct
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Real pianos are not tuned to mathematically exact octaves. The octave is tuned to the
                sharpened second partial instead, so the treble ends up sharp and the bass flat. That
                is why a real piano sounds brighter at the top than a synth set to exact octaves.
                Around 6 cents per octave is typical for a small instrument.
              </p>
            </div>
          </div>

          <p className="mt-3 text-[12px] leading-snug text-ink">{describeTuning(tuning)}</p>
          <p className="mt-1 text-[11px] text-muted">
            C4 sounds at {engine.frequencyOf(60).toFixed(2)} Hz, which is{' '}
            {Math.round(centsBetween(engine.frequencyOf(60), 261.6256))} cents from equal temperament
            at 440.
          </p>
        </div>
      </section>
      <section className="panel p-4">
        <p className="label-xs">Volume</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Slider
            label="Piano volume"
            value={masterVolume}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setMasterVolume}
          />
          <Slider
            label="Metronome volume"
            value={metronomeVolume}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setMetronomeVolume}
          />
          <Toggle label="Mute everything" checked={muted} onChange={setMuted} />
        </div>
      </section>
      {/* TIMING_SECTION */}
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label-xs">Timing and latency</p>
          <span className="chip">
            device reports {measuredLatency === null ? 'n/a' : `${measuredLatency} ms`}
          </span>
        </div>

        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Your device plays a note slightly after the browser schedules it. Without compensation your
          timing score is measured against what was scheduled, not what you heard, so you get blamed
          for your own hardware. Compensation subtracts the reported output latency, then any manual
          offset measured here.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Compensate output latency"
            checked={latencyCompensation}
            onChange={setLatencyCompensation}
          />
          <div className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2">
            <span className="label-xs">Manual offset</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={-250}
                max={250}
                step={5}
                value={latencyOffsetMs}
                onChange={(e) => setLatencyOffsetMs(Number(e.target.value))}
                className="h-1 flex-1 accent-[#e9b055]"
                aria-label="Manual latency offset in milliseconds"
              />
              <span className="tabular w-16 text-right font-mono text-[12px] text-ink">
                {latencyOffsetMs > 0 ? '+' : ''}
                {latencyOffsetMs} ms
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-line/60 bg-panel2/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-ink">Calibration</span>
            <button
              type="button"
              className={`btn py-1.5 ${calibrating ? 'btn-primary' : ''}`}
              onClick={() => (calibrating ? stopCalibration() : startCalibration())}
            >
              {calibrating ? 'Stop' : 'Calibrate'}
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-muted">
            {calibrating
              ? `Tap the space bar on each click. ${CALIBRATION_TAPS - taps.length} taps left.`
              : `A metronome runs at ${CALIBRATION_BPM} BPM. Tap the space bar on the click eight times. The median error becomes your offset.`}
          </p>
          {meanTap !== null && !calibrating ? (
            <p className="mt-2 text-[12px] leading-snug text-ink">
              Median tap error{' '}
              <span className="font-mono text-amber-soft">{Math.round(meanTap)} ms</span>
              {spread !== null ? (
                <>
                  , spread <span className="font-mono">{Math.round(spread)} ms</span>
                </>
              ) : null}
              .{' '}
              {spread !== null && spread > 160
                ? 'That spread is wide, so the measurement is noisy. Try again when you can concentrate.'
                : 'Offset applied to your timing scores.'}
            </p>
          ) : null}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Even with this, do not read a single-digit millisecond result as precise. Keyboard event
          timestamps, the event loop and the audio buffer all contribute tens of milliseconds of
          jitter.
        </p>
      </section>
      {/* DATA_SECTION */}
      <section className="panel p-4">
        <p className="label-xs">Interface</p>
        <div className="mt-3">
          <Toggle
            label="Reduce motion in this app"
            checked={reducedMotion}
            onChange={setReducedMotion}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          The app already follows your operating system setting. This forces it on regardless.
        </p>
      </section>

      <section className="panel p-4">
        <p className="label-xs">Data and privacy</p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted">
          <li>
            Everything stays in this browser. Attempt history, scores, XP, streaks and preferences are
            stored in <span className="font-mono text-ink">localStorage</span> under{' '}
            <span className="font-mono text-ink">keycoach.progress.v2</span> and{' '}
            <span className="font-mono text-ink">keycoach.settings.v1</span>.
          </li>
          <li>
            No account, no analytics, no cookies, no third-party requests. MIDI files you load are
            parsed in memory and never uploaded.
          </li>
          <li>
            The only outbound request the app can make is the optional teacher call, and only if you
            configure an API key on the server. It sends a summary of your weak notes, not your
            history.
          </li>
        </ul>

        <p className="mt-3 text-[12px] text-muted">
          {attemptCount} attempt{attemptCount === 1 ? '' : 's'} stored.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (confirm('Delete all scores, XP, streaks and attempt history?')) resetProgress();
            }}
          >
            Reset progress
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('Reset all preferences, including the keyboard layout?')) resetSettings();
            }}
          >
            Reset preferences
          </button>
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition duration-150 motion-reduce:transition-none',
        checked ? 'border-amber/60 bg-amber/10' : 'border-line/70 bg-panel2/40 hover:border-amber/50',
      ].join(' ')}
    >
      <span className="text-[12px] text-ink">{label}</span>
      <span
        className={[
          'rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase',
          checked ? 'bg-amber text-[#201704]' : 'bg-panel2 text-muted',
        ].join(' ')}
      >
        {checked ? 'on' : 'off'}
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2">
      <span className="label-xs">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 flex-1 accent-[#e9b055]"
        />
        <span className="tabular w-12 text-right font-mono text-[12px] text-ink">
          {format(value)}
        </span>
      </span>
    </label>
  );
}