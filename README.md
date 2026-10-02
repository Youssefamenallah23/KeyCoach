# KeyCoach

A piano practice teacher that runs on nothing but a computer keyboard.

Built to the `MVP v1` definition in `keycoach_idea_brief.md`, then extended with
the parts of that brief's critique that could be implemented offline: layout
detection, latency calibration, spaced repetition, MIDI song learning, an
onboarding placement, and a simulation harness.

**The written critique the brief asks for is in [`docs/CRITIQUE.md`](docs/CRITIQUE.md)**:
per-section verdicts, effort estimates, sample sizes, a top-10 action list and a
revised brief. Read that for the reasoning; read this for how to run the thing.

> Idea: *"I want to learn piano, but I don't own a piano. I already have a
> computer keyboard, so why can't I use it as my instrument and get an actual
> learning experience?"*

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run selftest   # 220 offline assertions over the deterministic engine
npm run simulate   # simulated curriculum experiment, static vs adaptive vs bandit
npm run agents-compare   # working orchestration: analyzer -> planner -> teacher (+LLM wording)
npm run build      # production build
```

Requires Node 18.17+ (developed on Node 22). No API keys, no database, no network
calls at runtime.

## Optional: enable the model wording step

The app is fully functional with **no keys at all**. Scoring, timing analysis,
drill generation and exercise validation are deterministic code and never touch the
network. A model is only ever used to phrase sentences.

To try the model path:

```bash
cp .env.example .env.local   # then paste one key into .env.local
```

`.env.local` already exists with both keys blank, and is git-ignored. See the
comments inside it. With a key set, restart the dev server (Next.js reads env vars
at startup) and check:

| Endpoint | Blank key | Key set |
| --- | --- | --- |
| `GET /api/teacher` | `{"enabled":false,"provider":"local"}` | `{"enabled":true,"provider":"openai"}` |

A failed or rejected call still answers, from the deterministic analyser, and says
so in a `note` field. The feature cannot break.

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | checked first; `OPENAI_MODEL` defaults to `gpt-4o-mini` |
| `GEMINI_API_KEY` | — | `GOOGLE_API_KEY` accepted as an alias; `GEMINI_MODEL` defaults to `gemini-1.5-flash` |

## What is implemented (MVP v1)

| MVP item | Where |
| --- | --- |
| 1. Virtual piano (keyboard to sound) | `src/lib/notes.ts`, `src/lib/audio.ts`, `src/components/PianoKeyboard.tsx` |
| 2. Fixed lessons | `src/lib/lessons.ts` |
| 3. Real-time feedback | `src/components/FeedbackBar.tsx`, `src/lib/practice.ts` |
| 4. Timing feedback at target BPM | `src/lib/practice.ts` |
| 5. Accuracy and timing score | `src/lib/scoring.ts` |
| 6. Progress tracking | `src/lib/progress.ts`, `src/components/ProgressPanel.tsx` |

Plus the parts of the brief's critique that could be built offline:

| Addition | Where |
| --- | --- |
| Per-note and per-transition error rates, tempo recommendation, generated drill, exercise validator, rule-based teaching | `src/lib/coach.ts`, `src/components/CoachPanel.tsx` |
| Keyboard layout detection and real keycap legends | `src/lib/keyboardLayout.ts`, `src/hooks/useKeyboardLayout.ts` |
| Output latency compensation and a tap calibration routine | `src/lib/audio.ts`, `src/components/SettingsPanel.tsx` |
| Mastery thresholds, spaced repetition, interleaved review | `src/lib/schedule.ts`, `src/components/ReviewPanel.tsx` |
| Onboarding and a three exercise placement assessment | `src/components/Onboarding.tsx` |
| MIDI import, difficulty analysis, five staged arrangements | `src/lib/midi.ts`, `src/components/MidiImport.tsx` |
| AI teacher with a deterministic offline fallback | `src/app/api/teacher/route.ts`, `src/components/TeacherChat.tsx` |
| Timing diagnosis: bias, spread, drift, named patterns and a fix drill | `src/lib/timing.ts`, `src/components/TimingDiagnosisCard.tsx` |
| Listen first: hear the phrase before you play it, at a tempo you can hold | `src/lib/demo.ts`, `src/components/PracticeSetup.tsx` |
| Three practice modes: Listen, Echo, and Together with a quiet guide | `src/hooks/usePractice.ts` |
| Plain language timing ("a bit late") with milliseconds opt-in | `src/lib/timing.ts` |
| 21 public domain songs plus opt-in reference arrangements | `src/lib/lessons.ts` |
| Offline curriculum experiment comparing three policies | `src/lib/simulate.ts`, `scripts/simulate.cjs` |
| Working agent orchestration (analyzer → planner → teacher, optional LLM wording) + shape comparison | `scripts/agents-compare.cjs` |
### Listen first, because a beginner cannot fix a timing error they have not heard

The timing diagnosis tells you *what* went wrong. It does not teach you the rhythm,
and "+200 ms" is not an instruction. So the practice screen now leads with the
three controls that actually change the outcome:

| Control | Why it exists |
| --- | --- |
| **Tempo ladder** (Slow 50%, Medium 75%, Target) | Timing cannot be learned at performance tempo. A learner who cannot hold 50 percent cannot hold 100 percent either. |
| **Listen first**, repeatable x1 to x3 | The phrase plays with a metronome count-in and a click throughout, so the pulse is audible even where the melody rests. You hear the reference before anything is measured against you. |
| **Mode**: Listen / Echo / Together | Listen is hearing only. Echo is hear once then play it back. Together plays a soft guide underneath you, at the same scheduled times the scoring uses. |

Together mode required an engine change: the session runs on a fixed clock, the
guide is scheduled from that same `exerciseStart`, and auto-skip is disabled
because a learner following a guide must not be judged against a deadline.

Everything is scheduled ahead on the audio clock, not on JavaScript timers, so the
guide and the measurement can never drift apart.

### Songs

21 public domain pieces ship by default: Für Elise, In the Hall of the Mountain
King, The Entertainer, Moonlight Sonata, the Toccata in D minor, Beethoven's
Fifth, Rondo Alla Turca, Canon in D, Brahms' Lullaby, Greensleeves, Silent Night,
Jingle Bells, Happy Birthday, Oh! Susanna, Deck the Halls, When the Saints, plus
the earlier traditional tunes.

Interstellar and Runaway are still in copyright. They are implemented as
**opt-in reference arrangements** behind a Settings toggle, off by default, marked
with author credit, excluded from the scheduler, coach and experiment, and labelled
in the interface as simplified single-hand reductions for private study rather than
transcriptions. Commercially shipping them would need a licence.

### Why your timing was bad

A score tells you that timing failed. It does not tell you how, and those are
different problems with different fixes. `src/lib/timing.ts` reconstructs each
note's ideal onset and actual onset from the stored attempt, then derives three
numbers that separate the failures:

| Number | What it means | What it is not |
| --- | --- | --- |
| **bias** | Mean signed error. A steady offset is anticipation or residual device latency, not a skill gap. | Not an accuracy problem. The rhythm is right, it is shifted. |
| **spread** | Standard deviation. High spread with near zero bias means the passage is not automatic yet. | Not a pulse problem. The notes are still being found. |
| **drift** | Regression slope of error against note index. Rising is dragging, falling is rushing. | Not a note problem. It is a failure to hold the pulse. |

Those become named findings: `systematic-late`, `systematic-early`,
`drifting-late`, `drifting-early`, `scattered`, `isolated-note`,
`hesitant-start`, `rushed-end`. Each one reports the measurement that triggered
it, the likely cause, and a fix. Each one also produces a playable drill shaped
around that exact failure: isolated pairs for a bad movement, the second half only
for a drag, a lengthened final note for rushing, a doubled first note when the
entry is late.

The UI shows it rather than asserting it: a two lane timeline where the top lane
is where the beat was and the bottom lane is where you actually played, the
distance between them drawn to scale, plus the distribution of your errors with
the mean marked and a bias trend across recent runs. See it under the scores after
any run, summarised in the coach rail, and as a fix drill you can start in one
click.

If the same bias repeats across attempts, the card says so and points at the
manual latency offset, because a repeating shift of 120 ms is a calibration
problem rather than a practice problem.

### Agent orchestration

The brief asks whether LangGraph is overkill for three agents. It is. What a
comparison needs is declared roles, an explicit shared state and a trace you can
measure, which is about 200 lines:

```
LearnerState  (attempts, weak notes, weak transitions, timing diagnosis,
               mastery, due lessons, tempo, streak, skill level)
      |
      +--> Performance Analyzer  (deterministic) -> weak spots + timing diagnosis
      |
      +--> Practice Planner      (deterministic) -> ordered plan, each item with a reason
      |
      +--> AI Teacher            (rules, or an LLM for wording only) -> language
