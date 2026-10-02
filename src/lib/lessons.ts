/**
 * Fixed curriculum for MVP v1. Deliberately hard-coded: no LLM produces these.
 * Every melody is public domain, so there is no licensing surface (see the
 * copyright section of the idea brief).
 *
 * Lesson order follows the brief: C D E -> C..G -> full octave -> melodies.
 * `mode` decides how timing is measured:
 *   - 'patient': free pace. The ideal clock re-anchors after every correct
 *     note, so timing measures local rhythm (evenness) rather than absolute
 *     sync. A beginner is not punished for pausing on a hard note.
 *   - 'strict' : metronome-locked. A count-in runs, the clock never re-anchors
 *     and notes not played on time are auto-marked as skipped.
 */

export type LessonCategory = 'notes' | 'scales' | 'rhythm' | 'songs';

export type LessonMode = 'patient' | 'strict';

/**
 * Licensing status. Undefined means public domain.
 *
 * This is not decoration: it decides what ships by default and what a learner has
 * to opt into. Copyrighted material is never in the default catalogue.
 */
export type LessonLicense = 'public-domain' | 'reference-arrangement';

export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  category: LessonCategory;
  mode: LessonMode;
  targetBpm: number;
  notes: number[];
  beats: number[];
  /** Teaching hint shown above the note strip. */
  tip: string;
  /** True for drills produced by the local Practice Coach, not the curriculum. */
  generated?: boolean;
  /** Defaults to public domain when absent. */
  license?: LessonLicense;
  /** Rough difficulty for sorting and badges. */
  grade?: 1 | 2 | 3;
  /** Human note about the key and register, shown on the card. */
  range?: string;
}

export function isPublicDomain(lesson: Lesson): boolean {
  return lesson.license !== 'reference-arrangement';
}

/** True for anything the app may ship without a licence (curriculum plus PD songs). */
export function isShippable(lesson: Lesson): boolean {
  return isPublicDomain(lesson);
}

/** Every note lasts one beat except the final note, which resolves over two. */
function melodic(midis: number[]): number[] {
  return midis.map((_, i) => (i === midis.length - 1 ? 2 : 1));
}

/** Every note gets exactly one beat. Used by scale and rhythm drills. */
function even(midis: number[]): number[] {
  return midis.map(() => 1);
}

export const LESSON_LOW = 60;
export const LESSON_HIGH = 74;

export const CATEGORY_META: {
  id: LessonCategory;
  label: string;
  blurb: string;
}[] = [
  { id: 'notes', label: 'Notes', blurb: 'Find the keys by name.' },
  { id: 'scales', label: 'Scales', blurb: 'Step through the whole octave.' },
  { id: 'rhythm', label: 'Rhythm', blurb: 'Lock in with the metronome.' },
  { id: 'songs', label: 'Songs', blurb: 'Play real melodies end to end.' },
];

