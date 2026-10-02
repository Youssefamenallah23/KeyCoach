/**
 * Piano voicing and tuning.
 *
 * Two separate things that both get called "the piano sound":
 *
 *   VOICING   the tonal character. A real piano string is stiff, not ideal, so its
 *             partials are progressively SHARP of the harmonic series:
 *
 *                 f_n = n * f0 * sqrt(1 + B * n^2)
 *
 *             where B is the inharmonicity coefficient. Long bass strings have a
 *             tiny B (nearly harmonic, warm), short treble strings have a large B
 *             (stretched, metallic, bright). A synth built on exact integer
 *             harmonics cannot sound like a bright piano, because those sharp upper
 *             partials are exactly what makes it read as hard or cutting.
 *
 *   TUNING    where the pitches sit. Three independent offsets: the A4 reference in
 *             Hz, a uniform fine offset in cents, and the Railsback stretch that
 *             real tuners apply because the octave is tuned to the sharpened second
 *             partial. Treble ends up progressively sharp, bass progressively flat.
 *
 * Both are exposed as numbers, so a reference recording can be dialled in by ear
 * rather than trusted to a description.
 */

import { midiToFreq } from './notes';

export type VoicingId = 'concert' | 'sharp' | 'metallic' | 'honkytonk' | 'felt';

export interface Voicing {
  id: VoicingId;
  label: string;
  blurb: string;
  /** Inharmonicity B. 0 is a pure harmonic series, 0.02 is a short bright treble string. */
  inharmonicity: number;
  /** Partials synthesised per string. */
  partials: number;
  /** Copies of the unison. 1 disables beating entirely. */
  unison: number;
  /** Spread of the unison in cents. Large values sound honky tonk. */
  unisonCents: number;
  /** Spectral tilt. Lower is darker. */
  tilt: number;
  /** Boost applied to upper partials. 1 is neutral. */
  brightness: number;
  /** Attack time in seconds. Smaller is harder and more percussive. */
  attack: number;
  /** Extra damping on high partials. Higher is shorter and more percussive. */
  damping: number;
  /** Scales the natural sustain length. */
  decay: number;
  /** Hammer noise amount, 0 to 1. */
  noise: number;
  /** Reverb send, 0 to 1. */
  wet: number;
  /** Tone filter cut a multiple of the played note's frequency. */
  filterOpen: number;
}

export const VOICINGS: Record<VoicingId, Voicing> = {
  concert: {
    id: 'concert',
    label: 'Concert grand',
    blurb: 'Warm body, long sustain, medium room. The neutral default.',
    inharmonicity: 0.0004,
    partials: 12,
    unison: 3,
    unisonCents: 4,
    tilt: 1.25,
    brightness: 1,
    attack: 0.004,
    damping: 1,
    decay: 1,
    noise: 0.1,
    wet: 0.26,
    filterOpen: 16,
  },
  sharp: {
    id: 'sharp',
    label: 'Bright and sharp',
    blurb:
      'Hard attack, strong upper partials, tighter room. The sound of most sheet-music piano videos.',
    inharmonicity: 0.0018,
    partials: 18,
    unison: 2,
    unisonCents: 9,
    tilt: 0.95,
    brightness: 1.55,
    attack: 0.0022,
    damping: 1.25,
    decay: 0.95,
    noise: 0.22,
    wet: 0.18,
    filterOpen: 24,
  },
  metallic: {
    id: 'metallic',
    label: 'Metallic and bell-like',
    blurb: 'Very stiff strings. Sharper still, closer to a bell than a piano.',
    inharmonicity: 0.0075,
    partials: 18,
    unison: 2,
    unisonCents: 12,
    tilt: 0.85,
    brightness: 1.8,
    attack: 0.0018,
    damping: 1.15,
    decay: 1.05,
    noise: 0.26,
    wet: 0.16,
    filterOpen: 28,
  },
  honkytonk: {
    id: 'honkytonk',
    label: 'Honky tonk',
    blurb: 'Strings deliberately far apart, so every note wobbles and cuts.',
    inharmonicity: 0.002,
    partials: 14,
    unison: 3,
    unisonCents: 34,
    tilt: 1.05,
    brightness: 1.4,
    attack: 0.003,
    damping: 1.1,
    decay: 0.9,
    noise: 0.24,
    wet: 0.2,
    filterOpen: 22,
  },
  felt: {
    id: 'felt',
    label: 'Felt piano',
    blurb: 'Soft attack, muffled top end, close and intimate.',
    inharmonicity: 0.0006,
    partials: 10,
    unison: 2,
    unisonCents: 4,
    tilt: 1.9,
    brightness: 0.55,
    attack: 0.012,
    damping: 1.4,
    decay: 1.2,
    noise: 0.04,
    wet: 0.34,
    filterOpen: 9,
  },
};

