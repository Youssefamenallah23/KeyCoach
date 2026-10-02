'use client';

import { TEMPO_RUNGS, bpmForRung, demoDurationSec, rungFor } from '@/lib/demo';
import type { Lesson } from '@/lib/lessons';
import type { PracticeMode } from '@/lib/settings';

/**
 * Practice setup: how you are about to learn this, not just what you are learning.
 *
 * Everything here exists because a beginner cannot fix a timing error they have not
 * heard. The three controls are the three things that actually move the needle:
 *
 *   Tempo ladder  you cannot learn timing at performance tempo
 *   Listen first  hear the reference, repeated, before you attempt it
 *   Mode          Listen, Echo, or Together while a quiet guide plays along
 */
export default function PracticeSetup({
  lesson,
  bpm,
  onBpm,
  listening,
  onListen,
  onStopListening,
  listens,
  onListens,
  practiceMode,
  onPracticeMode,
  locked,
}: {
  lesson: Lesson;
  bpm: number;
  onBpm: (bpm: number) => void;
  listening: boolean;
  onListen: (bpm?: number) => void;
  onStopListening: () => void;
  listens: number;
  onListens: (n: number) => void;
  practiceMode: PracticeMode;
  onPracticeMode: (mode: PracticeMode) => void;
  /** True while a scored run is in progress, so the setup is frozen. */
  locked: boolean;
}) {
  const rung = rungFor(lesson.targetBpm, bpm);

  const modes: { id: PracticeMode; label: string; blurb: string }[] = [
    { id: 'listen', label: 'Listen', blurb: 'Just hear it. No scoring at all.' },
    { id: 'echo', label: 'Echo', blurb: 'Hear it once, then play it back yourself.' },
    { id: 'together', label: 'Together', blurb: 'A quiet guide plays along in time with you.' },
  ];

  const active = modes.find((m) => m.id === practiceMode) ?? modes[1];
  const seconds = demoDurationSec(lesson, bpm) * listens;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-xs">How to learn this one</p>
        <span className="chip">
          {lesson.notes.length} notes, {bpm} BPM
        </span>
      </div>

      {/* Tempo ladder */}
      <div className="mt-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">
          Tempo. Learn it slow, then move up.
        </p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
          {TEMPO_RUNGS.map((step) => {
            const stepBpm = bpmForRung(lesson.targetBpm, step.id);
            const selected = rung === step.id;
            return (
              <button
                key={step.id}
                type="button"
                disabled={locked}
                aria-pressed={selected}
                onClick={() => onBpm(stepBpm)}
                className={[
                  'rounded-xl border px-3 py-2 text-left transition duration-150 motion-reduce:transition-none disabled:opacity-40',
                  selected
                    ? 'border-amber bg-amber/10'
                    : 'border-line/70 bg-panel2/40 hover:border-amber/50',
                ].join(' ')}
              >
                <span className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-ink">{step.label}</span>
                  <span className="tabular font-mono text-[11px] text-muted">{stepBpm} BPM</span>
                </span>
                <span className="block text-[11px] leading-tight text-muted">{step.blurb}</span>
              </button>
            );
          })}
        </div>
        {rung === 'target' && lesson.notes.length > 12 ? (
          <p className="mt-1.5 text-[11px] text-amber-soft">
            At full tempo this is a long phrase. If it falls apart, go back down a rung rather than
            pushing through it.
          </p>
        ) : null}
      </div>

      {/* LISTEN_BLOCK */}
      <div className="mt-4 rounded-xl border border-amber/30 bg-amber/[0.06] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold text-amber-soft">Hear it first</p>
            <p className="text-[11px] leading-snug text-muted">
              The melody plays with a click, so you know what right sounds like before you are
              measured against it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-line/70 bg-panel2/60 p-0.5">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={locked}
                  aria-pressed={listens === n}
                  onClick={() => onListens(n)}
                  className={[
                    'rounded-md px-2 py-1 font-mono text-[11px] font-semibold transition duration-150 motion-reduce:transition-none disabled:opacity-40',
                    listens === n ? 'bg-amber text-[#201704]' : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  x{n}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`btn py-2 ${listening ? '' : 'btn-primary'}`}
              disabled={locked}
              onClick={() => (listening ? onStopListening() : onListen(bpm))}
            >
              {listening ? 'Stop' : `Listen (${seconds}s)`}
            </button>
          </div>
        </div>

        <div className="meter-track mt-2">
          <div
            className="h-full rounded-full bg-amber transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: listening ? '100%' : '0%' }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          Listen at least twice, then set the tempo a rung down and play it back. Most people try to
          play at full speed straight away, which is the single biggest cause of bad timing.
        </p>
      </div>

      {/* Mode */}
      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wider text-muted">When you play</p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={locked}
              aria-pressed={practiceMode === mode.id}
              onClick={() => onPracticeMode(mode.id)}
              className={[
                'rounded-xl border px-3 py-2 text-left transition duration-150 motion-reduce:transition-none disabled:opacity-40',
                practiceMode === mode.id
                  ? 'border-amber bg-amber/10'
                  : 'border-line/70 bg-panel2/40 hover:border-amber/50',
              ].join(' ')}
            >
              <span className="block text-sm font-semibold text-ink">{mode.label}</span>
              <span className="block text-[11px] leading-tight text-muted">{mode.blurb}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">{active.blurb}</p>
      </div>

      <p className="mt-3 border-t border-line/50 pt-3 text-[11px] leading-snug text-muted">
        <span className="text-amber-soft">Tip: </span>
        {lesson.tip}
      </p>
    </div>
  );
}