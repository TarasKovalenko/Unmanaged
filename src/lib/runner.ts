// Running code from the browser.
//
// Two backends:
//   runner      the self-hosted service in runner/ (C# and Rust). Reached at
//               VITE_RUNNER_URL, default "/api" (Vite dev proxy, or nginx in
//               docker-compose). Detected by GET {url}/info.
//   playground  the official Rust Playground (play.rust-lang.org), Rust only.
//               Used when no runner answers. Disable with VITE_RUST_PLAYGROUND=off.
//
// Nothing here is used by the content checker; outputs shown in lessons are
// still the ones verified ahead of time.

import csharpStatusData from '../content/generated/csharp.json';
import { hashCode } from './hash';
import { splitPlaygroundOutput, type Backend, type RunOutcome } from './playground';

export type RunLanguage = 'rust' | 'csharp';
export type { Backend, RunOutcome };

export class RunError extends Error {}

const RUNNER_URL = ((import.meta.env.VITE_RUNNER_URL as string | undefined) ?? '/api').replace(/\/$/, '');
const PLAYGROUND_ENABLED = (import.meta.env.VITE_RUST_PLAYGROUND as string | undefined) !== 'off';
const PLAYGROUND_URL = 'https://play.rust-lang.org';

export interface Capabilities {
  rust: Backend | null;
  csharp: Backend | null;
  runnerToolchains: Partial<Record<RunLanguage, string>>;
}

let capabilities: Promise<Capabilities> | null = null;

/** Probes the runner once per page load. */
export function detectCapabilities(): Promise<Capabilities> {
  capabilities ??= (async () => {
    const fallback: Capabilities = { rust: PLAYGROUND_ENABLED ? 'playground' : null, csharp: null, runnerToolchains: {} };
    if (!RUNNER_URL) return fallback;
    try {
      const response = await fetch(`${RUNNER_URL}/info`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) return fallback;
      const info = (await response.json()) as { languages: Partial<Record<RunLanguage, { version: string }>> };
      return {
        rust: info.languages.rust ? 'runner' : fallback.rust,
        csharp: info.languages.csharp ? 'runner' : null,
        runnerToolchains: {
          rust: info.languages.rust?.version,
          csharp: info.languages.csharp?.version,
        },
      };
    } catch {
      return fallback;
    }
  })();
  return capabilities;
}

export async function runCode(language: RunLanguage, code: string, backend: Backend, signal?: AbortSignal): Promise<RunOutcome> {
  return backend === 'runner' ? runOnRunner(language, code, signal) : runOnPlayground(code, signal);
}

interface RunnerResult {
  toolchain: string;
  mode: 'run' | 'compile-only';
  compile: { success: boolean; output: string; durationMs: number };
  execution: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; truncated: boolean; durationMs: number } | null;
}

async function runOnRunner(language: RunLanguage, code: string, signal?: AbortSignal): Promise<RunOutcome> {
  let response: Response;
  try {
    response = await fetch(`${RUNNER_URL}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language, code }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new RunError('The code runner could not be reached.');
  }
  if (response.status === 429) throw new RunError('Too many runs in the last minute. Wait a moment and try again.');
  if (response.status === 503) throw new RunError('The runner is busy with other programs. Try again in a few seconds.');
  if (!response.ok) throw new RunError(`The runner rejected the request: ${(await response.text()).slice(0, 200) || response.status}`);
  const r = (await response.json()) as RunnerResult;
  return {
    backend: 'runner',
    toolchain: r.toolchain,
    mode: r.mode,
    compiled: r.compile.success,
    compileOutput: r.compile.output,
    stdout: r.execution?.stdout ?? '',
    stderr: r.execution?.stderr ?? '',
    exitCode: r.execution?.exitCode ?? null,
    timedOut: r.execution?.timedOut ?? false,
    truncated: r.execution?.truncated ?? false,
    durationMs: r.execution ? r.compile.durationMs + r.execution.durationMs : r.compile.durationMs,
  };
}

async function runOnPlayground(code: string, signal?: AbortSignal): Promise<RunOutcome> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(`${PLAYGROUND_URL}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'stable', mode: 'debug', edition: '2024', crateType: 'bin', tests: false, backtrace: false, code }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new RunError('The Rust Playground could not be reached.');
  }
  if (!response.ok) throw new RunError(`The Rust Playground returned ${response.status}. It may be rate limiting; try again shortly.`);
  const r = (await response.json()) as { success: boolean; exitDetail: string; stdout: string; stderr: string };
  return { ...splitPlaygroundOutput(r), durationMs: Math.round(performance.now() - started) };
}

// ---------------------------------------------------------------------------
// C# snippet classification, produced by npm run check:content
// ---------------------------------------------------------------------------

export type CSharpStatus = 'runs' | 'compiles' | 'excerpt';

const csharpSnippets = (csharpStatusData as { snippets: Record<string, { status: CSharpStatus; firstError?: string }> }).snippets;

export function csharpStatus(code: string): { status: CSharpStatus; firstError?: string } | undefined {
  return csharpSnippets[hashCode(code)];
}

export type OutcomeKind = 'ok' | 'compile-error' | 'compiles-only' | 'panic' | 'exception' | 'exit' | 'timeout';

export function classify(language: RunLanguage, o: RunOutcome): OutcomeKind {
  if (!o.compiled) return 'compile-error';
  if (o.mode === 'compile-only') return 'compiles-only';
  if (o.timedOut) return 'timeout';
  if (o.exitCode === 0) return 'ok';
  if (language === 'rust' && (o.exitCode === 101 || o.stderr.includes('panicked at'))) return 'panic';
  if (language === 'csharp' && o.stderr.includes('Unhandled exception')) return 'exception';
  return 'exit';
}
