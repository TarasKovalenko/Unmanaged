import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { snippetById } from '../content/borrow';
import type { BorrowSnippet } from '../content/types';
import {
  conflictingSpans,
  conflictsAtLine,
  layoutTracks,
  stateAt,
  type PlacedSpan,
  type VariableState,
} from '../lib/borrowLayout';
import { href } from '../lib/router';
import { panicMark, parseMarks, type Mark } from '../lib/rustcMarks';
import { CodeBlock, CodeLine, CompileStatus } from './CodeLine';
import { Inline } from './Prose';
import { RunControls, RunOutput } from './Runnable';
import { useRunnable } from './useRunnable';
import { RustcOutput } from './RustcOutput';

const ROW = 28;
const LANE = 17;
const LANE_GAP = 5;
const PAD = 18;
const CHAR = 7.2; // approx. width of an 11.5px JetBrains Mono glyph

interface Props {
  snippet: BorrowSnippet;
  /** Hide the title block, e.g. when the page already shows it. */
  bare?: boolean;
  headingLevel?: 2 | 3;
}

export function BorrowVisualizer({ snippet, bare = false, headingLevel = 3 }: Props) {
  const uid = useId().replace(/:/g, '');
  const lines = useMemo(() => snippet.code.split('\n'), [snippet.code]);
  const tracks = useMemo(() => layoutTracks(snippet), [snippet]);
  const conflicted = useMemo(() => conflictingSpans(snippet), [snippet]);
  const marks = useMemo(() => {
    const byLine = new Map<number, Mark[]>();
    snippet.conflicts.forEach((c) => {
      const found = c.phase === 'runtime' ? panicMark(c.message, snippet.code) : parseMarks(c.message);
      for (const m of found) {
        byLine.set(m.line, [...(byLine.get(m.line) ?? []), m]);
      }
    });
    return byLine;
  }, [snippet]);

  // Start where something is happening: the primary error line, or else the
  // line where the most spans overlap.
  const initialLine = useMemo(() => {
    for (const [line, ms] of marks) if (ms.some((m) => m.primary)) return line;
    let best = 1;
    let bestCount = -1;
    for (let n = 1; n <= lines.length; n++) {
      const count = snippet.spans.filter((sp) => n >= sp.startLine && n <= sp.endLine).length;
      if (count > bestCount) [best, bestCount] = [n, count];
    }
    return best;
  }, [marks, lines.length, snippet.spans]);

  const [cursor, setCursor] = useState(initialLine);
  const [hoverSpan, setHoverSpan] = useState<number | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<number | null>(null);
  const [editCopy, setEditCopy] = useState(false);
  const runnable = useRunnable('rust', snippet.code);
  const gridRef = useRef<HTMLDivElement>(null);

  const liveConflicts = conflictsAtLine(snippet, cursor);
  const emphasised = new Set<number>(
    selectedConflict !== null ? snippet.conflicts[selectedConflict].spans : hoverSpan !== null ? [hoverSpan] : [],
  );

  const trackWidths = tracks.map((t) => Math.max(t.lanes * LANE + (t.lanes - 1) * LANE_GAP + PAD * 2, 64));
  const HEADER = Math.max(56, Math.min(150, Math.ceil(Math.max(...tracks.map((t) => t.variable.length)) * CHAR) + 20));
  const rowGuides = {
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ROW - 1}px, color-mix(in srgb, var(--rule) 55%, transparent) ${ROW - 1}px ${ROW}px)`,
  };
  const svgWidth = trackWidths.reduce((a, b) => a + b, 0);
  const height = lines.length * ROW;

  const hoveredRange = hoverSpan !== null ? snippet.spans[hoverSpan] : null;
  const selectedRanges = selectedConflict !== null ? snippet.conflicts[selectedConflict].spans.map((i) => snippet.spans[i]) : [];

  function lineFromPointer(e: PointerEvent) {
    // Only called from the grid's own pointer events, so the ref is set.
    const rect = gridRef.current!.getBoundingClientRect();
    const row = Math.floor((e.clientY - rect.top) / ROW) + 1;
    if (row >= 1 && row <= lines.length) setCursor(row);
  }

  function onKey(e: KeyboardEvent) {
    const next =
      e.key === 'ArrowDown' || e.key === 'j'
        ? cursor + 1
        : e.key === 'ArrowUp' || e.key === 'k'
          ? cursor - 1
          : e.key === 'Home'
            ? 1
            : e.key === 'End'
              ? lines.length
              : null;
    if (next === null) return;
    e.preventDefault();
    setCursor(Math.min(lines.length, Math.max(1, next)));
  }

  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const fails = snippet.conflicts.length > 0;
  const runtime = snippet.conflicts.some((c) => c.phase === 'runtime');
  const hasRuntimeSpans = snippet.spans.some((sp) => sp.checked === 'runtime');
  const paired = snippet.pairedWith ? snippetById.get(snippet.pairedWith) : undefined;

  return (
    <section className="min-w-0" aria-label={`Borrow visualizer: ${snippet.title}`}>
      {!bare && (
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="min-w-0">
            <Heading className="font-mono text-[1.05rem] font-medium tracking-[-0.01em] text-strong">{snippet.title}</Heading>
            <p className="mt-1 max-w-[68ch] text-[0.95rem] text-muted">
              <Inline text={snippet.summary} />
            </p>
          </div>
          <CompileStatus status={runtime ? 'panics' : fails ? 'fails' : 'compiles'} codes={snippet.conflicts.map((c) => c.errorCode)} />
        </header>
      )}

      <div className="overflow-hidden rounded-[4px] border-2 border-rule-strong bg-surface">
        {/* Tracks stay pinned on the right; only the code scrolls sideways on narrow screens. */}
        <div className="relative flex">
            {/* code column */}
            <div className="min-w-0 flex-1">
              <div
                style={{ height: HEADER }}
                className="flex items-end justify-between gap-2 border-b border-rule px-3 pb-2 font-mono text-[12px] text-muted"
              >
                <span>
                  <span className="font-semibold text-oxide-text">Rust</span> main.rs
                </span>
                <RunControls r={runnable} allowEdit={false} />
              </div>
              <div className="overflow-x-auto">
              <div
                ref={gridRef}
                tabIndex={0}
                role="group"
                aria-label="Code. Arrow keys move the line cursor; the state of every variable at that line is described below."
                onPointerMove={lineFromPointer}
                onPointerDown={lineFromPointer}
                onKeyDown={onKey}
                className="relative min-w-max cursor-row-resize outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
                style={{ height, ...rowGuides }}
              >
                {/* span range highlight */}
                {[...(hoveredRange ? [hoveredRange] : []), ...selectedRanges].map((s, i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bg-raised"
                    style={{ top: (s.startLine - 1) * ROW, height: (s.endLine - s.startLine + 1) * ROW }}
                  />
                ))}
                {lines.map((text, i) => {
                  const n = i + 1;
                  const lineMarks = marks.get(n);
                  const hasPrimary = lineMarks?.some((m) => m.primary);
                  return (
                    <div key={i} className="relative flex font-mono text-[13px]" style={{ height: ROW, lineHeight: `${ROW}px` }}>
                      <span
                        className={`w-10 shrink-0 select-none pr-3 text-right ${
                          n === cursor ? 'text-strong' : 'text-muted/60'
                        } ${hasPrimary ? 'border-l-2 border-danger' : 'border-l-2 border-transparent'}`}
                      >
                        {n}
                      </span>
                      <code className="whitespace-pre pr-6">
                        <CodeLine text={text} language="rust" marks={lineMarks} />
                      </code>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>

            {/* track column */}
            <div className="shrink-0 border-l border-rule" style={{ width: svgWidth }}>
              <div style={{ height: HEADER }} className="flex border-b border-rule">
                {tracks.map((t, i) => (
                  <div
                    key={t.variable}
                    style={{ width: trackWidths[i] }}
                    className="flex items-end justify-center pb-2 font-mono text-[11.5px] text-text"
                  >
                    <span className="whitespace-nowrap [writing-mode:vertical-rl] rotate-180" title={t.variable}>
                      {t.variable}
                    </span>
                  </div>
                ))}
              </div>
              <svg width={svgWidth} height={height} className="block" style={rowGuides} role="img" aria-label={trackSummary(snippet)}>
                <Defs uid={uid} />
                {tracks.map((t, ti) => {
                  const x0 = trackWidths.slice(0, ti).reduce((a, b) => a + b, 0);
                  return (
                    <g key={t.variable} transform={`translate(${x0},0)`}>
                      {ti > 0 && <line x1={0} x2={0} y1={0} y2={height} stroke="var(--rule)" strokeDasharray="2 4" />}
                      {t.placed.map((p) => (
                        <Bar
                          key={p.index}
                          uid={uid}
                          placed={p}
                          conflict={conflicted.has(p.index)}
                          dim={emphasised.size > 0 && !emphasised.has(p.index)}
                          onHover={setHoverSpan}
                        />
                      ))}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* cursor line, spans both columns */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-y border-ochre/50"
              style={{ top: HEADER + (cursor - 1) * ROW, height: ROW }}
            />
        </div>

        <input
          type="range"
          min={1}
          max={lines.length}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          aria-label="Line cursor"
          className="block w-full accent-[var(--ochre)] px-3 py-3 md:hidden"
        />

        <Readout snippet={snippet} line={cursor} lineText={lines[cursor - 1]} liveConflicts={liveConflicts} hoverSpan={hoverSpan} />
        <RunOutput r={runnable} />
      </div>
      {runnable?.backend && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setEditCopy(!editCopy)}
            aria-expanded={editCopy}
            className="font-mono text-[12.5px] text-muted underline decoration-rule-strong underline-offset-4 hover:text-text"
          >
            {editCopy ? 'Close the editable copy' : 'Edit a copy and run it'}
          </button>
          {editCopy && (
            <div className="mt-3">
              <p className="mb-2 max-w-[72ch] text-[0.9rem] text-muted">
                The tracks above are drawn for the original code, so edits happen in a copy. Try the fix the error suggests,
                or break something that compiles.
              </p>
              <CodeBlock code={snippet.code} language="rust" caption="main.rs (copy)" />
            </div>
          )}
        </div>
      )}

      <Legend uid={uid} runtime={hasRuntimeSpans} />

      {fails ? (
        <div className="mt-5 space-y-4">
          {snippet.conflicts.map((c, i) => {
            const selected = selectedConflict === i;
            const [a, b] = c.spans.map((idx) => snippet.spans[idx]);
            return (
              <article
                key={i}
                className={`rounded-[4px] border ${selected ? 'border-danger bg-danger-soft' : 'border-rule bg-surface'} `}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5">
                  <p className="min-w-0 font-mono text-[13px] text-strong">
                    {c.phase === 'runtime' ? (
                      <>
                        <span className="font-semibold text-ochre">panic</span> {panicLine(c.message)}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-danger">{c.errorCode}</span> {firstLine(c.message)}
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-4">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedConflict(selected ? null : i);
                      const later = a.startLine >= b.startLine ? a : b;
                      setCursor(later.startLine);
                    }}
                    className={`rounded-[3px] border px-2.5 py-1 font-mono text-[12px] ${
                      selected ? 'border-danger text-strong' : 'border-rule-strong text-text hover:border-danger'
                    }`}
                  >
                    {selected ? 'Clear highlight' : 'Highlight both spans'}
                  </button>
                  {c.phase !== 'runtime' && <a
                    href={`https://doc.rust-lang.org/error_codes/${c.errorCode}.html`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[12px] text-muted underline decoration-rule-strong underline-offset-4 hover:text-text"
                  >
                    rustc --explain {c.errorCode}
                  </a>}
                  </div>
                </div>
                <ul className="grid gap-1 px-4 pt-3 font-mono text-[12px] text-muted sm:grid-cols-2">
                  {[a, b].map((s, k) => (
                    <li key={k}>
                      <span className="text-text">{s.variable}</span> {kindWord(s.kind)}, line{' '}
                      {s.startLine === s.endLine ? s.startLine : `${s.startLine}–${s.endLine}`}
                      {s.label ? `: ${s.label}` : ''}
                    </li>
                  ))}
                </ul>
                <pre className="mx-4 mt-3 overflow-x-auto rounded-[3px] bg-bg p-3 font-mono text-[12.5px] leading-[1.55] text-text">
                  <RustcOutput message={c.message} />
                </pre>
                <p className="max-w-[72ch] px-4 py-4 text-[0.97rem]">
                  <Inline text={c.explanation} />
                </p>
              </article>
            );
          })}
        </div>
      ) : (
        snippet.takeaway && (
          <p className="mt-5 max-w-[72ch] border-l-2 border-verdigris pl-4 text-[0.97rem]">
            <Inline text={snippet.takeaway} />
          </p>
        )
      )}

      {(snippet.csharpEquivalent || paired) && (
        <div className="mt-5 space-y-3">
          {snippet.csharpEquivalent && (
            <details className="group">
              <summary className="cursor-pointer select-none font-mono text-[13px] text-muted hover:text-text">
                The same thing in C#
              </summary>
              <div className="mt-3 space-y-2">
                <CodeBlock code={snippet.csharpEquivalent} language="csharp" caption="Program.cs" />
                {snippet.csharpNote && <p className="max-w-[72ch] text-[0.93rem] text-muted">{snippet.csharpNote}</p>}
              </div>
            </details>
          )}
          {paired && (
            <p className="text-[0.93rem] text-muted">
              {paired.conflicts.length ? 'The version that does not compile: ' : 'The version that compiles: '}
              <a href={href.visualizer(paired.id)} className="text-text underline decoration-oxide underline-offset-4">
                {paired.title}
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function kindWord(kind: string) {
  return (
    { owned: 'owned', borrow: 'shared borrow', borrow_mut: 'mutable borrow', moved: 'owned until moved', dropped: 'owned until dropped' } as Record<string, string>
  )[kind];
}

function trackSummary(snippet: BorrowSnippet) {
  return snippet.spans
    .map((s) => `${s.variable}: ${kindWord(s.kind)} lines ${s.startLine} to ${s.endLine}${s.label ? ` (${s.label})` : ''}`)
    .join('. ');
}

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <pattern id={`${uid}-stripes`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--steel)" opacity="0.22" />
        <rect width="2.5" height="6" fill="var(--steel)" />
      </pattern>
      <pattern id={`${uid}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="1.6" height="5" fill="var(--danger)" />
      </pattern>
      <linearGradient id={`${uid}-fade`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="white" stopOpacity="1" />
        <stop offset="0.55" stopColor="white" stopOpacity="1" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

function Bar({
  uid,
  placed,
  conflict,
  dim,
  onHover,
}: {
  uid: string;
  placed: PlacedSpan;
  conflict: boolean;
  dim: boolean;
  onHover: (i: number | null) => void;
}) {
  const { span, lane, startsMid, endsMid, index } = placed;
  const x = PAD + lane * (LANE + LANE_GAP);
  const y1 = (span.startLine - 1) * ROW + (startsMid ? ROW / 2 + 1 : 4);
  const y2 = (span.endLine - 1) * ROW + (endsMid ? ROW / 2 - 1 : ROW - 4);
  const h = y2 - y1;
  const w = LANE;
  const stroke = conflict ? 'var(--danger)' : undefined;
  const dash = span.checked === 'runtime' ? '3 2' : undefined;

  let body;
  switch (span.kind) {
    case 'borrow':
      body = (
        <rect x={x} y={y1} width={w} height={h} rx={2} fill={`url(#${uid}-stripes)`} stroke={stroke ?? 'var(--steel)'} strokeWidth={conflict ? 2 : 1} strokeDasharray={dash} />
      );
      break;
    case 'borrow_mut':
      body = (
        <rect x={x - 0.5} y={y1} width={w + 1} height={h} rx={1} fill={span.checked === 'runtime' ? 'color-mix(in srgb, var(--ochre) 55%, transparent)' : 'var(--ochre)'} stroke={stroke ?? 'var(--text-strong)'} strokeWidth={conflict ? 2.5 : 1.5} strokeDasharray={dash} />
      );
      break;
    case 'moved': {
      // Slanted cut at the end, plus a detached sliver to read as severed.
      const cut = Math.min(7, h / 2);
      body = (
        <g>
          <polygon points={`${x},${y1} ${x + w},${y1} ${x + w},${y2 - cut} ${x},${y2}`} fill="var(--oxide)" stroke={stroke} strokeWidth={conflict ? 2 : 0} />
          <line x1={x - 3} y1={y2 + 3} x2={x + w + 3} y2={y2 - cut + 3} stroke="var(--oxide-text)" strokeWidth={2} />
        </g>
      );
      break;
    }
    case 'dropped': {
      const maskId = `${uid}-mask-${index}`;
      const fadeFrom = Math.max(0, h - ROW * 0.9);
      body = (
        <g>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={x - 4} y={y1 - 4} width={w + 8} height={h + 8}>
            <rect x={x - 4} y={y1 - 4} width={w + 8} height={fadeFrom + 4} fill="white" />
            <rect x={x - 4} y={y1 + fadeFrom} width={w + 8} height={h - fadeFrom + 4} fill={`url(#${uid}-fade)`} />
          </mask>
          <rect x={x} y={y1} width={w} height={h} rx={1} fill="var(--oxide)" mask={`url(#${maskId})`} stroke={stroke} strokeWidth={conflict ? 2 : 0} />
        </g>
      );
      break;
    }
    default:
      body = <rect x={x} y={y1} width={w} height={h} rx={1} fill="var(--oxide)" stroke={stroke} strokeWidth={conflict ? 2 : 0} />;
  }

  return (
    <g
      opacity={dim ? 0.3 : 1}
      onPointerEnter={() => onHover(index)}
      onPointerLeave={() => onHover(null)}
      className="cursor-help"
      style={{ transition: 'opacity 120ms' }}
    >
      {/* generous invisible hit area */}
      <rect x={x - 3} y={y1 - 2} width={w + 6} height={h + 4} fill="transparent" />
      {body}
      {conflict && <rect x={x + w + 2} y={y1} width={3} height={h} fill={`url(#${uid}-hatch)`} />}
      <title>
        {span.variable}: {kindWord(span.kind)}, lines {span.startLine}–{span.endLine}
        {span.label ? `. ${span.label}` : ''}
      </title>
    </g>
  );
}

const TONE: Record<VariableState['tone'], string> = {
  owned: 'text-oxide-text',
  borrow: 'text-steel',
  borrow_mut: 'text-ochre',
  gone: 'text-muted line-through decoration-muted/60',
  absent: 'text-muted/70',
  conflict: 'text-danger',
};

function Readout({
  snippet,
  line,
  lineText,
  liveConflicts,
  hoverSpan,
}: {
  snippet: BorrowSnippet;
  line: number;
  lineText: string;
  liveConflicts: number[];
  hoverSpan: number | null;
}) {
  const variables = snippet.variables ?? [...new Set(snippet.spans.map((s) => s.variable))];
  const hovered = hoverSpan !== null ? snippet.spans[hoverSpan] : null;
  return (
    <div className="border-t border-rule px-4 py-3" aria-live="polite">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 font-mono text-[12px]">
        <span className="text-strong">line {line}</span>
        <code className="min-w-0 truncate text-muted">{lineText.trim() || '(blank)'}</code>
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-[0.9rem] sm:grid-cols-[max-content_1fr]">
        {variables.map((v) => {
          const s = stateAt(snippet, v, line);
          return (
            <div key={v} className="contents">
              <dt className="font-mono text-[12.5px] text-text">{v}</dt>
              <dd className="mb-1 sm:mb-0">
                <span className={TONE[s.tone]}>
                  {s.tone === 'conflict' && <span aria-hidden="true">✕ </span>}
                  {s.state}
                </span>
                {s.details.length > 0 && <span className="text-muted"> — {s.details.join('; ')}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {liveConflicts.length > 0 && (
        <p className="mt-2 font-mono text-[12px] text-danger">
          {liveConflicts.map((i) => { const c = snippet.conflicts[i]; return c.phase === 'runtime' ? `panics here at runtime: ${panicLine(c.message)}` : `error[${c.errorCode}]: ${firstLine(c.message)}`; }).join(' / ')}
        </p>
      )}
      {hovered && (
        <p className="mt-2 font-mono text-[12px] text-muted">
          <span className="text-text">{hovered.variable}</span> {kindWord(hovered.kind)}, lines {hovered.startLine}–{hovered.endLine}
          {hovered.label ? `: ${hovered.label}` : ''}
        </p>
      )}
    </div>
  );
}

function firstLine(message: string) {
  return message.split('\n')[0].replace(/^error\[E\d{4}\]:\s*/, '');
}

/** "thread 'main' panicked at src/main.rs:6:10:\nRefCell already borrowed" → "RefCell already borrowed" */
function panicLine(message: string) {
  const rows = message.split('\n');
  const i = rows.findIndex((r) => r.includes('panicked at'));
  return rows[i + 1]?.trim() || rows[i] || message;
}

function Legend({ uid, runtime }: { uid: string; runtime: boolean }) {
  const items: { label: string; swatch: ReactNode }[] = [
    { label: 'owned', swatch: <rect x="4" y="2" width="10" height="16" fill="var(--oxide)" /> },
    { label: '& shared borrow', swatch: <rect x="4" y="2" width="10" height="16" rx="2" fill={`url(#${uid}-stripes)`} stroke="var(--steel)" /> },
    {
      label: '&mut exclusive borrow',
      swatch: <rect x="3.5" y="2" width="11" height="16" fill="var(--ochre)" stroke="var(--text-strong)" strokeWidth="1.5" />,
    },
    {
      label: 'moved (cut)',
      swatch: (
        <g>
          <polygon points="4,2 14,2 14,10 4,15" fill="var(--oxide)" />
          <line x1="1" y1="18" x2="17" y2="13" stroke="var(--oxide-text)" strokeWidth="2" />
        </g>
      ),
    },
    {
      label: 'dropped (fade)',
      swatch: (
        <g>
          <rect x="4" y="2" width="10" height="8" fill="var(--oxide)" />
          <rect x="4" y="10" width="10" height="8" fill="var(--oxide)" opacity="0.35" />
        </g>
      ),
    },
    ...(runtime
      ? [
          {
            label: 'checked at runtime (RefCell)',
            swatch: <rect x="3.5" y="2" width="11" height="16" fill="none" stroke="var(--text-strong)" strokeWidth="1.5" strokeDasharray="3 2" />,
          },
        ]
      : []),
    {
      label: 'conflict',
      swatch: (
        <g>
          <rect x="3" y="2" width="9" height="16" fill="none" stroke="var(--danger)" strokeWidth="2" />
          <rect x="13" y="2" width="3" height="16" fill={`url(#${uid}-hatch)`} />
        </g>
      ),
    },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11.5px] text-muted" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <svg width="18" height="20" aria-hidden="true">
            {it.swatch}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
