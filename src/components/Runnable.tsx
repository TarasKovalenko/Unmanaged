import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { classify } from '../lib/runner';
import type { Runnable } from './useRunnable';
import { RustcOutput } from './RustcOutput';

/** Buttons for a code block header. Renders nothing when no backend can run this language. */
export function RunControls({ r, allowEdit = true }: { r: Runnable | null; allowEdit?: boolean }) {
  if (!r?.backend) return null;
  const compileOnly = r.language === 'csharp' && !r.modified && r.csharp && r.csharp.status !== 'runs';
  const running = r.state.status === 'running';
  return (
    <span className="flex items-center gap-1.5 font-mono text-[12px]">
      {allowEdit && r.modified && (
        <button type="button" onClick={r.reset} className="rounded-[3px] px-1.5 py-0.5 text-muted hover:text-text" title="Restore the original code">
          Reset
        </button>
      )}
      {allowEdit && (
        <button
          type="button"
          onClick={() => r.setEditing(!r.editing)}
          aria-pressed={r.editing}
          className={`rounded-[3px] border px-2 py-0.5 ${r.editing ? 'border-ochre text-strong' : 'border-rule text-muted hover:text-text'}`}
        >
          {r.editing ? 'Done' : 'Edit'}
        </button>
      )}
      <button
        type="button"
        onClick={r.run}
        disabled={running}
        className="inline-flex items-center gap-1.5 rounded-[3px] border border-oxide bg-oxide/15 px-2 py-0.5 text-strong hover:bg-oxide/30 disabled:opacity-60"
        title={`${compileOnly ? 'Compile' : 'Run'} (${r.backend === 'playground' ? 'on play.rust-lang.org' : 'on the code runner'})${r.editing ? '. Ctrl/Cmd+Enter' : ''}`}
      >
        <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true">
          <path d="M0 0 9 5 0 10Z" fill="currentColor" />
        </svg>
        {running ? (compileOnly ? 'Compiling…' : 'Running…') : compileOnly ? 'Compile' : 'Run'}
      </button>
    </span>
  );
}

