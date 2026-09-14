import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { content } from '../../src/content';
import { lessonIndex, tracks } from '../../src/content/tracks';
import { HomePage } from '../../src/pages/HomePage';
import { attempt, seedStorage } from './helpers';

beforeEach(() => seedStorage({}));

function trackLink(title: string) {
  return screen.getAllByRole('link').find((a) => a.textContent?.includes(title) && a.getAttribute('href')?.startsWith('#/tracks/') && !a.textContent.startsWith('Continue'))!;
}

describe('HomePage', () => {
  test('offers to start the ownership track when nothing has been visited', () => {
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Start with ownership' })).toHaveAttribute('href', '#/tracks/ownership/moves');
    expect(screen.queryByRole('link', { name: /^Continue:/ })).not.toBeInTheDocument();
  });

  test('offers to resume the last visited lesson', () => {
    seedStorage({ lastLesson: { trackId: 'ownership', lessonId: 'aliasing' } });
    render(<HomePage />);
    const { lesson } = lessonIndex.get('aliasing')!;
    expect(screen.getByRole('link', { name: `Continue: ${lesson.title}` })).toHaveAttribute('href', '#/tracks/ownership/aliasing');
    expect(screen.queryByRole('link', { name: 'Start with ownership' })).not.toBeInTheDocument();
  });

  test('falls back to the start link when the last lesson no longer exists', () => {
    seedStorage({ lastLesson: { trackId: 'ownership', lessonId: 'deleted-lesson' } });
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Start with ownership' })).toBeInTheDocument();
  });

  test('suggests trying a drill when none were missed', () => {
    seedStorage({ drills: { 'move-in-loop': attempt(true) } });
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Try an error drill' })).toHaveAttribute('href', '#/drills');
    expect(screen.queryByRole('link', { name: /^Revisit/ })).not.toBeInTheDocument();
  });

  test('counts one missed drill in the singular', () => {
    seedStorage({ drills: { 'move-in-loop': attempt(false), 'own-e0499': attempt(true) } });
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Revisit 1 missed drill' })).toHaveAttribute('href', '#/drills');
  });

  test('counts several missed drills in the plural', () => {
    seedStorage({ drills: { 'move-in-loop': attempt(false), 'own-e0499': attempt(false) } });
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'Revisit 2 missed drills' })).toBeInTheDocument();
  });

  test('lists every available track as a link with its lesson count and read count', () => {
    seedStorage({ read: ['moves', 'functions', 'not-a-lesson'] });
    render(<HomePage />);
    const ownership = tracks.find((t) => t.id === 'ownership')!;
    const link = trackLink(ownership.title);
    expect(link).toHaveAttribute('href', '#/tracks/ownership');
    expect(link).toHaveTextContent(`${ownership.lessons.length} lessons, 2 read`);

    const structs = tracks.find((t) => t.id === 'structs')!;
    const structsLink = trackLink(structs.title);
    expect(structsLink).toHaveTextContent(`${structs.lessons.length} lessons`);
    expect(structsLink).not.toHaveTextContent('read');
  });

  test('shows the hero visualizer and practice sections with content counts', () => {
    render(<HomePage />);
    expect(screen.getByRole('region', { name: 'Borrow visualizer: Assignment moves a String' })).toBeInTheDocument();
    const practice = within(screen.getByRole('region', { name: 'Outside the tracks' }));
    expect(practice.getByRole('link', { name: new RegExp(`Error drills\\s*${content.drills.length} drills`) })).toHaveAttribute('href', '#/drills');
    expect(practice.getByRole('link', { name: new RegExp(`Phrasebook\\s*${content.phrases.length} entries`) })).toHaveAttribute('href', '#/phrasebook');
    const errorIndex = practice.getByRole('link', { name: /^Error index/ });
    expect(errorIndex).toHaveAttribute('href', '#/errors');
    expect(errorIndex.textContent).not.toMatch(/\d/);
  });
});
