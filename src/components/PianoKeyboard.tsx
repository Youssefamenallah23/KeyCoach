'use client';

import { memo, useMemo } from 'react';
import { buildKeyLayout, isBlack, noteLabel, noteName } from '@/lib/notes';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';

export interface FlashState {
  midi: number;
  kind: 'correct' | 'wrong';
  seq: number;
}

interface PianoKeyboardProps {
  octaveShift?: number;
  pressed: ReadonlySet<number>;
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
  /** The note the learner should play next. */
  targetMidi?: number | null;
  /** Beat number of the target note, printed on the key so keys match the beats. */
  targetBeat?: number | null;
  /** Upcoming notes mapped to their beat number, so order is visible on the keys. */
  upcoming?: Record<number, number>;
  flash?: FlashState | null;
  showHints?: boolean;
  showNoteNames?: boolean;
  /** Fades keys that are not part of the current exercise. */
  dim?: boolean;
}

const WHITE_W = 58;
const WHITE_H = 208;
const BLACK_W = 34;
const BLACK_H = 130;

function PianoKeyboardImpl({
  octaveShift = 0,
  pressed,
  onDown,
  onUp,
  targetMidi = null,
  targetBeat = null,
  upcoming,
  flash = null,
  showHints = true,
  showNoteNames = true,
  dim = false,
}: PianoKeyboardProps) {
  const { whites, blacks } = useMemo(() => buildKeyLayout(octaveShift), [octaveShift]);
  const { labelForMidi, positionForMidi, effectiveLayout } = useKeyboardLayout();
  const boardWidth = whites.length * WHITE_W;
  const upcomingMap = upcoming ?? {};

  const flashGeometry = useMemo(() => {
    if (!flash) return null;
    if (!isBlack(flash.midi)) {
      const i = whites.indexOf(flash.midi);
      if (i < 0) return null;
      return { left: i * WHITE_W, width: WHITE_W, height: WHITE_H };
    }
    const black = blacks.find((b) => b.midi === flash.midi);
    if (!black) return null;
    return {
      left: (black.afterWhite + 1) * WHITE_W - BLACK_W / 2,
      width: BLACK_W,
      height: BLACK_H,
    };
  }, [blacks, flash, whites]);

  const ariaFor = (midi: number): string => {
    const key = labelForMidi(midi, octaveShift);
    const where = positionForMidi(midi, octaveShift);
    const parts = [noteLabel(midi)];
    if (key) parts.push(`keyboard key ${key}`);
    if (where) parts.push(where);
    return parts.join(', ');
  };

  return (
    <div className="thin-scroll overflow-x-auto pb-1">
      <div
        role="group"
        aria-label={`Virtual piano keyboard. Key legends shown for the ${effectiveLayout} layout.`}
        className="relative select-none"
        style={{ width: boardWidth, height: WHITE_H }}
      >
        {whites.map((midi) => {
          const i = whites.indexOf(midi);
          const active = pressed.has(midi);
          const isTarget = targetMidi === midi;
          const order = !isTarget ? upcomingMap[midi] : undefined;
          const dimmed = dim && !active && !isTarget && order === undefined;
          const legend = labelForMidi(midi, octaveShift);

          return (
            <button
              key={midi}
              type="button"
              tabIndex={-1}
              aria-label={ariaFor(midi)}
              onPointerDown={(e) => {
                e.preventDefault();
                onDown(midi);
              }}
              onPointerUp={() => onUp(midi)}
              onPointerLeave={() => onUp(midi)}
              onPointerCancel={() => onUp(midi)}
              className={[
                'absolute top-0 rounded-b-[10px] border border-black/25',
                'bg-gradient-to-b shadow-key transition-all duration-75 motion-reduce:transition-none',
                'touch-none',
                active
                  ? 'translate-y-[3px] from-amber-soft to-amber'
                  : 'from-[#fbf8f2] to-[#e9e1d2] hover:to-[#f3ecdf]',
                isTarget ? 'ring-2 ring-amber ring-offset-1 ring-offset-bg' : '',
                order !== undefined ? 'ring-1 ring-amber/40' : '',
                dimmed ? 'opacity-55' : '',
              ].join(' ')}
              style={{ left: i * WHITE_W, width: WHITE_W, height: WHITE_H }}
            >
              <span className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center gap-1">
                {showHints && legend ? (
                  <span className="rounded-md border border-black/15 bg-black/[0.07] px-2 py-0.5 font-mono text-[13px] font-bold text-black/70">
                    {legend}
                  </span>
                ) : null}
                {showNoteNames ? (
                  <span className="text-[10px] font-semibold text-black/35">{noteName(midi)}</span>
                ) : null}
              </span>

              {isTarget && targetBeat !== null ? (
                <Badge tone="target">{`beat ${targetBeat}`}</Badge>
              ) : order !== undefined ? (
                <Badge tone="upcoming">{`beat ${order}`}</Badge>
              ) : null}
            </button>
          );
        })}

        {blacks.map(({ midi, afterWhite }) => {
          const active = pressed.has(midi);
          const isTarget = targetMidi === midi;
          const order = !isTarget ? upcomingMap[midi] : undefined;
          const dimmed = dim && !active && !isTarget && order === undefined;
          const legend = labelForMidi(midi, octaveShift);

          return (
            <button
              key={midi}
              type="button"
              tabIndex={-1}
              aria-label={ariaFor(midi)}
              onPointerDown={(e) => {
                e.preventDefault();
                onDown(midi);
              }}
              onPointerUp={() => onUp(midi)}
              onPointerLeave={() => onUp(midi)}
              onPointerCancel={() => onUp(midi)}
              className={[
                'absolute top-0 z-10 rounded-b-[8px] border border-black/70',
                'bg-gradient-to-b shadow-key-black transition-all duration-75 motion-reduce:transition-none',
                'touch-none',
                active
                  ? 'translate-y-[3px] from-[#6a5636] to-[#33281a]'
                  : 'from-[#2b2531] to-[#0f0d13] hover:from-[#3a3142]',
                isTarget ? 'ring-2 ring-amber ring-offset-1 ring-offset-bg' : '',
                order !== undefined ? 'ring-1 ring-amber/50' : '',
                dimmed ? 'opacity-55' : '',
              ].join(' ')}
              style={{
                left: (afterWhite + 1) * WHITE_W - BLACK_W / 2,
                width: BLACK_W,
                height: BLACK_H,
              }}
            >
              <span className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center">
                {showHints && legend ? (
                  <span className="rounded-md border border-amber/30 bg-amber/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-soft">
                    {legend}
                  </span>
                ) : null}
              </span>

              {isTarget && targetBeat !== null ? (
                <Badge tone="target">{`beat ${targetBeat}`}</Badge>
              ) : order !== undefined ? (
                <Badge tone="upcoming">{`beat ${order}`}</Badge>
              ) : null}
            </button>
          );
        })}

        {flash && flashGeometry ? (
          <span
            key={flash.seq}
            aria-hidden="true"
            className={[
              'pointer-events-none absolute top-0 z-20 rounded-b-[10px]',
              'motion-reduce:animate-none',
              flash.kind === 'correct' ? 'animate-flash-ok' : 'animate-flash-bad',
            ].join(' ')}
            style={{
              left: flashGeometry.left,
              width: flashGeometry.width,
              height: flashGeometry.height,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'target' | 'upcoming'; children: string }) {
  return (
    <span
      className={[
        'pointer-events-none absolute inset-x-0 top-1.5 flex justify-center',
        tone === 'target' ? '' : 'opacity-80',
      ].join(' ')}
    >
      <span
        className={[
          'rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide',
          tone === 'target' ? 'bg-amber text-[#201704]' : 'bg-panel2/90 text-amber-soft',
        ].join(' ')}
      >
        {children}
      </span>
    </span>
  );
}

const PianoKeyboard = memo(PianoKeyboardImpl);
PianoKeyboard.displayName = 'PianoKeyboard';

export default PianoKeyboard;