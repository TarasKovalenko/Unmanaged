// Extracts rustc's ^^^ / --- underline markers from authored compiler output,
// so the visualizer can draw them on the code itself. Only the main diagnostic
// block is read; `note:` and `help:` sections are ignored because their
// line numbers can refer to suggested code rather than the snippet.

export interface Mark {
  line: number;
  /** 0-based column range [start, end) in the source line. */
  start: number;
  end: number;
  primary: boolean;
  label: string;
}

const SOURCE = /^\s*(\d+) \|(?: (.*))?$/;
const GUTTER = /^\s*\|(?: (.*))?$/;

export function parseMarks(message: string): Mark[] {
  const rows = message.split('\n');
  const marks: Mark[] = [];
  let currentLine: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (/^(note|help)\b|^\s*= (help|note)/.test(row) && i > 0) break;
    const src = row.match(SOURCE);
    if (src) {
      currentLine = Number(src[1]);
      continue;
    }
    const gutter = row.match(GUTTER);
    if (!gutter || currentLine === null || !gutter[1]) continue;
    const body = gutter[1];
    // Marker runs come first on the row; anything after them is label text,
    // which may itself contain hyphens.
    const runs: { index: number; text: string }[] = [];
    const runRe = /(\s*)(\^+|-+)/y;
    for (let m = runRe.exec(body); m; m = runRe.exec(body)) {
      runs.push({ index: m.index + m[1].length, text: m[2] });
    }
    for (const [k, run] of runs.entries()) {
      const start = run.index;
      const end = start + run.text.length;
      if (k < runs.length - 1) {
        // Only the last run on a row carries inline label text.
        marks.push({ line: currentLine, start, end, primary: run.text[0] === '^', label: '' });
        continue;
      }
      let label = body.slice(end).trim();
      // Stacked labels: rustc draws `|` connectors and puts text below.
      if (!label) {
        const stacked: string[] = [];
        for (let j = i + 1; j < rows.length; j++) {
          const below = rows[j].match(GUTTER);
          if (!below || !below[1]) break;
          const text = below[1].slice(start).trim();
          if (!text || text === '|') continue;
          if (below[1][start - 1] && below[1][start - 1] !== ' ') break;
          stacked.push(text);
        }
        label = stacked.join('; ');
      }
      marks.push({ line: currentLine, start, end, primary: run.text[0] === '^', label });
    }
  }
  return marks;
}

/** A runtime panic reports one location: `panicked at src/main.rs:6:10:`.
 *  Underline the call that panicked, starting at that column. */
export function panicMark(message: string, code: string): Mark[] {
  const m = message.match(/panicked at src\/main\.rs:(\d+):(\d+)/);
  if (!m) return [];
  const line = Number(m[1]);
  const start = Number(m[2]) - 1;
  const text = code.split('\n')[line - 1] ?? '';
  const run = text.slice(start).match(/^[\w.:!]+(\([^)]*\))?/);
  const end = start + (run ? run[0].length : 1);
  const rows = message.split('\n');
  const label = rows[rows.findIndex((r) => r.includes('panicked at')) + 1] ?? 'panics here';
  return [{ line, start, end, primary: true, label: label.trim() }];
}
