// Fakes for the process, filesystem and console boundaries of the scripts.

import { EventEmitter } from 'node:events';
import { basename } from 'node:path';

import { vi } from 'vitest';

import type { ChildLike, Deps, FileSystem, Logger, Run, RunOptions } from '../../scripts/lib/checkContent.ts';
import { emptyContent } from '../content/fixtures.ts';

export type Outcome = { stdout?: string; stderr?: string } | { reject: object };

const settle = (o: Outcome) =>
  'reject' in o ? Promise.reject(o.reject) : Promise.resolve({ stdout: o.stdout ?? '', stderr: o.stderr ?? '' });

export interface ToolchainScript {
  rustcVersion?: string;
  rustcVerbose?: string;
  dotnetVersion?: string | null;
  /** Keyed by the unit directory name, e.g. "borrow__move". Defaults to success. */
  compile?: Record<string, Outcome>;
  exec?: Record<string, Outcome>;
}

/** A fake `run` that answers like rustc, compiled binaries and dotnet. */
export function fakeRun(script: ToolchainScript = {}) {
  return vi.fn<Run>((file: string, args: string[], options?: RunOptions) => {
    if (file === 'rustc' && args[0] === '--version') return settle({ stdout: script.rustcVersion ?? 'rustc 1.97.1 (8bab26f4f 2026-07-14)\n' });
    if (file === 'rustc' && args[0] === '-vV') return settle({ stdout: script.rustcVerbose ?? 'rustc 1.97.1\ncommit-hash: 8bab26f4fabc\nhost: x\n' });
    if (file === 'rustc') return settle(script.compile?.[basename(options!.cwd!)] ?? {});
    if (file === 'dotnet') {
      if (script.dotnetVersion === null) return settle({ reject: new Error('spawn dotnet ENOENT') });
      return settle({ stdout: script.dotnetVersion ?? '10.0.400\n' });
    }
    return settle(script.exec?.[basename(options!.cwd!)] ?? {});
  });
}

export function fakeFs() {
  const files = new Map<string, string>();
  const fs = {
    mkdir: vi.fn<FileSystem['mkdir']>(async () => undefined),
    mkdtemp: vi.fn<FileSystem['mkdtemp']>(async (prefix) => `${prefix}XYZ`),
    rm: vi.fn<FileSystem['rm']>(async () => undefined),
    writeFile: vi.fn<FileSystem['writeFile']>(async (path, data) => {
      files.set(path, data);
    }),
  };
  return { fs, files };
}

export function fakeLogger() {
  const out: string[] = [];
  const err: string[] = [];
  const logger: Logger = { log: (m) => out.push(m), error: (m) => err.push(m) };
  return { logger, out, err };
}

export type ChildScript = { code: number | null; stdout?: string[]; stderr?: string[] } | { error: Error };

/** A fake `spawn` whose children answer from `scripts`, one per call. */
export function fakeSpawn(...scripts: ChildScript[]) {
  const inputs: string[] = [];
  const spawn = vi.fn((_command: string, _args: string[], _options: object): ChildLike => {
    const script = scripts[spawn.mock.calls.length - 1];
    const child = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const stdin = {
      end: (data: string) => {
        inputs.push(data);
        queueMicrotask(() => {
          if ('error' in script) return void child.emit('error', script.error);
          for (const chunk of script.stdout ?? []) stdout.emit('data', chunk);
          for (const chunk of script.stderr ?? []) stderr.emit('data', chunk);
          child.emit('close', script.code);
        });
      },
    };
    return Object.assign(child, { stdout, stderr, stdin });
  });
  return { spawn, inputs };
}

export function fakeDeps(over: Partial<Deps> = {}) {
  const { fs, files } = fakeFs();
  const { logger, out, err } = fakeLogger();
  const deps: Deps = {
    run: fakeRun(),
    spawn: fakeSpawn({ code: 0, stdout: ['[]'] }).spawn,
    fs,
    logger,
    env: { PATH: '/bin' },
    tmpdir: () => '/tmp',
    parallelism: () => 4,
    content: emptyContent(),
    toolchain: { rustc: '1.97.1', edition: '2024' },
    ...over,
  };
  return { deps, fs, files, out, err };
}
