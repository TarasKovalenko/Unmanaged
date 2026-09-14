import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

type StorageModule = typeof import('../../src/lib/storage.ts');

const KEY = 'unmanaged.v1';

/** Imports a fresh copy of the storage module, which reads localStorage once on load. */
async function loadStorage(stored?: string): Promise<StorageModule> {
  if (stored !== undefined) localStorage.setItem(KEY, stored);
  vi.resetModules();
  return import('../../src/lib/storage.ts');
}

const persisted = () => JSON.parse(localStorage.getItem(KEY)!);

function otherTabWrites(key: string, value: unknown) {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
}

describe('useStored', () => {
  test('starts empty when nothing is stored', async () => {
    const { useStored } = await loadStorage();
    const { result } = renderHook(() => useStored());
    expect(result.current).toEqual({ read: [], lastLesson: undefined, theme: undefined, drills: {}, milestones: [] });
  });

  test('loads everything that was stored', async () => {
    const saved = {
      read: ['moves'],
      lastLesson: { trackId: 'ownership', lessonId: 'moves' },
      theme: 'light',
      drills: { d1: { firstChoice: 2, correctFirstTry: false, at: 5 } },
      milestones: ['p1/m1'],
    };
    const { useStored } = await loadStorage(JSON.stringify(saved));
    const { result } = renderHook(() => useStored());
    expect(result.current).toEqual(saved);
  });

  test('starts empty when the stored JSON is corrupt', async () => {
    const { useStored } = await loadStorage('{"read": [');
    const { result } = renderHook(() => useStored());
    expect(result.current).toEqual({ read: [], drills: {}, milestones: [] });
  });

  test('replaces fields of the wrong shape and keeps the valid ones', async () => {
    const { useStored } = await loadStorage(JSON.stringify({ read: 'moves', drills: 5, milestones: { a: 1 }, theme: 'dark' }));
    const { result } = renderHook(() => useStored());
    expect(result.current).toEqual({ read: [], lastLesson: undefined, theme: 'dark', drills: {}, milestones: [] });
  });

  test('treats a null drills field as empty', async () => {
    const { useStored } = await loadStorage(JSON.stringify({ read: ['a'], drills: null }));
    const { result } = renderHook(() => useStored());
    expect(result.current).toMatchObject({ read: ['a'], drills: {}, milestones: [] });
  });

  test('picks up changes another tab makes to our key', async () => {
    const { useStored } = await loadStorage();
    const { result } = renderHook(() => useStored());
    otherTabWrites(KEY, { read: ['moves', 'functions'], milestones: ['p/m'] });
    expect(result.current).toMatchObject({ read: ['moves', 'functions'], milestones: ['p/m'] });
  });

  test('recovers when another tab writes corrupt data', async () => {
    const { useStored } = await loadStorage(JSON.stringify({ read: ['moves'] }));
    const { result } = renderHook(() => useStored());
    otherTabWrites(KEY, 'not json');
    expect(result.current).toEqual({ read: [], drills: {}, milestones: [] });
  });

  test('ignores storage events for other keys', async () => {
    const { useStored } = await loadStorage(JSON.stringify({ read: ['moves'] }));
    const { result } = renderHook(() => useStored());
    const before = result.current;
    localStorage.setItem(KEY, JSON.stringify({ read: ['changed'] }));
    otherTabWrites('some.other.key', 'x');
    expect(result.current).toBe(before);
    expect(result.current.read).toEqual(['moves']);
  });

  test('does not listen for other tabs when there is no window', async () => {
    vi.stubGlobal('window', undefined);
    const { useStored } = await loadStorage();
    vi.unstubAllGlobals();
    const { result } = renderHook(() => useStored());
    otherTabWrites(KEY, { read: ['moves'] });
    expect(result.current.read).toEqual([]);
  });
});

