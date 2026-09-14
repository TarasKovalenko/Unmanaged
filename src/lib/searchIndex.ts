import { content, type Content } from '../content/index.ts';
import { errorCodes, type ErrorCodeInfo } from '../content/errors.ts';
import { normaliseForSearch } from './format.ts';
import { href } from './router.ts';

export type SearchKind = 'lesson' | 'snippet' | 'drill' | 'gotcha' | 'phrase' | 'project' | 'error' | 'timeline';

export interface SearchItem {
  kind: SearchKind;
  title: string;
  subtitle: string;
  to: string;
  /** Normalised haystack. */
  text: string;
  titleText: string;
}

export interface ErrorIndexEntry {
  code: string;
  items: { kind: 'snippet' | 'drill' | 'gotcha'; title: string; to: string; firstLine: string }[];
}

/** Every error code used anywhere in content, with where it appears. */
export function buildErrorIndex(source: Pick<Content, 'snippets' | 'drills' | 'gotchas'> = content): ErrorIndexEntry[] {
  const map = new Map<string, ErrorIndexEntry['items']>();
  const add = (code: string, item: ErrorIndexEntry['items'][number]) => map.set(code, [...(map.get(code) ?? []), item]);
  const first = (m: string) => m.split('\n')[0];
  for (const s of source.snippets) {
    for (const c of s.conflicts) {
      add(c.errorCode, { kind: 'snippet', title: s.title, to: href.visualizer(s.id), firstLine: c.phase === 'runtime' ? panicText(c.message) : first(c.message) });
    }
  }
  for (const d of source.drills) {
    add(d.errorCode, { kind: 'drill', title: d.title, to: href.drills(d.id), firstLine: d.outcome === 'panic' ? panicText(d.message) : first(d.message) });
  }
  for (const g of source.gotchas) {
    if (g.errorCode) add(g.errorCode, { kind: 'gotcha', title: g.title, to: href.gotchas(g.id), firstLine: '' });
    else if (g.expect === 'panics') add('panic', { kind: 'gotcha', title: g.title, to: href.gotchas(g.id), firstLine: '' });
  }
  return [...map.entries()]
    .map(([code, items]) => ({ code, items }))
    .sort((a, b) => (a.code === 'panic' ? 1 : b.code === 'panic' ? -1 : a.code.localeCompare(b.code)));
}

function panicText(message: string) {
  const rows = message.split('\n');
  return rows[rows.findIndex((r) => r.includes('panicked at')) + 1] ?? 'panic';
}

let cached: SearchItem[] | null = null;

export function searchIndex(): SearchItem[] {
  cached ??= buildSearchIndex();
  return cached;
}

/** Builds the search index from content. Exposed so it can be built from other sources. */
export function buildSearchIndex(source: Content = content, codes: Record<string, ErrorCodeInfo> = errorCodes): SearchItem[] {
  const items: SearchItem[] = [];
  const push = (kind: SearchKind, title: string, subtitle: string, to: string, ...extra: string[]) =>
    items.push({ kind, title, subtitle, to, titleText: normaliseForSearch(title), text: normaliseForSearch([title, subtitle, ...extra].join(' ')) });

  for (const t of source.tracks) {
    for (const l of t.lessons) {
      push('lesson', l.title, `${t.title}: ${l.summary}`, href.lesson(t.id, l.id), l.intro.join(' '), l.breaks.map((b) => b.heading).join(' '));
    }
  }
  for (const t of source.timelines) {
    // Timelines have no page of their own; link to the first lesson that embeds one.
    const host = source.tracks.flatMap((tr) => tr.lessons.map((l) => ({ tr, l }))).find(({ l }) => l.timelines?.includes(t.id));
    if (host) push('timeline', t.title, t.summary, href.lesson(host.tr.id, host.l.id), t.explanation.join(' '));
  }
  for (const s of source.snippets) push('snippet', s.title, s.summary, href.visualizer(s.id), s.conflicts.map((c) => c.errorCode).join(' '), s.code);
  for (const d of source.drills) push('drill', d.title, `${d.errorCode} drill`, href.drills(d.id), d.errorCode, d.message.split('\n')[0]);
  for (const g of source.gotchas) push('gotcha', g.title, g.reality, href.gotchas(g.id), g.assumption, g.tags.join(' '), g.errorCode ?? '');
  for (const p of source.phrases) push('phrase', p.csharp.split('\n')[0], `${p.rust.split('\n')[0]}  (${p.fit})`, href.phrasebook(), p.rust, p.note);
  for (const p of source.projects) push('project', p.title, `In .NET: ${p.dotnetEquivalent}`, href.project(p.id), p.summary, p.crates.map((c) => c.name).join(' '));
  for (const e of buildErrorIndex(source)) {
    const info = codes[e.code];
    push('error', e.code, info?.title ?? 'Compiler error', href.errors(e.code), info?.gist ?? '');
  }
  return items;
}

export function search(query: string, limit = 30): SearchItem[] {
  const terms = normaliseForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return searchIndex()
    .map((item) => {
      if (!terms.every((t) => item.text.includes(t))) return null;
      let score = 0;
      for (const t of terms) {
        if (item.titleText === t) score += 10;
        else if (item.titleText.startsWith(t)) score += 6;
        else if (item.titleText.includes(t)) score += 4;
        else score += 1;
      }
      if (item.kind === 'lesson') score += 1;
      return { item, score };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}
