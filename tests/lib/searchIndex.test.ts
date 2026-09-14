import { describe, expect, test } from 'vitest';

import { content, type Content } from '../../src/content/index.ts';
import { buildErrorIndex, buildSearchIndex, search, searchIndex } from '../../src/lib/searchIndex.ts';

// A tiny content set, so each branch of the index builders is visible in one place.
const lesson = (id: string, title: string, timelines?: string[]) => ({ id, title, summary: `${title} summary`, intro: ['Intro text'], breaks: [{ heading: 'Break heading' }], timelines });
const small = {
  tracks: [{ id: 't1', title: 'Track One', lessons: [lesson('l1', 'Moves'), lesson('l2', 'Async', ['tl-hosted'])] }],
  timelines: [
    { id: 'tl-hosted', title: 'Hosted timeline', summary: 'shown in a lesson', explanation: ['why'] },
    { id: 'tl-orphan', title: 'Orphan timeline', summary: 'not embedded anywhere', explanation: [] },
  ],
  snippets: [
    { id: 's1', title: 'Compile snippet', summary: 'sum', code: 'let a = 1;', conflicts: [{ errorCode: 'E0382', message: 'error[E0382]: moved\n --> x', phase: 'compile' }] },
    { id: 's2', title: 'Runtime snippet', summary: 'sum', code: '', conflicts: [{ errorCode: 'panic', message: "thread 'main' panicked at src/main.rs:1:1:\nalready borrowed", phase: 'runtime' }] },
  ],
  drills: [
    { id: 'd1', title: 'Drill compile', errorCode: 'E0999', message: 'error[E0999]: made up\nmore', outcome: 'compile-error' },
    { id: 'd2', title: 'Drill panic', errorCode: 'panic', message: "thread 'main' panicked at src/main.rs:2:2:", outcome: 'panic' },
  ],
  gotchas: [
    { id: 'g1', title: 'Gotcha with code', reality: 'r', assumption: 'a', tags: ['x'], errorCode: 'E0382' },
    { id: 'g2', title: 'Gotcha that panics', reality: 'r', assumption: 'a', tags: [], expect: 'panics' },
    { id: 'g3', title: 'Gotcha that compiles', reality: 'r', assumption: 'a', tags: [], expect: 'compiles' },
  ],
  phrases: [{ csharp: 'list.Add(x);\nmore', rust: 'v.push(x);\nmore', fit: 'close', note: 'n' }],
  projects: [{ id: 'p1', title: 'Project', dotnetEquivalent: 'ASP.NET', summary: 's', crates: [{ name: 'axum' }] }],
} as unknown as Content;

describe('buildErrorIndex', () => {
  test('groups usages by code, with the first message line or panic text, and sorts panic last', () => {
    expect(buildErrorIndex(small)).toEqual([
      {
        code: 'E0382',
        items: [
          { kind: 'snippet', title: 'Compile snippet', to: '#/visualizer/s1', firstLine: 'error[E0382]: moved' },
          { kind: 'gotcha', title: 'Gotcha with code', to: '#/gotchas/g1', firstLine: '' },
        ],
      },
      { code: 'E0999', items: [{ kind: 'drill', title: 'Drill compile', to: '#/drills/d1', firstLine: 'error[E0999]: made up' }] },
      {
        code: 'panic',
        items: [
          { kind: 'snippet', title: 'Runtime snippet', to: '#/visualizer/s2', firstLine: 'already borrowed' },
          { kind: 'drill', title: 'Drill panic', to: '#/drills/d2', firstLine: 'panic' },
          { kind: 'gotcha', title: 'Gotcha that panics', to: '#/gotchas/g2', firstLine: '' },
        ],
      },
    ]);
  });

  test('lists every code used by real snippets and drills', () => {
    const codes = new Set(buildErrorIndex().map((e) => e.code));
    for (const s of content.snippets) for (const c of s.conflicts) expect(codes.has(c.errorCode), c.errorCode).toBe(true);
    for (const d of content.drills) expect(codes.has(d.errorCode), d.errorCode).toBe(true);
  });
});

