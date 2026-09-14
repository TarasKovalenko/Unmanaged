// Real content has every track written and every practice section filled, so
// the "planned track" and "empty section" branches need mocked content.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Track } from '../../src/content/types';
import { HomePage } from '../../src/pages/HomePage';
import { TrackPage } from '../../src/pages/TrackPage';

vi.mock('../../src/content/tracks', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/content/tracks')>();
  const planned: Track = { id: 'macros', order: 7, title: 'Macros', pitch: 'Coming later.', status: 'planned', lessons: [] };
  return { ...real, tracks: [...real.tracks, planned] };
});

vi.mock('../../src/content', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/content')>();
  return { ...real, content: { ...real.content, phrases: [] } };
});

describe('HomePage with planned tracks and empty sections', () => {
  test('shows a planned track as plain text marked not written yet', () => {
    render(<HomePage />);
    const item = screen.getByText('Macros').closest('li')!;
    expect(item).toHaveTextContent('not written yet');
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
  });

  test('hides practice sections that have no entries', () => {
    render(<HomePage />);
    const practice = within(screen.getByRole('region', { name: 'Outside the tracks' }));
    expect(practice.queryByRole('link', { name: /Phrasebook/ })).not.toBeInTheDocument();
    expect(practice.getByRole('link', { name: /Gotchas/ })).toBeInTheDocument();
  });
});

describe('TrackPage for a planned track', () => {
  test('shows not-found', () => {
    render(<TrackPage trackId="macros" />);
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Macros' })).not.toBeInTheDocument();
  });
});
