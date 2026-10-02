'use client';

import { useCallback, useRef, useState } from 'react';
import type { Lesson } from '@/lib/lessons';
import { noteLabel } from '@/lib/notes';
import {
  MidiParseError,
  analyzeSong,
  buildStages,
  parseMidi,
  stageToLesson,
  type DifficultyReport,
  type MidiSong,
  type SongStage,
} from '@/lib/midi';

interface Loaded {
  name: string;
  song: MidiSong;
  report: DifficultyReport;
  stages: SongStage[];
}

/**
 * Song learning from a user-supplied MIDI file.
 *
 * The brief's legal section: shipping copyrighted songs is the risk, so the safe
 * path is public domain material or user-supplied files. This is user-supplied.
 * The file is read in the browser with `arrayBuffer()`, never uploaded, never
 * stored and never redistributed.
 *
 * The pipeline the brief sketches is implemented end to end:
 *   file -> notes -> difficulty analysis -> staged simplification -> practice
 */
export default function MidiImport({ onStartLesson }: { onStartLesson: (lesson: Lesson) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const song = parseMidi(buffer);
      if (song.notes.length === 0) {
        setError('No notes found in that file. It may be empty, or contain only controller data.');
        setLoaded(null);
        return;
      }
      const report = analyzeSong(song);
      const stages = buildStages(song, report);
      setLoaded({ name: file.name.replace(/\.midi?$/i, ''), song, report, stages });
    } catch (e) {
      setError(
        e instanceof MidiParseError
          ? e.message
          : 'Could not read that file. Standard MIDI files (.mid or .midi) only.',
      );
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-xs">Song learning</p>
            <h2 className="mt-1 font-display text-2xl leading-tight text-ink">
              Turn a MIDI file into a lesson ladder.
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
              Load a <span className="font-mono text-ink">.mid</span> file. It is parsed in your
              browser and never uploaded. You get a difficulty report and five staged arrangements,
              from right hand only up to the written rhythm.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? 'Reading' : 'Choose MIDI file'}
            </button>
            <span className="text-[11px] text-muted">Nothing leaves this device</span>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".mid,.midi,audio/midi"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-wrong/40 bg-wrong/[0.07] px-3 py-2 text-[12px] text-muted"
          >
            <span className="text-wrong">Not loaded: </span>
            {error}
          </p>
        ) : null}
      </div>

      {loaded ? (
        <>
          <div className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg text-ink">{loaded.name}</h3>
              <div className="flex flex-wrap gap-2">
                <span className="chip">grade {loaded.report.grade}/5</span>
                <span className="chip">difficulty {loaded.report.difficulty}</span>
                <span className="chip">format {loaded.song.format}</span>
                <span className="chip">{loaded.song.tracks.length} tracks</span>
              </div>
            </div>

            <dl className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="notes" value={`${loaded.report.noteCount}`} />
              <Metric label="tempo" value={`${Math.round(loaded.report.bpm)} bpm`} />
              <Metric label="suggested" value={`${loaded.report.suggestedBpm} bpm`} />
              <Metric label="length" value={`${loaded.report.durationSec.toFixed(1)} s`} />
              <Metric
                label="range"
                value={`${noteLabel(loaded.report.lowMidi)} to ${noteLabel(loaded.report.highMidi)}`}
              />
              <Metric label="max leap" value={`${loaded.report.maxLeap} st`} />
            </dl>

            <ul className="mt-3 space-y-1">
              {loaded.report.reasons.map((reason) => (
                <li key={reason} className="text-[12px] leading-snug text-muted">
                  {reason}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Suggested tempo sits below the written tempo when the analysis says the piece is dense
              or wide. Slow first, correct second, fast last.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {loaded.stages.map((stage) => (
              <div key={stage.level} className="panel flex h-full flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-base text-ink">
                    Stage {stage.level}: {stage.label}
                  </span>
                  <span className="chip">{stage.bpm} bpm</span>
                </div>
                <p className="text-[12px] leading-snug text-muted">{stage.description}</p>
                <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-1">
                  {stage.notes.slice(0, 16).map((n, i) => (
                    <span
                      key={`${n}-${i}`}
                      className="shrink-0 rounded-md border border-line/70 bg-bg2/60 px-1.5 py-0.5 font-mono text-[11px] text-ink"
                    >
                      {noteLabel(n)}
                    </span>
                  ))}
                  {stage.notes.length > 16 ? (
                    <span className="shrink-0 px-1 py-0.5 text-[11px] text-muted">
                      +{stage.notes.length - 16}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn mt-auto py-2"
                  onClick={() => onStartLesson(stageToLesson(stage, loaded.name))}
                >
                  Practise this stage
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="panel p-4">
          <p className="text-[12px] leading-relaxed text-muted">
            No file loaded. The Learn tab already has public domain songs if you want something to
            play right now.
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/60 bg-panel2/40 px-2.5 py-2">
      <dt className="label-xs">{label}</dt>
      <dd className="tabular mt-1 font-mono text-[13px] text-ink">{value}</dd>
    </div>
  );
}