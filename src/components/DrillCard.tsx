import { useMemo, useState } from 'react';
import type { Drill, DrillFix } from '../content/types';
import { frameClass, seededOrder } from '../lib/format';
import { panicMark, parseMarks, type Mark } from '../lib/rustcMarks';
import { href } from '../lib/router';
import { useDrillAttempts } from '../lib/storage';
import { CodeBlock, CodeLine, LanguageLabel } from './CodeLine';
import { Inline } from './Prose';
import { RustcBlock } from './RustcOutput';
import { CodeEditor, RunControls, RunOutput } from './Runnable';
import { useRunnable } from './useRunnable';

const VERDICT: Record<DrillFix['verdict'], { label: string; cls: string; glyph: string }> = {
  idiomatic: { label: 'Idiomatic', cls: 'border-verdigris text-verdigris', glyph: '✓' },
  'works-but': { label: 'Compiles, but', cls: 'border-ochre text-ochre', glyph: '~' },
  wrong: { label: 'Still wrong', cls: 'border-danger text-danger', glyph: '✕' },
};

interface Props {
  drill: Drill;
  headingLevel?: 2 | 3;
  /** Show a link to the drill's own page (used when embedded in lessons). */
  linkToPage?: boolean;
  onNext?: () => void;
}

/**
 * Diagnose before reveal: the learner sees the code and the compiler's
 * complaint, picks a diagnosis, and only then sees the explanation and fixes.
 */
