/**
 * Agent orchestration, working.
 *
 * Three stages run over one shared learner state, using exactly the primitives the
 * app uses (coach, schedule, timing):
 *
 *   Performance Analyzer  deterministic  -> diagnosis: weak movements + timing
 *   Practice Planner      deterministic  -> an ordered plan, each step with a reason
 *   AI Teacher            rules or model -> one coaching message, the only LLM step
 *
 * The output below is the orchestration actually doing its job, not just timing:
 * it prints the analyzer's findings, the planner's plan, and the teacher's final
 * message. With --network and a key, the teacher step is phrased by a real model
 * and is handed the analyzer and planner output as its context, so the model is
 * wording an already-made decision rather than making one.
 *
 *   npm run agents-compare              teacher answered from rules, no network
 *   npm run agents-compare -- --network teacher answered by the model, if a key is set
 *
 * A compact comparison of the three shapes follows, so the architecture question is
 * still answered with numbers, not opinion.
 */

const path = require('path');

const OUT = path.join(__dirname, '..', '.selftest', 'lib');
const coach = require(path.join(OUT, 'coach.js'));
const schedule = require(path.join(OUT, 'schedule.js'));
const timing = require(path.join(OUT, 'timing.js'));

/**
 * Node does not read .env.local, Next.js does. Load it by hand so `--network`
 * uses the same keys the running app uses, without exporting anything into the
 * shell first. `process.loadEnvFile` is native on Node 20.12+, so this adds no
 * dependency. A missing file is expected and simply skipped.
 */
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(__dirname, '..', file));
    break;
  } catch {
    /* not present, keep looking */
  }
}

const useNetwork = process.argv.includes('--network');
const openaiKey = process.env.OPENAI_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

/** Latency assumed for the model stage when it is not actually called. */
const MODELLED_MS = 900;

/** Monotonic clock, so a shape's cost is measured and not guessed. */
const clock = () => Number(process.hrtime.bigint() / 1000000n);

/* ---------------------------------------------------------------- fixtures */

/** A synthetic attempt with one skipped note, so there are real weaknesses. */
function attemptWith(skipIndex, timingError, lessonId, title, category) {
  const pitches = [60, 62, 64, 65, 67, 64, 62, 60];
  return {
    id: `a-${lessonId}-${skipIndex}`,
    lessonId,
    lessonTitle: title,
    category,
    mode: 'strict',
    at: 1700000000000,
    targetBpm: 80,
    total: pitches.length,
    correct: pitches.length - 1,
    skipped: 1,
    wrongPresses: 0,
    accuracy: 88,
    timing: 40,
    speed: 80,
    overall: 70,
    stars: { accuracy: 4, timing: 1, speed: 3 },
    durationMs: 2000,
    beats: pitches.map(() => 1),
    outcomes: pitches.map((p, i) => ({
      index: i,
      expected: p,
      played: i === skipIndex ? null : p,
      status: i === skipIndex ? 'skipped' : 'correct',
      timingMs: i === skipIndex ? null : timingError,
    })),
  };
}

const ATTEMPTS = [
  attemptWith(5, 124, 'notes-1', 'Three notes', 'notes'),
  attemptWith(3, 118, 'song-1', 'First melody', 'songs'),
  attemptWith(5, 131, 'scale-1', 'C major scale', 'scales'),
];

/** Far enough ahead that the mastered lesson is overdue, so a review is planned. */
const WHEN = Date.now() + 400 * 86400000;

const BEST = {
  'notes-1': {
    lessonId: 'notes-1',
    overall: 92,
    accuracy: 94,
    timing: 88,
    speed: 80,
    stars: { accuracy: 5, timing: 4, speed: 3 },
    attempts: 3,
    at: Date.now() - 400 * 86400000,
  },
};

/** The shared state every shape reads. */
function buildState() {
  const report = coach.analyzeAttempts(ATTEMPTS);
  return {
    attempts: ATTEMPTS,
    report,
    diagnosis: timing.diagnoseTiming(ATTEMPTS[0], { history: ATTEMPTS.slice(1) }),
    weakTransitions: report.weakTransitions.slice(0, 6),
  };
}

/* ------------------------------------------------------------------ stages */

/** Planning, using exactly the primitives the app uses. */
function planItems(state) {
  const items = [];
  const mastered = schedule.buildMastery(BEST, ATTEMPTS, WHEN);
  const due = schedule.dueForReview(mastered);
  const d = state.diagnosis;

  if (d && d.measured >= 2 && d.primary.severity >= 35) {
    items.push({
      kind: 'timing-fix',
      reason: d.primary.title,
      lesson: timing.timingFixLesson(ATTEMPTS[0], d),
    });
  }

  items.push({
    kind: 'targeted-drill',
    reason: state.weakTransitions.length
      ? `Targets ${state.weakTransitions[0].label}`
      : coach.explainReport(state.report),
    lesson: coach.buildDrill(state.report),
  });

  const review = schedule.buildInterleavedReview(due, WHEN);
  if (review) items.push({ kind: 'review', reason: `${due.length} lesson(s) due`, lesson: review });

  const next = schedule.nextLessonToLearn(mastered);
  if (next) items.push({ kind: 'learn', reason: 'Next in the curriculum', lesson: next });

  return items.slice(0, 4);
}

