/**
 * Standard MIDI File parsing.
 *
 * The brief's legal section says the safe path for song learning is
 * public-domain material or **user-supplied files**. This is the user-supplied
 * path: the file is read locally in the browser, never uploaded, and nothing is
 * redistributed. That is why no copyrighted song ships with the app.
 *
 * Supports format 0 and 1, PPQ division, running status, tempo and track-name
 * meta events, note on/off with velocity-zero release, and untimed events. SMPTE
 * division is rejected with a clear message rather than guessed at.
 */

import type { Lesson } from './lessons';

export interface MidiNote {
  midi: number;
  startTick: number;
  durationTicks: number;
  channel: number;
  velocity: number;
}

export interface MidiTempo {
  tick: number;
  usPerQuarter: number;
}

export interface MidiSong {
  format: number;
  /** Ticks per quarter note. */
  ppq: number;
  tempos: MidiTempo[];
  tracks: { name: string; notes: MidiNote[] }[];
  /** All notes merged, sorted by start time. */
  notes: MidiNote[];
}

export class MidiParseError extends Error {}

function readVarLength(view: DataView, offset: { v: number }): number {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const byte = view.getUint8(offset.v);
    offset.v += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return value;
}

function readAscii(view: DataView, offset: { v: number }, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(view.getUint8(offset.v));
    offset.v += 1;
  }
  return out;
}

export function parseMidi(buffer: ArrayBuffer): MidiSong {
  const view = new DataView(buffer);
  const offset = { v: 0 };

  if (buffer.byteLength < 14) throw new MidiParseError('File is too small to be a MIDI file.');

  const magic = readAscii(view, offset, 4);
  if (magic !== 'MThd') throw new MidiParseError('Not a MIDI file: missing MThd header.');

  const headerLength = view.getUint32(offset.v);
  offset.v += 4;
  const headerEnd = offset.v + headerLength;

  const format = view.getUint16(offset.v);
  const trackCount = view.getUint16(offset.v + 2);
  const division = view.getUint16(offset.v + 4);
  offset.v += 6;

  if ((division & 0x8000) !== 0) {
    throw new MidiParseError('SMPTE time division is not supported. Export the file as PPQ.');
  }
  const ppq = division;

  const tempos: MidiTempo[] = [];
  const tracks: { name: string; notes: MidiNote[] }[] = [];

  offset.v = headerEnd;

  for (let t = 0; t < trackCount && offset.v + 8 <= buffer.byteLength; t += 1) {
    const chunkType = readAscii(view, offset, 4);
    const chunkLength = view.getUint32(offset.v);
    offset.v += 4;
    const chunkEnd = offset.v + chunkLength;

    if (chunkType !== 'MTrk') {
      offset.v = chunkEnd; // unknown chunk: skip it
      continue;
    }

    const notes: MidiNote[] = [];
    let trackName = `Track ${t + 1}`;
    let tick = 0;
    let runningStatus = 0;

    // Open notes keyed by channel and pitch.
    const open = new Map<number, { startTick: number; velocity: number }>();

    while (offset.v < chunkEnd) {
      const delta = readVarLength(view, offset);
      tick += delta;

      let status = view.getUint8(offset.v);
      if (status < 0x80) {
        status = runningStatus; // running status: reuse the previous status byte
      } else {
        offset.v += 1;
        if (status < 0xf0) runningStatus = status;
      }

      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (status === 0xff) {
        const metaType = view.getUint8(offset.v);
        offset.v += 1;
        const length = readVarLength(view, offset);
        if (metaType === 0x51 && length === 3) {
          const usPerQuarter =
            (view.getUint8(offset.v) << 16) |
            (view.getUint8(offset.v + 1) << 8) |
            view.getUint8(offset.v + 2);
          tempos.push({ tick, usPerQuarter });
        } else if (metaType === 0x03 && length > 0) {
          trackName = readAscii(view, offset, Math.min(length, 40));
          offset.v += length - Math.min(length, 40);
          continue;
        }
        offset.v += length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVarLength(view, offset);
        offset.v += length;
        continue;
      }

      if (type === 0x90 || type === 0x80) {
        const midi = view.getUint8(offset.v);
        const velocity = view.getUint8(offset.v + 1);
        offset.v += 2;
        const key = channel * 128 + midi;
        const isOn = type === 0x90 && velocity > 0;
        if (isOn) {
          open.set(key, { startTick: tick, velocity });
        } else {
          const started = open.get(key);
          if (started) {
            notes.push({
              midi,
              startTick: started.startTick,
              durationTicks: Math.max(1, tick - started.startTick),
              channel,
              velocity: started.velocity,
            });
            open.delete(key);
          }
        }
        continue;
      }

      // Other channel messages have a fixed data length.
      if (type === 0xc0 || type === 0xd0) offset.v += 1;
      else offset.v += 2;
    }

    // Any note left hanging at the end of the track is closed at the last tick.
    for (const [key, started] of open) {
      notes.push({
        midi: key % 128,
        startTick: started.startTick,
        durationTicks: Math.max(1, tick - started.startTick),
        channel: Math.floor(key / 128),
        velocity: started.velocity,
      });
    }

    notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
    tracks.push({ name: trackName, notes });
    offset.v = chunkEnd;
  }

  if (tempos.length === 0) tempos.push({ tick: 0, usPerQuarter: 500_000 });

  const all = tracks.flatMap((t) => t.notes);
  all.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);

  return { format, ppq, tempos, tracks, notes: all };
}

