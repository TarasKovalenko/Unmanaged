import { useMemo, useState } from 'react';
import { CodeLine } from '../components/CodeLine';
import { Inline } from '../components/Prose';
import { drillById } from '../content/drills';
import { gotchaById } from '../content/gotchas';
import { allPhrases } from '../content/phrasebook';
import { lessonIndex } from '../content/tracks';
import type { Phrase, PhraseCategory } from '../content/types';
import { normaliseForSearch, plural } from '../lib/format';
import type { Language } from '../lib/highlight';
import { href } from '../lib/router';

const FIT: Record<Phrase['fit'], { label: string; cls: string; bars: number }> = {
  direct: { label: 'maps directly', cls: 'text-verdigris', bars: 3 },
  close: { label: 'close, with differences', cls: 'text-ochre', bars: 2 },
  different: { label: 'works differently', cls: 'text-danger', bars: 1 },
};

export function PhrasebookPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PhraseCategory | 'all'>('all');

  const categories = useMemo(() => [...new Set(allPhrases.map((p) => p.category))], []);
  const visible = useMemo(() => {
    const q = normaliseForSearch(query.trim());
    return allPhrases.filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (!q || normaliseForSearch(`${p.csharp} ${p.rust} ${p.note} ${p.category}`).includes(q)),
    );
  }, [query, category]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:py-12">
      <header className="max-w-[72ch]">
        <h1 className="font-mono text-[2rem] font-semibold tracking-[-0.03em] text-strong">Phrasebook</h1>
        <p className="mt-3 text-[1.02rem]">
          "I would write this in C#. What is it in Rust?" Each entry says how faithful the translation is, because the ones
          that only look the same are where bugs come from.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-4 mt-8 flex flex-wrap items-center gap-3 border-b border-rule bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <label className="min-w-0 flex-1 basis-[240px]">
          <span className="sr-only">Search the phrasebook</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="FirstOrDefault, using, Task.WhenAll…"
            className="w-full rounded-[3px] border border-rule-strong bg-surface px-3 py-2 font-mono text-[13.5px] text-text placeholder:text-muted/70"
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PhraseCategory | 'all')}
            className="rounded-[3px] border border-rule bg-surface px-2 py-2 font-mono text-[13px] text-text"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-[12px] text-muted" aria-live="polite">
          {plural(visible.length, 'entry', 'entries')}
        </span>
      </div>

      <div className="mt-2 hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-6 border-b border-rule py-2 font-mono text-[12px] text-muted md:grid">
        <span>C#</span>
        <span>Rust</span>
        <span>Where it holds, where it doesn't</span>
      </div>

      {visible.length === 0 ? (
        <p className="mt-10 text-muted">No entry matches. Try the C# method or type name.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {visible.map((p) => (
            <PhraseRow key={p.id} phrase={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Snippet({ code, language }: { code: string; language: Language }) {
  return (
    <pre className={`overflow-x-auto rounded-[3px] bg-surface px-3 py-2 font-mono text-[12.5px] leading-[1.6] ${language === 'csharp' ? 'border border-dashed border-rule-strong' : 'border-2 border-rule-strong'}`}>
      {code.split('\n').map((l, i) => (
        <div key={i} className="whitespace-pre">
          <CodeLine text={l} language={language} />
        </div>
      ))}
    </pre>
  );
}

function PhraseRow({ phrase: p }: { phrase: Phrase }) {
  const fit = FIT[p.fit];
  let link: { to: string; label: string } | null = null;
  if (p.seeAlso?.kind === 'lesson') {
    const e = lessonIndex.get(p.seeAlso.id);
    if (e) link = { to: href.lesson(e.track.id, e.lesson.id), label: e.lesson.title };
  } else if (p.seeAlso?.kind === 'gotcha' && gotchaById.has(p.seeAlso.id)) {
    link = { to: href.gotchas(p.seeAlso.id), label: gotchaById.get(p.seeAlso.id)!.title };
  } else if (p.seeAlso?.kind === 'drill' && drillById.has(p.seeAlso.id)) {
    link = { to: href.drills(p.seeAlso.id), label: drillById.get(p.seeAlso.id)!.title };
  }
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:gap-6">
      <div className="min-w-0">
        <span className="mb-1 block font-mono text-[11px] text-muted md:hidden">C#</span>
        <Snippet code={p.csharp} language="csharp" />
      </div>
      <div className="min-w-0">
        <span className="mb-1 block font-mono text-[11px] text-muted md:hidden">Rust</span>
        <Snippet code={p.rust} language="rust" />
      </div>
      <div className="min-w-0 text-[0.93rem]">
        <p className={`flex items-center gap-2 font-mono text-[12px] ${fit.cls}`}>
          <span aria-hidden="true" className="inline-flex gap-[2px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`inline-block h-2.5 w-1.5 ${i < fit.bars ? 'bg-current' : 'bg-rule'}`} />
            ))}
          </span>
          {fit.label}
          <span className="text-muted">{p.category}</span>
        </p>
        <p className="mt-1.5">
          <Inline text={p.note} />
        </p>
        {link && (
          <a href={link.to} className="mt-1.5 inline-block text-[0.88rem] text-muted underline decoration-rule-strong underline-offset-4 hover:text-text">
            {link.label}
          </a>
        )}
      </div>
    </li>
  );
}
