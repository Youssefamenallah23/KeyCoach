'use client';

/**
 * React adapter around the pure practice machine in `lib/practice.ts`.
 *
 * Responsibilities kept out of the machine: the AudioContext, global keyboard
 * listeners, the ~100 ms clock tick that drives live meters and strict-mode miss
 * detection, and persisting the finished attempt.
 *
 * Keyboard input uses `event.code`, so the layout (QWERTY/AZERTY/QWERTZ/Dvorak)
 * does not matter. `event.repeat` is ignored so holding a key cannot machine
 * gun notes.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getAudioEngine } from '@/lib/audio';
import { OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, eventTimestamp, resolveMidi } from '@/lib/notes';
import type { Lesson } from '@/lib/lessons';
import {
  beginSession,
  clampBpm,
  countInBeatsRemaining,
  createSession,
  finishSession,
  liveStats,
  pressNote,
  skipNote,
  tickSession,
  toAttemptRecord,
  COUNT_IN_BEATS,
  type LiveStats,
  type PracticePhase,
  type PracticeSession,
  type PressResult,
} from '@/lib/practice';
import { useProgress } from '@/lib/progress';
import { useSettings, type PracticeMode } from '@/lib/settings';
import { mergeVoicing } from '@/lib/voicing';
import { startDemo, scheduleGuide, type DemoHandle } from '@/lib/demo';
import type { Scores, Verdict } from '@/lib/scoring';

export interface PracticeResult {
  scores: Scores;
  verdict: Verdict;
}

export interface UsePractice {
  lesson: Lesson;
  session: PracticeSession;
  phase: PracticePhase;
  pressed: ReadonlySet<number>;
  bpm: number;
  setBpm: (bpm: number) => void;
  metronomeOn: boolean;
  setMetronomeOn: (on: boolean) => void;
  result: PracticeResult | null;
  stats: LiveStats;
  countIn: number;
  /** Keys currently held down, so the UI can warn about keyboard ghosting. */
  heldCount: number;

  /* listen first */
  /** True while a demonstration is playing. */
  listening: boolean;
  /** Index of the note the demo is sounding, for highlighting. */
  demoIndex: number | null;
  /** Beats counted in by the running metronome, or null when it is off. */
  metronomeBeat: number | null;
  /** Play the phrase as a demonstration, no scoring. */
  listen: (bpm?: number) => void;
  /** Stop a running demonstration. */
  stopListening: () => void;
  /** True while a Together mode guide is playing underneath the learner. */
  guiding: boolean;
  /** How many times a Listen pass repeats. */
  listens: number;
  setListens: (n: number) => void;

  practiceMode: PracticeMode;
  setPracticeMode: (mode: PracticeMode) => void;
  press: (midi: number, opts?: { velocity?: number; perfMs?: number }) => PressResult;
  release: (midi: number) => void;
  start: () => void;
  skip: () => void;
  abandon: () => void;
}

