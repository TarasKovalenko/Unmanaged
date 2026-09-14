// The logic behind scripts/paste-output.ts. See that file for usage.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Extracts the pasteable part of a --dump report: the compile errors (from the
 *  first `error[` to before `error: aborting`) or the panic line and message
 *  (with the per-run thread id removed). Null when there is neither. */
export function extractOutput(raw: string): string | null {
  let text: string;
  const panic = raw.match(/thread '[^']*'(?: \(\d+\))? panicked at [^\n]*\n[\s\S]*?(?=\nnote: run with `RUST_BACKTRACE|$)/);
  if (raw.includes('error[')) {
    text = raw.slice(raw.indexOf('error[')).split('\nerror: aborting')[0];
  } else if (panic) {
    text = panic[0].replace(/thread '([^']*)' \(\d+\) panicked/, "thread '$1' panicked");
  } else {
    return null;
  }
  return text.trimEnd().split('\n').map((l) => l.trimEnd()).join('\n');
}

/** Escapes text for the inside of a TypeScript template literal. */
export function escapeTemplate(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** Path of the --dump report for a unit id. */
export const dumpPath = (id: string): string => join('.content-check', id.replaceAll('/', '__') + '.txt');

export interface PasteDeps {
  readFile: (path: string) => string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export const nodePasteDeps = (): PasteDeps => ({
  readFile: (path) => readFileSync(path, 'utf8'),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => console.error(text),
});

/** Prints the escaped output for argv[0]. Returns the process exit code. */
export function main(argv: string[], deps: PasteDeps): number {
  const id = argv[0];
  if (!id) {
    deps.stderr('usage: npm run paste-output -- <unit id, e.g. drill/move-in-loop>');
    return 1;
  }
  const text = extractOutput(deps.readFile(dumpPath(id)));
  if (text === null) {
    deps.stderr(`no compiler error or panic found in .content-check for ${id}`);
    return 1;
  }
  deps.stdout(escapeTemplate(text) + '\n');
  return 0;
}
