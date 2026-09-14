import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { drillById } from '../../src/content/drills';
import { lessonIndex, tracks } from '../../src/content/tracks';
import { LessonPage } from '../../src/pages/LessonPage';
import { attempt, seedStorage, storedState } from './helpers';

beforeEach(() => seedStorage({}));

const lessonOf = (id: string) => lessonIndex.get(id)!.lesson;
const onThisPage = () => within(screen.getByRole('navigation', { name: /lessons$/ }));

describe('LessonPage', () => {
  test('shows not-found for an unknown track', () => {
    render(<LessonPage trackId="nope" lessonId="moves" />);
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(storedState().lastLesson).toBeUndefined();
  });

  test('shows not-found for an unknown lesson in a real track', () => {
    render(<LessonPage trackId="ownership" lessonId="nope" />);
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(storedState().lastLesson).toBeUndefined();
  });

  test('records the visit as the lesson to resume', () => {
    render(<LessonPage trackId="ownership" lessonId="aliasing" />);
    expect(screen.getByRole('heading', { level: 1, name: lessonOf('aliasing').title })).toBeInTheDocument();
    expect(storedState().lastLesson).toEqual({ trackId: 'ownership', lessonId: 'aliasing' });
  });

  test('marks the lesson read and unread', async () => {
    const user = userEvent.setup();
    render(<LessonPage trackId="ownership" lessonId="moves" />);
    const button = screen.getByRole('button', { name: 'Mark as read' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(screen.getByRole('button', { name: 'Marked as read' })).toHaveAttribute('aria-pressed', 'true');
    expect(storedState().read).toEqual(['moves']);

    await user.click(screen.getByRole('button', { name: 'Marked as read' }));
    expect(screen.getByRole('button', { name: 'Mark as read' })).toHaveAttribute('aria-pressed', 'false');
    expect(storedState().read).toEqual([]);
  });

  test('the sidebar marks the current lesson and other read lessons', () => {
    seedStorage({ read: ['moves', 'functions'] });
    render(<LessonPage trackId="ownership" lessonId="moves" />);
    const nav = onThisPage();
    const current = nav.getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent(lessonOf('moves').title);
    expect(current).not.toHaveTextContent('(read)');
    const functions = nav.getByRole('link', { name: new RegExp(lessonOf('functions').title) });
    expect(functions).toHaveAttribute('href', '#/tracks/ownership/functions');
    expect(functions).toHaveTextContent('(read)');
    expect(nav.getByRole('link', { name: new RegExp(lessonOf('aliasing').title) })).not.toHaveTextContent('(read)');
  });

  test('links to the next lesson in the track', () => {
    render(<LessonPage trackId="ownership" lessonId="moves" />);
    expect(screen.getByRole('link', { name: `Next: ${lessonOf('functions').title}` })).toHaveAttribute('href', '#/tracks/ownership/functions');
  });

  test('links to the next available track after the last lesson', () => {
    render(<LessonPage trackId="ownership" lessonId="cloning" />);
    const next = tracks[1];
    expect(screen.getByRole('link', { name: `Next track: ${next.title}` })).toHaveAttribute('href', `#/tracks/${next.id}`);
  });

  test('points to the drills after the last lesson of the last track', () => {
    const last = tracks.at(-1)!;
    const lesson = last.lessons.at(-1)!;
    render(<LessonPage trackId={last.id} lessonId={lesson.id} />);
    expect(screen.getByRole('link', { name: 'Practise with drills' })).toHaveAttribute('href', '#/drills');
    expect(screen.queryByRole('link', { name: /^Next/ })).not.toBeInTheDocument();
  });

  test('shows visualizers but no timelines or drills for a lesson that only has visualizers', () => {
    const lesson = lessonOf('moves');
    render(<LessonPage trackId="ownership" lessonId="moves" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Watch the borrows' })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: /^Borrow visualizer:/ })).toHaveLength(lesson.visualize.length);
    expect(screen.queryByRole('heading', { name: 'Watch it run' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Diagnose it yourself' })).not.toBeInTheDocument();

    const jumps = onThisPage().getAllByRole('listitem').map((li) => li.textContent);
    expect(jumps.slice(-3)).toEqual(['Side by side', 'Where the analogy breaks', 'Watch the borrows']);
  });

  test('shows timelines and drills but no visualizers for an async lesson', () => {
    const lesson = lessonOf('as-futures-are-lazy');
    render(<LessonPage trackId="async" lessonId="as-futures-are-lazy" />);
    expect(screen.queryByRole('heading', { name: 'Watch the borrows' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Watch it run' })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: /^Async timeline:/ })).toHaveLength(lesson.timelines!.length);
    expect(screen.getByRole('heading', { level: 2, name: 'Diagnose it yourself' })).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: /^Drill:/ })).toHaveLength(lesson.drills!.length);
    expect(screen.queryByText(/Drills you have already tried/)).not.toBeInTheDocument();

    const jumps = onThisPage().getAllByRole('listitem').map((li) => li.textContent);
    expect(jumps.slice(-4)).toEqual(['Side by side', 'Where the analogy breaks', 'Watch it run', 'Diagnose it yourself']);
  });

  test('mentions remembered answers when a lesson drill was already tried', () => {
    const lesson = lessonOf('as-futures-are-lazy');
    const drillId = lesson.drills![0];
    expect(drillById.has(drillId)).toBe(true);
    seedStorage({ drills: { [drillId]: attempt(true) } });
    render(<LessonPage trackId="async" lessonId="as-futures-are-lazy" />);
    expect(screen.getByText(/Drills you have already tried remember your first answer/)).toBeInTheDocument();
  });

  test('jump links scroll to their section without changing the hash', () => {
    render(<LessonPage trackId="async" lessonId="as-futures-are-lazy" />);
    for (const [label, id] of [
      ['Side by side', 'compare'],
      ['Where the analogy breaks', 'breaks'],
      ['Watch it run', 'timelines'],
      ['Diagnose it yourself', 'drills'],
    ]) {
      const target = document.getElementById(id)!;
      const scroll = vi.spyOn(target, 'scrollIntoView');
      const notPrevented = fireEvent.click(onThisPage().getByRole('link', { name: label }));
      expect(notPrevented).toBe(false);
      expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    }
    expect(window.location.hash).toBe('');
  });

  test('the visualizer jump link scrolls to the visualizers', () => {
    render(<LessonPage trackId="ownership" lessonId="moves" />);
    const scroll = vi.spyOn(document.getElementById('visualize')!, 'scrollIntoView');
    fireEvent.click(onThisPage().getByRole('link', { name: 'Watch the borrows' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });

  test('each analogy break shows its code block only when it has code', () => {
    const lesson = lessonOf('moves');
    expect(lesson.breaks.some((b) => b.code)).toBe(true);
    expect(lesson.breaks.some((b) => !b.code)).toBe(true);
    render(<LessonPage trackId="ownership" lessonId="moves" />);
    const section = within(screen.getByRole('region', { name: 'Where the analogy breaks' }));
    const headings = section.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(lesson.breaks.length);
    lesson.breaks.forEach((b, i) => {
      const block = headings[i].parentElement!.parentElement!;
      expect(within(block).queryAllByRole('figure')).toHaveLength(b.code ? 1 : 0);
    });
  });

  test('lists the takeaways', () => {
    const lesson = lessonOf('moves');
    render(<LessonPage trackId="ownership" lessonId="moves" />);
    const carry = within(screen.getByRole('region', { name: 'Carry forward' }));
    expect(carry.getAllByRole('listitem')).toHaveLength(lesson.takeaways.length);
  });
});
