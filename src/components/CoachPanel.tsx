'use client';

import { useMemo } from 'react';
import { analyzeAttempts, buildDrill, buildPracticePlan, explainWeakSpot } from '@/lib/coach';
import type { Lesson } from '@/lib/lessons';
import { noteLabel } from '@/lib/notes';
import { useProgress } from '@/lib/progress';
import { diagnoseTiming } from '@/lib/timing';

/**
 * Practice Coach. Deterministic, offline and free: this is the "Adapt" step of
 * the loop implemented with plain arithmetic rather than an LLM, which is the
 * cheap-baseline the brief asks for before spending tokens.
 */
export default function CoachPanel({
  onPracticeDrill,
}: {
  onPracticeDrill: (lesson: Lesson) => void;
}) {
  const attempts = useProgress((s) => s.attempts);

  const report = useMemo(() => analyzeAttempts(attempts), [attempts]);
  const drill = useMemo(() => buildDrill(report), [report]);
  const plan = useMemo(() => buildPracticePlan(report), [report]);

  const diagnosis = useMemo(
    () => (attempts[0] ? diagnoseTiming(attempts[0], { history: attempts.slice(1) }) : null),
    [attempts],
  );

  const hasData = attempts.length > 0;

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="label-xs">Practice coach</p>
        <span className="chip-amber">deterministic</span>
      </div>

      <p className="mt-3 text-[13px] leading-snug text-ink">{report.headline}</p>

      {diagnosis && diagnosis.measured >= 2 ? (
        <div className="mt-3 rounded-xl border border-line/60 bg-panel2/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-amber-soft">Timing, last run</span>
            <span className="flex flex-wrap gap-1.5">
              <span className="tabular font-mono text-[10px] text-muted">
                bias {diagnosis.biasMs > 0 ? '+' : ''}
                {diagnosis.biasMs} ms
              </span>
              <span className="tabular font-mono text-[10px] text-muted">
                spread {diagnosis.stdevMs} ms
              </span>
              <span className="tabular font-mono text-[10px] text-muted">
                drift {diagnosis.driftMsPerNote > 0 ? '+' : ''}
                {diagnosis.driftMsPerNote}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-ink">{diagnosis.primary.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-muted">{diagnosis.primary.fix}</p>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            The note by note timeline, the error distribution and the one click fix drill appear
            under the scores after each run.
          </p>
        </div>
      ) : null}

      {!hasData ? (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          No model, no network. This panel reads your stored attempts, ranks notes and
          transitions by error rate, then builds a drill from the worst ones and validates it
          before showing it.
        </p>
      ) : (
        <>
          <div className="mt-3 rounded-xl border border-line/60 bg-panel2/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-soft">Adaptive drill</span>
              <span className="tabular font-mono text-xs text-muted">{drill.targetBpm} BPM</span>
            </div>
            <p className="mt-1 text-[12px] text-muted">{drill.subtitle}</p>
            <div className="thin-scroll mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {drill.notes.map((n, i) => (
                <span
                  key={`${n}-${i}`}
                  className="shrink-0 rounded-md border border-line/70 bg-bg2/60 px-1.5 py-0.5 font-mono text-[11px] text-ink"
                >
                  {noteLabel(n)}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-muted">{drill.tip}</p>
            <button
              type="button"
              className="btn btn-primary mt-3 w-full py-2"
              onClick={() => onPracticeDrill(drill)}
            >
              Practice this drill
            </button>
          </div>

          {report.weakTransitions.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {report.weakTransitions.slice(0, 3).map((t) => (
                <li
                  key={`${t.from}-${t.to}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-line/50 bg-panel2/20 px-2.5 py-1.5"
                >
                  <span className="text-[12px] text-ink">{t.label}</span>
                  <span className="tabular shrink-0 font-mono text-[11px] text-wrong">
                    {t.errors}/{t.occurrences}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {report.weakTransitions.length > 0 ? (
            <p className="mt-3 text-[12px] leading-snug text-muted">
              {explainWeakSpot(report.weakTransitions[0], report.recommendedBpm)}
            </p>
          ) : null}

          <div className="mt-4">
            <p className="label-xs">Today&apos;s plan</p>
            <ul className="mt-2 space-y-1">
              {plan.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-ink">{item.label}</span>
                  <span className="tabular shrink-0 font-mono text-muted">{item.minutes} min</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}