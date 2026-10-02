'use client';

import { useMemo } from 'react';
import FeedbackBar from './FeedbackBar';
import NoteStrip from './NoteStrip';
import PianoKeyboard from './PianoKeyboard';
import { LiveScorePanel, ResultPanel } from './ScorePanel';
import { usePractice } from '@/hooks/usePractice';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import PracticeSetup from './PracticeSetup';
import TimingDiagnosisCard from './TimingDiagnosisCard';
import { LESSONS, type Lesson } from '@/lib/lessons';
import { noteLabel } from '@/lib/notes';
import { useProgress } from '@/lib/progress';
import { useSettings } from '@/lib/settings';

export default function PracticeView({
  lesson,
  onSelectLesson,
  onBack,
}: {
  lesson: Lesson;
  onSelectLesson: (lesson: Lesson) => void;
  onBack: () => void;
}) {
  const p = usePractice(lesson);
  const { session, phase, result, stats, countIn, bpm, metronomeOn } = p;
  const { effectiveLayout, exact: exactLayout } = useKeyboardLayout();
  const showKeyHints = useSettings((s) => s.showKeyHints);
  const showNoteNames = useSettings((s) => s.showNoteNames);
  const attempts = useProgress((s) => s.attempts);

  const active = phase === 'countin' || phase === 'running';
  const cursor = active ? session.index : 0;

  const targetMidi = useMemo(() => {
    if (phase === 'finished') return null;
    return session.outcomes[cursor]?.expected ?? null;
  }, [cursor, phase, session.outcomes]);

  const upcoming = useMemo(() => {
    const map: Record<number, number> = {};
    for (let i = cursor + 1; i < Math.min(cursor + 6, session.outcomes.length); i += 1) {
      const o = session.outcomes[i];
      map[o.expected] = Math.floor(session.cum[o.index]) + 1;
    }
    return map;
  }, [cursor, session.cum, session.outcomes]);

  const targetBeat = useMemo(
    () => (targetMidi === null ? null : Math.floor(session.cum[cursor]) + 1),
    [cursor, session.cum, targetMidi],
  );

  const nextLesson = useMemo(() => {
    if (lesson.generated) return null;
    const idx = LESSONS.findIndex((l) => l.id === lesson.id);
    if (idx < 0 || idx + 1 >= LESSONS.length) return null;
    return LESSONS[idx + 1];
  }, [lesson]);

  const isStrict = session.lesson.mode === 'strict';
  const listensOnly = p.practiceMode === 'listen';

  // While a demo is sounding, the keyboard should follow the demo, not the score.
  const demoMidi =
    p.demoIndex !== null ? (session.outcomes[p.demoIndex]?.expected ?? null) : null;
  const highlightMidi = p.listening ? demoMidi : targetMidi;

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              className="btn btn-ghost -ml-2 px-2 py-1 text-xs"
              onClick={onBack}
            >
              &larr; All lessons
            </button>
            <h2 className="mt-1 font-display text-2xl leading-tight text-ink">{lesson.title}</h2>
            <p className="text-[13px] text-muted">{lesson.subtitle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="chip">{lesson.category}</span>
              <span className="chip-amber">{isStrict ? 'metronome locked' : 'free pace'}</span>
              <span className="chip">{session.outcomes.length} notes</span>
              {lesson.range ? <span className="chip">{lesson.range}</span> : null}
              {lesson.generated ? <span className="chip">coach drill</span> : null}
              {p.practiceMode === 'together' && p.guiding ? (
                <span className="chip-amber">guide playing</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              <label className="label-xs" htmlFor="bpm-range">
                Tempo
              </label>
              <input
                id="bpm-range"
                type="range"
                min={40}
                max={200}
                step={2}
                value={bpm}
                onChange={(e) => p.setBpm(Number(e.target.value))}
                disabled={active}
                className="h-1 w-36 accent-[#e9b055] disabled:opacity-40"
              />
              <span className="tabular w-16 font-mono text-sm text-ink">{bpm} BPM</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="label-xs">Metronome</span>
              {isStrict || p.practiceMode === 'together' ? (
                <span className="chip-amber">forced on</span>
              ) : (
                <button
                  type="button"
                  className={`btn px-3 py-1.5 ${metronomeOn ? 'btn-primary' : ''}`}
                  onClick={() => p.setMetronomeOn(!metronomeOn)}
                  disabled={active}
                  aria-pressed={metronomeOn}
                >
                  {metronomeOn ? 'On' : 'Off'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {active ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={p.start}>
                    Restart
                  </button>
                  {!isStrict ? (
                    <button type="button" className="btn" onClick={p.skip}>
                      Skip note
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost" onClick={p.abandon}>
                    Exit run
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => (p.listening ? p.stopListening() : p.listen(bpm))}
                  >
                    {p.listening ? 'Stop listening' : 'Listen'}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={p.start}>
                    {phase === 'finished' ? 'Play again' : listensOnly ? 'Play it back' : 'Start'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <PracticeSetup
        lesson={lesson}
        bpm={bpm}
        onBpm={p.setBpm}
        listening={p.listening}
        onListen={p.listen}
        onStopListening={p.stopListening}
        listens={p.listens}
        onListens={p.setListens}
        practiceMode={p.practiceMode}
        onPracticeMode={p.setPracticeMode}
        locked={active}
      />

      <NoteStrip session={session} demoIndex={p.demoIndex} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {p.listening && p.demoIndex !== null ? (
            <div className="panel flex min-h-[74px] flex-col justify-center gap-1 border-amber/40 px-4 py-3">
              <p className="font-display text-lg leading-tight text-amber-soft">
                Listen. Note {p.demoIndex + 1} of {session.outcomes.length}.
              </p>
              <p className="text-[13px] leading-snug text-muted">
                Just hear it for now. Play the note that lights up if you want, but nothing is scored
                until you press Start.
              </p>
            </div>
          ) : result ? (
            <>
              <ResultPanel
                scores={result.scores}
                verdict={result.verdict}
                lesson={lesson}
                onRetry={p.start}
                onBack={onBack}
                nextLessonTitle={nextLesson ? nextLesson.title : null}
                onNext={() => {
                  if (nextLesson) onSelectLesson(nextLesson);
                }}
              />
              {attempts[0] ? (
                <TimingDiagnosisCard
                  attempt={attempts[0]}
                  history={attempts.slice(1)}
                  onPracticeFix={onSelectLesson}
                />
              ) : null}
            </>
          ) : (
            <FeedbackBar
              event={session.event}
              phase={phase}
              countIn={countIn}
              targetMidi={targetMidi}
            />
          )}

          <PianoKeyboard
            pressed={p.pressed}
            onDown={(midi) => {
              p.press(midi, { velocity: 0.7 });
            }}
            onUp={p.release}
            targetMidi={highlightMidi}
            targetBeat={p.listening ? null : targetBeat}
            upcoming={p.listening ? {} : upcoming}
            flash={session.flash}
            showHints={showKeyHints}
            showNoteNames={showNoteNames}
            dim={active}
          />

          <p className="text-[11px] leading-relaxed text-muted">
            Keys are labelled with the legends printed on your own keyboard (
            <span className="text-amber-soft">{effectiveLayout.toUpperCase()}</span>
            {exactLayout ? ', read from the browser' : ', chosen in settings'}). The badge on a key
            is its beat in the exercise, so the keys and the note strip always agree. Next up:{' '}
            <span className="font-mono text-amber-soft">
              {targetMidi === null ? 'run finished' : noteLabel(targetMidi)}
            </span>
            .
          </p>

          {p.heldCount >= 3 ? (
            <p
              role="status"
              className="rounded-xl border border-wrong/40 bg-wrong/[0.07] px-3 py-2 text-[11px] leading-snug text-muted"
            >
              <span className="text-wrong">Keyboard limit: </span>
              {p.heldCount} keys are held at once. Cheap keyboards drop or reorder keys past their
              rollover limit, so chords cannot be trusted here. Every lesson in this build is
              monophonic by design.
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          <LiveScorePanel stats={stats} bpm={bpm} mode={session.lesson.mode} />

          <div className="panel p-4">
            <p className="label-xs">How timing is measured</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              {isStrict
                ? 'Strict mode: the clock is fixed to the metronome after a four beat count-in. Notes played outside the window are marked as skipped, so the exercise ends on its own.'
                : 'Free pace: the ideal clock restarts from each note you get right. That measures your rhythm between notes and forgives a pause on a hard key.'}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Timing values are trustworthy to roughly the tens of milliseconds. They are measured
              between keyboard events, so audio buffering and event loop jitter are included, and
              computer keyboards report no velocity or key depth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}