'use client';

import { useEffect } from 'react';
import { useProgress } from '@/lib/progress';
import { useSettings } from '@/lib/settings';

/**
 * Rehydrates the persisted stores on the client.
 *
 * Both stores set `skipHydration` so the server HTML and the first client render
 * match exactly. Rehydrating here, in an effect, avoids React hydration
 * mismatches for any component that reads persisted state.
 */
export default function StoreHydrator() {
  useEffect(() => {
    void useProgress.persist.rehydrate();
    void useSettings.persist.rehydrate();
  }, []);

  return null;
}