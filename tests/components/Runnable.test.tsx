import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { tracks } from '../../src/content/tracks/index.ts';
import { CodeEditor, RunControls, RunOutput } from '../../src/components/Runnable';
import type { Runnable, RunState } from '../../src/components/useRunnable';
import { csharpStatus, type RunOutcome } from '../../src/lib/runner';

const lessons = tracks.flatMap((t) => t.lessons);
const csharpWithStatus = (status: 'runs' | 'compiles' | 'excerpt') => lessons.find((l) => csharpStatus(l.csharp.code)?.status === status)!.csharp.code;

function fakeRunnable(overrides: Partial<Runnable> = {}): Runnable {
  return {
    language: 'rust',
    backend: 'runner',
    original: 'fn main() {}',
    code: 'fn main() {}',
    setCode: vi.fn(),
    editing: false,
    setEditing: vi.fn(),
    modified: false,
    reset: vi.fn(),
    state: { status: 'idle' },
    run: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  };
}

function outcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    backend: 'runner',
    toolchain: 'rustc 1.90.0',
    mode: 'run',
    compiled: true,
    compileOutput: '',
    stdout: 'hello\n',
    stderr: '',
    exitCode: 0,
    timedOut: false,
    truncated: false,
    durationMs: 120,
    ...overrides,
  };
}

const done = (o: Partial<RunOutcome> = {}, ranOriginal = true): RunState => ({ status: 'done', outcome: outcome(o), ranOriginal });