```

Scoring and exercise validation are deliberately **not** agents. They stay pure
functions, because a model must never sit in the path of a number or a constraint
check.

This was previously an **Agents tab in the app**. It was removed: nothing in the
product depended on it, and it duplicated the modules the product actually uses
(`coach.ts`, `schedule.ts`, `timing.ts`). It answered a question about architecture,
which belongs in a script and a document, not in a learner's sidebar and 44 kB of
bundle. It now lives in `scripts/agents-compare.cjs`:

```bash
npm run agents-compare              # analyzer -> planner -> teacher, answered from rules
npm run agents-compare -- --network # same, teacher wording from the model, if a key is set
```

It runs the orchestration end to end and prints its **actual output**: the
analyzer's findings, the planner's ordered plan with a reason per step, and the
teacher's final coaching message. With `--network` the teacher step is handed the
analyzer and planner output as context, so the model is wording an already-made
decision rather than making one. A compact comparison of the three shapes follows,
and it shows the whole deterministic pipeline costs **2 to 4 ms** while the model
call is the only slow step, the only one needing a key, and the only one that can
be dropped without losing any capability. That is the argument against a framework,
with numbers.

### The sound engine

`src/lib/audio.ts` synthesises the piano rather than loading samples, so it works
offline with no downloads. Every note is an **additive bank of partials**, one
oscillator each, and the partials are *inharmonic*:

```
f_n = n * f0 * sqrt(1 + B n^2) / sqrt(1 + B)
```

A real piano string is stiff, so its partials sit progressively **sharp** of the
harmonic series. Long bass strings have a tiny `B` and sound warm; short treble
strings have a large `B` and sound hard and metallic. A synth built on exact
integer harmonics cannot sound like a bright piano, because that sharpness is
exactly what makes a piano cut through. The division by `sqrt(1 + B)` keeps the
fundamental on pitch, so "A4 = 440 Hz" stays honest while the upper partials
stretch.

On top of that: high partials decay faster than low ones (a note starts bright and
settles warm, which does more for realism than any filter), a per-strike three-string
unison spread for the slow beating, a two-part hammer transient (a low thump plus a
mid click), velocity coupling (louder = brighter and harder, softer = darker and
slower-sprung), a damper thud on key release, register-dependent sustain,
bass-left/treble-right stereo spread, and a convolution reverb from a generated
impulse response.

**Five voicings**: Concert grand, Bright and sharp, Metallic and bell-like, Honky
tonk, Felt. Every parameter is also exposed as a slider, including *metallic edge*,
which is shown in cents at the eighth partial so you can see what you are changing.

Samples are the one thing that would make it truly indistinguishable from a real
piano, and they are deliberately not bundled yet: they cost tens of MB and a
license. The engine is shaped so a sample voice can be added later as an optional
setting, with this synthesis remaining the offline fallback. That keeps "works with
zero downloads" honest today.

### Tuning, and how to match a recording

Three independent numbers, exposed in Settings:

| Control | Range | What it is |
| --- | --- | --- |
| **A4 reference** | 415 to 466 Hz | Concert pitch is 440. 442 and above is "sharp". |
| **Fine pitch** | ±100 cents | Shifts the whole piano uniformly. |
| **Railsback stretch** | −10 to +25 cents per octave | Real pianos are not tuned to exact octaves. The octave is tuned to the sharpened second partial, so the treble sits sharp and the bass flat. Around 6 cents per octave is typical for a small instrument, and it is a large part of why a real piano sounds brighter at the top than a synth set to exact octaves. |

Because a description of a sound is not the sound, there is also a **tune against
the video** helper: it holds a steady tone on a chosen note (A4, C4, C5 or A3) while
your recording plays. When the two are slightly apart you hear a slow wobble that
speeds up as they converge and stops when they match. Slide the fine pitch until the
wobble disappears. That is how you match a reference by ear, and it does not need
anyone else to hear it for you.

One thing to check first: a video played at anything other than **1x speed** is
pitch-shifted, so it will sound sharp for reasons that have nothing to do with the
piano in it.

### Offline experiment

`npm run simulate` drives the app's own exercise engine and scoring code with
simulated learners across three curriculum policies. It is seeded and reproducible
in about 200 ms. Headline result, measured on a held-out probe that is identical
for every arm:

```
strategy    probe@s1  probe@s6  probe@final  mastery@s  retention
static         16.3%    32.9%       47.6%       13.3      56.9%
adaptive       16.9%    23.8%       40.4%        8.8      42.6%
bandit         14.8%    26.9%       41.3%        9.9      63.7%
```

Read this as a sanity check on the logic, not as evidence about people. In this
model, narrow weakest-first targeting transfers worse to the broad reference
exercise than simply covering the curriculum. See `docs/CRITIQUE.md` for why that
may be a model artefact, and why an earlier version of this harness produced a
worthless comparison.

## Architecture

```
             src/app/page.tsx  (shell, tabs, layout)
                     |
        +------------+-------------+
        |                          |
  PracticeView                FreePlay
        |                          |
   usePractice hook           lib/audio.ts
        |                          |
  lib/practice.ts  (pure state machine)
        |            \
  lib/scoring.ts     lib/notes.ts  (mapping, MIDI, naming)
        |
  lib/progress.ts  (Zustand + localStorage persist)
        |
  lib/coach.ts  (learner model + drill generator + validator)
