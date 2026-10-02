'use client';

import { CATEGORY_META, LESSONS, type Lesson } from '@/lib/lessons';
import {
  DAILY_NOTE_GOAL,
  categoryProgress,
  computeStreak,
  dayKey,
  levelFromXp,
  useProgress,
} from '@/lib/progress';

/**
 * Progress tree (Notes / Scales / Rhythm / Songs), XP, level, streak and the
 * daily note goal. This is the only component that reads persisted state, and
 * the store rehydrates after mount, so nothing here can cause a hydration
 * mismatch.
 */
export default function ProgressPanel() {
  const best = useProgress((s) => s.best);
  const xp = useProgress((s) => s.xp);
  const days = useProgress((s) => s.days);
  const attempts = useProgress((s) => s.attempts);

  const streak = computeStreak(days);
  const level = levelFromXp(xp);
  const progress = categoryProgress(best);
  const today = days[dayKey()] ?? { notes: 0, attempts: 0 };
  const goalPct = Math.min(100, Math.round((100 * today.notes) / DAILY_NOTE_GOAL));

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="label-xs">Today</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="tabular font-display text-2xl text-ink">{today.notes}</span>
              <span className="text-xs text-muted">/ {DAILY_NOTE_GOAL} notes</span>
            </p>
          </div>
          <div className="text-right">
            <p className="label-xs">Streak</p>
            <p className="mt-1 font-display text-2xl text-amber">
              {streak}
              <span className="ml-1 text-xs text-muted">day{streak === 1 ? '' : 's'}</span>
            </p>
          </div>
        </div>

        <div className="meter-track mt-3">
          <div className="meter-fill" style={{ width: `${goalPct}%` }} />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            Level <span className="font-mono text-ink">{level.level}</span>
          </span>
          <span className="tabular font-mono">
            {level.into}/{level.span} xp
          </span>
          <span>
            <span className="font-mono text-ink">{attempts.length}</span> runs logged
          </span>
        </div>
      </div>

      <div className="panel p-4">
        <p className="label-xs">Progress</p>
        <ul className="mt-3 space-y-3">
          {CATEGORY_META.map((cat, i) => {
            const value = progress[cat.id];
            const total = LESSONS.filter((l: Lesson) => l.category === cat.id).length;
            const isLast = i === CATEGORY_META.length - 1;
            return (
              <li key={cat.id}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{isLast ? '\u2514\u2500' : '\u251c\u2500'}</span>
                  <span className="flex-1 text-sm text-ink">{cat.label}</span>
                  <span className="tabular font-mono text-xs text-muted">{value}%</span>
                </div>
                <div className="meter-track ml-5 mt-1.5" style={{ width: 'calc(100% - 1.25rem)' }}>
                  <div className="meter-fill" style={{ width: `${value}%` }} />
                </div>
                <p className="ml-5 mt-1 text-[11px] text-muted">
                  {cat.blurb} <span className="opacity-60">({total} lessons)</span>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}