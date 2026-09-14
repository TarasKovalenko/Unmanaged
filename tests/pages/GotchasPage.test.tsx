import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { snippetById } from '../../src/content/borrow';
import { drillById } from '../../src/content/drills';
import { allGotchas } from '../../src/content/gotchas';
import { lessonIndex } from '../../src/content/tracks';
import type { Gotcha } from '../../src/content/types';
import { GotchasPage } from '../../src/pages/GotchasPage';

// Real gotchas only point at lessons, and every reference resolves. The extra
// cards cover the other seeAlso kinds and references to content that is gone.
vi.mock('../../src/content/gotchas', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/content/gotchas')>();
  const card = (id: string, seeAlso: Gotcha['seeAlso']): Gotcha => ({
    id,
    title: `Zeta card ${id}`,
    tags: ['equality'],
    assumption: 'An assumption.',
    reality: 'The reality.',
    code: 'fn main() {}',
    expect: 'compiles',
    seeAlso,
  });
  const extra = [
    card('zeta-drill', { kind: 'drill', id: 'own-e0502' }),
    card('zeta-snippet', { kind: 'snippet', id: 'copy-types' }),
    card('zeta-missing-lesson', { kind: 'lesson', id: 'gone' }),
    card('zeta-missing-drill', { kind: 'drill', id: 'gone' }),
    card('zeta-missing-snippet', { kind: 'snippet', id: 'gone' }),
  ];
  const allGotchas = [...real.allGotchas, ...extra];
  return { allGotchas, gotchaById: new Map(allGotchas.map((g) => [g.id, g])) };
});

const cards = () => screen.queryAllByRole('article');
const card = (id: string) => document.getElementById(`gotcha-${id}`)!;
const search = () => screen.getByRole('searchbox', { name: 'Search gotchas' });

describe('GotchasPage', () => {
  test('shows every card with a count', () => {
    render(<GotchasPage />);
    expect(cards()).toHaveLength(allGotchas.length);
    expect(screen.getByText(`${allGotchas.length} cards`)).toBeInTheDocument();
    const first = within(card(allGotchas[0].id));
    expect(first.getByRole('link', { name: allGotchas[0].title })).toHaveAttribute('href', `#/gotchas/${allGotchas[0].id}`);
    expect(first.getByText('You assume')).toBeInTheDocument();
  });

  test('shows the C# contrast only on cards that have one', () => {
    render(<GotchasPage />);
    const withCsharp = allGotchas.find((g) => g.csharp)!;
    expect(within(card(withCsharp.id)).getAllByRole('figure')).toHaveLength(2);
    expect(within(card('zeta-drill')).getAllByRole('figure')).toHaveLength(1);
  });

  test('searches card text case-insensitively', async () => {
    const user = userEvent.setup();
    render(<GotchasPage />);
    await user.type(search(), '  e0277 ');
    const expected = allGotchas.filter((g) => g.errorCode === 'E0277' || JSON.stringify(g).includes('E0277'));
    expect(cards().length).toBeGreaterThan(0);
    expect(cards().map((a) => a.id)).toEqual(expected.map((g) => `gotcha-${g.id}`));
  });

  test('says no card matches when the search finds nothing', async () => {
    const user = userEvent.setup();
    render(<GotchasPage />);
    await user.type(search(), 'qqqxxyyzz');
    expect(cards()).toHaveLength(0);
    expect(screen.getByText(/No card mentions that/)).toBeInTheDocument();
    expect(screen.getByText('0 cards')).toBeInTheDocument();
  });

  test('filters by tag, most used tags first, and back to all', async () => {
    const user = userEvent.setup();
    render(<GotchasPage />);
    const group = within(screen.getByRole('radiogroup', { name: 'Filter by topic' }));
    const radios = group.getAllByRole('radio');
    expect(radios[0]).toHaveTextContent(`all ${allGotchas.length}`);
    const counts = radios.slice(1).map((r) => Number(r.textContent!.split(' ').at(-1)));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    await user.click(group.getByRole('radio', { name: /^numbers/ }));
    expect(group.getByRole('radio', { name: /^numbers/ })).toHaveAttribute('aria-checked', 'true');
    const numbers = allGotchas.filter((g) => g.tags.includes('numbers'));
    expect(cards().map((a) => a.id)).toEqual(numbers.map((g) => `gotcha-${g.id}`));
    expect(screen.getByText(`${numbers.length} cards`)).toBeInTheDocument();

    await user.type(search(), 'zeta card');
    expect(cards()).toHaveLength(0);

    await user.click(group.getByRole('radio', { name: /^all/ }));
    expect(cards()).toHaveLength(5);
  });

  test('pressing / focuses the search box without typing the slash', () => {
    render(<GotchasPage />);
    expect(search()).not.toHaveFocus();
    const notPrevented = fireEvent.keyDown(document.body, { key: '/' });
    expect(notPrevented).toBe(false);
    expect(search()).toHaveFocus();
  });

  test('other keys do not move focus', () => {
    render(<GotchasPage />);
    expect(fireEvent.keyDown(document.body, { key: 'a' })).toBe(true);
    expect(search()).not.toHaveFocus();
  });

  test('typing / inside the search box types it', async () => {
    const user = userEvent.setup();
    render(<GotchasPage />);
    await user.type(search(), 'a/b');
    expect(search()).toHaveValue('a/b');
  });

  test('typing / in another text area leaves focus there', async () => {
    const user = userEvent.setup();
    render(<GotchasPage />);
    const notes = document.createElement('textarea');
    document.body.appendChild(notes);
    await user.type(notes, '/');
    expect(notes).toHaveValue('/');
    expect(notes).toHaveFocus();
    notes.remove();
  });

  test('stops listening for / after unmounting', () => {
    const { unmount } = render(<GotchasPage />);
    unmount();
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(true);
  });

  test('scrolls to the gotcha from the route', () => {
    render(<GotchasPage gotchaId="g-shadowing" />);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(scroll.mock.contexts).toEqual([card('g-shadowing')]);
  });

  test('does not scroll for an unknown or missing gotcha id', () => {
    const { rerender } = render(<GotchasPage gotchaId="nope" />);
    rerender(<GotchasPage />);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  test('links to the lesson, drill or snippet each card refers to', () => {
    render(<GotchasPage />);
    const lessonCard = allGotchas.find((g) => g.seeAlso?.kind === 'lesson')!;
    const entry = lessonIndex.get(lessonCard.seeAlso!.id)!;
    expect(within(card(lessonCard.id)).getByRole('link', { name: `Lesson: ${entry.lesson.title}` })).toHaveAttribute(
      'href',
      `#/tracks/${entry.track.id}/${entry.lesson.id}`,
    );
    expect(within(card('zeta-drill')).getByRole('link', { name: `Drill: ${drillById.get('own-e0502')!.title}` })).toHaveAttribute('href', '#/drills/own-e0502');
    expect(within(card('zeta-snippet')).getByRole('link', { name: `Visualizer: ${snippetById.get('copy-types')!.title}` })).toHaveAttribute(
      'href',
      '#/visualizer/copy-types',
    );
  });

  test('shows no further-reading link when there is none or the target is missing', () => {
    render(<GotchasPage />);
    const plain = allGotchas.find((g) => !g.seeAlso)!;
    for (const id of [plain.id, 'zeta-missing-lesson', 'zeta-missing-drill', 'zeta-missing-snippet']) {
      const links = within(card(id)).getAllByRole('link');
      expect(links.map((a) => a.getAttribute('href'))).toEqual([`#/gotchas/${id}`]);
    }
  });
});
