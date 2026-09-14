import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { allDrills } from '../../src/content/drills';
import { tracks } from '../../src/content/tracks';
import { TrackPage } from '../../src/pages/TrackPage';
import { seedStorage } from './helpers';

vi.mock('../../src/content/drills', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/content/drills')>();
  // Real content has drills for every track; drop one track's drills to reach the "no drills" branch.
  return { ...real, allDrills: real.allDrills.filter((d) => d.track !== 'structs') };
});

beforeEach(() => seedStorage({}));

describe('TrackPage', () => {
  test('shows not-found for an unknown track', () => {
    render(<TrackPage trackId="nope" />);
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the start' })).toHaveAttribute('href', '#/');
  });

  test('lists lessons in order with links and marks read ones', () => {
    seedStorage({ read: ['functions'] });
    render(<TrackPage trackId="ownership" />);
    const track = tracks.find((t) => t.id === 'ownership')!;
    expect(screen.getByRole('heading', { level: 1, name: track.title })).toBeInTheDocument();
    expect(screen.getByText(`Stuck point ${track.order} of 6`)).toBeInTheDocument();

    const items = within(screen.getAllByRole('list').at(-1)!).getAllByRole('link');
    expect(items).toHaveLength(track.lessons.length);
    expect(items[0]).toHaveAttribute('href', '#/tracks/ownership/moves');
    expect(items[0]).toHaveTextContent(track.lessons[0].title);
    expect(items[0]).not.toHaveTextContent(/read$/);
    expect(items[1]).toHaveTextContent(/read$/);
  });

  test('links to the drills when the track has some', () => {
    render(<TrackPage trackId="ownership" />);
    const count = allDrills.filter((d) => d.track === 'ownership').length;
    expect(count).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: `${count} error drills` })).toHaveAttribute('href', '#/drills');
  });

  test('has no drills link when the track has no drills', () => {
    render(<TrackPage trackId="structs" />);
    expect(screen.queryByRole('link', { name: /error drills/ })).not.toBeInTheDocument();
  });
});
