'use client';

import { useMemo } from 'react';
import type { Lesson } from '@/lib/lessons';
import { useProgress } from '@/lib/progress';
import {
  MASTERY,
  buildInterleavedReview,
  buildMastery,
  dueForReview,
  nextLessonToLearn,
  scheduleAdvice,
} from '@/lib/schedule';

/**
 * Review queue and mastery board.
 *
 * This is where the spaced repetition and interleaving built in `lib/schedule.ts`
 * become visible: what is due, how well it is held, and a one-click interleaved
 * review that mixes the due material instead of replaying it blocked.
 */
export default function ReviewPanel({
  onStartLesson,
}: {
  onStartLesson: (lesson: Lesson) => void;
}) {
  const best = useProgress((s) => s.best);
  const attempts = useProgress((s) => s.attempts);

  const now = Date.now();
  const mastery = useMemo(() => buildMastery(best, attempts, now), [attempts, best, now]);
  const due = useMemo(() => dueForReview(mastery), [mastery]);
  const review = useMemo(() => buildInterleavedReview(due, now), [due, now]);
  const nextLesson = useMemo(() => nextLessonToLearn(mastery), [mastery]);
  const advice = useMemo(() => scheduleAdvice(mastery, due), [due, mastery]);

  const studied = mastery.filter((m) => m.attempts > 0);
  const masteredCount = mastery.filter((m) => m.mastered).length;

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="label-xs">Schedule</p>
        <span className="chip">
          {masteredCount}/{mastery.length} mastered
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-ink">{advice}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {review ? (
          <button
            type="button"
            className="btn btn-primary py-2"
            onClick={() => onStartLesson(review)}
          >
            Start mixed review ({due.length})
          </button>
        ) : null}
        {nextLesson ? (
          <button type="button" className="btn py-2" onClick={() => onStartLesson(nextLesson)}>
            Learn: {nextLesson.title}
          </button>
        ) : null}
      </div>

      {studied.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {studied
            .sort((a, b) => a.retention - b.retention)
            .slice(0, 6)
            .map((m) => {
              const pct = Math.round(m.retention * 100);
              return (
                <li key={m.lessonId}>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate text-ink">
                      {m.mastered ? '\u2713 ' : ''}
                      {m.lessonTitle}
                    </span>
                    <span
                      className={`tabular shrink-0 font-mono ${m.overdue ? 'text-wrong' : 'text-muted'}`}
                    >
                      {m.overdue ? 'due now' : `${pct}%`}
                    </span>
                  </div>
                  <div className="meter-track mt-1">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
                        m.overdue ? 'bg-wrong' : 'bg-amber'
                      }`}
                      style={{ width: `${Math.max(3, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Nothing studied yet. Play a lesson and it will be tracked here with a retention estimate and
          a review date. A lesson is mastered at {MASTERY.accuracy} percent accuracy,{' '}
          {MASTERY.timing} percent timing and {MASTERY.overall} percent overall.
        </p>
      )}
    </div>
  );
}