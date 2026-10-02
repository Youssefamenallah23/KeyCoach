/**
 * Demo playback: hear it before you play it.
 *
 * This exists because "+200 ms" is a useless instruction for a beginner. You
 * cannot correct an error you have not heard. The fix is not a better number, it is
 * a reference: hear the phrase at a tempo you can follow, then copy it.
 *
 * A demo:
 *   - runs a metronome count-in, then clicks the whole way through, so the pulse is
 *     audible even where the melody is silent
 *   - plays each note on the audio clock, sample accurate, not on a JS timer
 *   - reports the note index as it sounds, so the keyboard can light up in time
 *
 * Everything is scheduled ahead against `AudioContext.currentTime` and cancelled
 * cleanly, so stopping mid-phrase never leaves a stuck note or a ghost click.
 */

import { getAudioEngine } from './audio';
import { cumulativeBeats, type Lesson } from './lessons';

export interface DemoHandlers {
  /** Fired just before a note sounds, with the note's index. */
  onNote?: (index: number) => void;
  /** Fired on each metronome beat, with the beat index from the count-in. */
  onBeat?: (beat: number) => void;
  /** Fired once the last note has finished ringing. */
  onEnd?: () => void;
}

export interface DemoOptions extends DemoHandlers {
  lesson: Lesson;
  bpm: number;
  /** Beats of count-in before the first note. */
  countInBeats?: number;
  /** How long each note is held, in ms. */
  noteMs?: number;
  /** Velocity for the melody. Lower it in Together mode so it sits under the learner. */
  velocity?: number;
  /** Keep the click going through the phrase. On by default: it is the reference. */
  click?: boolean;
  /**
   * How many times to repeat the phrase back to back. Repetition is how a rhythm
   * gets internalised, so listening once is rarely enough.
   */
  repeats?: number;
}

export interface DemoHandle {
  stop: () => void;
}

const DEFAULT_COUNT_IN = 4;
const DEFAULT_NOTE_MS = 520;

/**
 * Start a demo. Returns a stop function. Safe to call when audio is unavailable:
 * you get a no-op stop rather than an exception.
 */
export function startDemo(options: DemoOptions): DemoHandle {
  const { lesson } = options;
  const engine = getAudioEngine();
  engine.unlock();

  const bpm = Math.max(30, Math.min(220, Math.round(options.bpm)));
  const countIn = options.countInBeats ?? DEFAULT_COUNT_IN;
  const noteMs = options.noteMs ?? DEFAULT_NOTE_MS;
  const velocity = options.velocity ?? 0.85;
  const beatSec = 60 / bpm;

  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    engine.stopMetronome();
    engine.allOff();
  };

  // The metronome gives us one authoritative audio clock for the whole demo.
  const wantClick = options.click ?? true;
  const origin = engine.startMetronome(
    bpm,
    options.onBeat ? (beat) => options.onBeat?.(beat) : undefined,
  );
  if (!origin) return { stop };

  if (!wantClick) engine.stopMetronome();

  const firstNoteAudio = origin.startAudio + countIn * origin.beatSec;
  const cum = cumulativeBeats(lesson.beats);
  const passBeats = lesson.beats.reduce((a, b) => a + b, 0);
  const repeats = Math.max(1, Math.min(6, Math.round(options.repeats ?? 1)));
  const endAudio = firstNoteAudio + repeats * passBeats * origin.beatSec + 0.5;

  const schedule = (audioTime: number, fn: () => void) => {
    if (stopped) return;
    const delayMs = Math.max(0, (audioTime - engine.nowAudio()) * 1000);
    timers.push(setTimeout(fn, delayMs));
  };

  for (let pass = 0; pass < repeats; pass += 1) {
    const passStart = firstNoteAudio + pass * passBeats * origin.beatSec;

    lesson.notes.forEach((midi, i) => {
      const at = passStart + cum[i] * beatSec;
      const holdMs = Math.min(noteMs, Math.max(120, lesson.beats[i] * beatSec * 1000 * 0.85));

      // Announce in time with the sound, not ahead of it, so the highlight is honest.
      schedule(at, () => {
        if (stopped) return;
        engine.noteOn(midi, velocity);
        // Only the final pass reports an index, so the keyboard is not left lit
        // from an earlier repetition.
        if (pass === repeats - 1) options.onNote?.(i);
        timers.push(
          setTimeout(() => {
            if (!stopped) engine.noteOff(midi);
          }, holdMs),
        );
      });
    });
  }

  schedule(endAudio, () => {
    if (stopped) return;
    engine.stopMetronome();
    engine.allOff();
    options.onEnd?.();
  });

  return { stop };
}

