/**
 * Offline evaluation harness.
 *
 * The brief asks for an experiment that can run before any real users exist. This
 * simulates learners against three curriculum strategies so the "static vs
 * adaptive" question can be measured today, with no participants and no network:
 *
 *   static  : fixed lesson order, fixed tempo
 *   adaptive: rule-based coach. Targets the weakest notes and transitions and
 *             drops the tempo when recent accuracy is low
 *   bandit  : epsilon-greedy selection over the same candidate pool, which is the
 *             cheapest way to test the explore/exploit idea
 *
 * The learner model is deliberately simple and explicit, so its assumptions can be
 * argued with: per-note and per-transition skill in [0, 1], a timing skill, a
 * comfort tempo, a practice effect and a forgetting decay.
 *
 * Nothing here is used by the app at runtime. It exists to produce numbers.
 */

import { LESSONS, type Lesson } from './lessons';
import { computeScores, type Scores } from './scoring';

export type Strategy = 'static' | 'adaptive' | 'bandit';

/** Deterministic PRNG so a run is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimConfig {
  learners: number;
  sessions: number;
  seed: number;
  /** Sessions skipped after mastery, to measure retention. */
  retentionGap: number;
}

export const DEFAULT_SIM: SimConfig = {
  learners: 200,
  sessions: 18,
  seed: 20260210,
  retentionGap: 4,
};

interface Learner {
  noteSkill: Map<number, number>;
  transSkill: Map<number, number>;
  timingSkill: number;
  comfortBpm: number;
}

function newLearner(rng: () => number): Learner {
  return {
    // Beginners start weak, with per-note variation so nobody is uniform.
    noteSkill: new Map(),
    transSkill: new Map(),
    timingSkill: 0.12 + rng() * 0.2,
    comfortBpm: 62 + rng() * 14,
  };
}

function get(map: Map<number, number>, key: number, dflt: number): number {
  const v = map.get(key);
  return v === undefined ? dflt : v;
}

const TRANS_INIT = 0.15;
const NOTE_INIT = 0.2;

export interface SimAttempt {
  scores: Scores;
  notesPracticed: number[];
}

/** Run one exercise for one learner and return the resulting scores. */
export function simulateAttempt(
  learner: Learner,
  lesson: Lesson,
  bpm: number,
  rng: () => number,
  applyLearning = true,
): SimAttempt {
  const beatSec = 60 / bpm;
  const timingErrorsMs: number[] = [];
  let correct = 0;
  let wrongPresses = 0;

  for (let i = 0; i < lesson.notes.length; i += 1) {
    const midi = lesson.notes[i];
    const note = get(learner.noteSkill, midi, NOTE_INIT);
    const trans =
      i === 0
        ? 1
        : get(learner.transSkill, lesson.notes[i - 1] * 100 + midi, TRANS_INIT);
    const skill = Math.min(note, trans);

    // Risk rises with tempo: comfort tempo is the point where skill degrades.
    const tempoPenalty = Math.max(0, (bpm - learner.comfortBpm) / 160);
    const pCorrect = Math.max(0.05, Math.min(0.985, 0.12 + 0.88 * skill - tempoPenalty));

    if (rng() < pCorrect) {
      correct += 1;
      // Timing noise shrinks as timing skill grows, and grows with tempo.
      const sigma = 140 * (1.15 - learner.timingSkill) * (0.7 + bpm / 180);
      timingErrorsMs.push((rng() * 2 - 1) * sigma);
    } else {
      wrongPresses += 1;
    }
  }

  // Practice effect, plus a small forgetting decay every session. Suppressed when
  // the exercise is a held-out probe, so measurement never changes the thing
  // being measured.
  if (applyLearning) {
    const lr = 0.075;
    const touched = new Set(lesson.notes);
    for (const midi of touched) {
      const before = get(learner.noteSkill, midi, NOTE_INIT);
      learner.noteSkill.set(midi, Math.min(1, before + lr * (1 - before)));
    }
    for (let i = 1; i < lesson.notes.length; i += 1) {
      const key = lesson.notes[i - 1] * 100 + lesson.notes[i];
      const before = get(learner.transSkill, key, TRANS_INIT);
      learner.transSkill.set(key, Math.min(1, before + lr * 1.25 * (1 - before)));
    }
    for (const [k, v] of learner.noteSkill) learner.noteSkill.set(k, v * 0.995);
    for (const [k, v] of learner.transSkill) learner.transSkill.set(k, v * 0.994);
  }

  const spanNotes = Math.max(1, correct - 1);
  const scores = computeScores({
    total: lesson.notes.length,
    correct,
    wrongPresses,
    timingErrorsMs,
    // Correct notes arrive on the modelled beat; the span only carries the tempo.
    spanActualMs: spanNotes * beatSec * 1000,
    spanIdealMs: spanNotes * beatSec * 1000,
  });

  return { scores, notesPracticed: lesson.notes };
}

/* ------------------------------------------------------------- strategies */