/** Wording, rule based. This is the stage an LLM would replace. */
function rulesMessage(state) {
  const d = state.diagnosis;
  if (d && d.measured >= 2 && d.primary.severity >= 35) {
    return { headline: 'Timing is the blocker', body: `${d.primary.title}. ${d.primary.fix}` };
  }
  if (state.weakTransitions.length > 0) {
    const t = state.weakTransitions[0];
    return {
      headline: 'Target the weak movements',
      body: `${t.label} is your most repeated mistake, ${t.errors} of ${t.occurrences}.`,
    };
  }
  return { headline: 'Solid', body: 'No repeating mistakes recently. Raise the tempo by 8.' };
}

/** Compact plain-language context the teacher step reads (and an LLM can read). */
function buildContext(state, plan) {
  const lines = [];
  const d = state.diagnosis;
  if (d) {
    lines.push(`Timing: ${d.primary.title}. ${d.primary.evidence ?? ''} ${d.primary.cause ?? ''}`.trim());
    if (d.suggestedBpm) lines.push(`Suggested tempo: ${d.suggestedBpm} BPM.`);
  }
  for (const t of state.weakTransitions.slice(0, 3)) {
    lines.push(`Weak movement: ${t.label}, ${t.errors} of ${t.occurrences} attempts.`);
  }
  const n = state.report.weakNotes[0];
  if (n) lines.push(`Weakest note: ${n.label}, ${n.errors} errors in ${n.plays} plays.`);
  lines.push(`Planned order: ${plan.map((i) => i.kind).join(', then ')}.`);
  return lines.join('\n');
}

/**
 * The teacher step is handed the analyzer and planner output, so the model is
 * wording an already-made decision, not deciding anything itself.
 */
function teacherQuestion(state, plan) {
  return [
    'You are the wording step of a three-stage piano coach. The analyzer and the',
    'planner already decided what to practise; you only phrase it for a learner.',
    'Use their findings below. Do not invent different advice.',
    '',
    buildContext(state, plan),
    '',
    'Write one short message (under 120 words, no em dashes): what to practise',
    'first, and why.',
  ].join('\n');
}

/* ------------------------------------------------------------------ report */

/** Wrap a message to a width, so the teacher's words are readable in a terminal. */
function wrap(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (const w of words) {
    const joined = line ? `${line} ${w}` : w;
    if (joined.length > width) {
      if (line) out.push(line);
      line = w;
    } else {
      line = joined;
    }
  }
  if (line) out.push(line);
  return out;
}

/** The orchestration doing its job: the three stages and their actual output. */
function printOrchestration(r) {
  console.log('Agent orchestration, one run over shared learner state.\n');

  console.log('1. Performance Analyzer  (deterministic)');
  if (r.diagnosis) {
    const d = r.diagnosis;
    console.log(`   timing         ${d.primary.title}`);
    if (d.primary.evidence) console.log(`                  ${d.primary.evidence}`);
    if (d.suggestedBpm) console.log(`                  suggested tempo ${d.suggestedBpm} BPM`);
  }
  const top = r.report.weakTransitions[0];
  if (top) console.log(`   weak movement  ${top.label} (${top.errors} of ${top.occurrences} attempts)`);
  const wn = r.report.weakNotes[0];
  if (wn) console.log(`   weakest note   ${wn.label} (${wn.errors} error${wn.errors === 1 ? '' : 's'} in ${wn.plays} plays)`);

  console.log('\n2. Practice Planner  (deterministic)');
  r.plan.forEach((item, i) => {
    console.log(
      `   ${i + 1}. ${item.kind.padEnd(16)} ${String(item.lesson.notes.length).padStart(3)} notes   ${item.reason}`,
    );
  });

  const source = r.message.source || 'rules';
  console.log(`\n3. AI Teacher  (${source})`);
  console.log('   ' + '-'.repeat(72));
  for (const line of wrap(r.message.body, 72)) console.log('   ' + line);
  console.log('   ' + '-'.repeat(72));

  if (r.llm && r.llm.error) {
    console.log(`   (model call failed: ${r.llm.error} - answered from rules instead)`);
  }
}

