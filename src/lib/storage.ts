import { useCallback, useSyncExternalStore } from 'react';

// All persistence is localStorage. Nothing leaves the browser.

const KEY = 'unmanaged.v1';

export interface DrillAttempt {
  /** Index of the option chosen first. */
  firstChoice: number;
  correctFirstTry: boolean;
  at: number;
}

interface Stored {
  read: string[];
  lastLesson?: { trackId: string; lessonId: string };
  theme?: 'dark' | 'light';
  drills: Record<string, DrillAttempt>;
  /** "projectId/milestoneId" */
  milestones: string[];
}

const listeners = new Set<() => void>();
let cache: Stored = load();

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Stored>) : {};
    return {
      read: Array.isArray(p.read) ? p.read : [],
      lastLesson: p.lastLesson,
      theme: p.theme,
      drills: p.drills && typeof p.drills === 'object' ? p.drills : {},
      milestones: Array.isArray(p.milestones) ? p.milestones : [],
    };
  } catch {
    return { read: [], drills: {}, milestones: [] };
  }
}

function write(next: Stored) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or quota: progress simply won't persist.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Keep tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      cache = load();
      listeners.forEach((l) => l());
    }
  });
}

export function useStored(): Stored {
  return useSyncExternalStore(subscribe, () => cache);
}

export function useProgress() {
  const stored = useStored();
  const setRead = useCallback((lessonId: string, read: boolean) => {
    const set = new Set(cache.read);
    if (read) set.add(lessonId);
    else set.delete(lessonId);
    write({ ...cache, read: [...set] });
  }, []);
  const visit = useCallback((trackId: string, lessonId: string) => {
    if (cache.lastLesson?.lessonId === lessonId) return;
    write({ ...cache, lastLesson: { trackId, lessonId } });
  }, []);
  return { read: new Set(stored.read), lastLesson: stored.lastLesson, setRead, visit };
}

export function useDrillAttempts() {
  const stored = useStored();
  const record = useCallback((drillId: string, firstChoice: number, correct: boolean) => {
    if (cache.drills[drillId]) return; // first try is what counts for review
    write({ ...cache, drills: { ...cache.drills, [drillId]: { firstChoice, correctFirstTry: correct, at: Date.now() } } });
  }, []);
  const reset = useCallback((drillId: string) => {
    const next = { ...cache.drills };
    delete next[drillId];
    write({ ...cache, drills: next });
  }, []);
  return { attempts: stored.drills, record, reset };
}

export function useMilestones() {
  const stored = useStored();
  const toggle = useCallback((key: string) => {
    const set = new Set(cache.milestones);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    write({ ...cache, milestones: [...set] });
  }, []);
  return { done: new Set(stored.milestones), toggle };
}

export function useTheme() {
  const stored = useStored();
  const theme = stored.theme ?? 'dark';
  const toggle = useCallback(() => {
    write({ ...cache, theme: (cache.theme ?? 'dark') === 'dark' ? 'light' : 'dark' });
  }, []);
  return { theme, toggle };
}

export function clearAllProgress() {
  write({ read: [], drills: {}, milestones: [], theme: cache.theme });
}
