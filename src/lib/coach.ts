/**
 * Practice Coach: the deterministic learner model.
 *
 * The brief asks whether a cheap classical model can replace or support the LLM.
 * This is that model, and it needs no model at all to work:
 *
 *   - per-note error rates      -> which pitches are not automatic yet
 *   - per-transition error rates -> which movements are not automatic yet
 *   - recent timing spread       -> whether the tempo is too high
 *
 * Everything here is O(attempts x notes), instant, free, offline and testable.
 * The generated drill is then passed through a programmatic validator, which is
 * the sanity layer the brief asks for before any generated exercise is shown.
 */

import { intervalName, noteLabel } from './notes';
import { LESSON_HIGH, LESSON_LOW, type Lesson } from './lessons';
import type { AttemptRecord } from './progress';

export interface WeakNote {
  midi: number;
  label: string;
  errors: number;
  plays: number;
  rate: number;
  avgAbsTimingMs: number | null;
}

export interface WeakTransition {
  from: number;
  to: number;
  label: string;
  errors: number;
  occurrences: number;
  rate: number;
  avgAbsTimingMs: number | null;
}

export interface CoachReport {
  attemptsAnalyzed: number;
  notesSeen: number;
  weakNotes: WeakNote[];
  weakTransitions: WeakTransition[];
  recentAccuracy: number | null;
  recommendedBpm: number;
  headline: string;
}

interface Tally {
  errors: number;
  plays: number;
  timing: number[];
}

function tallyMap(): Map<number, Tally> {
  return new Map<number, Tally>();
}