function allTransitions(): [number, number][] {
  const pairs = new Set<string>();
  for (const lesson of LESSONS) {
    for (let i = 1; i < lesson.notes.length; i += 1) {
      pairs.add(`${lesson.notes[i - 1]}-${lesson.notes[i]}`);
    }
  }
  return [...pairs].map((s) => {
    const [a, b] = s.split('-').map(Number);
    return [a, b] as [number, number];
  });
}

/** A drill aimed at whatever the learner is worst at right now. */
function weakDrill(learner: Learner): Lesson {
  const scored = allTransitions()
    .map(([a, b]) => ({
      a,
      b,
      skill: Math.min(
        get(learner.noteSkill, a, NOTE_INIT),
        get(learner.noteSkill, b, NOTE_INIT),
        get(learner.transSkill, a * 100 + b, TRANS_INIT),
      ),
    }))
    .sort((x, y) => x.skill - y.skill)
    .slice(0, 2);

  const notes: number[] = [];
  for (const pair of scored) {
    notes.push(pair.a, pair.b, pair.a, pair.b, pair.b, pair.a, pair.b, pair.a);
  }
  const used = notes.length > 0 ? notes : [60, 62, 64, 65, 67, 64, 62, 60];

  return {
    id: 'sim-drill',
    title: 'Sim drill',
    subtitle: 'weakest transitions',
    category: 'scales',
    mode: 'patient',
    targetBpm: 70,
    notes: used,
    beats: used.map((_, i) => (i === used.length - 1 ? 2 : 1)),
    tip: '',
    generated: true,
  };
}

/** How badly the learner needs this exercise: lower means more needed. */
function coverageSkill(learner: Learner, lesson: Lesson): number {
  let total = 0;
  for (let i = 0; i < lesson.notes.length; i += 1) {
    total += get(learner.noteSkill, lesson.notes[i], NOTE_INIT);
    if (i > 0) {
      total += get(learner.transSkill, lesson.notes[i - 1] * 100 + lesson.notes[i], TRANS_INIT);
    }
  }
  return total / (lesson.notes.length * 2 - 1);
}

function adaptiveTempo(learner: Learner, recent: number[]): number {
  if (recent.length === 0) return Math.round(learner.comfortBpm);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const delta = avg > 92 ? 12 : avg > 82 ? 4 : -12;
  return Math.max(50, Math.min(140, Math.round(learner.comfortBpm + delta)));
}

export interface SimResult {
  strategy: Strategy;
  /** Accuracy on the exercise the strategy chose, per session. */
  accuracy: number[];
  /** Accuracy on the fixed held-out probe, per session. Comparable across arms. */
  probeAccuracy: number[];
  overall: number[];
  masterySession: number | null;
  finalAccuracy: number;
  finalProbeAccuracy: number;
  finalOverall: number;
  retention: number | null;
  exercises: number;
}

/**
 * Held-out probe. Identical for every arm, never used as training material, so
 * the three strategies are finally measured on the same thing. Without this, an
 * adaptive arm that keeps raising difficulty looks worse than a static arm that
 * keeps replaying the same comfortable exercises, which is a measurement artefact
 * rather than a finding.
 */
const PROBE_LESSON: Lesson = {
  id: 'probe',
  title: 'Reference probe',
  subtitle: 'held out',
  category: 'scales',
  mode: 'patient',
  targetBpm: 70,
  notes: [60, 62, 64, 65, 67, 69, 71, 72],
  beats: [1, 1, 1, 1, 1, 1, 1, 1],
  tip: '',
};

export const PROBE_BPM = 70;
export { PROBE_LESSON };

function decayOnly(learner: Learner): void {
  for (const [k, v] of learner.noteSkill) learner.noteSkill.set(k, v * 0.985);
  for (const [k, v] of learner.transSkill) learner.transSkill.set(k, v * 0.982);
}

