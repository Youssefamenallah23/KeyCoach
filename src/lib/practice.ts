/**
 * The practice state machine. Pure: no React, no audio, no DOM.
 *
 * Keeping the machine separate from the hook means the tricky parts (timing
 * anchoring, miss detection, score inputs) are testable in isolation and the
 * React layer stays a thin adapter.
 *
 * Timing model
 *   'patient' lessons: the ideal clock re-anchors after every correct note, so
 *     the measured error is the interval since the previous note at the target
 *     tempo. Pausing on a hard note is forgiven; uneven rhythm is not.
 *   'strict' lessons: the clock is fixed at `exerciseStart` (after a count-in)
 *     and never re-anchors, so the error is absolute sync to the metronome.
 *     Notes not played inside the late window are auto-marked as skipped, which
 *     is what lets a metronome-locked exercise finish on its own.
 */

import { cumulativeBeats, type Lesson } from './lessons';
import { noteLabel } from './notes';
import { buildVerdict, computeScores, type Scores, type Verdict } from './scoring';
import type { AttemptRecord, OutcomeRecord, OutcomeStatus } from './progress';

export type PracticePhase = 'idle' | 'countin' | 'running' | 'finished';

export type SessionStatus = OutcomeStatus | 'pending';

export interface SessionOutcome {
  index: number;
  expected: number;
  played: number | null;
  status: SessionStatus;
  timingMs: number | null;
  /** Wrong keys pressed while this note was the expected one. */
  wrongPresses: number;
}

export interface PracticeEvent {
  seq: number;
  kind: 'ok' | 'bad' | 'info';
  title: string;
  detail: string;
  /**
   * Signed timing error when the event is a note landing. Kept as a number rather
   * than baked into `detail`, so the UI can choose between milliseconds and plain
   * words without the engine needing to know about preferences.
   */
  timingMs?: number | null;
}

export interface PracticeSession {
  lesson: Lesson;
  bpm: number;
  beatSec: number;
  phase: PracticePhase;
  index: number;
  outcomes: SessionOutcome[];
  wrongPresses: number;
  cum: number[];
  anchorAudio: number | null;
  exerciseStart: number | null;
  firstOnset: number | null;
  lastOnset: number | null;
  firstIndex: number | null;
  lastIndex: number | null;
  event: PracticeEvent | null;
  eventSeq: number;
  flash: { midi: number; kind: 'correct' | 'wrong'; seq: number } | null;
  result: { scores: Scores; verdict: Verdict } | null;
  /**
   * Together mode. The clock is fixed and the app plays the notes underneath you,
   * so missing notes must not be auto-skipped: the learner is following a guide,
   * not racing a deadline.
   */
  guided: boolean;
}

export const COUNT_IN_BEATS = 4;
/** How late a note may be, in beats, before strict mode skips it. */
const LATE_WINDOW_BEATS = 1;
const LATE_WINDOW_MIN_SEC = 0.5;

export type PressResult = 'correct' | 'wrong' | 'finished' | 'ignored';

export function clampBpm(bpm: number): number {
  return Math.max(40, Math.min(200, Math.round(bpm)));
}

export function beatSecFor(bpm: number): number {
  return 60 / clampBpm(bpm);
}

export function createSession(lesson: Lesson, bpm: number): PracticeSession {
  const safeBpm = clampBpm(bpm);
  return {
    lesson,
    bpm: safeBpm,
    beatSec: beatSecFor(safeBpm),
    phase: 'idle',
    index: 0,
    outcomes: lesson.notes.map((note, i) => ({
      index: i,
      expected: note,
      played: null,
      status: 'pending',
      timingMs: null,
      wrongPresses: 0,
    })),
    wrongPresses: 0,
    cum: cumulativeBeats(lesson.beats),
    anchorAudio: null,
    exerciseStart: null,
    firstOnset: null,
    lastOnset: null,
    firstIndex: null,
    lastIndex: null,
    event: null,
    eventSeq: 0,
    flash: null,
    result: null,
    guided: false,
  };
}

/** `exerciseStart` is set for strict lessons (count-in) and null for patient ones. */
export function beginSession(
  s: PracticeSession,
  exerciseStart: number | null,
  guided = false,
): void {
  s.phase = exerciseStart === null ? 'running' : 'countin';
  s.exerciseStart = exerciseStart;
  s.anchorAudio = exerciseStart;
  s.guided = guided;
  s.index = 0;
  s.wrongPresses = 0;
  s.firstOnset = null;
  s.lastOnset = null;
  s.firstIndex = null;
  s.lastIndex = null;
  s.result = null;
  for (const o of s.outcomes) {
    o.status = 'pending';
    o.played = null;
    o.timingMs = null;
    o.wrongPresses = 0;
  }
}

