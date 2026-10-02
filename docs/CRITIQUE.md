# KeyCoach: critique, decisions, and what changed

Response to `keycoach_idea_brief.md`. Written after implementing the MVP, so every
claim about behaviour is backed by code you can run.

## Executive verdict

**Build it, but rework the pitch and the research claim.**

1. The problem is real but narrow: it is "no instrument to practise on", not "a
   better way to learn piano". Sold as the former it is honest and defensible.
2. The keyboard permanently cannot teach velocity, key depth, finger independence,
   hand position or pedalling. Anything built on top has to say that out loud.
3. The LLM layer is not a moat. It is a weekend of work for anyone. The defensible
   parts are the measured loop, the layout and latency handling, and the schedule.
4. LangGraph for three agents is overkill. One request, one prompt, one validator.
5. The "adaptive beats static" hypothesis is not established. My own offline
   simulation says the opposite for held-out transfer. Promote it from assumption
   to testable claim, and report the negative result.

## What was built and verified

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | 0 errors |
| Lint and build | `npm run build` | compiled, lint clean, static prerender, 107 kB first load |
| Engine assertions | `npm run selftest` | 123 passed, 0 failed |
| Curriculum experiment | `npm run simulate` | 3 strategies, 200 simulated learners x 18 sessions, ~200 ms |

Three defects from your feedback were real and are fixed:

1. **QWERTY-only labels on an AZERTY board.** The engine mapped by physical
   position (correct for ergonomics) but printed QWERTY letters as the hints. On
   an AZERTY board the key standing where QWERTY's A sits is printed `Q`, so the
   hints pointed at keys you do not have. Now: the browser's layout map is read
   when available, every key press teaches its own legend, a preset can be chosen
   manually, and all hints print your real keycaps. AZERTY users now see
   `Q S D F G H J K L` for `C D E F G A B C D`.
2. **Keys not tied to beats.** The note strip spoke in note names and beats while
   the keyboard spoke in letters, with nothing connecting the two. Now every note
   chip carries the note, the beat, and the legend for the key to press, and every
   piano key carries the beat number it belongs to.
3. **The piano did not sound like a piano.** Three plain oscillators, no reverb,
   no attack transient, no unison. Rebuilt around a harmonic spectrum, three
   detuned strings per note, a hammer noise burst, brightness decay, register
   dependent sustain, stereo spread, and a convolution reverb from a generated
   impulse response. Three sound profiles are selectable.

## 1. Problem validity

**Verdict: weak as framed, solid as a niche.**

"Learn piano with only a keyboard" is a gimmick if the promise is piano playing.
It is a real problem if the promise is practice that requires no hardware and no
purchase. The difference matters commercially and pedagogically.

What a laptop keyboard fundamentally cannot teach, permanently:

| Missing | Consequence |
| --- | --- |
| Velocity and dynamics | No piano or forte, no phrasing, no tone control |
| Key depth and weight | No touch, no finger strength, no articulation |
| Finger independence | Two fingers share one movement pattern; no real polyphony |
| Hand position and wrist | Nothing to teach posture on |
| Pedalling, sustain | Half the expressive toolkit is absent |
| Two-hand independence | One keyboard, one hand's worth of reliable input |
| Sight reading from a staff | No spatial link between staff and key |
| Ghosting and rollover | Physical limit: most membrane boards fail at 3 keys |

What does transfer: note naming and keyboard geography, reading a sequence of
pitches, keeping time against a metronome, ear-to-hand mapping for single-line
melodies, and the habit of slow deliberate repetition.

Personas, ranked:

1. **Adult self-learner with no instrument.** Wants 5 to 10 minutes at a desk,
   today. Highest intent, lowest willingness to buy hardware. Primary.
2. **Teacher or tutor running theory and rhythm drills.** Wants a zero-install
   exercise for students before they buy an instrument. Small but high value, and
   the clearest path to real users. Second.
