// Test helpers: a URL-routed fetch mock for the code runner and the Rust
// Playground, and a way to load component modules with a fresh capability cache.
import { afterEach, vi } from 'vitest';

/** Which backends detectCapabilities should find.
 *  - runner: the self-hosted runner answers for Rust and C#
 *  - playground: no runner, so Rust goes to play.rust-lang.org and C# cannot run
 *  - none: no runner and the playground is switched off
 *  - pending: /api/info never answers, so capabilities stay unknown */
export type RunnerMode = 'runner' | 'playground' | 'none' | 'pending';

export interface RunnerResult {
  toolchain: string;
  mode: 'run' | 'compile-only';
  compile: { success: boolean; output: string; durationMs: number };
  execution: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; truncated: boolean; durationMs: number } | null;
}

export function runnerResult(overrides: {
  toolchain?: string;
  mode?: 'run' | 'compile-only';
  compile?: Partial<RunnerResult['compile']>;
  execution?: Partial<NonNullable<RunnerResult['execution']>> | null;
} = {}): RunnerResult {
  return {
    toolchain: overrides.toolchain ?? 'rustc 1.90.0',
    mode: overrides.mode ?? 'run',
    compile: { success: true, output: '', durationMs: 100, ...overrides.compile },
    execution:
      overrides.execution === null
        ? null
        : { exitCode: 0, stdout: 'hello\n', stderr: '', timedOut: false, truncated: false, durationMs: 20, ...overrides.execution },
  };
}

type RunRequest = { language: string; code: string };
type Reply = unknown | Response;

interface Options {
  mode: RunnerMode;
  /** Answer for POST /api/run. A plain object is sent as JSON. */
  run?: (request: RunRequest, signal: AbortSignal | undefined) => Reply | Promise<Reply>;
  /** Answer for POST https://play.rust-lang.org/execute. */
  playground?: (request: { code: string }, signal: AbortSignal | undefined) => Reply | Promise<Reply>;
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

export function mockFetch({ mode, run, playground }: Options) {
  vi.stubEnv('VITE_RUST_PLAYGROUND', mode === 'none' ? 'off' : 'on');
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const reply = (r: Reply) => (r instanceof Response ? r : json(r));
    if (url === '/api/info') {
      if (mode === 'runner') return json({ languages: { rust: { version: 'rustc 1.90.0' }, csharp: { version: '.NET 10' } } });
      if (mode === 'pending') return new Promise<Response>(() => {});
      throw new TypeError('Failed to fetch');
    }
    const body = JSON.parse(String(init?.body));
    if (url === '/api/run' && run) return reply(await run(body, init?.signal ?? undefined));
    if (url === 'https://play.rust-lang.org/execute' && playground) return reply(await playground(body, init?.signal ?? undefined));
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A run that never answers until aborted, like a slow program. */
export function hangUntilAborted(_: unknown, signal: AbortSignal | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });
}

/** Fetch calls whose URL matches, as parsed request bodies. */
export function callsTo(fetchMock: ReturnType<typeof mockFetch>, url: string) {
  return fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String(init?.body)));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Capabilities are cached per module instance; reset the registry so the next import probes again. */
export async function fresh<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return load();
}