describe('buildSearchIndex', () => {
  const items = buildSearchIndex(small, { E0382: { title: 'Use of moved value', gist: 'The value moved' } });

  test('indexes every kind of content with a link to it', () => {
    expect(items.map((i) => [i.kind, i.title, i.to])).toEqual([
      ['lesson', 'Moves', '#/tracks/t1/l1'],
      ['lesson', 'Async', '#/tracks/t1/l2'],
      ['timeline', 'Hosted timeline', '#/tracks/t1/l2'],
      ['snippet', 'Compile snippet', '#/visualizer/s1'],
      ['snippet', 'Runtime snippet', '#/visualizer/s2'],
      ['drill', 'Drill compile', '#/drills/d1'],
      ['drill', 'Drill panic', '#/drills/d2'],
      ['gotcha', 'Gotcha with code', '#/gotchas/g1'],
      ['gotcha', 'Gotcha that panics', '#/gotchas/g2'],
      ['gotcha', 'Gotcha that compiles', '#/gotchas/g3'],
      ['phrase', 'list.Add(x);', '#/phrasebook'],
      ['project', 'Project', '#/projects/p1'],
      ['error', 'E0382', '#/errors/E0382'],
      ['error', 'E0999', '#/errors/E0999'],
      ['error', 'panic', '#/errors/panic'],
    ]);
  });

  test('skips timelines no lesson embeds', () => {
    expect(items.some((i) => i.title === 'Orphan timeline')).toBe(false);
  });

  test('uses error summaries when known and a generic subtitle otherwise', () => {
    const errors = items.filter((i) => i.kind === 'error');
    expect(errors.map((e) => e.subtitle)).toEqual(['Use of moved value', 'Compiler error', 'Compiler error']);
    expect(errors[0].text).toContain('the value moved');
  });

  test('builds subtitles and normalised haystacks from the source fields', () => {
    const phrase = items.find((i) => i.kind === 'phrase')!;
    expect(phrase.subtitle).toBe('v.push(x);  (close)');
    const lessonItem = items[0];
    expect(lessonItem.subtitle).toBe('Track One: Moves summary');
    expect(lessonItem.titleText).toBe('moves');
    expect(lessonItem.text).toBe('moves track one: moves summary intro text break heading');
    expect(items.find((i) => i.kind === 'project')!.text).toContain('axum');
  });
});

describe('searchIndex', () => {
  test('is built from real content once and cached', () => {
    const first = searchIndex();
    expect(first.length).toBeGreaterThan(0);
    expect(searchIndex()).toBe(first);
  });
});

describe('search', () => {
  test('finds an error code and ranks the exact title match first', () => {
    const results = search('E0382');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({ kind: 'error', title: 'E0382' });
  });

  test('requires every term to match', () => {
    expect(search('borrow zzzznotaword')).toEqual([]);
  });

  test('returns nothing for a blank query', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  test('ranks title prefix above title substring above body-only matches', () => {
    const index = searchIndex();
    const results = search('borrow', 1000);
    const pos = (pred: (t: string) => boolean) => results.findIndex((r) => pred(r.titleText));
    const prefix = pos((t) => t.startsWith('borrow') && t !== 'borrow');
    const substring = pos((t) => !t.startsWith('borrow') && t.includes('borrow'));
    const bodyOnly = pos((t) => !t.includes('borrow'));
    expect(prefix).toBeGreaterThanOrEqual(0);
    expect(substring).toBeGreaterThan(prefix);
    expect(bodyOnly).toBeGreaterThan(substring);
    expect(results.length).toBe(index.filter((i) => i.text.includes('borrow')).length);
  });

  test('gives lessons a small boost over other kinds with the same match', () => {
    const results = search('the', 1000);
    const firstBodyOnly = results.findIndex((r) => !r.titleText.includes('the'));
    // Among body-only matches, lessons (score 2) come before everything else (score 1).
    const bodyOnly = results.slice(firstBodyOnly);
    const lastLesson = bodyOnly.map((r) => r.kind).lastIndexOf('lesson');
    const firstOther = bodyOnly.findIndex((r) => r.kind !== 'lesson');
    expect(lastLesson).toBeGreaterThanOrEqual(0);
    expect(firstOther).toBeGreaterThan(lastLesson);
  });

  test('limits the number of results', () => {
    expect(search('the')).toHaveLength(30);
    expect(search('the', 5)).toHaveLength(5);
  });

  test('matches case-insensitively and ignores markdown punctuation in the query', () => {
    expect(search('**e0382**')[0].title).toBe('E0382');
  });
});