3. **Music-curious developer or student.** Will try anything that runs in a
   browser and will not buy a keyboard. Good for word of mouth, poor retention.
   Third.

## 2. Competition and differentiation

**Verdict: crowded, but a real gap on one axis.**

| Product | Overlap | Why it does not close the gap |
| --- | --- | --- |
| Simply Piano, Yousician, Flowkey | Curriculum, feedback, songs | Need a real piano, a MIDI keyboard, or a phone listening to one |
| Piano Marvel, Synthesia | Scoring, MIDI, sight reading | Require a MIDI instrument |
| Melodics | Rhythm, timing feedback | Built for pads and keys, needs hardware |
| virtualpiano.net and similar | Keyboard-to-sound | Sound only, no teaching, no feedback, no progress |
| GarageBand, DAWs | Sound and input | Not teaching products |

The gap is the combination: no instrument at all, real feedback, and a taught
sequence. Nobody credible occupies that corner because everyone else assumes an
instrument as the entry ticket.

The LLM layer is not a moat. A motivated developer reproduces a chat wrapper in a
week. What is harder to copy and what I would double down on:

1. The measured loop with honest limits. Assessment, calibration, scoring that
   says which of notes or timing failed, and an explicit statement of what does
   not transfer.
2. Layout and latency handling that works on the learner's actual machine.
3. The schedule: mastery thresholds, spaced repetition and interleaving. This is
   where retention is won and it is invisible to a chat wrapper.

## 3. Technical risks

**Verdict: mostly manageable, one genuinely unsolvable.**

| Risk | Reality | Mitigation, and status |
| --- | --- | --- |
| Keyboard input jitter | Real, tens of ms | `event.timeStamp` instead of handler time, implemented |
| Audio output latency | 10 to 40 ms typical, device dependent | Read `AudioContext.outputLatency`, subtract it, plus a tap calibration, implemented |
| Ghosting and rollover | A physical hardware limit | Monophonic lessons only, live warning at 3 held keys, implemented |
| Layout differences (AZERTY and friends) | Solvable | `event.code` plus the real keycap legend, implemented |
| Trusting plus or minus 30 ms | You should not | Reported as an estimate, calibration shown, jitter stated in the UI |
| Key repeat on held keys | Solvable | `event.repeat` ignored, implemented |
| Offline and low-end devices | Solvable | No network, no sample downloads, one static route |
| Touch and mobile | Partly solvable | Keys are tappable, but timing on touch is not worth scoring |

The honest summary: timing can be measured repeatably to roughly the tens of
milliseconds, not to single digits. Do not print `+12 ms` as if it were precise.
Say "on time, within about 50 ms".

## 4. Pedagogy

**Verdict: the lesson order is sound but not optimal for a keyboard.**

C D E, then C to G, then the octave, then melodies is a reasonable pitch order. It
is not the right *first* order for this instrument. With a keyboard, the first
thing to train is rhythm and keyboard geography, because those are the two skills
that transfer perfectly and the two that need no dynamics. The current build
follows the brief's order in the Learn tab, and includes rhythm drills as a
separate category, which is the compromise.

What to teach first, in order: rhythm and pulse, then key geography and note
naming, then single-line melodies by ear, then intervals, then theory.

Note reading from a staff: **not in this MVP, and I would keep it out.** A staff
encodes pitch height, which a keyboard does not show. Teaching notation here
builds a mapping the learner has to unlearn at a real piano. Teach it when there
is an instrument.

Avoiding bad habits that hurt transfer:

- No fingering is the biggest risk. A learner who never assigns fingers transfers
  nothing. Fix: label the intended finger per note, even in a monophonic lesson.
- No hand shape. Fix: state the shape in words per lesson and accept that it
  cannot be verified.
- No dynamics. Fix: never claim it is taught.

