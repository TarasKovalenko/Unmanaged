import { describe, expect, test } from 'vitest';

import { allDrills } from '../../src/content/drills/index.ts';
import { formatLines, frameClass, normaliseForSearch, plural, seededOrder } from '../../src/lib/format.ts';

describe('frameClass', () => {
  test('gives C# a dashed frame, Rust a heavier solid frame and everything else a thin one', () => {
    expect(frameClass('csharp')).toBe('border border-dashed border-rule-strong');
    expect(frameClass('rust')).toBe('border-2 border-solid border-rule-strong');
    expect(frameClass('toml')).toBe('border border-solid border-rule');
    expect(frameClass('shell')).toBe('border border-solid border-rule');
  });
});

describe('formatLines', () => {
  test('collapses consecutive runs into ranges', () => {
    expect(formatLines([7, 8, 9, 12])).toBe('7–9, 12');
  });

  test('sorts numerically and removes duplicates', () => {
    expect(formatLines([12, 3, 2, 3, 10, 1])).toBe('1–3, 10, 12');
  });

  test('handles a single line and no lines', () => {
    expect(formatLines([4])).toBe('4');
    expect(formatLines([])).toBe('');
  });
});

describe('plural', () => {
  test('uses the singular only for exactly one', () => {
    expect(plural(1, 'lesson')).toBe('1 lesson');
    expect(plural(0, 'lesson')).toBe('0 lessons');
    expect(plural(2, 'lesson')).toBe('2 lessons');
  });

  test('accepts an irregular plural', () => {
    expect(plural(3, 'crate', 'crates!')).toBe('3 crates!');
    expect(plural(1, 'child', 'children')).toBe('1 child');
  });
});

describe('normaliseForSearch', () => {
  test('lowercases and strips backticks and asterisks', () => {
    expect(normaliseForSearch('The **`Vec<T>`** Type')).toBe('the vec<t> type');
  });
});

describe('seededOrder', () => {
  test('returns a permutation of 0..n', () => {
    const order = seededOrder(6, 'seed');
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('is stable for the same seed and differs between seeds', () => {
    expect(seededOrder(8, 'move-in-loop')).toEqual(seededOrder(8, 'move-in-loop'));
    const orders = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => seededOrder(8, seed).join(',')));
    expect(orders.size).toBeGreaterThan(1);
  });

  test('handles empty and single-item lists', () => {
    expect(seededOrder(0, 'x')).toEqual([]);
    expect(seededOrder(1, 'x')).toEqual([0]);
  });

  test('does not usually put the correct drill answer first', () => {
    const firstShown = allDrills.map((d) => d.options.findIndex((o) => o.correct) === seededOrder(d.options.length, d.id)[0]);
    const share = firstShown.filter(Boolean).length / allDrills.length;
    expect(share, `correct answer shown first in ${Math.round(share * 100)}% of drills`).toBeLessThan(0.5);
  });
});
