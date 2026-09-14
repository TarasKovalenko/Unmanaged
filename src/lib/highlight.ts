// A deliberately small tokenizer for authored Rust and C# snippets. It only
// has to be right for code we wrote, so it favours readability over coverage.

export type Language = 'rust' | 'csharp' | 'toml' | 'shell';
export type TokenKind = 'keyword' | 'type' | 'string' | 'number' | 'comment' | 'macro' | 'lifetime' | 'attr' | 'plain';

export interface Token {
  kind: TokenKind;
  text: string;
}

const RUST_KEYWORDS = new Set(
  'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'.split(' '),
);
const RUST_TYPES = new Set('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str'.split(' '));

const CSHARP_KEYWORDS = new Set(
  'abstract as async await base bool break byte case catch char class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile when where while with yield'.split(' '),
);

interface Rule {
  kind: TokenKind;
  re: RegExp;
}

const rustRules: Rule[] = [
  { kind: 'comment', re: /\/\/.*/y },
  { kind: 'attr', re: /#!?\[[^\]]*\]/y },
  { kind: 'string', re: /b?"(?:\\.|[^"\\])*"/y },
  { kind: 'string', re: /'(?:\\.|[^'\\])'/y },
  { kind: 'lifetime', re: /'[a-zA-Z_]\w*/y },
  { kind: 'number', re: /\b\d[\d_]*(?:\.\d[\d_]*)?(?:[iuf](?:8|16|32|64|128|size))?\b/y },
  { kind: 'macro', re: /\b[a-z_]\w*!/y },
  { kind: 'plain', re: /[A-Za-z_]\w*/y },
  { kind: 'plain', re: /\s+|./y },
];

const csharpRules: Rule[] = [
  { kind: 'comment', re: /\/\/.*/y },
  { kind: 'string', re: /\$?@?"(?:\\.|[^"\\])*"/y },
  { kind: 'string', re: /'(?:\\.|[^'\\])'/y },
  { kind: 'number', re: /\b\d[\d_]*(?:\.\d[\d_]*)?[mMdDfFlLuU]?\b/y },
  { kind: 'plain', re: /[A-Za-z_]\w*/y },
  { kind: 'plain', re: /\s+|./y },
];

const tomlRules: Rule[] = [
  { kind: 'comment', re: /#.*/y },
  { kind: 'attr', re: /\[\[?[\w.-]+\]\]?/y },
  { kind: 'string', re: /"(?:\\.|[^"\\])*"/y },
  { kind: 'number', re: /\b\d[\d_.]*\b/y },
  { kind: 'keyword', re: /\b(?:true|false)\b/y },
  { kind: 'plain', re: /[A-Za-z_][\w-]*/y },
  { kind: 'plain', re: /\s+|./y },
];

const shellRules: Rule[] = [
  { kind: 'comment', re: /#.*/y },
  { kind: 'string', re: /"(?:\\.|[^"\\])*"|'[^']*'/y },
  { kind: 'keyword', re: /\b(?:cargo|rustup|rustc|curl|cd|mkdir|echo|export)\b/y },
  { kind: 'attr', re: /--?[A-Za-z][\w-]*/y },
  { kind: 'plain', re: /[A-Za-z_][\w./:-]*/y },
  { kind: 'plain', re: /\s+|./y },
];

const RULES: Record<Language, Rule[]> = { rust: rustRules, csharp: csharpRules, toml: tomlRules, shell: shellRules };
const KEYWORDS: Record<Language, Set<string>> = {
  rust: RUST_KEYWORDS,
  csharp: CSHARP_KEYWORDS,
  toml: new Set(),
  shell: new Set(),
};

export function tokenizeLine(line: string, language: Language): Token[] {
  const rules = RULES[language];
  const keywords = KEYWORDS[language];
  const typed = language === 'rust' || language === 'csharp';
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < line.length) {
    for (const rule of rules) {
      rule.re.lastIndex = pos;
      const m = rule.re.exec(line);
      if (!m) continue;
      let kind = rule.kind;
      const text = m[0];
      if (kind === 'plain' && /^[A-Za-z_]/.test(text)) {
        if (keywords.has(text)) kind = 'keyword';
        else if (typed && (/^[A-Z]/.test(text) || (language === 'rust' && RUST_TYPES.has(text)))) kind = 'type';
      }
      const last = tokens[tokens.length - 1];
      if (last && last.kind === kind && kind === 'plain') last.text += text;
      else tokens.push({ kind, text });
      pos += text.length;
      break;
    }
  }
  return tokens;
}