export const LESSONS: Lesson[] = [
  {
    id: 'notes-1',
    title: 'Three notes',
    subtitle: 'C - D - E',
    category: 'notes',
    mode: 'patient',
    targetBpm: 70,
    notes: [60, 62, 64],
    beats: even([60, 62, 64]),
    tip: 'Three white keys under your left hand. A is C, S is D, D is E.',
  },
  {
    id: 'notes-2',
    title: 'Five notes',
    subtitle: 'C - D - E - F - G',
    category: 'notes',
    mode: 'patient',
    targetBpm: 70,
    notes: [60, 62, 64, 65, 67],
    beats: even([60, 62, 64, 65, 67]),
    tip: 'F and G land under your index and middle finger. Keep the hand still.',
  },
  {
    id: 'notes-3',
    title: 'Seven notes',
    subtitle: 'C up to B',
    category: 'notes',
    mode: 'patient',
    targetBpm: 72,
    notes: [60, 62, 64, 65, 67, 69, 71],
    beats: even([60, 62, 64, 65, 67, 69, 71]),
    tip: 'B sits on J. There is no black key between B and C, so feel for the gap.',
  },
  {
    id: 'scale-1',
    title: 'C major scale',
    subtitle: 'One full octave',
    category: 'scales',
    mode: 'patient',
    targetBpm: 80,
    notes: [60, 62, 64, 65, 67, 69, 71, 72],
    beats: even([60, 62, 64, 65, 67, 69, 71, 72]),
    tip: 'One octave, even spacing. Same weight in every finger.',
  },
  {
    id: 'scale-2',
    title: 'C major, up and down',
    subtitle: 'Down is where habits break',
    category: 'scales',
    mode: 'patient',
    targetBpm: 78,
    notes: [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60],
    beats: even([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]),
    tip: 'Notice the turnaround. Most mistakes happen on the way down.',
  },
  {
    id: 'rhythm-1',
    title: 'Steady quarters',
    subtitle: 'C on every beat',
    category: 'rhythm',
    mode: 'strict',
    targetBpm: 80,
    notes: [60, 60, 60, 60, 60, 60, 60, 60],
    beats: even([60, 60, 60, 60, 60, 60, 60, 60]),
    tip: 'One note per click. Do not anticipate the click, land on it.',
  },
  {
    id: 'rhythm-2',
    title: 'Four-note pattern',
    subtitle: 'C D E F, then back down',
    category: 'rhythm',
    mode: 'strict',
    targetBpm: 88,
    notes: [60, 62, 64, 65, 64, 62, 60, 62, 64, 65],
    beats: even([60, 62, 64, 65, 64, 62, 60, 62, 64, 65]),
    tip: 'Metronome locked. Accuracy first, speed second.',
  },
  {
    id: 'song-1',
    title: 'First melody',
    subtitle: 'Original exercise, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 80,
    notes: [60, 62, 64, 64, 62, 60],
    beats: melodic([60, 62, 64, 64, 62, 60]),
    tip: 'A six-note loop you already know by ear. Listen for the shape.',
  },
  {
    id: 'song-2',
    title: 'Hot Cross Buns',
    subtitle: 'Traditional, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 84,
    notes: [64, 62, 60, 64, 62, 60, 60, 60, 60, 60, 62, 62, 62, 62, 64, 62, 60],
    beats: melodic([64, 62, 60, 64, 62, 60, 60, 60, 60, 60, 62, 62, 62, 62, 64, 62, 60]),
    tip: 'Three descending notes, twice. Then the long middle section on C.',
  },
  {
    id: 'song-3',
    title: 'Ode to Joy',
    subtitle: 'Beethoven, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 84,
    notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
    beats: melodic([64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62]),
    tip: 'Steps only, no leaps. Keep the hand in place and let the fingers walk.',
  },
  {
    id: 'song-4',
    title: 'Mary Had a Little Lamb',
    subtitle: 'Traditional, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 84,
    notes: [64, 62, 60, 62, 64, 64, 64, 62, 62, 62, 64, 67, 67],
    beats: melodic([64, 62, 60, 62, 64, 64, 64, 62, 62, 62, 64, 67, 67]),
    tip: 'The repeated E and D is where rushing starts. Count them out.',
  },
  {
    id: 'song-5',
    title: 'Twinkle, Twinkle',
    subtitle: 'Traditional, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 88,
    notes: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60],
    beats: melodic([60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60]),
    tip: 'First real leap: C up to G is a fifth. Move the whole hand, not fingers.',
    grade: 1,
    range: 'C4 to A4',
  },

  /* ---------------------------------------------------- public domain classics.
   * All out of copyright, so they ship by default. Note data is the standard
   * melody simplified to one hand and folded into a reachable register.
   * ------------------------------------------------------------------------- */

  {
    id: 'piece-fur-elise',
    title: 'Für Elise (opening)',
    subtitle: 'Beethoven, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 76,
    notes: [
      76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72, 64, 76, 75, 76, 75, 76,
      71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69,
    ],
    beats: melodic([
      76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72, 64, 76, 75, 76, 75, 76,
      71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69,
    ]),
    tip: 'The most famous piano phrase there is. E and D sharp alternate, so one finger stays put. Slow first, then even.',
    grade: 3,
    range: 'A4 to E5',
  },
  {
    id: 'piece-mountain-king',
    title: 'In the Hall of the Mountain King',
    subtitle: 'Grieg, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 88,
    notes: [
      57, 59, 60, 62, 64, 60, 64, 63, 57, 59, 60, 62, 64, 60, 64, 63, 64, 65, 68, 69, 71, 68, 71,
      70, 64, 65, 68, 69, 71, 68, 71, 70,
    ],
    beats: melodic([
      57, 59, 60, 62, 64, 60, 64, 63, 57, 59, 60, 62, 64, 60, 64, 63, 64, 65, 68, 69, 71, 68, 71,
      70, 64, 65, 68, 69, 71, 68, 71, 70,
    ]),
    tip: 'Creeps up the scale in steps then jumps. Notice the same shape returns an octave higher on the second half.',
    grade: 3,
    range: 'A3 to B4',
  },
  {
    id: 'piece-entertainer',
    title: 'The Entertainer (opening)',
    subtitle: 'Joplin, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 80,
    notes: [62, 63, 64, 60, 64, 60, 64, 60, 62, 63, 64, 60, 62, 60, 62, 64, 67],
    beats: melodic([62, 63, 64, 60, 64, 60, 64, 60, 62, 63, 64, 60, 62, 60, 62, 64, 67]),
    tip: 'Ragtime. The D sharp on the second note carries the whole character, so do not flatten it.',
    grade: 2,
    range: 'C4 to G4',
  },
  {
    id: 'piece-moonlight',
    title: 'Moonlight Sonata (opening)',
    subtitle: 'Beethoven, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 66,
    notes: [
      56, 61, 64, 56, 61, 64, 56, 61, 64, 56, 61, 64, 57, 62, 66, 57, 62, 66, 56, 61, 64, 56, 61,
      64, 56, 60, 66, 56, 60, 66, 56, 61, 64, 56, 61, 64,
    ],
    beats: melodic([
      56, 61, 64, 56, 61, 64, 56, 61, 64, 56, 61, 64, 57, 62, 66, 57, 62, 66, 56, 61, 64, 56, 61,
      64, 56, 60, 66, 56, 60, 66, 56, 61, 64, 56, 61, 64,
    ]),
    tip: 'Written as triplets, played here one note at a time, which is how it works on one row of keys. Keep it completely even.',
    grade: 3,
    range: 'G#3 to F#4',
  },
  {
    id: 'piece-toccata',
    title: 'Toccata in D minor (opening)',
    subtitle: 'Bach, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 70,
    notes: [
      69, 67, 69, 67, 65, 64, 62, 61, 62, 64, 65, 64, 62, 61, 62, 64, 63, 62, 61, 60, 61, 62, 63,
      64, 65, 64, 62, 61, 62, 64,
    ],
    beats: melodic([
      69, 67, 69, 67, 65, 64, 62, 61, 62, 64, 65, 64, 62, 61, 62, 64, 63, 62, 61, 60, 61, 62, 63,
      64, 65, 64, 62, 61, 62, 64,
    ]),
    tip: 'A wavering pair of notes, then a run down and back up. The waver is decoration, the runs carry the tune.',
    grade: 3,
    range: 'C4 to A4',
  },
  {
    id: 'piece-fifth',
    title: "Beethoven's Fifth",
    subtitle: 'Beethoven, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 84,
    notes: [67, 67, 67, 63, 65, 65, 65, 62, 67, 67, 67, 63, 68, 68, 68, 63, 67, 67, 67, 63],
    beats: melodic([67, 67, 67, 63, 65, 65, 65, 62, 67, 67, 67, 63, 68, 68, 68, 63, 67, 67, 67, 63]),
    tip: 'Three of the same note then a drop. The gaps between groups are part of the tune, so leave them.',
    grade: 2,
    range: 'D4 to G#4',
  },
  {
    id: 'piece-silent-night',
    title: 'Silent Night',
    subtitle: 'Gruber, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 68,
    notes: [
      67, 69, 67, 64, 67, 69, 67, 64, 62, 62, 71, 60, 60, 67, 69, 69, 72, 71, 69, 69, 72, 71, 67,
      67, 65, 62, 60, 60, 67,
    ],
    beats: melodic([
      67, 69, 67, 64, 67, 69, 67, 64, 62, 62, 71, 60, 60, 67, 69, 69, 72, 71, 69, 69, 72, 71, 67,
      67, 65, 62, 60, 60, 67,
    ]),
    tip: 'Slow and gentle. The repeated pairs are where people rush, so hold each for its full beat.',
    grade: 2,
    range: 'C4 to C5',
  },
  {
    id: 'piece-jingle-bells',
    title: 'Jingle Bells',
    subtitle: 'Pierpont, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 92,
    notes: [
      64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64, 65, 65, 65, 65, 65, 64, 64, 64, 64, 62, 62, 64,
      62, 67,
    ],
    beats: melodic([
      64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64, 65, 65, 65, 65, 65, 64, 64, 64, 64, 62, 62, 64,
      62, 67,
    ]),
    tip: 'Nine notes are the same key, so this is really a rhythm exercise. Count out loud.',
    grade: 1,
    range: 'C4 to G4',
  },
  {
    id: 'piece-happy-birthday',
    title: 'Happy Birthday',
    subtitle: 'Traditional, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 88,
    notes: [
      67, 67, 69, 67, 72, 71, 67, 67, 69, 67, 74, 72, 67, 67, 67, 64, 60, 59, 57, 65, 65, 64, 60,
      62, 60,
    ],
    beats: melodic([
      67, 67, 69, 67, 72, 71, 67, 67, 69, 67, 74, 72, 67, 67, 67, 64, 60, 59, 57, 65, 65, 64, 60,
      62, 60,
    ]),
    tip: 'Two identical openings, which is exactly where people rush the third note. Same shape twice, then it drops low.',
    grade: 2,
    range: 'A3 to D5',
  },
  {
    id: 'piece-canon',
    title: 'Canon in D (theme)',
    subtitle: 'Pachelbel, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 72,
    notes: [
      66, 64, 62, 61, 59, 57, 59, 61, 66, 64, 62, 61, 59, 57, 59, 61, 64, 62, 61, 59, 57, 56, 57,
      59, 66, 64, 62, 61, 59, 57, 61, 62,
    ],
    beats: melodic([
      66, 64, 62, 61, 59, 57, 59, 61, 66, 64, 62, 61, 59, 57, 59, 61, 64, 62, 61, 59, 57, 56, 57,
      59, 66, 64, 62, 61, 59, 57, 61, 62,
    ]),
    tip: 'A descending line that keeps returning, the most reused pattern in classical music. Let it flow with no accents.',
    grade: 2,
    range: 'G#3 to F#4',
  },
  {
    id: 'piece-turkish-march',
    title: 'Rondo Alla Turca (theme)',
    subtitle: 'Mozart, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 84,
    notes: [
      71, 69, 68, 69, 72, 71, 70, 71, 74, 73, 72, 74, 76, 75, 74, 76, 71, 69, 68, 69, 72, 71, 70,
      71, 74, 73, 72, 74, 76, 75, 76, 74,
    ],
    beats: melodic([
      71, 69, 68, 69, 72, 71, 70, 71, 74, 73, 72, 74, 76, 75, 74, 76, 71, 69, 68, 69, 72, 71, 70,
      71, 74, 73, 72, 74, 76, 75, 76, 74,
    ]),
    tip: 'A staircase. Each group starts one step higher than the last, so the shape is always the same.',
    grade: 3,
    range: 'G#4 to E5',
  },
  {
    id: 'piece-lullaby',
    title: "Brahms' Lullaby",
    subtitle: 'Brahms, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 66,
    notes: [
      64, 64, 67, 64, 64, 67, 64, 67, 72, 71, 69, 69, 67, 64, 64, 67, 64, 64, 67, 64, 67, 72, 71,
      69, 69, 67,
    ],
    beats: melodic([
      64, 64, 67, 64, 64, 67, 64, 67, 72, 71, 69, 69, 67, 64, 64, 67, 64, 64, 67, 64, 67, 72, 71,
      69, 69, 67,
    ]),
    tip: 'A rocking motion: two short notes then a leap, over and over. Keep it quiet and even.',
    grade: 2,
    range: 'C4 to C5',
  },
  {
    id: 'piece-greensleeves',
    title: 'Greensleeves',
    subtitle: 'Traditional, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 72,
    notes: [
      57, 60, 62, 64, 65, 64, 62, 59, 55, 57, 59, 60, 57, 57, 60, 62, 64, 65, 67, 65, 64, 62, 60,
      62, 64, 62, 60, 57,
    ],
    beats: melodic([
      57, 60, 62, 64, 65, 64, 62, 59, 55, 57, 59, 60, 57, 57, 60, 62, 64, 65, 67, 65, 64, 62, 60,
      62, 64, 62, 60, 57,
    ]),
    tip: 'Old and melancholy. The line rises then falls back, so watch the direction rather than each single key.',
    grade: 2,
    range: 'G3 to G4',
  },
  {
    id: 'piece-saints',
    title: 'When the Saints Go Marching In',
    subtitle: 'Traditional, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 92,
    notes: [60, 64, 65, 67, 64, 60, 64, 65, 67, 64, 60, 64, 65, 67, 64, 60, 62, 60],
    beats: melodic([60, 64, 65, 67, 64, 60, 64, 65, 67, 64, 60, 64, 65, 67, 64, 60, 62, 60]),
    tip: 'Four notes up, then back down. The safest first tune for a marching rhythm.',
    grade: 1,
    range: 'C4 to G4',
  },
  {
    id: 'piece-oh-susanna',
    title: 'Oh! Susanna',
    subtitle: 'Foster, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 88,
    notes: [
      60, 62, 64, 67, 67, 69, 67, 64, 60, 62, 64, 64, 62, 60, 62, 60, 62, 64, 67, 67, 69, 67, 64,
      60, 62, 64, 64, 62, 62, 60,
    ],
    beats: melodic([
      60, 62, 64, 67, 67, 69, 67, 64, 60, 62, 64, 64, 62, 60, 62, 60, 62, 64, 67, 67, 69, 67, 64,
      60, 62, 64, 64, 62, 62, 60,
    ]),
    tip: 'Bouncing rhythm. The two repeated notes in the middle are the trap, so give each its own beat.',
    grade: 2,
    range: 'C4 to A4',
  },
  {
    id: 'piece-deck-the-halls',
    title: 'Deck the Halls',
    subtitle: 'Traditional, public domain',
    category: 'songs',
    mode: 'patient',
    targetBpm: 96,
    notes: [
      67, 65, 64, 62, 60, 62, 64, 60, 62, 64, 65, 62, 64, 65, 67, 62, 64, 65, 62, 64, 65, 67, 62,
      64, 65, 62, 64, 65, 67,
    ],
    beats: melodic([
      67, 65, 64, 62, 60, 62, 64, 60, 62, 64, 65, 62, 64, 65, 67, 62, 64, 65, 62, 64, 65, 67, 62,
      64, 65, 62, 64, 65, 67,
    ]),
    tip: 'Steps down then steps back up. The descending run is the whole melody, repeated with different endings.',
    grade: 2,
    range: 'C4 to G4',
  },
];

