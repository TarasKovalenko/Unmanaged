import { useState } from 'react';
import { BorrowVisualizer } from '../components/BorrowVisualizer';
import { borrowSnippets, snippetById } from '../content/borrow';
import { href } from '../lib/router';

type Filter = 'all' | 'compiles' | 'fails';

export function VisualizerPage({ snippetId }: { snippetId?: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const selected = (snippetId && snippetById.get(snippetId)) || borrowSnippets[0];
  const visible = borrowSnippets.filter((s) =>
    filter === 'all' ? true : filter === 'compiles' ? s.conflicts.length === 0 : s.conflicts.length > 0,
  );
  const failing = borrowSnippets.filter((s) => s.conflicts.length > 0).length;

  return (
    <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:py-12">
      <aside>
        <h1 className="font-mono text-[1.35rem] font-semibold tracking-[-0.02em] text-strong">Borrow visualizer</h1>
        <p className="mt-2 text-[0.92rem] text-muted">
          {borrowSnippets.length} snippets: {borrowSnippets.length - failing} compile and run, {failing} do not. Knowing what fine
          looks like matters as much as the errors.
        </p>

        <div role="radiogroup" aria-label="Filter snippets" className="mt-5 flex rounded-[3px] border border-rule font-mono text-[12px]">
          {(['all', 'compiles', 'fails'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={`flex-1 px-2 py-1.5 ${filter === f ? 'bg-raised text-strong' : 'text-muted hover:text-text'}`}
            >
              {f === 'all' ? 'All' : f === 'compiles' ? 'Compiles' : 'Errors'}
            </button>
          ))}
        </div>

        <label className="mt-4 block lg:hidden">
          <span className="sr-only">Snippet</span>
          <select
            value={selected.id}
            onChange={(e) => (window.location.hash = href.visualizer(e.target.value))}
            className="w-full rounded-[3px] border border-rule bg-surface px-2 py-2 font-mono text-[13px] text-text"
          >
            {visible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.conflicts.length ? `✕ ${s.title} (${s.conflicts.map((c) => c.errorCode).join(', ')})` : `✓ ${s.title}`}
              </option>
            ))}
          </select>
        </label>

        <ul className="mt-4 hidden space-y-px lg:block">
          {visible.map((s) => {
            const current = s.id === selected.id;
            const fails = s.conflicts.length > 0;
            return (
              <li key={s.id}>
                <a
                  href={href.visualizer(s.id)}
                  aria-current={current ? 'page' : undefined}
                  className={`grid grid-cols-[1rem_1fr] gap-x-2 rounded-[3px] px-2 py-1.5 text-[0.88rem] leading-snug ${
                    current ? 'bg-raised text-strong' : 'text-muted hover:bg-surface hover:text-text'
                  }`}
                >
                  <span aria-hidden="true" className={`font-mono ${fails ? 'text-danger' : 'text-verdigris'}`}>
                    {fails ? (s.conflicts.some((c) => c.phase === 'runtime') ? '!' : '✕') : '✓'}
                  </span>
                  <span>
                    {s.title}
                    {fails && <span className="ml-1.5 font-mono text-[11px] text-danger/80">{s.conflicts.map((c) => c.errorCode).join(' ')}</span>}
                    <span className="sr-only">{fails ? ' (does not compile)' : ' (compiles)'}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-w-0">
        <BorrowVisualizer key={selected.id} snippet={selected} headingLevel={2} />
      </div>
    </div>
  );
}
