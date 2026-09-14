import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { href, navigate, parseRoute, useRoute } from '../../src/lib/router.ts';

describe('parseRoute', () => {
  test('maps an empty or root hash to home', () => {
    expect(parseRoute('')).toEqual({ page: 'home' });
    expect(parseRoute('#')).toEqual({ page: 'home' });
    expect(parseRoute('#/')).toEqual({ page: 'home' });
  });

  test('maps tracks and lessons, and a bare tracks path to home', () => {
    expect(parseRoute('#/tracks')).toEqual({ page: 'home' });
    expect(parseRoute('#/tracks/ownership')).toEqual({ page: 'track', trackId: 'ownership' });
    expect(parseRoute('#/tracks/ownership/moves')).toEqual({ page: 'lesson', trackId: 'ownership', lessonId: 'moves' });
  });

  test('maps list pages with and without an item id', () => {
    expect(parseRoute('#/visualizer')).toEqual({ page: 'visualizer', snippetId: undefined });
    expect(parseRoute('#/visualizer/move-on-assign')).toEqual({ page: 'visualizer', snippetId: 'move-on-assign' });
    expect(parseRoute('#/drills')).toEqual({ page: 'drills', drillId: undefined });
    expect(parseRoute('#/drills/move-in-loop')).toEqual({ page: 'drills', drillId: 'move-in-loop' });
    expect(parseRoute('#/gotchas')).toEqual({ page: 'gotchas', gotchaId: undefined });
    expect(parseRoute('#/gotchas/null-ref')).toEqual({ page: 'gotchas', gotchaId: 'null-ref' });
    expect(parseRoute('#/errors')).toEqual({ page: 'errors', code: undefined });
    expect(parseRoute('#/errors/E0382')).toEqual({ page: 'errors', code: 'E0382' });
  });

  test('maps projects to the list or a single project', () => {
    expect(parseRoute('#/projects')).toEqual({ page: 'projects' });
    expect(parseRoute('#/projects/x')).toEqual({ page: 'project', projectId: 'x' });
  });

  test('maps static pages', () => {
    expect(parseRoute('#/phrasebook')).toEqual({ page: 'phrasebook' });
    expect(parseRoute('#/about')).toEqual({ page: 'about' });
  });

  test('maps unknown paths to not-found', () => {
    expect(parseRoute('#/nope')).toEqual({ page: 'not-found' });
  });

  test('decodes components, treats ? like a path separator, and accepts a hash without a slash', () => {
    expect(parseRoute('#/errors/a%20b')).toEqual({ page: 'errors', code: 'a b' });
    expect(parseRoute('#/errors?E0382')).toEqual({ page: 'errors', code: 'E0382' });
    expect(parseRoute('#/tracks//ownership/')).toEqual({ page: 'track', trackId: 'ownership' });
    expect(parseRoute('#about')).toEqual({ page: 'about' });
  });
});

describe('href', () => {
  test('builds hashes that parse back to the same route', () => {
    expect(href.home()).toBe('#/');
    expect(href.track('ownership')).toBe('#/tracks/ownership');
    expect(href.lesson('ownership', 'moves')).toBe('#/tracks/ownership/moves');
    expect(href.visualizer()).toBe('#/visualizer');
    expect(href.visualizer('s1')).toBe('#/visualizer/s1');
    expect(href.drills()).toBe('#/drills');
    expect(href.drills('d1')).toBe('#/drills/d1');
    expect(href.gotchas()).toBe('#/gotchas');
    expect(href.gotchas('g1')).toBe('#/gotchas/g1');
    expect(href.phrasebook()).toBe('#/phrasebook');
    expect(href.projects()).toBe('#/projects');
    expect(href.project('p1')).toBe('#/projects/p1');
    expect(href.errors()).toBe('#/errors');
    expect(href.errors('E0499')).toBe('#/errors/E0499');
    expect(href.about()).toBe('#/about');

    expect(parseRoute(href.lesson('ownership', 'moves'))).toEqual({ page: 'lesson', trackId: 'ownership', lessonId: 'moves' });
    expect(parseRoute(href.project('p1'))).toEqual({ page: 'project', projectId: 'p1' });
  });
});

describe('navigate', () => {
  test('sets the location hash with or without a leading #', () => {
    navigate('#/about');
    expect(window.location.hash).toBe('#/about');
    navigate('/projects');
    expect(window.location.hash).toBe('#/projects');
  });
});

describe('useRoute', () => {
  test('starts from the current hash', () => {
    window.location.hash = '#/drills/move-in-loop';
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: 'drills', drillId: 'move-in-loop' });
  });

  test('follows hashchange events and scrolls to the top', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: 'home' });

    act(() => navigate(href.errors('E0502')));
    await waitFor(() => expect(result.current).toEqual({ page: 'errors', code: 'E0502' }));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  test('stops listening after unmount', () => {
    const { result, unmount } = renderHook(() => useRoute());
    unmount();
    window.location.hash = '#/about';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(result.current).toEqual({ page: 'home' });
  });
});
