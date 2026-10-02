/**
 * Timing diagnostics.
 *
 * The coach already said "your timing needs work". That is not actionable, and it
 * is not evidence. This module reconstructs what actually happened, note by note,
 * and names the pattern.
 *
 * From one attempt it recovers, per correct note, the ideal onset and the actual
 * onset, then derives three numbers that separate very different failures:
 *
 *   bias   mean signed error. A constant offset means anticipation or residual
 *          latency, not a skill gap. You are playing in the right rhythm but
 *          shifted.
 *   spread standard deviation. High spread with near zero bias means the passage
 *          is not automatic yet: the notes are still being found.
 *   drift  least squares slope of error against note index. A rising slope is
 *          dragging, a falling slope is rushing. That is a pulse failure, not a
 *          note failure.
 *
 * Those three numbers, plus per note outliers, are enough to tell a learner why
 * their timing failed, with the numbers to back it.
 */

import { LESSON_HIGH, LESSON_LOW, type Lesson } from './lessons';
import { noteLabel } from './notes';
import type { AttemptRecord } from './progress';
import { clampBpm } from './practice';

export type TimingSeverity = 'on-time' | 'close' | 'off';

export interface TimingSample {
  index: number;
  midi: number;
  label: string;
  /** Previous pitch in the phrase, for naming the movement that failed. */
  fromLabel: string | null;
  transition: string | null;
  /** Ideal onset, in ms, relative to the first measured note. */
  expectedMs: number;
  /** Where the note was actually played, in ms. */
  actualMs: number;
  /** Signed error: positive means late. */
  errorMs: number;
  severity: TimingSeverity;
}

export type TimingFindingId =
  | 'systematic-late'
  | 'systematic-early'
  | 'drifting-late'
  | 'drifting-early'
  | 'scattered'
  | 'isolated-note'
  | 'hesitant-start'
  | 'rushed-end'
  | 'clean';

export interface TimingFinding {
  id: TimingFindingId;
  title: string;
  /** The measurement that triggered it. */
  evidence: string;
  /** The most likely cause. */
  cause: string;
  /** What to do about it, concretely. */
  fix: string;
  /** 0 to 100, for ranking the primary finding. */
  severity: number;
}

export interface TimingHistogramBin {
  fromMs: number;
  toMs: number;
  count: number;
}

export interface TimingDiagnosis {
  measured: number;
  /** Mean signed error in ms. */
  biasMs: number;
  meanAbsMs: number;
  stdevMs: number;
  /** ms per note. Positive means progressively later. */
  driftMsPerNote: number;
  /** Total drift across the phrase, in ms. */
  driftTotalMs: number;
  onTimePct: number;
  closePct: number;
  offPct: number;
  samples: TimingSample[];
  histogram: TimingHistogramBin[];
  findings: TimingFinding[];
  primary: TimingFinding;
  mode: 'patient' | 'strict';
  targetBpm: number;
  suggestedBpm: number;
  /** True when this bias also shows up in earlier attempts, so it is not luck. */
  consistentBias: boolean;
}

const ON_TIME_MS = 60;
const CLOSE_MS = 120;
const HIST_SPAN_MS = 320;
const HIST_BINS = 12;

/**
 * Plain language timing bands.
 *
 * A beginner cannot act on "+200 ms". They can act on "you were late". The numbers
 * stay available because an advanced learner wants them, but the default display is
 * words, and the words are chosen so that each one implies a different action:
 *
 *   on the beat   nothing to change
 *   a bit late    small correction, keep the tempo
 *   late          slow down, the pulse is not held
 *   quite late    stop and break the passage down
 */
export type TimingBand =
  | 'early-far'
  | 'early'
  | 'on'
  | 'late'
  | 'late-far';

export interface BandInfo {
  band: TimingBand;
  /** Short label for a chip. */
  label: string;
  /** Sentence for the feedback line. */
  sentence: string;
  /** What the learner should do about it. */
  hint: string;
  tone: 'good' | 'close' | 'bad';
}