/**
 * Tempo ladder.
 *
 * Timing cannot be learned at performance tempo. These are the three rungs that
 * matter, and the ratios are deliberately gentle: a beginner who cannot play at
 * 50 percent cannot play at 100 percent either, and pretending otherwise wastes
 * the session.
 */
export type TempoRung = 'slow' | 'medium' | 'target';

export const TEMPO_RUNGS: { id: TempoRung; label: string; ratio: number; blurb: string }[] = [
  { id: 'slow', label: 'Slow', ratio: 0.5, blurb: 'Half speed. Get every note right and even.' },
  { id: 'medium', label: 'Medium', ratio: 0.75, blurb: 'Three quarters. Keep the evenness.' },
  { id: 'target', label: 'Target', ratio: 1, blurb: 'Full tempo. Only once the shape is automatic.' },
];

export function bpmForRung(targetBpm: number, rung: TempoRung): number {
  const found = TEMPO_RUNGS.find((r) => r.id === rung) ?? TEMPO_RUNGS[0];
  return Math.max(40, Math.min(200, Math.round(targetBpm * found.ratio)));
}

export function rungFor(targetBpm: number, bpm: number): TempoRung {
  const ratio = bpm / Math.max(1, targetBpm);
  if (ratio <= 0.6) return 'slow';
  if (ratio <= 0.87) return 'medium';
  return 'target';
}

/** Rough seconds a full pass takes, for labelling the button. */
export function demoDurationSec(lesson: Lesson, bpm: number, countInBeats = DEFAULT_COUNT_IN): number {
  const beatSec = 60 / Math.max(30, Math.min(220, bpm));
  const beats = lesson.beats.reduce((a, b) => a + b, 0) + countInBeats;
  return Math.round(beats * beatSec);
}

/**
 * Together mode guide.
 *
 * Same scheduling as a demo, but it does not own the metronome, because the
 * practice session does. It starts at an absolute point on the audio clock, which
 * is the same `exerciseStart` the scoring uses, so the guide and the measurement
 * can never drift apart.
 *
 * Played softly by default: loud enough to follow, quiet enough that the learner's
 * own key is still audible on top of it.
 */
export function scheduleGuide(options: {
  notes: number[];
  beats: number[];
  bpm: number;
  startAudio: number;
  velocity?: number;
  noteMs?: number;
}): DemoHandle {
  const engine = getAudioEngine();
  const beatSec = 60 / Math.max(30, Math.min(220, options.bpm));
  const velocity = options.velocity ?? 0.34;
  const noteMs = options.noteMs ?? 460;
  const cum = cumulativeBeats(options.beats);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
  };

  options.notes.forEach((midi, i) => {
    const at = options.startAudio + cum[i] * beatSec;
    const delayMs = Math.max(0, (at - engine.nowAudio()) * 1000);
    timers.push(
      setTimeout(() => {
        if (stopped) return;
        engine.noteOn(midi, velocity);
        timers.push(
          setTimeout(() => {
            if (!stopped) engine.noteOff(midi);
          }, Math.min(noteMs, Math.max(120, options.beats[i] * beatSec * 1000 * 0.8))),
        );
      }, delayMs),
    );
  });

  return { stop };
}