function emitEvent(
  s: PracticeSession,
  kind: 'ok' | 'bad' | 'info',
  title: string,
  detail: string,
  timingMs?: number | null,
): void {
  s.eventSeq += 1;
  s.event = { seq: s.eventSeq, kind, title, detail, timingMs: timingMs ?? null };
}

/** Plain fallback text. The UI replaces this with band wording when preferred. */
export function timingDescription(ms: number): string {
  const v = Math.round(ms);
  if (Math.abs(v) < 8) return 'On the beat';
  return `${v > 0 ? 'Late' : 'Early'} by ${Math.abs(v)} ms`;
}

export function pressNote(s: PracticeSession, midi: number, audioTime: number, nowAudio: number): PressResult {
  if (s.phase === 'idle' || s.phase === 'finished') return 'ignored';

  if (s.phase === 'countin') {
    s.wrongPresses += 1;
    s.flash = { midi, kind: 'wrong', seq: (s.eventSeq += 1) };
    emitEvent(s, 'bad', 'Too early', 'Wait for the count-in to finish.');
    return 'wrong';
  }

  const o = s.outcomes[s.index];
  if (!o) return 'ignored';

  if (midi === o.expected) {
    if (s.anchorAudio === null) {
      s.anchorAudio = audioTime - s.cum[s.index] * s.beatSec;
    }
    const expectedAt = s.anchorAudio + s.cum[s.index] * s.beatSec;
    const timingMs = (audioTime - expectedAt) * 1000;

    o.status = 'correct';
    o.played = midi;
    o.timingMs = timingMs;

    if (s.firstOnset === null) {
      s.firstOnset = audioTime;
      s.firstIndex = s.index;
    }
    s.lastOnset = audioTime;
    s.lastIndex = s.index;

    // Patient mode: move the ideal clock onto the note that was just played.
    if (s.lesson.mode === 'patient') {
      s.anchorAudio = audioTime - s.cum[s.index] * s.beatSec;
    }

    s.flash = { midi, kind: 'correct', seq: (s.eventSeq += 1) };
    emitEvent(
      s,
      Math.abs(timingMs) <= 150 ? 'ok' : 'info',
      noteLabel(midi),
      timingDescription(timingMs),
      timingMs,
    );

    s.index += 1;
    if (s.index >= s.outcomes.length) {
      finishSession(s, nowAudio);
      return 'finished';
    }
    return 'correct';
  }

  s.wrongPresses += 1;
  o.wrongPresses += 1;
  s.flash = { midi, kind: 'wrong', seq: (s.eventSeq += 1) };
  emitEvent(s, 'bad', `Expected ${noteLabel(o.expected)}`, `You played ${noteLabel(midi)}.`);
  return 'wrong';
}

/** Patient mode only: give up on the current note and move to the next one. */
export function skipNote(s: PracticeSession, nowAudio: number): boolean {
  if (s.phase !== 'running') return false;
  const o = s.outcomes[s.index];
  if (!o || o.status !== 'pending') return false;

  o.status = 'skipped';
  s.index += 1;
  emitEvent(s, 'info', 'Skipped', `Move on from ${noteLabel(o.expected)}.`);

  if (s.index >= s.outcomes.length) {
    finishSession(s, nowAudio);
    return true;
  }
  return true;
}

/**
 * Clock tick. Flips count-in to running and, in strict mode, skips notes that
 * are past their late window. Returns true when anything changed so the caller
 * can decide whether to re-render.
 */
export function tickSession(s: PracticeSession, nowAudio: number): boolean {
  let changed = false;

  if (s.phase === 'countin' && s.exerciseStart !== null && nowAudio >= s.exerciseStart) {
    const first = s.outcomes[0];
    s.phase = 'running';
    if (first) {
      emitEvent(s, 'info', 'Play', `Start on ${noteLabel(first.expected)}.`);
    }
    changed = true;
  }

  if (s.phase === 'running' && s.lesson.mode === 'strict' && s.exerciseStart !== null && !s.guided) {
    const late = Math.max(s.beatSec * LATE_WINDOW_BEATS, LATE_WINDOW_MIN_SEC);
    while (s.index < s.outcomes.length) {
      const o = s.outcomes[s.index];
      if (o.status !== 'pending') {
        s.index += 1;
        changed = true;
        continue;
      }
      const due = s.exerciseStart + s.cum[s.index] * s.beatSec;
      if (nowAudio > due + late) {
        o.status = 'skipped';
        s.index += 1;
        changed = true;
      } else {
        break;
      }
    }
    if (s.index >= s.outcomes.length) {
      finishSession(s, nowAudio);
      changed = true;
    }
  }

  return changed;
}

