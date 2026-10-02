/**
 * Scoring engine. Pure arithmetic: no I/O, no LLM.
 *
 * Three metrics, kept separate so the app can say "the notes are right, the
 * timing is not" instead of collapsing everything into one number:
 *
 *   accuracy = correct notes / (expected notes + wrong presses)
 *   timing   = mean of a per-note curve over the absolute timing error
 *   speed    = ideal note span / actual note span, capped at 100
 *
 * `timing` and `speed` are nullable because they are genuinely unmeasurable on
 * some attempts (an exercise abandoned after one note has no span).
 */

export interface Stars {
  accuracy: number;
  timing: number;
  speed: number;
}

export interface Scores {
  accuracy: number;
  timing: number | null;
  speed: number | null;
  evenness: number | null;
  meanAbsTiming: number | null;
  tightPct: number | null;
  overall: number;
  stars: Stars;
}

/**
 * Per-note timing score. Linear interpolation between anchors so any value is
 * explainable: 0 ms is perfect, 120 ms is 78, 350 ms is 28, 600 ms is 0.
 */
const TIMING_CURVE: [number, number][] = [
  [0, 100],
  [60, 92],
  [120, 78],
  [200, 58],
  [350, 28],
  [600, 0],
];

export function timingNoteScore(absMs: number): number {
  const x = Math.abs(absMs);
  const last = TIMING_CURVE[TIMING_CURVE.length - 1][0];
  if (x >= last) return 0;
  for (let i = 1; i < TIMING_CURVE.length; i += 1) {
    const [x1, y1] = TIMING_CURVE[i - 1];
    const [x2, y2] = TIMING_CURVE[i];
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1);
      return Math.round(y1 + t * (y2 - y1));
    }
  }
  return 0;
}

export function metricStars(value: number | null): number {
  if (value === null) return 0;
  if (value >= 95) return 5;
  if (value >= 88) return 4;
  if (value >= 78) return 3;
  if (value >= 65) return 2;
  if (value >= 45) return 1;
  return 0;
}

export function metricLabel(value: number | null, suffix = '%'): string {
  return value === null ? 'n/a' : `${Math.round(value)}${suffix}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface ScoreInput {
  /** Number of notes the exercise contains. */
  total: number;
  correct: number;
  wrongPresses: number;
  /** Absolute timing error, in ms, for every note where it was measurable. */
  timingErrorsMs: number[];
  /** Actual elapsed time between the first and last correct note, in ms. */
  spanActualMs: number | null;
  /** Ideal elapsed time for the same span at the target tempo, in ms. */
  spanIdealMs: number | null;
}

export function computeScores(input: ScoreInput): Scores {
  const { total, correct, wrongPresses, timingErrorsMs } = input;

  const denom = total + wrongPresses;
  const accuracy = denom > 0 ? Math.round(clamp((100 * correct) / denom, 0, 100)) : 0;

  let timing: number | null = null;
  let evenness: number | null = null;
  let meanAbsTiming: number | null = null;
  let tightPct: number | null = null;

  if (timingErrorsMs.length > 0) {
    const abs = timingErrorsMs.map((e) => Math.abs(e));
    const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
    meanAbsTiming = mean;
    const perNote = abs.map(timingNoteScore);
    timing = Math.round(perNote.reduce((a, b) => a + b, 0) / perNote.length);

    const variance = abs.reduce((acc, v) => acc + (v - mean) ** 2, 0) / abs.length;
    const stdev = Math.sqrt(variance);
    evenness = Math.round(clamp(100 * Math.exp(-stdev / 180), 0, 100));
    tightPct = Math.round((100 * abs.filter((v) => v <= 100).length) / abs.length);
  }

  let speed: number | null = null;
  if (
    input.spanActualMs !== null &&
    input.spanIdealMs !== null &&
    input.spanActualMs > 0 &&
    input.spanIdealMs > 0
  ) {
    speed = Math.round(clamp((100 * input.spanIdealMs) / input.spanActualMs, 0, 100));
  }

  // Weighted overall, renormalised over whichever metrics were measurable.
  const parts: { w: number; v: number }[] = [{ w: 4.5, v: accuracy }];
  if (timing !== null) parts.push({ w: 3.5, v: timing });
  if (speed !== null) parts.push({ w: 2, v: speed });
  const weightSum = parts.reduce((a, p) => a + p.w, 0);
  const overall = Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) / weightSum);

  return {
    accuracy,
    timing,
    speed,
    evenness,
    meanAbsTiming,
    tightPct,
    overall,
    stars: {
      accuracy: metricStars(accuracy),
      timing: metricStars(timing),
      speed: metricStars(speed),
    },
  };
}

/** Signed, human-readable timing error, e.g. "+120 ms" / "-80 ms". */
export function formatTiming(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'n/a';
  const v = Math.round(ms);
  if (Math.abs(v) < 8) return 'on time';
  return `${v > 0 ? '+' : ''}${v} ms`;
}

export interface Verdict {
  headline: string;
  detail: string;
}

/**
 * Deterministic coaching text. This is the "Feedback" step of the loop and it is
 * rule-based on purpose: instant, free and reproducible, which is what the brief
 * asks for before any LLM enters the picture.
 */
export function buildVerdict(scores: Scores, mode: 'patient' | 'strict'): Verdict {
  const { accuracy, timing, speed } = scores;

  if (accuracy >= 95 && (timing === null || timing >= 85)) {
    return {
      headline: 'Clean run.',
      detail:
        mode === 'strict'
          ? 'Notes and timing both landed. Raise the BPM by 8 and repeat.'
          : 'Notes and rhythm both landed. Raise the BPM by 8 and repeat.',
    };
  }

  if (accuracy >= 90 && timing !== null && timing < 70) {
    return {
      headline: 'Notes are correct, timing is not.',
      detail: `Every note landed but the spacing drifts (mean error ${Math.round(
        scores.meanAbsTiming ?? 0,
      )} ms). Drop the target BPM by 15 and play it against the metronome.`,
    };
  }

  if (accuracy < 70) {
    return {
      headline: 'Too many wrong keys.',
      detail: 'Slow the tempo down and watch the highlighted key before you press.',
    };
  }

  if (speed !== null && speed < 60) {
    return {
      headline: 'Correct but hesitant.',
      detail: 'You paused between notes. Loop the exercise twice more before moving on.',
    };
  }

  return {
    headline: 'Progress.',
    detail: 'Solid base. Repeat once more for consistency, then move on.',
  };
}