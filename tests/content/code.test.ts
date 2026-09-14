import { describe, expect, test } from 'vitest';

import { code, lines } from '../../src/content/code.ts';

describe('lines', () => {
  test('returns an inclusive range', () => {
    expect(lines(17, 19)).toEqual([17, 18, 19]);
  });

  test('returns a single line when from equals to', () => {
    expect(lines(3, 3)).toEqual([3]);
  });

  test('returns nothing when the range is reversed', () => {
    expect(lines(5, 4)).toEqual([]);
  });
});

describe('code', () => {
  test('strips the first newline, trailing whitespace and common indentation', () => {
    const text = code`
      fn main() {
          println!("hi");
      }
    `;
    expect(text).toBe('fn main() {\n    println!("hi");\n}');
  });

  test('keeps blank lines inside the snippet', () => {
    const text = code`
      let a = 1;

      let b = 2;
    `;
    expect(text).toBe('let a = 1;\n\nlet b = 2;');
    expect(text.split('\n')).toHaveLength(3);
  });

  test('ignores blank lines when measuring indentation', () => {
    const text = code`
        a
${''}
        b
    `;
    expect(text).toBe('a\n\nb');
  });

  test('unescapes backticks and ${ but keeps other escapes literally', () => {
    const text = code`
      let s = \`x\`;
      let t = "\${y}\n";
    `;
    expect(text).toBe('let s = `x`;\nlet t = "${y}\\n";');
  });

  test('interpolates values as strings', () => {
    const n = 42;
    const text = code`
      let n = ${n};
      let ok = ${true};
    `;
    expect(text).toBe('let n = 42;\nlet ok = true;');
  });

  test('keeps text that starts on the first line', () => {
    expect(code`single`).toBe('single');
  });

  test('returns an empty string for whitespace-only input', () => {
    expect(code`
    `).toBe('');
  });
});