/* --------------------------------------------------------- time conversion */

/** Piecewise-correct seconds-per-tick evaluator across all tempo changes. */
export function tickToSeconds(song: MidiSong): (tick: number) => number {
  const tempos = [...song.tempos].sort((a, b) => a.tick - b.tick);
  const points: { tick: number; sec: number; secPerTick: number }[] = [];

  let sec = 0;
  let prevTick = 0;
  let uspq = tempos[0]?.usPerQuarter ?? 500_000;

  for (const t of tempos) {
    if (t.tick > prevTick) {
      sec += ((t.tick - prevTick) * uspq) / 1e6 / song.ppq;
      prevTick = t.tick;
    }
    uspq = t.usPerQuarter;
    points.push({ tick: t.tick, sec, secPerTick: uspq / 1e6 / song.ppq });
  }
  if (points.length === 0) {
    points.push({ tick: 0, sec: 0, secPerTick: 500_000 / 1e6 / song.ppq });
  }

  return (tick: number) => {
    let point = points[0];
    for (const candidate of points) {
      if (candidate.tick <= tick) point = candidate;
      else break;
    }
    return point.sec + (tick - point.tick) * point.secPerTick;
  };
}

export function bpmOf(song: MidiSong): number {
  const first = [...song.tempos].sort((a, b) => a.tick - b.tick)[0];
  const uspq = first?.usPerQuarter ?? 500_000;
  return 60_000_000 / uspq;
}

/* ---------------------------------------------------------------- analysis */

export interface DifficultyReport {
  noteCount: number;
  lowMidi: number;
  highMidi: number;
  spanSemitones: number;
  maxLeap: number;
  meanLeap: number;
  bpm: number;
  durationSec: number;
  densityPerSec: number;
  maxPolyphony: number;
  /** 0 to 100. Higher is harder. */
  difficulty: number;
  grade: 1 | 2 | 3 | 4 | 5;
  suggestedBpm: number;
  reasons: string[];
}

function polyphonySweep(notes: MidiNote[]): number {
  const events: { tick: number; delta: number }[] = [];
  for (const n of notes) {
    events.push({ tick: n.startTick, delta: 1 });
    events.push({ tick: n.startTick + n.durationTicks, delta: -1 });
  }
  events.sort((a, b) => a.tick - b.tick || a.delta - b.delta);
  let current = 0;
  let max = 0;
  for (const e of events) {
    current += e.delta;
    if (current > max) max = current;
  }
  return max;
}

