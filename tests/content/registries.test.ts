import { describe, expect, test } from 'vitest';

import { borrowSnippets, snippetById } from '../../src/content/borrow/index.ts';
import { allDrills, drillById } from '../../src/content/drills/index.ts';
import { errorCodes } from '../../src/content/errors.ts';
import { allGotchas, gotchaById } from '../../src/content/gotchas/index.ts';
import { content } from '../../src/content/index.ts';
import { toolchain } from '../../src/content/meta.ts';
import { allPhrases } from '../../src/content/phrasebook/index.ts';
import { allProjects, ecosystem, projectById } from '../../src/content/projects/index.ts';
import { allTimelines, timelineById } from '../../src/content/timelines/index.ts';
import { lessonIndex, statusFor, tracks } from '../../src/content/tracks/index.ts';
import { lesson } from './fixtures.ts';

describe('content', () => {
  test('gathers every registry', () => {
    expect(content.tracks).toBe(tracks);
    expect(content.snippets).toBe(borrowSnippets);
    expect(content.drills).toBe(allDrills);
    expect(content.gotchas).toBe(allGotchas);
    expect(content.timelines).toBe(allTimelines);
    expect(content.projects).toBe(allProjects);
    expect(content.ecosystem).toBe(ecosystem);
    expect(content.phrases).toBe(allPhrases);
  });

  test('has content in every registry', () => {
    for (const list of Object.values(content)) expect(list.length).toBeGreaterThan(0);
  });
});

describe('lookup maps', () => {
  test.each([
    ['snippetById', snippetById, borrowSnippets],
    ['drillById', drillById, allDrills],
    ['gotchaById', gotchaById, allGotchas],
    ['timelineById', timelineById, allTimelines],
    ['projectById', projectById, allProjects],
  ] as [string, Map<string, { id: string }>, { id: string }[]][])('%s finds every item by its id', (_, map, items) => {
    expect(map.size).toBe(items.length);
    for (const item of items) expect(map.get(item.id)).toBe(item);
  });

  test('lookups return undefined for unknown ids', () => {
    expect(snippetById.get('ghost')).toBeUndefined();
    expect(drillById.get('ghost')).toBeUndefined();
    expect(lessonIndex.get('ghost')).toBeUndefined();
  });

  test('lessonIndex gives each lesson with its track and position', () => {
    const count = tracks.reduce((n, t) => n + t.lessons.length, 0);
    expect(lessonIndex.size).toBe(count);
    for (const t of tracks) {
      t.lessons.forEach((l, i) => {
        expect(lessonIndex.get(l.id)).toEqual({ track: t, lesson: l, index: i });
      });
    }
  });
});

describe('tracks', () => {
  test('are the six stuck points in order', () => {
    expect(tracks.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tracks.map((t) => t.id)).toEqual(['ownership', 'option-result', 'structs', 'rc-refcell', 'async', 'rustc-errors']);
  });

  test('statusFor marks a track planned until it has lessons', () => {
    expect(statusFor([])).toBe('planned');
    expect(statusFor([lesson()])).toBe('available');
  });

  test('every track status follows from its lessons', () => {
    for (const t of tracks) expect(t.status).toBe(statusFor(t.lessons));
  });
});

describe('metadata', () => {
  test('toolchain names a rustc version and edition', () => {
    expect(toolchain.rustc).toMatch(/^\d+\.\d+\.\d+$/);
    expect(toolchain.edition).toMatch(/^\d{4}$/);
  });

  test('error code summaries are keyed by rustc code or panic', () => {
    for (const [key, info] of Object.entries(errorCodes)) {
      expect(key).toMatch(/^(E\d{4}|panic)$/);
      expect(info.title.trim()).not.toBe('');
      expect(info.gist.trim()).not.toBe('');
    }
  });
});
