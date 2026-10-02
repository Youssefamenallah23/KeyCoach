/**
 * Offline curriculum experiment.
 *
 * Answers the brief's "suggest an offline evaluation I can run with simulated
 * learners before real users exist" with an actual run: the same exercise engine
 * and the same scoring code the app uses, driven by simulated learners across
 * three curriculum strategies.
 *
 * Usage:
 *   npm run simulate
 *   node scripts/simulate.cjs 400 24
 *   node scripts/simulate.cjs 400 24 7
 */

const path = require('path');

const OUT = path.join(__dirname, '..', '.selftest', 'lib');
const { DEFAULT_SIM, formatReport, runExperiment } = require(path.join(OUT, 'simulate.js'));

const learners = Number(process.argv[2]) || DEFAULT_SIM.learners;
const sessions = Number(process.argv[3]) || DEFAULT_SIM.sessions;
const seed = Number(process.argv[4]) || DEFAULT_SIM.seed;

const config = { ...DEFAULT_SIM, learners, sessions, seed };

console.log('Running simulated curriculum experiment. Nothing leaves this machine.\n');
const started = Date.now();
const results = runExperiment(config);
const elapsed = Date.now() - started;

console.log(formatReport(results, config));
console.log('');

// Session by session held-out accuracy, so convergence is visible rather than asserted.
const header = ['session', ...results.map((r) => r.strategy.padStart(10))].join(' ');
console.log('Held-out probe accuracy by session:');
console.log(header);
for (let s = 0; s < config.sessions; s += 1) {
  const row = [String(s + 1).padStart(7)];
  for (const r of results) row.push(`${r.probeAccuracy[s].toFixed(1)}%`.padStart(10));
  console.log(row.join(' '));
}

console.log('');
console.log('In-training accuracy by session (not comparable across arms):');
console.log(header);
for (let s = 0; s < config.sessions; s += 1) {
  const row = [String(s + 1).padStart(7)];
  for (const r of results) row.push(`${r.accuracy[s].toFixed(1)}%`.padStart(10));
  console.log(row.join(' '));
}

console.log('');
console.log(`Total exercises modelled: ${results[0].exercises}. Elapsed: ${elapsed} ms.`);
