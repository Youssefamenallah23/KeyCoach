'use client';

import { useCallback, useEffect, useState } from 'react';
import CoachPanel from '@/components/CoachPanel';
import FreePlay from '@/components/FreePlay';
import LessonBrowser from '@/components/LessonBrowser';
import MidiImport from '@/components/MidiImport';
import Onboarding from '@/components/Onboarding';
import PracticeView from '@/components/PracticeView';
import ProgressPanel from '@/components/ProgressPanel';
import ReviewPanel from '@/components/ReviewPanel';
import SettingsPanel from '@/components/SettingsPanel';
import TeacherChat from '@/components/TeacherChat';
import TopBar, { type TabId } from '@/components/TopBar';
import type { Lesson } from '@/lib/lessons';
import { useSettings } from '@/lib/settings';

/**
 * Single page shell.
 *
 *   Learn    lesson browser, practice workspace, coach plus schedule rail
 *   Songs    MIDI import, difficulty analysis, staged arrangements
 *   Free play the instrument on its own
 *   Settings layout, sound, tuning, latency calibration, privacy
 *
 * Switching tabs unmounts the practice view, which runs its cleanup, so notes are
 * released and the metronome stops instead of sounding in the background.
 */
export default function Page() {
  const [tab, setTab] = useState<TabId>('learn');
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const onboarded = useSettings((s) => s.onboarded);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  // Rehydrated stores arrive after mount, so the gate is decided client side only.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const selectLesson = useCallback((next: Lesson) => {
    setLesson(next);
    setTab('learn');
  }, []);

  const clearLesson = useCallback(() => setLesson(null), []);

  const showOnboarding = hydrated && !onboarded;

  return (
    <div className={reducedMotion ? 'motion-off' : undefined}>
      <TopBar tab={tab} onTab={setTab} />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {showOnboarding ? (
          <Onboarding onDone={() => setOnboarded(true)} />
        ) : tab === 'free' ? (
          <div className="mx-auto max-w-[1100px] space-y-4">
            <div className="panel p-4">
              <h2 className="font-display text-2xl leading-tight text-ink">Free play</h2>
              <p className="mt-1 text-[13px] text-muted">
                No clock, no scoring. Find the keys, test the layout, run the metronome at any tempo.
              </p>
            </div>
            <FreePlay />
          </div>
        ) : tab === 'songs' ? (
          <div className="mx-auto max-w-[1200px] space-y-4">
            <MidiImport onStartLesson={selectLesson} />
            <TeacherChat />
          </div>
        ) : tab === 'settings' ? (
          <div className="mx-auto max-w-[1000px]">
            <SettingsPanel />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              {lesson ? (
                <PracticeView
                  lesson={lesson}
                  onSelectLesson={selectLesson}
                  onBack={clearLesson}
                />
              ) : (
                <LessonBrowser onSelect={selectLesson} activeLessonId={null} />
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <CoachPanel onPracticeDrill={selectLesson} />
              <ReviewPanel onStartLesson={selectLesson} />
              <ProgressPanel />
            </aside>
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 pb-10 text-[11px] leading-relaxed text-muted sm:px-6">
        <p>
          KeyCoach prototype. Keyboard mapping, note detection, timing, scoring, progress, scheduled
          review, MIDI parsing and the coach are deterministic local code. Progress and preferences
          live in this browser only. A computer keyboard cannot teach velocity, key depth, finger
          independence or pedalling, so this teaches keyboard geography, timing and simple melodies.
          Lessons shipped with the app are public domain.
        </p>
      </footer>
    </div>
  );
}