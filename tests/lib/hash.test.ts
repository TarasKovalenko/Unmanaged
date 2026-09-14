import { describe, expect, test } from 'vitest';

import { hashCode } from '../../src/lib/hash.ts';

describe('hashCode', () => {
  test('matches FNV-1a 32-bit reference values (generated C# data depends on it)', () => {
    expect(hashCode('')).toBe('811c9dc5');
    expect(hashCode('a')).toBe('e40c292c');
    expect(hashCode('foobar')).toBe('bf9cf968');
  });

  test('is stable, always 8 hex chars, and distinguishes different text', () => {
    expect(hashCode('Console.WriteLine(1);')).toBe(hashCode('Console.WriteLine(1);'));
    expect(hashCode('a')).not.toBe(hashCode('b'));
    for (const text of ['', 'x', 'a much longer piece of text\nwith lines']) expect(hashCode(text)).toMatch(/^[0-9a-f]{8}$/);
  });
});
