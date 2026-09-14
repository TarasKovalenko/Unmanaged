// The logic behind scripts/check-content.ts. Everything with side effects
// (processes, filesystem, console) comes in through `Deps`, so the checker
// can be tested with fakes. See scripts/check-content.ts for usage.

import { execFile, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { content as realContent } from '../../src/content/index.ts';
import type { Content } from '../../src/content/index.ts';
import { toolchain as realToolchain } from '../../src/content/meta.ts';
import type { Expect } from '../../src/content/types.ts';
import { structuralProblems } from '../../src/content/validate.ts';
import { hashCode } from '../../src/lib/hash.ts';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface RunOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

/** Runs a program to completion. Rejects on a non-zero exit, like promisified execFile:
 *  the error carries `stdout`, `stderr` and `killed` when available. */
export type Run = (file: string, args: string[], options?: RunOptions) => Promise<{ stdout: string; stderr: string }>;

export interface ChildLike {
  stdout: { on(event: 'data', listener: (chunk: string) => void): unknown };
  stderr: { on(event: 'data', listener: (chunk: string) => void): unknown };
  stdin: { end(data: string): unknown };
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
}

export type Spawn = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildLike;

export interface FileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  mkdtemp(prefix: string): Promise<string>;
  rm(path: string, options: { recursive: true; force: true }): Promise<unknown>;
  writeFile(path: string, data: string): Promise<unknown>;
  exists(path: string): Promise<boolean>;
}

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export interface Deps {
  run: Run;
  spawn: Spawn;
  fs: FileSystem;
  logger: Logger;
  env: NodeJS.ProcessEnv;
  tmpdir: () => string;
  parallelism: () => number;
  content: Content;
  toolchain: { rustc: string; edition: string };
}

