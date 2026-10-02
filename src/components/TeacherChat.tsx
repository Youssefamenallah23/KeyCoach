'use client';

import { useCallback, useMemo, useState } from 'react';
import { analyzeAttempts } from '@/lib/coach';
import { levelFromXp, useProgress } from '@/lib/progress';

const PRESETS = [
  'Why do I keep messing up this part?',
  'How do I fix my timing?',
  'Can I learn chords this way?',
  'How do I stop pressing the wrong key?',
];

interface Answer {
  text: string;
  source: string;
  note?: string;
}

/**
 * AI teacher.
 *
 * Sends only a compact summary of the learner state, never raw attempts, and the
 * route answers from the deterministic analyser when no model key is configured.
 * So this panel works offline, instantly and free, and upgrades to an LLM only
 * when one is available.
 */
export default function TeacherChat() {
  const attempts = useProgress((s) => s.attempts);
  const xp = useProgress((s) => s.xp);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);

  const report = useMemo(() => analyzeAttempts(attempts), [attempts]);

  const learner = useMemo(
    () => ({
      level: levelFromXp(xp).level,
      recentAccuracy: report.recentAccuracy,
      recommendedBpm: report.recommendedBpm,
      weakNotes: report.weakNotes.slice(0, 4).map((n) => ({
        label: n.label,
        errors: n.errors,
        plays: n.plays,
      })),
      weakTransitions: report.weakTransitions.slice(0, 4).map((t) => ({
        label: t.label,
        errors: t.errors,
        occurrences: t.occurrences,
      })),
      currentLesson: attempts[0]?.lessonTitle ?? null,
    }),
    [attempts, report, xp],
  );

  const ask = useCallback(
    async (text: string) => {
      setLoading(true);
      setQuestion(text);
      try {
        const res = await fetch('/api/teacher', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: text, learner }),
        });
        const data = (await res.json()) as { answer: string; source: string; note?: string };
        setAnswer({ text: data.answer, source: data.source, note: data.note });
      } catch {
        setAnswer({
          text: 'Could not reach the teacher endpoint. The local coach panel on the left still works.',
          source: 'error',
        });
      } finally {
        setLoading(false);
      }
    },
    [learner],
  );

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="label-xs">AI teacher</p>
        <span className={answer?.source === 'local' ? 'chip' : 'chip-amber'}>
          {answer ? (answer.source === 'local' ? 'rules' : answer.source) : 'ready'}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-muted">
        Explain a mistake or ask a question. Analysis stays local and deterministic. Only the wording
        goes to a model, and only if a key is configured.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          placeholder="Why do I keep messing up this part?"
          aria-label="Ask the teacher a question"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg2/60 px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-amber/60 focus:outline-none"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={() => void ask(question)}
        >
          {loading ? 'Thinking' : 'Ask'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chip hover:border-amber/50 hover:text-ink"
            onClick={() => void ask(preset)}
          >
            {preset}
          </button>
        ))}
      </div>

      {answer ? (
        <div
          key={answer.text}
          className="animate-rise motion-reduce:animate-none mt-3 rounded-xl border border-amber/25 bg-amber/[0.06] p-3"
        >
          <p className="text-[13px] leading-relaxed text-ink">{answer.text}</p>
          {answer.note ? (
            <p className="mt-2 text-[11px] leading-snug text-muted">{answer.note}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}