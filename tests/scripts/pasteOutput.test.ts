import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test, vi } from 'vitest';

import { dumpPath, escapeTemplate, extractOutput, main, nodePasteDeps } from '../../scripts/lib/pasteOutput.ts';
import type { PasteDeps } from '../../scripts/lib/pasteOutput.ts';

const compileDump = [
  '(failed to compile)',
  'warning: unused variable',
  'error[E0382]: borrow of moved value: `s`   ',
  ' --> src/main.rs:4:20',
  '  |',
  '3 |     let t = s;',
  '  |             - value moved here',
  '',
  'error: aborting due to 1 previous error',
  '',
  'For more information about this error, try `rustc --explain E0382`.',
  '',
].join('\n');

const panicDump = [
  '(compiled)',
  '',
  '--- stdout ---',
  'before',
  '--- stderr ---',
  "thread 'main' (17287168) panicked at src/main.rs:3:5:",
  'index out of bounds: the len is 3 but the index is 5',
  'note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace',
  '',
].join('\n');

describe('extractOutput', () => {
  test('takes compile errors from the first error[ up to error: aborting, trimming line ends', () => {
    expect(extractOutput(compileDump)).toBe(
      'error[E0382]: borrow of moved value: `s`\n --> src/main.rs:4:20\n  |\n3 |     let t = s;\n  |             - value moved here',
    );
  });

  test('prefers compile errors over panic output', () => {
    expect(extractOutput(`${panicDump}\nerror[E0599]: no method`)).toBe('error[E0599]: no method');
  });

  test('takes the panic line and message and removes the thread id', () => {
    expect(extractOutput(panicDump)).toBe("thread 'main' panicked at src/main.rs:3:5:\nindex out of bounds: the len is 3 but the index is 5");
  });

  test('takes panic output to the end when there is no backtrace note', () => {
    expect(extractOutput("thread 'worker' panicked at src/main.rs:1:1:\nboom  \n\n")).toBe("thread 'worker' panicked at src/main.rs:1:1:\nboom");
  });

  test('returns null when there is neither a compile error nor a panic', () => {
    expect(extractOutput('(compiled)\n\n--- stdout ---\nok\n--- stderr ---\n')).toBeNull();
  });
});

describe('escapeTemplate', () => {
  test('escapes backslashes, backticks and ${ for a template literal', () => {
    expect(escapeTemplate('a \\n `b` ${c} $d')).toBe('a \\\\n \\`b\\` \\${c} $d');
  });
});

describe('dumpPath', () => {
  test('maps a unit id to its --dump file', () => {
    expect(dumpPath('drill/move-in-loop/fix-1')).toBe(join('.content-check', 'drill__move-in-loop__fix-1.txt'));
  });
});

describe('main', () => {
  const setup = (files: Record<string, string>) => {
    const out: string[] = [];
    const err: string[] = [];
    const deps: PasteDeps = {
      readFile: vi.fn((path: string) => {
        if (!(path in files)) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        return files[path];
      }),
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
    };
    return { deps, out, err };
  };

  test('prints usage and fails without a unit id', () => {
    const { deps, out, err } = setup({});
    expect(main([], deps)).toBe(1);
    expect(err).toEqual(['usage: npm run paste-output -- <unit id, e.g. drill/move-in-loop>']);
    expect(out).toEqual([]);
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  test('prints the escaped compile error for the unit', () => {
    const { deps, out, err } = setup({ [dumpPath('drill/move')]: compileDump });
    expect(main(['drill/move'], deps)).toBe(0);
    expect(out).toEqual([
      'error[E0382]: borrow of moved value: \\`s\\`\n --> src/main.rs:4:20\n  |\n3 |     let t = s;\n  |             - value moved here\n',
    ]);
    expect(err).toEqual([]);
  });

  test('prints the panic output for the unit', () => {
    const { deps, out } = setup({ [dumpPath('borrow/refcell')]: panicDump });
    expect(main(['borrow/refcell'], deps)).toBe(0);
    expect(out).toEqual(["thread 'main' panicked at src/main.rs:3:5:\nindex out of bounds: the len is 3 but the index is 5\n"]);
  });

  test('fails when the dump has nothing to paste', () => {
    const { deps, out, err } = setup({ [dumpPath('gotcha/ok')]: '(compiled)\n\n' });
    expect(main(['gotcha/ok'], deps)).toBe(1);
    expect(err).toEqual(['no compiler error or panic found in .content-check for gotcha/ok']);
    expect(out).toEqual([]);
  });

  test('throws when there is no dump for the unit', () => {
    const { deps } = setup({});
    expect(() => main(['drill/missing'], deps)).toThrow('ENOENT');
  });
});

describe('nodePasteDeps', () => {
  test('reads files as UTF-8 and writes to stdout and stderr', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paste-output-'));
    const file = join(dir, 'dump.txt');
    writeFileSync(file, 'héllo');
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const deps = nodePasteDeps();
    expect(deps.readFile(file)).toBe('héllo');
    deps.stdout('out\n');
    deps.stderr('err');

    expect(write).toHaveBeenCalledWith('out\n');
    expect(error).toHaveBeenCalledWith('err');
  });
});
