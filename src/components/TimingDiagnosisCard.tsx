'use client';

import { useMemo } from 'react';
import type { Lesson } from '@/lib/lessons';
import { biasTrend, describeRun, diagnoseTiming, timingFixLesson, type TimingDiagnosis } from '@/lib/timing';
import { describeBandShort } from '@/lib/timing';
import type { AttemptRecord } from '@/lib/progress';
import { useSettings } from '@/lib/settings';

/** Consistency in words, so a beginner is not asked to interpret a standard deviation. */
function spreadWords(stdevMs: number): string {
  if (stdevMs <= 45) return 'very even';
  if (stdevMs <= 90) return 'even';
  if (stdevMs <= 150) return 'a bit uneven';
  return 'scattered';
}

/** Drift in words: is the phrase getting faster or slower as it goes? */
function driftWords(driftTotalMs: number): string {
  if (Math.abs(driftTotalMs) < 60) return 'steady';
  if (driftTotalMs > 0) return `slowing ${Math.round(driftTotalMs)}ms`;
  return `speeding ${Math.abs(Math.round(driftTotalMs))}ms`;
}

/**
 * Timing diagnosis, shown rather than asserted.
 *
 * The whole point of this card is to answer "why is my timing bad" with something
 * you can look at: a two lane view where the top lane is where the beat was and
 * the bottom lane is where you actually played, plus the distribution of your
 * errors and the bias marked on it. The prose underneath says which pattern it
 * found and what to do about it.
 */