export const VOICING_LIST: Voicing[] = [
  VOICINGS.concert,
  VOICINGS.sharp,
  VOICINGS.metallic,
  VOICINGS.honkytonk,
  VOICINGS.felt,
];

/** Hard ceilings, so a preset can never cost more than the engine can afford. */
export const MAX_PARTIALS = 18;
export const MAX_UNISON = 3;
export const MAX_CONCURRENT_VOICES = 16;

/** User overrides applied on top of a preset, so a learner can dial in a reference. */
export type VoicingOverrides = Partial<
  Pick<
    Voicing,
    'brightness' | 'inharmonicity' | 'unisonCents' | 'attack' | 'tilt' | 'partials' | 'unison' | 'noise' | 'wet'
  >
>;

/**
 * Merge a preset with user overrides, clamping the physically impossible values.
 * B is bounded because above roughly 0.03 the tone stops reading as a piano at all.
 */
export function mergeVoicing(id: VoicingId, overrides: VoicingOverrides = {}): Voicing {
  const base = VOICINGS[id] ?? VOICINGS.concert;
  const merged: Voicing = { ...base, ...overrides };
  return {
    ...merged,
    inharmonicity: Math.min(0.03, Math.max(0, merged.inharmonicity)),
    brightness: Math.min(3, Math.max(0.2, merged.brightness)),
    tilt: Math.min(2.6, Math.max(0.5, merged.tilt)),
    unisonCents: Math.min(60, Math.max(0, merged.unisonCents)),
    unison: Math.min(MAX_UNISON, Math.max(1, Math.round(merged.unison))),
    partials: Math.min(MAX_PARTIALS, Math.max(4, Math.round(merged.partials))),
    attack: Math.min(0.05, Math.max(0.0005, merged.attack)),
    noise: Math.min(0.6, Math.max(0, merged.noise)),
    wet: Math.min(0.8, Math.max(0, merged.wet)),
  };
}

export interface TuningState {
  /** A4 in Hz. 440 is modern standard, 415 baroque, 442 and above is "sharp". */
  a4Hz: number;
  /** Uniform offset applied to everything, in cents. The tune-it-sharp dial. */
  pitchOffsetCents: number;
  /**
   * Railsback stretch, in cents per octave away from A4. Positive gives the real
   * piano behaviour: the treble sits sharp and the bass flat.
   */
  stretchCentsPerOctave: number;
}

export const DEFAULT_TUNING: TuningState = {
  a4Hz: 440,
  pitchOffsetCents: 0,
  stretchCentsPerOctave: 0,
};

/** Cents deviation of a frequency from a reference. */
export function centsBetween(hz: number, referenceHz: number): number {
  if (hz <= 0 || referenceHz <= 0) return 0;
  return 1200 * Math.log2(hz / referenceHz);
}

export function shiftCents(hz: number, cents: number): number {
  return hz * Math.pow(2, cents / 1200);
}

/**
 * Where a key actually sounds, given the tuning state.
 *
 * The A4 reference sets the pitch level, the stretch is proportional to the number
 * of octaves away from A4 (so treble goes sharp and bass flat, as a tuner leaves
 * it), and the fine offset shifts everything uniformly.
 */
export function tunedFreq(midi: number, tuning: TuningState): number {
  const semitonesFromA4 = midi - 69;
  const equal = midiToFreq(midi, tuning.a4Hz);
  const octavesFromA4 = semitonesFromA4 / 12;
  const cents = tuning.stretchCentsPerOctave * octavesFromA4 + tuning.pitchOffsetCents;
  return shiftCents(equal, cents);
}

