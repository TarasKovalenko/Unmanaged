/** Inclusive line range, for LineLink arrays: `lines(17, 19)` → [17, 18, 19]. */
export function lines(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Template tag for authored code. Strips the first newline, trailing
 * whitespace, and common leading indentation, so snippets can be indented
 * naturally inside content files while line numbers stay predictable.
 *
 *   code`
 *     fn main() {      // line 1
 *     }                // line 2
 *   `
 */
export function code(strings: TemplateStringsArray, ...values: unknown[]): string {
  let raw = strings.raw.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), '');
  // Template raw strings keep escapes like \n literally; authored code wants
  // them literally too (e.g. "\n" inside a Rust string), so we do not unescape.
  // Only the backtick needs unescaping, since it must be escaped in a template.
  raw = raw.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
  const lines = raw.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(
    ...lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^ */)![0].length),
  );
  return lines.map((l) => l.slice(indent)).join('\n');
}