export function DrillCard({ drill, headingLevel = 3, linkToPage, onNext }: Props) {
  const { attempts, record } = useDrillAttempts();
  const [choice, setChoice] = useState<number | null>(null);
  const [openFix, setOpenFix] = useState(0);
  const answered = choice !== null;
  const previous = attempts[drill.id];

  const marks = useMemo(() => {
    const byLine = new Map<number, Mark[]>();
    const found = drill.outcome === 'panic' ? panicMark(drill.message, drill.code) : parseMarks(drill.message);
    for (const m of found) byLine.set(m.line, [...(byLine.get(m.line) ?? []), m]);
    return byLine;
  }, [drill]);

  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const r = useRunnable('rust', drill.code);
  const lines = r.code.split('\n');
  const correctIndex = drill.options.findIndex((o) => o.correct);
  // Content lists the correct option wherever the author put it; display order is shuffled per drill.
  const order = useMemo(() => seededOrder(drill.options.length, drill.id), [drill.id, drill.options.length]);

  // Options are disabled once answered, so this only runs for the first choice.
  function choose(i: number) {
    setChoice(i);
    record(drill.id, i, i === correctIndex);
  }

  return (
    <article className="min-w-0" aria-label={`Drill: ${drill.title}`}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading className="font-mono text-[1.05rem] font-medium tracking-[-0.01em] text-strong">{drill.title}</Heading>
        <span className="font-mono text-[12px] text-muted">
          {previous && !answered && (
            <span className={previous.correctFirstTry ? 'text-verdigris' : 'text-ochre'}>
              {previous.correctFirstTry ? 'solved before' : 'missed last time'}{' '}
            </span>
          )}
          {linkToPage && (
            <a href={href.drills(drill.id)} className="underline decoration-rule-strong underline-offset-4 hover:text-text">
              open on its own
            </a>
          )}
        </span>
      </header>

      {drill.csharpReflex && (
        <p className="mb-4 max-w-[72ch] text-[0.95rem] text-muted">
          <span className="text-text">The C# reflex: </span>
          <Inline text={drill.csharpReflex} />
        </p>
      )}

      <div className="grid gap-4 2xl:grid-cols-2">
        <figure className={`min-w-0 overflow-hidden rounded-[4px] bg-surface ${frameClass('rust')}`}>
          <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-1.5 font-mono text-[12px] text-muted">
            <span>
              <LanguageLabel language="rust" /> main.rs {r.modified && <span className="text-ochre">edited: try your own fix</span>}
            </span>
            <RunControls r={r} />
          </figcaption>
          {r.editing ? (
            <CodeEditor r={r} />
          ) : (
          <pre className="overflow-x-auto py-2 font-mono text-[13px] leading-[1.7]">
            {lines.map((l, i) => {
              const lineMarks = r.modified ? undefined : marks.get(i + 1);
              return (
                <div key={i} className="flex min-w-max">
                  <span
                    className={`w-9 shrink-0 select-none border-l-2 pr-3 text-right text-muted/60 ${
                      lineMarks?.some((m) => m.primary) ? 'border-danger' : 'border-transparent'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <code className="whitespace-pre pr-4">
                    <CodeLine text={l} language="rust" marks={lineMarks} />
                  </code>
                </div>
              );
            })}
          </pre>
          )}
          <RunOutput r={r} />
        </figure>
        <div className="min-w-0">
          <RustcBlock
            message={drill.message}
            label={`${drill.outcome === 'panic' ? 'cargo run (compiles, then panics)' : 'cargo build'}${r.modified ? ', for the original code' : ''}`}
          />
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="mb-3 font-mono text-[0.95rem] text-strong">{drill.question ?? 'What is the actual problem?'}</legend>
        <div className="space-y-2">
          {order.map((i) => {
            const o = drill.options[i];
            const isChoice = choice === i;
            const state = !answered ? 'idle' : o.correct ? 'correct' : isChoice ? 'wrong' : 'other';
            const cls = {
              idle: 'border-rule hover:border-rule-strong hover:bg-surface cursor-pointer',
              correct: 'border-verdigris bg-surface',
              wrong: 'border-danger bg-danger-soft',
              other: 'border-rule opacity-80',
            }[state];
            return (
              <div key={i} className={`rounded-[4px] border px-4 py-3 ${cls}`}>
                <label className={`flex gap-3 ${answered ? '' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name={`drill-${drill.id}`}
                    checked={isChoice}
                    disabled={answered}
                    onChange={() => choose(i)}
                    className="mt-1.5 accent-[var(--oxide)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.97rem]">
                      {state === 'correct' && <span className="mr-1.5 font-mono text-verdigris">✓</span>}
                      {state === 'wrong' && <span className="mr-1.5 font-mono text-danger">✕</span>}
                      <Inline text={o.text} />
                    </span>
                    {answered && (
                      <span className={`mt-1.5 block text-[0.92rem] ${isChoice || o.correct ? 'text-muted' : 'text-muted/80'}`}>
                        <Inline text={o.why} />
                      </span>
                    )}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
        {answered && (
          <p className="mt-3 text-[0.93rem]" role="status">
            {choice === correctIndex ? (
              <span className="text-verdigris">Right diagnosis.</span>
            ) : (
              <span className="text-ochre">Not quite. The correct diagnosis is marked above.</span>
            )}{' '}
            <button
              type="button"
              className="text-muted underline decoration-rule-strong underline-offset-4 hover:text-text"
              onClick={() => {
                setChoice(null);
                setOpenFix(0);
              }}
            >
              Reset this drill
            </button>
          </p>
        )}
      </fieldset>

      {answered && (
        <section className="mt-8" aria-label="Fixes">
          <h4 className="font-mono text-[0.95rem] text-strong">Ways to fix it</h4>
          <div role="tablist" aria-label="Fixes" className="mt-3 flex flex-wrap gap-2">
            {drill.fixes.map((f, i) => {
              const v = VERDICT[f.verdict];
              const on = openFix === i;
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setOpenFix(i)}
                  className={`rounded-[3px] border px-3 py-1.5 text-left font-mono text-[12.5px] ${
                    on ? `${v.cls} bg-surface` : 'border-rule text-muted hover:text-text'
                  }`}
                >
                  <span aria-hidden="true">{v.glyph} </span>
                  {f.label}
                </button>
              );
            })}
          </div>
          {drill.fixes[openFix] && (
            <div role="tabpanel" className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div>
                <p className={`inline-block rounded-[3px] border px-2 py-0.5 font-mono text-[12px] ${VERDICT[drill.fixes[openFix].verdict].cls}`}>
                  {VERDICT[drill.fixes[openFix].verdict].label}
                </p>
                <p className="mt-3 max-w-[60ch] text-[0.97rem]">
                  <Inline text={drill.fixes[openFix].note} />
                </p>
              </div>
              {/* Keyed by tab: the block keeps its own edit state, which must not carry over to another fix. */}
              <CodeBlock
                key={openFix}
                code={drill.fixes[openFix].code}
                language="rust"
                caption="main.rs"
                status={drill.fixes[openFix].expect}
                uncheckedReason={drill.fixes[openFix].uncheckedReason}
              />
            </div>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className="mt-6 rounded-[3px] bg-oxide px-4 py-2 font-mono text-[13.5px] font-medium text-white hover:brightness-110"
            >
              Next drill
            </button>
          )}
        </section>
      )}
    </article>
  );
}