/**
 * Frequency of partial `n` on a stiff string.
 *
 *     f_n = n * f0 * sqrt(1 + B n^2) / sqrt(1 + B)
 *
 * The division by sqrt(1 + B) is deliberate: on a real string the fundamental is
 * also pulled sharp, but a tuner tunes the string so the fundamental lands on the
 * intended pitch. Normalising this way keeps "A4 is 440 Hz" honest while still
 * stretching the upper partials sharp, which is the audible part.
 */
export function inharmonicPartial(f0: number, n: number, inharmonicity: number): number {
  const stretch = Math.sqrt(1 + inharmonicity * n * n) / Math.sqrt(1 + inharmonicity);
  return n * f0 * stretch;
}

/** How far partial `n` sits above the perfect harmonic, in cents. */
export function partialSharpnessCents(n: number, inharmonicity: number): number {
  return centsBetween(Math.sqrt(1 + inharmonicity * n * n), Math.sqrt(1 + inharmonicity));
}

/**
 * Relative amplitude of partial `n`.
 *
 * 1/n^tilt is the natural roll-off of a struck string; `brightness` then lifts the
 * upper partials on top of it. That is the lever that turns warm into cutting
 * without touching the attack.
 */
export function partialAmplitude(n: number, voicing: Voicing): number {
  const base = Math.pow(n, -voicing.tilt);
  const lift = n <= 1 ? 1 : Math.pow(voicing.brightness, (n - 1) / 4);
  return base * lift;
}

/**
 * Per-partial decay multiplier. High partials die first, which is why a real note
 * starts bright and settles warm. This one behaviour does more for realism than any
 * filter setting.
 */
export function partialDecayFactor(n: number, voicing: Voicing): number {
  if (n <= 1) return 1;
  return Math.pow(0.74, (n - 1) * voicing.damping);
}

/** Natural sustain length for a pitch, before the voicing scales it. */
export function baseDecaySec(midi: number): number {
  return Math.min(8.5, Math.max(1.5, 8.5 - (midi - 36) * 0.115));
}

export function clampTuning(tuning: TuningState): TuningState {
  return {
    a4Hz: Math.min(466, Math.max(415, tuning.a4Hz)),
    pitchOffsetCents: Math.min(100, Math.max(-100, tuning.pitchOffsetCents)),
    stretchCentsPerOctave: Math.min(25, Math.max(-10, tuning.stretchCentsPerOctave)),
  };
}

/** One plain sentence about what the current tuning does. */
export function describeTuning(tuning: TuningState): string {
  const parts: string[] = [];
  const a4Deviation = centsBetween(tuning.a4Hz, 440);
  parts.push(
    Math.abs(a4Deviation) < 1
      ? 'A is at concert pitch, 440'
      : `A is ${Math.abs(Math.round(a4Deviation))} cents ${
          a4Deviation > 0 ? 'sharp' : 'flat'
        } of 440`,
  );
  if (Math.abs(tuning.pitchOffsetCents) >= 1) {
    parts.push(
      `the whole piano shifted ${Math.abs(Math.round(tuning.pitchOffsetCents))} cents ${
        tuning.pitchOffsetCents > 0 ? 'up' : 'down'
      }`,
    );
  }
  if (Math.abs(tuning.stretchCentsPerOctave) >= 0.5) {
    parts.push(
      `stretched, so the treble sits up to ${Math.round(
        tuning.stretchCentsPerOctave * 3,
      )} cents sharp and the bass sits flat`,
    );
  }
  return `${parts.join(', ')}.`;
}

/** Notes worth holding while tuning to a reference recording. */
export const TUNING_REFERENCE_NOTES: { midi: number; label: string; why: string }[] = [
  { midi: 69, label: 'A4', why: 'The standard reference. Every tuning is defined from it.' },
  { midi: 60, label: 'C4', why: 'Middle C, where most melodies here sit.' },
  { midi: 72, label: 'C5', why: 'The top of the home row, where a stretch is most audible.' },
  { midi: 57, label: 'A3', why: 'The bass end, where a real piano goes flat.' },
];

/** Common reference pitches, offered as one tap rather than a number to type. */
export const A4_PRESETS: { hz: number; label: string }[] = [
  { hz: 415, label: 'Baroque' },
  { hz: 432, label: '432' },
  { hz: 440, label: 'Concert' },
  { hz: 442, label: 'Orchestral' },
  { hz: 444, label: 'Sharp' },
];