const TICK_MS = 110;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function usePractice(lesson: Lesson): UsePractice {
  const engine = getAudioEngine();
  const recordAttempt = useProgress((s) => s.recordAttempt);

  const lessonRef = useRef<Lesson>(lesson);
  lessonRef.current = lesson;

  const sessionRef = useRef<PracticeSession>(createSession(lesson, lesson.targetBpm));
  const pressedRef = useRef<Set<number>>(new Set());
  const startPerfRef = useRef(0);

  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [phase, setPhase] = useState<PracticePhase>('idle');
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set<number>());
  const [bpm, setBpmState] = useState(lesson.targetBpm);
  const [metronomeOn, setMetronomeOn] = useState(lesson.mode === 'strict');
  const [result, setResult] = useState<PracticeResult | null>(null);

  // Listen-first state.
  const [listening, setListening] = useState(false);
  const [demoIndex, setDemoIndex] = useState<number | null>(null);
  const [guiding, setGuiding] = useState(false);
  const [metronomeBeat, setMetronomeBeat] = useState<number | null>(null);
  const demoRef = useRef<DemoHandle | null>(null);
  const guideRef = useRef<DemoHandle | null>(null);

  /** How many times a Listen pass repeats. Two by default: once is not enough. */
  const [listens, setListensState] = useState(2);
  const listensRef = useRef(2);
  listensRef.current = listens;

  const practiceMode = useSettings((s) => s.practiceMode);
  const setPracticeModeSetting = useSettings((s) => s.setPracticeMode);

  // Output latency compensation, in seconds. Kept in a ref because the input path
  // must not depend on a re-render to read the latest setting.
  const offsetSecRef = useRef(0);

  const commit = useCallback(() => {
    setPhase(sessionRef.current.phase);
    setPressed(new Set(pressedRef.current));
    bump();
  }, []);

  const finalize = useCallback(() => {
    const s = sessionRef.current;
    const finished = finishSession(s, engine.nowAudio());
    recordAttempt(
      toAttemptRecord(s, {
        id: makeId(),
        at: Date.now(),
        durationMs: startPerfRef.current > 0 ? performance.now() - startPerfRef.current : 0,
      }),
    );
    guideRef.current?.stop();
    guideRef.current = null;
    setGuiding(false);
    engine.stopMetronome();
    engine.allOff();
    pressedRef.current.clear();
    setResult({ scores: finished.scores, verdict: finished.verdict });
    commit();
  }, [commit, engine, recordAttempt]);

  const press = useCallback(
    (midi: number, opts?: { velocity?: number; perfMs?: number }): PressResult => {
      engine.unlock();
      const perfMs = opts?.perfMs ?? performance.now();
      engine.noteOn(midi, opts?.velocity ?? 0.85);
      pressedRef.current.add(midi);

      const res = pressNote(
        sessionRef.current,
        midi,
        engine.toAudio(perfMs) - offsetSecRef.current,
        engine.nowAudio(),
      );

      if (res === 'finished') finalize();
      else commit();
      return res;
    },
    [commit, engine, finalize],
  );

  const release = useCallback(
    (midi: number) => {
      engine.noteOff(midi);
      if (pressedRef.current.delete(midi)) commit();
    },
    [commit, engine],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === OCTAVE_DOWN_CODE || e.code === OCTAVE_UP_CODE) return;
      const midi = resolveMidi(e.code, 0);
      if (midi === null) return;
      e.preventDefault();
      press(midi, { perfMs: eventTimestamp(e) });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const midi = resolveMidi(e.code, 0);
      if (midi !== null) release(midi);
    };

    const onBlur = () => {
      engine.allOff();
      pressedRef.current.clear();
      commit();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [commit, engine, press, release]);

  /* ---------------------------------------------------------- lifecycle */

  // Reset whenever the lesson changes. Depends on lesson.id only, reading the
  // latest lesson from a ref, so an inline-recreated lesson object cannot cause
  // a spurious reset mid-exercise.
  useEffect(() => {
    const l = lessonRef.current;
    demoRef.current?.stop();
    demoRef.current = null;
    guideRef.current?.stop();
    guideRef.current = null;
    engine.stopMetronome();
    engine.allOff();
    pressedRef.current.clear();
    sessionRef.current = createSession(l, l.targetBpm);
    setBpmState(l.targetBpm);
    setMetronomeOn(l.mode === 'strict');
    setResult(null);
    setPhase('idle');
    setPressed(new Set());
    setListening(false);
    setDemoIndex(null);
    setGuiding(false);
    setMetronomeBeat(null);
    bump();
  }, [engine, lesson.id]);

  useEffect(() => {
    if (phase !== 'countin' && phase !== 'running') return undefined;
    const interval = window.setInterval(() => {
      const changed = tickSession(sessionRef.current, engine.nowAudio());
      if (changed) {
        commit();
        if (sessionRef.current.phase === 'finished') finalize();
      } else {
        bump();
      }
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [commit, engine, finalize, phase]);

  useEffect(() => {
    return () => {
      demoRef.current?.stop();
      guideRef.current?.stop();
      engine.stopMetronome();
      engine.allOff();
    };
  }, [engine]);

  /* ---------------------------------------------------- settings -> engine */

  const voicingId = useSettings((s) => s.voicing);
  const voicingOverrides = useSettings((s) => s.voicingOverrides);
  const tuning = useSettings((s) => s.tuning);
  const masterVolume = useSettings((s) => s.masterVolume);
  const metronomeVolume = useSettings((s) => s.metronomeVolume);
  const muted = useSettings((s) => s.muted);
  const latencyCompensation = useSettings((s) => s.latencyCompensation);
  const latencyOffsetMs = useSettings((s) => s.latencyOffsetMs);

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
    if (!latencyCompensation) {
      offsetSecRef.current = 0;
      return;
    }
    // The learner syncs to what they hear, which arrives `outputLatency` late, so
    // their presses show up late by about that much. Subtract it, plus any manual
    // offset measured on the calibration screen.
    const measuredMs = engine.outputLatency() * 1000;
    offsetSecRef.current = (measuredMs + latencyOffsetMs) / 1000;
  }, [engine, latencyCompensation, latencyOffsetMs]);

  /* ---------------------------------------------------- listen first */

  const stopListening = useCallback(() => {
    demoRef.current?.stop();
    demoRef.current = null;
    setListening(false);
    setDemoIndex(null);
  }, []);

  const listen = useCallback(
    (atBpm?: number) => {
      const l = lessonRef.current;
      const useBpm = clampBpm(atBpm ?? bpm);
      demoRef.current?.stop();
      engine.allOff();
      setResult(null);
      setDemoIndex(null);
      setListening(true);

      demoRef.current = startDemo({
        lesson: l,
        bpm: useBpm,
        onNote: (i) => setDemoIndex(i),
        onBeat: (beat) => setMetronomeBeat(beat),
        repeats: listensRef.current,
        onEnd: () => {
          demoRef.current = null;
          setListening(false);
          setDemoIndex(null);
        },
      });
    },
    [bpm, engine],
  );

  const setPracticeMode = useCallback(
    (mode: PracticeMode) => {
      setPracticeModeSetting(mode);
    },
    [setPracticeModeSetting],
  );

  const setListens = useCallback((n: number) => {
    setListensState(Math.max(1, Math.min(6, Math.round(n))));
  }, []);

  /* ------------------------------------------------------------ actions */

  const start = useCallback(() => {
    const l = lessonRef.current;
    const safeBpm = clampBpm(bpm);

    // Listening and playing must never overlap.
    demoRef.current?.stop();
    demoRef.current = null;
    setListening(false);
    setDemoIndex(null);
    guideRef.current?.stop();
    guideRef.current = null;

    engine.unlock();
    engine.allOff();
    engine.stopMetronome();
    pressedRef.current.clear();
    setResult(null);

    sessionRef.current = createSession(l, safeBpm);
    const session = sessionRef.current;

    // Together mode needs a fixed clock, because the guide plays to a schedule.
    const together = practiceMode === 'together';
    const useMetronome = together || metronomeOn || l.mode === 'strict';
    const fixedClock = together || l.mode === 'strict';
    let exerciseStart: number | null = null;

    if (useMetronome) {
      const origin = engine.startMetronome(safeBpm);
      if (origin && fixedClock) {
        exerciseStart = origin.startAudio + COUNT_IN_BEATS * origin.beatSec;
      }
    }

    beginSession(session, exerciseStart, together);
    startPerfRef.current = performance.now();

    if (together && exerciseStart !== null) {
      guideRef.current = scheduleGuide({
        notes: l.notes,
        beats: l.beats,
        bpm: safeBpm,
        startAudio: exerciseStart,
      });
      setGuiding(true);
    } else {
      setGuiding(false);
    }

    commit();
  }, [bpm, commit, engine, metronomeOn, practiceMode]);

  const skip = useCallback(() => {
    if (!skipNote(sessionRef.current, engine.nowAudio())) return;
    commit();
    if (sessionRef.current.phase === 'finished') finalize();
  }, [commit, engine, finalize]);

  const abandon = useCallback(() => {
    demoRef.current?.stop();
    demoRef.current = null;
    guideRef.current?.stop();
    guideRef.current = null;
    setListening(false);
    setDemoIndex(null);
    setGuiding(false);
    engine.stopMetronome();
    engine.allOff();
    pressedRef.current.clear();
    sessionRef.current = createSession(lessonRef.current, bpm);
    setResult(null);
    setPhase('idle');
    setPressed(new Set());
    bump();
  }, [bpm, engine]);

  const setBpm = useCallback((next: number) => setBpmState(clampBpm(next)), []);

  const session = sessionRef.current;

  return {
    lesson: lessonRef.current,
    session,
    phase,
    pressed,
    bpm,
    setBpm,
    metronomeOn,
    setMetronomeOn,
    result,
    stats: liveStats(session, engine.nowAudio()),
    countIn: countInBeatsRemaining(session, engine.nowAudio()),
    heldCount: pressedRef.current.size,
    listening,
    demoIndex,
    metronomeBeat,
    listen,
    stopListening,
    guiding,
    listens,
    setListens,
    practiceMode,
    setPracticeMode,
    press,
    release,
    start,
    skip,
    abandon,
  };
}