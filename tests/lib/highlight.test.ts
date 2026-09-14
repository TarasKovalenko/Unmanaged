import { describe, expect, test } from 'vitest';

import { tokenizeLine, type Token } from '../../src/lib/highlight.ts';

const tokens = (...pairs: [Token['kind'], string][]) => pairs.map(([kind, text]) => ({ kind, text }));

describe('tokenizeLine', () => {
  test('returns no tokens for an empty line', () => {
    expect(tokenizeLine('', 'rust')).toEqual([]);
  });

  describe('rust', () => {
    test('recognises keywords, types, numbers and merges plain text', () => {
      expect(tokenizeLine('let x: i32 = 1_000u32;', 'rust')).toEqual(
        tokens(['keyword', 'let'], ['plain', ' x: '], ['type', 'i32'], ['plain', ' = '], ['number', '1_000u32'], ['plain', ';']),
      );
    });

    test('treats capitalised identifiers as types and floats as numbers', () => {
      expect(tokenizeLine('Vec::new(3.5)', 'rust')).toEqual(tokens(['type', 'Vec'], ['plain', '::new('], ['number', '3.5'], ['plain', ')']));
    });

    test('recognises comments, attributes and macros', () => {
      expect(tokenizeLine('#[derive(Debug)] println!("hi"); // done', 'rust')).toEqual(
        tokens(['attr', '#[derive(Debug)]'], ['plain', ' '], ['macro', 'println!'], ['plain', '('], ['string', '"hi"'], ['plain', '); '], ['comment', '// done']),
      );
      expect(tokenizeLine('#![allow(unused)]', 'rust')).toEqual(tokens(['attr', '#![allow(unused)]']));
    });

    test('tells char literals, byte strings and escapes apart from lifetimes', () => {
      expect(tokenizeLine(`'a' '\\n' b"x\\"y" &'a str`, 'rust')).toEqual(
        tokens(['string', "'a'"], ['plain', ' '], ['string', "'\\n'"], ['plain', ' '], ['string', 'b"x\\"y"'], ['plain', ' &'], ['lifetime', "'a"], ['plain', ' '], ['type', 'str']),
      );
    });
  });

  describe('csharp', () => {
    test('recognises keywords, types, strings and suffixed numbers', () => {
      expect(tokenizeLine('var total = 1.5m; Console.WriteLine($@"x{total}");', 'csharp')).toEqual(
        tokens(
          ['keyword', 'var'],
          ['plain', ' total = '],
          ['number', '1.5m'],
          ['plain', '; '],
          ['type', 'Console'],
          ['plain', '.'],
          ['type', 'WriteLine'],
          ['plain', '('],
          ['string', '$@"x{total}"'],
          ['plain', ');'],
        ),
      );
    });

    test('recognises comments and char literals, and does not use Rust macros or types', () => {
      expect(tokenizeLine("char c = 'a'; i32 x! // note", 'csharp')).toEqual(
        tokens(['keyword', 'char'], ['plain', ' c = '], ['string', "'a'"], ['plain', '; i32 x! '], ['comment', '// note']),
      );
    });
  });

  describe('toml', () => {
    test('recognises tables, keys, strings, numbers, booleans and comments', () => {
      expect(tokenizeLine('[dependencies]', 'toml')).toEqual(tokens(['attr', '[dependencies]']));
      expect(tokenizeLine('[[bin]]', 'toml')).toEqual(tokens(['attr', '[[bin]]']));
      expect(tokenizeLine('serde-json = "1.0" # pinned', 'toml')).toEqual(tokens(['plain', 'serde-json = '], ['string', '"1.0"'], ['plain', ' '], ['comment', '# pinned']));
      expect(tokenizeLine('opt-level = 3', 'toml')).toEqual(tokens(['plain', 'opt-level = '], ['number', '3']));
      expect(tokenizeLine('lto = true', 'toml')).toEqual(tokens(['plain', 'lto = '], ['keyword', 'true']));
    });

    test('does not treat capitalised words as types', () => {
      expect(tokenizeLine('Name', 'toml')).toEqual(tokens(['plain', 'Name']));
    });
  });

  describe('shell', () => {
    test('recognises commands, flags, paths, strings and comments', () => {
      expect(tokenizeLine('cargo run --release ./src/main.rs', 'shell')).toEqual(
        tokens(['keyword', 'cargo'], ['plain', ' run '], ['attr', '--release'], ['plain', ' ./src/main.rs']),
      );
      expect(tokenizeLine(`echo "hi" 'there' -n # say it`, 'shell')).toEqual(
        tokens(['keyword', 'echo'], ['plain', ' '], ['string', '"hi"'], ['plain', ' '], ['string', "'there'"], ['plain', ' '], ['attr', '-n'], ['plain', ' '], ['comment', '# say it']),
      );
    });
  });
});