export function analyzeSong(song: MidiSong): DifficultyReport {
  const notes = song.notes;
  const toSec = tickToSeconds(song);
  const bpm = bpmOf(song);

  const reasons: string[] = [];

  if (notes.length === 0) {
    return {
      noteCount: 0,
      lowMidi: 60,
      highMidi: 60,
      spanSemitones: 0,
      maxLeap: 0,
      meanLeap: 0,
      bpm,
      durationSec: 0,
      densityPerSec: 0,
      maxPolyphony: 0,
      difficulty: 0,
      grade: 1,
      suggestedBpm: 80,
      reasons: ['No notes found. The file may be empty or use an unsupported encoding.'],
    };
  }

  // Melody line: highest note at each onset, which is the right-hand approximation.
  const melody: number[] = [];
  let lastTick = -1;
  for (const n of notes) {
    if (n.startTick === lastTick) {
      if (n.midi > melody[melody.length - 1]) melody[melody.length - 1] = n.midi;
      continue;
    }
    melody.push(n.midi);
    lastTick = n.startTick;
  }

  const low = Math.min(...notes.map((n) => n.midi));
  const high = Math.max(...notes.map((n) => n.midi));

  let maxLeap = 0;
  let leapSum = 0;
  for (let i = 1; i < melody.length; i += 1) {
    const leap = Math.abs(melody[i] - melody[i - 1]);
    leapSum += leap;
    if (leap > maxLeap) maxLeap = leap;
  }
  const meanLeap = melody.length > 1 ? leapSum / (melody.length - 1) : 0;

  const startSec = toSec(0);
  const endSec = Math.max(...notes.map((n) => toSec(n.startTick + n.durationTicks)));
  const durationSec = Math.max(0.1, endSec - startSec);
  const densityPerSec = notes.length / durationSec;
  const maxPolyphony = polyphonySweep(notes);

  const spanSemitones = high - low;
  const f = {
    span: Math.min(1, spanSemitones / 24),
    density: Math.min(1, densityPerSec / 6),
    leap: Math.min(1, maxLeap / 12),
    poly: Math.min(1, (maxPolyphony - 1) / 3),
    tempo: Math.min(1, bpm / 160),
  };
  const difficulty = Math.round(
    100 * (0.25 * f.span + 0.25 * f.density + 0.2 * f.leap + 0.15 * f.poly + 0.15 * f.tempo),
  );
  const grade = Math.min(5, Math.max(1, 1 + Math.floor(difficulty / 20))) as DifficultyReport['grade'];

  if (spanSemitones > 24) reasons.push(`Wide range: ${spanSemitones} semitones (${low} to ${high}).`);
  if (maxLeap > 12) reasons.push(`Large leap of ${maxLeap} semitones in the melody.`);
  if (densityPerSec > 3) reasons.push(`Dense: about ${densityPerSec.toFixed(1)} notes per second.`);
  if (maxPolyphony > 2) reasons.push(`Chords up to ${maxPolyphony} notes at once.`);
  if (bpm > 120) reasons.push(`Fast tempo: ${Math.round(bpm)} BPM.`);
  if (reasons.length === 0) reasons.push('No unusual demands detected. Reasonable for a first pass.');

  const suggestedBpm = Math.max(
    40,
    Math.min(200, Math.round(bpm * (difficulty > 60 ? 0.55 : difficulty > 35 ? 0.7 : 0.85))),
  );

  return {
    noteCount: notes.length,
    lowMidi: low,
    highMidi: high,
    spanSemitones,
    maxLeap,
    meanLeap,
    bpm,
    durationSec,
    densityPerSec,
    maxPolyphony,
    difficulty,
    grade,
    suggestedBpm,
    reasons,
  };
}

/* ------------------------------------------------- staged simplification */

export type Voice = 'right' | 'left';

export interface SongStage {
  level: number;
  label: string;
  description: string;
  notes: number[];
  beats: number[];
  bpm: number;
}

interface TimelineEvent {
  tick: number;
  midi: number;
  beats: number;
  voice: Voice;
}

const RIGHT_LOW = 60; // C4
const RIGHT_HIGH = 74; // D5
const LEFT_LOW = 48; // C3
const LEFT_HIGH = 60; // C4

/**
 * Imported arrangements are validated against the whole playable keyboard rather
 * than the C major curriculum register, because a bass note at C3 followed by a
 * melody note at C5 is a legitimate octave-plus hand move, not an error.
 */
export const IMPORTED_RANGE = { low: 48, high: 76, maxLeap: 12 } as const;

/** Fold a pitch into a register by octaves, so nothing is unplayable. */
export function foldIntoRange(midi: number, low: number, high: number): number {
  let m = midi;
  while (m < low) m += 12;
  while (m > high) m -= 12;
  return Math.min(high, Math.max(low, m));
}

function onsetGroups(song: MidiSong, grid: number): { tick: number; notes: MidiNote[] }[] {
  const groups = new Map<number, MidiNote[]>();
  for (const n of song.notes) {
    const q = Math.round(n.startTick / grid) * grid;
    const bucket = groups.get(q);
    if (bucket) bucket.push(n);
    else groups.set(q, [n]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, notes]) => ({ tick, notes }));
}

/** Right hand: highest note per onset, folded into the treble register. */
function rightHandTimeline(song: MidiSong): TimelineEvent[] {
  const grid = Math.max(1, Math.round(song.ppq / 2));
  const groups = onsetGroups(song, grid);
  const out: TimelineEvent[] = [];

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const top = group.notes.reduce((a, b) => (b.midi > a.midi ? b : a));
    const nextTick = groups[i + 1]?.tick ?? group.tick + grid;
    const rawBeats = (nextTick - group.tick) / song.ppq;
    out.push({
      tick: group.tick,
      midi: foldIntoRange(top.midi, RIGHT_LOW, RIGHT_HIGH),
      beats: Math.min(4, Math.max(0.5, Math.round(rawBeats * 2) / 2)),
      voice: 'right',
    });
  }
  return out;
}