/** The real dependencies: node child processes, filesystem and console. */
export function nodeDeps(): Deps {
  return {
    run: promisify(execFile),
    spawn: (command, args, options) => spawn(command, args, options),
    fs: {
      mkdir,
      mkdtemp,
      rm,
      writeFile,
      exists: (path) =>
        access(path).then(
          () => true,
          () => false,
        ),
    },
    logger: console,
    env: process.env,
    tmpdir,
    parallelism: availableParallelism,
    content: realContent,
    toolchain: realToolchain,
  };
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export interface Options {
  useRustc: boolean;
  useDotnet: boolean;
  dump: boolean;
  /** Only Rust units whose id contains one of these. null means all. */
  only: string[] | null;
}

export function parseArgs(argv: string[]): Options {
  const onlyArg = argv[argv.indexOf('--only') + 1];
  return {
    useRustc: !argv.includes('--no-rustc'),
    useDotnet: !argv.includes('--no-dotnet'),
    dump: argv.includes('--dump'),
    only: argv.includes('--only') && onlyArg ? onlyArg.split(',').filter(Boolean) : null,
  };
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// With the rust-src component installed, rustc points notes at the sysroot's copy
// of the standard library (<sysroot>/lib/rustlib/src/rust/library/...), wherever
// the toolchain lives: ~/.rustup, /opt/rustup, /usr/local/rustup, /usr. Content
// must be the same on every machine, so rewrite it to the form rustc uses in its
// own metadata: /rustc/<commit-hash>/library/...
export function portablePaths(text: string, commitHash: string): string {
  return text.replace(/(?:\/[^\s:]+)?\/lib\/rustlib\/src\/rust\//g, `/rustc/${commitHash}/`);
}

// Panic output includes a per-run thread id: thread 'main' (17287168) panicked
export const normalise = (t: string): string =>
  t
    .replace(/thread '([^']*)' \(\d+\) panicked/g, "thread '$1' panicked")
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n');

export function indent(s: string): string {
  return s.trimEnd().split('\n').map((l) => '    ' + l).join('\n');
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Rust pass
// ---------------------------------------------------------------------------

export interface RustUnit {
  id: string;
  code: string;
  expect: Expect;
  /** fails: error codes rustc must report (exact set). Omit to accept any error. */
  errorCodes?: string[];
  /** fails: authored messages that must appear verbatim in rustc output. */
  messages?: string[];
  /** panics: authored panic output that must appear verbatim in stderr. */
  panicMessages?: string[];
  /** compiles: expected stdout, verbatim. Running is skipped when undefined. */
  stdout?: string;
}

export function collectUnits(content: Content): RustUnit[] {
  const units: RustUnit[] = [];

  for (const s of content.snippets) {
    const runtime = s.conflicts.some((c) => c.phase === 'runtime');
    if (s.conflicts.length === 0) units.push({ id: `borrow/${s.id}`, code: s.code, expect: 'compiles' });
    else if (runtime) units.push({ id: `borrow/${s.id}`, code: s.code, expect: 'panics', panicMessages: s.conflicts.map((c) => c.message) });
    else
      units.push({
        id: `borrow/${s.id}`,
        code: s.code,
        expect: 'fails',
        errorCodes: s.conflicts.map((c) => c.errorCode),
        messages: s.conflicts.map((c) => c.message),
      });
  }

  for (const t of content.tracks) {
    for (const l of t.lessons) {
      units.push({ id: `lesson/${l.id}/rust`, code: l.rust.code, expect: l.rust.expect ?? 'compiles', stdout: l.rust.stdout });
      l.breaks.forEach((b, i) => {
        if (b.code?.language !== 'rust' || !b.code.expect) return;
        units.push({ id: `lesson/${l.id}/break-${i + 1}`, code: b.code.code, expect: b.code.expect, stdout: b.code.stdout });
      });
    }
  }

  for (const d of content.drills) {
    if (d.outcome === 'panic') units.push({ id: `drill/${d.id}`, code: d.code, expect: 'panics', panicMessages: [d.message] });
    else units.push({ id: `drill/${d.id}`, code: d.code, expect: 'fails', errorCodes: [d.errorCode], messages: [d.message] });
    d.fixes.forEach((f, i) => units.push({ id: `drill/${d.id}/fix-${i + 1}`, code: f.code, expect: f.expect }));
  }

  for (const g of content.gotchas) {
    units.push({
      id: `gotcha/${g.id}`,
      code: g.code,
      expect: g.expect,
      errorCodes: g.errorCode ? [g.errorCode] : undefined,
      stdout: g.stdout,
    });
  }

  for (const t of content.timelines) {
    units.push({ id: `timeline/${t.id}/rust`, code: t.rust.code, expect: t.rust.expect, stdout: t.rust.output });
  }

  for (const p of content.projects) {
    for (const m of p.milestones) {
      if (m.code?.language === 'rust' && m.code.expect) {
        units.push({ id: `project/${p.id}/${m.id}`, code: m.code.code, expect: m.code.expect, stdout: m.code.stdout });
      }
    }
  }

  return units;
}

/** Only units whose id contains one of `only`; all units when `only` is null. */
export function filterUnits(units: RustUnit[], only: string[] | null): RustUnit[] {
  return units.filter((u) => !only || only.some((o) => u.id.includes(o)));
}

/** A unit that needs a binary: it is run, not just type-checked. */
export const needsBinary = (unit: RustUnit): boolean => unit.expect === 'panics' || unit.stdout !== undefined;

/** What happened when a unit was compiled (and, if needed, run). */
export interface RustOutcome {
  compiled: boolean;
  compileErr: string;
  runOut: string;
  runErr: string;
  panicked: boolean;
}

/** Compares what rustc and the program did with what the unit expects. */
export function evaluate(unit: RustUnit, outcome: RustOutcome): string[] {
  const { compiled, compileErr, runOut, runErr, panicked } = outcome;
  const problems: string[] = [];
  const show = (s: string) => indent(s || '(empty)');

  if (unit.expect === 'unchecked') return [];

  if (unit.expect === 'fails') {
    if (compiled) return ['expected a compile error, but it compiled'];
    if (unit.errorCodes) {
      const actual = [...new Set([...compileErr.matchAll(/error\[(E\d{4})\]/g)].map((m) => m[1]))].sort();
      const expected = [...new Set(unit.errorCodes)].sort();
      if (actual.join() !== expected.join()) problems.push(`error codes differ: authored [${expected}] vs rustc [${actual}]\n${show(compileErr)}`);
    }
    for (const [i, m] of (unit.messages ?? []).entries()) {
      if (!normalise(compileErr).includes(normalise(m))) problems.push(`message[${i}] is not verbatim rustc output. Current output:\n${show(compileErr)}`);
    }
    return problems;
  }

  if (!compiled) return [`expected to compile, but rustc failed:\n${show(compileErr)}`];

  if (unit.expect === 'panics') {
    if (!panicked || !runErr.includes('panicked at')) return [`expected a panic, but the program exited cleanly.\nstdout:\n${show(runOut)}`];
    for (const [i, m] of (unit.panicMessages ?? []).entries()) {
      if (!normalise(runErr).includes(normalise(m))) problems.push(`panic message[${i}] is not verbatim. Current stderr:\n${show(runErr)}`);
    }
    return problems;
  }

  if (unit.stdout !== undefined) {
    if (panicked) problems.push(`expected to run cleanly, but it panicked:\n${show(runErr)}`);
    else if (normalise(runOut).trimEnd() !== normalise(unit.stdout).trimEnd()) {
      problems.push(`stdout differs.\n  authored:\n${show(unit.stdout)}\n  actual:\n${show(runOut)}`);
    }
  }
  return problems;
}

/** The --dump report for one unit. */
export function dumpReport(unit: RustUnit, outcome: RustOutcome): string {
  return [
    outcome.compiled ? '(compiled)' : '(failed to compile)',
    outcome.compileErr,
    needsBinary(unit) && outcome.compiled ? `--- stdout ---\n${outcome.runOut}--- stderr ---\n${outcome.runErr}` : '',
  ].join('\n');
}

export interface CheckContext {
  run: Run;
  fs: FileSystem;
  env: NodeJS.ProcessEnv;
  edition: string;
  commitHash: string;
  dump: boolean;
}

/** Writes the unit to `root`, compiles it, runs it if needed, and returns its problems. */
export async function checkUnit(unit: RustUnit, root: string, ctx: CheckContext): Promise<string[]> {
  if (unit.expect === 'unchecked') return [];
  const { run, fs } = ctx;
  const dir = join(root, unit.id.replaceAll('/', '__'));
  await fs.mkdir(join(dir, 'src'), { recursive: true });
  await fs.writeFile(join(dir, 'src', 'main.rs'), unit.code + '\n');

  const binary = needsBinary(unit);
  const outcome: RustOutcome = { compiled: true, compileErr: '', runOut: '', runErr: '', panicked: false };
  try {
    const r = await run(
      'rustc',
      [
        '--edition', ctx.edition, '--crate-type', 'bin', '--crate-name', 'main',
        binary ? '--emit=link' : '--emit=metadata',
        '--color', 'never', '-A', 'warnings',
        '-o', join(dir, 'main'), 'src/main.rs',
      ],
      { cwd: dir },
    );
    outcome.compileErr = portablePaths(r.stderr, ctx.commitHash);
  } catch (e) {
    outcome.compiled = false;
    outcome.compileErr = portablePaths((e as { stderr?: string }).stderr ?? String(e), ctx.commitHash);
  }

  if (outcome.compiled && binary) {
    try {
      const r = await run(join(dir, 'main'), [], { cwd: dir, timeout: 10_000, env: { ...ctx.env, RUST_BACKTRACE: '0' } });
      outcome.runOut = r.stdout;
      outcome.runErr = r.stderr;
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; killed?: boolean };
      outcome.runOut = err.stdout ?? '';
      outcome.runErr = err.stderr ?? String(e);
      outcome.panicked = !err.killed;
    }
  }

  if (ctx.dump) {
    await fs.mkdir('.content-check', { recursive: true });
    await fs.writeFile(join('.content-check', unit.id.replaceAll('/', '__') + '.txt'), dumpReport(unit, outcome));
  }

  return evaluate(unit, outcome);
}

/** Checks every Rust program. Returns true if anything failed. */
export async function rustPass(options: Options, deps: Deps): Promise<boolean> {
  const { run, fs, logger, toolchain } = deps;
  let failed = false;
  const { stdout: version } = await run('rustc', ['--version']);
  const { stdout: verbose } = await run('rustc', ['-vV']);
  const commitHash = verbose.match(/commit-hash: (\w+)/)?.[1] ?? 'unknown';
  if (!version.includes(` ${toolchain.rustc} `)) {
    failed = true;
    logger.error(`✗ local ${version.trim()} differs from src/content/meta.ts (${toolchain.rustc}). Messages may have drifted: re-check them, then update meta.ts.`);
  }
  // Notes that point into the standard library (e.g. "required by a bound in `spawn`")
  // quote std's source only when the rust-src component is installed. Without it
  // rustc prints a bare location and narrower gutters, so authored messages can't match.
  const { stdout: sysroot } = await run('rustc', ['--print', 'sysroot']);
  if (!(await fs.exists(join(sysroot.trim(), 'lib', 'rustlib', 'src', 'rust', 'library', 'std', 'src', 'lib.rs')))) {
    logger.error('✗ the rust-src component is not installed. Run `rustup component add rust-src`: compiler messages that quote the standard library differ without it.');
    return true;
  }
  const units = filterUnits(collectUnits(deps.content), options.only);
  const root = await fs.mkdtemp(join(deps.tmpdir(), 'unmanaged-check-'));
  const ctx: CheckContext = { run, fs, env: deps.env, edition: toolchain.edition, commitHash, dump: options.dump };
  const results = await mapLimit(units, Math.max(2, deps.parallelism() - 1), async (u) => [u, await checkUnit(u, root, ctx)] as const);
  let unchecked = 0;
  for (const [unit, unitProblems] of results) {
    if (unit.expect === 'unchecked') {
      unchecked++;
      continue;
    }
    if (unitProblems.length === 0) logger.log(`✓ ${unit.id}  (${unit.expect}${unit.errorCodes?.length ? `: ${unit.errorCodes.join(', ')}` : ''})`);
    else {
      failed = true;
      for (const p of unitProblems) logger.error(`✗ ${unit.id}: ${p}`);
    }
  }
  await fs.rm(root, { recursive: true, force: true });
  logger.log(`\n${units.length - unchecked} Rust programs checked, ${unchecked} unchecked (need crates), edition ${toolchain.edition}`);
  return failed;
}

// ---------------------------------------------------------------------------
// C# pass
// ---------------------------------------------------------------------------

export interface CsUnit {
  id: string;
  code: string;
  run: boolean;
  /** Timelines: authored output that the real program must print. */
  expectedOutput?: string;
}

export interface CsResult {
  id: string;
  mode: 'run' | 'compile-only';
  compiled: boolean;
  diagnostics: string;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  timedOut: boolean;
}

export type CsStatus = 'runs' | 'compiles' | 'excerpt';

export function collectCSharp(content: Content): CsUnit[] {
  const units: CsUnit[] = [];
  for (const t of content.tracks) {
    for (const l of t.lessons) {
      units.push({ id: `lesson/${l.id}/csharp`, code: l.csharp.code, run: false });
      l.breaks.forEach((b, i) => {
        if (b.code?.language === 'csharp') units.push({ id: `lesson/${l.id}/break-${i + 1}/csharp`, code: b.code.code, run: false });
      });
    }
  }
  for (const s of content.snippets) if (s.csharpEquivalent) units.push({ id: `borrow/${s.id}/csharp`, code: s.csharpEquivalent, run: false });
  for (const g of content.gotchas) if (g.csharp) units.push({ id: `gotcha/${g.id}/csharp`, code: g.csharp, run: false });
  for (const tl of content.timelines) {
    units.push({ id: `timeline/${tl.id}/csharp`, code: tl.csharp.code, run: true, expectedOutput: tl.csharp.output });
  }
  return units;
}

/** Parses check-csharp stdout. `dotnet run` may print build output before the JSON. */
export function parseCheckCSharpOutput(out: string): CsResult[] {
  const start = out.indexOf('[{');
  try {
    return JSON.parse(start >= 0 ? out.slice(start) : out) as CsResult[];
  } catch (e) {
    throw new Error(`could not parse check-csharp output: ${String(e)}\n${out.slice(0, 2000)}`, { cause: e });
  }
}

/** Compiles (and for timelines, runs) C# units with `dotnet run -- check-csharp`. */
export function runCheckCSharp(units: CsUnit[], deps: Pick<Deps, 'spawn' | 'env'>): Promise<CsResult[]> {
  return new Promise((resolve, reject) => {
    const child = deps.spawn(
      'dotnet',
      ['run', '--project', 'runner', '--no-launch-profile', '-c', 'Release', '--', 'check-csharp'],
      { env: { ...deps.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code !== 0) return reject(new Error(`dotnet exited with ${code}\n${err}\n${out}`));
      try {
        resolve(parseCheckCSharpOutput(out));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(units.map(({ id, code, run }) => ({ id, code, run }))));
  });
}

const outputMatches = (actual: string | null, expected: string) => normalise(actual ?? '').trimEnd() === normalise(expected).trimEnd();

/** Results for timelines whose output did not match; these get one retry. */
export function resultsToRetry(units: CsUnit[], results: CsResult[]): CsResult[] {
  return results.filter((r, i) => units[i].expectedOutput !== undefined && !outputMatches(r.stdout, units[i].expectedOutput!));
}

/** Replaces results with retried ones, matched by id. */
export function mergeRetried(results: CsResult[], again: CsResult[]): CsResult[] {
  return results.map((r) => again.find((a) => a.id === r.id) ?? r);
}

export const csStatus = (r: CsResult): CsStatus => (!r.compiled ? 'excerpt' : r.mode === 'run' ? 'runs' : 'compiles');

export type GeneratedSnippets = Record<string, { status: CsStatus; firstError?: string }>;

export interface CsReport {
  failed: boolean;
  snippets: GeneratedSnippets;
  counts: Record<CsStatus, number>;
}

/** Classifies each result, logs timeline verdicts, and builds the generated snippet map. */
export function classifyCSharp(units: CsUnit[], results: CsResult[], logger: Logger): CsReport {
  const report: CsReport = { failed: false, snippets: {}, counts: { runs: 0, compiles: 0, excerpt: 0 } };
  results.forEach((r, i) => {
    const unit = units[i];
    const status = csStatus(r);
    report.counts[status]++;
    const firstError = r.diagnostics.split('\n').find((l) => l.includes(': error '));
    report.snippets[hashCode(unit.code)] = { status, ...(firstError ? { firstError } : {}) };

    if (unit.expectedOutput !== undefined) {
      if (status !== 'runs') {
        report.failed = true;
        logger.error(`✗ ${unit.id}: timeline C# must be a complete program, but it ${status === 'excerpt' ? 'does not compile' : 'has no entry point'}:\n${indent(r.diagnostics)}`);
      } else if (r.timedOut) {
        report.failed = true;
        logger.error(`✗ ${unit.id}: timed out`);
      } else if (!outputMatches(r.stdout, unit.expectedOutput)) {
        report.failed = true;
        logger.error(`✗ ${unit.id}: output differs.\n  authored:\n${indent(unit.expectedOutput)}\n  actual:\n${indent(r.stdout ?? '')}${r.stderr ? `\n  stderr:\n${indent(r.stderr)}` : ''}`);
      } else {
        logger.log(`✓ ${unit.id}  (C# output verified)`);
      }
    }
  });
  return report;
}

export const GENERATED_CSHARP = 'src/content/generated/csharp.json';

/** The exact contents of src/content/generated/csharp.json. */
export function generatedCSharpJson(sdk: string, snippets: GeneratedSnippets): string {
  return JSON.stringify({ note: 'Generated by npm run check:content. Do not edit.', sdk: sdk.trim(), snippets }, null, 2) + '\n';
}

/** Compiles every C# snippet and regenerates csharp.json. Returns true if anything failed. */
export async function csharpPass(deps: Deps): Promise<boolean> {
  const { run, fs, logger } = deps;
  try {
    await run('dotnet', ['--version']);
  } catch {
    logger.log('\n(dotnet not found: skipping the C# pass; src/content/generated/csharp.json left as is)');
    return false;
  }
  const units = collectCSharp(deps.content);
  logger.log(`\nCompiling ${units.length} C# snippets with the runner's Roslyn setup…`);
  let results = await runCheckCSharp(units, deps);

  // Timelines whose output depends on timing get one retry before failing.
  const retry = resultsToRetry(units, results);
  if (retry.length) {
    const again = await runCheckCSharp(units.filter((u) => retry.some((r) => r.id === u.id)), deps);
    results = mergeRetried(results, again);
  }

  const report = classifyCSharp(units, results, logger);
  const { stdout: sdk } = await run('dotnet', ['--version']);
  await fs.mkdir('src/content/generated', { recursive: true });
  await fs.writeFile(GENERATED_CSHARP, generatedCSharpJson(sdk, report.snippets));
  const { counts } = report;
  logger.log(`C#: ${counts.runs} complete programs, ${counts.compiles} compile as excerpts, ${counts.excerpt} reference code not shown`);
  return report.failed;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

/** Runs every check. Returns the process exit code. */
export async function main(argv: string[], deps: Deps): Promise<number> {
  const options = parseArgs(argv);
  const problems = structuralProblems(deps.content);
  let failed = problems.length > 0;
  for (const p of problems) deps.logger.error(`✗ ${p}`);

  if (options.useRustc && (await rustPass(options, deps))) failed = true;
  if (options.useDotnet && (await csharpPass(deps))) failed = true;

  if (failed) {
    deps.logger.error('\ncontent check failed');
    return 1;
  }
  deps.logger.log('content check passed');
  return 0;
}