```

The practice machine is pure, separate from React and from audio, so timing
anchoring and miss detection are readable and testable in isolation.

### Keyboard layout, and why the hints say `Q` on an AZERTY board

Mapping uses `KeyboardEvent.code` (physical key position), so the shape of the
keyboard is identical on every layout: white keys on the home row, black keys on
the row above. What changes per layout is the **legend printed on the key**, and
that is what the interface shows.

| Row | Notes | Legend on QWERTY | Legend on AZERTY |
| --- | --- | --- | --- |
| number | C#3 D#3 F#3 G#3 A#3 | `1 2 3 4 5` | `& E " ' (` |
| bottom | C3 to B3 | `Z X C V B N M` | `W X C V B N ,` |
| home | C4 to E5 | `A S D F G H J K L ;` | `Q S D F G H J K L M` |
| top | the black keys | `Q W R T Y I O` | `A Z R T Y I O` |

The full chromatic range C3 to E5 is mapped, all 29 semitones, so any melody in
that register is playable. An earlier version left the lower octave's black keys
and the top E unmapped, which silently made Für Elise and Runaway unplayable. The
self-test now asserts chromatic coverage, so that cannot regress.

Legends come from, in order of preference: `navigator.keyboard.getLayoutMap()`
when the browser exposes it, then what the app has learned from your actual key
presses, then a preset you choose (QWERTY, AZERTY, QWERTZ, Dvorak) in Settings.
Change it any time on the Settings tab.

