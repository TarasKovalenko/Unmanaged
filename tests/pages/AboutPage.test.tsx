import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { toolchain } from '../../src/content/meta';
import { seedStorage, storedState } from './helpers';

// Capabilities are probed once per page load and cached at module level, so
// each test loads a fresh copy of the page with its own fetch.
async function loadAboutPage() {
  vi.resetModules();
  return (await import('../../src/pages/AboutPage')).AboutPage;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const capabilities = () => screen.getByText('On this site right now:').parentElement!;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AboutPage capabilities', () => {
  test('says it is checking while the runner probe is pending', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);
    expect(capabilities()).toHaveTextContent('On this site right now: checking….');
  });

  test('reports both languages on the code runner', async () => {
    const fetch = vi.fn(async () => json({ languages: { rust: { version: '1.90.0' }, csharp: { version: '9.0' } } }));
    vi.stubGlobal('fetch', fetch);
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);
    expect(await screen.findByText(/Rust runs on the code runner; C# runs on the code runner/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/info', expect.anything());
  });

  test('reports Rust on the playground and C# unavailable when no runner answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);
    expect(await screen.findByText(/Rust runs on play\.rust-lang\.org; C# cannot be run \(no code runner is configured\)/)).toBeInTheDocument();
  });

  test('reports that nothing can run when there is no runner and the playground is off', async () => {
    vi.stubEnv('VITE_RUST_PLAYGROUND', 'off');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network down'))));
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);
    expect(await screen.findByText(/Rust cannot be run; C# cannot be run/)).toBeInTheDocument();
  });

  test('mentions the toolchain the content was checked with', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);
    expect(screen.getByText(new RegExp(`rustc ${toolchain.rustc.replace(/\./g, '\\.')} \\(edition ${toolchain.edition}\\)`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start the ownership track' })).toHaveAttribute('href', '#/tracks/ownership');
  });
});

describe('AboutPage progress', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  });

  test('shows zero counts and no clear button without progress', async () => {
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);
    expect(screen.getByText(/Stored in this browser only: 0 lessons marked read, 0 drills answered, 0 project milestones ticked\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear progress/ })).not.toBeInTheDocument();
  });

  test('counts stored progress', async () => {
    seedStorage({ read: ['moves', 'functions'], drills: { a: { firstChoice: 0, correctFirstTry: true, at: 1 } }, milestones: ['p/1', 'p/2', 'p/3'] });
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);
    expect(screen.getByText(/2 lessons marked read, 1 drills answered, 3 project milestones ticked\./)).toBeInTheDocument();
  });

  test('asks for confirmation and keeps progress when cancelled', async () => {
    const user = userEvent.setup();
    seedStorage({ milestones: ['p/1'] });
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);

    await user.click(screen.getByRole('button', { name: 'Clear progress…' }));
    expect(screen.getByText('This removes all of it and cannot be undone.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText('This removes all of it and cannot be undone.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear progress…' })).toBeInTheDocument();
    expect(storedState().milestones).toEqual(['p/1']);
  });

  test('clears progress after confirmation but keeps the theme', async () => {
    const user = userEvent.setup();
    seedStorage({ read: ['moves'], lastLesson: { trackId: 'ownership', lessonId: 'moves' }, theme: 'light' });
    const AboutPage = await loadAboutPage();
    render(<AboutPage />);

    await user.click(screen.getByRole('button', { name: 'Clear progress…' }));
    await user.click(screen.getByRole('button', { name: 'Clear progress' }));

    expect(screen.getByText(/0 lessons marked read, 0 drills answered, 0 project milestones ticked\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear progress/ })).not.toBeInTheDocument();
    expect(storedState()).toEqual({ read: [], drills: {}, milestones: [], theme: 'light' });
  });
});