const NEAR_MS = 60;
const OFF_MS = 150;

/**
 * Map a signed error in ms to a band. Three thresholds only, because more
 * granularity than "on, off, badly off" is precision the instrument cannot
 * honestly deliver.
 */
export function timingBand(errorMs: number): BandInfo {
  const abs = Math.abs(errorMs);
  const late = errorMs > 0;

  if (abs <= NEAR_MS) {
    return {
      band: 'on',
      label: 'on the beat',
      sentence: 'On the beat',
      hint: 'Exactly right. Keep that.',
      tone: 'good',
    };
  }

  if (abs <= OFF_MS) {
    return {
      band: late ? 'late' : 'early',
      label: late ? 'a bit late' : 'a bit early',
      sentence: late ? 'A bit late' : 'A bit early',
      hint: late
        ? 'Small correction. Press on the click rather than after it.'
        : 'Small correction. Wait for the click instead of jumping it.',
      tone: 'close',
    };
  }

  return {
    band: late ? 'late-far' : 'early-far',
    label: late ? 'much too late' : 'much too early',
    sentence: late ? 'That was much too late' : 'That was much too early',
    hint: late
      ? 'The tempo is ahead of your hands. Drop a tempo rung and listen to it again first.'
      : 'You are running ahead of the beat. Drop a tempo rung and listen to it again first.',
    tone: 'bad',
  };
}

/**
 * The one line to show a learner after a note or at the end of a run.
 * `preferNumbers` is the escape hatch for people who do want milliseconds.
 */
export function describeError(errorMs: number, preferNumbers = false): string {
  if (preferNumbers) {
    const v = Math.round(errorMs);
    if (Math.abs(v) < 8) return 'on the beat';
    return `${v > 0 ? '+' : ''}${v} ms`;
  }
  return timingBand(errorMs).sentence;
}

/** Summary line for a whole run: what the numbers add up to in words. */
export function describeRun(biasMs: number, stdevMs: number, onTimePct: number): string {
  if (onTimePct >= 80) return 'You are holding the beat.';
  if (Math.abs(biasMs) <= 40 && stdevMs <= 90) return 'Tight, with the odd slip.';
  if (Math.abs(biasMs) >= 70 && stdevMs <= 110) {
    return biasMs > 0
      ? 'You are playing the right rhythm, just consistently after the beat.'
      : 'You are playing the right rhythm, just consistently before the beat.';
  }
  if (stdevMs >= 150) {
    return 'The notes are landing all over the place, so the phrase is not automatic yet.';
  }
  if (biasMs > 0) return 'You are tending to arrive late.';
  return 'You are tending to arrive early.';
}

/** Short band label for a chip, e.g. "a bit late". */
export function describeBandShort(errorMs: number, preferNumbers = false): string {
  if (preferNumbers) {
    const v = Math.round(errorMs);
    if (Math.abs(v) < 8) return 'on time';
    return `${v > 0 ? '+' : ''}${v}`;
  }
  return timingBand(errorMs).label;
}

export function timingSeverity(errorMs: number): TimingSeverity {
  const a = Math.abs(errorMs);
  if (a <= ON_TIME_MS) return 'on-time';
  if (a <= CLOSE_MS) return 'close';
  return 'off';
}

