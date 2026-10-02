'use client';

import type { PracticeEvent, PracticePhase } from '@/lib/practice';
import { noteLabel } from '@/lib/notes';
import { useSettings } from '@/lib/settings';
import { describeError, timingBand } from '@/lib/timing';

interface FeedbackBarProps {
  event: PracticeEvent | null;
  phase: PracticePhase;
  countIn: number;
  /** The note currently expected, used for idle and count-in states. */
  targetMidi: number | null;
}

/**
 * The real-time feedback surface.
 *
 * When a note lands, the message is chosen from the timing band, not the raw
 * milliseconds. "A bit late" is something you can act on. "+120 ms" is not, unless
 * you are the kind of learner who wants the number, in which case Settings flips it
 * back.
 */
export default function FeedbackBar({ event, phase, countIn, targetMidi }: FeedbackBarProps) {
  const preferNumbers = useSettings((s) => s.timingDisplay) === 'numbers';

  if (phase === 'idle' && !event) {
    return (
      <Shell tone="neutral">
        <Title>
          {targetMidi === null
            ? 'Play any key to hear the piano.'
            : `Press Listen to hear it, or Start to play ${noteLabel(targetMidi)}.`}
        </Title>
        <Detail>Your computer keyboard is the instrument. The highlighted key is next.</Detail>
      </Shell>
    );
  }

  if (phase === 'countin') {
    return (
      <Shell tone="neutral">
        <Title>{countIn > 0 ? `Count in: ${countIn}` : 'Go'}</Title>
        <Detail>Stay with the metronome. The exercise starts on the next click.</Detail>
      </Shell>
    );
  }

  if (phase === 'finished') {
    return (
      <Shell tone="neutral">
        <Title>Run complete.</Title>
        <Detail>Scores are below, with a note by note look at your timing.</Detail>
      </Shell>
    );
  }

  if (!event) {
    return (
      <Shell tone="neutral">
        <Title>{targetMidi === null ? 'Go.' : `Play ${noteLabel(targetMidi)}.`}</Title>
        <Detail>Wrong keys are counted. A missed note counts against accuracy.</Detail>
      </Shell>
    );
  }

  // A landing note: lead with the band, then the note it belonged to.
  if (event.timingMs !== null && event.timingMs !== undefined) {
    const band = timingBand(event.timingMs);
    const tone = band.tone === 'bad' ? 'bad' : band.tone === 'close' ? 'info' : 'ok';

    return (
      <Shell tone={tone} animateKey={event.seq}>
        <Title>
          {band.sentence}
          {event.title ? ` on ${event.title}` : ''}.
        </Title>
        <Detail>
          {band.hint}
          {preferNumbers ? ` (${describeError(event.timingMs, true)})` : ''}
        </Detail>
      </Shell>
    );
  }

  const tone = event.kind === 'ok' ? 'ok' : event.kind === 'bad' ? 'bad' : 'info';

  return (
    <Shell tone={tone} animateKey={event.seq}>
      <Title>{event.title}</Title>
      <Detail>{event.detail}</Detail>
    </Shell>
  );
}

function Shell({
  tone,
  animateKey,
  children,
}: {
  tone: 'neutral' | 'ok' | 'bad' | 'info';
  animateKey?: number;
  children: React.ReactNode;
}) {
  const border =
    tone === 'ok'
      ? 'border-correct/45'
      : tone === 'bad'
        ? 'border-wrong/45'
        : tone === 'info'
          ? 'border-amber/40'
          : 'border-line/70';

  const glow =
    tone === 'ok'
      ? 'shadow-[0_0_0_1px_rgba(127,209,168,0.14),0_18px_40px_-28px_rgba(127,209,168,0.6)]'
      : tone === 'bad'
        ? 'shadow-[0_0_0_1px_rgba(226,102,92,0.14),0_18px_40px_-28px_rgba(226,102,92,0.6)]'
        : tone === 'info'
          ? 'shadow-[0_0_0_1px_rgba(233,176,85,0.12)]'
          : '';

  return (
    <div
      key={animateKey ?? 'static'}
      aria-live="polite"
      className={[
        'flex min-h-[74px] flex-col justify-center gap-1 rounded-2xl border bg-panel/60 px-4 py-3',
        border,
        glow,
        animateKey !== undefined ? 'animate-rise' : '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-lg leading-tight text-ink">{children}</p>;
}

function Detail({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-snug text-muted">{children}</p>;
}