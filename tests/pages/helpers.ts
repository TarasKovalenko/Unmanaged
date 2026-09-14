// Test helpers for page tests.
import { act } from '@testing-library/react';

const KEY = 'unmanaged.v1';

export interface SeedState {
  read?: string[];
  lastLesson?: { trackId: string; lessonId: string };
  drills?: Record<string, { firstChoice: number; correctFirstTry: boolean; at: number }>;
  milestones?: string[];
  theme?: 'dark' | 'light';
}

/** Writes stored progress and tells the storage module to reload it, the same
 *  way another tab's write would (a `storage` event). */
export function seedStorage(state: SeedState) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
}

export function storedState(): SeedState {
  return JSON.parse(localStorage.getItem(KEY) ?? '{}') as SeedState;
}

export function attempt(correctFirstTry: boolean) {
  return { firstChoice: 0, correctFirstTry, at: 1 };
}

/** Navigates like a user following a link: the hash changes and `hashchange` fires. */
export function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
