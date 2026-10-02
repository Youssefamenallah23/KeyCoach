/**
 * Note engine: the deterministic music layer.
 *
 * No LLM here on purpose. Keyboard mapping, MIDI representation, note naming and
 * frequency maths are all closed-form and must be exact and instantaneous.
 */

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

/** Lowest and highest physical key rendered by the on-screen keyboard (C3 .. E5). */
export const KB_LOW_MIDI = 48;
export const KB_HIGH_MIDI = 76;

/** Musical range the MVP lessons live in (C4 .. D5). */
export const LESSON_LOW_MIDI = 60;
export const LESSON_HIGH_MIDI = 74;

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function noteName(midi: number): NoteName {
  return NOTE_NAMES[pitchClass(midi)];
}

export function noteOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** Scientific pitch notation, e.g. 60 -> "C4". */
export function noteLabel(midi: number): string {
  return `${noteName(midi)}${noteOctave(midi)}`;
}

/** Letter only, e.g. 60 -> "C". */
export function noteLetter(midi: number): string {
  return noteName(midi);
}

export function isBlack(midi: number): boolean {
  return noteName(midi).includes('#');
}

export function midiToFreq(midi: number, a4Hz = 440): number {
  return a4Hz * Math.pow(2, (midi - 69) / 12);
}

export function clampMidi(midi: number): number {
  return Math.min(LESSON_HIGH_MIDI, Math.max(LESSON_LOW_MIDI, Math.round(midi)));
}

export function intervalName(semitones: number): string {
  const abs = Math.abs(semitones);
  const names: Record<number, string> = {
    0: 'unison',
    1: 'minor 2nd',
    2: 'major 2nd',
    3: 'minor 3rd',
    4: 'major 3rd',
    5: 'perfect 4th',
    6: 'tritone',
    7: 'perfect 5th',
    8: 'minor 6th',
    9: 'major 6th',
    10: 'minor 7th',
    11: 'major 7th',
    12: 'octave',
  };
  return names[abs] ?? `${abs} semitones`;
}

/* ------------------------------------------------------------------ *
 * Keyboard mapping
 *
 * Physical `event.code` values are mapped to MIDI numbers. Using `code`
 * instead of `key` makes the layout independent of the user's OS layout
 * (QWERTY, AZERTY, QWERTZ, Dvorak all behave identically). That directly
 * answers the "layout differences" risk raised in the brief.
 *
 * The full range C3 to E5 (MIDI 48 to 76) is chromatic, so any melody in that
 * register is playable. An earlier version left the lower octave's black keys and
 * the top E unmapped, which silently made several real songs unplayable.
 *
 *   Z X C V B N M        -> C3 D3 E3 F3 G3 A3 B3   (lower octave, white)
 *   1 2 3 4 5            -> C#3 D#3  F#3 G#3 A#3   (lower octave, black)
 *   A S D F G H J K L ;  -> C4 D4 E4 F4 G4 A4 B4 C5 D5 E5
 *   Q W   R T Y   I O    -> C#4 D#4  F#4 G#4 A#4  C#5 D#5
 *   (E, U, P are intentionally unmapped: E#/B#/Fb do not exist)
 * ------------------------------------------------------------------ */

export const KEY_BINDINGS: Record<string, number> = {
  // lower octave, white keys
  KeyZ: 48,
  KeyX: 50,
  KeyC: 52,
  KeyV: 53,
  KeyB: 55,
  KeyN: 57,
  KeyM: 59,
  // lower octave, black keys. The bottom row has no row beneath it, so the digit
  // row carries them, which is the convention on virtual piano sites.
  Digit1: 49,
  Digit2: 51,
  Digit3: 54,
  Digit4: 56,
  Digit5: 58,
  // octave 4, white keys, plus the top E
  KeyA: 60,
  KeyS: 62,
  KeyD: 64,
  KeyF: 65,
  KeyG: 67,
  KeyH: 69,
  KeyJ: 71,
  KeyK: 72,
  KeyL: 74,
  Semicolon: 76,
  // octave 4/5, black keys
  KeyQ: 61,
  KeyW: 63,
  KeyR: 66,
  KeyT: 68,
  KeyY: 70,
  KeyI: 73,
  KeyO: 75,
};

export const OCTAVE_DOWN_CODE = 'BracketLeft';
export const OCTAVE_UP_CODE = 'BracketRight';

const CODE_LABELS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return CODE_LABELS[code] ?? code;
}

/** midi -> the physical key that triggers it at octave shift 0. */
export const MIDI_TO_KEY: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_BINDINGS).map(([code, midi]) => [midi, keyLabel(code)]),
);

/** Resolve a physical key code to a MIDI note, honouring an octave shift. */
export function resolveMidi(code: string, octaveShift = 0): number | null {
  const base = KEY_BINDINGS[code];
  if (base === undefined) return null;
  return base + octaveShift * 12;
}

/** Reverse lookup for hints: which key plays this note at octave shift 0. */
export function keyHintFor(midi: number): string | null {
  return MIDI_TO_KEY[midi] ?? null;
}

/** midi -> physical key code, so the UI can print the user's real keycap legend. */
export const MIDI_TO_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_BINDINGS).map(([code, midi]) => [midi, code]),
);

export function codeForMidi(midi: number, octaveShift = 0): string | null {
  return MIDI_TO_CODE[midi - octaveShift * 12] ?? null;
}

/**
 * Best available timestamp for a keyboard event, in the `performance.now()`
 * timeline. `event.timeStamp` is closer to the real key contact than the time
 * the handler runs, which lowers jitter. The guard falls back for browsers or
 * synthetic events that report 0 or a wall-clock value.
 */
export function eventTimestamp(e: { timeStamp: number }): number {
  const now = performance.now();
  return e.timeStamp > 0 && e.timeStamp <= now + 2 ? e.timeStamp : now;
}

/** The white / black key layout used by the on-screen keyboard. */
export interface KeyLayout {
  whites: number[];
  blacks: { midi: number; afterWhite: number }[];
}

export function buildKeyLayout(octaveShift = 0): KeyLayout {
  const base = octaveShift * 12;
  const whites: number[] = [];
  const blacks: { midi: number; afterWhite: number }[] = [];
  for (let midi = KB_LOW_MIDI + base; midi <= KB_HIGH_MIDI + base; midi += 1) {
    if (isBlack(midi)) {
      blacks.push({ midi, afterWhite: whites.length - 1 });
    } else {
      whites.push(midi);
    }
  }
  return { whites, blacks };
}

/** C major scale degrees for a two-octave range, used by the lesson browser. */
export function degreeOf(midi: number, tonic = 60): string {
  const names = ['1', '2', '3', '4', '5', '6', '7'];
  return names[pitchClass(midi - tonic)] ?? '?';
}