/**
 * Reference arrangements.
 *
 * These are still in copyright. They are NOT in the default catalogue, are excluded
 * from the scheduler, the coach and the experiment, and only appear when a learner
 * opts in from Settings. They are simplified reductions for private study, not
 * transcriptions, and they carry the author credit.
 *
 * If you ever ship this commercially, get a licence or delete this list.
 */
export const REFERENCE_SONGS: Lesson[] = [
  {
    id: 'ref-interstellar',
    title: 'Interstellar (Main Theme)',
    subtitle: 'Hans Zimmer, simplified arrangement and study aid',
    category: 'songs',
    mode: 'patient',
    targetBpm: 72,
    license: 'reference-arrangement',
    notes: [
      64, 60, 64, 60, 64, 60, 64, 60, 64, 60, 64, 62, 64, 62, 64, 62, 64, 62, 64, 62, 64, 62, 64,
      60, 64, 62, 64, 62, 64, 62, 64, 62, 64, 62, 64, 57, 60, 62, 64, 76, 60, 62, 64,
    ],
    beats: melodic([
      64, 60, 64, 60, 64, 60, 64, 60, 64, 60, 64, 62, 64, 62, 64, 62, 64, 62, 64, 62, 64, 62, 64,
      60, 64, 62, 64, 62, 64, 62, 64, 62, 64, 62, 64, 57, 60, 62, 64, 76, 60, 62, 64,
    ]),
    tip: 'The famous rocking figure. Two keys alternate while the pattern slowly climbs. It is hypnotic, so hold a strict even pulse instead of speeding up on the easy repeats.',
    grade: 3,
    range: 'A3 to E5',
  },
  {
    id: 'ref-runaway',
    title: 'Runaway',
    subtitle: 'AURORA, simplified arrangement and study aid',
    category: 'songs',
    mode: 'patient',
    targetBpm: 74,
    license: 'reference-arrangement',
    notes: [
      59, 58, 59, 58, 54, 56, 59, 58, 59, 58, 54, 56, 61, 63, 61, 61, 63, 61, 66, 61, 63, 61, 63,
      66, 59, 58, 59, 58, 54, 56, 59, 58, 59, 58, 54, 56, 61, 63, 66, 68, 66, 63, 61,
    ],
    beats: melodic([
      59, 58, 59, 58, 54, 56, 59, 58, 59, 58, 54, 56, 61, 63, 61, 61, 63, 61, 66, 61, 63, 61, 63,
      66, 59, 58, 59, 58, 54, 56, 59, 58, 59, 58, 54, 56, 61, 63, 66, 68, 66, 63, 61,
    ]),
    tip: 'A tight two note wobble between B and A sharp, using the number row for the lower black keys. The wobble has to be perfectly even or the whole thing sounds wrong.',
    grade: 3,
    range: 'F#3 to G#4',
  },
];