/** Left hand: lowest note per bucket, folded into the bass register. */
function leftHandTimeline(song: MidiSong, everyBeats: number): TimelineEvent[] {
  const bucketTicks = Math.max(1, Math.round(song.ppq * everyBeats));
  const buckets = new Map<number, MidiNote[]>();

  for (const n of song.notes) {
    const key = Math.floor(n.startTick / bucketTicks) * bucketTicks;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(n);
    else buckets.set(key, [n]);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, notes]) => ({
      tick,
      midi: foldIntoRange(
        notes.reduce((a, b) => (b.midi < a.midi ? b : a)).midi,
        LEFT_LOW,
        LEFT_HIGH,
      ),
      beats: everyBeats,
      voice: 'left' as Voice,
    }));
}

/**
 * Merge voices into one monophonic line.
 *
 * A computer keyboard cannot hold two hands, and most membrane boards cannot even
 * report a triad reliably, so simultaneous events are serialised: bass first, then
 * the melody pushed slightly later. The arrangement keeps the shape of the piece
 * while staying playable on one row of keys.
 */
function serialize(events: TimelineEvent[], song: MidiSong): { notes: number[]; beats: number[] } {
  const nudge = Math.max(1, Math.round(song.ppq / 4));
  const sorted = [...events].sort((a, b) => a.tick - b.tick || (a.voice === 'left' ? -1 : 1));

  const notes: number[] = [];
  const beats: number[] = [];
  let previousTick = -1;

  for (const event of sorted) {
    const tick = event.tick <= previousTick ? previousTick + nudge : event.tick;
    previousTick = tick;
    notes.push(event.midi);
    beats.push(event.beats);
  }

  // Collapse immediate repeats, which are an artefact of the reduction.
  const compactedNotes: number[] = [];
  const compactedBeats: number[] = [];
  for (let i = 0; i < notes.length; i += 1) {
    const last = compactedNotes.length - 1;
    if (last >= 0 && compactedNotes[last] === notes[i]) {
      compactedBeats[last] = Math.min(4, compactedBeats[last] + beats[i]);
      continue;
    }
    compactedNotes.push(notes[i]);
    compactedBeats.push(beats[i]);
  }

  const cap = 72;
  return { notes: compactedNotes.slice(0, cap), beats: compactedBeats.slice(0, cap) };
}

/**
 * Five staged arrangements, mirroring the ladder in the brief:
 * 1 right hand only, 2 faster, 3 add a sparse left hand, 4 fuller left hand,
 * 5 the written rhythm as far as one keyboard can carry it.
 */
export function buildStages(song: MidiSong, report: DifficultyReport): SongStage[] {
  const right = rightHandTimeline(song);
  const leftSparse = leftHandTimeline(song, 4);
  const leftFull = leftHandTimeline(song, 2);

  const base = report.suggestedBpm;
  const stages: SongStage[] = [];

  const push = (
    level: number,
    label: string,
    description: string,
    events: TimelineEvent[],
    bpm: number,
  ) => {
    const { notes, beats } = serialize(events, song);
    if (notes.length < 2) return;
    stages.push({ level, label, description, notes, beats, bpm });
  };

  push(1, 'Right hand only', 'Melody, quantised, folded into C4 to D5.', right, base);
  push(
    2,
    'Right hand, faster',
    'The same melody at a higher tempo.',
    right,
    Math.min(200, Math.round(base * 1.25)),
  );
  push(3, 'Add a sparse bass', 'Melody plus one bass note per bar.', [...leftSparse, ...right], base);
  push(
    4,
    'Fuller bass',
    'Melody plus a bass note every two beats.',
    [...leftFull, ...right],
    Math.round(base * 1.1),
  );

  const grid = Math.max(1, Math.round(song.ppq / 4));
  const written: TimelineEvent[] = onsetGroups(song, grid).map((group) => {
    const top = group.notes.reduce((a, b) => (b.midi > a.midi ? b : a));
    return {
      tick: group.tick,
      midi: foldIntoRange(top.midi, RIGHT_LOW, RIGHT_HIGH),
      beats: Math.min(4, Math.max(0.5, Math.round((top.durationTicks / song.ppq) * 2) / 2)),
      voice: 'right' as Voice,
    };
  });
  push(
    5,
    'Written rhythm',
    'The note lengths as written, still reduced to one hand.',
    written,
    Math.round(base * 1.35),
  );

  return stages.sort((a, b) => a.level - b.level);
}

/** Wrap a stage as a practice lesson the rest of the app already understands. */
export function stageToLesson(stage: SongStage, title: string): Lesson {
  return {
    id: `midi-${slug(title)}-L${stage.level}`,
    title,
    subtitle: `Stage ${stage.level}: ${stage.label}`,
    category: 'songs',
    mode: 'patient',
    targetBpm: stage.bpm,
    notes: stage.notes,
    beats: stage.beats,
    tip: stage.description,
    generated: true,
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}