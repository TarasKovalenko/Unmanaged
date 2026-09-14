import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { content } from '../../src/content/index.ts';
import type { RunOutcome } from '../../src/lib/playground.ts';

type RunnerModule = typeof import('../../src/lib/runner.ts');

const fetchMock = vi.fn<typeof fetch>();

/** Imports a fresh copy of the runner module, so env vars and the capability cache start clean. */
async function loadRunner(env: { VITE_RUNNER_URL?: string; VITE_RUST_PLAYGROUND?: string } = {}): Promise<RunnerModule> {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return import('../../src/lib/runner.ts');
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, ...init });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('detectCapabilities', () => {
  const infoBoth = { languages: { rust: { version: 'rustc 1.90.0' }, csharp: { version: '.NET 10' } } };

  test('uses the runner for both languages when it reports them', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockResolvedValue(json(infoBoth));
    await expect(detectCapabilities()).resolves.toEqual({
      rust: 'runner',
      csharp: 'runner',
      runnerToolchains: { rust: 'rustc 1.90.0', csharp: '.NET 10' },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/info', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  test('probes only once per page load', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockResolvedValue(json(infoBoth));
    const first = detectCapabilities();
    expect(detectCapabilities()).toBe(first);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('uses the configured runner URL without its trailing slash', async () => {
    const { detectCapabilities } = await loadRunner({ VITE_RUNNER_URL: 'https://runner.example/' });
    fetchMock.mockResolvedValue(json(infoBoth));
    await detectCapabilities();
    expect(fetchMock.mock.calls[0][0]).toBe('https://runner.example/info');
  });

  test('falls back to the playground for Rust when the runner only has C#', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockResolvedValue(json({ languages: { csharp: { version: '.NET 10' } } }));
    await expect(detectCapabilities()).resolves.toEqual({ rust: 'playground', csharp: 'runner', runnerToolchains: { rust: undefined, csharp: '.NET 10' } });
  });

  test('has no C# backend when the runner only has Rust', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockResolvedValue(json({ languages: { rust: { version: 'rustc 1.90.0' } } }));
    await expect(detectCapabilities()).resolves.toEqual({ rust: 'runner', csharp: null, runnerToolchains: { rust: 'rustc 1.90.0', csharp: undefined } });
  });

  test('has no Rust backend when the runner lacks Rust and the playground is off', async () => {
    const { detectCapabilities } = await loadRunner({ VITE_RUST_PLAYGROUND: 'off' });
    fetchMock.mockResolvedValue(json({ languages: { csharp: { version: '.NET 10' } } }));
    await expect(detectCapabilities()).resolves.toMatchObject({ rust: null, csharp: 'runner' });
  });

  test('uses only the playground when the runner is absent', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(detectCapabilities()).resolves.toEqual({ rust: 'playground', csharp: null, runnerToolchains: {} });
  });

  test('has no backends at all when the runner is absent and the playground is off', async () => {
    const { detectCapabilities } = await loadRunner({ VITE_RUST_PLAYGROUND: 'off' });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(detectCapabilities()).resolves.toEqual({ rust: null, csharp: null, runnerToolchains: {} });
  });

  test('does not probe when the runner URL is configured empty', async () => {
    const { detectCapabilities } = await loadRunner({ VITE_RUNNER_URL: '' });
    await expect(detectCapabilities()).resolves.toEqual({ rust: 'playground', csharp: null, runnerToolchains: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('ignores a response that is not JSON, such as an SPA fallback page', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockResolvedValue(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(detectCapabilities()).resolves.toEqual({ rust: 'playground', csharp: null, runnerToolchains: {} });
  });

  test('ignores a response with no content type', async () => {
    const { detectCapabilities } = await loadRunner();
    const response = new Response(null, { status: 200 });
    response.headers.delete('content-type');
    fetchMock.mockResolvedValue(response);
    await expect(detectCapabilities()).resolves.toMatchObject({ rust: 'playground', csharp: null });
  });

  test('ignores an error status', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockResolvedValue(json({ languages: { rust: {} } }, { status: 502 }));
    await expect(detectCapabilities()).resolves.toMatchObject({ rust: 'playground', csharp: null });
  });

  test('falls back when the JSON body is malformed', async () => {
    const { detectCapabilities } = await loadRunner();
    fetchMock.mockResolvedValue(new Response('{nope', { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(detectCapabilities()).resolves.toMatchObject({ rust: 'playground', csharp: null });
  });

  test('gives up after 4 seconds and falls back', async () => {
    const { detectCapabilities } = await loadRunner();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    const result = detectCapabilities();
    expect(timeout).toHaveBeenCalledWith(4000);
    controller.abort(new DOMException('signal timed out', 'TimeoutError'));
    await expect(result).resolves.toEqual({ rust: 'playground', csharp: null, runnerToolchains: {} });
  });
});

describe('runCode on the runner', () => {
  test('posts the code and combines compile and execution results', async () => {
    const { runCode } = await loadRunner();
    fetchMock.mockResolvedValue(
      json({
        toolchain: 'rustc 1.90.0',
        mode: 'run',
        compile: { success: true, output: 'warning: unused', durationMs: 300 },
        execution: { exitCode: 0, stdout: 'hi\n', stderr: '', timedOut: false, truncated: true, durationMs: 20 },
      }),
    );
    const signal = new AbortController().signal;
    await expect(runCode('rust', 'fn main() {}', 'runner', signal)).resolves.toEqual({
      backend: 'runner',
      toolchain: 'rustc 1.90.0',
      mode: 'run',
      compiled: true,
      compileOutput: 'warning: unused',
      stdout: 'hi\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      truncated: true,
      durationMs: 320,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/run');
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' }, signal });
    expect(JSON.parse(init!.body as string)).toEqual({ language: 'rust', code: 'fn main() {}' });
  });

  test('fills in defaults when nothing was executed', async () => {
    const { runCode } = await loadRunner();
    fetchMock.mockResolvedValue(json({ toolchain: '.NET 10', mode: 'compile-only', compile: { success: false, output: 'CS0103', durationMs: 900 }, execution: null }));
    await expect(runCode('csharp', 'x', 'runner')).resolves.toEqual({
      backend: 'runner',
      toolchain: '.NET 10',
      mode: 'compile-only',
      compiled: false,
      compileOutput: 'CS0103',
      stdout: '',
      stderr: '',
      exitCode: null,
      timedOut: false,
      truncated: false,
      durationMs: 900,
    });
  });

  test('explains rate limiting (429)', async () => {
    const { runCode, RunError } = await loadRunner();
    fetchMock.mockResolvedValue(new Response('', { status: 429 }));
    const run = runCode('rust', 'x', 'runner');
    await expect(run).rejects.toBeInstanceOf(RunError);
    await expect(run).rejects.toThrow('Too many runs in the last minute. Wait a moment and try again.');
  });

  test('explains a busy runner (503)', async () => {
    const { runCode, RunError } = await loadRunner();
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const run = runCode('rust', 'x', 'runner');
    await expect(run).rejects.toBeInstanceOf(RunError);
    await expect(run).rejects.toThrow('The runner is busy with other programs. Try again in a few seconds.');
  });

  test('includes the first 200 characters of the body for other errors', async () => {
    const { runCode, RunError } = await loadRunner();
    fetchMock.mockResolvedValue(new Response(`code too long${'!'.repeat(300)}`, { status: 400 }));
    const run = runCode('rust', 'x', 'runner');
    await expect(run).rejects.toBeInstanceOf(RunError);
    await expect(run).rejects.toThrow(`The runner rejected the request: code too long${'!'.repeat(187)}`);
  });

  test('uses the status when an error has no body', async () => {
    const { runCode } = await loadRunner();
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    await expect(runCode('rust', 'x', 'runner')).rejects.toThrow(/^The runner rejected the request: 500$/);
  });

  test('reports a network failure as unreachable', async () => {
    const { runCode, RunError } = await loadRunner();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const run = runCode('csharp', 'x', 'runner');
    await expect(run).rejects.toBeInstanceOf(RunError);
    await expect(run).rejects.toThrow('The code runner could not be reached.');
  });

  test('rethrows an abort unchanged', async () => {
    const { runCode, RunError } = await loadRunner();
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    const run = runCode('rust', 'x', 'runner');
    await expect(run).rejects.toBe(abort);
    await expect(run).rejects.not.toBeInstanceOf(RunError);
  });
});

describe('runCode on the playground', () => {
  test('posts to the Rust Playground and parses its output with the elapsed time', async () => {
    const { runCode } = await loadRunner();
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1234.4);
    fetchMock.mockResolvedValue(
      json({ success: true, exitDetail: '', stdout: '3\n', stderr: '   Compiling playground v0.0.1 (/playground)\n     Running `target/debug/playground`\n' }),
    );
    const signal = new AbortController().signal;
    await expect(runCode('rust', 'fn main() { println!("3"); }', 'playground', signal)).resolves.toEqual({
      backend: 'playground',
      toolchain: 'Rust Playground, stable',
      mode: 'run',
      compiled: true,
      compileOutput: '',
      stdout: '3\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      truncated: false,
      durationMs: 234,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://play.rust-lang.org/execute');
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' }, signal });
    expect(JSON.parse(init!.body as string)).toEqual({
      channel: 'stable',
      mode: 'debug',
      edition: '2024',
      crateType: 'bin',
      tests: false,
      backtrace: false,
      code: 'fn main() { println!("3"); }',
    });
  });

  test('explains an error status as possible rate limiting', async () => {
    const { runCode, RunError } = await loadRunner();
    fetchMock.mockResolvedValue(new Response('', { status: 429 }));
    const run = runCode('rust', 'x', 'playground');
    await expect(run).rejects.toBeInstanceOf(RunError);
    await expect(run).rejects.toThrow('The Rust Playground returned 429. It may be rate limiting; try again shortly.');
  });

  test('reports a network failure as unreachable', async () => {
    const { runCode, RunError } = await loadRunner();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const run = runCode('rust', 'x', 'playground');
    await expect(run).rejects.toBeInstanceOf(RunError);
    await expect(run).rejects.toThrow('The Rust Playground could not be reached.');
  });

  test('rethrows an abort unchanged', async () => {
    const { runCode } = await loadRunner();
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    await expect(runCode('rust', 'x', 'playground')).rejects.toBe(abort);
  });
});

describe('csharpStatus', () => {
  const [moves, functions] =content.tracks.find((t) => t.id === 'ownership')!.lessons;

  test('returns the recorded status of authored C# code', async () => {
    const { csharpStatus } = await loadRunner();
    expect(csharpStatus(moves.csharp.code)).toEqual({ status: 'compiles' });
    expect(csharpStatus(functions.csharp.code)).toEqual({ status: 'excerpt', firstError: expect.stringContaining('CS0246') });
  });

  test('returns undefined for code that was never checked', async () => {
    const { csharpStatus } = await loadRunner();
    expect(csharpStatus('Console.WriteLine("never authored");')).toBeUndefined();
  });
});

describe('classify', () => {
  const base: RunOutcome = {
    backend: 'runner',
    toolchain: 't',
    mode: 'run',
    compiled: true,
    compileOutput: '',
    stdout: '',
    stderr: '',
    exitCode: 0,
    timedOut: false,
    truncated: false,
    durationMs: 1,
  };
  let classify: RunnerModule['classify'];
  beforeEach(async () => {
    ({ classify } = await loadRunner());
  });

  test('is a compile error when compilation failed, whatever else happened', () => {
    expect(classify('rust', { ...base, compiled: false, mode: 'compile-only', timedOut: true })).toBe('compile-error');
  });

  test('is compiles-only when the code was not run', () => {
    expect(classify('csharp', { ...base, mode: 'compile-only', exitCode: null })).toBe('compiles-only');
  });

  test('is a timeout when execution timed out', () => {
    expect(classify('rust', { ...base, timedOut: true, exitCode: null })).toBe('timeout');
  });

  test('is ok on exit code 0', () => {
    expect(classify('rust', base)).toBe('ok');
    expect(classify('csharp', base)).toBe('ok');
  });

  test('is a Rust panic on exit code 101 or a panic message', () => {
    expect(classify('rust', { ...base, exitCode: 101 })).toBe('panic');
    expect(classify('rust', { ...base, exitCode: 134, stderr: "thread 'main' panicked at src/main.rs:1:1" })).toBe('panic');
  });

  test('is a C# exception when stderr reports an unhandled exception', () => {
    expect(classify('csharp', { ...base, exitCode: 134, stderr: 'Unhandled exception. System.InvalidOperationException' })).toBe('exception');
  });

  test('is a plain non-zero exit otherwise', () => {
    expect(classify('rust', { ...base, exitCode: 2, stderr: 'Unhandled exception' })).toBe('exit');
    expect(classify('csharp', { ...base, exitCode: 101, stderr: 'panicked at' })).toBe('exit');
    expect(classify('csharp', { ...base, exitCode: null })).toBe('exit');
  });
});
