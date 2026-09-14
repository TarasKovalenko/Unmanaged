import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { drillById } from '../../src/content/drills';
import { gotchaById } from '../../src/content/gotchas';
import { allPhrases } from '../../src/content/phrasebook';
import { lessonIndex } from '../../src/content/tracks';
import type { Phrase } from '../../src/content/types';
import { PhrasebookPage } from '../../src/pages/PhrasebookPage';

// Real phrases never point at a gotcha, and every reference resolves. The extra
// entries cover the gotcha kind and references to content that is gone.
vi.mock('../../src/content/phrasebook', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/content/phrasebook')>();
  const entry = (id: string, seeAlso: Phrase['seeAlso']): Phrase => ({
    id,
    category: 'syntax',
    csharp: `// xyzzy ${id}`,
    rust: '// rust',
    note: 'A note.',
    fit: 'direct',
    seeAlso,
  });
  return {
    allPhrases: [
      ...real.allPhrases,
      entry('xyzzy-gotcha', { kind: 'gotcha', id: 'g-shadowing' }),
      entry('xyzzy-missing-lesson', { kind: 'lesson', id: 'gone' }),
      entry('xyzzy-missing-gotcha', { kind: 'gotcha', id: 'gone' }),
      entry('xyzzy-missing-drill', { kind: 'drill', id: 'gone' }),
    ],
  };
});

const rows = () => {
  const list = screen.queryAllByRole('list').at(-1);
  return list ? within(list).getAllByRole('listitem').filter((li) => li.parentElement === list) : [];
};
const rowFor = (csharp: string) => rows().find((li) => li.textContent?.includes(csharp))!;
const search = () => screen.getByRole('searchbox', { name: 'Search the phrasebook' });

describe('PhrasebookPage', () => {
  test('lists every entry with a count', () => {
    render(<PhrasebookPage />);
    expect(rows()).toHaveLength(allPhrases.length);
    expect(screen.getByText(`${allPhrases.length} entries`)).toBeInTheDocument();
  });

  test('labels each kind of fit', () => {
    render(<PhrasebookPage />);
    const labels: [Phrase['fit'], string][] = [
      ['direct', 'maps directly'],
      ['close', 'close, with differences'],
      ['different', 'works differently'],
    ];
    for (const [fit, label] of labels) {
      const phrase = allPhrases.find((p) => p.fit === fit)!;
      const row = rowFor(phrase.csharp.split('\n')[0]);
      expect(row).toHaveTextContent(label);
      expect(row).toHaveTextContent(phrase.category);
    }
  });

  test('searches across C#, Rust and notes', async () => {
    const user = userEvent.setup();
    render(<PhrasebookPage />);
    await user.type(search(), ' FIRSTORDEFAULT ');
    const expected = allPhrases.filter((p) => `${p.csharp} ${p.rust} ${p.note}`.toLowerCase().includes('firstordefault'));
    expect(expected.length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(expected.length);
    expect(screen.getByText(expected.length === 1 ? '1 entry' : `${expected.length} entries`)).toBeInTheDocument();
  });

  test('says nothing matches when the search finds nothing', async () => {
    const user = userEvent.setup();
    render(<PhrasebookPage />);
    await user.type(search(), 'qqqxxyyzz');
    expect(rows()).toHaveLength(0);
    expect(screen.getByText(/No entry matches/)).toBeInTheDocument();
    expect(screen.getByText('0 entries')).toBeInTheDocument();
  });

  test('filters by category and combines with the search', async () => {
    const user = userEvent.setup();
    render(<PhrasebookPage />);
    const select = screen.getByRole('combobox', { name: 'Category' });
    const categories = [...new Set(allPhrases.map((p) => p.category))];
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['All categories', ...categories]);

    await user.selectOptions(select, 'async');
    expect(rows()).toHaveLength(allPhrases.filter((p) => p.category === 'async').length);

    await user.type(search(), 'xyzzy');
    expect(rows()).toHaveLength(0);

    await user.selectOptions(select, 'all');
    expect(rows()).toHaveLength(4);
  });

  test('links to the lesson, gotcha or drill an entry refers to', () => {
    render(<PhrasebookPage />);
    const lessonPhrase = allPhrases.find((p) => p.seeAlso?.kind === 'lesson')!;
    const { track, lesson } = lessonIndex.get(lessonPhrase.seeAlso!.id)!;
    expect(within(rowFor(lessonPhrase.csharp.split('\n')[0])).getByRole('link', { name: lesson.title })).toHaveAttribute('href', `#/tracks/${track.id}/${lesson.id}`);

    const drillPhrase = allPhrases.find((p) => p.seeAlso?.kind === 'drill')!;
    const drill = drillById.get(drillPhrase.seeAlso!.id)!;
    expect(within(rowFor(drillPhrase.csharp.split('\n')[0])).getByRole('link', { name: drill.title })).toHaveAttribute('href', `#/drills/${drill.id}`);

    expect(within(rowFor('xyzzy-gotcha')).getByRole('link', { name: gotchaById.get('g-shadowing')!.title })).toHaveAttribute('href', '#/gotchas/g-shadowing');
  });

  test('shows no link when there is no reference or the target is missing', () => {
    render(<PhrasebookPage />);
    const plain = allPhrases.find((p) => !p.seeAlso)!;
    for (const text of [plain.csharp.split('\n')[0], 'xyzzy-missing-lesson', 'xyzzy-missing-gotcha', 'xyzzy-missing-drill']) {
      expect(within(rowFor(text)).queryByRole('link')).not.toBeInTheDocument();
    }
  });
});