Evidence-based principles now built in: immediate feedback per note, mastery
thresholds before advancing (88 accuracy, 80 timing, 85 overall), spaced
repetition with an SM-2 style interval, interleaved review, and difficulty
calibration from recent accuracy.

Two further additions came out of using the thing, and both matter more than the
theory above:

**1. You cannot correct a timing error you have not heard.** Measurement is not
instruction. Telling a beginner "+200 ms" produces nothing, because they have no
reference for what "on time" sounds like. So the practice screen now leads with a
tempo ladder (50, 75, 100 percent), a repeatable Listen pass that plays the phrase
with a count-in and a click, and a choice of mode: Listen, Echo (hear then play
back), or Together (a quiet guide plays underneath you). This is the
call-and-response pattern that instrumental teachers have used forever, and it
belongs in the MVP rather than in a later phase.

**2. Timing should be reported in words, with numbers as an opt-in.** "A bit late"
implies an action. "+180 ms" implies arithmetic. The default is now three bands
(on the beat, a bit off, badly off) phrased as sentences with a suggested response,
and milliseconds are a Settings toggle for learners who read them fluently.

## 5. AI design

**Verdict: the deterministic versus LLM split is right. The orchestration is not.**

Where the LLM is unnecessary, and where a heuristic wins outright:

| Task | Better done by | Why |
| --- | --- | --- |
| Note and transition error rates | Counting | Exact, instant, free, testable |
| Drill generation | Rule based search over transitions | Deterministic and validatable |
| Exercise validation | Constraint check | A model cannot be trusted with it |
| Tempo recommendation | Arithmetic on recent accuracy | No model needed |
| Retention scheduling | Spaced repetition formula | A model would be worse |
| Explaining a mistake in words | LLM, optional | Language is where a model earns its place |
| Free-form question answering | LLM, optional | Genuinely needs language |

LangGraph for three agents is overkill. There is one state object, one request and
no branching that needs a graph. The simplest architecture that still gives the
comparison you want:

```
client analysis (deterministic)  ->  compact learner summary
                                        |
                         POST /api/teacher (one request)
                                        |
                       model used only if a key is configured
                                        |
                        falls back to rule based wording
```

That is what is implemented, and it doubles as the simplest arm of your planned
architecture comparison. Three shapes now exist and are measured side by side in
the Agents tab: `single-shot` (one opaque pass), `pipeline` (three agents, no
network) and `pipeline+llm` (same three, with the teacher step allowed to call a
model for wording only). The orchestrator records a per-agent trace with timings,
so the cost of separating concerns is visible rather than assumed. On a real run
the agent boundaries add single digit milliseconds, and the model call is the only
step that can be slow, can cost money, and can be dropped without losing
capability. That is the argument against a graph framework, with numbers behind it.

One further point the brief underrates: the "explain my mistake" job is mostly not
a language problem. It is a measurement problem. A model cannot tell a learner why
their timing failed unless something reconstructs what actually happened. So the
timing layer (`src/lib/timing.ts`) separates bias, spread and drift, names the
pattern (`systematic-late`, `drifting-late`, `scattered`, `isolated-note` and so
on) and attaches a drill to each one, deterministically and instantly. The model,
when present, explains that finding in better prose. It never produces it.

How to validate generated exercises (implemented, `validateExercise`): notes
inside the learned range, leaps under a threshold, beat values in range, correct
array lengths, length bounds. Any generated exercise, from a model or from a rule,
must pass before it is shown. The current generator repairs its own output when it
fails.

Cheap learner model (implemented): per-note and per-transition error rates, plus a
retention estimate and an interval per lesson. An epsilon-greedy bandit over the
candidate pool is also implemented, in the simulation only, so it can be compared
without shipping it.

Latency and cost budget for the teacher: cap output at 260 tokens, keep the prompt
under about 600 tokens, target p95 under 2.5 seconds, cache by a hash of the
learner summary. At a small model's rates that is well under a cent per call, and
the feature still works at zero cost with no key.

