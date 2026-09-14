import { useState } from 'react';
import type { Lesson } from '../content/types';
import { formatLines, frameClass } from '../lib/format';
import { CodeLine, CompileStatus, LanguageLabel } from './CodeLine';
import { CodeEditor, RunControls, RunOutput } from './Runnable';
import { useRunnable } from './useRunnable';
import { Inline } from './Prose';

type Side = 'csharp' | 'rust';
type Focus = { link: number; from: Side } | null;

/** Beats 1 and 2: C# and Rust side by side, with linked line annotations.
 *  Hover (or tap, or focus) a line in either pane to light up its partner. */
export function ComparePanes({ lesson }: { lesson: Lesson }) {
  const [hover, setHover] = useState<{ link: number; from: Side } | null>(null);
  const [pinned, setPinned] = useState<{ link: number; from: Side } | null>(null);
  const active = hover ?? pinned;
  const activeLink = active ? lesson.links[active.link] : null;

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-5">
        <Pane lesson={lesson} side="csharp" heading="The C# you already write" active={active} activeLink={activeLink} pinned={pinned} setHover={setHover} setPinned={setPinned} />
        <Pane lesson={lesson} side="rust" heading="The Rust equivalent" active={active} activeLink={activeLink} pinned={pinned} setHover={setHover} setPinned={setPinned} />
      </div>
      <ol className="mt-5 grid gap-x-8 gap-y-1 lg:grid-cols-2" aria-label="Line-by-line notes">
        {lesson.links.map((l, i) => {
          const on = active?.link === i;
          return (
            <li key={i}>
              <button
                type="button"
                aria-pressed={pinned?.link === i}
                onPointerEnter={() => setHover({ link: i, from: 'rust' })}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover({ link: i, from: 'rust' })}
                onBlur={() => setHover(null)}
                onClick={() => setPinned(pinned?.link === i ? null : { link: i, from: 'rust' })}
                className={`w-full rounded-[3px] border-l-2 px-3 py-2 text-left text-[0.93rem] ${
                  on ? 'border-ochre bg-surface' : 'border-rule hover:bg-surface'
                }`}
              >
                <span className="mb-0.5 block font-mono text-[11.5px] text-muted">
                  C# {formatLines(l.csharp)} / Rust {formatLines(l.rust)}
                </span>
                <Inline text={l.note} />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}


function Pane({
  lesson,
  side,
  heading,
  active,
  activeLink,
  pinned,
  setHover,
  setPinned,
}: {
  lesson: Lesson;
  side: Side;
  heading: string;
  active: Focus;
  activeLink: Lesson['links'][number] | null;
  pinned: Focus;
  setHover: (f: Focus) => void;
  setPinned: (f: Focus) => void;
}) {
  const source = lesson[side];
  const language = side;
  const r = useRunnable(language, source.code);
  const edited = r.modified;
  const rows = r.code.split('\n');
  // Line links describe the original code; they switch off once it is edited.
  const linkFor = (line: number) => (edited ? -1 : lesson.links.findIndex((l) => l[side].includes(line)));
  const highlighted = new Set(activeLink && !edited ? activeLink[side] : []);
  const unchecked = side === 'rust' && lesson.rust.expect === 'unchecked';

  return (
    <div className="min-w-0">
      <h2 className="mb-2 font-mono text-[0.95rem] font-medium text-strong">{heading}</h2>
      <figure className={`overflow-hidden rounded-[4px] bg-surface ${frameClass(language)}`}>
        <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rule px-3 py-1.5 font-mono text-[12px] text-muted">
          <span>
            <LanguageLabel language={language} /> {source.filename}
          </span>
          <span className="flex items-center gap-3">
            {unchecked && <CompileStatus status="unchecked" reason={lesson.rust.uncheckedReason} />}
            {edited && <span className="text-ochre">edited, line notes paused</span>}
            {!unchecked && <RunControls r={r} />}
          </span>
        </figcaption>
        {r.editing ? (
          <CodeEditor r={r} />
        ) : (
          <pre className="overflow-x-auto py-2 font-mono text-[13px] leading-[1.7]">
            {rows.map((text, i) => {
              const n = i + 1;
              const link = linkFor(n);
              const on = highlighted.has(n);
              return (
                <div
                  key={i}
                  onPointerEnter={() => link >= 0 && setHover({ link, from: side })}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => link >= 0 && setPinned(pinned?.link === link ? null : { link, from: side })}
                  className={`flex min-w-max ${link >= 0 ? 'cursor-pointer' : ''} ${on ? 'bg-raised' : ''}`}
                >
                  <span
                    className={`w-10 shrink-0 select-none border-l-2 pr-3 text-right ${
                      on ? 'border-ochre text-strong' : link >= 0 ? 'border-rule-strong/50 text-muted' : 'border-transparent text-muted/50'
                    }`}
                  >
                    {n}
                  </span>
                  <code className="whitespace-pre pr-4">
                    <CodeLine text={text} language={language} />
                  </code>
                </div>
              );
            })}
          </pre>
        )}
        {!unchecked && <RunOutput r={r} />}
      </figure>
      {/* On narrow screens the panes stack, so show the active note next to the pane it came from. */}
      {activeLink && active?.from === side && (
        <p className="mt-2 border-l-2 border-ochre pl-3 text-[0.93rem] lg:hidden">
          <Inline text={activeLink.note} />
        </p>
      )}
    </div>
  );
}