function bump(map: Map<number, Tally>, key: number, isError: boolean, timing: number | null): void {
  const cur = map.get(key) ?? { errors: 0, plays: 0, timing: [] };
  cur.plays += 1;
  if (isError) cur.errors += 1;
  if (timing !== null) cur.timing.push(Math.abs(timing));
  map.set(key, cur);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function analyzeAttempts(attempts: AttemptRecord[]): CoachReport {
  const recent = attempts.slice(0, 24);

  const noteTally = tallyMap();
  const transTally = tallyMap();

  for (const attempt of recent) {
    const outcomes = attempt.outcomes;
    for (let i = 0; i < outcomes.length; i += 1) {
      const o = outcomes[i];
      const isError = o.status !== 'correct';
      bump(noteTally, o.expected, isError, o.timingMs);

      if (i > 0) {
        const prev = outcomes[i - 1];
        const key = prev.expected * 100 + o.expected;
        bump(transTally, key, isError, o.timingMs);
      }
    }
  }

  const weakNotes: WeakNote[] = Array.from(noteTally.entries())
    .map(([midi, t]) => ({
      midi,
      label: noteLabel(midi),
      errors: t.errors,
      plays: t.plays,
      rate: t.plays > 0 ? t.errors / t.plays : 0,
      avgAbsTimingMs: avg(t.timing),
    }))
    .filter((n) => n.errors > 0)
    .sort((a, b) => b.rate * b.plays - a.rate * a.plays || a.midi - b.midi);

  const weakTransitions: WeakTransition[] = Array.from(transTally.entries())
    .map(([key, t]) => {
      const from = Math.floor(key / 100);
      const to = key % 100;
      return {
        from,
        to,
        label: `${noteLabel(from)} to ${noteLabel(to)}`,
        errors: t.errors,
        occurrences: t.plays,
        rate: t.plays > 0 ? t.errors / t.plays : 0,
        avgAbsTimingMs: avg(t.timing),
      };
    })
    .filter((t) => t.errors > 0 && t.from !== t.to)
    .sort((a, b) => b.rate * b.occurrences - a.rate * a.occurrences);

  const recentAccuracy = avg(recent.slice(0, 6).map((a) => a.accuracy));
  const targetTmpos = recent.slice(0, 6).map((a) => a.targetBpm);
  const baseBpm = targetTmpos.length > 0 ? median(targetTmpos) : 80;

  let recommendedBpm = baseBpm;
  if (recentAccuracy !== null) {
    if (recentAccuracy < 75) recommendedBpm = baseBpm - 15;
    else if (recentAccuracy > 92) recommendedBpm = baseBpm + 10;
  }
  recommendedBpm = Math.max(50, Math.min(140, Math.round(recommendedBpm)));

  return {
    attemptsAnalyzed: recent.length,
    notesSeen: recent.reduce((a, x) => a + x.total, 0),
    weakNotes,
    weakTransitions,
    recentAccuracy: recentAccuracy === null ? null : Math.round(recentAccuracy),
    recommendedBpm,
    headline: buildHeadline(weakTransitions, weakNotes, recentAccuracy),
  };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildHeadline(
  transitions: WeakTransition[],
  notes: WeakNote[],
  accuracy: number | null,
): string {
  if (transitions.length === 0 && notes.length === 0) {
    return accuracy === null
      ? 'No attempts yet. Play a lesson and the coach will start reading your errors.'
      : 'No repeating mistakes in your recent attempts. Increase the tempo.';
  }
  if (transitions.length > 0) {
    const t = transitions[0];
    return `Your most repeated mistake is ${t.label} (${t.errors} of ${t.occurrences} attempts).`;
  }
  const n = notes[0];
  return `${n.label} is your weakest note (${n.errors} errors in ${n.plays} plays).`;
}

/* ------------------------------------------------------------------ *
 * Exercise validation
 *
 * Anything the coach generates (and, later, anything an LLM generates) has to
 * pass this before it is shown. It is the guard the brief asks for: notes inside
 * the learned range, no silly leaps, legal rhythm values.
 * ------------------------------------------------------------------ */

export interface ExerciseCheck {
  ok: boolean;
  issues: string[];
}

export function validateExercise(
  notes: number[],
  beats: number[],
  opts: { low?: number; high?: number; maxLeap?: number; minLength?: number } = {},
): ExerciseCheck {
  const low = opts.low ?? LESSON_LOW;
  const high = opts.high ?? LESSON_HIGH;
  const maxLeap = opts.maxLeap ?? 7;
  const minLength = opts.minLength ?? 4;
  const issues: string[] = [];

  if (notes.length !== beats.length) issues.push('notes and beats arrays differ in length');
  if (notes.length < minLength) issues.push(`exercise has fewer than ${minLength} notes`);
  if (notes.length > 40) issues.push('exercise has more than 40 notes');

  const outOfRange = notes.filter((n) => n < low || n > high);
  if (outOfRange.length > 0) {
    issues.push(`notes outside range: ${outOfRange.map(noteLabel).join(', ')}`);
  }

  for (let i = 1; i < notes.length; i += 1) {
    const leap = Math.abs(notes[i] - notes[i - 1]);
    if (leap === 0) continue; // repeated notes are legal
    if (leap > maxLeap) {
      issues.push(`interval ${intervalName(leap)} at note ${i + 1} exceeds ${maxLeap} semitones`);
    }
  }

  for (const b of beats) {
    if (!(b > 0) || b > 4) issues.push('beat value outside 0 to 4');
  }

  return { ok: issues.length === 0, issues };
}

/* ---------------------------------------------------------------- drills */

function clampToLessonRange(midi: number): number {
  return Math.min(LESSON_HIGH, Math.max(LESSON_LOW, midi));
}

export function buildDrill(
  report: CoachReport,
  category: Lesson['category'] = 'scales',
): Lesson {
  const pairs = report.weakTransitions.slice(0, 2);
  let sequence: number[] = [];

  for (const t of pairs) {
    // Oscillate around the failing pair: a b a b b a b a b a
    sequence.push(t.from, t.to, t.from, t.to, t.to, t.from, t.to, t.from, t.to, t.from);
  }

  if (sequence.length === 0 && report.weakNotes.length > 0) {
    const w = report.weakNotes[0].midi;
    sequence = [
      clampToLessonRange(w - 2),
      clampToLessonRange(w - 1),
      w,
      clampToLessonRange(w + 1),
      w,
      clampToLessonRange(w + 1),
      clampToLessonRange(w - 1),
      w,
    ];
  }

  if (sequence.length === 0) sequence = [60, 62, 64, 65, 67, 64, 62, 60];

  let clamped = sequence.map(clampToLessonRange);
  let beats = clamped.map((_, i) => (i === clamped.length - 1 ? 2 : 1));
  let check = validateExercise(clamped, beats);

  if (!check.ok) {
    // Programmatic repair: drop notes that break the leap rule, then re-check.
    const repaired: number[] = [];
    for (const n of clamped) {
      const last = repaired[repaired.length - 1];
      if (last === undefined || Math.abs(n - last) <= 7) repaired.push(n);
    }
    clamped = repaired.length >= 4 ? repaired : [60, 62, 64, 65, 67, 64, 62, 60];
    beats = clamped.map((_, i) => (i === clamped.length - 1 ? 2 : 1));
    check = validateExercise(clamped, beats);
  }

  const target = report.weakTransitions.length
    ? `Targeting ${report.weakTransitions
        .slice(0, 2)
        .map((t) => t.label)
        .join(' and ')}`
    : report.weakNotes.length
      ? `Targeting ${report.weakNotes[0].label}`
      : 'Warm-up: C major, both directions';

  return {
    id: `drill-${pairs.map((t) => `${t.from}-${t.to}`).join('_') || 'scale'}-${report.recommendedBpm}`,
    title: 'Adaptive drill',
    subtitle: check.ok ? target : `${target} (auto-checked)`,
    category,
    mode: 'patient',
    targetBpm: report.recommendedBpm,
    notes: clamped,
    beats,
    tip: explainReport(report),
    generated: true,
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic teaching language
 *
 * Rule-based explanations. This is the part of "AI teacher" that genuinely does
 * not need a model: it is a lookup on the shape of the mistake. It is instant,
 * free, offline and reproducible.
 * ------------------------------------------------------------------ */

export function explainWeakSpot(t: WeakTransition, bpm: number): string {
  const leap = Math.abs(t.to - t.from);

  const noBlackKeyBetween =
    (t.from === 64 && t.to === 65) ||
    (t.from === 65 && t.to === 64) ||
    (t.from === 71 && t.to === 72) ||
    (t.from === 72 && t.to === 71);

  if (noBlackKeyBetween) {
    return `${t.label}: these two white keys have no black key between them, so there is no physical landmark. Anchor a finger on the lower note and feel for the gap instead of looking.`;
  }

  if (leap >= 5) {
    return `${t.label} is a ${intervalName(leap)}. Move the whole hand instead of stretching fingers, and keep the wrist level.`;
  }

  if (t.avgAbsTimingMs !== null && t.avgAbsTimingMs > 120) {
    return `${t.label} is mostly a timing problem (${Math.round(
      t.avgAbsTimingMs,
    )} ms average error). Drop to ${Math.max(50, bpm - 15)} BPM and play it against the metronome.`;
  }

  return `${t.label}: repeat this pair ten times slowly before you try to speed it up.`;
}

export function explainReport(report: CoachReport): string {
  if (report.weakTransitions.length > 0) {
    return explainWeakSpot(report.weakTransitions[0], report.recommendedBpm);
  }
  if (report.weakNotes.length > 0) {
    return `${report.weakNotes[0].label} is not automatic yet. Play it against its neighbours before adding speed.`;
  }
  return 'Warm-up drill. Clean repetitions at a controlled tempo.';
}

/** Ranked practice plan, mirroring the "Today's practice" block in the brief. */
export function buildPracticePlan(report: CoachReport): { label: string; minutes: number }[] {
  const plan: { label: string; minutes: number }[] = [];
  const transitions = report.weakTransitions.slice(0, 2);

  for (const t of transitions) {
    plan.push({ label: `${t.label} transitions`, minutes: 3 });
  }
  plan.push({ label: 'C major scale, both directions', minutes: 4 });
  plan.push({ label: 'Current song, hands on the block', minutes: 4 });

  return plan.slice(0, 4);
}