## 6. Song learning and legal risk

**Verdict: build it, but only on the safe inputs, and be honest about fidelity.**

Safe inputs, in order of safety:

1. Public domain works. Unambiguous, ships with the product, no tracking.
2. User-supplied MIDI. The user has the file, you never store or redistribute it.
   This is what is implemented.
3. Original arrangements you commission. Yours, but costs money.
4. A licensed catalogue. Real cost and real paperwork, not an MVP item.

What is not safe: bundling modern copyrighted songs or arrangements, or scraping
them into the app. That is the risk the brief is right to flag.

Implemented pipeline, end to end: parse a standard MIDI file in the browser
(format 0 and 1, PPQ, running status, tempo and name meta events), extract notes,
analyse difficulty (range, leap, density, polyphony, tempo), then produce five
staged arrangements: right hand only, faster, sparse bass, fuller bass, written
rhythm.

Fidelity limits, stated plainly: a computer keyboard cannot hold two hands, and
most membrane boards fail at three simultaneous keys, so the left hand is
*serialised* against the melody rather than played together. The arrangement keeps
the shape of the piece and loses the harmony. That is a real limitation, not a
detail.

## 7. Research and evaluation design

**Verdict: the question is good, the plan as written cannot answer it, and my own
simulation already contradicts part of it.**

Testable version:

- **Hypothesis.** For a novice on a computer keyboard, an adaptive curriculum
  produces greater accuracy on held-out material than a static curriculum after 6
  hours of practice.
- **Design.** Between subjects, two arms, random assignment. Same lessons, same
  scoring, same interface. Only the selection rule differs.
- **Independent variable.** Curriculum policy: static order versus adaptive
  targeting.
- **Dependent variables.** Held-out accuracy (primary), timing error, sessions to
  mastery, 7 day retention, practice consistency, drop-out.
- **Control.** The static arm replays the fixed curriculum at fixed tempo.
- **Sample size.** For a two arm test on accuracy improvement with a moderate
  effect (d = 0.4), alpha 0.05, power 0.80, you need about 100 per arm, 200 total.
  Expect 30 percent dropout in a consumer app, so recruit 280.
- **Minimum meaningful result.** Adaptive beats static on held-out accuracy by at
  least 5 points, p under 0.05, with no loss in retention. Equal transfer at 25
  percent fewer practice minutes also counts.
- **Threats to validity.** Novelty effect (run at least 3 weeks, discard week 1),
  self-selection (recruit both arms from the same channel, randomise), dropout
  (analyse by intent to treat), and metric invalidity.

That last one bit me, which is the useful part:

> **Metric invalidity, found by running it.** My first harness scored each arm on
> the exercise it chose. That is not comparable: the adaptive arm keeps raising
> difficulty, so its accuracy stays low, while the static arm replays comfortable
> exercises and looks excellent. First run: static 60.4 percent, adaptive 35.1
> percent. That number was an artefact of the metric. The fix is a held-out probe,
> identical for every arm, with learning disabled during measurement.

Offline evaluation, implemented and run (`npm run simulate`): the app's own
exercise engine and scoring code, 200 simulated learners, 18 sessions, three
curriculum policies, seeded and reproducible in about 200 ms.

Result with a valid held-out probe:

| Strategy | Probe session 1 | Probe final | Versus adaptive |
| --- | --- | --- | --- |
| static | 16.3% | 47.6% | +7.3 points |
| bandit (epsilon-greedy) | 14.8% | 41.3% | +0.9 points |
| adaptive (weakest-first) | 16.9% | 40.4% | baseline |

Read honestly: **in this model, narrow targeting does not beat breadth on
transfer.** Targeting the two worst transitions improves those transitions and
generalises poorly to a broad reference exercise. Either the model is wrong (its
learners are too homogeneous, its transfer too local) or the hypothesis is wrong.
A simulation cannot tell you which. That is what a human trial is for, and it is
why the offline harness is worth having: it stopped a bad metric from shipping.

