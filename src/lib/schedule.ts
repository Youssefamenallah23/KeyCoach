/**
 * Spaced repetition, mastery and interleaving over the fixed curriculum.
 *
 * The brief asks for the evidence-based skill acquisition principles to be built
 * in, not just described. This module covers four of them:
 *
 *   - Immediate feedback   : already handled by the practice machine.
 *   - Mastery thresholds   : a lesson counts as mastered at accuracy 88, timing 80
 *                            and overall 85, so advancing means demonstrating it.
 *   - Spaced repetition    : each lesson carries an interval that doubles on a
 *                            clean run and resets on a rough one, with retention
 *                            decaying exponentially between reviews (SM-2 lite).
 *   - Interleaving         : `buildInterleavedReview` mixes material from several
 *                            due lessons into one drill, which beats blocked
 *                            practice for retention of separate movements.
 *
 * Everything is a pure function over the attempt history, so it is cheap, offline
 * and testable.
 */

import { LESSON_HIGH, LESSON_LOW, LESSONS, type Lesson } from './lessons';
import type { AttemptRecord, LessonBest } from './progress';

/** Thresholds a lesson must clear to count as mastered. */
export const MASTERY = { accuracy: 88, timing: 80, overall: 85 } as const;

const MAX_INTERVAL_DAYS = 60;
const BASE_INTERVAL_DAYS = 1;
/** Half-life of a fresh memory, in days, for the retention curve. */
const HALF_LIFE_DAYS = 3;
const DAY_MS = 86_400_000;

export interface LessonMastery {
  lessonId: string;
  lessonTitle: string;
  category: Lesson['category'];
  /** Best overall score banked, 0 to 100. */
  best: number;
  mastered: boolean;
  attempts: number;
  lastAt: number | null;
  /** Days until the next review is due. */
  intervalDays: number;
  dueAt: number | null;
  /** Estimated chance of still remembering it now, 0 to 1. */
  retention: number;
  overdue: boolean;
}

/** Exponential forgetting curve, normalised to the current review interval. */
export function retentionNow(lastAt: number, intervalDays: number, now: number): number {
  if (lastAt <= 0) return 0;
  const elapsedDays = (now - lastAt) / DAY_MS;
  if (elapsedDays <= 0) return 1;
  const halfLife = HALF_LIFE_DAYS * Math.max(1, intervalDays);
  return Math.exp((-Math.LN2 * elapsedDays) / halfLife);
}

/**
 * SM-2 lite. A clean run doubles the interval, a rough one resets it. `quality`
 * is derived from the attempt's overall score so no extra UI is needed.
 */
export function nextIntervalDays(previous: number, quality: number): number {
  if (quality < 60) return BASE_INTERVAL_DAYS;
  if (quality < 75) return Math.max(BASE_INTERVAL_DAYS, previous);
  if (quality < 85) return Math.min(MAX_INTERVAL_DAYS, Math.max(BASE_INTERVAL_DAYS, previous * 1.5));
  return Math.min(MAX_INTERVAL_DAYS, Math.max(BASE_INTERVAL_DAYS, previous * 2));
}

function isMastered(best: LessonBest | undefined): boolean {
  if (!best) return false;
  return (
    best.accuracy >= MASTERY.accuracy &&
    (best.timing ?? 0) >= MASTERY.timing &&
    best.overall >= MASTERY.overall
  );
}

export function buildMastery(
  best: Record<string, LessonBest>,
  attempts: AttemptRecord[],
  now: number = Date.now(),
): LessonMastery[] {
  return LESSONS.map((lesson) => {
    const record = best[lesson.id];
    const own = attempts.filter((a) => a.lessonId === lesson.id);

    // Interval walks forward through the lesson's own attempts in order.
    let interval = BASE_INTERVAL_DAYS;
    let lastAt: number | null = null;
    for (const attempt of [...own].reverse()) {
      interval = nextIntervalDays(interval, attempt.overall);
      lastAt = attempt.at;
    }

    const mastered = isMastered(record);
    // Only schedule reviews for material that has been attempted and mastered;
    // an unplayed lesson is not "overdue", it is simply next in the curriculum.
    const scheduled = lastAt !== null && mastered;
    const dueAt = scheduled && lastAt !== null ? lastAt + interval * DAY_MS : null;
    const retention = lastAt === null ? 0 : retentionNow(lastAt, interval, now);

    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      category: lesson.category,
      best: record?.overall ?? 0,
      mastered,
      attempts: own.length,
      lastAt,
      intervalDays: interval,
      dueAt,
      retention,
      overdue: dueAt !== null && dueAt <= now,
    };
  });
}

