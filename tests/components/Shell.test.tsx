import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import type { Route } from '../../src/lib/router';
import { fresh, mockFetch, type RunnerMode } from './runnerFetch';

async function renderShell(route: Route = { page: 'home' }, mode: RunnerMode = 'pending') {
  mockFetch({ mode });
  const { Shell } = await fresh(() => import('../../src/components/Shell'));
  const utils = render(
    <Shell route={route}>
      <p>page body</p>
    </Shell>,
  );
  return { ...utils, Shell };
}

const navs = () => screen.getAllByRole('navigation', { name: 'Primary' });

describe('Shell', () => {
  test('renders the page inside main with both navigations and the about link', async () => {
    await renderShell();
    expect(screen.getByRole('main')).toHaveTextContent('page body');
    expect(navs()).toHaveLength(2);
    for (const nav of navs()) {
      expect([...nav.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Tracks', 'Visualizer', 'Drills', 'Gotchas', 'Phrasebook', 'Projects', 'Errors']);
    }
    expect(screen.getByRole('link', { name: 'About and limitations' })).toHaveAttribute('href', '#/about');
  });

  test.each<[Route, string]>([
    [{ page: 'home' }, 'Tracks'],
    [{ page: 'track', trackId: 'ownership' }, 'Tracks'],
    [{ page: 'lesson', trackId: 'ownership', lessonId: 'moves' }, 'Tracks'],
    [{ page: 'visualizer' }, 'Visualizer'],
    [{ page: 'drills' }, 'Drills'],
    [{ page: 'gotchas' }, 'Gotchas'],
    [{ page: 'phrasebook' }, 'Phrasebook'],
    [{ page: 'projects' }, 'Projects'],
    [{ page: 'project', projectId: 'x' }, 'Projects'],
    [{ page: 'errors' }, 'Errors'],
  ])('marks the current section for %o', async (route, label) => {
    await renderShell(route);
    for (const nav of navs()) {
      const current = [...nav.querySelectorAll('a[aria-current="page"]')];
      expect(current.map((a) => a.textContent)).toEqual([label]);
    }
  });

  test('no section is current on the about page', async () => {
    await renderShell({ page: 'about' });
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  });

  test('the skip link moves focus to main without changing the hash', async () => {
    await renderShell();
    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
    expect(window.location.hash).toBe('');
  });

  test('the theme toggle switches between dark and light and applies it to the document', async () => {
    await renderShell();
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    const back = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(back).toHaveTextContent('Dark');
    await userEvent.click(back);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveTextContent('Light');
  });

  test('the search button opens the palette', async () => {
    await renderShell();
    const dialog = document.querySelector('dialog')!;
    expect(dialog).not.toHaveAttribute('open');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(dialog).toHaveAttribute('open');
    await userEvent.click(dialog); // backdrop
    expect(dialog).not.toHaveAttribute('open');
  });

  test('Ctrl+K and Cmd+K toggle the palette; plain K does not', async () => {
    const user = userEvent.setup();
    await renderShell();
    const dialog = document.querySelector('dialog')!;
    await user.keyboard('k');
    expect(dialog).not.toHaveAttribute('open');
    await user.keyboard('{Control>}k{/Control}');
    expect(dialog).toHaveAttribute('open');
    await user.keyboard('{Meta>}K{/Meta}');
    expect(dialog).not.toHaveAttribute('open');
    await user.keyboard('{Control>}j{/Control}');
    expect(dialog).not.toHaveAttribute('open');
  });

  test('stops listening for the shortcut after unmounting', async () => {
    const { unmount } = await renderShell();
    const remove = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  test('shows the shortcut for the platform', async () => {
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const first = await renderShell();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    first.unmount();
    platform.mockReturnValue('Win32');
    await renderShell();
    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
  });

  test.each<[RunnerMode, string]>([
    ['runner', 'Run buttons use the code runner (Rust and C#).'],
    ['playground', 'Run buttons send Rust to play.rust-lang.org; C# needs the code runner.'],
    ['none', 'Running code is not available here.'],
  ])('footer explains running code when the backend is %s', async (mode, text) => {
    await renderShell({ page: 'home' }, mode);
    await waitFor(() => expect(screen.getByRole('contentinfo')).toHaveTextContent(text));
  });

  test('footer says nothing about running code while detection is pending', async () => {
    await renderShell({ page: 'home' }, 'pending');
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Outputs shown in lessons were verified ahead of time with rustc and .NET.');
    expect(footer).not.toHaveTextContent('Run');
  });
});
