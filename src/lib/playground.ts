// Pure parsing for Rust Playground responses (kept free of browser APIs so it can be unit-tested).

export type Backend = 'runner' | 'playground';

export interface RunOutcome {
  backend: Backend;
  toolchain: string;
  mode: 'run' | 'compile-only';
  compiled: boolean;
  /** Compiler diagnostics (errors and warnings), possibly empty. */
  compileOutput: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number | null;
}

/** The playground runs cargo, so compiler and program stderr arrive in one stream. */
export function splitPlaygroundOutput(r: { success: boolean; exitDetail: string; stdout: string; stderr: string }): Omit<RunOutcome, 'durationMs'> {
  const lines = r.stderr.split('\n');
  const runningAt = lines.findIndex((l) => /^\s+Running `/.test(l));
  const compileLines = (runningAt >= 0 ? lines.slice(0, runningAt) : lines).filter(
    (l) => !/^\s+(Compiling|Finished|Blocking|Updating|Downloaded?|Locking) /.test(l),
  );
  const compiled = runningAt >= 0;
  const exit = r.exitDetail.match(/status (\d+)/);
  const timedOut = /timed out|killed/i.test(r.exitDetail);
  return {
    backend: 'playground',
    toolchain: 'Rust Playground, stable',
    mode: 'run',
    compiled,
    compileOutput: compileLines.join('\n').replace(/\n*error: could not compile `playground`[^\n]*\n?/, '\n').trim(),
    stdout: compiled ? r.stdout : '',
    stderr: compiled ? lines.slice(runningAt + 1).join('\n').replace(/thread '([^']*)' \(\d+\) panicked/g, "thread '$1' panicked") : '',
    exitCode: compiled ? (r.success ? 0 : exit ? Number(exit[1]) : null) : null,
    timedOut,
    truncated: false,
  };
}