/** Everything the learner can select, given their opt-in preference. */
export function allPlayableLessons(includeReference: boolean): Lesson[] {
  return includeReference ? [...LESSONS, ...REFERENCE_SONGS] : LESSONS;
}

/** Look up a lesson across both catalogues, so drills by id keep working. */
export function getAnyLesson(id: string): Lesson | null {
  return (
    LESSONS.find((l) => l.id === id) ??
    REFERENCE_SONGS.find((l) => l.id === id) ??
    null
  );
}

export function getLesson(id: string): Lesson | null {
  return LESSONS.find((l) => l.id === id) ?? null;
}

export function lessonsByCategory(category: LessonCategory): Lesson[] {
  return LESSONS.filter((l) => l.category === category);
}

/** Songs split by licensing, so the browser can separate them honestly. */
export function publicDomainSongs(): Lesson[] {
  return LESSONS.filter((l) => l.category === 'songs' && isPublicDomain(l));
}

/** Cumulative beat onset of every note in the lesson. */
export function cumulativeBeats(beats: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const b of beats) {
    out.push(acc);
    acc += b;
  }
  return out;
}

export function totalBeats(lesson: Lesson): number {
  return lesson.beats.reduce((a, b) => a + b, 0);
}

export function lessonRange(lesson: Lesson): { low: number; high: number } {
  return {
    low: Math.min(...lesson.notes),
    high: Math.max(...lesson.notes),
  };
}