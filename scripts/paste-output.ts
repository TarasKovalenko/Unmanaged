// Prints a unit's real compiler or panic output, trimmed and escaped for a
// TypeScript template literal, ready to paste into `message: \`...\``.
//
//   npm run check:content -- --dump --only drill/move-in-loop
//   npm run paste-output -- drill/move-in-loop
//
// Compile errors: everything from the first `error[` to before `error: aborting`.
// Panics: the `thread '...' panicked at` line and the panic message, with the
// per-run thread id removed.
//
// The logic lives in scripts/lib/pasteOutput.ts.

import { main, nodePasteDeps } from './lib/pasteOutput.ts';

const code = main(process.argv.slice(2), nodePasteDeps());
if (code !== 0) process.exit(code);
