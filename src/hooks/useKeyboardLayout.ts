'use client';

/**
 * Keyboard layout hook.
 *
 * Answers one question everywhere in the UI: "which character is printed on the
 * key that plays this note?" On AZERTY that is `Q` for C4, not `A`.
 *
 * It learns the layout three ways, cheapest first:
 *   1. `navigator.keyboard.getLayoutMap()` once on mount, when available
 *   2. a listener that folds every real key press into a learned label map
 *   3. a preset the user picked in settings
 *
 * The learning listener is passive: it never calls preventDefault, so it cannot
 * interfere with the practice timing path.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CODE_POSITION,
  inferLayout,
  labelForCode,
  learnLabel,
  readLayoutMap,
  resolveLabels,
  type LabelMap,
  type LayoutId,
} from '@/lib/keyboardLayout';
import { codeForMidi } from '@/lib/notes';
import { useSettings } from '@/lib/settings';

export interface KeyboardLayoutApi {
  /** Resolved code -> keycap legend map. */
  labels: LabelMap;
  /** What the user chose. 'auto' means detect. */
  layoutId: LayoutId;
  /** What is actually being displayed, never 'auto'. */
  effectiveLayout: LayoutId;
  /** True when the browser itself supplied the map, so it is exact. */
  exact: boolean;
  setLayoutId: (id: LayoutId) => void;
  /** Keycap legend for a note, e.g. "Q" on AZERTY for C4. */
  labelForMidi: (midi: number, octaveShift?: number) => string | null;
  /** Where that key physically sits, e.g. "home row, first key". */
  positionForMidi: (midi: number, octaveShift?: number) => string | null;
}

export function useKeyboardLayout(): KeyboardLayoutApi {
  const layoutId = useSettings((s) => s.layoutId);
  const learned = useSettings((s) => s.learnedLabels);
  const setLayoutId = useSettings((s) => s.setLayoutId);
  const mergeLearnedLabels = useSettings((s) => s.mergeLearnedLabels);

  const [apiLabels, setApiLabels] = useState<LabelMap | null>(null);

  // Exact map from the browser, when it exposes one.
  useEffect(() => {
    let alive = true;
    void readLayoutMap().then((map) => {
      if (alive && map && Object.keys(map).length > 0) setApiLabels(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  // While on 'auto', promote a confident guess from observed key presses to a
  // real preset. Getting this wrong is harmless: the learned labels win anyway.
  const guess = useMemo(() => inferLayout(learned, 3), [learned]);
  useEffect(() => {
    if (layoutId === 'auto' && guess && guess !== 'auto') setLayoutId(guess);
  }, [guess, layoutId, setLayoutId]);

  // Learn from every key press, from anywhere in the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!(e.code in CODE_POSITION)) return;
      const next = learnLabel({}, e.code, e.key);
      if (Object.keys(next).length > 0) mergeLearnedLabels(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mergeLearnedLabels]);

  const labels = useMemo(
    () => resolveLabels(layoutId, learned, apiLabels),
    [apiLabels, layoutId, learned],
  );

  const labelForMidi = useCallback(
    (midi: number, octaveShift = 0): string | null => {
      const code = codeForMidi(midi, octaveShift);
      return code ? labelForCode(labels, code) : null;
    },
    [labels],
  );

  const positionForMidi = useCallback((midi: number, octaveShift = 0): string | null => {
    const code = codeForMidi(midi, octaveShift);
    return code ? (CODE_POSITION[code] ?? null) : null;
  }, []);

  return {
    labels,
    layoutId,
    effectiveLayout: layoutId === 'auto' ? (guess ?? 'qwerty') : layoutId,
    exact: apiLabels !== null,
    setLayoutId,
    labelForMidi,
    positionForMidi,
  };
}