export function countInBeatsRemaining(s: PracticeSession, nowAudio: number): number {
  if (s.phase !== 'countin' || s.exerciseStart === null) return 0;
  return Math.max(0, Math.ceil((s.exerciseStart - nowAudio) / s.beatSec));
}

export function finishSession(s: PracticeSession, nowAudio: number): { scores: Scores; verdict: Verdict } {
  if (s.result) return s.result;

  s.phase = 'finished';
  for (const o of s.outcomes) {
    if (o.status === 'pending') o.status = 'skipped';
  }

  const correct = s.outcomes.filter((o) => o.status === 'correct').length;

  // Timing is measured on every correct note, except note 0 of a patient lesson
  // where the clock is anchored to that note (so its error is zero by definition
  // and would flatter the score).
  const timingErrorsMs = s.outcomes
    .filter((o) => o.status === 'correct' && o.timingMs !== null)
    .filter((o) => !(o.index === 0 && s.lesson.mode === 'patient'))
    .map((o) => o.timingMs as number);

  let spanActualMs: number | null = null;
  let spanIdealMs: number | null = null;
  if (
    s.firstOnset !== null &&
    s.lastOnset !== null &&
    s.firstIndex !== null &&
    s.lastIndex !== null &&
    s.lastIndex > s.firstIndex
  ) {
    spanActualMs = (s.lastOnset - s.firstOnset) * 1000;
    spanIdealMs = (s.cum[s.lastIndex] - s.cum[s.firstIndex]) * s.beatSec * 1000;
  }

  const scores = computeScores({
    total: s.outcomes.length,
    correct,
    wrongPresses: s.wrongPresses,
    timingErrorsMs,
    spanActualMs,
    spanIdealMs,
  });

  s.result = { scores, verdict: buildVerdict(scores, s.lesson.mode) };
  return s.result;
}

export interface LiveStats {
  index: number;
  total: number;
  correct: number;
  wrongPresses: number;
  /** Live hit rate: correct / (correct + wrong presses). */
  hitRate: number;
  elapsedMs: number;
}

export function liveStats(s: PracticeSession, nowAudio: number): LiveStats {
  const correct = s.outcomes.filter((o) => o.status === 'correct').length;
  const attempted = correct + s.wrongPresses;
  const elapsedMs =
    s.firstOnset !== null && s.phase !== 'idle' ? (nowAudio - s.firstOnset) * 1000 : 0;

  return {
    index: s.index,
    total: s.outcomes.length,
    correct,
    wrongPresses: s.wrongPresses,
    hitRate: attempted > 0 ? Math.round((100 * correct) / attempted) : 100,
    elapsedMs: Math.max(0, elapsedMs),
  };
}

export function toAttemptRecord(
  s: PracticeSession,
  meta: { id: string; at: number; durationMs: number },
): AttemptRecord {
  const result = s.result ?? finishSession(s, 0);
  const { scores } = result;

  const outcomes: OutcomeRecord[] = s.outcomes.map((o) => ({
    index: o.index,
    expected: o.expected,
    played: o.played,
    status: o.status === 'correct' ? 'correct' : 'skipped',
    timingMs: o.timingMs,
  }));

  return {
    id: meta.id,
    lessonId: s.lesson.id,
    lessonTitle: s.lesson.title,
    category: s.lesson.category,
    mode: s.lesson.mode,
    at: meta.at,
    targetBpm: s.bpm,
    total: s.outcomes.length,
    correct: outcomes.filter((o) => o.status === 'correct').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    wrongPresses: s.wrongPresses,
    accuracy: scores.accuracy,
    timing: scores.timing,
    speed: scores.speed,
    overall: scores.overall,
    stars: scores.stars,
    durationMs: Math.max(0, Math.round(meta.durationMs)),
    beats: [...s.lesson.beats],
    outcomes,
  };
}