/** A plain, dependency-free editor: a textarea styled like the code blocks. */
export function CodeEditor({ r, minRows = 3 }: { r: Runnable; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rows = Math.max(minRows, r.code.split('\n').length + 1);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      r.run();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      r.setEditing(false);
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart: start, selectionEnd: end, value } = el;
      const next = `${value.slice(0, start)}    ${value.slice(end)}`;
      r.setCode(next);
      requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      // Keep the current line's indentation.
      e.preventDefault();
      const { selectionStart: start, selectionEnd: end, value } = el;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indent = value.slice(lineStart).match(/^ */)![0];
      const extra = /[{([]\s*$/.test(value.slice(lineStart, start)) ? '    ' : '';
      const insert = `\n${indent}${extra}`;
      r.setCode(`${value.slice(0, start)}${insert}${value.slice(end)}`);
      requestAnimationFrame(() => el.setSelectionRange(start + insert.length, start + insert.length));
    }
  }

  return (
    <textarea
      ref={ref}
      value={r.code}
      onChange={(e) => r.setCode(e.target.value)}
      onKeyDown={onKeyDown}
      rows={rows}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      wrap="off"
      aria-label={`Edit ${r.language === 'rust' ? 'Rust' : 'C#'} code. Ctrl or Cmd+Enter runs it, Escape stops editing.`}
      className="block w-full resize-y overflow-x-auto bg-bg/70 px-4 py-2 font-mono text-[13px] leading-[1.7] text-strong outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
    />
  );
}

const KIND_TEXT = {
  ok: { text: 'ran successfully', cls: 'text-verdigris' },
  'compile-error': { text: 'did not compile', cls: 'text-danger' },
  'compiles-only': { text: 'compiles (no entry point, so nothing to run)', cls: 'text-verdigris' },
  panic: { text: 'compiled, then panicked', cls: 'text-ochre' },
  exception: { text: 'compiled, then threw an unhandled exception', cls: 'text-ochre' },
  exit: { text: 'exited with a non-zero status', cls: 'text-ochre' },
  timeout: { text: 'stopped: ran longer than the time limit', cls: 'text-danger' },
} as const;

/** Output of the last run, shown under a code block. */
export function RunOutput({ r }: { r: Runnable | null }) {
  if (!r || r.state.status === 'idle') return null;
  const { state } = r;

  if (state.status === 'running') {
    return (
      <div className="border-t border-rule bg-bg/60 px-3 py-2 font-mono text-[12px] text-muted" role="status">
        {r.backend === 'playground' ? 'Compiling and running on play.rust-lang.org…' : 'Compiling and running…'}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex items-start justify-between gap-3 border-t border-rule bg-danger-soft px-3 py-2 text-[0.9rem]" role="alert">
        <span>{state.message}</span>
        <DismissButton onClick={r.dismiss} />
      </div>
    );
  }

  const o = state.outcome;
  const kind = classify(r.language, o);
  const excerptHint =
    r.language === 'csharp' && state.ranOriginal && r.csharp?.status === 'excerpt'
      ? 'This C# is an excerpt: it uses types or members defined elsewhere in the lesson, so it does not compile on its own. Edit it to add what it needs.'
      : null;

  return (
    <div className="border-t border-rule bg-bg/60" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 pt-2 font-mono text-[12px]">
        <span className={KIND_TEXT[kind].cls}>
          {KIND_TEXT[kind].text}
          {o.exitCode !== null && kind !== 'ok' && kind !== 'compile-error' ? ` (${describeExit(o.exitCode)})` : ''}
          {state.ranOriginal ? '' : ', your edited version'}
        </span>
        <span className="flex items-baseline gap-3 text-muted">
          <span>
            {o.backend === 'playground' ? 'play.rust-lang.org' : o.toolchain}
            {o.durationMs !== null ? `, ${o.durationMs} ms` : ''}
          </span>
          <DismissButton onClick={r.dismiss} />
        </span>
      </div>
      {excerptHint && <p className="px-3 pt-1 text-[0.88rem] text-muted">{excerptHint}</p>}
      {o.compileOutput.trim() && (
        <OutputSection label={o.compiled ? 'compiler warnings' : 'compiler output'}>
          {r.language === 'rust' ? <RustcOutput message={o.compileOutput.trimEnd()} /> : <CSharpDiagnostics text={o.compileOutput} />}
        </OutputSection>
      )}
      {o.compiled && o.mode === 'run' && (
        <>
          <OutputSection label="stdout">{o.stdout ? o.stdout.replace(/\n$/, '') : <span className="text-muted">(nothing printed)</span>}</OutputSection>
          {o.stderr.trim() && (
            <OutputSection label="stderr">
              {r.language === 'rust' ? <RustcOutput message={o.stderr.trim()} /> : <span className="text-ochre">{o.stderr.trimEnd()}</span>}
            </OutputSection>
          )}
        </>
      )}
      {o.truncated && <p className="px-3 pb-2 font-mono text-[11.5px] text-muted">Output was truncated.</p>}
      <div className="h-2" />
    </div>
  );
}

function OutputSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-3 pt-2">
      <div className="mb-1 font-mono text-[11px] text-muted">{label}</div>
      <pre className="max-h-[320px] overflow-auto whitespace-pre font-mono text-[12.5px] leading-[1.55] text-text">{children}</pre>
    </div>
  );
}

function CSharpDiagnostics({ text }: { text: string }) {
  return (
    <>
      {text
        .trimEnd()
        .split('\n')
        .map((line, i) => (
          <div key={i} className={/: error /.test(line) ? 'text-danger' : /: warning /.test(line) ? 'text-ochre' : ''}>
            {line}
          </div>
        ))}
    </>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="font-mono text-[12px] text-muted hover:text-text" aria-label="Close output">
      ×
    </button>
  );
}

/** Exit codes above 128 mean the process was killed by a signal; name the limits we set. */
function describeExit(code: number) {
  switch (code) {
    case 137:
      return 'killed: memory limit (SIGKILL)';
    case 152:
      return 'killed: CPU time limit (SIGXCPU)';
    case 153:
      return 'killed: file size limit (SIGXFSZ)';
    case 134:
      return 'aborted (SIGABRT)';
    default:
      return code > 128 ? `killed by signal ${code - 128}` : `exit ${code}`;
  }
}
