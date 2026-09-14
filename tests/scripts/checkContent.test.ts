import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  GENERATED_CSHARP,
  checkUnit,
  classifyCSharp,
  collectCSharp,
  collectUnits,
  csStatus,
  dumpReport,
  evaluate,
  filterUnits,
  generatedCSharpJson,
  indent,
  main,
  mapLimit,
  mergeRetried,
  needsBinary,
  nodeDeps,
  normalise,
  parseArgs,
  parseCheckCSharpOutput,
  portablePaths,
  resultsToRetry,
} from '../../scripts/lib/checkContent.ts';
import type { CheckContext, CsResult, CsUnit, RustOutcome, RustUnit } from '../../scripts/lib/checkContent.ts';
import { content as realContent } from '../../src/content/index.ts';
import { toolchain as realToolchain } from '../../src/content/meta.ts';
import { hashCode } from '../../src/lib/hash.ts';
import { COMPILE_ERROR, PANIC, RUST, drill, emptyContent, gotcha, lesson, project, snippet, timeline, track, validContent } from '../content/fixtures.ts';
import { fakeDeps, fakeFs, fakeLogger, fakeRun, fakeSpawn } from './fakes.ts';

const RUSTUP_NOTE = '  --> /Users/me/.rustup/toolchains/1.97.1-aarch64-apple-darwin/lib/rustlib/src/rust/library/core/src/option.rs:1:1';

describe('parseArgs', () => {
  test('checks everything by default', () => {
    expect(parseArgs([])).toEqual({ useRustc: true, useDotnet: true, dump: false, only: null });
  });

  test('reads --no-rustc, --no-dotnet and --dump', () => {
    expect(parseArgs(['--no-rustc', '--no-dotnet', '--dump'])).toEqual({ useRustc: false, useDotnet: false, dump: true, only: null });
  });

  test('splits --only on commas and drops empty entries', () => {
    expect(parseArgs(['--only', 'drill/,,gotcha/string']).only).toEqual(['drill/', 'gotcha/string']);
  });

  test('ignores --only without a value', () => {
    expect(parseArgs(['--only']).only).toBeNull();
    expect(parseArgs(['--only', '']).only).toBeNull();
  });

  test('does not treat the first argument as --only when the flag is absent', () => {
    expect(parseArgs(['drill/']).only).toBeNull();
  });
});