export function meanOf(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdevOf(values: number[]): number {
  if (values.length < 2) return 0;
  const m = meanOf(values);
  return Math.sqrt(values.reduce((a, x) => a + (x - m) ** 2, 0) / values.length);
}

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Least squares slope of error against note index, in ms per note. */
export function driftSlope(errors: number[]): number {
  const n = errors.length;
  if (n < 3) return 0;
  const xs = errors.map((_, i) => i);
  const mx = meanOf(xs);
  const my = meanOf(errors);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (errors[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function cumulative(beats: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const b of beats) {
    out.push(acc);
    acc += b;
  }
  return out;
}

/* ---------------------------------------------------------------- samples */

export function buildSamples(attempt: AttemptRecord): TimingSample[] {
  const beats =
    attempt.beats && attempt.beats.length === attempt.outcomes.length
      ? attempt.beats
      : attempt.outcomes.map(() => 1);
  const cum = cumulative(beats);
  const beatSec = 60 / clampBpm(attempt.targetBpm);
  const samples: TimingSample[] = [];

  for (const o of attempt.outcomes) {
    if (o.status !== 'correct' || o.timingMs === null) continue;
    // In free pace mode the ideal clock is anchored to the first note, so its
    // error is zero by definition and carries no information.
    if (attempt.mode === 'patient' && o.index === 0) continue;

    const expectedMs = cum[o.index] * beatSec * 1000;
    const errorMs = o.timingMs;
    const prev = o.index > 0 ? attempt.outcomes[o.index - 1] : null;
    const fromLabel = prev ? noteLabel(prev.expected) : null;

    samples.push({
      index: o.index,
      midi: o.expected,
      label: noteLabel(o.expected),
      fromLabel,
      transition: fromLabel ? `${fromLabel} to ${noteLabel(o.expected)}` : null,
      expectedMs,
      actualMs: expectedMs + errorMs,
      errorMs,
      severity: timingSeverity(errorMs),
    });
  }
  return samples;
}

/** Distribution of errors, clipped to plus or minus the span. */
export function buildHistogram(errors: number[]): TimingHistogramBin[] {
  const width = (HIST_SPAN_MS * 2) / HIST_BINS;
  const bins: TimingHistogramBin[] = [];
  for (let i = 0; i < HIST_BINS; i += 1) {
    const fromMs = -HIST_SPAN_MS + i * width;
    bins.push({ fromMs, toMs: fromMs + width, count: 0 });
  }
  for (const e of errors) {
    const idx = Math.min(HIST_BINS - 1, Math.max(0, Math.floor((e + HIST_SPAN_MS) / width)));
    bins[idx].count += 1;
  }
  return bins;
}

/* --------------------------------------------------------------- findings */

export interface FindingInput {
  errors: number[];
  bias: number;
  stdev: number;
  slope: number;
  samples: TimingSample[];
  mode: 'patient' | 'strict';
}

export function findTimingIssues(input: FindingInput): TimingFinding[] {
  const { errors, bias, stdev, slope, samples, mode } = input;
  const n = errors.length;
  if (n < 2) return [];

  const findings: TimingFinding[] = [];
  const medianAbs = medianOf(errors.map((e) => Math.abs(e)));
  const driftTotal = slope * (n - 1);
  const latePct = Math.round((100 * errors.filter((e) => e > 0).length) / n);

  // 1. A steady offset with a tight spread is anticipation or latency, not skill.
  if (Math.abs(bias) >= 70 && stdev <= 110) {
    const late = bias > 0;
    findings.push({
      id: late ? 'systematic-late' : 'systematic-early',
      title: late
        ? `You are consistently late by about ${Math.round(bias)} ms`
        : `You are consistently early by about ${Math.round(Math.abs(bias))} ms`,
      evidence: `Mean error ${Math.round(bias)} ms over ${n} notes, spread only ${Math.round(
        stdev,
      )} ms, ${latePct} percent late.`,
      cause: late
        ? 'A steady offset with a tight spread is not an accuracy problem. You are waiting to hear the click and then pressing, so the rhythm is right but shifted.'
        : 'A steady offset with a tight spread means you are running ahead of the pulse, which usually happens when the notes feel easy.',
      fix: late
        ? 'Count the beat and press on the click rather than after it. If this offset repeats across lessons it is partly device latency: Settings, Timing, raise the manual offset by about the same amount.'
        : 'Play against the metronome aiming to land exactly on the click. Counting out loud, "one and two and", usually fixes this within a session.',
      severity: Math.min(100, Math.round(Math.abs(bias) / 2)),
    });
  }

  // 2. Drift: the error grows or shrinks across the phrase.
  if (Math.abs(driftTotal) >= 120 && Math.abs(slope) >= 12) {
    const dragging = driftTotal > 0;
    findings.push({
      id: dragging ? 'drifting-late' : 'drifting-early',
      title: dragging
        ? `You fall behind as the phrase goes on, ${Math.round(driftTotal)} ms by the end`
        : `You speed up as the phrase goes on, ${Math.round(Math.abs(driftTotal))} ms ahead by the end`,
      evidence: `Started ${Math.round(errors[0])} ms off, ended ${Math.round(
        errors[n - 1],
      )} ms off, about ${slope.toFixed(1)} ms change per note.`,
      cause: dragging
        ? 'This is a pulse failure, not a note failure. Either a hand movement takes longer than the beat allows, or you are reading ahead and losing the click.'
        : 'This is a pulse failure. You are running ahead because nothing in the phrase is forcing you to wait.',
      fix: dragging
        ? 'Slow down until the whole phrase fits the beat, then loop only the second half. Do not practise the whole thing to fix the end.'
        : 'Raise the metronome slightly so there is no room to run, and count every note rather than every other note.',
      severity: Math.min(100, Math.round(Math.abs(driftTotal) / 3)),
    });
  }

  // 3. Scatter with no bias: the passage is not automatic yet.
  if (stdev >= 150 && Math.abs(bias) < 90) {
    findings.push({
      id: 'scattered',
      title: 'Your timing is scattered rather than shifted',
      evidence: `Errors run from ${Math.round(Math.min(...errors))} to ${Math.round(
        Math.max(...errors),
      )} ms with a spread of ${Math.round(stdev)} ms and almost no overall bias.`,
      cause:
        'No consistent direction means the passage is not automatic yet. You are still deciding where the notes are, so the rhythm is a side effect of the search.',
      fix: 'Take the tempo down until you can play it three times in a row without a wrong key, then raise it in steps of 8 BPM.',
      severity: Math.min(100, Math.round(stdev / 2.4)),
    });
  }

  findings.push(...findTimingTail(errors, samples, mode, n, medianAbs));
  return findings.sort((a, b) => b.severity - a.severity);
}

/** Isolated outliers, late entry and rushed endings. */
function findTimingTail(
  errors: number[],
  samples: TimingSample[],
  mode: 'patient' | 'strict',
  n: number,
  medianAbs: number,
): TimingFinding[] {
  const findings: TimingFinding[] = [];

  // 4. One outlier: the movement into that note is the problem.
  if (n >= 4) {
    let worst = samples[0];
    for (const s of samples) {
      if (Math.abs(s.errorMs) > Math.abs(worst.errorMs)) worst = s;
    }
    if (Math.abs(worst.errorMs) >= 220 && Math.abs(worst.errorMs) >= 2 * medianAbs + 150) {
      findings.push({
        id: 'isolated-note',
        title: worst.transition
          ? `One movement is the problem: ${worst.transition}`
          : `One note is the problem: ${worst.label}`,
        evidence: `${worst.label} was ${Math.round(
          worst.errorMs,
        )} ms off while your median note was ${Math.round(medianAbs)} ms off.`,
        cause:
          'When everything else is close and one note is not, the fault is the movement into that note rather than the pulse.',
        fix: `Isolate ${worst.transition ?? worst.label} and repeat the pair ten times slowly, then rejoin it to the phrase.`,
        severity: Math.min(100, Math.round(Math.abs(worst.errorMs) / 3.5)),
      });
    }
  }

  // 5. Late entry, only measurable when the clock is fixed to the metronome.
  if (mode === 'strict' && samples[0] && samples[0].errorMs >= 180) {
    findings.push({
      id: 'hesitant-start',
      title: 'You start late',
      evidence: `The first note arrived ${Math.round(samples[0].errorMs)} ms after the downbeat.`,
      cause: 'You are not ready when the count-in ends, so you enter behind the beat and stay behind it.',
      fix: 'Use the four beat count-in to place your hand on the first key and press on the last count, not after it.',
      severity: Math.min(100, Math.round(samples[0].errorMs / 4)),
    });
  }

  // 6. The long final note gets played early.
  if (n >= 4 && samples[n - 1] && samples[n - 1].errorMs <= -150) {
    findings.push({
      id: 'rushed-end',
      title: 'You rush the final note',
      evidence: `The last note came ${Math.round(Math.abs(samples[n - 1].errorMs))} ms early.`,
      cause: 'A long final note has more room than the others, so it gets played early to be finished with.',
      fix: 'Count the final note for its full length and release it rather than re-pressing.',
      severity: Math.min(100, Math.round(Math.abs(samples[n - 1].errorMs) / 5)),
    });
  }

  void errors;
  return findings;
}

/* ------------------------------------------------------------- diagnosis */

const CLEAN: TimingFinding = {
  id: 'clean',
  title: 'Timing is solid',
  evidence: '',
  cause: 'Nothing to fix here.',
  fix: 'Raise the tempo by 8 BPM and play it again to keep the pressure on.',
  severity: 0,
};

export function diagnoseTiming(
  attempt: AttemptRecord,
  opts: { history?: AttemptRecord[] } = {},
): TimingDiagnosis {
  const samples = buildSamples(attempt);
  const errors = samples.map((s) => s.errorMs);
  const bias = meanOf(errors);
  const stdev = stdevOf(errors);
  const slope = driftSlope(errors);
  const findings = findTimingIssues({
    errors,
    bias,
    stdev,
    slope,
    samples,
    mode: attempt.mode,
  });

  const clean: TimingFinding = {
    ...CLEAN,
    evidence:
      errors.length === 0
        ? 'No notes were played accurately enough to measure timing on this run.'
        : `Mean error ${Math.round(bias)} ms, spread ${Math.round(stdev)} ms across ${
            errors.length
          } notes.`,
  };

  const primary = findings[0] ?? clean;

  // A bias that repeats across lessons is a device or anticipation problem rather
  // than a bad run, which changes the advice completely.
  const historyBiases = (opts.history ?? [])
    .slice(0, 5)
    .map((a) => meanOf(buildSamples(a).map((s) => s.errorMs)))
    .filter((v) => Number.isFinite(v));
  const consistentBias =
    Math.abs(bias) >= 70 &&
    historyBiases.length >= 2 &&
    historyBiases.filter((b) => Math.sign(b) === Math.sign(bias) && Math.abs(b) >= 50).length >= 2;

  const counts = { on: 0, close: 0, off: 0 };
  for (const s of samples) {
    if (s.severity === 'on-time') counts.on += 1;
    else if (s.severity === 'close') counts.close += 1;
    else counts.off += 1;
  }
  const total = Math.max(1, samples.length);

  // A shifted rhythm wants a small tempo change, a scrambled one wants a big one.
  const tempoFactor =
    primary.id === 'systematic-late' || primary.id === 'systematic-early'
      ? 0.88
      : primary.id === 'drifting-early' || primary.id === 'rushed-end'
        ? 1.05
        : 0.8;

  return {
    measured: samples.length,
    biasMs: Math.round(bias),
    meanAbsMs: Math.round(meanOf(errors.map(Math.abs))),
    stdevMs: Math.round(stdev),
    driftMsPerNote: Number(slope.toFixed(1)),
    driftTotalMs: Math.round(slope * Math.max(0, errors.length - 1)),
    onTimePct: Math.round((100 * counts.on) / total),
    closePct: Math.round((100 * counts.close) / total),
    offPct: Math.round((100 * counts.off) / total),
    samples,
    histogram: buildHistogram(errors),
    findings: findings.length > 0 ? findings : [clean],
    primary,
    mode: attempt.mode,
    targetBpm: attempt.targetBpm,
    suggestedBpm: clampBpm(Math.round(attempt.targetBpm * tempoFactor)),
    consistentBias,
  };
}

/* --------------------------------------------------------------- fix drill */

function clampToLessonRange(midi: number): number {
  return Math.min(LESSON_HIGH, Math.max(LESSON_LOW, midi));
}

/**
 * Turn a timing finding into something playable.
 *
 * Diagnostic advice that does not come attached to an exercise is just noise, so
 * every finding produces a drill shaped around the specific failure: isolated
 * pairs for a bad movement, the second half only for a drag, a lengthened final
 * note for rushing, and a doubled first note when the entry is late.
 */
export function timingFixLesson(attempt: AttemptRecord, diagnosis: TimingDiagnosis): Lesson {
  const played = attempt.outcomes
    .filter((o) => o.status === 'correct')
    .map((o) => clampToLessonRange(o.expected));
  const phrase = played.length >= 3 ? played : [60, 62, 64, 65, 67];
  const p = diagnosis.primary;

  let notes = phrase;
  let mode: Lesson['mode'] = 'strict';
  let beats: number[] = phrase.map((_, i) => (i === phrase.length - 1 ? 2 : 1));
  let tip = p.fix;
  let subtitle = `Timing fix: ${p.title}`;
  let bpm = diagnosis.suggestedBpm;

  if (p.id === 'isolated-note' && diagnosis.samples.length > 0) {
    let worst = diagnosis.samples[0];
    for (const s of diagnosis.samples) {
      if (Math.abs(s.errorMs) > Math.abs(worst.errorMs)) worst = s;
    }
    const target = clampToLessonRange(worst.midi);
    const prev = attempt.outcomes[worst.index - 1];
    let from = prev ? clampToLessonRange(prev.expected) : clampToLessonRange(target - 2);
    // Keep the pair playable even when the source phrase had a wide leap in it.
    if (Math.abs(target - from) > 7) from = clampToLessonRange(target - 2);

    notes = [from, target, from, target, target, from, target, from, target, from];
    beats = notes.map((_, i) => (i === notes.length - 1 ? 2 : 1));
    mode = 'patient';
    bpm = Math.max(48, Math.round(diagnosis.suggestedBpm * 0.9));
    subtitle = `Timing fix: ${noteLabel(from)} to ${noteLabel(target)}`;
    tip = `${p.fix} Played slowly this pair should feel like one movement rather than two decisions.`;
  } else if (p.id === 'hesitant-start') {
    notes = [phrase[0], phrase[0], ...phrase];
    beats = notes.map((_, i) => (i === notes.length - 1 ? 2 : 1));
    tip = `${p.fix} The repeated first note is deliberate: it gives you a target on the downbeat.`;
  } else if (p.id === 'rushed-end') {
    beats = notes.map((_, i) => (i === notes.length - 1 ? 4 : 1));
    tip = `${p.fix} The final note is now four beats long, so rushing it becomes obvious.`;
  } else if (p.id === 'drifting-late') {
    const half = Math.max(3, Math.ceil(phrase.length / 2));
    notes = phrase.slice(phrase.length - half);
    beats = notes.map((_, i) => (i === notes.length - 1 ? 2 : 1));
    subtitle = 'Timing fix: the second half only';
    tip = `${p.fix} Looping only the part that fails is the entire point of this drill.`;
  }

  return {
    id: `timing-${p.id}-${attempt.lessonId}`,
    title: 'Timing drill',
    subtitle,
    category: attempt.category,
    mode,
    targetBpm: bpm,
    notes,
    beats,
    tip,
    generated: true,
  };
}

export interface BiasPoint {
  at: number;
  lessonTitle: string;
  biasMs: number;
  stdevMs: number;
  measured: number;
}

/** Bias and spread over recent attempts, oldest last, for a trend line. */
export function biasTrend(attempts: AttemptRecord[], limit = 12): BiasPoint[] {
  return attempts
    .slice(0, limit)
    .map((a) => {
      const samples = buildSamples(a);
      const errors = samples.map((s) => s.errorMs);
      return {
        at: a.at,
        lessonTitle: a.lessonTitle,
        biasMs: Math.round(meanOf(errors)),
        stdevMs: Math.round(stdevOf(errors)),
        measured: samples.length,
      };
    })
    .filter((p) => p.measured >= 2)
    .reverse();
}