/** The same three shapes side by side, so the architecture question stays measured. */
function printComparison(results) {
  console.log('\nThree shapes, same primitives, one shared state:');

  const rows = [['shape', 'stages', 'deterministic', 'model', 'words', 'total ms']];
  for (const r of results) {
    rows.push([
      r.shape,
      String(r.trace.length),
      String(r.trace.filter((t) => t.kind === 'deterministic').length),
      r.llm && r.llm.text ? '1' : '0',
      String(r.message.body.split(/\s+/).filter(Boolean).length),
      String(r.totalMs),
    ]);
  }

  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  for (const row of rows) console.log('  ' + row.map((cell, i) => cell.padEnd(widths[i])).join('  '));

  const det = results.map((r) =>
    r.trace.filter((t) => t.kind === 'deterministic').reduce((a, t) => a + t.ms, 0),
  );
  console.log(`\n  deterministic work, per shape: ${det.join(' / ')} ms`);
  console.log('  The model call is the only slow part, the only one needing a key, and the');
  console.log('  only one that can be dropped without losing capability.');

  if (!useNetwork) {
    console.log('  (model column MODELLED at 900 ms - run with --network to measure a real call)');
  } else if (results[2].llm) {
    console.log(`  (teacher step measured: ${results[2].llm.provider}, ${results[2].modelCallMs} ms)`);
  }
}

async function main() {
  const results = [await singleShot(), await pipeline(false), await pipeline(true)];

  // Show the run worth reading: the real model when asked, the deterministic one otherwise.
  printOrchestration(useNetwork ? results[2] : results[1]);
  printComparison(results);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/** Talk to a real model, only when asked and only when a key exists. */
async function callModel(question) {
  if (!useNetwork) return null;
  const system =
    'You are a piano teacher for a learner on a computer keyboard. Under 120 words. No em dashes.';
  const started = clock();

  try {
    if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          max_tokens: 260,
          temperature: 0.4,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: question },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      const text = data.choices && data.choices[0] && data.choices[0].message.content;
      if (!text) throw new Error('OpenAI returned no content');
      return { text: text.trim(), provider: 'openai', ms: clock() - started };
    }

    if (geminiKey) {
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: question }] }],
            generationConfig: { maxOutputTokens: 260, temperature: 0.4 },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = await res.json();
      const cand = data.candidates && data.candidates[0];
      const text =
        cand && cand.content && cand.content.parts
          ? cand.content.parts.map((p) => p.text || '').join('')
          : '';
      if (!text) throw new Error('Gemini returned no content');
      return { text: text.trim(), provider: 'gemini', ms: clock() - started };
    }
  } catch (error) {
    return { text: '', provider: 'failed', ms: clock() - started, error: String(error) };
  }

  return null;
}

/* -------------------------------------------------------------- the shapes */

/**
 * One function does everything. The baseline: fewer moving parts, nothing separated,
 * and nothing you can trace when it is wrong.
 */
async function singleShot() {
  const t0 = clock();
  const fresh = buildState();
  const plan = planItems(fresh);
  const message = rulesMessage(fresh);
  const ms = Math.max(1, clock() - t0);

  return {
    shape: 'single-shot',
    plan,
    message,
    llm: null,
    trace: [{ stage: 'Monolith', kind: 'deterministic', ms, summary: message.headline }],
    modelCallMs: 0,
    totalMs: ms,
  };
}

/** Three named stages, each timed and summarised. `withModel` adds the LLM option. */
async function pipeline(withModel) {
  const t0 = clock();
  const trace = [];
  const fresh = buildState();
  const report = coach.analyzeAttempts(fresh.attempts);
  fresh.report = report;

  let mark = clock();
  trace.push({
    stage: 'Performance Analyzer',
    kind: 'deterministic',
    ms: Math.max(1, clock() - mark),
    summary: report.weakTransitions.length
      ? `Most repeated mistake: ${report.weakTransitions[0].label}`
      : 'No repeated mistakes.',
  });

  mark = clock();
  const plan = planItems(fresh);
  trace.push({
    stage: 'Practice Planner',
    kind: 'deterministic',
    ms: Math.max(1, clock() - mark),
    summary: `Planned ${plan.map((i) => i.kind).join(', then ')}.`,
  });

  mark = clock();
  let message = rulesMessage(fresh);
  message.source = 'rules';
  let llm = null;
  let modelCallMs = 0;

  if (withModel) {
    const result = await callModel(teacherQuestion(fresh, plan));
    if (result && result.text) {
      llm = result;
      modelCallMs = result.ms;
      message = { headline: 'Model wording', body: result.text, source: result.provider };
    } else if (result) {
      llm = result;
      modelCallMs = result.ms;
      message = {
        ...message,
        source: `rules (${result.provider} failed: ${result.error ?? 'unknown'})`,
      };
    } else {
      // No network or no key: stated assumption, not a measurement.
      modelCallMs = MODELLED_MS;
      llm = { provider: 'none (modelled)', ms: MODELLED_MS, text: '' };
      message = { ...message, source: 'rules (no model call)' };
    }
  }

  trace.push({
    stage: 'AI Teacher',
    kind: withModel && llm && llm.text ? 'llm' : 'deterministic',
    ms: Math.max(1, clock() - mark),
    summary: message.headline,
  });

  return {
    shape: withModel ? 'pipeline+llm' : 'pipeline',
    plan,
    message,
    llm,
    trace,
    report: fresh.report,
    diagnosis: fresh.diagnosis,
    modelCallMs,
    totalMs: Math.max(1, clock() - t0),
  };
}
