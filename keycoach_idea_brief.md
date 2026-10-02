# KeyCoach: Idea Brief for Critique and Improvement

## Your role

You are a critical product and ML engineering advisor. Your job is to stress-test and improve the idea below before any code is written. Be blunt. Do not flatter. Do not validate by default. If something is weak, say so and say why.

## The idea

An AI-powered piano learning app that works with a computer keyboard only. The user has no piano. They press keys on their laptop keyboard, a virtual piano responds, and the app teaches them like a real teacher would: lessons, real-time feedback, adaptive exercises, song learning.

Core pitch: "A piano teacher you can use with nothing except your computer keyboard."

The simulator is only the interface. The product is the learning loop:

Learn -> Practice -> Play -> Feedback -> Adapt -> Progress

## Current design decisions

### Deterministic parts (plain code, no LLM)

- Keyboard to note mapping (QWERTY rows mapped to white and black keys)
- Note detection, expected vs played comparison
- Timing error per note in ms, tempo handling
- Scoring (accuracy, timing, speed)
- MIDI-like note representation, music theory rules

### AI parts (only where personalization helps)

- Performance analysis: find weak notes and weak transitions (e.g. E to F)
- Practice planning: generate next drills, adjust difficulty
- AI teacher: explain mistakes, answer questions, explain concepts
- Song learning: convert a song to a simplified, staged arrangement

### Planned architecture

- Frontend: Next.js, TypeScript, Tailwind, Web Audio API, optionally Tone.js, Zustand
- Backend: Next.js API routes or server actions, Supabase, PostgreSQL
- LLM: Gemini or OpenAI API
- Orchestration: LangGraph with a shared `LearnerState`
- Start with 3 agents: Performance Analyzer, Practice Planner, AI Teacher
- Later: Song Agent, Curriculum Agent, Feedback Agent

`LearnerState` fields: user_id, current_level, current_lesson, recent_attempts, weak_notes, weak_transitions, tempo, accuracy, timing_accuracy, completed_lessons, current_song.

### MVP v1 (no AI yet)

1. Virtual piano (keyboard to sound)
2. Fixed lessons (C D E, then C to G, then full octave, then simple melodies)
3. Real-time feedback (expected vs played)
4. Timing feedback at a target BPM (+/- ms per note)
5. Accuracy and timing score
6. Progress tracking (notes, scales, rhythm, songs)

### Later phases

Gamification (XP, streaks, daily challenge), AI teacher, song learning, then ML research: learner modeling, difficulty prediction, adaptive curriculum.

### Research angle

Question: can a system adapt exercises from a learner's error and timing patterns better than a static curriculum? Planned comparison: static curriculum vs adaptive curriculum. Possible architecture comparison: traditional pipeline vs single LLM vs LLM + tools vs multi-agent LangGraph. Metrics: accuracy improvement, time to completion, retention, practice consistency, exercise validity, personalization quality, latency, cost.

## What I want from you

Go through each section below. For every one, give a verdict (solid, weak, or missing) and a concrete fix.

### 1. Problem validity

- Is "no piano, only a computer keyboard" a real learning problem or a gimmick?
- What does a laptop keyboard fundamentally fail to teach? (no velocity, no key depth, no finger independence, no hand position, polyphony and ghosting limits, key rollover)
- What transfers to a real piano and what does not? Be specific and honest.
- Who is the real target user? Define 2 or 3 personas and rank them.

### 2. Competition and differentiation

- List existing products that overlap (Simply Piano, Yousician, Flowkey, Piano Marvel, Melodics, virtual piano websites, MIDI keyboard apps).
- Where does this idea actually win, if anywhere?
- Is the LLM layer a real moat or a feature anyone can copy in a week?
- What is the single strongest differentiator I should double down on?

### 3. Technical risks

Evaluate and propose mitigations:

- Browser keyboard input latency and jitter (`keydown` timestamps, `performance.now()`, event loop delays)
- Audio latency in Web Audio API across browsers and devices
- Keyboard ghosting and rollover limits for chords
- Layout differences (AZERTY, QWERTY, mobile)
- Timing measurement accuracy: can I trust +/- 30 ms numbers at all?
- Key repeat on held keys
- Offline use and performance on low-end devices

### 4. Pedagogy

- Is the lesson sequence (C D E, then C to G, then octave, then melodies) sound?
- What should be taught first with a computer keyboard: rhythm, ear training, note reading, finger patterns, theory?
- Should note reading (staff notation) be part of the MVP?
- How do I avoid teaching bad habits that hurt later transfer to a real piano?
- What are the known evidence-based principles for skill acquisition I should build in (spaced repetition, deliberate practice, interleaving, immediate feedback, difficulty calibration)?

### 5. AI design

- Challenge my split between deterministic code and LLM. Is it correct?
- Where is the LLM unnecessary? Where would a simple heuristic or classical model beat it?
- Is LangGraph overkill for 3 agents? Propose the simplest architecture that still gives the experimental comparison I want.
- How do I validate LLM-generated exercises (musical validity, difficulty, notes within learned range, rhythm consistency)? Propose a programmatic validator.
- Propose a cheap learner model (e.g. per-note and per-transition error rates, Bayesian knowledge tracing, Elo-style difficulty, bandit for exercise selection) that could replace or support the LLM.
- Latency and cost budget for the AI teacher.

### 6. Song learning and legal risk

- Copyright and licensing for song input and arrangements. What is safe? (public domain, user-supplied MIDI, original arrangements, licensed catalogs)
- Realistic way to simplify a song to a staged arrangement. Is it feasible in the MVP window or should it be cut?

### 7. Research and evaluation design

- Turn the "static vs adaptive curriculum" idea into a testable experiment:
  - hypothesis, variables, control group
  - metrics and how each is measured
  - sample size needed and how to get participants
  - threats to validity (novelty effect, self-selection, dropout)
- Define the minimum result that would count as a meaningful finding.
- Suggest an offline evaluation I can run with simulated learners before real users exist.

### 8. Scope and plan

- Is the 7-phase roadmap realistic for one developer? Estimate effort per phase in weeks.
- Cut the scope to the smallest version that still tests the core hypothesis.
- Propose a 2 to 3 week prototype and what it must prove.
- List the top 5 reasons this project could fail, ranked by likelihood.

### 9. Missing pieces

Identify what is absent from the idea. Examples to check: onboarding and skill assessment, accessibility, mobile and touch input, MIDI keyboard support, ear training, sheet music rendering, user privacy and data retention, monetization, analytics, retention loops.

## Output format

- Start with a 5 line executive verdict: build, rework, or drop, and why.
- Then one section per topic above. Keep each tight: verdict, key issues, fixes.
- Use numbers where possible (ms, weeks, percentages, sample sizes).
- End with a prioritized action list: top 10 changes, ordered by impact.
- Then a revised version of this brief that incorporates your improvements, so I can reuse it.
- No filler. No praise. No em dashes. Plain, direct language.
- If you lack information to judge something, say what you need instead of guessing.
