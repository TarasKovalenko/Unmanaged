import { describe, expect, test } from 'vitest';

import { splitPlaygroundOutput } from '../../src/lib/playground.ts';

const header = '   Compiling playground v0.0.1 (/playground)\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.61s\n     Running `target/debug/playground`\n';

describe('splitPlaygroundOutput', () => {
  test('keeps diagnostics and drops cargo noise when compilation fails', () => {
    const o = splitPlaygroundOutput({
      success: false,
      exitDetail: 'Exited with status 101',
      stdout: 'ignored',
      stderr:
        "   Compiling playground v0.0.1 (/playground)\nerror[E0382]: borrow of moved value: `s`\n --> src/main.rs:1:57\n\nerror: could not compile `playground` (bin \"playground\") due to 1 previous error\n",
    });
    expect(o).toEqual({
      backend: 'playground',
      toolchain: 'Rust Playground, stable',
      mode: 'run',
      compiled: false,
      compileOutput: "error[E0382]: borrow of moved value: `s`\n --> src/main.rs:1:57",
      stdout: '',
      stderr: '',
      exitCode: null,
      timedOut: false,
      truncated: false,
    });
  });

  test('splits compiler and program output on a panic and strips thread ids', () => {
    const o = splitPlaygroundOutput({
      success: false,
      exitDetail: 'Exited with status 101',
      stdout: 'hi\n',
      stderr: `${header}\nthread 'main' (12) panicked at src/main.rs:6:10:\nRefCell already borrowed\n`,
    });
    expect(o.compiled).toBe(true);
    expect(o.compileOutput).toBe('');
    expect(o.exitCode).toBe(101);
    expect(o.stdout).toBe('hi\n');
    expect(o.stderr).toBe("\nthread 'main' panicked at src/main.rs:6:10:\nRefCell already borrowed\n");
  });

  test('reports exit code 0 for a successful run and keeps warnings', () => {
    const o = splitPlaygroundOutput({
      success: true,
      exitDetail: '',
      stdout: 'ok\n',
      stderr: `warning: unused variable: \`x\`\n${header}`,
    });
    expect(o).toMatchObject({ compiled: true, exitCode: 0, stdout: 'ok\n', compileOutput: 'warning: unused variable: `x`', timedOut: false });
  });

  test('has no exit code when a failed run reports no status, and flags a timeout', () => {
    const o = splitPlaygroundOutput({ success: false, exitDetail: 'Process timed out', stdout: '', stderr: header });
    expect(o).toMatchObject({ compiled: true, exitCode: null, timedOut: true });
    expect(splitPlaygroundOutput({ success: false, exitDetail: 'Killed', stdout: '', stderr: header }).timedOut).toBe(true);
  });
});
