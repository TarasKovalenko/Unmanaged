import { describe, expect, test } from 'vitest';

import { borrowSnippets } from '../../src/content/borrow/index.ts';
import { panicMark, parseMarks } from '../../src/lib/rustcMarks.ts';

const byId = (id: string) => borrowSnippets.find((s) => s.id === id)!;

describe('parseMarks', () => {
  test('reads primary and secondary underlines with their labels', () => {
    const marks = parseMarks(byId('reference-into-growing-vec').conflicts[0].message);
    expect(marks.filter((m) => m.primary).map((m) => [m.line, m.label])).toEqual([[4, 'mutable borrow occurs here']]);
    expect(marks.filter((m) => !m.primary).map((m) => [m.line, m.label])).toEqual([
      [3, 'immutable borrow occurs here'],
      [5, 'immutable borrow later used here'],
    ]);
  });

  test('joins stacked labels and ignores help sections', () => {
    const iter = parseMarks(byId('mutate-while-iterating').conflicts[0].message);
    expect(iter.find((m) => m.line === 3)?.label).toBe('immutable borrow occurs here; immutable borrow later used here');
    const moved = parseMarks(byId('move-on-assign').conflicts[0].message);
    // The help: block re-renders line 3 with `.clone()`; it must not add marks.
    expect(moved.filter((m) => m.line === 3)).toHaveLength(1);
  });

  test('every mark in real content lands inside its source line', () => {
    for (const s of borrowSnippets) {
      const lines = s.code.split('\n');
      for (const c of s.conflicts) {
        for (const m of parseMarks(c.message)) {
          expect(m.end, `${s.id}: mark past end of line ${m.line}`).toBeLessThanOrEqual(lines[m.line - 1].length);
        }
      }
    }
  });

  test('gives exact columns, and only the last run on a row carries the label', () => {
    const message = [
      'note: a leading note line is not a section break',
      '  |',
      '  |     ^^^ before any source line, ignored',
      '4 |     f(a, b);',
      '  |     - ^ right-hand label',
    ].join('\n');
    expect(parseMarks(message)).toEqual([
      { line: 4, start: 4, end: 5, primary: false, label: '' },
      { line: 4, start: 6, end: 7, primary: true, label: 'right-hand label' },
    ]);
  });

  test('stops reading stacked labels at a gap, a bare gutter, or text from another connector', () => {
    const message = [
      '2 | let x = y;',
      '  |     ^^^',
      '  |     |',
      '  |     first',
      '  |',
      '3 | let z = w;',
      '  |     ---',
      '  |    xsecond',
      '5 | a',
      '  | -',
      '',
      '  |   orphan',
    ].join('\n');
    expect(parseMarks(message)).toEqual([
      { line: 2, start: 4, end: 7, primary: true, label: 'first' },
      { line: 3, start: 4, end: 7, primary: false, label: '' },
      { line: 5, start: 0, end: 1, primary: false, label: '' },
    ]);
  });

  test('stops at `= note` and `help:` sections', () => {
    const noteSection = ['1 | x', '  | ^ here', '  = note: 1 | y', '  | ^ not here'].join('\n');
    expect(parseMarks(noteSection).map((m) => m.label)).toEqual(['here']);
    const helpSection = ['1 | x', '  | ^ here', 'help: try', '1 | y', '  | ^ suggested'].join('\n');
    expect(parseMarks(helpSection).map((m) => m.label)).toEqual(['here']);
  });
});

describe('panicMark', () => {
  test('underlines the call at the reported column in real content', () => {
    const s = byId('refcell-double-borrow');
    const [mark] = panicMark(s.conflicts[0].message, s.code);
    const line = s.code.split('\n')[mark.line - 1];
    expect(line.slice(mark.start, mark.end)).toBe('borrow_mut()');
    expect(mark.label).toBe('RefCell already borrowed');
  });

  test('returns nothing when the message has no panic location', () => {
    expect(panicMark('error[E0382]: borrow of moved value', 'fn main() {}')).toEqual([]);
  });

  test('underlines one character when no call starts at the column, and defaults the label', () => {
    const code = 'fn main() {\n    let x = v[9];\n}';
    expect(panicMark("thread 'main' panicked at src/main.rs:2:14", code)).toEqual([{ line: 2, start: 13, end: 14, primary: true, label: 'panics here' }]);
  });

  test('copes with a location past the end of the code', () => {
    expect(panicMark("thread 'main' panicked at src/main.rs:9:1:\n  boom  ", 'one line')).toEqual([{ line: 9, start: 0, end: 1, primary: true, label: 'boom' }]);
  });
});