## How timing is measured

Two modes, because one number cannot be honest about both things:

- **Free pace** (notes, scales, songs): the ideal clock *re-anchors* after every
  correct note. The measured error is the interval since the previous note at the
  target tempo. Pausing on a hard key is forgiven; uneven rhythm is not.
- **Metronome locked** (rhythm drills): a four beat count-in, then the clock is
  fixed to the metronome. Notes outside the late window are auto-marked skipped,
  which is what lets a strict exercise end on its own.

Timing error is computed between keyboard events on the audio clock
(`event.timeStamp` mapped through one anchor pair against
`AudioContext.currentTime`). Trustworthy to roughly the tens of milliseconds, not
to single milliseconds.

### Score formulas

```
accuracy = correct / (expected notes + wrong presses)          x 100
timing   = mean per-note score over |error|                     (piecewise curve)
speed    = ideal span between first/last note / actual span     x 100, capped
overall  = weighted mean, renormalised over measurable metrics
```

`timing` and `speed` are `null` when genuinely unmeasurable (for example an
attempt abandoned after one note), and the overall score renormalises instead of
inventing a value.

## Known limits (honest)

These are the technical limits the brief asks to be explicit about. They are
stated in the UI too, not only here.

- **No velocity or key depth.** A computer keyboard is on/off. Dynamics and touch
  cannot be taught or measured. Every note is velocity 0.85 (0.7 from a click).