describe('text helpers', () => {
  test('portablePaths rewrites local rust-src paths to /rustc/<hash>/', () => {
    expect(portablePaths(`note: here\n${RUSTUP_NOTE}\n  --> /home/me/.rustup/toolchains/stable/lib/rustlib/src/rust/library/alloc/src/vec.rs`, 'abc123')).toBe(
      'note: here\n  --> /rustc/abc123/library/core/src/option.rs:1:1\n  --> /rustc/abc123/library/alloc/src/vec.rs',
    );
  });

  test('portablePaths leaves other paths alone', () => {
    expect(portablePaths('  --> src/main.rs:2:5', 'abc')).toBe('  --> src/main.rs:2:5');
  });

  test('normalise removes thread ids and trailing whitespace', () => {
    expect(normalise("thread 'main' (17287168) panicked at src/main.rs:2:5:  \nboom\t")).toBe("thread 'main' panicked at src/main.rs:2:5:\nboom");
  });

  test('indent trims the end and indents every line by four spaces', () => {
    expect(indent('a\n b\n\n')).toBe('    a\n     b');
  });

  test('mapLimit keeps order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimit([30, 10, 20, 0, 5], 2, async (ms) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return ms * 2;
    });
    expect(results).toEqual([60, 20, 40, 0, 10]);
    expect(peak).toBe(2);
  });

  test('mapLimit returns an empty array for no items', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

describe('collectUnits', () => {
  test('turns every kind of Rust content into checked units', () => {
    const c = emptyContent({
      snippets: [
        snippet({ id: 'clean' }),
        snippet({ id: 'runtime', conflicts: [{ spans: [0, 1], errorCode: 'panic', message: PANIC, explanation: 'x', phase: 'runtime' }] }),
        snippet({
          id: 'compile',
          conflicts: [
            { spans: [0, 1], errorCode: 'E0382', message: 'm1', explanation: 'x' },
            { spans: [0, 1], errorCode: 'E0505', message: 'm2', explanation: 'x', phase: 'compile' },
          ],
        }),
      ],
      tracks: [
        track({
          lessons: [
            lesson({
              id: 'l1',
              rust: { code: 'l1', filename: 'main.rs', stdout: 'out' },
              breaks: [
                { heading: 'none', body: [] },
                { heading: 'cs', body: [], code: { language: 'csharp', code: 'cs' } },
                { heading: 'no expect', body: [], code: { language: 'rust', code: 'x' } },
                { heading: 'rust', body: [], code: { language: 'rust', code: 'b4', expect: 'fails' } },
                { heading: 'rust stdout', body: [], code: { language: 'rust', code: 'b5', expect: 'compiles', stdout: '5' } },
              ],
            }),
            lesson({ id: 'l2', rust: { code: 'l2', filename: 'main.rs', expect: 'unchecked', uncheckedReason: 'crates' } }),
          ],
        }),
      ],
      drills: [
        drill({
          id: 'd1',
          code: 'd1',
          fixes: [
            { label: 'a', verdict: 'idiomatic', code: 'f1', expect: 'compiles', note: '' },
            { label: 'b', verdict: 'wrong', code: 'f2', expect: 'fails', note: '' },
          ],
        }),
        drill({ id: 'd2', code: 'd2', outcome: 'panic', errorCode: 'panic', message: PANIC, fixes: [] }),
      ],
      gotchas: [gotcha({ id: 'g1', code: 'g1', expect: 'fails', errorCode: 'E0277' }), gotcha({ id: 'g2', code: 'g2', stdout: 'hi' })],
      timelines: [timeline({ id: 't1' })],
      projects: [
        project({
          id: 'p1',
          milestones: [
            { id: 'm0', title: '', goal: [], hints: [], checkpoint: '' },
            { id: 'm1', title: '', goal: [], hints: [], checkpoint: '', code: { language: 'toml', code: '[package]' } },
            { id: 'm2', title: '', goal: [], hints: [], checkpoint: '', code: { language: 'rust', code: 'm2' } },
            { id: 'm3', title: '', goal: [], hints: [], checkpoint: '', code: { language: 'rust', code: 'm3', expect: 'compiles', stdout: '3' } },
          ],
        }),
      ],
    });

    expect(collectUnits(c)).toEqual([
      { id: 'borrow/clean', code: RUST, expect: 'compiles' },
      { id: 'borrow/runtime', code: RUST, expect: 'panics', panicMessages: [PANIC] },
      { id: 'borrow/compile', code: RUST, expect: 'fails', errorCodes: ['E0382', 'E0505'], messages: ['m1', 'm2'] },
      { id: 'lesson/l1/rust', code: 'l1', expect: 'compiles', stdout: 'out' },
      { id: 'lesson/l1/break-4', code: 'b4', expect: 'fails', stdout: undefined },
      { id: 'lesson/l1/break-5', code: 'b5', expect: 'compiles', stdout: '5' },
      { id: 'lesson/l2/rust', code: 'l2', expect: 'unchecked', stdout: undefined },
      { id: 'drill/d1', code: 'd1', expect: 'fails', errorCodes: ['E0382'], messages: [COMPILE_ERROR] },
      { id: 'drill/d1/fix-1', code: 'f1', expect: 'compiles' },
      { id: 'drill/d1/fix-2', code: 'f2', expect: 'fails' },
      { id: 'drill/d2', code: 'd2', expect: 'panics', panicMessages: [PANIC] },
      { id: 'gotcha/g1', code: 'g1', expect: 'fails', errorCodes: ['E0277'], stdout: undefined },
      { id: 'gotcha/g2', code: 'g2', expect: 'compiles', errorCodes: undefined, stdout: 'hi' },
      { id: 'timeline/t1/rust', code: RUST, expect: 'compiles', stdout: '1\n' },
      { id: 'project/p1/m3', code: 'm3', expect: 'compiles', stdout: '3' },
    ]);
  });

  test('gives every real Rust program a unique id', () => {
    const ids = collectUnits(realContent).map((u) => u.id);
    expect(ids.length).toBeGreaterThan(100);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('filterUnits keeps units whose id contains any filter', () => {
    const units = [{ id: 'drill/a' }, { id: 'gotcha/string-x' }, { id: 'borrow/b' }].map((u) => ({ ...u, code: '', expect: 'compiles' as const }));
    expect(filterUnits(units, null).map((u) => u.id)).toEqual(['drill/a', 'gotcha/string-x', 'borrow/b']);
    expect(filterUnits(units, ['drill/', 'string']).map((u) => u.id)).toEqual(['drill/a', 'gotcha/string-x']);
    expect(filterUnits(units, ['nothing'])).toEqual([]);
  });

  test('needsBinary is true for panics and for units with stdout', () => {
    expect(needsBinary({ id: 'a', code: '', expect: 'panics' })).toBe(true);
    expect(needsBinary({ id: 'a', code: '', expect: 'compiles', stdout: '' })).toBe(true);
    expect(needsBinary({ id: 'a', code: '', expect: 'compiles' })).toBe(false);
    expect(needsBinary({ id: 'a', code: '', expect: 'fails' })).toBe(false);
  });
});

describe('evaluate', () => {
  const outcome = (over: Partial<RustOutcome> = {}): RustOutcome => ({ compiled: true, compileErr: '', runOut: '', runErr: '', panicked: false, ...over });
  const unit = (over: Partial<RustUnit>): RustUnit => ({ id: 'u', code: '', expect: 'compiles', ...over });

  test('accepts anything for unchecked units', () => {
    expect(evaluate(unit({ expect: 'unchecked' }), outcome({ compiled: false }))).toEqual([]);
  });

  describe('fails', () => {
    const errors = 'error[E0382]: borrow of moved value   \n\nerror[E0502]: cannot borrow\nerror[E0382]: again\nerror: aborting';

    test('reports code that compiled', () => {
      expect(evaluate(unit({ expect: 'fails' }), outcome())).toEqual(['expected a compile error, but it compiled']);
    });

    test('accepts the same set of error codes and verbatim messages', () => {
      const u = unit({ expect: 'fails', errorCodes: ['E0502', 'E0382', 'E0382'], messages: ['error[E0382]: borrow of moved value\n', 'error[E0502]: cannot borrow'] });
      expect(evaluate(u, outcome({ compiled: false, compileErr: errors }))).toEqual([]);
    });

    test('accepts any error when no codes or messages are authored', () => {
      expect(evaluate(unit({ expect: 'fails' }), outcome({ compiled: false, compileErr: 'error: expected `;`' }))).toEqual([]);
    });

    test('reports different error codes with the rustc output', () => {
      const u = unit({ expect: 'fails', errorCodes: ['E0499'] });
      expect(evaluate(u, outcome({ compiled: false, compileErr: errors }))).toEqual([
        'error codes differ: authored [E0499] vs rustc [E0382,E0502]\n    error[E0382]: borrow of moved value   \n    \n    error[E0502]: cannot borrow\n    error[E0382]: again\n    error: aborting',
      ]);
    });

    test('shows (empty) when rustc printed nothing', () => {
      const u = unit({ expect: 'fails', errorCodes: ['E0499'] });
      expect(evaluate(u, outcome({ compiled: false }))).toEqual(['error codes differ: authored [E0499] vs rustc []\n    (empty)']);
    });

    test('reports messages that are not verbatim', () => {
      const u = unit({ expect: 'fails', messages: ['error[E0382]: borrow of moved value', 'error[E0499]: nope'] });
      expect(evaluate(u, outcome({ compiled: false, compileErr: 'error[E0382]: borrow of moved value' }))).toEqual([
        'message[1] is not verbatim rustc output. Current output:\n    error[E0382]: borrow of moved value',
      ]);
    });
  });

  test('reports compiling units that failed to compile', () => {
    expect(evaluate(unit({ expect: 'compiles' }), outcome({ compiled: false, compileErr: 'error: oops' }))).toEqual([
      'expected to compile, but rustc failed:\n    error: oops',
    ]);
    expect(evaluate(unit({ expect: 'panics' }), outcome({ compiled: false }))).toEqual(['expected to compile, but rustc failed:\n    (empty)']);
  });

  describe('panics', () => {
    test('reports programs that exited cleanly', () => {
      expect(evaluate(unit({ expect: 'panics' }), outcome({ runOut: 'done\n' }))).toEqual([
        'expected a panic, but the program exited cleanly.\nstdout:\n    done',
      ]);
    });

    test('reports failures that are not panics', () => {
      expect(evaluate(unit({ expect: 'panics' }), outcome({ panicked: true, runErr: 'Segmentation fault' }))).toEqual([
        'expected a panic, but the program exited cleanly.\nstdout:\n    (empty)',
      ]);
    });

    test('accepts verbatim panic messages, ignoring thread ids', () => {
      const u = unit({ expect: 'panics', panicMessages: [PANIC] });
      const runErr = "\nthread 'main' (4242) panicked at src/main.rs:2:5:\nboom\nnote: run with `RUST_BACKTRACE=1`";
      expect(evaluate(u, outcome({ panicked: true, runErr }))).toEqual([]);
      expect(evaluate(unit({ expect: 'panics' }), outcome({ panicked: true, runErr }))).toEqual([]);
    });

    test('reports panic messages that are not verbatim', () => {
      const u = unit({ expect: 'panics', panicMessages: ['boom', 'bang'] });
      expect(evaluate(u, outcome({ panicked: true, runErr: PANIC }))).toEqual([`panic message[1] is not verbatim. Current stderr:\n${indent(PANIC)}`]);
    });
  });

  describe('compiles', () => {
    test('accepts compiling code when stdout is not authored', () => {
      expect(evaluate(unit({}), outcome({ panicked: true }))).toEqual([]);
    });

    test('accepts matching stdout, ignoring trailing whitespace', () => {
      expect(evaluate(unit({ stdout: 'a\nb' }), outcome({ runOut: 'a  \nb\n\n' }))).toEqual([]);
    });

    test('reports programs that panicked', () => {
      expect(evaluate(unit({ stdout: 'a' }), outcome({ panicked: true, runErr: PANIC }))).toEqual([
        `expected to run cleanly, but it panicked:\n${indent(PANIC)}`,
      ]);
    });

    test('reports different stdout', () => {
      expect(evaluate(unit({ stdout: 'a' }), outcome({ runOut: 'b\n' }))).toEqual(['stdout differs.\n  authored:\n    a\n  actual:\n    b']);
      expect(evaluate(unit({ stdout: '' }), outcome({ runOut: 'b' }))).toEqual(['stdout differs.\n  authored:\n    (empty)\n  actual:\n    b']);
    });
  });
});

describe('dumpReport', () => {
  test('includes run output for compiled units that need a binary', () => {
    const report = dumpReport({ id: 'u', code: '', expect: 'panics' }, { compiled: true, compileErr: 'warn', runOut: 'out\n', runErr: 'err\n', panicked: true });
    expect(report).toBe('(compiled)\nwarn\n--- stdout ---\nout\n--- stderr ---\nerr\n');
  });

  test('leaves run output out for units that failed or were only type-checked', () => {
    const failed = { compiled: false, compileErr: 'error[E0382]', runOut: '', runErr: '', panicked: false };
    expect(dumpReport({ id: 'u', code: '', expect: 'panics' }, failed)).toBe('(failed to compile)\nerror[E0382]\n');
    expect(dumpReport({ id: 'u', code: '', expect: 'compiles' }, { ...failed, compiled: true, compileErr: '' })).toBe('(compiled)\n\n');
  });
});

describe('checkUnit', () => {
  const root = '/tmp/unmanaged-check-XYZ';
  const setup = (script: Parameters<typeof fakeRun>[0] = {}, dump = false) => {
    const run = fakeRun(script);
    const { fs, files } = fakeFs();
    const ctx: CheckContext = { run, fs, env: { PATH: '/bin' }, edition: '2024', commitHash: 'abc', dump };
    return { run, fs, files, ctx };
  };

  test('skips unchecked units entirely', async () => {
    const { run, fs, ctx } = setup();
    expect(await checkUnit({ id: 'lesson/x/rust', code: RUST, expect: 'unchecked' }, root, ctx)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  test('writes the program and type-checks it without running when no binary is needed', async () => {
    const { run, fs, files, ctx } = setup();
    expect(await checkUnit({ id: 'borrow/move', code: RUST, expect: 'compiles' }, root, ctx)).toEqual([]);

    const dir = join(root, 'borrow__move');
    expect(fs.mkdir).toHaveBeenCalledWith(join(dir, 'src'), { recursive: true });
    expect(files.get(join(dir, 'src', 'main.rs'))).toBe(`${RUST}\n`);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      'rustc',
      ['--edition', '2024', '--crate-type', 'bin', '--crate-name', 'main', '--emit=metadata', '--color', 'never', '-A', 'warnings', '-o', join(dir, 'main'), 'src/main.rs'],
      { cwd: dir },
    );
    expect(files.size).toBe(1);
  });

  test('builds and runs programs with authored stdout', async () => {
    const { run, ctx } = setup({ exec: { gotcha__g: { stdout: '1\n' } } });
    expect(await checkUnit({ id: 'gotcha/g', code: RUST, expect: 'compiles', stdout: '1' }, root, ctx)).toEqual([]);

    const dir = join(root, 'gotcha__g');
    expect(run.mock.calls[0][1]).toContain('--emit=link');
    expect(run).toHaveBeenLastCalledWith(join(dir, 'main'), [], { cwd: dir, timeout: 10_000, env: { PATH: '/bin', RUST_BACKTRACE: '0' } });
  });

  test('makes rustc paths portable in reported problems', async () => {
    const { ctx } = setup({ compile: { drill__d: { reject: { stderr: `error[E0599]: no method\n${RUSTUP_NOTE}` } } } });
    expect(await checkUnit({ id: 'drill/d', code: RUST, expect: 'fails', errorCodes: ['E0382'] }, root, ctx)).toEqual([
      'error codes differ: authored [E0382] vs rustc [E0599]\n    error[E0599]: no method\n      --> /rustc/abc/library/core/src/option.rs:1:1',
    ]);
  });

  test('makes rustc warnings portable in dumps of programs that compiled', async () => {
    const { files, ctx } = setup({ compile: { borrow__w: { stderr: RUSTUP_NOTE } } }, true);
    await checkUnit({ id: 'borrow/w', code: RUST, expect: 'compiles' }, root, ctx);
    expect(files.get(join('.content-check', 'borrow__w.txt'))).toBe('(compiled)\n  --> /rustc/abc/library/core/src/option.rs:1:1\n');
  });

  test('reports the error itself when rustc could not be started', async () => {
    const { ctx } = setup({ compile: { borrow__x: { reject: new Error('spawn rustc ENOENT') } } });
    expect(await checkUnit({ id: 'borrow/x', code: RUST, expect: 'compiles' }, root, ctx)).toEqual([
      'expected to compile, but rustc failed:\n    Error: spawn rustc ENOENT',
    ]);
  });

  test('treats a failing binary as a panic and reads its output', async () => {
    const stderr = "thread 'main' (99) panicked at src/main.rs:2:5:\nboom\n";
    const { ctx } = setup({ exec: { drill__p: { reject: { stdout: 'before\n', stderr, killed: false } } } }, true);
    const unit: RustUnit = { id: 'drill/p', code: RUST, expect: 'panics', panicMessages: [PANIC] };
    expect(await checkUnit(unit, root, ctx)).toEqual([]);
  });

  test('does not treat a killed (timed out) binary as a panic', async () => {
    const { ctx } = setup({ exec: { drill__p: { reject: { stdout: 'partial', killed: true } } } });
    expect(await checkUnit({ id: 'drill/p', code: RUST, expect: 'panics' }, root, ctx)).toEqual([
      'expected a panic, but the program exited cleanly.\nstdout:\n    partial',
    ]);
  });

  test('uses the error text when a failing binary gave no output', async () => {
    const { ctx } = setup({ exec: { gotcha__g: { reject: new Error('EACCES') } } });
    expect(await checkUnit({ id: 'gotcha/g', code: RUST, expect: 'compiles', stdout: 'x' }, root, ctx)).toEqual([
      'expected to run cleanly, but it panicked:\n    Error: EACCES',
    ]);
  });

  test('writes a dump report when asked', async () => {
    const { fs, files, ctx } = setup({ exec: { drill__p: { reject: { stdout: 'o\n', stderr: 'e\n' } } } }, true);
    await checkUnit({ id: 'drill/p', code: RUST, expect: 'panics' }, root, ctx);
    expect(fs.mkdir).toHaveBeenCalledWith('.content-check', { recursive: true });
    expect(files.get(join('.content-check', 'drill__p.txt'))).toBe('(compiled)\n\n--- stdout ---\no\n--- stderr ---\ne\n');
  });
});

describe('main', () => {
  test('passes with structural checks only', async () => {
    const { deps, out, err } = fakeDeps({ content: validContent() });
    expect(await main(['--no-rustc', '--no-dotnet'], deps)).toBe(0);
    expect(out).toEqual(['content check passed']);
    expect(err).toEqual([]);
    expect(deps.run).not.toHaveBeenCalled();
  });

  test('fails on structural problems', async () => {
    const { deps, out, err } = fakeDeps({ content: validContent({ gotchas: [gotcha({ tags: [] })] }) });
    expect(await main(['--no-rustc', '--no-dotnet'], deps)).toBe(1);
    expect(err).toEqual(['✗ gotcha/string-index: needs at least one tag', '\ncontent check failed']);
    expect(out).toEqual([]);
  });

  describe('Rust pass', () => {
    const content = emptyContent({
      snippets: [snippet({ id: 'ok' })],
      drills: [drill({ id: 'd', track: 'ownership', fixes: [{ label: 'a', verdict: 'idiomatic', code: RUST, expect: 'unchecked', uncheckedReason: 'r', note: '' }, { label: 'b', verdict: 'wrong', code: RUST, expect: 'fails', note: '' }] })],
      tracks: [track({ lessons: [] , status: 'planned' })],
    });
    const failing = { compile: { drill__d: { reject: { stderr: COMPILE_ERROR } }, 'drill__d__fix-2': { reject: { stderr: 'error[E0308]: x' } } } };

    test('checks every program and summarises', async () => {
      const { deps, fs, out, err } = fakeDeps({ content, run: fakeRun(failing) });
      expect(await main(['--no-dotnet'], deps)).toBe(0);
      expect(err).toEqual([]);
      expect(out).toEqual([
        '✓ borrow/ok  (compiles)',
        '✓ drill/d  (fails: E0382)',
        '✓ drill/d/fix-2  (fails)',
        '\n3 Rust programs checked, 1 unchecked (need crates), edition 2024',
        'content check passed',
      ]);
      expect(fs.mkdtemp).toHaveBeenCalledWith(join('/tmp', 'unmanaged-check-'));
      expect(fs.rm).toHaveBeenCalledWith(join('/tmp', 'unmanaged-check-XYZ'), { recursive: true, force: true });
    });

    test('reports each problem of a failing program', async () => {
      const { deps, out, err } = fakeDeps({ content, run: fakeRun({ compile: {} }) });
      expect(await main(['--no-dotnet'], deps)).toBe(1);
      expect(err).toEqual(['✗ drill/d: expected a compile error, but it compiled', '✗ drill/d/fix-2: expected a compile error, but it compiled', '\ncontent check failed']);
      expect(out).toEqual(['✓ borrow/ok  (compiles)', '\n3 Rust programs checked, 1 unchecked (need crates), edition 2024']);
    });

    test('fails when the local rustc version differs from meta.ts', async () => {
      const { deps, err } = fakeDeps({ content, run: fakeRun({ ...failing, rustcVersion: 'rustc 1.98.0 (abc 2026-09-01)\n' }) });
      expect(await main(['--no-dotnet'], deps)).toBe(1);
      expect(err[0]).toBe('✗ local rustc 1.98.0 (abc 2026-09-01) differs from src/content/meta.ts (1.97.1). Messages may have drifted: re-check them, then update meta.ts.');
      expect(err.at(-1)).toBe('\ncontent check failed');
    });

    test('uses "unknown" as the commit hash when rustc -vV does not report one', async () => {
      const run = fakeRun({ rustcVerbose: 'rustc 1.97.1\n', compile: { borrow__ok: { reject: { stderr: RUSTUP_NOTE } } } });
      const { deps, err } = fakeDeps({ content: emptyContent({ snippets: [snippet({ id: 'ok' })] }), run });
      expect(await main(['--no-dotnet'], deps)).toBe(1);
      expect(err[0]).toBe('✗ borrow/ok: expected to compile, but rustc failed:\n      --> /rustc/unknown/library/core/src/option.rs:1:1');
    });

    test('--only limits the programs that are checked', async () => {
      const { deps, out } = fakeDeps({ content, run: fakeRun(failing) });
      expect(await main(['--no-dotnet', '--only', 'fix-'], deps)).toBe(0);
      expect(out).toEqual(['✓ drill/d/fix-2  (fails)', '\n1 Rust programs checked, 1 unchecked (need crates), edition 2024', 'content check passed']);
    });

    test('--dump writes a report per checked program', async () => {
      const { deps, files } = fakeDeps({ content, run: fakeRun(failing) });
      await main(['--no-dotnet', '--dump'], deps);
      expect([...files.keys()].filter((f) => f.startsWith('.content-check')).sort()).toEqual([
        join('.content-check', 'borrow__ok.txt'),
        join('.content-check', 'drill__d.txt'),
        join('.content-check', 'drill__d__fix-2.txt'),
      ]);
      expect(files.get(join('.content-check', 'drill__d.txt'))).toBe(`(failed to compile)\n${COMPILE_ERROR}\n`);
    });

    test('checks at most parallelism - 1 programs at once, and at least two', async () => {
      const many = emptyContent({ snippets: Array.from({ length: 8 }, (_, i) => snippet({ id: `s${i}` })) });
      const peakWith = async (parallelism: number) => {
        let running = 0;
        let peak = 0;
        const base = fakeRun();
        const run = async (file: string, args: string[], options?: { cwd?: string }) => {
          if (args[0] === '--version' || args[0] === '-vV') return base(file, args, options);
          running++;
          peak = Math.max(peak, running);
          await new Promise((r) => setTimeout(r, 5));
          running--;
          return { stdout: '', stderr: '' };
        };
        const { deps } = fakeDeps({ content: many, run, parallelism: () => parallelism });
        expect(await main(['--no-dotnet'], deps)).toBe(0);
        return peak;
      };
      expect(await peakWith(4)).toBe(3);
      expect(await peakWith(1)).toBe(2);
    });
  });

  describe('C# pass', () => {
    const csContent = () => {
      const t = timeline({ id: 'lazy' });
      return emptyContent({
        tracks: [
          track({
            lessons: [
              lesson({
                csharp: { code: 'lesson cs', filename: 'A.cs' },
                breaks: [
                  { heading: 'none', body: [] },
                  { heading: 'rust', body: [], code: { language: 'rust', code: RUST, expect: 'compiles' } },
                  { heading: 'cs', body: [], code: { language: 'csharp', code: 'break cs' } },
                ],
                links: [],
                visualize: [],
                timelines: ['lazy'],
                drills: [],
              }),
            ],
          }),
        ],
        snippets: [snippet({ id: 'with', csharpEquivalent: 'snippet cs' }), snippet({ id: 'without' })],
        gotchas: [gotcha({ id: 'with', csharp: 'gotcha cs', seeAlso: undefined }), gotcha({ id: 'without', seeAlso: undefined })],
        timelines: [{ ...t, csharp: { ...t.csharp, code: 'timeline cs', output: 'hi\n' } }],
      });
    };
    const result = (id: string, over: Partial<CsResult> = {}): CsResult => ({
      id,
      mode: 'compile-only',
      compiled: true,
      diagnostics: '',
      stdout: null,
      stderr: null,
      exitCode: null,
      timedOut: false,
      ...over,
    });
    const goodResults = () => [
      result('lesson/moves/csharp', { compiled: false, diagnostics: "warning\nProgram.cs(1,1): error CS0103: The name 'x' does not exist\nProgram.cs(2,1): error CS0103: other" }),
      result('lesson/moves/break-3/csharp'),
      result('borrow/with/csharp', { compiled: false, diagnostics: 'Program.cs(1,1): warning CS1: meh' }),
      result('gotcha/with/csharp'),
      result('timeline/lazy/csharp', { mode: 'run', stdout: 'hi  \n', exitCode: 0 }),
    ];
    const json = (results: CsResult[]) => JSON.stringify(results);

    test('collectCSharp gathers C# from lessons, breaks, snippets, gotchas and timelines', () => {
      expect(collectCSharp(csContent())).toEqual([
        { id: 'lesson/moves/csharp', code: 'lesson cs', run: false },
        { id: 'lesson/moves/break-3/csharp', code: 'break cs', run: false },
        { id: 'borrow/with/csharp', code: 'snippet cs', run: false },
        { id: 'gotcha/with/csharp', code: 'gotcha cs', run: false },
        { id: 'timeline/lazy/csharp', code: 'timeline cs', run: true, expectedOutput: 'hi\n' },
      ]);
    });

    test('compiles every snippet, verifies timelines and writes csharp.json', async () => {
      const { spawn, inputs } = fakeSpawn({ code: 0, stdout: ['Building...\n', json(goodResults()).slice(0, 20), json(goodResults()).slice(20)], stderr: ['noise'] });
      const { deps, fs, files, out, err } = fakeDeps({ content: csContent(), spawn, env: { PATH: '/bin' }, run: fakeRun({ dotnetVersion: '10.0.400\n' }) });

      expect(await main(['--no-rustc'], deps)).toBe(0);

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith('dotnet', ['run', '--project', 'runner', '--no-launch-profile', '-c', 'Release', '--', 'check-csharp'], {
        env: { PATH: '/bin', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(JSON.parse(inputs[0])).toEqual([
        { id: 'lesson/moves/csharp', code: 'lesson cs', run: false },
        { id: 'lesson/moves/break-3/csharp', code: 'break cs', run: false },
        { id: 'borrow/with/csharp', code: 'snippet cs', run: false },
        { id: 'gotcha/with/csharp', code: 'gotcha cs', run: false },
        { id: 'timeline/lazy/csharp', code: 'timeline cs', run: true },
      ]);
      expect(err).toEqual([]);
      expect(out).toEqual([
        "\nCompiling 5 C# snippets with the runner's Roslyn setup…",
        '✓ timeline/lazy/csharp  (C# output verified)',
        'C#: 1 complete programs, 2 compile as excerpts, 2 reference code not shown',
        'content check passed',
      ]);
      expect(fs.mkdir).toHaveBeenCalledWith('src/content/generated', { recursive: true });
      const written = files.get(GENERATED_CSHARP)!;
      // Integer-like hash keys come first, as in any JavaScript object.
      expect(written).toBe(
        `{
  "note": "Generated by npm run check:content. Do not edit.",
  "sdk": "10.0.400",
  "snippets": {
    "${hashCode('gotcha cs')}": {
      "status": "compiles"
    },
    "${hashCode('timeline cs')}": {
      "status": "runs"
    },
    "${hashCode('lesson cs')}": {
      "status": "excerpt",
      "firstError": "Program.cs(1,1): error CS0103: The name 'x' does not exist"
    },
    "${hashCode('break cs')}": {
      "status": "compiles"
    },
    "${hashCode('snippet cs')}": {
      "status": "excerpt"
    }
  }
}
`,
      );
    });

    test('skips the C# pass when dotnet is not installed', async () => {
      const { spawn } = fakeSpawn();
      const { deps, files, out } = fakeDeps({ content: csContent(), spawn, run: fakeRun({ dotnetVersion: null }) });
      expect(await main(['--no-rustc'], deps)).toBe(0);
      expect(out).toEqual(['\n(dotnet not found: skipping the C# pass; src/content/generated/csharp.json left as is)', 'content check passed']);
      expect(spawn).not.toHaveBeenCalled();
      expect(files.size).toBe(0);
    });

    test('retries timelines whose output differs, and passes if the retry matches', async () => {
      const first = goodResults();
      first[4] = { ...first[4], stdout: 'late\n' };
      const { spawn, inputs } = fakeSpawn({ code: 0, stdout: [json(first)] }, { code: 0, stdout: [json([goodResults()[4]])] });
      const { deps, out, err } = fakeDeps({ content: csContent(), spawn });

      expect(await main(['--no-rustc'], deps)).toBe(0);
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(JSON.parse(inputs[1])).toEqual([{ id: 'timeline/lazy/csharp', code: 'timeline cs', run: true }]);
      expect(err).toEqual([]);
      expect(out).toContain('✓ timeline/lazy/csharp  (C# output verified)');
    });

    test('reports timeline output that still differs after the retry', async () => {
      const bad = { ...goodResults()[4], stdout: 'late\n', stderr: 'warn\n' };
      const { spawn } = fakeSpawn({ code: 0, stdout: [json([...goodResults().slice(0, 4), bad])] }, { code: 0, stdout: [json([bad])] });
      const { deps, err, files } = fakeDeps({ content: csContent(), spawn });

      expect(await main(['--no-rustc'], deps)).toBe(1);
      expect(err).toEqual(['✗ timeline/lazy/csharp: output differs.\n  authored:\n    hi\n  actual:\n    late\n  stderr:\n    warn', '\ncontent check failed']);
      expect(files.has(GENERATED_CSHARP)).toBe(true);
    });

    test('reports timelines that print nothing', async () => {
      const bad = { ...goodResults()[4], stdout: null };
      const { spawn } = fakeSpawn({ code: 0, stdout: [json([...goodResults().slice(0, 4), bad])] }, { code: 0, stdout: [json([bad])] });
      const { deps, err } = fakeDeps({ content: csContent(), spawn });

      expect(await main(['--no-rustc'], deps)).toBe(1);
      expect(err[0]).toBe('✗ timeline/lazy/csharp: output differs.\n  authored:\n    hi\n  actual:\n    ');
    });

    test.each([
      ['do not compile', { compiled: false, diagnostics: 'Program.cs(1,1): error CS1: bad' }, 'does not compile:\n    Program.cs(1,1): error CS1: bad'],
      ['have no entry point', { mode: 'compile-only' as const, diagnostics: 'no main' }, 'has no entry point:\n    no main'],
    ])('reports timelines that %s', async (_, over, message) => {
      const bad = { ...goodResults()[4], ...over };
      const { spawn } = fakeSpawn({ code: 0, stdout: [json([...goodResults().slice(0, 4), bad])] }, { code: 0, stdout: [json([bad])] });
      const { deps, err } = fakeDeps({ content: csContent(), spawn });
      expect(await main(['--no-rustc'], deps)).toBe(1);
      expect(err[0]).toBe(`✗ timeline/lazy/csharp: timeline C# must be a complete program, but it ${message}`);
    });

    test('reports timelines that timed out', async () => {
      const bad = { ...goodResults()[4], timedOut: true };
      const { spawn } = fakeSpawn({ code: 0, stdout: [json([...goodResults().slice(0, 4), bad])] });
      const { deps, err } = fakeDeps({ content: csContent(), spawn });
      expect(await main(['--no-rustc'], deps)).toBe(1);
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(err).toEqual(['✗ timeline/lazy/csharp: timed out', '\ncontent check failed']);
    });

    test('fails when dotnet exits with an error', async () => {
      const { spawn } = fakeSpawn({ code: 1, stdout: ['partial'], stderr: ['build failed'] });
      const { deps } = fakeDeps({ content: csContent(), spawn });
      await expect(main(['--no-rustc'], deps)).rejects.toThrow('dotnet exited with 1\nbuild failed\npartial');
    });

    test('fails when dotnet cannot be started', async () => {
      const { spawn } = fakeSpawn({ error: new Error('spawn dotnet EACCES') });
      const { deps } = fakeDeps({ content: csContent(), spawn });
      await expect(main(['--no-rustc'], deps)).rejects.toThrow('spawn dotnet EACCES');
    });

    test('fails when check-csharp prints something other than JSON', async () => {
      const { spawn } = fakeSpawn({ code: 0, stdout: ['Build succeeded.\n[{"id": oops'] });
      const { deps } = fakeDeps({ content: csContent(), spawn });
      await expect(main(['--no-rustc'], deps)).rejects.toThrow(/^could not parse check-csharp output: SyntaxError: .*\nBuild succeeded\.\n\[\{"id": oops$/s);
    });
  });
});

describe('C# helpers', () => {
  const units: CsUnit[] = [
    { id: 'a', code: 'a', run: false },
    { id: 't1', code: 't1', run: true, expectedOutput: 'x' },
    { id: 't2', code: 't2', run: true, expectedOutput: 'y\n' },
  ];
  const res = (id: string, stdout: string | null): CsResult => ({ id, mode: 'run', compiled: true, diagnostics: '', stdout, stderr: null, exitCode: 0, timedOut: false });

  test('parseCheckCSharpOutput accepts plain JSON and JSON after build output', () => {
    expect(parseCheckCSharpOutput('[]')).toEqual([]);
    expect(parseCheckCSharpOutput('Restore complete\n[{"id":"a"}]')).toEqual([{ id: 'a' }]);
  });

  test('parseCheckCSharpOutput truncates long unparseable output to 2000 characters', () => {
    const out = 'x'.repeat(3000);
    expect(() => parseCheckCSharpOutput(out)).toThrow(new RegExp(`\\n${'x'.repeat(2000)}$`));
  });

  test('resultsToRetry picks timelines whose output does not match', () => {
    const results = [res('a', 'anything'), res('t1', 'x\n'), res('t2', 'z')];
    expect(resultsToRetry(units, results)).toEqual([results[2]]);
    expect(resultsToRetry(units, [res('a', null), res('t1', null), res('t2', 'y')])).toEqual([res('t1', null)]);
  });

  test('mergeRetried replaces results by id and keeps the rest', () => {
    const again = [res('t2', 'y')];
    expect(mergeRetried([res('a', ''), res('t2', 'z')], again)).toEqual([res('a', ''), res('t2', 'y')]);
  });

  test('csStatus classifies results', () => {
    expect(csStatus({ ...res('a', null), compiled: false })).toBe('excerpt');
    expect(csStatus(res('a', null))).toBe('runs');
    expect(csStatus({ ...res('a', null), mode: 'compile-only' })).toBe('compiles');
  });

  test('classifyCSharp counts statuses without logging for non-timeline units', () => {
    const { logger, out, err } = fakeLogger();
    const report = classifyCSharp([units[0]], [{ ...res('a', null), mode: 'compile-only' }], logger);
    expect(report).toEqual({ failed: false, snippets: { [hashCode('a')]: { status: 'compiles' } }, counts: { runs: 0, compiles: 1, excerpt: 0 } });
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  test('generatedCSharpJson trims the sdk version and ends with a newline', () => {
    expect(generatedCSharpJson(' 10.0.400\n', {})).toBe('{\n  "note": "Generated by npm run check:content. Do not edit.",\n  "sdk": "10.0.400",\n  "snippets": {}\n}\n');
  });
});

describe('nodeDeps', () => {
  test('wires node child processes, filesystem, console and the real content', async () => {
    const deps = nodeDeps();
    expect(deps.fs).toEqual({ mkdir: fsPromises.mkdir, mkdtemp: fsPromises.mkdtemp, rm: fsPromises.rm, writeFile: fsPromises.writeFile });
    expect(deps.logger).toBe(console);
    expect(deps.env).toBe(process.env);
    expect(deps.tmpdir()).toBe(tmpdir());
    expect(deps.parallelism()).toBeGreaterThan(0);
    expect(deps.content).toBe(realContent);
    expect(deps.toolchain).toBe(realToolchain);

    const { stdout } = await deps.run(process.execPath, ['-e', 'process.stdout.write("ran")']);
    expect(stdout).toBe('ran');
  });

  test('spawns real processes with piped stdio', async () => {
    const child = nodeDeps().spawn(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const echoed = await new Promise<string>((resolve) => {
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('close', () => resolve(out));
      child.stdin.end('hello');
    });
    expect(echoed).toBe('hello');
  });
});
