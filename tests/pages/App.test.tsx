import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../../src/App';
import { drillById } from '../../src/content/drills';
import { projectById } from '../../src/content/projects';
import { lessonIndex, tracks } from '../../src/content/tracks';
import { goTo, seedStorage } from './helpers';

const DEFAULT_TITLE = 'Unmanaged: Rust for people who write C#';

beforeEach(() => seedStorage({}));

describe('App routing', () => {
  test('renders the home page when there is no hash', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('&unmanaged');
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  test('renders a track page with the track title', () => {
    render(<App />);
    goTo('#/tracks/ownership');
    const track = tracks.find((t) => t.id === 'ownership')!;
    expect(screen.getByRole('heading', { level: 1, name: track.title })).toBeInTheDocument();
    expect(document.title).toBe(`${track.title} | Unmanaged`);
  });

  test('renders a lesson page with the lesson title', () => {
    render(<App />);
    goTo('#/tracks/ownership/moves');
    const { lesson } = lessonIndex.get('moves')!;
    expect(screen.getByRole('heading', { level: 1, name: lesson.title })).toBeInTheDocument();
    expect(document.title).toBe(`${lesson.title} | Unmanaged`);
  });

  test('switching lessons remounts the lesson page for the new lesson', () => {
    render(<App />);
    goTo('#/tracks/ownership/moves');
    goTo('#/tracks/ownership/functions');
    const { lesson } = lessonIndex.get('functions')!;
    expect(screen.getByRole('heading', { level: 1, name: lesson.title })).toBeInTheDocument();
  });

  test('unknown track and lesson ids fall back to the default title and the not-found page', () => {
    render(<App />);
    goTo('#/tracks/nope');
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(document.title).toBe(DEFAULT_TITLE);
    goTo('#/tracks/ownership/nope');
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  test('renders the visualizer', () => {
    render(<App />);
    goTo('#/visualizer/copy-types');
    expect(screen.getByRole('heading', { level: 1, name: 'Borrow visualizer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Copy types copy, everything else moves' })).toBeInTheDocument();
    expect(document.title).toBe('Borrow visualizer | Unmanaged');
  });

  test('renders the drills page with a title for the list, a known drill and an unknown drill', () => {
    render(<App />);
    goTo('#/drills');
    expect(screen.getByRole('heading', { level: 1, name: 'Error drills' })).toBeInTheDocument();
    expect(document.title).toBe('Error drills | Unmanaged');

    const drill = drillById.get('own-e0499')!;
    goTo('#/drills/own-e0499');
    expect(screen.getByRole('heading', { level: 2, name: drill.title })).toBeInTheDocument();
    expect(document.title).toBe(`${drill.title} (drill) | Unmanaged`);

    goTo('#/drills/nope');
    expect(document.title).toBe('Drill (drill) | Unmanaged');
  });

  test('renders gotchas, phrasebook, projects and about with their titles', () => {
    render(<App />);
    const cases: [string, string][] = [
      ['#/gotchas', 'Gotchas'],
      ['#/phrasebook', 'Phrasebook'],
      ['#/projects', 'Mini-projects'],
      ['#/about', 'About'],
    ];
    for (const [hash, title] of cases) {
      goTo(hash);
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(document.title).toBe(`${title} | Unmanaged`);
    }
  });

  test('renders a project page, and not-found for an unknown project', () => {
    render(<App />);
    const project = projectById.get('proj-cli-todo')!;
    goTo('#/projects/proj-cli-todo');
    expect(screen.getByRole('heading', { level: 1, name: project.title })).toBeInTheDocument();
    expect(document.title).toBe(`${project.title} | Unmanaged`);

    goTo('#/projects/nope');
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  test('renders the error index with and without a code', () => {
    render(<App />);
    goTo('#/errors');
    expect(screen.getByRole('heading', { level: 1, name: 'Error index' })).toBeInTheDocument();
    expect(document.title).toBe('Error index | Unmanaged');

    goTo('#/errors/E0382');
    expect(screen.getByRole('heading', { level: 2, name: 'Use of moved value' })).toBeInTheDocument();
    expect(document.title).toBe('E0382 (error index) | Unmanaged');
  });

  test('renders not-found for an unknown section', () => {
    render(<App />);
    goTo('#/somewhere-else');
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
    expect(document.title).toBe(DEFAULT_TITLE);
  });
});

describe('App content warnings in development', () => {
  afterEach(() => {
    vi.doUnmock('../../src/content/validate');
    vi.resetModules();
  });

  test('logs each structural content problem once on load', async () => {
    vi.resetModules();
    vi.doMock('../../src/content/validate', () => ({ structuralProblems: () => ['drill/x: needs 3 or 4 options', 'lesson/y: duplicate id'] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../../src/App');
    expect(warn.mock.calls).toEqual([['[content] drill/x: needs 3 or 4 options'], ['[content] lesson/y: duplicate id']]);
  });

  test('does not validate content in production builds', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    const structuralProblems = vi.fn(() => ['drill/x: needs 3 or 4 options']);
    vi.doMock('../../src/content/validate', () => ({ structuralProblems }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../../src/App');
    vi.unstubAllEnvs();
    expect(structuralProblems).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test('logs nothing when the real content is structurally sound', async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../../src/App');
    expect(warn).not.toHaveBeenCalled();
  });
});
