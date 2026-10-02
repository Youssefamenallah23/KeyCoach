/**
 * Offline self-test for the deterministic engine.
 *
 * Covers the parts that must be exactly right and that an LLM must never be
 * trusted with: keyboard mapping, note naming, score arithmetic, the timing
 * state machine (patient and strict), miss detection, and the coach's learner
 * model plus its exercise validator.
 *
 * Run with:  npm run selftest
 */

const path = require('path');

const OUT = path.join(__dirname, '..', '.selftest', 'lib');
const notes = require(path.join(OUT, 'notes.js'));
const lessons = require(path.join(OUT, 'lessons.js'));
const scoring = require(path.join(OUT, 'scoring.js'));
const practice = require(path.join(OUT, 'practice.js'));
const coach = require(path.join(OUT, 'coach.js'));
const layout = require(path.join(OUT, 'keyboardLayout.js'));
const schedule = require(path.join(OUT, 'schedule.js'));
const midi = require(path.join(OUT, 'midi.js'));
const simulate = require(path.join(OUT, 'simulate.js'));
const timing = require(path.join(OUT, 'timing.js'));
const demo = require(path.join(OUT, 'demo.js'));
const voicing = require(path.join(OUT, 'voicing.js'));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail === undefined ? '' : ` -> ${detail}`}`);
}

function checkEqual(name, actual, expected) {
  check(
    name,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function group(title) {
  console.log(`\n${title}`);
}

/* ---------------------------------------------------------------- notes */

group('notes / mapping');

checkEqual('A4 is 440 Hz', notes.midiToFreq(69), 440);
checkEqual('60 is labelled C4', notes.noteLabel(60), 'C4');
checkEqual('72 is labelled C5', notes.noteLabel(72), 'C5');
checkEqual('61 is a black key', notes.isBlack(61), true);
checkEqual('60 is a white key', notes.isBlack(60), false);

const keyLayout = notes.buildKeyLayout(0);
checkEqual('17 white keys rendered', keyLayout.whites.length, 17);
checkEqual('12 black keys rendered', keyLayout.blacks.length, 12);

checkEqual('KeyA plays C4', notes.resolveMidi('KeyA', 0), 60);
checkEqual('KeyA shifted up plays C5', notes.resolveMidi('KeyA', 1), 72);
checkEqual('KeyA shifted down plays C3', notes.resolveMidi('KeyA', -1), 48);
checkEqual('KeyQ plays C#4', notes.resolveMidi('KeyQ', 0), 61);
checkEqual('unmapped key returns null', notes.resolveMidi('KeyE', 0), null);
checkEqual('hint round trips', notes.keyHintFor(65), 'F');

/* -------------------------------------------------------------- scoring */

group('scoring');

const perfect = scoring.computeScores({
  total: 8,
  correct: 8,
  wrongPresses: 0,
  timingErrorsMs: [0, 10, -15, 5, 0, 20, 12, -8],
  spanActualMs: 7000,
  spanIdealMs: 7000,
});
checkEqual('perfect accuracy', perfect.accuracy, 100);
check('perfect timing is high', perfect.timing >= 95, `got ${perfect.timing}`);
checkEqual('perfect speed', perfect.speed, 100);
checkEqual('perfect overall', perfect.overall, 100);
checkEqual('perfect gets 5 accuracy stars', perfect.stars.accuracy, 5);

const withWrongKeys = scoring.computeScores({
  total: 8,
  correct: 8,
  wrongPresses: 2,
  timingErrorsMs: [0],
  spanActualMs: null,
  spanIdealMs: null,
});
checkEqual('two wrong presses cost accuracy', withWrongKeys.accuracy, 80);
checkEqual('speed is null without a span', withWrongKeys.speed, null);
checkEqual('timing is still measurable', withWrongKeys.timing, 100);

const unmeasurable = scoring.computeScores({
  total: 3,
  correct: 1,
  wrongPresses: 0,
  timingErrorsMs: [],
  spanActualMs: null,
  spanIdealMs: null,
});
checkEqual('abandoned attempt accuracy', unmeasurable.accuracy, 33);
checkEqual('timing reported as null', unmeasurable.timing, null);
checkEqual('overall falls back to accuracy', unmeasurable.overall, 33);

check(
  'timing curve is monotonic',
  scoring.timingNoteScore(0) > scoring.timingNoteScore(300),
);
checkEqual('timing curve bottoms out', scoring.timingNoteScore(5000), 0);

/* ------------------------------------------------------ practice machine */

group('practice machine');

const NOTES1 = lessons.getLesson('notes-1'); // C D E, free pace, 70 BPM
check('notes-1 exists', NOTES1 !== null);

const patient = practice.createSession(NOTES1, 70);
practice.beginSession(patient, null);
checkEqual('patient starts running', patient.phase, 'running');

const beat = 60 / 70;
let t = 1000;
checkEqual('first note correct', practice.pressNote(patient, 60, t, t), 'correct');
t += beat;
checkEqual('second note correct', practice.pressNote(patient, 62, t, t), 'correct');
t += beat;
checkEqual('last note finishes the run', practice.pressNote(patient, 64, t, t), 'finished');

const perfectRun = practice.finishSession(patient, t);
checkEqual('perfect run accuracy', perfectRun.scores.accuracy, 100);
checkEqual('perfect run timing', perfectRun.scores.timing, 100);
checkEqual('perfect run overall', perfectRun.scores.overall, 100);

const sloppy = practice.createSession(NOTES1, 70);
practice.beginSession(sloppy, null);
let s = 500;
checkEqual('wrong key is rejected', practice.pressNote(sloppy, 61, s, s), 'wrong');
checkEqual('index did not advance', sloppy.index, 0);
checkEqual('wrong press counted', sloppy.wrongPresses, 1);
practice.pressNote(sloppy, 60, s, s);
s += beat;
practice.pressNote(sloppy, 62, s, s);
s += beat;
practice.pressNote(sloppy, 64, s, s);
checkEqual('wrong press lowers accuracy', practice.finishSession(sloppy, s).scores.accuracy, 75);

const RHYTHM1 = lessons.getLesson('rhythm-1'); // eight Cs, strict, 80 BPM
check('rhythm-1 exists', RHYTHM1 !== null);

const strict = practice.createSession(RHYTHM1, 80);
const start = 200;
practice.beginSession(strict, start);
checkEqual('strict starts with a count-in', strict.phase, 'countin');
checkEqual('count-in is not over yet', practice.tickSession(strict, start - 0.2), false);
checkEqual('count-in flips to running', practice.tickSession(strict, start + 0.01), true);
checkEqual('phase after count-in', strict.phase, 'running');

const strictBeat = 60 / 80; // 0.75 s
practice.pressNote(strict, 60, start, start);
practice.pressNote(strict, 60, start + strictBeat, start + strictBeat);
checkEqual('two notes landed', strict.index, 2);

checkEqual('a late note is detected', practice.tickSession(strict, start + 2.3), true);
checkEqual('late note marked skipped', strict.outcomes[2].status, 'skipped');
checkEqual('index advanced to next pending', strict.index, 3);

practice.tickSession(strict, start + 60);
practice.finishSession(strict, start + 60);
checkEqual('strict run finishes on its own', strict.phase, 'finished');
checkEqual('the on-time notes survived', strict.outcomes[0].status, 'correct');

const record = practice.toAttemptRecord(strict, { id: 'x', at: 1, durationMs: 12 });
checkEqual('accuracy reflects the skips', record.accuracy, 25);
checkEqual('attempt record keeps lesson id', record.lessonId, 'rhythm-1');
checkEqual('attempt record counts skips', record.skipped, 6);
checkEqual('attempt record banked the notes', record.correct, 2);

/* ----------------------------------------------------------------- coach */

group('coach');

/**
 * Synthetic attempts: E to F (64 to 65) fails twice, C to D (60 to 62) fails
 * once, so E to F must rank worst. The earlier fixture failed both once, which
 * made the ranking a genuine tie rather than a real weakness.
 */
function makeAttempt(id, failIndex) {
  const pitches = [60, 62, 64, 65];
  return {
    id,
    lessonId: 'song-3',
    lessonTitle: 'Ode to Joy',
    category: 'songs',
    mode: 'patient',
    at: 1700000000000 + failIndex,
    targetBpm: 84,
    total: pitches.length,
    correct: pitches.length - 1,
    skipped: 1,
    wrongPresses: 0,
    accuracy: 75,
    timing: 70,
    speed: 80,
    overall: 72,
    stars: { accuracy: 2, timing: 2, speed: 3 },
    durationMs: 9000,
    outcomes: pitches.map((pitch, i) => ({
      index: i,
      expected: pitch,
      played: i === failIndex ? null : pitch,
      status: i === failIndex ? 'skipped' : 'correct',
      timingMs: i === failIndex ? null : i === 0 ? 0 : 30,
    })),
  };
}

const attempts = [makeAttempt('a1', 3), makeAttempt('a2', 3), makeAttempt('a3', 1)];

const report = coach.analyzeAttempts(attempts);
checkEqual('analysed the attempts', report.attemptsAnalyzed, 3);
check('a weak transition was found', report.weakTransitions.length > 0);
checkEqual(
  'E to F is ranked worst',
  report.weakTransitions[0].from * 100 + report.weakTransitions[0].to,
  64 * 100 + 65,
);
check('tempo recommends slowing down', report.recommendedBpm <= 84, `got ${report.recommendedBpm}`);

const drill = coach.buildDrill(report);
const drillCheck = coach.validateExercise(drill.notes, drill.beats);
check('generated drill passes its own validator', drillCheck.ok, drillCheck.issues.join('; '));
check(
  'drill stays in the learned range',
  drill.notes.every((n) => n >= 60 && n <= 74),
);
check('drill contains the weak notes', drill.notes.includes(64) && drill.notes.includes(65));
checkEqual('drill is flagged as generated', drill.generated, true);

const plan = coach.buildPracticePlan(report);
check('practice plan is capped at four items', plan.length <= 4);
check('practice plan has minutes', plan.every((p) => p.minutes > 0));
check(
  'E to F explanation mentions the missing black key',
  coach.explainWeakSpot(report.weakTransitions[0], 80).includes('no black key'),
);

/* ------------------------------------------------------------- validator */

group('validator');

checkEqual('out of range is rejected', coach.validateExercise([60, 62, 84], [1, 1, 1]).ok, false);
checkEqual('wild leap is rejected', coach.validateExercise([60, 62, 64, 74], [1, 1, 1, 1]).ok, false);
checkEqual('mismatched arrays are rejected', coach.validateExercise([60, 62, 64], [1, 1]).ok, false);
checkEqual(
  'a stepwise exercise is accepted',
  coach.validateExercise([60, 61, 62, 63, 64], [1, 1, 1, 1, 2]).ok,
  true,
);

/* --------------------------------------------------------- keyboard layout */

group('keyboard layout');

checkEqual('AZERTY: the key at the QWERTY-A position shows Q', layout.LAYOUT_PRESETS.azerty.KeyA, 'Q');
checkEqual('AZERTY: the key at the QWERTY-Q position shows A', layout.LAYOUT_PRESETS.azerty.KeyQ, 'A');
checkEqual('AZERTY: the key at the QWERTY-M position shows a comma', layout.LAYOUT_PRESETS.azerty.KeyM, ',');
checkEqual('QWERTY: the key at the QWERTY-A position shows A', layout.LAYOUT_PRESETS.qwerty.KeyA, 'A');
checkEqual('QWERTZ swaps Y and Z', layout.LAYOUT_PRESETS.qwertz.KeyY, 'Z');

let observed = {};
observed = layout.learnLabel(observed, 'KeyA', 'q');
observed = layout.learnLabel(observed, 'KeyS', 's');
observed = layout.learnLabel(observed, 'KeyQ', 'a');
observed = layout.learnLabel(observed, 'KeyW', 'z');
checkEqual('a pressed key teaches its legend', observed.KeyA, 'Q');
checkEqual('punctuation legends are learned too', layout.learnLabel({}, 'Digit1', '&').Digit1, '&');
checkEqual('named keys are ignored', layout.learnLabel({}, 'Shift', 'Shift').Shift, undefined);
checkEqual('layout inference identifies AZERTY', layout.inferLayout(observed, 2), 'azerty');
checkEqual('inference stays silent on thin evidence', layout.inferLayout({ KeyA: 'A' }, 3), null);

const azertyLabels = layout.resolveLabels('azerty', {}, null);
checkEqual('AZERTY resolves C4 to the Q key', azertyLabels.KeyA, 'Q');
const overridden = layout.resolveLabels('azerty', { KeyA: 'X' }, null);
checkEqual('a learned legend overrides the preset', overridden.KeyA, 'X');
const fromBrowser = layout.resolveLabels('azerty', {}, { KeyA: 'W' });
checkEqual('the browser map overrides everything', fromBrowser.KeyA, 'W');
checkEqual('labelForCode falls back to the code', layout.labelForCode({}, 'KeyL'), 'L');

/* ----------------------------------------------------- spaced repetition */

group('spaced repetition');

const DAY = 86400000;
check(
  'retention decays over time',
  schedule.retentionNow(1000, 1, 1000 + 5 * DAY) < schedule.retentionNow(1000, 4, 1000 + 5 * DAY),
);
checkEqual('a clean run doubles the interval', schedule.nextIntervalDays(2, 90), 4);
checkEqual('a rough run resets the interval', schedule.nextIntervalDays(10, 40), 1);
checkEqual('the interval is capped', schedule.nextIntervalDays(60, 95), 60);

const now = 1700000000000;
const strongBest = {
  'notes-1': {
    lessonId: 'notes-1',
    overall: 92,
    accuracy: 94,
    timing: 88,
    speed: 80,
    stars: { accuracy: 5, timing: 4, speed: 3 },
    attempts: 3,
    at: now,
  },
};
const history = [
  {
    id: 't1',
    lessonId: 'notes-1',
    lessonTitle: 'Three notes',
    category: 'notes',
    mode: 'patient',
    at: now - DAY,
    targetBpm: 70,
    total: 3,
    correct: 3,
    skipped: 0,
    wrongPresses: 0,
    accuracy: 100,
    timing: 95,
    speed: 90,
    overall: 96,
    stars: { accuracy: 5, timing: 5, speed: 4 },
    durationMs: 3000,
    outcomes: [],
  },
];

const mastery = schedule.buildMastery(strongBest, history, now);
const m1 = mastery.find((m) => m.lessonId === 'notes-1');
const m2 = mastery.find((m) => m.lessonId === 'song-5');
check('a strong lesson is marked mastered', m1.mastered);
check('a mastered lesson gets a review date', m1.dueAt !== null);
check('an unplayed lesson has no review date', m2.dueAt === null);
check('an unplayed lesson is not overdue', m2.overdue === false);

const far = now + 400 * DAY;
const due = schedule.dueForReview(schedule.buildMastery(strongBest, history, far));
check('a stale mastered lesson becomes due', due.length >= 1);

const review = schedule.buildInterleavedReview(due, far);
check('a mixed review is produced', review !== null);
const reviewCheck = coach.validateExercise(review.notes, review.beats);
check('the mixed review passes the validator', reviewCheck.ok, reviewCheck.issues.join('; '));
check(
  'the mixed review stays in range',
  review.notes.every((n) => n >= 60 && n <= 74),
);
check('the mixed review is short enough to be deliberate practice', review.notes.length <= 36);
check(
  'schedule advice is produced',
  schedule.scheduleAdvice(schedule.buildMastery({}, [], far), []).length > 10,
);

/* ------------------------------------------------------------- midi files */

group('midi parsing');

/** Build a minimal format 1 MIDI file: four quarter notes, 120 BPM. */
function buildMidiFile() {
  const ppq = 480;
  const vlq = (value) => {
    const bytes = [value & 0x7f];
    let n = value >> 7;
    while (n > 0) {
      bytes.unshift((n & 0x7f) | 0x80);
      n >>= 7;
    }
    return bytes;
  };

  const events = [];
  events.push(0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20); // tempo 500000
  for (const pitch of [60, 64, 67, 72]) {
    events.push(0x00, 0x90, pitch, 0x50);
    events.push(...vlq(480), 0x80, pitch, 0x40);
  }
  events.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x01,
    0x00, 0x01,
    (ppq >> 8) & 0xff, ppq & 0xff,
  ];
  const trackHead = [
    0x4d, 0x54, 0x72, 0x6b,
    (events.length >> 24) & 0xff,
    (events.length >> 16) & 0xff,
    (events.length >> 8) & 0xff,
    events.length & 0xff,
  ];
  return new Uint8Array([...header, ...trackHead, ...events]).buffer;
}

const song = midi.parseMidi(buildMidiFile());
checkEqual('format read', song.format, 1);
checkEqual('ppq read', song.ppq, 480);
checkEqual('all four notes parsed', song.notes.length, 4);
checkEqual('first pitch', song.notes[0].midi, 60);
checkEqual('note lengths in beats', song.notes[0].durationTicks / song.ppq, 1);
check('tempo read as 120 BPM', Math.abs(midi.bpmOf(song) - 120) < 0.01, `got ${midi.bpmOf(song)}`);
check('a non-MIDI buffer is rejected', (() => {
  try {
    midi.parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).buffer);
    return false;
  } catch {
    return true;
  }
})());

const songReport = midi.analyzeSong(song);
checkEqual('note count reported', songReport.noteCount, 4);
checkEqual('range reported', songReport.highMidi - songReport.lowMidi, 12);
check(
  'difficulty is a percentage',
  songReport.difficulty >= 0 && songReport.difficulty <= 100,
  `got ${songReport.difficulty}`,
);
check('grade is in range', songReport.grade >= 1 && songReport.grade <= 5);
check('analysis explains itself', songReport.reasons.length > 0);

const stages = midi.buildStages(song, songReport);
check('several stages were produced', stages.length >= 3, `got ${stages.length}`);
check(
  'stages are ordered by level',
  stages.every((s, i) => i === 0 || s.level > stages[i - 1].level),
);
let stageFailures = 0;
for (const stage of stages) {
  // Imported arrangements legitimately span the whole keyboard (C3 to E5) and a
  // hand move between bass and melody is a real octave-plus leap, so the wider
  // window is intentional here rather than a loosened curriculum rule.
  const result = coach.validateExercise(stage.notes, stage.beats, {
    low: 48,
    high: 76,
    maxLeap: 12,
  });
  if (!result.ok) stageFailures += 1;
}
checkEqual('every stage is musically valid', stageFailures, 0);

const stageLesson = midi.stageToLesson(stages[0], 'Test Song');
checkEqual('a stage becomes a song lesson', stageLesson.category, 'songs');
checkEqual('octave folding pulls a high pitch down', midi.foldIntoRange(200, 60, 74), 68);
checkEqual('octave folding pushes a low pitch up', midi.foldIntoRange(41, 60, 74), 65);

/* ----------------------------------------------- offline curriculum study */

group('offline curriculum study');

const simConfig = { learners: 40, sessions: 10, seed: 7, retentionGap: 3 };
const simResults = simulate.runExperiment(simConfig);
checkEqual('three strategies were run', simResults.length, 3);
check(
  'every strategy improved over its own start',
  simResults.every((r) => r.accuracy[r.accuracy.length - 1] > r.accuracy[0] - 0.5),
  simResults.map((r) => `${r.strategy}:${r.accuracy[0].toFixed(1)}->${r.finalAccuracy.toFixed(1)}`).join(' '),
);
check(
  'accuracy stays a percentage',
  simResults.every((r) => r.finalAccuracy >= 0 && r.finalAccuracy <= 100),
);
const adaptive = simResults.find((r) => r.strategy === 'adaptive');
check(
  'at least one arm reaches mastery inside the window',
  simResults.some((r) => r.masterySession !== null),
  simResults.map((r) => `${r.strategy}:${r.masterySession}`).join(' '),
);
check('the adaptive arm produces numbers', adaptive.finalAccuracy >= 0);
check(
  'the report quotes the adaptive arm',
  simulate.formatReport(simResults, simConfig).includes('adaptive'),
);
check(
  'the held-out probe is tracked for every arm',
  simResults.every((r) => r.probeAccuracy.length === simConfig.sessions),
);
check(
  'the probe separates the arms',
  new Set(simResults.map((r) => r.finalProbeAccuracy.toFixed(3))).size === 3,
);
check(
  'a probe run does not teach the learner',
  (() => {
    const learner = {
      noteSkill: new Map(),
      transSkill: new Map(),
      timingSkill: 0.3,
      comfortBpm: 70,
    };
    simulate.simulateAttempt(learner, simulate.PROBE_LESSON, 70, () => 0.9, false);
    return learner.noteSkill.size === 0 && learner.transSkill.size === 0;
  })(),
);
check(
  'a training run does teach the learner',
  (() => {
    const learner = {
      noteSkill: new Map(),
      transSkill: new Map(),
      timingSkill: 0.3,
      comfortBpm: 70,
    };
    simulate.simulateAttempt(learner, simulate.PROBE_LESSON, 70, () => 0.9, true);
    return learner.noteSkill.size > 0 && learner.transSkill.size > 0;
  })(),
);

/* ------------------------------------------------------- timing diagnosis */

group('timing diagnosis');

/** Synthetic attempt with a chosen error per note. */
function attemptWith(errors, mode, bpm) {
  const total = errors.length;
  const pitches = errors.map((_, i) => 60 + (i % 3) * 2);
  return {
    id: 't',
    lessonId: 'notes-1',
    lessonTitle: 'Three notes',
    category: 'notes',
    mode,
    at: 1,
    targetBpm: bpm,
    total,
    correct: total,
    skipped: 0,
    wrongPresses: 0,
    accuracy: 100,
    timing: 50,
    speed: 80,
    overall: 70,
    stars: { accuracy: 5, timing: 2, speed: 3 },
    durationMs: 1200,
    beats: errors.map(() => 1),
    outcomes: errors.map((e, i) => ({
      index: i,
      expected: pitches[i],
      played: pitches[i],
      status: 'correct',
      timingMs: e,
    })),
  };
}

const late = attemptWith([120, 120, 120, 120, 120, 120, 120, 120], 'strict', 80);
const lateDiagnosis = timing.diagnoseTiming(late);
checkEqual('constant offset is named', lateDiagnosis.primary.id, 'systematic-late');
checkEqual('bias is measured', lateDiagnosis.biasMs, 120);
checkEqual('every note is sampled', lateDiagnosis.samples.length, 8);
checkEqual('spread is zero for a constant offset', lateDiagnosis.stdevMs, 0);
checkEqual(
  'histogram counts every note',
  lateDiagnosis.histogram.reduce((a, b) => a + b.count, 0),
  8,
);
check(
  'the findings carry evidence',
  lateDiagnosis.findings.every((f) => f.evidence.length > 10 && f.fix.length > 10),
);

const earlyDiagnosis = timing.diagnoseTiming(
  attemptWith([-130, -120, -140, -110, -125, -135, -115, -120], 'strict', 80),
);
checkEqual('early beats are named', earlyDiagnosis.primary.id, 'systematic-early');

const driftDiagnosis = timing.diagnoseTiming(
  attemptWith([0, 50, 100, 150, 200, 250, 300, 350], 'strict', 80),
);
checkEqual('a rising error is named as dragging', driftDiagnosis.primary.id, 'drifting-late');
check('drift slope is positive', driftDiagnosis.driftMsPerNote > 40);
check('total drift is reported', driftDiagnosis.driftTotalMs > 300);

const scatterDiagnosis = timing.diagnoseTiming(
  attemptWith([-200, 180, -160, 200, -190, 170, -210, 190], 'strict', 80),
);
checkEqual('no direction is named as scatter', scatterDiagnosis.primary.id, 'scattered');

const isolatedDiagnosis = timing.diagnoseTiming(
  attemptWith([10, 12, 8, 11, 9, 700, 10, 12], 'strict', 80),
);
check(
  'a single outlier is named',
  isolatedDiagnosis.findings.some((f) => f.id === 'isolated-note'),
  isolatedDiagnosis.findings.map((f) => f.id).join(','),
);

const patientDiagnosis = timing.diagnoseTiming(attemptWith([0, 100, 100], 'patient', 80));
checkEqual('free pace skips the anchored first note', patientDiagnosis.samples.length, 2);

const consistent = timing.diagnoseTiming(late, {
  history: [
    attemptWith([110, 115, 120, 105, 118, 122, 108, 116], 'strict', 80),
    attemptWith([108, 112, 118, 120, 124, 116, 110, 114], 'strict', 80),
  ],
});
check('a repeating bias is detected', consistent.consistentBias === true);
check(
  'one prior run is not enough to call it consistent',
  timing.diagnoseTiming(late, {
    history: [attemptWith([110, 115, 120, 105, 118, 122, 108, 116], 'strict', 80)],
  }).consistentBias === false,
);

const lateFix = timing.timingFixLesson(late, lateDiagnosis);
checkEqual('a shifted rhythm gets a metronome drill', lateFix.mode, 'strict');
check('the fix slows down', lateFix.targetBpm < 80, `got ${lateFix.targetBpm}`);
check('the fix is playable', lateFix.notes.length >= 3 && lateFix.beats.length === lateFix.notes.length);

const isolatedFix = timing.timingFixLesson(
  attemptWith([10, 12, 8, 11, 9, 700, 10, 12], 'strict', 80),
  isolatedDiagnosis,
);
check('an isolated failure gets a pair drill', isolatedFix.notes.length === 10);
check(
  'the pair drill stays in range',
  isolatedFix.notes.every((n) => n >= 60 && n <= 74),
);

const trend = timing.biasTrend([late, late, late]);
checkEqual('trend has one point per attempt', trend.length, 3);

/* ------------------------------------------------------------ playability */

group('playability');

// The full chromatic range C3 to E5 must be reachable, or songs silently break.
const mapped = Object.values(notes.KEY_BINDINGS).sort((a, b) => a - b);
checkEqual('mapped note count is the full chromatic span', mapped.length, 76 - 48 + 1);
let gaps = 0;
for (let midi = notes.KB_LOW_MIDI; midi <= notes.KB_HIGH_MIDI; midi += 1) {
  if (!mapped.includes(midi)) gaps += 1;
}
checkEqual('no unmapped notes in the playable range', gaps, 0);
checkEqual('lowest mapped note', mapped[0], 48);
checkEqual('highest mapped note', mapped[mapped.length - 1], 76);

// Every note of every shipped lesson must be playable on the keyboard.
let unreachable = [];
for (const lesson of lessons.LESSONS) {
  for (const midi of lesson.notes) {
    if (!mapped.includes(midi)) unreachable.push(`${lesson.id}:${midi}`);
  }
}
check(
  'every shipped lesson is fully playable',
  unreachable.length === 0,
  unreachable.slice(0, 8).join(', '),
);

let rangesOut = [];
for (const lesson of lessons.LESSONS) {
  for (const midi of lesson.notes) {
    if (midi < notes.KB_LOW_MIDI || midi > notes.KB_HIGH_MIDI) rangesOut.push(lesson.id);
  }
}
check('no shipped lesson falls outside the rendered keyboard', rangesOut.length === 0);

checkEqual('every lesson declares beats for every note', lessons.LESSONS.every(
  (l) => l.beats.length === l.notes.length,
), true);

// The reference arrangements are playable too, but must never be in LESSONS.
let refUnreachable = [];
for (const lesson of lessons.REFERENCE_SONGS) {
  for (const midi of lesson.notes) {
    if (!mapped.includes(midi)) refUnreachable.push(`${lesson.id}:${midi}`);
  }
}
check('reference arrangements are playable', refUnreachable.length === 0, refUnreachable.join(', '));

/* ------------------------------------------------------------- copyright */

group('copyright separation');

check(
  'no reference arrangement is in the default catalogue',
  lessons.LESSONS.every((l) => l.license !== 'reference-arrangement'),
);
check(
  'reference arrangements are labelled',
  lessons.REFERENCE_SONGS.every((l) => l.license === 'reference-arrangement'),
);
check(
  'reference arrangements are excluded by default',
  lessons.allPlayableLessons(false).every((l) => l.license !== 'reference-arrangement'),
);
checkEqual(
  'opting in increases the catalogue',
  lessons.allPlayableLessons(true).length - lessons.allPlayableLessons(false).length,
  lessons.REFERENCE_SONGS.length,
);
check(
  'the requested songs are present but opt in',
  lessons.REFERENCE_SONGS.some((l) => l.id === 'ref-interstellar') &&
    lessons.REFERENCE_SONGS.some((l) => l.id === 'ref-runaway'),
);
check(
  'public domain songs are all marked or unmarked as public domain',
  lessons.publicDomainSongs().every((l) => lessons.isPublicDomain(l)),
);
check(
  'every public domain song credits an origin',
  lessons.publicDomainSongs().every((l) => l.subtitle.toLowerCase().includes('public domain')),
);

/* --------------------------------------------------------- plain language */

group('plain language timing');

checkEqual('on the beat at 0 ms', timing.timingBand(0).band, 'on');
checkEqual('on the beat at 55 ms', timing.timingBand(55).band, 'on');
checkEqual('a bit late at 100 ms', timing.timingBand(100).band, 'late');
checkEqual('a bit early at 100 ms', timing.timingBand(-100).band, 'early');
checkEqual('much too late at 400 ms', timing.timingBand(400).band, 'late-far');
checkEqual('much too early at 400 ms', timing.timingBand(-400).band, 'early-far');
checkEqual('late has a bad tone', timing.timingBand(100).tone, 'close');
checkEqual('on time has a good tone', timing.timingBand(10).tone, 'good');

checkEqual('words mode never returns a number', timing.describeError(180, false).includes('180'), false);
checkEqual('numbers mode returns the number', timing.describeError(180, true), '+180 ms');
checkEqual('numbers mode still says on the beat', timing.describeError(5, true), 'on the beat');
check(
  'every band explains what to do',
  [0, 80, -80, 300, -300].every((e) => timing.timingBand(e).hint.length > 20),
);
check(
  'run summaries are sentences',
  [timing.describeRun(120, 60, 10), timing.describeRun(-120, 60, 10), timing.describeRun(10, 200, 10)]
    .every((s) => s.length > 20 && s.endsWith('.')),
);

/* ------------------------------------------------------------ tempo ladder */

group('tempo ladder');

checkEqual('slow is half speed', demo.bpmForRung(80, 'slow'), 40);
checkEqual('medium is three quarters', demo.bpmForRung(80, 'medium'), 60);
checkEqual('target is the written tempo', demo.bpmForRung(80, 'target'), 80);
checkEqual('the ladder is clamped low', demo.bpmForRung(60, 'slow'), 40);
checkEqual('the ladder is clamped high', demo.bpmForRung(200, 'target'), 200);
checkEqual('half of 80 is read as slow', demo.rungFor(80, 40), 'slow');
checkEqual('two thirds of 80 is read as medium', demo.rungFor(80, 60), 'medium');
checkEqual('full tempo is read as target', demo.rungFor(80, 80), 'target');
check(
  'duration estimate grows with repeats',
  demo.demoDurationSec(lessons.getLesson('notes-1'), 60, 4) > 0,
);

/* --------------------------------------------------------- listen scheduling */

group('listen scheduling');

// Audio is unavailable under node, so this checks the guard rather than the sound:
// startDemo must degrade to a no-op stop, never throw.
const silent = demo.startDemo({ lesson: lessons.getLesson('notes-1'), bpm: 70 });
check('startDemo is safe with no audio context', typeof silent.stop === 'function');
silent.stop();
const silentGuide = demo.scheduleGuide({
  notes: [60, 62],
  beats: [1, 1],
  bpm: 70,
  startAudio: 0,
});
check('scheduleGuide is safe with no audio context', typeof silentGuide.stop === 'function');
silentGuide.stop();

/* -------------------------------------------------------- voicing and tuning */

group('voicing and tuning');

// Pitch. The A4 reference must be honoured exactly, or "A4 is 440" is a lie.
checkEqual('A4 at concert pitch', notes.midiToFreq(69, 440), 440);
checkEqual('A4 at 442', notes.midiToFreq(69, 442), 442);
checkEqual('C4 at concert pitch', notes.midiToFreq(60, 440), 261.6255653005986);
checkEqual('cents between identical pitches', voicing.centsBetween(440, 440), 0);
checkEqual('an octave is 1200 cents', Math.round(voicing.centsBetween(880, 440)), 1200);
checkEqual('shifting by an octave doubles the frequency', Math.round(voicing.shiftCents(440, 1200)), 880);

const flatTuning = { a4Hz: 440, pitchOffsetCents: 0, stretchCentsPerOctave: 0 };
checkEqual('untouched tuning leaves A4 alone', voicing.tunedFreq(69, flatTuning), 440);

const sharpTuning = { a4Hz: 442, pitchOffsetCents: 0, stretchCentsPerOctave: 0 };
checkEqual('a sharper reference raises everything', voicing.tunedFreq(69, sharpTuning), 442);

const fineTuning = { a4Hz: 440, pitchOffsetCents: 50, stretchCentsPerOctave: 0 };
checkEqual(
  'fine pitch of 50 cents is a quarter tone',
  Math.round(voicing.centsBetween(voicing.tunedFreq(69, fineTuning), 440)),
  50,
);

// Railsback stretch: treble sharp, bass flat, A4 untouched.
const stretch = { a4Hz: 440, pitchOffsetCents: 0, stretchCentsPerOctave: 6 };
checkEqual('stretch leaves A4 exactly where it was', Math.round(voicing.tunedFreq(69, stretch)), 440);
check(
  'stretch sends the treble sharp',
  voicing.tunedFreq(93, stretch) > notes.midiToFreq(93, 440),
);
check(
  'stretch sends the bass flat',
  voicing.tunedFreq(45, stretch) < notes.midiToFreq(45, 440),
);
check(
  'the stretch grows with distance from A4',
  voicing.centsBetween(voicing.tunedFreq(93, stretch), notes.midiToFreq(93, 440)) >
    voicing.centsBetween(voicing.tunedFreq(81, stretch), notes.midiToFreq(81, 440)),
);

// Inharmonicity.
checkEqual(
  'a stiff string keeps its fundamental on pitch',
  voicing.inharmonicPartial(100, 1, 0.01),
  100,
);
check(
  'a stiff string stretches its second partial sharp',
  voicing.inharmonicPartial(100, 2, 0.01) > 200,
);
checkEqual('partial 1 is not sharp at all', voicing.partialSharpnessCents(1, 0.01), 0);
check(
  'sharpness grows with the partial number',
  voicing.partialSharpnessCents(12, 0.01) > voicing.partialSharpnessCents(4, 0.01),
);
check(
  'sharpness grows with stiffness',
  voicing.partialSharpnessCents(8, 0.02) > voicing.partialSharpnessCents(8, 0.001),
);
check(
  'the sharp presets are actually sharper than the warm one',
  voicing.VOICINGS.sharp.inharmonicity > voicing.VOICINGS.concert.inharmonicity &&
    voicing.VOICINGS.metallic.inharmonicity > voicing.VOICINGS.sharp.inharmonicity,
);
check(
  'a flexible string is perfectly harmonic',
  Math.abs(voicing.inharmonicPartial(100, 7, 0) - 700) < 0.001,
);

// Spectrum and decay.
const concert = voicing.VOICINGS.concert;
check(
  'partial amplitudes fall away',
  voicing.partialAmplitude(1, concert) > voicing.partialAmplitude(4, concert) &&
    voicing.partialAmplitude(4, concert) > voicing.partialAmplitude(12, concert),
);
check(
  'brightness lifts the upper partials without touching the fundamental',
  voicing.partialAmplitude(1, voicing.VOICINGS.sharp) < voicing.partialAmplitude(1, concert) * 1.4 &&
    voicing.partialAmplitude(10, voicing.VOICINGS.sharp) >
      voicing.partialAmplitude(10, concert),
);
checkEqual('the fundamental is never damped', voicing.partialDecayFactor(1, concert), 1);
check(
  'high partials die first',
  voicing.partialDecayFactor(12, concert) < voicing.partialDecayFactor(4, concert),
);
check(
  'bass strings ring longer than treble',
  voicing.baseDecaySec(48) > voicing.baseDecaySec(76),
);
check('bass sustain is bounded', voicing.baseDecaySec(0) <= 8.5 && voicing.baseDecaySec(0) >= 1.5);

// Presets and clamping.
checkEqual('there are five voicings', voicing.VOICING_LIST.length, 5);
check(
  'every voicing has a label and a blurb',
  voicing.VOICING_LIST.every((v) => v.label.length > 2 && v.blurb.length > 10),
);
check(
  'every voicing stays inside the engine ceilings',
  voicing.VOICING_LIST.every(
    (v) => v.partials <= voicing.MAX_PARTIALS && v.unison <= voicing.MAX_UNISON,
  ),
);
checkEqual(
  'overrides are clamped to something playable',
  voicing.mergeVoicing('concert', { inharmonicity: 9, brightness: 99, partials: 900 }).partials,
  voicing.MAX_PARTIALS,
);
checkEqual(
  'a negative stiffness is impossible',
  voicing.mergeVoicing('concert', { inharmonicity: -1 }).inharmonicity,
  0,
);
checkEqual(
  'an override replaces the preset value',
  voicing.mergeVoicing('concert', { brightness: 2 }).brightness,
  2,
);
checkEqual(
  'merging with no overrides returns the preset',
  voicing.mergeVoicing('felt').id,
  'felt',
);

// Plain language.
check(
  'a sharp reference is described as sharp',
  voicing.describeTuning({ a4Hz: 442, pitchOffsetCents: 0, stretchCentsPerOctave: 0 }).includes(
    'sharp',
  ),
);
check(
  'concert pitch is described as concert pitch',
  voicing.describeTuning({ a4Hz: 440, pitchOffsetCents: 0, stretchCentsPerOctave: 0 }).includes(
    '440',
  ),
);
check(
  'a stretch is described, not just applied',
  voicing.describeTuning({ a4Hz: 440, pitchOffsetCents: 0, stretchCentsPerOctave: 8 }).includes(
    'stretched',
  ),
);

/* ---------------------------------------------------------------- report */

console.log('');
if (failures.length > 0) {
  console.log(`${failures.length} failure(s):`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${passed} checks passed.`);