## 8. Scope and plan

**Verdict: 7 phases is not realistic for one developer as written. It is about 17
to 20 weeks, with phase 7 unbounded.**

| Phase | Content | Solo estimate |
| --- | --- | --- |
| 1 | Virtual piano, mapping, sound, UI | 1 week |
| 2 | Note engine, timing, MIDI representation | 1.5 weeks |
| 3 | Lessons, exercises, scoring, progress | 2 weeks |
| 4 | Gamification, streaks, challenges | 1 week |
| 5 | AI teacher, analysis, recommendations | 2 weeks |
| 6 | Song learning, import, simplification | 4 weeks |
| 7 | ML research, learner modelling, experiments | 6 weeks plus participants |

Smallest version that still tests the core hypothesis: phases 1 to 3 plus a
deterministic targeting rule. That is what is built here.

Two to three week prototype, and what it must prove:

- It gives immediate, correct feedback on the right key at the right time.
- Timing is measured repeatably to within roughly 50 ms on a normal laptop.
- A real beginner completes three sessions unaided and comes back the next day.
  If that fails, nothing downstream matters.

Top 5 reasons this could fail, ranked by likelihood:

1. **Learners stop after a week.** No instrument, no goal, no accountability. Most
   likely by a wide margin.
2. **The keyboard ceiling is hit fast.** A motivated learner exhausts what a
   monophonic keyboard can teach in days.
3. **The adaptive claim does not survive contact with humans.** My own simulation
   already fails to support it.
4. **Copyright.** Solved for now by public domain and user-supplied files, but it
   caps the catalogue and the appeal.
5. **Nobody wants to pay.** The value is real but small, and small value plus free
   alternatives means no revenue.

## 9. Missing pieces

**Verdict: most were missing. Here is what is present now, and what still is not.**

Present: onboarding plus a three exercise placement assessment, keyboard layout
detection with a manual override, latency calibration, accessibility (reduced
motion honoured and forceable, focus rings, live regions, aria labels that name the
key and its position, no tab trap on the piano keys), touch and pointer input,
scheduled review and interleaving, user supplied MIDI import, an AI teacher with a
working offline fallback, a privacy statement, and a data reset.

Still missing, deliberately: full MIDI keyboard input (the whole point here is no
hardware, but a MIDI path is the single best upgrade once a learner buys an
instrument), ear training as its own mode, staff notation, monetisation, and
product analytics.

On analytics: the brief lists it as missing and it is, but adding it contradicts
the current privacy stance. Decide which you want. I would keep the app
measurement free and instrument the research trial separately, with consent.

## The measured numbers, in one place

- Engine assertions: 220 checked, all passing, offline, no browser needed.
- Orchestration: 3 shapes compared offline, 2 to 4 ms of deterministic work, 0
  model calls without a key. Moved out of the app and into a script that runs the
  pipeline end to end and prints its real output (diagnosis, plan, message).
- Sound: additive inharmonic partials, 3-string unison, two-part hammer transient,
  velocity coupling, damper thud, 5 voicings, every parameter exposed. The "bright
  and sharp" preset stretches partials to about 20 cents sharp at partial 8.
- Tuning: A4 reference 415 to 466 Hz, fine pitch ±100 cents, Railsback stretch −10
  to +25 cents per octave, plus a held-tone helper for matching a recording by ear.
- Keyboard: the full chromatic range C3 to E5, 29 semitones, all reachable. The
  self-test asserts no gaps, because a missing black key silently breaks songs.
- Layouts handled: QWERTY, AZERTY, QWERTZ, Dvorak, plus browser supplied maps.
- Content: 21 public domain songs by default, plus 2 opt-in reference arrangements
  that are excluded from the scheduler, coach and experiment.
