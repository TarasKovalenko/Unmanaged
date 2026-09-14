import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Timeline, TimelineEventKind, TimelineSide } from '../content/types';
import { frameClass } from '../lib/format';
import type { Language } from '../lib/highlight';
import { CodeLine, CompileStatus, LanguageLabel, ProgramOutput } from './CodeLine';
import { Inline, Prose } from './Prose';
import { RunControls, RunOutput } from './Runnable';
import { useRunnable } from './useRunnable';

const MIN_COL = 64;
const ROW = 26;
const LABEL_W = 132;

const KIND_TEXT: Record<TimelineEventKind, string> = {
  running: 'running',
  waiting: 'suspended, waiting',
  inert: 'created, never polled',
  blocked: 'blocking its thread',
  done: 'finished',
  dropped: 'dropped without finishing',
};

/**
 * Two executions side by side on a shared clock. Scrub the tick and both
 * panes show which line is executing and what every task/future is doing.
 */
export function TimelineView({ timeline, headingLevel = 3 }: { timeline: Timeline; headingLevel?: 2 | 3 }) {
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const uid = useId().replace(/:/g, '');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  const atEnd = tick >= timeline.ticks - 1;
  // Playback stops by itself at the last step: "playing" only means something before it.
  const isPlaying = playing && !atEnd;
  useEffect(() => {
    if (!isPlaying) return;
    const t = window.setTimeout(() => setTick((x) => x + 1), 1100);
    return () => window.clearTimeout(t);
  }, [isPlaying, tick]);

  const step = (d: number) => {
    setPlaying(false);
    setTick((x) => Math.min(timeline.ticks - 1, Math.max(0, x + d)));
  };

  return (
    <section className="min-w-0" aria-label={`Async timeline: ${timeline.title}`}>
      <header className="mb-4">
        <Heading className="font-mono text-[1.05rem] font-medium tracking-[-0.01em] text-strong">{timeline.title}</Heading>
        <p className="mt-1 max-w-[72ch] text-[0.95rem] text-muted">
          <Inline text={timeline.summary} />
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[4px] border border-rule bg-surface px-3 py-2">
        <div className="flex items-center gap-1 font-mono text-[12.5px]">
          <button type="button" onClick={() => step(-1)} disabled={tick === 0} className="rounded-[3px] border border-rule px-2 py-1 text-text disabled:opacity-40" aria-label="Previous step">
            ←
          </button>
          <button
            type="button"
            onClick={() => {
              if (atEnd) {
                setTick(0);
                setPlaying(true);
              } else setPlaying(!isPlaying);
            }}
            className="w-[4.5rem] rounded-[3px] border border-rule-strong px-2 py-1 text-strong"
          >
            {isPlaying ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
          <button type="button" onClick={() => step(1)} disabled={tick === timeline.ticks - 1} className="rounded-[3px] border border-rule px-2 py-1 text-text disabled:opacity-40" aria-label="Next step">
            →
          </button>
        </div>
        <label className="flex min-w-[160px] flex-1 items-center gap-3">
          <span className="font-mono text-[12px] text-muted">
            step {tick + 1}/{timeline.ticks}
          </span>
          <input
            type="range"
            min={0}
            max={timeline.ticks - 1}
            value={tick}
            onChange={(e) => {
              setPlaying(false);
              setTick(Number(e.target.value));
            }}
            className="flex-1 accent-[var(--ochre)]"
            aria-label="Time step"
          />
        </label>
        {timeline.tickNotes && (
          <p className="w-full font-mono text-[12.5px] text-text" aria-live="polite">
            {timeline.tickNotes[tick]}
          </p>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SidePane uid={`${uid}c`} language="csharp" side={timeline.csharp} ticks={timeline.ticks} tick={tick} onTick={setTick} />
        <SidePane
          uid={`${uid}r`}
          language="rust"
          side={timeline.rust}
          ticks={timeline.ticks}
          tick={tick}
          onTick={setTick}
          status={timeline.rust.expect}
          reason={timeline.rust.uncheckedReason}
        />
      </div>

      <TimelineLegend uid={uid} />
      <Prose paragraphs={timeline.explanation} className="mt-5 text-[0.98rem]" />
    </section>
  );
}

function SidePane({
  uid,
  language,
  side,
  ticks,
  tick,
  onTick,
  status,
  reason,
}: {
  uid: string;
  language: Language;
  side: TimelineSide;
  ticks: number;
  tick: number;
  onTick: (t: number) => void;
  status?: 'compiles' | 'unchecked';
  reason?: string;
}) {
  const lanes = useMemo(() => [...new Set(side.events.map((e) => e.lane))], [side.events]);
  const runnable = useRunnable(language, side.code);
  const chartRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  // Columns stretch to fill the pane, never narrower than MIN_COL.
  useEffect(() => {
    // The chart is always rendered, so the ref is set by the time effects run.
    const el = chartRef.current!;
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const COL = Math.max(MIN_COL, Math.floor((chartWidth - LABEL_W - 8) / ticks));
  const activeLine = side.lineAtTick[tick] ?? 0;

  // Keep the executing line visible inside the code pane without scrolling the page.
  useEffect(() => {
    const pre = codeRef.current;
    const row = pre?.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (!pre || !row) return;
    const top = row.offsetTop; // pre is the offsetParent (position: relative)
    if (top < pre.scrollTop || top + row.offsetHeight > pre.scrollTop + pre.clientHeight) {
      pre.scrollTo({ top: Math.max(0, top - pre.clientHeight / 3), behavior: 'smooth' });
    }
  }, [activeLine]);
  const lines = side.code.split('\n');
  const width = LABEL_W + ticks * COL;
  const height = lanes.length * ROW + 6;
  const now = side.events.filter((e) => tick >= e.start && tick <= e.end);

  return (
    <div className={`min-w-0 overflow-hidden rounded-[4px] bg-surface ${frameClass(language)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-1.5 font-mono text-[12px] text-muted">
        <span>
          <LanguageLabel language={language} /> {side.filename}
        </span>
        <span className="flex items-center gap-3">
          {language === 'rust' && status && <CompileStatus status={status} reason={reason} />}
          {language === 'csharp' && <span className="text-verdigris">output verified by running it</span>}
          {status !== 'unchecked' && <RunControls r={runnable} allowEdit={false} />}
        </span>
      </div>

      <pre ref={codeRef} className="relative max-h-[360px] overflow-auto py-2 font-mono text-[12.5px] leading-[1.65]">
        {lines.map((l, i) => {
          const on = i + 1 === activeLine;
          return (
            <div key={i} data-line={i + 1} className={`flex min-w-max ${on ? 'bg-raised' : ''}`}>
              <span className={`w-9 shrink-0 select-none border-l-2 pr-3 text-right ${on ? 'border-ochre text-strong' : 'border-transparent text-muted/60'}`}>
                {i + 1}
              </span>
              <code className="whitespace-pre pr-4">
                <CodeLine text={l} language={language} />
              </code>
            </div>
          );
        })}
      </pre>

      <div ref={chartRef} className="overflow-x-auto border-t border-rule">
        <svg width={width} height={height} role="img" aria-label={laneSummary(side)} className="block">
          <TimelineDefs uid={uid} />
          {/* current tick column */}
          <rect x={LABEL_W + tick * COL} y={0} width={COL} height={height} fill="var(--raised)" />
          <rect x={LABEL_W + tick * COL} y={0} width={COL} height={2} fill="var(--ochre)" />
          <rect x={LABEL_W + tick * COL} y={height - 2} width={COL} height={2} fill="var(--ochre)" />
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <line key={i} x1={LABEL_W + i * COL} x2={LABEL_W + i * COL} y1={0} y2={height} stroke="var(--rule)" strokeDasharray="2 4" />
          ))}
          {lanes.map((lane, li) => (
            <text key={lane} x={10} y={li * ROW + ROW / 2 + 7} className="fill-[var(--text)] font-mono text-[11.5px]">
              {lane.length > 17 ? `${lane.slice(0, 16)}…` : lane}
              <title>{lane}</title>
            </text>
          ))}
          {side.events.map((e, i) => {
            const li = lanes.indexOf(e.lane);
            return <EventBar key={i} uid={uid} kind={e.kind} x={LABEL_W + e.start * COL + 3} y={li * ROW + 6} w={(e.end - e.start + 1) * COL - 6} h={ROW - 8} label={e.label} lane={e.lane} />;
          })}
          {/* click a column to jump there */}
          {Array.from({ length: ticks }, (_, i) => (
            <rect key={i} x={LABEL_W + i * COL} y={0} width={COL} height={height} fill="transparent" className="cursor-pointer" onClick={() => onTick(i)}>
              <title>Step {i + 1}</title>
            </rect>
          ))}
        </svg>
      </div>

      <ul className="border-t border-rule px-3 py-2 text-[0.88rem]" aria-live="polite">
        {lanes.map((lane) => {
          const e = now.find((x) => x.lane === lane);
          return (
            <li key={lane} className="flex gap-2 py-0.5">
              <span className="w-[8.5rem] shrink-0 truncate font-mono text-[12px] text-text" title={lane}>
                {lane}
              </span>
              <span className={e ? 'text-text' : 'text-muted/70'}>
                {e ? (
                  <>
                    <span className="font-mono text-[12px]">{KIND_TEXT[e.kind]}</span>
                    {e.label && <span className="text-muted">: {e.label}</span>}
                  </>
                ) : (
                  'not involved at this step'
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {side.output !== undefined && (
        <ProgramOutput text={side.output} label="output (verified by running it)" />
      )}
      {status !== 'unchecked' && <RunOutput r={runnable} />}
    </div>
  );
}

function laneSummary(side: TimelineSide) {
  return side.events.map((e) => `${e.lane} ${KIND_TEXT[e.kind]} from step ${e.start + 1} to ${e.end + 1}${e.label ? `: ${e.label}` : ''}`).join('. ');
}

function TimelineDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <pattern id={`${uid}-inert`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="1.5" height="6" fill="var(--muted)" />
      </pattern>
      <pattern id={`${uid}-blocked`} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="var(--ochre)" opacity="0.35" />
        <path d="M0 0 6 6M6 0 0 6" stroke="var(--ochre)" strokeWidth="1.2" />
      </pattern>
    </defs>
  );
}

function EventBar({ uid, kind, x, y, w, h, label, lane }: { uid: string; kind: TimelineEventKind; x: number; y: number; w: number; h: number; label?: string; lane: string }) {
  let body;
  switch (kind) {
    case 'running':
      body = <rect x={x} y={y} width={w} height={h} rx={2} fill="var(--verdigris)" />;
      break;
    case 'waiting':
      body = <rect x={x + 0.75} y={y + 0.75} width={w - 1.5} height={h - 1.5} rx={2} fill="none" stroke="var(--steel)" strokeWidth={1.5} strokeDasharray="4 3" />;
      break;
    case 'inert':
      body = <rect x={x} y={y} width={w} height={h} rx={2} fill={`url(#${uid}-inert)`} stroke="var(--muted)" strokeWidth={1} />;
      break;
    case 'blocked':
      body = <rect x={x} y={y} width={w} height={h} rx={2} fill={`url(#${uid}-blocked)`} stroke="var(--ochre)" strokeWidth={1.5} />;
      break;
    case 'done':
      body = (
        <g>
          <line x1={x} x2={x + w} y1={y + h / 2} y2={y + h / 2} stroke="var(--verdigris)" strokeWidth={1.5} />
          <circle cx={x + 7} cy={y + h / 2} r={5} fill="var(--verdigris)" />
        </g>
      );
      break;
    case 'dropped':
      body = (
        <g>
          <line x1={x} x2={x + w} y1={y + h / 2} y2={y + h / 2} stroke="var(--danger)" strokeWidth={1.5} strokeDasharray="2 3" />
          <path d={`M${x + 2} ${y + 2} l${h - 4} ${h - 4} M${x + h - 2} ${y + 2} l-${h - 4} ${h - 4}`} stroke="var(--danger)" strokeWidth={2} />
        </g>
      );
      break;
  }
  return (
    <g>
      {body}
      <title>
        {lane}: {KIND_TEXT[kind]}
        {label ? `. ${label}` : ''}
      </title>
    </g>
  );
}

function TimelineLegend({ uid }: { uid: string }) {
  const kinds: TimelineEventKind[] = ['running', 'waiting', 'inert', 'blocked', 'done', 'dropped'];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11.5px] text-muted" aria-label="Legend">
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <svg width="30" height="16" aria-hidden="true">
            <TimelineDefs uid={`${uid}-legend-${k}`} />
            <EventBar uid={`${uid}-legend-${k}`} kind={k} x={1} y={1} w={28} h={14} lane="" />
          </svg>
          {KIND_TEXT[k]}
        </li>
      ))}
    </ul>
  );
}
