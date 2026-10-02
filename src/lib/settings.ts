/**
 * User settings, persisted in this browser.
 *
 * Split out from the progress store so that progress data (which is the thing a
 * future Supabase table would hold) stays separate from device preferences
 * (which should stay local).
 *
 * `skipHydration` is on for the same reason as the progress store: it keeps the
 * server render and the first client render identical.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LabelMap, LayoutId } from './keyboardLayout';
import { DEFAULT_TUNING, type TuningState, type VoicingId, type VoicingOverrides } from './voicing';

export type SkillLevel = 'beginner' | 'elementary' | 'intermediate';

/** How timing is reported. Beginners cannot use milliseconds, so words are default. */
export type TimingDisplay = 'words' | 'numbers';

/** How a practice run is set up. */
export type PracticeMode = 'listen' | 'echo' | 'together';

export interface SkillEstimate {
  level: SkillLevel;
  /** 0 to 100, from the placement assessment. */
  score: number;
  /** Suggested starting tempo. */
  startBpm: number;
  at: number;
}

interface SettingsState {
  /* keyboard */
  layoutId: LayoutId;
  learnedLabels: LabelMap;
  showKeyHints: boolean;
  showNoteNames: boolean;

  /* sound */
  voicing: VoicingId;
  /** User tweaks on top of the preset, so a reference recording can be matched. */
  voicingOverrides: VoicingOverrides;
  tuning: TuningState;
  masterVolume: number;
  metronomeVolume: number;
  muted: boolean;

  /* timing */
  latencyCompensation: boolean;
  /** Manual offset in ms, from the calibration screen. Positive means "I am late". */
  latencyOffsetMs: number;

  /* interface */
  reducedMotion: boolean;

  /* learning */
  dailyNoteGoal: number;
  skill: SkillEstimate | null;
  onboarded: boolean;

  /* feedback and practice shape */
  timingDisplay: TimingDisplay;
  practiceMode: PracticeMode;
  /** Play a demo automatically before the first attempt at a new lesson. */
  listenFirst: boolean;
  /** Opt in to the reference arrangements, which are still in copyright. */
  showReferenceSongs: boolean;

  setLayoutId: (id: LayoutId) => void;
  mergeLearnedLabels: (labels: LabelMap) => void;
  setShowKeyHints: (v: boolean) => void;
  setShowNoteNames: (v: boolean) => void;
  setVoicing: (id: VoicingId) => void;
  setVoicingOverride: (key: keyof VoicingOverrides, value: number | undefined) => void;
  setTuning: (tuning: Partial<TuningState>) => void;
  resetVoicing: () => void;
  setMasterVolume: (v: number) => void;
  setMetronomeVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
  setLatencyCompensation: (v: boolean) => void;
  setLatencyOffsetMs: (v: number) => void;
  setReducedMotion: (v: boolean) => void;
  setDailyNoteGoal: (v: number) => void;
  setSkill: (s: SkillEstimate) => void;
  setOnboarded: (v: boolean) => void;
  setTimingDisplay: (v: TimingDisplay) => void;
  setPracticeMode: (v: PracticeMode) => void;
  setListenFirst: (v: boolean) => void;
  setShowReferenceSongs: (v: boolean) => void;
  resetSettings: () => void;
}

const DEFAULTS = {
  layoutId: 'auto' as LayoutId,
  learnedLabels: {} as LabelMap,
  showKeyHints: true,
  showNoteNames: true,
  voicing: 'concert' as VoicingId,
  voicingOverrides: {} as VoicingOverrides,
  tuning: { ...DEFAULT_TUNING },
  masterVolume: 0.75,
  metronomeVolume: 0.55,
  muted: false,
  latencyCompensation: true,
  latencyOffsetMs: 0,
  reducedMotion: false,
  dailyNoteGoal: 30,
  skill: null as SkillEstimate | null,
  onboarded: false,
  timingDisplay: 'words' as TimingDisplay,
  practiceMode: 'echo' as PracticeMode,
  listenFirst: true,
  showReferenceSongs: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setLayoutId: (layoutId) => set({ layoutId }),
      mergeLearnedLabels: (labels) =>
        set((s) => {
          let changed = false;
          const merged = { ...s.learnedLabels };
          for (const [code, label] of Object.entries(labels)) {
            if (merged[code] !== label) {
              merged[code] = label;
              changed = true;
            }
          }
          return changed ? { learnedLabels: merged } : {};
        }),
      setShowKeyHints: (showKeyHints) => set({ showKeyHints }),
      setShowNoteNames: (showNoteNames) => set({ showNoteNames }),
      setVoicing: (voicing) => set({ voicing }),
      setVoicingOverride: (key, value) =>
        set((s) => {
          const next: VoicingOverrides = { ...s.voicingOverrides };
          if (value === undefined) delete next[key];
          else next[key] = value;
          return { voicingOverrides: next };
        }),
      setTuning: (partial) => set((s) => ({ tuning: { ...s.tuning, ...partial } })),
      resetVoicing: () => set({ voicing: 'concert', voicingOverrides: {}, tuning: { ...DEFAULT_TUNING } }),
      setMasterVolume: (v) => set({ masterVolume: clamp01(v) }),
      setMetronomeVolume: (v) => set({ metronomeVolume: clamp01(v) }),
      setMuted: (muted) => set({ muted }),
      setLatencyCompensation: (latencyCompensation) => set({ latencyCompensation }),
      setLatencyOffsetMs: (v) => set({ latencyOffsetMs: Math.max(-250, Math.min(250, Math.round(v))) }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setDailyNoteGoal: (v) => set({ dailyNoteGoal: Math.max(5, Math.min(300, Math.round(v))) }),
      setSkill: (skill) => set({ skill }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setTimingDisplay: (timingDisplay) => set({ timingDisplay }),
      setPracticeMode: (practiceMode) => set({ practiceMode }),
      setListenFirst: (listenFirst) => set({ listenFirst }),
      setShowReferenceSongs: (showReferenceSongs) => set({ showReferenceSongs }),
      resetSettings: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'keycoach.settings.v1',
      version: 1,
      skipHydration: true,
    },
  ),
);

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}