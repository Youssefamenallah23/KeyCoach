'use client';

import { useEffect, useMemo, useRef } from 'react';
import { noteName, noteOctave } from '@/lib/notes';
import { describeBandShort } from '@/lib/timing';
import type { PracticeSession } from '@/lib/practice';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import { useSettings } from '@/lib/settings';

/**
 * The scrolling note timeline: this is the "sheet music" for a keyboard-only
 * learner.
 *
 * Every chip carries both halves of the instruction, which is the fix for "the
 * keys are not like the beats": the note name and beat number say what to play and
 * when, and the keycap legend says which key on *your* keyboard plays it. On an
 * AZERTY board that legend reads Q S D F G H J K L, not A S D F G H J K L.
 */
export default function NoteStrip({
  session,
  demoIndex = null,
}: {
  session: PracticeSession;
  /** Set while a demo is playing, so the strip follows the demonstration. */
  demoIndex?: number | null;
}) {
  const currentRef = useRef<HTMLDivElement | null>(null);
  const { labelForMidi } = useKeyboardLayout();
  const preferNumbers = useSettings((s) => s.timingDisplay) === 'numbers';

  const running = session.phase === 'running' || session.phase === 'countin';

  const beatNumbers = useMemo(
    () => session.cum.map((c) => Math.floor(c) + 1),
    [session.cum],
  );

  useEffect(() => {
    currentRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [session.index, session.lesson.id, demoIndex]);

  return (
    <div>
      <div className="thin-scroll flex gap-2 overflow-x-auto pb-2">
        {session.outcomes.map((o) => {
          const isCurrent = running && o.index === session.index;
          const isDemo = demoIndex === o.index;
          const done = o.status === 'correct';
          const skipped = o.status === 'skipped';
          const legend = labelForMidi(o.expected);

          const tone = done
            ? 'border-correct/45 bg-correct/10 text-correct'
            : skipped
              ? 'border-wrong/45 bg-wrong/10 text-wrong'
              : isCurrent || isDemo
                ? 'border-amber bg-amber/15 text-ink ring-1 ring-amber/60'
                : 'border-line/70 bg-panel2/40 text-muted';

          return (
            <div
              key={o.index}
              ref={isCurrent || isDemo ? currentRef : undefined}
              className={[
                'flex min-w-[68px] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2.5 py-2',
                'transition-colors duration-200 motion-reduce:transition-none',
                tone,
                isCurrent ? 'animate-soft-pulse motion-reduce:animate-none' : '',
              ].join(' ')}
            >
              <span className="font-display text-xl leading-none">
                {noteName(o.expected)}
                <span className="align-top text-[10px] text-current/70">
                  {noteOctave(o.expected)}
                </span>
              </span>

              {legend ? (
                <span
                  className={[
                    'rounded-md px-1.5 font-mono text-[11px] font-bold',
                    isCurrent || isDemo
                      ? 'bg-amber text-[#201704]'
                      : done || skipped
                        ? 'bg-black/20 text-current'
                        : 'bg-black/25 text-ink/80',
                  ].join(' ')}
                >
                  {legend}
                </span>
              ) : null}

              <span className="tabular text-[9px] font-semibold uppercase tracking-wider opacity-70">
                beat {beatNumbers[o.index]}
              </span>
              <span className="tabular text-[9px] font-semibold opacity-80">
                {done && o.timingMs !== null
                  ? describeBandShort(o.timingMs, preferNumbers)
                  : skipped
                    ? 'missed'
                    : '\u00a0'}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-1 text-[11px] leading-snug text-muted">
        Each chip shows the note, the key to press on your own keyboard, and its beat.
      </p>
    </div>
  );
}