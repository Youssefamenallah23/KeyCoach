'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PianoKeyboard from './PianoKeyboard';
import { getAudioEngine } from '@/lib/audio';
import { mergeVoicing } from '@/lib/voicing';
import { OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, noteLabel, resolveMidi } from '@/lib/notes';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import { useSettings } from '@/lib/settings';

const HISTORY_LEN = 8;

/**
 * Free play: no scoring, no clock, just the instrument. Also where the octave
 * shift and the metronome live, since lessons must stay on their own pitch range.
 */
export default function FreePlay() {
  const engine = getAudioEngine();

  const [octaveShift, setOctaveShift] = useState(0);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set<number>());
  const [history, setHistory] = useState<number[]>([]);
  const [bpm, setBpm] = useState(80);
  const [metronomeOn, setMetronomeOn] = useState(false);

  const shiftRef = useRef(0);
  shiftRef.current = octaveShift;

  const { labelForMidi, effectiveLayout } = useKeyboardLayout();
  const voicingId = useSettings((s) => s.voicing);
  const voicingOverrides = useSettings((s) => s.voicingOverrides);
  const tuning = useSettings((s) => s.tuning);
  const masterVolume = useSettings((s) => s.masterVolume);
  const muted = useSettings((s) => s.muted);
  const metronomeVolume = useSettings((s) => s.metronomeVolume);
  const showKeyHints = useSettings((s) => s.showKeyHints);
  const showNoteNames = useSettings((s) => s.showNoteNames);

  useEffect(() => {
    engine.applyVoicing(mergeVoicing(voicingId, voicingOverrides));
    engine.setTuning(tuning);
    engine.setVolume(masterVolume);
    engine.setMuted(muted);
    engine.setMetronomeVolume(metronomeVolume);
  }, [engine, masterVolume, metronomeVolume, muted, tuning, voicingId, voicingOverrides]);

  const press = useCallback(
    (midi: number) => {
      engine.unlock();
      engine.noteOn(midi, 0.85);
      setPressed((prev) => {
        const next = new Set(prev);
        next.add(midi);
        return next;
      });
      setHistory((prev) => [midi, ...prev].slice(0, HISTORY_LEN));
    },
    [engine],
  );

  const release = useCallback(
    (midi: number) => {
      engine.noteOff(midi);
      setPressed((prev) => {
        if (!prev.has(midi)) return prev;
        const next = new Set(prev);
        next.delete(midi);
        return next;
      });
    },
    [engine],
  );

  const shiftOctave = useCallback((delta: number) => {
    setOctaveShift((prev) => Math.max(-1, Math.min(1, prev + delta)));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === OCTAVE_DOWN_CODE) {
        e.preventDefault();
        shiftOctave(-1);
        return;
      }
      if (e.code === OCTAVE_UP_CODE) {
        e.preventDefault();
        shiftOctave(1);
        return;
      }
      if (e.repeat) return;
      const midi = resolveMidi(e.code, shiftRef.current);
      if (midi === null) return;
      e.preventDefault();
      press(midi);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const midi = resolveMidi(e.code, shiftRef.current);
      if (midi !== null) release(midi);
    };

    const onBlur = () => {
      engine.allOff();
      setPressed(new Set());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [engine, press, release, shiftOctave]);

  useEffect(() => {
    if (metronomeOn) engine.startMetronome(bpm);
    else engine.stopMetronome();
    return () => engine.stopMetronome();
  }, [bpm, engine, metronomeOn]);

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="label-xs">Octave</span>
            <button type="button" className="btn px-3 py-1.5" onClick={() => shiftOctave(-1)}>
              &minus;1
            </button>
            <span className="tabular w-9 text-center font-mono text-sm text-ink">
              {octaveShift > 0 ? `+${octaveShift}` : octaveShift}
            </span>
            <button type="button" className="btn px-3 py-1.5" onClick={() => shiftOctave(1)}>
              +1
            </button>
            <span className="chip">[ ]</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="label-xs">Metronome</span>
            <button
              type="button"
              className={`btn px-3 py-1.5 ${metronomeOn ? 'btn-primary' : ''}`}
              onClick={() => setMetronomeOn((v) => !v)}
              aria-pressed={metronomeOn}
            >
              {metronomeOn ? 'On' : 'Off'}
            </button>
            <input
              type="range"
              min={40}
              max={200}
              step={2}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="h-1 w-36 accent-[#e9b055]"
              aria-label="Metronome tempo in beats per minute"
            />
            <span className="tabular w-16 font-mono text-sm text-ink">{bpm} BPM</span>
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            <span className="label-xs">Just played</span>
            <div className="flex flex-wrap gap-1.5">
              {history.length === 0 ? (
                <span className="font-mono text-xs text-muted">&mdash;</span>
              ) : (
                history.map((midi, i) => (
                  <span
                    key={`${midi}-${i}`}
                    className={[
                      'rounded-md border px-1.5 py-0.5 font-mono text-[11px]',
                      i === 0
                        ? 'border-amber/60 bg-amber/15 text-amber-soft'
                        : 'border-line/70 bg-panel2/50 text-muted',
                    ].join(' ')}
                  >
                    {noteLabel(midi)}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <PianoKeyboard
        octaveShift={octaveShift}
        pressed={pressed}
        onDown={press}
        onUp={release}
        showHints={showKeyHints}
        showNoteNames={showNoteNames}
      />

      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <p className="label-xs">Mapping</p>
          <span className="chip-amber">{effectiveLayout.toUpperCase()}</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Keys are labelled with the legends printed on your own keyboard. Mapping follows physical
          key position, so the shape of the keyboard is identical on every layout.
        </p>
        <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted">
          <MappingRow
            title="Home row, white keys"
            keys={[60, 62, 64, 65, 67, 69, 71, 72, 74, 76]}
            labels={[60, 62, 64, 65, 67, 69, 71, 72, 74, 76].map((m) => labelForMidi(m) ?? '-')}
          />
          <MappingRow
            title="Top row, black keys"
            keys={[61, 63, 66, 68, 70, 73, 75]}
            labels={[61, 63, 66, 68, 70, 73, 75].map((m) => labelForMidi(m) ?? '-')}
          />
          <MappingRow
            title="Bottom row, octave below"
            keys={[48, 50, 52, 53, 55, 57, 59]}
            labels={[48, 50, 52, 53, 55, 57, 59].map((m) => labelForMidi(m) ?? '-')}
          />
          <MappingRow
            title="Number row, lower black keys"
            keys={[49, 51, 54, 56, 58]}
            labels={[49, 51, 54, 56, 58].map((m) => labelForMidi(m) ?? '-')}
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          The whole range C3 to E5 is mapped, black keys included, so any melody in that register can
          be played. The note names are fixed. The letters are whatever is printed on your keys, which
          is why an AZERTY board shows Q S D F G H J K L for C D E F G A B C D.
        </p>
      </div>
    </div>
  );
}

function MappingRow({
  title,
  keys,
  labels,
}: {
  title: string;
  keys: number[];
  labels: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-full text-[11px] uppercase tracking-wider text-muted sm:w-44">{title}</span>
      {keys.map((midi, i) => (
        <span key={midi} className="inline-flex items-center gap-1">
          <span className="rounded-md border border-line/70 bg-panel2/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">
            {labels[i]}
          </span>
          <span className="font-mono text-[10px] text-muted">{noteLabel(midi)}</span>
        </span>
      ))}
    </div>
  );
}