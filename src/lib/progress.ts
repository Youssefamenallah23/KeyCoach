/**
 * Progress store: the persistent side of the loop.
 *
 * The brief plans Supabase + PostgreSQL. For the prototype the same shape is
 * kept in localStorage through Zustand's persist middleware, so swapping in a
 * server adapter later is a change of transport, not of data model.
 *
 * `skipHydration` is on so the server render and the first client render agree;
 * the store is rehydrated from an effect in `StoreHydrator`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LESSONS, type LessonCategory } from './lessons';
import type { Stars } from './scoring';

export type OutcomeStatus = 'correct' | 'skipped';

export interface OutcomeRecord {
  index: number;
  expected: number;
  played: number | null;
  status: OutcomeStatus;
  timingMs: number | null;
}

export interface AttemptRecord {
  id: string;
  lessonId: string;
  lessonTitle: string;
  category: LessonCategory;
  mode: 'patient' | 'strict';
  /** Epoch ms. */
  at: number;
  targetBpm: number;
  total: number;
  correct: number;
  skipped: number;
  wrongPresses: number;
  accuracy: number;
  timing: number | null;
  speed: number | null;
  overall: number;
  stars: Stars;
  durationMs: number;
  /** Beat grid of the exercise, so timing can be reconstructed per note later. */
  beats?: number[];
  outcomes: OutcomeRecord[];
}

export interface LessonBest {
  lessonId: string;
  overall: number;
  accuracy: number;
  timing: number | null;
  speed: number | null;
  stars: Stars;
  attempts: number;
  at: number;
}

export interface DayStat {
  notes: number;
  attempts: number;
}

interface ProgressState {
  attempts: AttemptRecord[];
  best: Record<string, LessonBest>;
  xp: number;
  days: Record<string, DayStat>;
  recordAttempt: (a: AttemptRecord) => void;
  reset: () => void;
}

const MAX_ATTEMPTS = 40;

/** Retention target surfaced on the Today card. */
export const DAILY_NOTE_GOAL = 30;

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function xpForAttempt(a: AttemptRecord): number {
  const base = 5 + Math.round(a.overall / 8) + a.total * 2;
  const timingBonus = a.stars.timing >= 4 ? 5 : 0;
  return base + timingBonus;
}

export function levelFromXp(xp: number): { level: number; into: number; span: number } {
  const span = 250;
  return { level: 1 + Math.floor(xp / span), into: xp % span, span };
}

/**
 * Consecutive practice days, counting back from today (or yesterday, if the
 * learner has not practised yet today).
 */
export function computeStreak(days: Record<string, DayStat>): number {
  const cursor = new Date();
  const practised = (d: Date) => (days[dayKey(d)]?.attempts ?? 0) > 0;
  if (!practised(cursor)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (practised(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Average best score per category, for the progress tree. */
export function categoryProgress(
  best: Record<string, LessonBest>,
): Record<LessonCategory, number> {
  const out: Record<LessonCategory, number> = {
    notes: 0,
    scales: 0,
    rhythm: 0,
    songs: 0,
  };
  (Object.keys(out) as LessonCategory[]).forEach((cat) => {
    const lessons = LESSONS.filter((l) => l.category === cat);
    if (lessons.length === 0) return;
    const sum = lessons.reduce((acc, l) => acc + (best[l.id]?.overall ?? 0), 0);
    out[cat] = Math.round(sum / lessons.length);
  });
  return out;
}

/** Lessons with no attempt yet, so the browser can suggest a next step. */
export function nextUnplayedLesson(best: Record<string, LessonBest>): string | null {
  const found = LESSONS.find((l) => !best[l.id]);
  return found ? found.id : null;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      attempts: [],
      best: {},
      xp: 0,
      days: {},

      recordAttempt: (a) =>
        set((state) => {
          const attempts = [a, ...state.attempts].slice(0, MAX_ATTEMPTS);

          const prev = state.best[a.lessonId];
          const improved = !prev || a.overall > prev.overall;
          const nextBest: LessonBest = prev
            ? {
                lessonId: a.lessonId,
                overall: Math.max(prev.overall, a.overall),
                accuracy: Math.max(prev.accuracy, a.accuracy),
                timing: pickBestNullable(prev.timing, a.timing),
                speed: pickBestNullable(prev.speed, a.speed),
                stars: improved ? a.stars : prev.stars,
                attempts: prev.attempts + 1,
                at: improved ? a.at : prev.at,
              }
            : {
                lessonId: a.lessonId,
                overall: a.overall,
                accuracy: a.accuracy,
                timing: a.timing,
                speed: a.speed,
                stars: a.stars,
                attempts: 1,
                at: a.at,
              };

          const key = dayKey(new Date(a.at));
          const day = state.days[key] ?? { notes: 0, attempts: 0 };

          return {
            attempts,
            best: { ...state.best, [a.lessonId]: nextBest },
            xp: state.xp + xpForAttempt(a),
            days: {
              ...state.days,
              [key]: { notes: day.notes + a.correct, attempts: day.attempts + 1 },
            },
          };
        }),

      reset: () => set({ attempts: [], best: {}, xp: 0, days: {} }),
    }),
    {
      name: 'keycoach.progress.v2',
      version: 2,
      skipHydration: true,
    },
  ),
);

function pickBestNullable(prev: number | null, next: number | null): number | null {
  if (prev === null) return next;
  if (next === null) return prev;
  return Math.max(prev, next);
}