- **No finger independence, hand position or pedalling.** There is no keybed and
  no sustain pedal.
- **Ghosting and rollover.** Cheap keyboards physically cannot report 3+ keys at
  once reliably, so chords are not in the MVP lessons.
- **Input latency and jitter.** `event.timeStamp` is preferred over handler time,
  which lowers jitter, but the event loop and OS key repeat still contribute. Do
  not read a single-digit millisecond result as precise.
- **Output latency is compensated, not eliminated.** The device reported value is
  subtracted and a tap calibration refines it, but the residual error is still tens
  of milliseconds.
- **MIDI arrangements lose the harmony.** A keyboard cannot hold two hands, so the
  left hand is serialised against the melody in imported songs. The shape survives,
  the harmony does not.
- **Storage is local.** Progress lives in this browser's `localStorage` under
  `keycoach.progress.v2`. Clearing site data clears progress. The brief's
  Supabase/PostgreSQL plan is not wired up.
- **One hand, C4 to D5 for lessons.** The lower octave is used by imported songs and
  is playable in free play, but no built-in lesson uses it yet.
- **No analytics.** There is no telemetry at all, which supports the privacy stance
  but means there is no product instrumentation yet.

## What transfers to a real piano, and what does not

Worth being blunt, because it shapes the product.

**Transfers:** keyboard geography and note naming, reading a sequence of pitches,
rhythm and keeping time against a metronome, ear to hand mapping for simple
melodies, the habit of slow deliberate repetition.

**Does not transfer:** touch and dynamics, fingering choices, hand and wrist
posture, pedalling, sight reading from a staff, two-handed playing.

This is why the product is positioned as *a teacher you can start with*, not as a
replacement for an instrument.

## Public domain content

Every melody in the Songs category is public domain (Hot Cross Buns, Ode to Joy,
Mary Had a Little Lamb, Twinkle Twinkle, plus an original six note exercise). No
copyrighted arrangement is distributed, which is the safe path described in the
brief's legal section.

## Roadmap position

This build covers Phases 1 to 3 of the brief's roadmap plus most of the work the
critique asked for: song import with staged simplification, the LLM teacher with a
deterministic fallback, basic gamification (XP / streak / daily goal), and the
offline curriculum experiment.

Not built, and why:

- **The live ML research track.** The static vs adaptive comparison runs offline in
  `scripts/simulate.cjs`, but running it on real users needs participants, which a
  solo build cannot produce. The offline result already warns that "adaptive beats
  static" is not a safe assumption for held-out transfer.
- **Ear training and staff notation.** Cut from MVP. The keyboard teaches note
  naming and rhythm, not sight reading from a staff or interval recognition.
- **Live MIDI input and the Supabase/PostgreSQL backend.** MIDI *files* import; a
  connected keyboard and server sync are transport changes, not product changes.
  Progress stays in localStorage until there is a reason to sync it.
- **Monetization and analytics.** Intentionally absent; there is no telemetry.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Web Audio API, Zustand.
No Tone.js, no animation library, no database, no LLM provider.