export default function TimingDiagnosisCard({
  attempt,
  history = [],
  onPracticeFix,
}: {
  attempt: AttemptRecord;
  history?: AttemptRecord[];
  onPracticeFix?: (lesson: Lesson) => void;
}) {
  const diagnosis = useMemo(() => diagnoseTiming(attempt, { history }), [attempt, history]);
  const fix = useMemo(() => timingFixLesson(attempt, diagnosis), [attempt, diagnosis]);
  const trend = useMemo(() => biasTrend(history.length > 0 ? history : [attempt]), [attempt, history]);
  const preferNumbers = useSettings((s) => s.timingDisplay) === 'numbers';

  if (diagnosis.measured < 2) {
    return (
      <div className="panel p-4">
        <p className="label-xs">Timing diagnosis</p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Only {diagnosis.measured} note{diagnosis.measured === 1 ? '' : 's'} could be measured on
          this run, so there is not enough to point at a pattern. Play a rhythm drill, or any lesson
          to the end, and this fills in with your actual errors per note.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="label-xs">Timing diagnosis</p>
          <h3 className="mt-1 font-display text-lg leading-tight text-ink">
            {diagnosis.primary.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={diagnosis.primary.severity >= 50 ? 'chip-amber' : 'chip'}>
            severity {diagnosis.primary.severity}
          </span>
          <span className="chip">{diagnosis.mode === 'strict' ? 'metronome' : 'free pace'}</span>
        </div>
      </div>

      <p className="mt-3 rounded-xl border border-amber/25 bg-amber/[0.06] px-3 py-2 text-[13px] leading-snug text-ink">
        {describeRun(diagnosis.biasMs, diagnosis.stdevMs, diagnosis.onTimePct)}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="bias"
          value={
            preferNumbers
              ? `${diagnosis.biasMs > 0 ? '+' : ''}${diagnosis.biasMs} ms`
              : describeBandShort(diagnosis.biasMs, false)
          }
          hint={diagnosis.biasMs > 20 ? 'tending late' : diagnosis.biasMs < -20 ? 'tending early' : 'centred'}
        />
        <Stat
          label="spread"
          value={preferNumbers ? `${diagnosis.stdevMs} ms` : spreadWords(diagnosis.stdevMs)}
          hint="consistency"
        />
        <Stat
          label="drift"
          value={
            preferNumbers
              ? `${diagnosis.driftMsPerNote > 0 ? '+' : ''}${diagnosis.driftMsPerNote}`
              : driftWords(diagnosis.driftTotalMs)
          }
          hint="across the phrase"
        />
        <Stat label="on time" value={`${diagnosis.onTimePct}%`} hint="within 60 ms" />
      </dl>

      <TimingTimeline diagnosis={diagnosis} />

      <Histogram diagnosis={diagnosis} />

      {trend.length >= 2 ? <Trend trend={trend} /> : null}

      <div className="mt-3 space-y-2">
        {diagnosis.findings.map((finding) => (
          <div
            key={finding.id}
            className="rounded-xl border border-line/60 bg-panel2/30 p-3"
          >
            <p className="text-[13px] font-semibold text-amber-soft">{finding.title}</p>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              <span className="text-ink">What I measured: </span>
              {finding.evidence}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              <span className="text-ink">Why: </span>
              {finding.cause}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              <span className="text-ink">Fix: </span>
              {finding.fix}
            </p>
          </div>
        ))}
      </div>

      {diagnosis.consistentBias ? (
        <p className="mt-3 rounded-xl border border-amber/30 bg-amber/[0.06] px-3 py-2 text-[12px] leading-snug text-muted">
          <span className="text-amber-soft">This bias is not a bad run. </span>
          The same offset of about {diagnosis.biasMs} ms appears across your recent attempts. Part of
          it is almost certainly device latency that the automatic compensation did not fully remove.
          Settings, Timing, then raise the manual offset by roughly {Math.abs(diagnosis.biasMs)} ms.
        </p>
      ) : null}

      {onPracticeFix ? (
        <button type="button" className="btn btn-primary mt-3 py-2" onClick={() => onPracticeFix(fix)}>
          Practise this fix at {fix.targetBpm} BPM
        </button>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line/60 bg-panel2/40 px-2.5 py-2">
      <dt className="label-xs">{label}</dt>
      <dd className="tabular mt-1 font-mono text-sm text-ink">{value}</dd>
      <dd className="text-[10px] text-muted">{hint}</dd>
    </div>
  );
}

// TIMING_CARD_CHARTS

/**
 * Two lane view. Top lane is where the beat was, bottom lane is where the note
 * actually landed. The gap between them is the error, drawn to scale.
 */
function TimingTimeline({ diagnosis }: { diagnosis: TimingDiagnosis }) {
  const { samples } = diagnosis;
  const maxMs = Math.max(
    1,
    ...samples.map((s) => Math.max(s.expectedMs, s.actualMs)),
  );
  const pct = (ms: number) => `${(100 * Math.max(0, ms)) / maxMs}%`;

  return (
    <div className="mt-4 rounded-xl border border-line/60 bg-bg2/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted">What happened, note by note</p>
        <span className="text-[10px] text-muted">0 to {(maxMs / 1000).toFixed(1)} s</span>
      </div>

      <div className="relative mt-3 h-[74px]">
        {/* Beat lane */}
        <span className="absolute inset-x-0 top-0 text-[10px] uppercase tracking-wider text-muted">
          the beat
        </span>
        {samples.map((s) => (
          <span
            key={`b-${s.index}`}
            aria-hidden="true"
            className="absolute top-[14px] h-[22px] w-px bg-amber/70"
            style={{ left: pct(s.expectedMs) }}
          />
        ))}

        {/* Connector: the size of the error */}
        {samples.map((s) => {
          const a = (100 * Math.max(0, s.expectedMs)) / maxMs;
          const b = (100 * Math.max(0, s.actualMs)) / maxMs;
          return (
            <span
              key={`c-${s.index}`}
              aria-hidden="true"
              className={[
                'absolute top-[45px] h-[2px]',
                s.severity === 'off'
                  ? s.errorMs > 0
                    ? 'bg-wrong/80'
                    : 'bg-water/80'
                  : s.severity === 'close'
                    ? 'bg-amber/70'
                    : 'bg-correct/70',
              ].join(' ')}
              style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` }}
            />
          );
        })}

        {/* Player lane */}
        <span className="absolute inset-x-0 top-[50px] text-[10px] uppercase tracking-wider text-muted">
          you
        </span>
        {samples.map((s) => (
          <span
            key={`p-${s.index}`}
            title={`${s.label}: ${s.errorMs > 0 ? '+' : ''}${Math.round(s.errorMs)} ms`}
            className={[
              'absolute top-[64px] h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-1',
              s.severity === 'on-time'
                ? 'bg-correct ring-correct/40'
                : s.severity === 'close'
                  ? 'bg-amber ring-amber/40'
                  : s.errorMs > 0
                    ? 'bg-wrong ring-wrong/40'
                    : 'bg-water ring-water/40',
            ].join(' ')}
            style={{ left: pct(s.actualMs) }}
          />
        ))}
      </div>

      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-correct align-middle" />
          within 60 ms
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber align-middle" />
          within 120 ms
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-wrong align-middle" />
          late
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-water align-middle" />
          early
        </span>
      </div>

      <div className="thin-scroll mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {samples.map((s) => (
          <span
            key={`t-${s.index}`}
            className={[
              'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px]',
              s.severity === 'on-time'
                ? 'border-correct/40 text-correct'
                : s.severity === 'close'
                  ? 'border-amber/40 text-amber-soft'
                  : s.errorMs > 0
                    ? 'border-wrong/40 text-wrong'
                    : 'border-water/40 text-water',
            ].join(' ')}
          >
            {s.label} {s.errorMs > 0 ? '+' : ''}
            {Math.round(s.errorMs)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- histogram */

function Histogram({ diagnosis }: { diagnosis: TimingDiagnosis }) {
  const bins = diagnosis.histogram;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const span = Math.max(1, Math.abs(bins[0]?.fromMs ?? 320));
  const meanLeft = Math.min(100, Math.max(0, ((diagnosis.biasMs + span) / (span * 2)) * 100));

  return (
    <div className="mt-3 rounded-xl border border-line/60 bg-bg2/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted">How your errors are spread</p>
        <span className="text-[10px] text-muted">early &larr; on time &rarr; late</span>
      </div>

      <div className="relative mt-3 h-24">
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-[2px] bg-amber-soft"
          style={{ left: `${meanLeft}%` }}
          title={`mean ${diagnosis.biasMs} ms`}
        />
        <div className="flex h-full items-end gap-[3px]">
          {bins.map((bin, i) => {
            const centre = (bin.fromMs + bin.toMs) / 2;
            const abs = Math.abs(centre);
            const tone =
              abs <= 60
                ? 'bg-correct/80'
                : abs <= 120
                  ? 'bg-amber/80'
                  : centre > 0
                    ? 'bg-wrong/75'
                    : 'bg-water/75';
            return (
              <div
                key={`${bin.fromMs}-${i}`}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${Math.round(bin.fromMs)} to ${Math.round(bin.toMs)} ms: ${bin.count}`}
              >
                <div
                  className={`w-full rounded-t-[3px] ${tone}`}
                  style={{ height: `${bin.count === 0 ? 2 : (100 * bin.count) / maxCount}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>-{span} ms</span>
        <span>0</span>
        <span>+{span} ms</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        The amber line is your mean error at{' '}
        <span className="font-mono text-amber-soft">{diagnosis.biasMs} ms</span>. A tight cluster
        near zero is good. A cluster off to one side is a shift, not a scramble.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- bias trend */

function Trend({
  trend,
}: {
  trend: { at: number; lessonTitle: string; biasMs: number; stdevMs: number }[];
}) {
  const maxAbs = Math.max(80, ...trend.map((t) => Math.abs(t.biasMs)));

  return (
    <div className="mt-3 rounded-xl border border-line/60 bg-bg2/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted">Bias across your runs</p>
        <span className="text-[10px] text-muted">oldest to newest</span>
      </div>
      <div className="relative mt-3 h-20">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div className="flex h-full items-stretch gap-1">
          {trend.map((point, i) => {
            const height = (100 * Math.abs(point.biasMs)) / (maxAbs * 2);
            const late = point.biasMs >= 0;
            return (
              <div
                key={`${point.at}-${i}`}
                className="relative flex-1"
                title={`${point.lessonTitle}: bias ${point.biasMs} ms, spread ${point.stdevMs} ms`}
              >
                <span
                  className={`absolute left-0 right-0 ${late ? 'bg-wrong/70' : 'bg-water/70'}`}
                  style={
                    late
                      ? { top: `${50 - height}%`, height: `${height}%` }
                      : { top: '50%', height: `${height}%` }
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>early</span>
        <span>&plusmn;{Math.round(maxAbs)} ms</span>
        <span>late</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Bars above the line are you running late, below are running early. If every bar leans the
        same way, the problem is a shift you can calibrate rather than a skill gap.
      </p>
    </div>
  );
}