- Timing diagnosis: 8 named patterns from 3 derived numbers (bias, spread, drift),
  each producing a drill.
- Timing presentation: 3 bands in words by default, milliseconds as an opt-in.
- Practice: tempo ladder at 50, 75 and 100 percent, and three modes (Listen, Echo,
  Together with a guide).
- Orchestration: 3 shapes compared, 3 agents traced, 0 model calls without a key.
- Latency compensation: device reported value plus a manual tap offset, bounded to
  250 ms either way.
- Timing confidence: tens of milliseconds. Do not claim better.
- Budget for the teacher call: 260 output tokens, well under a cent per call.
- Offline experiment: 200 learners x 18 sessions x 3 strategies in about 200 ms,
  reproducible from a seed. Static won held-out transfer by 7.3 points.
- Study design: 100 per arm, 200 total, recruit 280 for dropout.

## Top 10 changes, ordered by impact

1. **Reword the promise.** "A teacher you can start with today, using the keyboard
   you already have" instead of "learn piano with a keyboard". Put the list of what
   does not transfer on the first screen.
2. **Fix layout and latency before anything else.** Wrong key labels and
   uncompensated latency invalidate every number the product produces.
3. **Score on held-out material, not on the exercise an arm chose.** Otherwise the
   adaptive arm is measured on a moving target and the comparison is worthless.
4. **Ship the schedule.** Mastery thresholds, spaced repetition, interleaving. This
   is the retention engine and the part nobody copies in a weekend.
5. **Teach the rhythm before measuring it.** A tempo ladder, a listen pass you can
   repeat, and a Together mode with a quiet guide. Measurement without a reference
   teaches nothing, and this is where retention is actually won.
6. **Label fingers per note.** The cheapest fix for the worst transfer risk.
7. **No orchestration framework.** Three stages with declared roles, an explicit
   shared state and a trace, about 200 lines. Measured at 2 to 4 ms against a
   single-pass baseline by `npm run agents-compare`. It was briefly a tab in the
   app and was removed, because it duplicated modules the product already uses.
8. **Keep the generator behind the validator.** Nothing musical is shown until it
   passes a constraint check.
9. **Add MIDI keyboard input as the upgrade path.** Meet the learner where they go
   when they buy hardware.
10. **Run the human trial or drop the research claim.** A negative result reported
    honestly is worth more than an unsupported positive one.

## Revised brief

Rewritten to incorporate the above, so it can be reused as the working document.

### Pitch

A practice teacher for people who have no instrument and 10 minutes. It teaches
what a computer keyboard can teach, measures it honestly, and tells the learner
what it cannot teach. It does not promise piano playing.

### Scope

Deterministic core: mapping, note detection, latency compensated timing, scoring
on held-out material, progress, scheduling, MIDI import, and an exercise
validator. Optional language layer: an LLM used only for wording and free-form
questions, with a working offline fallback. No orchestration framework.

### Hard requirements

1. Correct key legends for the learner's actual layout.
2. Latency compensated, and reported as an estimate rather than a precise figure.
3. Every generated exercise passes the validator before it is displayed.
4. Every metric that compares conditions is measured on identical held-out
   content.
5. No copyrighted material ships. Public domain or user supplied only.
6. The limits of the instrument are stated in the interface, not buried.

### Research claim, restated as testable

For novices on a computer keyboard, does an adaptive policy beat a static
curriculum on held-out accuracy after 6 hours, with no retention loss? Between
subjects, 100 per arm, 200 total, recruit 280. Minimum meaningful result: 5 points
of held-out accuracy at p under 0.05. Report the offline simulation as a sanity
check, not as evidence, and report a negative result as a result.

### Open questions before going further

- Which learner is this actually for, persona 1 or persona 3? The pitch and the
  retention design differ.
- Is MIDI input in scope? It changes the ceiling more than any other single
  feature.
- The research trial or the product? Doing both properly is two projects.




