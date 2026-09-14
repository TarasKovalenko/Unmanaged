import { useEffect, useMemo, useRef, useState } from 'react';
import { CodeBlock } from '../components/CodeLine';
import { Inline } from '../components/Prose';
import { snippetById } from '../content/borrow';
import { drillById } from '../content/drills';
import { allGotchas } from '../content/gotchas';
import { lessonIndex } from '../content/tracks';
import type { Gotcha, GotchaTag } from '../content/types';
import { normaliseForSearch, plural } from '../lib/format';
import { href } from '../lib/router';

export function GotchasPage({ gotchaId }: { gotchaId?: string }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<GotchaTag | 'all'>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => {
    const counts = new Map<GotchaTag, number>();
    for (const g of allGotchas) for (const t of g.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  const visible = useMemo(() => {
    const q = normaliseForSearch(query.trim());
    return allGotchas.filter((g) => {
      if (tag !== 'all' && !g.tags.includes(tag)) return false;
      if (!q) return true;
      return normaliseForSearch([g.title, g.assumption, g.reality, g.code, g.csharp ?? '', g.errorCode ?? '', g.tags.join(' ')].join(' ')).includes(q);
    });
  }, [query, tag]);

  // "/" focuses search, like most docs sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!gotchaId) return;
    document.getElementById(`gotcha-${gotchaId}`)?.scrollIntoView({ block: 'start' });
  }, [gotchaId]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:py-12">
      <header className="max-w-[72ch]">
        <h1 className="font-mono text-[2rem] font-semibold tracking-[-0.03em] text-strong">Gotchas</h1>
        <p className="mt-3 text-[1.02rem]">
          Small, specific places where a C# habit gives the wrong answer. Each card is the assumption, what actually happens,
          and a program that proves it.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-4 mt-8 border-b border-rule bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-[260px]">
            <span className="sr-only">Search gotchas</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: overflow, String, E0277…  (press /)"
              className="w-full rounded-[3px] border border-rule-strong bg-surface px-3 py-2 font-mono text-[13.5px] text-text placeholder:text-muted/70"
            />
          </label>
          <span className="font-mono text-[12px] text-muted" aria-live="polite">
            {plural(visible.length, 'card')}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[12px]" role="radiogroup" aria-label="Filter by topic">
          {([['all', allGotchas.length], ...tags] as [GotchaTag | 'all', number][]).map(([t, n]) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tag === t}
              onClick={() => setTag(t)}
              className={`rounded-[3px] border px-2 py-0.5 ${tag === t ? 'border-oxide bg-surface text-strong' : 'border-rule text-muted hover:text-text'}`}
            >
              {t === 'all' ? 'all' : t} <span className="text-muted/70">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-10 text-muted">
          No card mentions that. Try a type name, an error code, or a C# keyword.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {visible.map((g) => (
            <GotchaCard key={g.id} gotcha={g} focused={g.id === gotchaId} />
          ))}
        </div>
      )}
    </div>
  );
}

function seeAlsoLink(g: Gotcha): { to: string; label: string } | null {
  if (!g.seeAlso) return null;
  const { kind, id } = g.seeAlso;
  if (kind === 'lesson') {
    const entry = lessonIndex.get(id);
    return entry ? { to: href.lesson(entry.track.id, id), label: `Lesson: ${entry.lesson.title}` } : null;
  }
  if (kind === 'drill') {
    const d = drillById.get(id);
    return d ? { to: href.drills(id), label: `Drill: ${d.title}` } : null;
  }
  const s = snippetById.get(id);
  return s ? { to: href.visualizer(id), label: `Visualizer: ${s.title}` } : null;
}

function GotchaCard({ gotcha: g, focused }: { gotcha: Gotcha; focused: boolean }) {
  const link = seeAlsoLink(g);
  return (
    <article
      id={`gotcha-${g.id}`}
      className={`flex min-w-0 scroll-mt-40 flex-col rounded-[4px] border bg-bg p-5 ${focused ? 'border-oxide' : 'border-rule'}`}
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-[1rem] font-medium leading-snug text-strong">
          <a href={href.gotchas(g.id)} className="hover:underline hover:decoration-oxide hover:underline-offset-4">
            <Inline text={g.title} />
          </a>
        </h2>
        <span className="shrink-0 font-mono text-[11px] text-muted">{g.tags.join(' ')}</span>
      </header>
      <dl className="mt-4 space-y-3 text-[0.95rem]">
        <div className="border-l-2 border-dashed border-steel pl-3">
          <dt className="font-mono text-[11.5px] text-steel">You assume</dt>
          <dd className="mt-0.5">
            <Inline text={g.assumption} />
          </dd>
        </div>
        <div className="border-l-2 border-oxide pl-3">
          <dt className="font-mono text-[11.5px] text-oxide-text">Actually</dt>
          <dd className="mt-0.5">
            <Inline text={g.reality} />
          </dd>
        </div>
      </dl>
      {g.csharp && (
        <div className="mt-4">
          <CodeBlock code={g.csharp} language="csharp" compact />
        </div>
      )}
      <div className="mt-3">
        <CodeBlock code={g.code} language="rust" status={g.expect} errorCode={g.errorCode} uncheckedReason={g.uncheckedReason} stdout={g.stdout} />
      </div>
      {link && (
        <p className="mt-auto pt-4 text-[0.88rem]">
          <a href={link.to} className="text-muted underline decoration-rule-strong underline-offset-4 hover:text-text">
            {link.label}
          </a>
        </p>
      )}
    </article>
  );
}