describe('RunControls', () => {
  test('renders nothing when there is no runnable or no backend', () => {
    const { container, rerender } = render(<RunControls r={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RunControls r={fakeRunnable({ backend: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('offers Edit and Run on the code runner, and runs on click', async () => {
    const r = fakeRunnable();
    render(<RunControls r={r} />);
    const run = screen.getByRole('button', { name: 'Run' });
    expect(run).toHaveAttribute('title', 'Run (on the code runner)');
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    await userEvent.click(run);
    expect(r.run).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(r.setEditing).toHaveBeenCalledWith(true);
  });

  test('while editing a modified copy it shows Done, Reset and the shortcut hint', async () => {
    const r = fakeRunnable({ editing: true, modified: true, backend: 'playground' });
    render(<RunControls r={r} />);
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(done);
    expect(r.setEditing).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(r.reset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('title', 'Run (on play.rust-lang.org). Ctrl/Cmd+Enter');
  });

  test('hides the edit buttons when editing is not allowed', () => {
    render(<RunControls r={fakeRunnable({ modified: true })} allowEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  test('shows a disabled Running… button while a run is in progress', () => {
    render(<RunControls r={fakeRunnable({ state: { status: 'running', backend: 'runner' } })} />);
    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled();
  });

  test('C# that only compiles is labelled Compile, and Compiling… while running', () => {
    const code = csharpWithStatus('compiles');
    const base = { language: 'csharp' as const, code, original: code, csharp: csharpStatus(code) };
    const { rerender } = render(<RunControls r={fakeRunnable(base)} />);
    expect(screen.getByRole('button', { name: 'Compile' })).toHaveAttribute('title', 'Compile (on the code runner)');
    rerender(<RunControls r={fakeRunnable({ ...base, state: { status: 'running', backend: 'runner' } })} />);
    expect(screen.getByRole('button', { name: 'Compiling…' })).toBeDisabled();
  });

  test('C# is labelled Run when it runs, when it was edited, or when its status is unknown', () => {
    const runs = csharpWithStatus('runs');
    const { rerender } = render(<RunControls r={fakeRunnable({ language: 'csharp', csharp: csharpStatus(runs) })} />);
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    rerender(<RunControls r={fakeRunnable({ language: 'csharp', modified: true, csharp: { status: 'excerpt' } })} />);
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    rerender(<RunControls r={fakeRunnable({ language: 'csharp', csharp: undefined })} />);
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });
});

describe('CodeEditor', () => {
  function Harness({ initial, language = 'rust', run = vi.fn(), setEditing = vi.fn(), minRows }: { initial: string; language?: 'rust' | 'csharp'; run?: () => void; setEditing?: (e: boolean) => void; minRows?: number }) {
    const [code, setCode] = useState(initial);
    return <CodeEditor r={fakeRunnable({ language, code, setCode, run, setEditing })} minRows={minRows} />;
  }

  test('is focused on mount, labelled for its language, and sized to the code', () => {
    const { unmount } = render(<Harness initial={'a\nb\nc\nd'} />);
    const box = screen.getByRole('textbox', { name: /Edit Rust code/ });
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('rows', '5');
    unmount();
    render(<Harness initial="x" language="csharp" minRows={6} />);
    const csharp = screen.getByRole('textbox', { name: /Edit C# code/ });
    expect(csharp).toHaveAttribute('rows', '6');
  });

  test('typing updates the code', async () => {
    render(<Harness initial="" />);
    await userEvent.type(screen.getByRole('textbox'), 'let x');
    expect(screen.getByRole('textbox')).toHaveValue('let x');
  });

  test('Tab inserts four spaces and puts the caret after them', async () => {
    render(<Harness initial="ab" />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox');
    box.setSelectionRange(1, 1);
    await userEvent.keyboard('{Tab}');
    expect(box).toHaveValue('a    b');
    await waitFor(() => expect(box.selectionStart).toBe(5));
    expect(box).toHaveFocus();
  });

  test('Shift+Tab is left to the browser', async () => {
    render(<Harness initial="ab" />);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('textbox')).toHaveValue('ab');
  });

  test('Enter keeps the indentation of the current line', async () => {
    render(<Harness initial={'    let x = 1;'} />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox');
    box.setSelectionRange(14, 14);
    await userEvent.keyboard('{Enter}');
    expect(box).toHaveValue('    let x = 1;\n    ');
    await waitFor(() => expect(box.selectionStart).toBe(19));
  });

  test('Enter after an opening brace indents one more level', async () => {
    render(<Harness initial={'fn main() {\n    if x {'} />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox');
    box.setSelectionRange(box.value.length, box.value.length);
    await userEvent.keyboard('{Enter}');
    expect(box).toHaveValue('fn main() {\n    if x {\n        ');
  });

  test('Ctrl+Enter and Cmd+Enter run the code without inserting a newline', async () => {
    const run = vi.fn();
    render(<Harness initial="x" run={run} />);
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(run).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox')).toHaveValue('x');
  });

  test('Escape stops editing', async () => {
    const setEditing = vi.fn();
    render(<Harness initial="x" setEditing={setEditing} />);
    await userEvent.keyboard('{Escape}');
    expect(setEditing).toHaveBeenCalledWith(false);
  });
});

describe('RunOutput', () => {
  test('renders nothing without a runnable or before any run', () => {
    const { container, rerender } = render(<RunOutput r={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RunOutput r={fakeRunnable()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows progress, naming the playground when it is used', () => {
    const { rerender } = render(<RunOutput r={fakeRunnable({ state: { status: 'running', backend: 'runner' } })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Compiling and running…');
    rerender(<RunOutput r={fakeRunnable({ backend: 'playground', state: { status: 'running', backend: 'playground' } })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Compiling and running on play.rust-lang.org…');
  });

  test('shows errors with a close button', async () => {
    const r = fakeRunnable({ state: { status: 'error', message: 'The code runner could not be reached.' } });
    render(<RunOutput r={r} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The code runner could not be reached.');
    await userEvent.click(screen.getByRole('button', { name: 'Close output' }));
    expect(r.dismiss).toHaveBeenCalled();
  });

  test('a successful run shows stdout, toolchain and duration, and can be dismissed', async () => {
    const r = fakeRunnable({ state: done() });
    render(<RunOutput r={r} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('ran successfully');
    expect(status).not.toHaveTextContent('exit 0');
    expect(status).toHaveTextContent('rustc 1.90.0, 120 ms');
    expect(status).toHaveTextContent('stdouthello');
    expect(status).not.toHaveTextContent('stderr');
    expect(status).not.toHaveTextContent('truncated');
    await userEvent.click(screen.getByRole('button', { name: 'Close output' }));
    expect(r.dismiss).toHaveBeenCalled();
  });

  test('says when nothing was printed, when the code was edited, and omits a missing duration', () => {
    render(<RunOutput r={fakeRunnable({ state: done({ stdout: '', durationMs: null, backend: 'playground' }, false) })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('ran successfully, your edited version');
    expect(status).toHaveTextContent('(nothing printed)');
    expect(screen.getByText('play.rust-lang.org')).toBeInTheDocument();
    expect(status).not.toHaveTextContent('ms');
  });

  test('a Rust compile error shows compiler output but no program output', () => {
    const message = 'error[E0382]: borrow of moved value: `s`\n --> src/main.rs:4:20\n';
    render(<RunOutput r={fakeRunnable({ state: done({ compiled: false, compileOutput: message, exitCode: null, stdout: '' }) })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('did not compile');
    expect(status).toHaveTextContent('compiler output');
    expect(screen.getByText('error[E0382]: borrow of moved value: `s`')).toHaveClass('text-danger');
    expect(status).not.toHaveTextContent('stdout');
  });

  test('compiler warnings are labelled as warnings when the code compiled', () => {
    render(<RunOutput r={fakeRunnable({ state: done({ compileOutput: 'warning: unused variable: `x`' }) })} />);
    expect(screen.getByText('compiler warnings')).toBeInTheDocument();
  });

  test('C# diagnostics colour errors and warnings line by line', () => {
    const text = 'Program.cs(1,1): error CS0103: nope\nProgram.cs(2,1): warning CS0168: unused\nBuild FAILED.\n';
    render(<RunOutput r={fakeRunnable({ language: 'csharp', state: done({ compiled: false, compileOutput: text, exitCode: null }) })} />);
    expect(screen.getByText('Program.cs(1,1): error CS0103: nope')).toHaveClass('text-danger');
    expect(screen.getByText('Program.cs(2,1): warning CS0168: unused')).toHaveClass('text-ochre');
    expect(screen.getByText('Build FAILED.')).not.toHaveClass('text-danger', 'text-ochre');
  });

  test('a Rust panic shows the exit code and the coloured stderr', () => {
    const stderr = "thread 'main' panicked at src/main.rs:6:10:\nRefCell already borrowed\n";
    render(<RunOutput r={fakeRunnable({ state: done({ exitCode: 101, stderr, stdout: '' }) })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('compiled, then panicked (exit 101)');
    expect(screen.getByText('stderr')).toBeInTheDocument();
    expect(screen.getByText("thread 'main' panicked at src/main.rs:6:10:")).toHaveClass('text-ochre');
  });

  test('a C# unhandled exception shows stderr as plain text', () => {
    const stderr = 'Unhandled exception. System.InvalidOperationException: boom\n';
    render(<RunOutput r={fakeRunnable({ language: 'csharp', state: done({ exitCode: 134, stderr, toolchain: '.NET 10' }) })} />);
    expect(screen.getByRole('status')).toHaveTextContent('compiled, then threw an unhandled exception (aborted (SIGABRT))');
    expect(screen.getByText('Unhandled exception. System.InvalidOperationException: boom')).toHaveClass('text-ochre');
  });

  test.each([
    [137, 'killed: memory limit (SIGKILL)'],
    [152, 'killed: CPU time limit (SIGXCPU)'],
    [153, 'killed: file size limit (SIGXFSZ)'],
    [134, 'aborted (SIGABRT)'],
    [143, 'killed by signal 15'],
    [3, 'exit 3'],
  ])('a non-zero exit %i is described as "%s"', (exitCode, text) => {
    render(<RunOutput r={fakeRunnable({ state: done({ exitCode }) })} />);
    expect(screen.getByRole('status')).toHaveTextContent(`exited with a non-zero status (${text})`);
  });

  test('a timeout without an exit code shows no exit description, and notes truncation', () => {
    render(<RunOutput r={fakeRunnable({ state: done({ timedOut: true, exitCode: null, truncated: true }) })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('stopped: ran longer than the time limit');
    expect(status).not.toHaveTextContent('(exit');
    expect(status).toHaveTextContent('Output was truncated.');
  });

  test('compile-only C# says there was nothing to run and shows no stdout', () => {
    render(<RunOutput r={fakeRunnable({ language: 'csharp', state: done({ mode: 'compile-only', exitCode: null, stdout: '' }) })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('compiles (no entry point, so nothing to run)');
    expect(status).not.toHaveTextContent('stdout');
  });

  test('explains that an original C# excerpt cannot compile on its own', () => {
    const excerpt = csharpWithStatus('excerpt');
    const failedOutcome = { compiled: false, compileOutput: 'Program.cs(1,1): error CS0246: missing', exitCode: null };
    const failed = done(failedOutcome);
    const { rerender } = render(<RunOutput r={fakeRunnable({ language: 'csharp', csharp: csharpStatus(excerpt), state: failed })} />);
    expect(screen.getByText(/This C# is an excerpt/)).toBeInTheDocument();

    // Not for an edited copy, and not for code that compiles on its own.
    rerender(<RunOutput r={fakeRunnable({ language: 'csharp', csharp: csharpStatus(excerpt), state: done(failedOutcome, false) })} />);
    expect(screen.queryByText(/This C# is an excerpt/)).not.toBeInTheDocument();
    rerender(<RunOutput r={fakeRunnable({ language: 'csharp', csharp: { status: 'compiles' }, state: failed })} />);
    expect(screen.queryByText(/This C# is an excerpt/)).not.toBeInTheDocument();
    rerender(<RunOutput r={fakeRunnable({ language: 'rust', csharp: { status: 'excerpt' }, state: failed })} />);
    expect(screen.queryByText(/This C# is an excerpt/)).not.toBeInTheDocument();
  });
});
