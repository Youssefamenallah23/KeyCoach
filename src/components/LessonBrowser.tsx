'use client';

import { useMemo } from 'react';
import {
  CATEGORY_META,
  REFERENCE_SONGS,
  allPlayableLessons,
  type Lesson,
} from '@/lib/lessons';
import { noteName } from '@/lib/notes';
import { nextUnplayedLesson, useProgress } from '@/lib/progress';
import { useSettings } from '@/lib/settings';
import { Stars } from './ScorePanel';

function previewNotes(lesson: Lesson): string {
  const letters = lesson.notes.map((n) => noteName(n));
  const joined = letters.join(' ');
  return joined.length > 26 ? `${joined.slice(0, 26)}\u2026` : joined;
}

export default function LessonBrowser({
  onSelect,
  activeLessonId,
}: {
  onSelect: (lesson: Lesson) => void;
  activeLessonId?: string | null;
}) {
  const best = useProgress((s) => s.best);
  const nextId = nextUnplayedLesson(best);
  const showReference = useSettings((s) => s.showReferenceSongs);
  const setShowReference = useSettings((s) => s.setShowReferenceSongs);

  const lessons = useMemo(() => allPlayableLessons(false), []);
  const referenceSongs = useMemo(() => REFERENCE_SONGS, []);

  const groups = [
    ...CATEGORY_META.filter((c) => c.id !== 'songs'),
    ...CATEGORY_META.filter((c) => c.id === 'songs'),
  ];

  return (
    <div className="space-y-6">
      <div className="panel p-4">
        <p className="label-xs">Start here</p>
        <h2 className="mt-1 font-display text-2xl leading-tight text-ink">
          A piano teacher that runs on your computer keyboard.
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
          Your keyboard is the instrument. Press Listen to hear a phrase before you play it, choose a
          tempo you can actually hold, then let the app measure what happened. Nothing to install and
          no MIDI keyboard required.
        </p>
      </div>

      {groups.map((cat) => {
        const catLessons = lessons.filter((l) => l.category === cat.id);
        return (
          <section key={cat.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg text-ink">{cat.label}</h3>
              <span className="label-xs">{cat.blurb}</span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catLessons.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  record={best[lesson.id]}
                  isNext={lesson.id === nextId}
                  isActive={lesson.id === activeLessonId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-ink">Reference arrangements</h3>
          <button
            type="button"
            className="btn py-1.5 text-xs"
            onClick={() => setShowReference(!showReference)}
            aria-pressed={showReference}
          >
            {showReference ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted">
          These are still in copyright. They are not part of the default catalogue, and they are
          excluded from your schedule, the coach and the experiment. They are simplified single-hand
          reductions for private study, not transcriptions. If you ever ship this commercially, get a
          licence or delete them.
        </p>
        {showReference ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {referenceSongs.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                record={best[lesson.id]}
                isNext={false}
                isActive={lesson.id === activeLessonId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </section>

      <p className="text-[11px] leading-relaxed text-muted">
        Every other melody here is out of copyright. Nothing else is a copyrighted arrangement.
      </p>
    </div>
  );
}

function LessonCard({
  lesson,
  record,
  isNext,
  isActive,
  onSelect,
}: {
  lesson: Lesson;
  record: { stars: { accuracy: number }; overall: number } | undefined;
  isNext: boolean;
  isActive: boolean;
  onSelect: (lesson: Lesson) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(lesson)}
      className={[
        'panel group flex h-full flex-col items-start gap-2 p-4 text-left transition duration-150 motion-reduce:transition-none',
        'hover:border-amber/50 hover:bg-panel2/60',
        isActive ? 'border-amber/70' : '',
      ].join(' ')}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="font-display text-base leading-tight text-ink">{lesson.title}</span>
        {isNext ? <span className="chip-amber">next</span> : null}
      </div>

      <span className="text-[12px] text-muted">{lesson.subtitle}</span>

      <span className="tabular font-mono text-[11px] text-amber-soft">
        {previewNotes(lesson)}
      </span>

      <div className="mt-auto flex w-full items-center justify-between gap-2 pt-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="chip">{lesson.targetBpm} bpm</span>
          {lesson.grade ? <span className="chip">grade {lesson.grade}</span> : null}
          {lesson.range ? <span className="chip">{lesson.range}</span> : null}
        </span>
        {record ? (
          <span className="flex items-center gap-2">
            <Stars count={record.stars.accuracy} />
            <span className="tabular font-mono text-xs text-muted">{record.overall}</span>
          </span>
        ) : (
          <span className="label-xs">not played</span>
        )}
      </div>
    </button>
  );
}