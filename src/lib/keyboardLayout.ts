/**
 * Keyboard layout handling.
 *
 * The engine always keys off `event.code` (physical key position), which is what
 * makes the ergonomics work: the white keys are always the home row and the black
 * keys are always the row above, no matter which layout is active. What was
 * missing is the *label*: the character actually printed on the user's keycap.
 * This module supplies it.
 *
 * A French AZERTY user must see `Q S D F G H J K L` on the piano keys, not
 * `A S D F G H J K L`, because that is what is printed on their board. The
 * mapping stays positional, so the ergonomics are identical.
 *
 * Label resolution order, best source first:
 *   1. `navigator.keyboard.getLayoutMap()`  (Chromium: exact, any layout)
 *   2. labels learned from real key presses (any browser, any layout)
 *   3. a stored preset chosen by the user
 *   4. the QWERTY preset
 */

export type LayoutId = 'auto' | 'qwerty' | 'azerty' | 'qwertz' | 'dvorak';

export type LabelMap = Record<string, string>;

export const LAYOUT_CHOICES: { id: LayoutId; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto detect', hint: 'Read from the browser, then from your key presses' },
  { id: 'qwerty', label: 'QWERTY', hint: 'English US / UK' },
  { id: 'azerty', label: 'AZERTY', hint: 'French / Belgian' },
  { id: 'qwertz', label: 'QWERTZ', hint: 'German / Swiss' },
  { id: 'dvorak', label: 'Dvorak', hint: 'Dvorak simplified' },
];

/**
 * Presets hold only the codes this app uses. `event.code` names are QWERTY
 * positions, so each entry is "what is printed on the key standing at the QWERTY
 * position of that code".
 */
export const LAYOUT_PRESETS: Record<Exclude<LayoutId, 'auto'>, LabelMap> = {
  qwerty: {
    Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
    KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M',
    KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J',
    KeyK: 'K', KeyL: 'L', Semicolon: ';',
    KeyQ: 'Q', KeyW: 'W', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyI: 'I', KeyO: 'O',
  },
  azerty: {
    // Number row on AZERTY is & e " ' ( - e ` _ ç, so the first five differ.
    Digit1: '&', Digit2: 'E', Digit3: '"', Digit4: "'", Digit5: '(',
    // Bottom row on AZERTY is W X C V B N , so KeyM shows a comma.
    KeyZ: 'W', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: ',',
    // Home row on AZERTY is Q S D F G H J K L M, so KeyA shows a Q.
    KeyA: 'Q', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J',
    KeyK: 'K', KeyL: 'L', Semicolon: 'M',
    // Top row on AZERTY is A Z E R T Y U I O P, so KeyQ shows an A.
    KeyQ: 'A', KeyW: 'Z', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyI: 'I', KeyO: 'O',
  },
  qwertz: {
    Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
    KeyZ: 'Y', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M',
    KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J',
    KeyK: 'K', KeyL: 'L', Semicolon: 'O',
    KeyQ: 'Q', KeyW: 'W', KeyR: 'R', KeyT: 'T', KeyY: 'Z', KeyI: 'I', KeyO: 'P',
  },
  dvorak: {
    Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
    KeyZ: ';', KeyX: 'Q', KeyC: 'J', KeyV: 'K', KeyB: 'X', KeyN: 'B', KeyM: 'M',
    KeyA: 'A', KeyS: 'O', KeyD: 'E', KeyF: 'U', KeyG: 'I', KeyH: 'D', KeyJ: 'H',
    KeyK: 'T', KeyL: 'N', Semicolon: 'S',
    KeyQ: "'", KeyW: ',', KeyR: 'P', KeyT: 'Y', KeyY: 'F', KeyI: 'C', KeyO: 'R',
  },
};

/** Human description of where a physical key sits, for aria labels and help. */
export const CODE_POSITION: Record<string, string> = {
  Digit1: 'number row, first key',
  Digit2: 'number row, second key',
  Digit3: 'number row, third key',
  Digit4: 'number row, fourth key',
  Digit5: 'number row, fifth key',
  KeyZ: 'bottom row, first key',
  KeyX: 'bottom row, second key',
  KeyC: 'bottom row, third key',
  KeyV: 'bottom row, fourth key',
  KeyB: 'bottom row, fifth key',
  KeyN: 'bottom row, sixth key',
  KeyM: 'bottom row, seventh key',
  KeyA: 'home row, first key',
  KeyS: 'home row, second key',
  KeyD: 'home row, third key',
  KeyF: 'home row, fourth key',
  KeyG: 'home row, fifth key',
  KeyH: 'home row, sixth key',
  KeyJ: 'home row, seventh key',
  KeyK: 'home row, eighth key',
  KeyL: 'home row, ninth key',
  Semicolon: 'home row, tenth key',
  KeyQ: 'top row, first key',
  KeyW: 'top row, second key',
  KeyR: 'top row, fourth key',
  KeyT: 'top row, fifth key',
  KeyY: 'top row, sixth key',
  KeyI: 'top row, eighth key',
  KeyO: 'top row, ninth key',
};

/**
 * Fold one real key press into the learned label map. Only printable single
 * characters count: named keys report values like 'Shift' or 'ArrowUp', which are
 * not keycap legends.
 */
export function learnLabel(map: LabelMap, code: string, key: string): LabelMap {
  if (key.length !== 1) return map;
  const next = key.toUpperCase();
  if (map[code] === next) return map;
  return { ...map, [code]: next };
}

/** Score how well an observed label map matches a preset. */
export function scoreAgainstPreset(preset: LabelMap, observed: LabelMap): number {
  let score = 0;
  for (const code of Object.keys(preset)) {
    const got = observed[code];
    if (got === undefined) continue;
    score += got === preset[code] ? 1 : -2;
  }
  return score;
}

/**
 * Pick the preset that best explains the labels learned so far. Returns null when
 * there is not yet enough evidence, so the UI keeps the stored choice.
 */
export function inferLayout(observed: LabelMap, minVotes = 2): LayoutId | null {
  let best: LayoutId | null = null;
  let bestScore = minVotes - 1;
  for (const id of ['qwerty', 'azerty', 'qwertz', 'dvorak'] as const) {
    const score = scoreAgainstPreset(LAYOUT_PRESETS[id], observed);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** Turn a `getLayoutMap()` result into a label map for the codes we use. */
export function labelsFromLayoutMap(layoutMap: Map<string, string>): LabelMap {
  const out: LabelMap = {};
  for (const code of Object.keys(CODE_POSITION)) {
    const key = layoutMap.get(code);
    if (key && key.length === 1) out[code] = key.toUpperCase();
  }
  return out;
}

export function resolveLabels(
  layoutId: LayoutId,
  learned: LabelMap,
  fromApi: LabelMap | null,
): LabelMap {
  const preset = layoutId === 'auto' ? LAYOUT_PRESETS.qwerty : LAYOUT_PRESETS[layoutId];
  return { ...preset, ...learned, ...(fromApi ?? {}) };
}

/** Best-effort read of the browser's keyboard layout map. Chromium only. */
export async function readLayoutMap(): Promise<LabelMap | null> {
  if (typeof navigator === 'undefined') return null;
  const kb = (
    navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }
  ).keyboard;
  if (!kb?.getLayoutMap) return null;
  try {
    return labelsFromLayoutMap(await kb.getLayoutMap());
  } catch {
    return null;
  }
}

/** The label to print on a key, with the QWERTY letter as the last resort. */
export function labelForCode(labels: LabelMap, code: string): string {
  const direct = labels[code];
  if (direct) return direct;
  if (code.startsWith('Key')) return code.slice(3);
  return code;
}