export function dueForReview(mastery: LessonMastery[]): LessonMastery[] {
  return mastery
    .filter((m) => m.overdue)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

/** Next lesson to learn, in curriculum order, skipping anything mastered. */
export function nextLessonToLearn(mastery: LessonMastery[]): Lesson | null {
  const mastered = new Set(mastery.filter((m) => m.mastered).map((m) => m.lessonId));
  const attempted = new Set(mastery.filter((m) => m.attempts > 0).map((m) => m.lessonId));
  const fresh = LESSONS.find((l) => !mastered.has(l.id) && !attempted.has(l.id));
  if (fresh) return fresh;
  return LESSONS.find((l) => !mastered.has(l.id)) ?? null;
}

/* ---------------------------------------------------------------- review */

function clampMidi(midi: number): number {
  return Math.min(LESSON_HIGH, Math.max(LESSON_LOW, midi));
}

/** Beat pattern for a review exercise: mostly even, last note resolving. */
function evenBeats(length: number): number[] {
  return Array.from({ length }, (_, i) => (i === length - 1 ? 2 : 1));
}

/**
 * Interleaved review drill.
 *
 * Rather than replaying one whole lesson, this samples a short motif from each
 * lesson that is due, then alternates between those motifs. Alternating related
 * material is what makes separate movements stay separable in memory, and it also
 * keeps the drill short, which matters for deliberate practice.
 *
 * BPM is the slowest recommendation across the sampled lessons, so a weak lesson
 * holds the whole drill back instead of being masked by a strong one.
 */
export function buildInterleavedReview(
  due: LessonMastery[],
  now: number = Date.now(),
): Lesson | null {
  if (due.length === 0) return null;

  const sourceLessons = due
    .slice(0, 3)
    .map((m) => LESSONS.find((l) => l.id === m.lessonId))
    .filter((l): l is Lesson => Boolean(l));
  if (sourceLessons.length === 0) return null;

  // One motif per source lesson: the first four distinct pitches, which is enough
  // to carry the shape without repeating a whole song.
  const motifs = sourceLessons.map((lesson) => {
    const seen: number[] = [];
    for (const note of lesson.notes) {
      if (seen[seen.length - 1] !== note) seen.push(note);
      if (seen.length === 4) break;
    }
    return seen;
  });

  const sequence: number[] = [];
  const rounds = 2;
  for (let r = 0; r < rounds; r += 1) {
    for (const motif of motifs) {
      for (const note of motif) sequence.push(clampMidi(note));
      // A breath between motifs, back to the first note of the motif.
      if (motif.length > 0) sequence.push(clampMidi(motif[0]));
    }
  }

  const notes = sequence.slice(0, 36);
  const bpm = Math.max(52, Math.min(...sourceLessons.map((l) => l.targetBpm)) - 4);

  return {
    id: `review-${sourceLessons.map((l) => l.id).join('_')}-${Math.floor(now / DAY_MS)}`,
    title: 'Mixed review',
    subtitle: `Interleaved: ${sourceLessons.map((l) => l.title).join(', ')}`,
    category: 'rhythm',
    mode: 'patient',
    targetBpm: bpm,
    notes,
    beats: evenBeats(notes.length),
    tip: 'Interleaved review pulls short motifs from several lessons and alternates them. Expect it to feel harder than blocked practice. That is the point.',
    generated: true,
  };
}

/** One line of plain-language advice about the schedule, for the review panel. */
export function scheduleAdvice(mastery: LessonMastery[], due: LessonMastery[]): string {
  if (due.length > 0) {
    const weakest = [...due].sort((a, b) => a.retention - b.retention)[0];
    const pct = Math.round(weakest.retention * 100);
    return `${due.length} lesson${due.length === 1 ? '' : 's'} due for review. Weakest is ${weakest.lessonTitle} at about ${pct} percent retention.`;
  }
  const studied = mastery.filter((m) => m.attempts > 0);
  if (studied.length === 0) return 'Nothing scheduled yet. Play a lesson and this fills in.';
  const soonest = [...studied]
    .filter((m) => m.dueAt !== null)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))[0];
  if (!soonest || soonest.dueAt === null) {
    return 'Nothing due. Keep learning new lessons and reviews appear on their own.';
  }
  const days = Math.max(0, Math.ceil((soonest.dueAt - Date.now()) / DAY_MS));
  return `Nothing due. Next review is ${soonest.lessonTitle} in about ${days} day${days === 1 ? '' : 's'}.`;
}

export { MAX_INTERVAL_DAYS, BASE_INTERVAL_DAYS, DAY_MS };