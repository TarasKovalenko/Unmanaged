import { useMemo } from 'react';
import type { Expect } from '../content/types';
import { frameClass } from '../lib/format';
import { tokenizeLine, type Language, type TokenKind } from '../lib/highlight';
import { CodeEditor, RunControls, RunOutput } from './Runnable';
import { useRunnable } from './useRunnable';
import type { Mark } from '../lib/rustcMarks';

interface Props {
  text: string;
  language: Language;
  marks?: Mark[];
}

/** One line of highlighted code, optionally carrying rustc underline marks. */
export function CodeLine({ text, language, marks = [] }: Props) {
  const segments = useMemo(() => {
    const kinds: TokenKind[] = [];
    for (const t of tokenizeLine(text, language)) {
      for (let i = 0; i < t.text.length; i++) kinds.push(t.kind);
    }
    const markAt: (Mark | undefined)[] = new Array(text.length).fill(undefined);
    // Secondary first so primary wins where they overlap.
    for (const m of [...marks].sort((a, b) => Number(a.primary) - Number(b.primary))) {
      for (let i = m.start; i < Math.min(m.end, text.length); i++) markAt[i] = m;
    }
    const out: { text: string; kind: TokenKind; mark?: Mark }[] = [];
    for (let i = 0; i < text.length; i++) {
      const last = out[out.length - 1];
      if (last && last.kind === kinds[i] && last.mark === markAt[i]) last.text += text[i];
      else out.push({ text: text[i], kind: kinds[i], mark: markAt[i] });
    }
    return out;
  }, [text, language, marks]);

  if (text.length === 0) return <>{' '}</>;
  return (
    <>
      {segments.map((s, i) => {
        const cls = [
          s.kind !== 'plain' ? `tok-${s.kind}` : '',
          s.mark ? (s.mark.primary ? 'mark-primary' : 'mark-secondary') : '',
        ].join(' ');
        return (
          <span key={i} className={cls} title={s.mark?.label || undefined}>
            {s.text}
          </span>
        );
      })}
    </>
  );
}

interface BlockProps {
  code: string;
  language: Language;
  caption?: string;
  status?: Expect;
  errorCode?: string;
  uncheckedReason?: string;
  /** Verified program output, shown under the code. */
  stdout?: string;
  /** Lines to emphasise (1-based). */
  highlight?: number[];
  /** Hide line numbers for very short snippets. Compact blocks are never runnable. */
  compact?: boolean;
  /** Offer Run/Edit when a backend can run this language. Default true. */
  runnable?: boolean;
}

/** Static code block. Frame style tells languages apart without colour:
 *  dashed for C#, solid and heavier for Rust, thin for TOML and shell. */
export function CodeBlock({ code, language, caption, status, errorCode, uncheckedReason, stdout, highlight, compact, runnable = true }: BlockProps) {
  const r = useRunnable(language, code);
  const canRun = runnable && !compact && status !== 'unchecked' && r?.backend;
  const shown = canRun && r ? r.code : code;
  const lines = shown.split('\n');
  const marked = new Set(r?.modified ? [] : (highlight ?? []));
  return (
    <figure className={`overflow-hidden rounded-[4px] bg-surface ${frameClass(language)}`}>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rule px-3 py-1.5 font-mono text-[12px] text-muted">
        <span>
          <LanguageLabel language={language} />
          {caption ? ` ${caption}` : ''}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          {status && language === 'rust' && !r?.modified && <CompileStatus status={status} codes={errorCode ? [errorCode] : undefined} reason={uncheckedReason} />}
          {r?.modified && <span className="text-ochre">edited</span>}
          {canRun && <RunControls r={r} />}
        </span>
      </figcaption>
      {canRun && r?.editing ? (
        <CodeEditor r={r} />
      ) : (
      <pre className="overflow-x-auto py-2 font-mono text-[13px] leading-[1.7]">
        {lines.map((l, i) => (
          <div key={i} className={`flex min-w-max ${marked.has(i + 1) ? 'bg-raised' : ''}`}>
            {compact ? (
              <span className="w-3 shrink-0" />
            ) : (
              <span
                className={`w-9 shrink-0 select-none border-l-2 pr-3 text-right ${
                  marked.has(i + 1) ? 'border-ochre text-strong' : 'border-transparent text-muted/60'
                }`}
              >
                {i + 1}
              </span>
            )}
            <code className="whitespace-pre pr-4">
              <CodeLine text={l} language={language} />
            </code>
          </div>
        ))}
      </pre>
      )}
      {stdout !== undefined && !r?.modified && <ProgramOutput text={stdout} label="output (verified)" />}
      {canRun && <RunOutput r={r} />}
    </figure>
  );
}

export function ProgramOutput({ text, label = 'output' }: { text: string; label?: string }) {
  return (
    <div className="border-t border-rule bg-bg/60 px-3 py-2">
      <div className="mb-1 font-mono text-[11px] text-muted">{label}</div>
      <pre className="overflow-x-auto whitespace-pre font-mono text-[12.5px] leading-[1.55] text-text">{text || '(nothing printed)'}</pre>
    </div>
  );
}

export function LanguageLabel({ language }: { language: Language }) {
  switch (language) {
    case 'csharp':
      return <span className="font-semibold text-steel">C#</span>;
    case 'rust':
      return <span className="font-semibold text-oxide-text">Rust</span>;
    case 'toml':
      return <span className="font-semibold text-text">TOML</span>;
    case 'shell':
      return <span className="font-semibold text-text">Shell</span>;
  }
}

export function CompileStatus({ status, codes, reason }: { status: Expect; codes?: string[]; reason?: string }) {
  switch (status) {
    case 'compiles':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-verdigris">
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 6.5 5 9.5 10.5 3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          compiles
        </span>
      );
    case 'fails':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-danger">
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2 10 10M10 2 2 10" stroke="currentColor" strokeWidth="2" />
          </svg>
          {codes && codes.length ? `does not compile: ${codes.join(', ')}` : 'does not compile'}
        </span>
      );
    case 'panics':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ochre">
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1.5 11 10.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M6 5v2.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          compiles, panics at runtime
        </span>
      );
    case 'unchecked':
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted" title={reason}>
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" />
          </svg>
          not compiled: needs crates
        </span>
      );
  }
}
