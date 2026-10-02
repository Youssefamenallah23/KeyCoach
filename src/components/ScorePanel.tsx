'use client';

import { useSettings } from '@/lib/settings';
import { describeBandShort } from '@/lib/timing';
import { formatTiming, metricLabel, type Scores, type Verdict } from '@/lib/scoring';
import type { LiveStats } from '@/lib/practice';
import type { Lesson } from '@/lib/lessons';

/**
 * One plain sentence about timing, using only what a Scores object contains.
 * Deliberately avoids early/late wording, because a mean of absolute errors has no
 * sign. Direction comes from the diagnosis card, which has the signed data.
 */
function plainTimingSummary(scores: Scores): string | null {
  if (scores.timing === null) return null;
  if (scores.tightPct !== null && scores.tightPct >= 80) {
    return 'You are landing on the beat most of the time. That is the goal, so keep this tempo.';
  }
  if (scores.evenness !== null && scores.evenness >= 70) {
    return 'The spacing is reasonably even with a few slips. Loop it once more at the same tempo.';
  }
  if (scores.accuracy >= 90) {
    return 'The notes are right but they are landing at uneven intervals. That means the phrase is not automatic yet, so take the tempo down a rung.';
  }
  return 'Notes and timing both need work. Slow down a rung and get the notes right first.';
}

export function Stars({
  count,
  total = 5,
  className,
}: {
  count: number;
  total?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex gap-0.5 text-sm leading-none ${className ?? ''}`}
      aria-label={`${count} of ${total} stars`}
      role="img"
    >
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i < count ? 'text-amber' : 'text-line'}>
          {'\u2605'}
        </span>
      ))}
    </span>
  );
}

export function LiveScorePanel({
  stats,
  bpm,
  mode,
}: {
  stats: LiveStats;
  bpm: number;
  mode: 'patient' | 'strict';
}) {
  const pct = stats.total > 0 ? Math.round((100 * stats.index) / stats.total) : 0;

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="label-xs">Live score</span>
        <span className="chip">{mode === 'strict' ? 'metronome locked' : 'free pace'}</span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="tabular font-display text-3xl text-ink">{stats.hitRate}%</span>
        <span className="text-xs text-muted">hit rate</span>
      </div>

      <div className="meter-track mt-2">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="notes" value={`${stats.correct}/${stats.total}`} />
        <Stat label="wrong keys" value={`${stats.wrongPresses}`} />
        <Stat label="tempo" value={`${bpm}`} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/60 bg-panel2/40 px-2 py-2">
      <dt className="label-xs">{label}</dt>
      <dd className="tabular mt-1 font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}

export function ResultPanel({
  scores,
  verdict,
  lesson,
  onRetry,
  onNext,
  onBack,
  nextLessonTitle,
}: {
  scores: Scores;
  verdict: Verdict;
  lesson: Lesson;
  onRetry: () => void;
  onNext: () => void;
  onBack: () => void;
  nextLessonTitle: string | null;
}) {
  const preferNumbers = useSettings((s) => s.timingDisplay) === 'numbers';
  const plainTiming = plainTimingSummary(scores);

  return (
    <div className="panel animate-rise p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-xs">Result</p>
          <h3 className="mt-1 font-display text-2xl leading-tight text-ink">{lesson.title}</h3>
        </div>
        <div className="text-right">
          <p className="tabular font-display text-4xl leading-none text-amber">{scores.overall}</p>
          <p className="label-xs mt-1">overall</p>
        </div>
      </div>

      {plainTiming ? (
        <p className="mt-3 rounded-xl border border-line/60 bg-panel2/30 px-3 py-2 text-[13px] leading-snug text-ink">
          <span className="text-amber-soft">In plain words: </span>
          {plainTiming}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        <MetricRow label="Accuracy" value={metricLabel(scores.accuracy)} stars={scores.stars.accuracy} />
        <MetricRow
          label="Timing"
          value={scores.timing === null ? 'not measured' : metricLabel(scores.timing)}
          stars={scores.stars.timing}
        />
        <MetricRow
          label="Speed"
          value={scores.speed === null ? 'not measured' : metricLabel(scores.speed)}
          stars={scores.stars.speed}
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat
          label="mean error"
          value={
            preferNumbers
              ? formatTiming(scores.meanAbsTiming)
              : scores.meanAbsTiming === null
                ? 'n/a'
                : describeBandShort(scores.meanAbsTiming, false)
          }
        />
        <Stat label="within 100ms" value={metricLabel(scores.tightPct)} />
        <Stat label="evenness" value={metricLabel(scores.evenness)} />
      </dl>

      <div className="mt-4 rounded-xl border border-amber/30 bg-amber/[0.06] p-3">
        <p className="font-display text-base text-amber-soft">{verdict.headline}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">{verdict.detail}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Play again
        </button>
        {nextLessonTitle ? (
          <button type="button" className="btn" onClick={onNext}>
            Next: {nextLessonTitle}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          All lessons
        </button>
      </div>
    </div>
  );
}

function MetricRow({ label, value, stars }: { label: string; value: string; stars: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line/60 bg-panel2/30 px-3 py-2">
      <span className="text-sm text-ink">{label}</span>
      <span className="flex items-center gap-3">
        <Stars count={stars} />
        <span className="tabular w-20 text-right font-mono text-sm text-muted">{value}</span>
      </span>
    </div>
  );
}