describe('useProgress', () => {
  test('marks lessons read and unread, and persists them', async () => {
    const { useProgress } = await loadStorage();
    const { result } = renderHook(() => useProgress());
    expect(result.current.read.size).toBe(0);

    act(() => result.current.setRead('moves', true));
    act(() => result.current.setRead('functions', true));
    expect([...result.current.read]).toEqual(['moves', 'functions']);
    expect(persisted().read).toEqual(['moves', 'functions']);

    act(() => result.current.setRead('moves', false));
    expect([...result.current.read]).toEqual(['functions']);
    expect(persisted().read).toEqual(['functions']);
  });

  test('records the last visited lesson, writing only when it changes', async () => {
    const { useProgress } = await loadStorage();
    const { result } = renderHook(() => useProgress());
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    act(() => result.current.visit('ownership', 'moves'));
    expect(result.current.lastLesson).toEqual({ trackId: 'ownership', lessonId: 'moves' });
    expect(persisted().lastLesson).toEqual({ trackId: 'ownership', lessonId: 'moves' });

    act(() => result.current.visit('ownership', 'moves'));
    expect(setItem).toHaveBeenCalledTimes(1);

    act(() => result.current.visit('ownership', 'functions'));
    expect(result.current.lastLesson).toEqual({ trackId: 'ownership', lessonId: 'functions' });
    expect(setItem).toHaveBeenCalledTimes(2);
  });

  test('keeps progress in memory when localStorage refuses to save', async () => {
    const { useProgress } = await loadStorage();
    const { result } = renderHook(() => useProgress());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    act(() => result.current.setRead('moves', true));
    expect(result.current.read.has('moves')).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('shares state between hooks in the same tab', async () => {
    const { useProgress, useStored } = await loadStorage();
    const progress = renderHook(() => useProgress());
    const stored = renderHook(() => useStored());
    act(() => progress.result.current.setRead('moves', true));
    expect(stored.result.current.read).toEqual(['moves']);
  });
});

describe('useDrillAttempts', () => {
  test('records only the first attempt at a drill', async () => {
    const { useDrillAttempts } = await loadStorage();
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const { result } = renderHook(() => useDrillAttempts());

    act(() => result.current.record('move-in-loop', 2, false));
    act(() => result.current.record('move-in-loop', 0, true));
    expect(result.current.attempts).toEqual({ 'move-in-loop': { firstChoice: 2, correctFirstTry: false, at: 1234 } });
    expect(persisted().drills).toEqual({ 'move-in-loop': { firstChoice: 2, correctFirstTry: false, at: 1234 } });
  });

  test('reset forgets one drill so it can be recorded again', async () => {
    const { useDrillAttempts } = await loadStorage(JSON.stringify({ drills: { a: { firstChoice: 1, correctFirstTry: true, at: 1 }, b: { firstChoice: 0, correctFirstTry: false, at: 2 } } }));
    vi.spyOn(Date, 'now').mockReturnValue(99);
    const { result } = renderHook(() => useDrillAttempts());

    act(() => result.current.reset('a'));
    expect(Object.keys(result.current.attempts)).toEqual(['b']);
    expect(Object.keys(persisted().drills)).toEqual(['b']);

    act(() => result.current.record('a', 3, true));
    expect(result.current.attempts.a).toEqual({ firstChoice: 3, correctFirstTry: true, at: 99 });
  });
});

describe('useMilestones', () => {
  test('toggles milestones on and off, and persists them', async () => {
    const { useMilestones } = await loadStorage();
    const { result } = renderHook(() => useMilestones());

    act(() => result.current.toggle('p1/m1'));
    act(() => result.current.toggle('p1/m2'));
    expect([...result.current.done]).toEqual(['p1/m1', 'p1/m2']);

    act(() => result.current.toggle('p1/m1'));
    expect([...result.current.done]).toEqual(['p1/m2']);
    expect(persisted().milestones).toEqual(['p1/m2']);
  });
});

describe('useTheme', () => {
  test('defaults to dark and toggles between dark and light', async () => {
    const { useTheme } = await loadStorage();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(persisted().theme).toBe('light');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(persisted().theme).toBe('dark');
  });

  test('starts from a stored light theme', async () => {
    const { useTheme } = await loadStorage(JSON.stringify({ theme: 'light' }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
  });
});

describe('clearAllProgress', () => {
  test('clears reading, drills and milestones but keeps the theme', async () => {
    const saved = {
      read: ['moves'],
      lastLesson: { trackId: 'ownership', lessonId: 'moves' },
      theme: 'light',
      drills: { d1: { firstChoice: 0, correctFirstTry: true, at: 1 } },
      milestones: ['p/m'],
    };
    const { clearAllProgress, useStored } = await loadStorage(JSON.stringify(saved));
    const { result } = renderHook(() => useStored());

    act(() => clearAllProgress());
    expect(result.current).toEqual({ read: [], drills: {}, milestones: [], theme: 'light' });
    expect(persisted()).toEqual({ read: [], drills: {}, milestones: [], theme: 'light' });
  });
});