export function runStrategy(strategy: Strategy, config: SimConfig = DEFAULT_SIM): SimResult {
  const rng = mulberry32(config.seed);
  const accuracy = new Array<number>(config.sessions).fill(0);
  const probeAccuracy = new Array<number>(config.sessions).fill(0);
  const overall = new Array<number>(config.sessions).fill(0);
  const masterySessions: number[] = [];
  let retentionSum = 0;
  let retentionCount = 0;
  let exercises = 0;

  for (let l = 0; l < config.learners; l += 1) {
    const learner = newLearner(rng);
    const recent: number[] = [];
    let mastered: Lesson | null = null;
    let masteryAt: number | null = null;
    let curriculumCursor = 0;

    // Bandit state: value estimates and visit counts per lesson slot.
    const values = LESSONS.map(() => 0.5);
    const visits = LESSONS.map(() => 1);

    for (let s = 0; s < config.sessions; s += 1) {
      let lesson: Lesson;
      let bpm: number;

      if (strategy === 'static') {
        lesson = LESSONS[s % LESSONS.length];
        bpm = lesson.targetBpm;
      } else if (strategy === 'adaptive') {
        // Rule-based: attack the weakest material, tempo from recent form.
        let best = weakDrill(learner);
        let bestScore = coverageSkill(learner, best);
        for (const candidate of LESSONS) {
          const score = coverageSkill(learner, candidate);
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        // Advance when everything targeted is already comfortable. Without a gate
        // like this the arm loops on the same drill forever, which is a treadmill
        // rather than a curriculum.
        if (bestScore > 0.8) {
          best = LESSONS[curriculumCursor % LESSONS.length];
          curriculumCursor += 1;
        }
        lesson = best;
        bpm = adaptiveTempo(learner, recent);
      } else {
        // Epsilon-greedy over the fixed lesson pool, 15 percent exploration.
        if (rng() < 0.15) {
          lesson = LESSONS[Math.floor(rng() * LESSONS.length)];
        } else {
          let idx = 0;
          for (let i = 1; i < values.length; i += 1) if (values[i] > values[idx]) idx = i;
          lesson = LESSONS[idx];
        }
        bpm = adaptiveTempo(learner, recent);
      }

      const attempt = simulateAttempt(learner, lesson, bpm, rng);
      exercises += 1;
      accuracy[s] += attempt.scores.accuracy;
      overall[s] += attempt.scores.overall;

      const slot = LESSONS.findIndex((x) => x.id === lesson.id);
      if (strategy === 'bandit' && slot >= 0) {
        visits[slot] += 1;
        values[slot] += (attempt.scores.overall / 100 - values[slot]) / visits[slot];
      }

      recent.push(attempt.scores.accuracy);
      if (recent.length > 4) recent.shift();
      learner.comfortBpm = Math.min(150, learner.comfortBpm + 0.5);

      if (masteryAt === null && attempt.scores.overall >= 85) {
        masteryAt = s;
        mastered = lesson;
      }

      // Held-out probe, measured on the same content for every arm, with learning
      // disabled so measuring does not change what is measured.
      const probe = simulateAttempt(learner, PROBE_LESSON, PROBE_BPM, rng, false);
      probeAccuracy[s] += probe.scores.accuracy;
    }

    if (masteryAt !== null) masterySessions.push(masteryAt);

    // Retention: decay only across the gap, then re-test the mastered exercise.
    if (mastered) {
      for (let g = 0; g < config.retentionGap; g += 1) decayOnly(learner);
      const retest = simulateAttempt(learner, mastered, mastered.targetBpm, rng);
      retentionSum += retest.scores.accuracy;
      retentionCount += 1;
    }
  }

  const n = config.learners;
  return {
    strategy,
    accuracy: accuracy.map((v) => v / n),
    probeAccuracy: probeAccuracy.map((v) => v / n),
    overall: overall.map((v) => v / n),
    masterySession:
      masterySessions.length === 0
        ? null
        : masterySessions.reduce((a, b) => a + b, 0) / masterySessions.length,
    finalAccuracy: accuracy[config.sessions - 1] / n,
    finalProbeAccuracy: probeAccuracy[config.sessions - 1] / n,
    finalOverall: overall[config.sessions - 1] / n,
    retention: retentionCount === 0 ? null : retentionSum / retentionCount,
    exercises,
  };
}

export function runExperiment(config: SimConfig = DEFAULT_SIM): SimResult[] {
  return (['static', 'adaptive', 'bandit'] as Strategy[]).map((s) => runStrategy(s, config));
}

/** Plain-text report, so the script and the docs can quote the same numbers. */
export function formatReport(results: SimResult[], config: SimConfig = DEFAULT_SIM): string {
  const lines: string[] = [];
  lines.push(
    `Simulated curriculum experiment: ${config.learners} learners x ${config.sessions} sessions, seed ${config.seed}, retention gap ${config.retentionGap} sessions.`,
  );
  lines.push('');
  lines.push('The probe column is the comparison that matters: identical content for every');
  lines.push('arm, learning disabled, so it is not inflated by an arm choosing easy work.');
  lines.push('');
  lines.push('strategy    probe@s1  probe@s6  probe@final  in-train@final  mastery@s  retention');
  for (const r of results) {
    const at = (i: number) =>
      `${r.probeAccuracy[Math.min(i, r.probeAccuracy.length - 1)].toFixed(1)}%`.padStart(8);
    lines.push(
      [
        r.strategy.padEnd(11),
        at(0),
        at(5),
        `${r.finalProbeAccuracy.toFixed(1)}%`.padStart(11),
        `${r.finalAccuracy.toFixed(1)}%`.padStart(15),
        (r.masterySession === null ? 'never' : r.masterySession.toFixed(1)).padStart(10),
        (r.retention === null ? 'n/a' : `${r.retention.toFixed(1)}%`).padStart(10),
      ].join(' '),
    );
  }
  lines.push('');
  const ranked = [...results].sort((a, b) => b.finalProbeAccuracy - a.finalProbeAccuracy);
  lines.push(
    `Highest held-out accuracy: ${ranked[0].strategy} at ${ranked[0].finalProbeAccuracy.toFixed(1)} percent, ` +
      `${(ranked[0].finalProbeAccuracy - ranked[ranked.length - 1].finalProbeAccuracy).toFixed(1)} points ahead of ${ranked[ranked.length - 1].strategy}.`,
  );
  lines.push('');
  lines.push('This measures a model, not people. It answers "is the adaptive logic doing');
  lines.push('anything at all", not "does it help humans". Real learners still need a trial.');
  return lines.join('\n');
}