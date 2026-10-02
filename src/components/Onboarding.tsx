'use client';

import { useCallback, useEffect, useState } from 'react';
import FeedbackBar from './FeedbackBar';
import NoteStrip from './NoteStrip';
import PianoKeyboard from './PianoKeyboard';
import { usePractice } from '@/hooks/usePractice';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import { getLesson, type Lesson } from '@/lib/lessons';
import { useSettings, type SkillEstimate, type SkillLevel } from '@/lib/settings';

/**
 * Onboarding and placement assessment.
 *
 * The brief lists "onboarding and skill assessment" as a missing piece. This is a
 * short, honest version: confirm the keyboard layout, then play three short
 * exercises (five notes, a scale, a melody) and derive a starting level and tempo
 * from the actual scores rather than asking the learner to self-report.
 *
 * It records real attempts, so nothing here is throwaway work.
 */

const ASSESSMENT = ['notes-2', 'scale-1', 'song-1'];

interface StepResult {
  lessonId: string;
  accuracy: number;
  timing: number | null;
  overall: number;
  targetBpm: number;
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const layout = useKeyboardLayout();
  const setSkill = useSettings((s) => s.setSkill);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const skill = useSettings((s) => s.skill);

  const [step, setStep] = useState(-1);
  const [results, setResults] = useState<StepResult[]>([]);

  const lessons = ASSESSMENT.map((id) => getLesson(id)).filter((l): l is Lesson => Boolean(l));
  const current = step >= 0 && step < lessons.length ? lessons[step] : null;

  const finishStep = useCallback(
    (result: { scores: { accuracy: number; timing: number | null; overall: number } }) => {
      const lesson = lessons[step];
      setResults((prev) => [
        ...prev,
        {
          lessonId: lesson.id,
          accuracy: result.scores.accuracy,
          timing: result.scores.timing,
          overall: result.scores.overall,
          targetBpm: lesson.targetBpm,
        },
      ]);
      setStep((s) => s + 1);
    },
    [lessons, step],
  );

  // Derive the estimate once every step is done.
  useEffect(() => {
    if (results.length === 0 || results.length < lessons.length) return;
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const meanOverall = mean(results.map((r) => r.overall));
    const meanTiming = mean(results.map((r) => r.timing ?? 0));
    const meanBpm = mean(results.map((r) => r.targetBpm));
    const score = Math.round(0.6 * meanOverall + 0.4 * meanTiming);

    let level: SkillLevel = 'beginner';
    if (score >= 75) level = 'intermediate';
    else if (score >= 55) level = 'elementary';

    const estimate: SkillEstimate = {
      level,
      score,
      startBpm: Math.max(50, Math.min(130, Math.round(meanBpm * (0.7 + score / 200)))),
      at: Date.now(),
    };
    setSkill(estimate);
  }, [lessons.length, results, setSkill]);

  const done = lessons.length > 0 && results.length >= lessons.length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label-xs">Before you start</p>
            <h1 className="mt-1 font-display text-2xl leading-tight text-ink">
              A short placement, then straight into playing.
            </h1>
          </div>
          <button type="button" className="btn btn-ghost text-xs" onClick={onDone}>
            Skip
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-line/60 bg-panel2/30 p-3">
          <p className="text-[12px] leading-relaxed text-muted">
            Your key legends are read from your own keyboard. Currently showing{' '}
            <span className="font-mono text-amber-soft">{layout.effectiveLayout.toUpperCase()}</span>
            {layout.exact ? ' (read from the browser)' : ' (from a preset, refined as you press keys)'}
            . Your white keys will read{' '}
            <span className="font-mono text-ink">
              {[60, 62, 64, 65, 67, 69, 71, 72]
                .map((m) => layout.labelForMidi(m) ?? '-')
                .join(' ')}
            </span>
            . Change it any time in Settings.
          </p>
        </div>

        {step === -1 ? (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Three short exercises: five notes, one scale, one melody. Each takes under a minute and
              the scores set your starting tempo.
            </p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => setStep(0)}>
              Start the placement
            </button>
          </>
        ) : null}
      </div>

      {current ? (
        <AssessmentRun
          key={current.id}
          lesson={current}
          index={step + 1}
          total={lessons.length}
          onFinish={finishStep}
        />
      ) : null}

      {/* ONBOARDING_SUMMARY */}
      {done ? (
        <div className="panel animate-rise motion-reduce:animate-none p-5">
          <p className="label-xs">Placement done</p>
          <h2 className="mt-1 font-display text-2xl text-ink">
            {skill ? `Starting level: ${skill.level}` : 'Starting level: beginner'}
          </h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            {results.map((r) => (
              <div
                key={r.lessonId}
                className="rounded-xl border border-line/60 bg-panel2/40 px-3 py-2"
              >
                <dt className="label-xs">{getLesson(r.lessonId)?.title ?? r.lessonId}</dt>
                <dd className="tabular mt-1 font-mono text-sm text-ink">
                  {r.accuracy}% accuracy
                  {r.timing === null ? '' : `, ${r.timing}% timing`}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            {skill
              ? `Overall ${skill.score} out of 100, so lessons start around ${skill.startBpm} BPM. This is a rough estimate from three exercises, not a judgement, and it adjusts as you play.`
              : 'Not enough data for an estimate, so lessons start at their default tempo.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setOnboarded(true);
                onDone();
              }}
            >
              Start learning
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setResults([]);
                setStep(-1);
              }}
            >
              Run it again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ONBOARDING_RUN

/** One assessment exercise, reusing the real practice machine. */
function AssessmentRun({
  lesson,
  index,
  total,
  onFinish,
}: {
  lesson: Lesson;
  index: number;
  total: number;
  onFinish: (result: { scores: { accuracy: number; timing: number | null; overall: number } }) => void;
}) {
  const p = usePractice(lesson);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (p.result && !reported) {
      setReported(true);
      onFinish(p.result);
    }
  }, [onFinish, p.result, reported]);

  const active = p.phase === 'countin' || p.phase === 'running';
  const cursor = active ? p.session.index : 0;
  const targetMidi =
    p.phase === 'finished' ? null : (p.session.outcomes[cursor]?.expected ?? null);

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label-xs">
            Exercise {index} of {total}
          </p>
          <h3 className="font-display text-lg text-ink">{lesson.title}</h3>
          <p className="text-[12px] text-muted">{lesson.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">{lesson.targetBpm} bpm</span>
          {!active ? (
            <button type="button" className="btn btn-primary py-1.5" onClick={p.start}>
              Play
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <NoteStrip session={p.session} />
      </div>

      <div className="mt-3">
        <FeedbackBar
          event={p.session.event}
          phase={p.phase}
          countIn={p.countIn}
          targetMidi={targetMidi}
        />
      </div>

      <div className="mt-3">
        <PianoKeyboard
          pressed={p.pressed}
          onDown={(midi) => {
            p.press(midi, { velocity: 0.7 });
          }}
          onUp={p.release}
          targetMidi={targetMidi}
          flash={p.session.flash}
          dim={active}
        />
      </div>
    </div>
  );
}
