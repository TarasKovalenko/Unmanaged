import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { callsTo, fresh, hangUntilAborted, mockFetch, runnerResult } from './runnerFetch';

const load = () => fresh(() => import('../../src/components/useRunnable'));
const CODE = 'fn main() { println!("hello"); }';

describe('useCapabilities', () => {
  test('probes the runner once and serves later mounts from the cache', async () => {
    const fetchMock = mockFetch({ mode: 'runner' });
    const { useCapabilities } = await load();
    const first = renderHook(() => useCapabilities());
    expect(first.result.current).toBeNull();
    await waitFor(() => expect(first.result.current).toEqual({ rust: 'runner', csharp: 'runner', runnerToolchains: { rust: 'rustc 1.90.0', csharp: '.NET 10' } }));

    const second = renderHook(() => useCapabilities());
    expect(second.result.current?.csharp).toBe('runner');
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/info')).toHaveLength(1);
  });

  test('falls back to the playground for Rust when the runner is down', async () => {
    mockFetch({ mode: 'playground' });
    const { useCapabilities } = await load();
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current).toEqual({ rust: 'playground', csharp: null, runnerToolchains: {} }));
  });

  test('does not update after unmounting, but still fills the cache', async () => {
    mockFetch({ mode: 'runner' });
    const { useCapabilities } = await load();
    const early = renderHook(() => useCapabilities());
    early.unmount();
    await act(async () => {});
    expect(early.result.current).toBeNull();
    const later = renderHook(() => useCapabilities());
    expect(later.result.current?.rust).toBe('runner');
  });
});

describe('useRunnable', () => {
  test('returns null for languages that cannot run', async () => {
    mockFetch({ mode: 'runner' });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('toml', '[package]'));
    expect(result.current).toBeNull();
  });

  test('tracks edits, reset and editing state', async () => {
    mockFetch({ mode: 'runner' });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('rust', CODE));
    expect(result.current).toMatchObject({ language: 'rust', original: CODE, code: CODE, modified: false, editing: false, csharp: undefined });
    act(() => result.current!.setCode('fn main() {}'));
    expect(result.current!.modified).toBe(true);
    act(() => result.current!.setEditing(true));
    expect(result.current!.editing).toBe(true);
    act(() => result.current!.reset());
    expect(result.current!.code).toBe(CODE);
    expect(result.current!.modified).toBe(false);
  });

  test('looks up the checker status for C#', async () => {
    mockFetch({ mode: 'runner' });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('csharp', 'not a known snippet'));
    expect(result.current!.csharp).toBeUndefined();
    expect(result.current!.language).toBe('csharp');
  });

  test('running before capabilities are known does nothing', async () => {
    const fetchMock = mockFetch({ mode: 'pending' });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('rust', CODE));
    expect(result.current!.backend).toBeNull();
    act(() => result.current!.run());
    expect(result.current!.state).toEqual({ status: 'idle' });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['/api/info']);
  });

  test('runs on the runner and records whether the original code ran', async () => {
    const fetchMock = mockFetch({ mode: 'runner', run: () => runnerResult() });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('rust', CODE));
    await waitFor(() => expect(result.current!.backend).toBe('runner'));

    act(() => result.current!.run());
    expect(result.current!.state).toEqual({ status: 'running', backend: 'runner' });
    await waitFor(() => expect(result.current!.state.status).toBe('done'));
    expect(result.current!.state).toMatchObject({ ranOriginal: true, outcome: { stdout: 'hello\n', exitCode: 0 } });

    act(() => result.current!.setCode('fn main() {}'));
    act(() => result.current!.run());
    await waitFor(() => expect(result.current!.state).toMatchObject({ status: 'done', ranOriginal: false }));
    expect(callsTo(fetchMock, '/api/run')).toEqual([
      { language: 'rust', code: CODE },
      { language: 'rust', code: 'fn main() {}' },
    ]);

    act(() => result.current!.dismiss());
    expect(result.current!.state).toEqual({ status: 'idle' });
  });

  test('a second run aborts the first, and the aborted run leaves no error behind', async () => {
    let calls = 0;
    const signals: AbortSignal[] = [];
    mockFetch({
      mode: 'runner',
      run: (req, signal) => {
        signals.push(signal!);
        return calls++ === 0 ? hangUntilAborted(req, signal) : runnerResult({ execution: { stdout: 'second\n' } });
      },
    });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('rust', CODE));
    await waitFor(() => expect(result.current!.backend).toBe('runner'));

    act(() => result.current!.run());
    await waitFor(() => expect(signals).toHaveLength(1));
    act(() => result.current!.run());
    await waitFor(() => expect(result.current!.state).toMatchObject({ status: 'done', outcome: { stdout: 'second\n' } }));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  test('unmounting aborts a run in progress', async () => {
    const signals: AbortSignal[] = [];
    mockFetch({ mode: 'runner', run: (req, signal) => (signals.push(signal!), hangUntilAborted(req, signal)) });
    const { useRunnable } = await load();
    const { result, unmount } = renderHook(() => useRunnable('rust', CODE));
    await waitFor(() => expect(result.current!.backend).toBe('runner'));
    act(() => result.current!.run());
    await waitFor(() => expect(signals).toHaveLength(1));
    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  test('a RunError message is shown as is', async () => {
    mockFetch({ mode: 'runner', run: () => new Response('', { status: 429 }) });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('rust', CODE));
    await waitFor(() => expect(result.current!.backend).toBe('runner'));
    act(() => result.current!.run());
    await waitFor(() =>
      expect(result.current!.state).toEqual({ status: 'error', message: 'Too many runs in the last minute. Wait a moment and try again.' }),
    );
  });

  test('any other failure is reported as "Run failed"', async () => {
    mockFetch({ mode: 'runner', run: () => new Response('not json', { status: 200 }) });
    const { useRunnable } = await load();
    const { result } = renderHook(() => useRunnable('rust', CODE));
    await waitFor(() => expect(result.current!.backend).toBe('runner'));
    act(() => result.current!.run());
    await waitFor(() => expect(result.current!.state.status).toBe('error'));
    expect(result.current!.state).toMatchObject({ message: expect.stringMatching(/^Run failed: .*JSON/) });
  });
});
